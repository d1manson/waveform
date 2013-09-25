"use strict";

T.TC = function(BYTES_PER_SPIKE,CanvasUpdateCallback, TILE_CANVAS_NUM){
	//TODO: there is an inefficiency in the worker-main communication.  It might be better to get the worker to actually keep a copy of each slot rather than send a copy each call.
	//otherwise we might be sending loads of copies of the same cutInds data.
	
	// === WORKER ==================================================
	var myWorker = BuildWorker(function(){
		"use strict";
		
		// Some functions copied (and simplified) from Mlib.js and utils.js
		var Swap32 = function(val) {
			return   ((val & 0xFF) << 24)
				   | ((val & 0xFF00) << 8)
				   | ((val >> 8) & 0xFF00)
				   | ((val >> 24) & 0xFF);
		}
		var endian = function(){
			var b = new ArrayBuffer(2);
			(new DataView(b)).setInt16(0,256,true);
			return (new Int16Array(b))[0] == 256? 'L' : 'B';
		}();
		var sort = function(x){ //in-place sort
			Array.prototype.sort.call(x,function(a,b){return a-b;}); 
		}
		var rDivide = function(x,d){ //in-place divide by scalar
			for(var i=0;i<x.length;i++)
				x[i] /= d; //if x is integer this division will give the floor of x/d
		}
		var hist = function(inds){
		    var S = max(inds) + 1; //zero-based indexing, remember!
			var counts = new Uint32Array(S);
			for(var i=0;i<inds.length;i++)
				counts[inds[i]]++;
			return counts;
		}
		var max = function(X){
			var m = X[0];
			for(var i = 1;i< X.length; i++)
				(m < X[i]) && (m = X[i])
			return m; 
        }
		// ==============================================
		
		var allSpikeTimes = null;
		var histTimer = null; 
		var histSlotQueue = []; //holds a queue of which slots need to be sent to GetGroupHist_sync
		var histSlotArgs = []; //holds the arguments for the GetGroupHist_sync function, indexed by slot number
		
		var CreateAllSpikeTimes = function(buffer,N_val,timebase,BYTES_PER_SPIKE){	
			CancelAll();
			if(!N_val){
				allSpikeTimes = null;
				return;
			}
			
			var oldData = new Int32Array(buffer);
			allSpikeTimes = new Uint32Array(N_val);

			for(var i=0; i<N_val; i++) //get the timestamp for each spike
				allSpikeTimes[i] = oldData[BYTES_PER_SPIKE/4*i]; //we are accessing the buffer as 4byte ints, we want the first 4bytes of the i'th spike

			if (endian == 'L') 
				for(var i=0;i<N_val; i++)
					allSpikeTimes[i] = Swap32(allSpikeTimes[i]);
			
			timebase/= 1000; //get it in miliseconds
			for(var i=0;i<N_val;i++)
				allSpikeTimes[i] /= timebase;
				
		}
        
		var GetGroupHist_sync = function(cutIndsBuffer,slotInd,maxDeltaT,generation,binSize){
			if(allSpikeTimes == null)
				throw('GetGroupHist called before CreateAllSpikeTimes');
			
			var cutInds = new Uint32Array(cutIndsBuffer);
			
			// note maxDeltaT and allSpikeTimes should be in the same units, represented as uin32s.
			var spikeTimes = new Uint32Array(cutInds.length);
			for(var i=0;i<cutInds.length;i++)
				spikeTimes[i] = allSpikeTimes[cutInds[i]]
				
			sort(spikeTimes);
			var diffs = [];
			
			// For every pair of spikes separated in time by no more than maxDeltaT, record
			// the time separation in the diffs array.
			for(var laterInd=1, earlierInd = 0;laterInd<spikeTimes.length;laterInd++){
				var laterTime = spikeTimes[laterInd];
				while (spikeTimes[earlierInd] < laterTime - maxDeltaT)
					earlierInd++;
				for(var i=earlierInd;i<laterInd;i++)
					diffs.push(laterTime - spikeTimes[i]);
			}
			
			var diffs = new Uint16Array(diffs);
			rDivide(diffs,binSize); //in-place integer division does a = floor(a/b)
			
			var ret = hist(diffs);	
			//ret[0] += cutInds.length; //to take acount of the self difference for each spike
			
			self.postMessage({foo:"PlotHist",args:[ret.buffer,slotInd,maxDeltaT,generation]},[ret.buffer])

		}
		
		var GetGroupHist = function(buffer,slotInd,maxDeltaT,generation,binSize){
			//rather than directly call the GetGroupHist_sync function, we create a queue of calls to the function and execute them 
			//asynchrounsly with setInterval.  This means we can cancel the queue by stopping the timer.
			if(!histSlotArgs[slotInd])
				histSlotQueue.push(slotInd); //if this slot is already in the queue then we will just assign new args
				
			histSlotArgs[slotInd] = arguments;
			
			if(!histTimer){
				setInterval(function(){
					var s = histSlotQueue.shift();
					GetGroupHist_sync.apply(null,histSlotArgs[s]);
					histSlotArgs[s] = null;
					if(histSlotQueue.length == 0)
						clearInterval(histTimer);
				},1);
			}
		}
		
		var CancelAll = function(){
			clearInterval(histTimer);
			histSlotQueue = [];
			histSlotArgs = [];
		}
		
		var myFoos = {	CreateAllSpikeTimes: CreateAllSpikeTimes, 
						GetGroupHist: GetGroupHist, 
						CancelAll: CancelAll };
		self.onmessage = function(e){ myFoos[e.data.foo].apply(null,e.data.args); } //main thread has requested that the worker call function foo with arguments args
		
	});
	
	// ==== END WORKER =========================================================
	
    var plotOpts = function(){
		var p = {W: 100, H: 50};
		p.nBins = p.W; //I think you may get one extra due to zero bin..dunno?
		return p;
	}();
	
	var cCut = null;
	var show = false;
	var renderState = {generation: [],
						maxDeltaT: [], 
					   desiredMaxDeltaT: 500} //miliseconds
					   
					   
	
	var LoadTetrodeData = function(N_val, buffer,timebase){
		cCut = null;
		renderState.generation = [];
		renderState.maxDeltaT = [];
		
		if(!N_val){
			myWorker.postMessage({foo: "CreateAllSpikeTimes", args: []}); //among other things this cancels any queued histing
			//TODO: decide whether we need to send null canvases
			return;
		}
		
		buffer = M.clone(buffer); //we need to clone it so that when we transfer ownsership we leave a copy in this thread for other modules to use
		myWorker.postMessage({foo: "CreateAllSpikeTimes", args: [buffer, N_val, timebase, BYTES_PER_SPIKE]},[buffer]);
		
		// A subtle, but important, point is that because messages on the worker are processed in order we don't need to wait for the createspikes to have completed
		// before we post a GetGroupHist request (in fact the worker doesn't bother to inform us when it's done with the above call it just sits there waiting to process
		// the next thing in the message queue).  Also, because the GetGroupHist function is executed asynchrously on the worker we are able to cancel the queue.
	}
	
	var PlotHist = function(histBuffer,slotInd,maxDeltaT,generation){
		var hist = new Uint32Array(histBuffer);
        var $canvas = $("<canvas width='" + plotOpts.W + "' height='" + plotOpts.H + "' />");
        var ctx = $canvas.get(0).getContext('2d');
        
		var xStep = plotOpts.W/plotOpts.nBins;
		var yScale = plotOpts.H/M.max(hist);
		
		ctx.beginPath();
		ctx.moveTo(0,plotOpts.H-hist[0]*yScale)
		for(var i=1;i<hist.length;i++){
			ctx.lineTo(i*xStep,plotOpts.H-hist[i]*yScale);
			//TODO: make it steps not a "smooth" line
		}
		ctx.strokeStyle="red";
		ctx.stroke();
		
		CanvasUpdateCallback(slotInd,TILE_CANVAS_NUM,$canvas); //send the plot back to main
		renderState.maxDeltaT[slotInd] = maxDeltaT;
		renderState.generation[slotInd] = generation;
    }
    
    var SlotsInvalidated = function(cut,newlyInvalidatedSlots,isNewCut){
		
        if(cut == null && cCut == null)
            throw(new Error ("SlotsInvalidated temporalcorr with null cut"));
        
        if(cut != null)
            cCut = cut;
            
        if(!show)
            return; //we only render when we want to see them
         
		if(isNewCut){
			renderState.generation = [];
			renderState.maxDeltaT = [];
		}
		
		var binSize = renderState.desiredMaxDeltaT/plotOpts.nBins;
		
		for(var s=0;s<newlyInvalidatedSlots.length;s++)if(newlyInvalidatedSlots[s]){
			var slot_s = cCut.GetImmutableSlot(s);
			
            if(!slot_s.inds || slot_s.inds.length == 0){
                if(!isNaN(renderState.generation[s])){
                    CanvasUpdateCallback(s,TILE_CANVAS_NUM,null); 
                    renderState.generation[s] = NaN; 
                }
                continue; // immutable is empty or deleted
            }
            
            if(renderState.generation[s] == slot_s.generation && renderState.maxDeltaT[s] == renderState.desiredMaxDeltaT)
				continue; //immutable has already been rendered with the requested maxDeltaT
            
			var inds = M.clone(slot_s.inds); //we need to clone these before transfering them, in order to keep a copy on this thread
			myWorker.postMessage({foo:"GetGroupHist",args:[inds.buffer,s,renderState.desiredMaxDeltaT,slot_s.generation,binSize]},[inds.buffer]);
			// Worker will hopefully come back with a PlotHist(hist,...) event 
		}

	}

    var InvalidateAll = function(){
		if(!cCut)
			return;
		SlotsInvalidated(null,M.repvec(1,cCut.GetNImmutables())); //invalidate all slots
	}
	
	var SetShow = function(v){
		if(show ==v)
			return;
		show = v;
		if(v){
			InvalidateAll();
		}else{
			for(var i=0;i<renderState.generation.length;i++)
				CanvasUpdateCallback(i,TILE_CANVAS_NUM,null);
			renderState.generation = [];
			renderState.maxDeltaT = []; 
		}
	}
	
	var SetDeltaT = function(v){
		if(renderState.desiredMaxDeltaT == v)
			return;
		renderState.desiredMaxDeltaT = v;
		InvalidateAll();
	}
	
	var myFoos = {PlotHist: PlotHist};
	myWorker.onmessage = function(e){ myFoos[e.data.foo].apply(null,e.data.args); } //worker has requested that the main thread call function foo with arguments args
	
    return {
		SlotsInvalidated: SlotsInvalidated,
		SetShow: SetShow,
		SetDeltaT: SetDeltaT,
		LoadTetrodeData: LoadTetrodeData
    };
    
}(T.BYTES_PER_SPIKE,T.CutSlotCanvasUpdate, 2);