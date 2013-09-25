"use strict";

T.TC = function(BYTES_PER_SPIKE,CanvasUpdateCallback, TILE_CANVAS_NUM){

    var plotOpts = {
        W: 100,
        H: 50,
		nBins: 100 //I think you get one extra due to zero bin
    }
	
	var cCut = {};
	var show = false;
	var ready = false;
	var renderState = {generation: [],
						maxDeltaT: [], 
					   desiredMaxDeltaT: 500} //miliseconds
	var allSpikeTimes = null;
				   
	var LoadTetrodeData = function(N_val, buffer,timebase){
		ClearAll();
		
		//create the alLSpikeTimes array from the buffer
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
            
		ready = true;
	}
		
    var GetGroupTDiffs = function(cutInds,allSpikeTimes,maxDeltaT){
        // note maxDeltaT and allSpikeTimes should be in the same units, represented as uin32s.
            
        var spikeTimes = new Uint32Array(cutInds.length);
        for(var i=0;i<cutInds.length;i++)
            spikeTimes[i] = allSpikeTimes[cutInds[i]]
			
        M.sort(spikeTimes,M.IN_PLACE);
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
    
        return new Uint16Array(diffs); // Note that diffs has only non-negative values and it omitts the self difference (zero) for each spike
    }

    var PlotTDiffs= function(diffs,cutInds,maxDeltaT){
        var binSize = maxDeltaT / plotOpts.nBins;
        var diffInds = M.toInds(diffs,binSize);
            
        var hist = M.accumarray(diffInds,1,"sum");
        //hist[0] += cutInds.length; //to take acount of the self difference for each spike
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
        return $canvas;
    }
    
    var SlotsInvalidated = function(cut,newlyInvalidatedSlots,isNewCut){
		if(!ready) 
			throw(new Error("SlotsInvalidated temporalcorr before ready"))

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
            
			var diffs = GetGroupTDiffs(slot_s.inds,allSpikeTimes,renderState.desiredMaxDeltaT); //get a list of all pairwise temporal differences
			var $canvas = PlotTDiffs(diffs,slot_s.inds,renderState.desiredMaxDeltaT); //plot a histogram of these differences
			CanvasUpdateCallback(s,TILE_CANVAS_NUM,$canvas); //send the plot back to main
			
			renderState.maxDeltaT[s] = renderState.desiredMaxDeltaT; //record that we've rendered this immutable with this max delta t
			renderState.generation[s] = slot_s.generation;
		}

	}

    var InvalidateAll = function(){
		if(!ready)
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
	
	var ClearAll = function(){
		ready = false;
		renderState.generation = [];
		renderState.maxDeltaT = []; 
		allSpikeTimes = null;
		//TODO: decide whether we need to send null canvases
	}
	
    return {
		SlotsInvalidated: SlotsInvalidated,
		SetShow: SetShow,
		SetDeltaT: SetDeltaT,
		LoadTetrodeData: LoadTetrodeData
    };
    
}(T.BYTES_PER_SPIKE,T.CutSlotCanvasUpdate, 2);