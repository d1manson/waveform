"use strict";

T.TC = function(BYTES_PER_SPIKE,CanvasUpdateCallback, TILE_CANVAS_NUM){
	//TODO: debug latest modification which is the switch to using a BridgedWorker and dealing with most of the re-rendering desciions in the woker

	// === WORKER ==================================================
	var workerFunction = function(){
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
		var slots = [];
		var histSlotQueue = []; //holds a queue of which slotsInds need to be sent to GetGroupHist
		var nBins = 100;
		var desiredMaxDeltaT = 500;
        var binSize = desiredMaxDeltaT / nBins; //gets updated when we change desiredMaxDeltaT
        
		var SetImmutable = function(inds,slotInd,generation){
			slots[slotInd] = {inds:new Uint32Array(inds),generation:generation,num:slotInd,maxDeltaT:null};
            QueueSlot(slotInd);
		}

		var NewCut = function(){
			slots = [];
			ClearQueue();
		}

		var SetMaxDeltaT = function(v){
			if(v == desiredMaxDeltaT)
                return; //no point doing anything if the value isn't new
                
            ClearQueue(); //we can clear the queue because we are going to re-compute all slots unless they were already computed for this maxDeltaT, but in that case there would be no reason to compute them
			desiredMaxDeltaT = v;
            binSize = desiredMaxDeltaT / nBins;
			for(var i=0;i<slots.length;i++)if(slots[i] &&  slots[i].maxDeltaT != desiredMaxDeltaT)
				QueueSlot(i);
		}

		var QueueTick = function(){
            var s = histSlotQueue.shift(); 
            while(!slots[s] && histSlotQueue.length)
                s = histSlotQueue.shift(); 
			if(slots[s])
                GetGroupHist(slots[s]);
			histTimer  = histSlotQueue.length > 0 ? setTimeout(QueueTick,1) : 0;
            //TODO: may want to time the hist call and potentially do more within this tick
		}

		var QueueSlot = function(slotInd){
			if(histSlotQueue.indexOf(slotInd) == -1)
				histSlotQueue.push(slotInd);
			if(!histTimer)
				histTimer = setTimeout(QueueTick,1);
		}

		var ClearQueue = function(){
			clearTimeout(histTimer);
            histTimer = 0;
			histSlotQueue = [];
		}

		var CreateAllSpikeTimes = function(buffer,N_val,timebase,BYTES_PER_SPIKE){	
			ClearQueue();
			NewCut();
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

		var GetGroupHist = function(slot){
			if(allSpikeTimes == null)
				return;

			var cutInds = slot.inds;

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
				while (spikeTimes[earlierInd] < laterTime - desiredMaxDeltaT)
					earlierInd++;
				for(var i=earlierInd;i<laterInd;i++)
					diffs.push(laterTime - spikeTimes[i]);
			}

			var diffs = new Uint16Array(diffs);
			rDivide(diffs,binSize); //in-place integer division does a = floor(a/b)

			var ret = hist(diffs);	
			//ret[0] += cutInds.length; //to take acount of the self difference for each spike
			slot.maxDeltaT = desiredMaxDeltaT;
			main.PlotHist(ret.buffer,slot.num,desiredMaxDeltaT,slot.generation,[ret.buffer]);

		}

	};


	// ==== END WORKER =========================================================

    var plotOpts =  {W: 100, H: 50}; //see also binSize in worker

	var cCut = null;
	var show = false;
	var workerSlotGeneration = []; //for each slot, keeps track of the last generation of immutable that was sent to the worker


	var LoadTetrodeData = function(N_val, buffer,timebase){
		cCut = null;
        workerSlotGeneration = [];

		if(!N_val){
			theWorker.CreateAllSpikeTimes(null) //among other things this cancels any queued histing
			//TODO: decide whether we need to send null canvases
			return;
		}

		buffer = M.clone(buffer); //we need to clone it so that when we transfer ownsership we leave a copy in this thread for other modules to use
		theWorker.CreateAllSpikeTimes(buffer, N_val, timebase, BYTES_PER_SPIKE,[buffer]);

		// A subtle, but important, point is that because messages on the worker are processed in order we don't need to wait for the createspikes to have completed
		// before we post a GetGroupHist request (in fact the worker doesn't bother to inform us when it's done with the above call it just sits there waiting to process
		// the next thing in the message queue).  Also, because the GetGroupHist function is executed asynchrously on the worker we are able to cancel the queue.
	}

	var PlotHist = function(histBuffer,slotInd,maxDeltaT,generation){
		var hist = new Uint32Array(histBuffer);
        var $canvas = $("<canvas width='" + plotOpts.W + "' height='" + plotOpts.H + "' />");
        var ctx = $canvas.get(0).getContext('2d');

		var xStep = plotOpts.W/(hist.length-1); //the last bin has fewer points due to rounding or something (I think?)
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
    }

    var SlotsInvalidated = function(cut,newlyInvalidatedSlots,isNewCut){

        if(cut == null && cCut == null)
            throw(new Error ("SlotsInvalidated temporalcorr with null cut"));

        if(cut != null)
            cCut = cut;

        if(!show)
            return; //we only render when we want to see them

		if(isNewCut){
			workerSlotGeneration.generation = [];
			theWorker.NewCut();
		}


		for(var s=0;s<newlyInvalidatedSlots.length;s++)if(newlyInvalidatedSlots[s]){
			var slot_s = cCut.GetImmutableSlot(s);

            if(!slot_s.inds || slot_s.inds.length == 0){
                if(isNum(workerSlotGeneration[s])){
                    CanvasUpdateCallback(s,TILE_CANVAS_NUM,null); 
                    theWorker.SetImmutable(s,null);
                    workerSlotGeneration[s] = null; 
                }
                continue; // immutable is empty or deleted
            }

            if(workerSlotGeneration[s] == slot_s.generation)
				continue; //worker already has this slot, there is no reason to send it again here

			var inds = M.clone(slot_s.inds); //we need to clone these before transfering them, in order to keep a copy on this thread
			theWorker.SetImmutable(inds.buffer,s,s,slot_s.generation,[inds.buffer]);
			// Worker will hopefully come back with a PlotHist(hist,...) event 
		}

	}


	var SetShow = function(v){
		if(show ==v)
			return;
		show = v;
        if(!cCut)
            return;
		if(v){
        	SlotsInvalidated(null,M.repvec(1,cCut.GetNImmutables())); //invalidate all slots
		}else{
			for(var i=0;i<workerSlotGeneration.length;i++)
				CanvasUpdateCallback(i,TILE_CANVAS_NUM,null);
			workerSlotGeneration = [];
			theWorker.NewCut(); //clears old cut TODO: maybe we can keep the data safely in the worker in case we want to do show again
		}
	}

	var SetDeltaT = function(v){
		theWorker.SetMaxDeltaT(v); //the worker will send back one hist for each slot that it has previously been sent
	}


	var theWorker = BuildBridgedWorker(workerFunction,["CreateAllSpikeTimes*","SetImmutable*","NewCut","SetMaxDeltaT"],["PlotHist*"],[PlotHist]);
	console.log("tmporalcorr BridgeWorker is:\n  " + theWorker.blobURL);

    return {
		SlotsInvalidated: SlotsInvalidated,
		SetShow: SetShow,
		SetDeltaT: SetDeltaT,
		LoadTetrodeData: LoadTetrodeData
    };

}(T.BYTES_PER_SPIKE,T.CutSlotCanvasUpdate, 2);