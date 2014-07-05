"use strict";

T.RM = function(BYTES_PER_SPIKE,BYTES_PER_POS_SAMPLE,POS_NAN,
                CanvasUpdateCallback, TILE_CANVAS_NUM,ORG,
                POS_W,POS_H,SpikeForPathCallback,PALETTE_FLAG,PALETTE_B,
				$binSizeSlider,$smoothingSlider,$binSizeVal,$smoothingVal){
				
	var IM_SPIKES_FOR_PATH = 1;
	var IM_RATEMAP = 0;
	
	//these constants will be passed through to the worker for use as standard global vars in the worker's scope
	var WORKER_CONSTANTS = {IM_SPIKES_FOR_PATH: IM_SPIKES_FOR_PATH,
							IM_RATEMAP:IM_RATEMAP,
							POS_W: POS_W,
							POS_H: POS_H,
							BYTES_PER_POS_SAMPLE: BYTES_PER_POS_SAMPLE,
							POS_NAN: POS_NAN,
							PALETTE_B: PALETTE_B};						

	var workerFunction = function(){
        "use strict";

        // Some functions copied (and simplified/extended) from Mlib.js and utils.js
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
        
		var max_2 = function(x){
			var ret = new x.constructor([-Infinity,-Infinity]);
			for(var i=0;i<x.length;i++)
				(x[i] > ret[i % 2]) &&  (ret[i % 2] = x[i]);
			return ret;
		}
		var max = function(X){
			var m = X[0];
			for(var i = 1;i< X.length; i++)
				(m < X[i]) && (m = X[i]);
			return m; //Math.max works recursively and fails for large enough arrays
		}
		var pick = function(from,indices){
			var result =  new from.constructor(indices.length); //make an array of the same type as the from array
			for(var i=0;i<indices.length;i++)
				result[i] = from[indices[i]];
			return result;
		}
	
		var hist_2 = function(indsXY,nX,nY){
			var result = new Uint32Array(nX*nY); 
			var n = indsXY.length/2;
			
			for(var i=0;i<n;i++)
				result[indsXY[i*2+1]*nX + indsXY[i*2+0]]++;

			return result;
		}
		var rdivideFloat = function(numerator,denominator){
			var ret = new Float32Array(numerator.length);
			for(var i=0;i<ret.length;i++)
				ret[i] = numerator[i] / denominator[i];
			return ret;
		}
		var rdivideFloatInPlace = function(numerator,denominator){
			for(var i=0;i<numerator.length;i++)
				numerator[i] /= denominator[i];
		}
		var IsZero = function(vector){
			var result = new Uint8ClampedArray(vector.length);
			for(var i=0;i<vector.length;i++)
				result[i] = (vector[i]==0);
			return result;
		}
		
		var GetSmoothed = function(matrix,nX,nY,W){
			var result = new Uint32Array(matrix.length);
			//kernle is box-car of size 2W+1

			for(var ky=-W;ky<=W;ky++)for(var kx=-W;kx<=W;kx++){//for each offset within the kernel square
				var y0 = ky<0? 0 : ky;
				var x0 = kx<0? 0 : kx;
				var yend = ky>0? nY : nY+ky;
				var xend = kx>0? nX : nX+kx;

				for(var y=y0;y<yend;y++)for(var x=x0;x<xend;x++)
					result[y*nX +x] += matrix[(y-ky)*nX +(x-kx)];

			}	
			return result; 
		}
		var useMask = function(vector,mask,val){
		//sets vector elemnts to val where mask is true, if val is omitted it defaults to zero
			val = typeof(val) === "number" ? val : 0;
			for(var i=0;i<mask.length;i++) if(mask[i])
					vector[i] = val;		
		}
        // =======================
        
        var posFreq = null;
		var pixPerM = null;
        var scale_spikes_plot = null;
		var posValXY = null; // this is the values in pixels
		var posBinXY = null; // this is posValXY / pixPerM *100/ cmPerBin
        var spikePosBinXY_b = null; //this is posValXY * the scale factor for plotting to the spikes/pos plot 
		var spikeTimes = null; // this is the spike times expressed in milliseconds
		var spikePosInd = null; // this is the spke times expressed in pos indices
		var spikePosBinXY = null; // this is posBinXY(spikePosInd,:)
		var nBinsX = null;
		var nBinsY = null;
		var smoothedDwellCounts = null;
		var unvisitedBins = null;
        var slots = [];
		var ratemapSlotQueue = []; //holds a queue of which slotsInds need to be sent to the GetGroupRatemap function
		var desiredCmPerBin = 2.5;
        var desiredSmoothingW = 2;
		var expLenInSeconds = null; //used for meanTime plot
 		var ratemapTimer = null;
		
		var PALETTE = function(){
			var P_COLORS = 5;
			var buffer = new ArrayBuffer(4*(P_COLORS+1));
			var buf8 = new Uint8Array(buffer);

			//set all alpha values to opaque
			for(var i=0;i<=P_COLORS;i++)
				buf8[i*4+3] = 255;

			buf8[0*4+0]= 255; buf8[0*4+1]=255; buf8[0*4+2]=255; //white

			buf8[1*4+2]= 198;
			buf8[2*4+1]= 162; buf8[2*4+2]= 255; 
			buf8[3*4+0]= 56; buf8[3*4+1]= 235; buf8[3*4+2]=32; 
			buf8[4*4+0]= 248; buf8[4*4+1]=221; 
			buf8[5*4+0]= 255; buf8[5*4+1]= 32;

			return new Uint32Array(buffer); //this is how ToImageData function wants it
		}();
	
		var SetImmutable = function(inds,slotInd,generation){
			
			slots[slotInd] = {inds:new Uint32Array(inds),generation:generation,num:slotInd,cmPerBin: null};
            QueueSlot(slotInd);
		}

		var NewCut = function(){
			slots = [];
			ClearQueue();
		}

		var SetBinSizeCm = function(v){
			if(v == desiredCmPerBin)
                return; //no point doing anything if the value isn't new

            ClearQueue(); //we can clear the queue because we are going to re-compute all slots unless they were already computed for these settings, but in that case there would be no reason to compute them
			desiredCmPerBin = v;
			CachePosBinIndsAndDwellMap(); //when we change the bin size we have to redo this stuff
			for(var i=0;i<slots.length;i++)if(slots[i] && slots[i].cmPerBin != desiredCmPerBin)
				QueueSlot(i);
		}

        var SetSmoothingW = function(v){
            if(v == desiredSmoothingW)
                return; //no point doing anything if the value isn't new

            ClearQueue(); //we can clear the queue because we are going to re-compute all slots unless they were already computed for these settings, but in that case there would be no reason to compute them
    	    desiredSmoothingW = v;
			CachePosBinIndsAndDwellMap(); //when we change the smoothing we have to redo this stuff
			for(var i=0;i<slots.length;i++)if(slots[i] && slots[i].smoothingW != desiredSmoothingW)
				QueueSlot(i);
		    
        }
        
		var QueueTick = function(){
            var s = ratemapSlotQueue.shift(); 
            while(!slots[s] && ratemapSlotQueue.length)
                s = ratemapSlotQueue.shift(); 
			if(slots[s])
                GetGroupRatemap(slots[s]);
			ratemapTimer  = ratemapSlotQueue.length > 0 ? setTimeout(QueueTick,1) : 0;
            //TODO: may want to time the call and potentially do more within this tick
		}

		var QueueSlot = function(slotInd){
			if(ratemapSlotQueue.indexOf(slotInd) == -1)
				ratemapSlotQueue.push(slotInd);
			if(!ratemapTimer)
				ratemapTimer = setTimeout(QueueTick,1);
		}

		var ClearQueue = function(){
			clearTimeout(ratemapTimer);
            ratemapTimer = 0;
			ratemapSlotQueue = [];
		}

		var CachePosBinIndsAndDwellMap = function(){
			if(posValXY == null || spikePosInd == null)
				return;
				
			//at this point we have posValXY, spikePosInd and cmPerBin.
			//Here we do some stuff that will be common to all groups that want to have a ratemap
			
			var factor = 100/pixPerM /desiredCmPerBin;
			posBinXY = new Uint8ClampedArray(posValXY.length);
			for(var i=0;i<posValXY.length;i++)
				posBinXY[i] = posValXY[i] * factor;
                
            factor = scale_spikes_plot;
            var posBinXY_b = new Uint8ClampedArray(posValXY.length);
    		for(var i=0;i<posValXY.length;i++)
                posBinXY_b[i] = posValXY[i] * factor;
            spikePosBinXY_b = pick(new Uint16Array(posBinXY_b.buffer),spikePosInd); //same form as posBinXY_b, but we store it as 2byte blocks for easy picking
			    
			var maxXY = max_2(posBinXY);			
			nBinsX = maxXY[0] + 1; // +1 is because of zero indexing
			nBinsY = maxXY[1] + 1;
			
			spikePosBinXY = pick(new Uint16Array(posBinXY.buffer),spikePosInd); //same form as posBinXY, but we store it as 2byte blocks for easy picking
						
			var dwellCounts = hist_2(posBinXY,nBinsX,nBinsY);
			dwellCounts[0] = 0; // this is where bad points were put, this is a quick fix. TODO: do something better than this

			//before we do the smoothing we need to remmber which bins were unvisted
			unvisitedBins = IsZero(dwellCounts);

			//ok now we do the smoothing
			smoothedDwellCounts = GetSmoothed(dwellCounts,nBinsX,nBinsY,desiredSmoothingW);

		}
		
		var GetSpikePosInd = function(){	
			//after loading a new tet and/or pos file we know tetTimes and posFreq and can thus express each spike time as an index into the pos array
            spikePosInd = new Uint32Array(spikeTimes.length);
			
			var factor = 1/1000 * posFreq;
    		for(var i=0;i<spikePosInd.length;i++)
    			spikePosInd[i] = spikeTimes[i]*factor; //integer result, so implicitly the floor 
			
		}

        var SetTetData = function(tetTimesBuffer,N,expLenInSeconds_val){
            NewCut();
            if(!N){
				spikeTimes = null;
				spikePosInd = null;
				spikePosBinXY = null;
				unvisitedBins = null;
				smoothedDwellCounts = null;
				expLenInSeconds = null;
				return;
			}
						
        	spikeTimes = new Uint32Array(tetTimesBuffer);
			expLenInSeconds = expLenInSeconds_val;
			
            if(posFreq != null){
                GetSpikePosInd();
				CachePosBinIndsAndDwellMap();
			}
    
        }
        
        var SetPosData = function(buffer,N,posFreq_val,pixPerM_val,scale_spikes_plot_val){
			//reads pos pixel coordinates

            ClearQueue(); 
            if(!N){
                posFreq = null;
				spikeTimes = null;
				spikePosInd = null;
				posValXY = null;
				posBinXY = null;
                spikePosBinXY_b = null;
				spikePosBinXY = null;
				unvisitedBins = null;
				smoothedDwellCounts = null;
                scale_spikes_plot = null;
                return;
            }
            posFreq = posFreq_val;
            pixPerM = pixPerM_val;
            scale_spikes_plot = scale_spikes_plot_val;
			
			posValXY = new Int16Array(buffer);
			
            if(spikeTimes){
                GetSpikePosInd();
				CachePosBinIndsAndDwellMap();
			}
    
        }

		var GetGroupRatemap = function(slot){
			if(smoothedDwellCounts == null) // if we do have smoothedDwellCounts then we will have everything else we need too
				return;

			var cutInds = slot.inds;

			var groupPosIndsXY = pick(spikePosBinXY,cutInds); //spikePosBinXY was stored as 2byte blocks, which is what we want here
			var spikeCounts = hist_2(new Uint8Array(groupPosIndsXY.buffer),nBinsX,nBinsY); //now we treat it as 1 byte blocks
			spikeCounts[0] = 0; //it's the bad bin, remember, TODO: something better than this

			var smoothedSpikeCounts = GetSmoothed(spikeCounts,nBinsX,nBinsY,desiredSmoothingW);
			var ratemap = rdivideFloat(smoothedSpikeCounts,smoothedDwellCounts)
			useMask(ratemap,unvisitedBins);

			var im = ToImageData(ratemap);
			slot.cmPerBin = desiredCmPerBin;
            slot.smoothingW = desiredSmoothingW;
			main.ShowIm(im,slot.num, [nBinsX,nBinsY], slot.generation,IM_RATEMAP,[im]);

		}
		
		var ToImageData = function(map){
			//we use PALETTE which is a Uint32Array, though really the underlying data is 4 bytes of RGBA

			var im = new Uint32Array(map.length);

			 //for binning, we want values on interval [1 P], so use eps (lazy solution):
			var eps = 0.0000001;
			var max_map = max(map);
			if(max_map == 0){
				for(var i=0;i<map.length;i++)
					im[i] = unvisitedBins[i]? PALETTE[0] : PALETTE[1];
			}else{
				var factor = (PALETTE.length-1)/(max_map*(1+eps));
				for(var i=0;i<map.length;i++)
					im[i] = unvisitedBins[i]? PALETTE[0] : PALETTE[1+Math.floor(map[i]*factor)];
			}
			return im.buffer; //this is how it's going to be sent back to the main thread
		}

		var PlotPoint = function(im,W,H,x,y,s,color){
			/* sets a square point of size s x s in image im, with dimensions WxH to the value specified by color */
			var a_start = y<s/2 ? 0 : y-s/2;
			var a_end = y +s/2 > H ? H : y+s/2;
			var b_start = x<s/2 ? 0 : x-s/2;
			var b_end = x +s/2 > W ? W : x+s/2;
			
			for(var a=a_start;a<a_end;a++)for(var b=b_start;b<b_end;b++)
					im[a*W + b] = color; 
		}
		
		var PlotPoint2 = function(totals,counts,W,H,x,y,s,val){
			/* This is like PlotPoints, but it takes two input "images", one which will accumulate counts and one
			which will accumulate values, they can thus be divided at the end to get means. */
			var a_start = y<s/2 ? 0 : y-s/2;
			var a_end = y +s/2 > H ? H : y+s/2;
			var b_start = x<s/2 ? 0 : x-s/2;
			var b_end = x +s/2 > W ? W : x+s/2;
			
			for(var a=a_start;a<a_end;a++)for(var b=b_start;b<b_end;b++){
					totals[a*W + b] += val; 
					counts[a*W + b] += 1;
			}
		}
		var RenderSpikesForPath = function(color,slot_num,slot_generation,asMeanT){
			// TODO: implement a queue so we can cancel all but most recent ...doesn't really seem to be needed actually.
            
			var s = slots[slot_num]
			if(!s || s.generation != slot_generation)
				return; // TODO: should push this render back on to the local queue for when we do have the slot inds
				
			var groupPosIndsXY = pick(spikePosBinXY_b,s.inds); //spikePosBinXY_b was stored as 2byte blocks, which is what we want here
			var nSpks = groupPosIndsXY.length;
			groupPosIndsXY = new Uint8Array(groupPosIndsXY.buffer) // now use it as (x,y), 1 btye each
			
			if(asMeanT){
				// Here we accumulate 1s for each spike marker in 2d (a 4x4 square), and separately accumulate spike times for the same marker
				// Then divide the times by the counts to get the mean.  Finally we apply a pallete to the result.
				
				var counts = new Uint32Array(POS_W*POS_H);
				var totalTimes = new Float32Array(POS_W*POS_H);
				var groupSpikeTimes = pick(spikeTimes,s.inds);
				for (var i=0;i<nSpks;i++)
					PlotPoint2(totalTimes, counts, POS_W, POS_H, groupPosIndsXY[i*2+0], groupPosIndsXY[i*2+1], 4, groupSpikeTimes[i]);
				var meanTimes = totalTimes; //we're going to do the division in place, so adopt a new variable name now...
				rdivideFloatInPlace(meanTimes,counts);
				
				var factor = 256/1000/expLenInSeconds; //calculating colormap lookup factor
				var im = counts; //we reuse the memory for the counts array, but read from it as we go...
				for(var i=0;i<im.length;i++)
					im[i] = counts[i] ? PALETTE_B[Math.floor(meanTimes[i] * factor)] : 0;  //apply colormap, leaving 0-alpha in pixels with no counts
				
			}else{
				// This is the normal group sticker color plotting
				var im = new Uint32Array(POS_W*POS_H);
				for (var i=0;i<nSpks;i++)
					PlotPoint(im,POS_W,POS_H,groupPosIndsXY[i*2+0],groupPosIndsXY[i*2+1],4,color)			
			}
			main.ShowIm(im.buffer,slot_num,[POS_W,POS_H],slot_generation,IM_SPIKES_FOR_PATH,[im.buffer]);
            
		}
	};
	// ==== END OF WORKER ==========================
	
	var cCut = null;
	var show = [0];
	var workerSlotGeneration = []; //for each slot, keeps track of the last generation of immutable that was sent to the worker
	var meanTMode = false;
	var desiredCmPerBin = 2.5;
	var desiredSmoothingW = 2;
    
	var LoadTetData = function(N_val, tetTimes,expLenInSeconds){
		cCut = null;
        workerSlotGeneration = [];
		if(!N_val){
			theWorker.SetTetData(null) //this clears the ratemap queue, clears the cut, and clears the stuff cached for doing ratemaps in future
			//TODO: decide whether we need to send null canvases
			return;
		}
		tetTimes = M.clone(tetTimes); //we need to clone it so that when we transfer ownsership we leave a copy in this thread for other modules to use
		
		theWorker.SetTetData(tetTimes.buffer,N_val,expLenInSeconds,[tetTimes.buffer]);

	}

	var LoadPosData = function(N_val, buffer,timebase,pixPerM,scale_spikes_plot){
		if(!N_val){
			theWorker.SetPosData(null) //this clears the ratemap queue, clears the cut, and clears the stuff cached for doing ratemaps in future
			//TODO: decide whether we need to send null canvases
			return;
		}
		buffer = M.clone(buffer); //we need to clone it so that when we transfer ownsership we leave a copy in this thread for other modules to use
		
		theWorker.SetPosData(buffer,N_val,timebase,pixPerM,scale_spikes_plot,[buffer]);

	}
	
	var ShowIm = function(imBuffer,slotInd,sizeXY,generation,imType){
        var $canvas = $("<canvas width='" + sizeXY[0] + "' height='" + sizeXY[1] + "' />");
        var ctx = $canvas.get(0).getContext('2d');

		var imData = ctx.createImageData(sizeXY[0],sizeXY[1]);
		imData.data.set(new Uint8ClampedArray(imBuffer));
		ctx.putImageData(imData, 0, 0);

		switch(imType){
			case IM_RATEMAP:
				CanvasUpdateCallback(slotInd,TILE_CANVAS_NUM,$canvas); //send the plot back to main
				break;
			case IM_SPIKES_FOR_PATH:
				$canvas.toggleClass("poslayer",true);
				SpikeForPathCallback($canvas);  //send the plot back to main
				break;
		}
			
    }

    var SlotsInvalidated = function(newlyInvalidatedSlots,isNewCut){ // this = cut object

        if(this == null && cCut == null)
            throw(new Error ("SlotsInvalidated ratemap with null cut"));

        if(this != null)
            cCut = this;

        if(!show[0])
            return; //we only render when we want to see them

		if(isNewCut){
			workerSlotGeneration = [];
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
			
			theWorker.SetImmutable(inds.buffer,s,slot_s.generation,[inds.buffer]);
			workerSlotGeneration[s] = slot_s.generation;
			// Worker will hopefully come back with a ShowIm event for this slot 
		}

	}


	var SetShow = function(v){
		if(show[0] ==v[0])
			return;
		show = v.slice(0);
        if(!cCut)
            return;
		if(v[0]){
        	SlotsInvalidated.call(null,M.repvec(1,cCut.GetNImmutables())); //invalidate all slots
		}else{
			for(var i=0;i<workerSlotGeneration.length;i++)
				CanvasUpdateCallback(i,TILE_CANVAS_NUM,null);
			workerSlotGeneration = [];
			theWorker.NewCut(); //clears old cut TODO: maybe we can keep the data safely in the worker in case we want to do show again
		}
	}
	
	var SetCmPerBin = function(v,viaSlider){
		$binSizeVal.text(v + " cm")
		desiredCmPerBin = v;
		theWorker.SetBinSizeCm(v); //the worker will send back one hist for each slot that it has previously been sent
		if(viaSlider !== true)
			$binSizeSlider.get(0).value = v;
	}
    var SetSmoothingW = function(v,viaSlider){
		if(v == 0)
			$smoothingVal.text("off");
		else if(v == 1)
			$smoothingVal.text("(2+1) by (2+1) bins");
		else
			$smoothingVal.text("(2x" + v + "+1) by (2x" + v + "+1) bins");
        desiredSmoothingW = v;
        theWorker.SetSmoothingW(v);
        if(viaSlider !== true)
    		$smoothingSlider.get(0).value = v;
    }
	var RenderSpikesForPath = function(g){
	    var color = PALETTE_FLAG[g];
		var slot = cCut.GetGroup(g,true);
		theWorker.RenderSpikesForPath(color,slot.num,slot.generation,meanTMode);
	}
	
	var FileStatusChanged = function(status,filetype){
		if(filetype == null){
			if(status.tet < 3)
				LoadTetData(null);
			
			if(status.pos < 3)
				LoadPosData(null);
		}
		
		if(filetype == "tet"){
			LoadTetData(ORG.GetN(),ORG.GetTetTimes(),parseInt(ORG.GetTetHeader().duration));
			
			if(status.cut == 3 && status.pos == 3) ///if we happened to have loaded the cut before the tet and pos, we need to force T.RM to accept it now
				ORG.GetCut().ForceChangeCallback(SlotsInvalidated);
		}

		if(filetype == "pos"){
			var posHeader = ORG.GetPosHeader();
            
            // work out scale factor for spike pos plot (in spatial panel)
            var xs = POS_W/(parseInt(posHeader.max_vals[0])-0);
            var ys = POS_H/(parseInt(posHeader.max_vals[1])-0);
                
			LoadPosData(parseInt(posHeader.num_pos_samples), ORG.GetPosBuffer(),
                        parseInt(posHeader.timebase),parseInt(posHeader.units_per_meter),
                        xs<ys? xs: ys /*min of the two*/);
			if(status.cut == 3 && status.tet == 3) //if we happened to have loaded the cut before the tet and pos, we need to force T.RM to accept it now
				ORG.GetCut().ForceChangeCallback(SlotsInvalidated);
		}
			
	}

	var SetRenderMode = function(v){
		//currently this only applies to the spikes plot
		 switch(v){
            case 2:
                meanTMode = true;
                break;
            default:
                meanTMode = false;
        }
	}
	

	var theWorker = BuildBridgedWorker(workerFunction,
										["SetPosData*","SetTetData*","NewCut","SetBinSizeCm","SetSmoothingW",
                                            "SetImmutable*","RenderSpikesForPath"],
										["ShowIm*"],[ShowIm],
										WORKER_CONSTANTS);
	console.log("ratemap BridgeWorker is:\n  " + theWorker.blobURL);


	var BinSizeCmSilder_Change = function(e){
		SetCmPerBin(this.value,true);
	}
	$binSizeSlider.on("change",BinSizeCmSilder_Change);
	
    var SmoothingWSilder_Change = function(e){
    	SetSmoothingW(this.value,true);
	}
	$smoothingSlider.on("change",SmoothingWSilder_Change);
	
    
	ORG.AddCutChangeCallback(SlotsInvalidated);
	ORG.AddFileStatusCallback(FileStatusChanged);
	
	return {
		SetShow: SetShow,
		SetCmPerBin: SetCmPerBin,
		GetCmPerBin: function(){return desiredCmPerBin;},
        GetSmoothingW: function(){return desiredSmoothingW;},
        SetSmoothingW: SetSmoothingW,
		RenderSpikesForPath: RenderSpikesForPath,
		SetRenderMode: SetRenderMode
	}

}(T.PAR.BYTES_PER_SPIKE,T.PAR.BYTES_PER_POS_SAMPLE,T.PAR.POS_NAN,
  T.CutSlotCanvasUpdate,T.CANVAS_NUM_RM,T.ORG,
  T.POS_PLOT_WIDTH,T.POS_PLOT_HEIGHT,T.SpikeForPathCallback,
  new Uint32Array(T.PALETTE_FLAG.buffer),new Uint32Array(T.PALETTE_TIME.buffer),
	$('#rm_binsize_slider'),$('#rm_smoothing_slider'),$('#rm_binsize_val'),$('#rm_smoothing_val'))

