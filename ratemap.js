"use strict";

//TODO: consider pushing some of this into a worker, code has been kept fairly segregated to make this easier
//TODO: use more stuff from M.js

T.RM = function(BYTES_PER_SPIKE,BYTES_PER_POS_SAMPLE,POS_NAN,CanvasUpdateCallback, TILE_CANVAS_NUM){


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
		var IsZero = function(vector){
			var result = new Uint8ClampedArray(vector.length);
			for(var i=0;i<vector.length;i++)
				result[i] = (vector[i]==0);
			return result;
		}
		
		var GetSmoothed = function(matrix,nX,nY){
			var result = new Uint32Array(matrix.length);
			var W = 2; //kernle is box-car of size 2W+1

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
        
        var tetFreq = null;
        var posFreq = null;
		var pixPerM = null;
		var posValXY = null; // this is the values in pixels
		var posBinXY = null; // this is posValXY / pixPerM *100/ cmPerBin
		var spikeTetInd = null; // this is the values expressed in tetFreq
		var spikePosInd = null; // this is spikeTetInd / tetFreq * posFreq
		var spikePosBinXY = null; // this is posBinXY(spikePosInd,:)
		var nBinsX = null;
		var nBinsY = null;
		var smoothedDwellCounts = null;
		var unvisitedBins = null;
        var slots = [];
		var ratemapSlotQueue = []; //holds a queue of which slotsInds need to be sent to the GetGroupRatemap function
		var desiredCmPerBin = 2.5;
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
			
			var maxXY = max_2(posBinXY);			
			nBinsX = maxXY[0] + 1; // +1 is because of zero indexing
			nBinsY = maxXY[1] + 1;
			
			spikePosBinXY = pick(new Uint16Array(posBinXY.buffer),spikePosInd); //same form as posBinXY, but we store it as 2byte blocks for easy picking
			
			var dwellCounts = hist_2(posBinXY,nBinsX,nBinsY);
			dwellCounts[0] = 0; // this is where bad points were put, this is a quick fix. TODO: do something better than this

			//before we do the smoothing we need to remmber which bins were unvisted
			unvisitedBins = IsZero(dwellCounts);

			//ok now we do the smoothing
			smoothedDwellCounts = GetSmoothed(dwellCounts,nBinsX,nBinsY);

		}
		
		var GetSpikePosInd = function(){	
			//after loading a new tet and/or pos file we know tetFreq and posFreq and can thus express each spike time as an index into the pos array
    
            spikePosInd = new Uint32Array(spikeTetInd.length);
			var factor = 1/tetFreq * posFreq;
			
    		for(var i=0;i<spikePosInd.length;i++)
    			spikePosInd[i] = spikeTetInd[i]*factor; //integer result, so implicitly the floor 

		}

        var SetTetData = function(buffer,N,tetFreq_val,BYTES_PER_SPIKE){
			//reads timestamps in units of tetFreq
            NewCut();
			
            if(!N){
				tetFreq = null;
				spikeTetInd = null;
				spikePosInd = null;
				spikePosBinXY = null;
				unvisitedBins = null;
				smoothedDwellCounts = null;
				return;
			}
			tetFreq = tetFreq_val;
			spikePosInd = null;
			
        	var oldData = new Int32Array(buffer);
        	spikeTetInd = new Uint32Array(N);
    
    		for(var i=0; i<N; i++) //get the timestamp for each spike
    			spikeTetInd[i] = oldData[BYTES_PER_SPIKE/4*i]; //we are accessing the buffer as 4byte ints, we want the first 4bytes of the i'th spike
    
    		if (endian == 'L') 
    			for(var i=0;i<N; i++)
    				spikeTetInd[i] = Swap32(spikeTetInd[i]);
    
            if(posFreq != null){
                GetSpikePosInd();
				CachePosBinIndsAndDwellMap();
			}
    
        }
        
        var SetPosData = function(buffer,N,posFreq_val,pixPerM_val,BYTES_PER_POS_SAMPLE,POS_NAN){
			//reads pos pixel coordinates
            ClearQueue(); 
            if(!N){
                posFreq = null;
				spikePosInd = null;
				posValXY = null;
				posBinXY = null;
				spikePosBinXY = null;
				unvisitedBins = null;
				smoothedDwellCounts = null;
                return;
            }
            posFreq = posFreq_val;
            pixPerM = pixPerM_val;
			
            posValXY = new Uint16Array(2*N); // x_1, y_1, x_2 , y_2, ... in units of pixels    
    		var posData = new Uint16Array(buffer);
    		
    		var wordsPerPosSample = BYTES_PER_POS_SAMPLE/2;
    
    		for(var i=0, s=0; i<N;i++,s+=wordsPerPosSample){
    			if(posData[s+2]!=0 && posData[s+3]!=0 && posData[s+2]!=POS_NAN && posData[s+3]!=POS_NAN){
    				posValXY[i*2 + 0] = posData[s+2]; //x value
    				posValXY[i*2 + 1] = posData[s+3]; //y value
    			}
    		}
			
			//TODO: filtering and interpolation
			
            if(tetFreq != null){
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

			var smoothedSpikeCounts = GetSmoothed(spikeCounts,nBinsX,nBinsY);
			var ratemap = rdivideFloat(smoothedSpikeCounts,smoothedDwellCounts)
			useMask(ratemap,unvisitedBins);

			var im = ToImageData(ratemap);
			slot.cmPerBin = desiredCmPerBin;
			main.ShowIm(im,slot.num, [nBinsX,nBinsY], slot.generation,[im]);

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
	};
	// ==== END OF WORKER ==========================
	
	var cCut = null;
	var show = [0];
	var workerSlotGeneration = []; //for each slot, keeps track of the last generation of immutable that was sent to the worker


	var LoadTetData = function(N_val, buffer,timebase){
		cCut = null;
        workerSlotGeneration = [];
		if(!N_val){
			theWorker.SetTetData(null) //this clears the ratemap queue, clears the cut, and clears the stuff cached for doing ratemaps in future
			//TODO: decide whether we need to send null canvases
			return;
		}
		buffer = M.clone(buffer); //we need to clone it so that when we transfer ownsership we leave a copy in this thread for other modules to use
		theWorker.SetTetData(buffer,N_val,timebase,BYTES_PER_SPIKE,[buffer]);

	}

	var LoadPosData = function(N_val, buffer,timebase,pixPerM){
		if(!N_val){
			theWorker.SetPosData(null) //this clears the ratemap queue, clears the cut, and clears the stuff cached for doing ratemaps in future
			//TODO: decide whether we need to send null canvases
			return;
		}
		buffer = M.clone(buffer); //we need to clone it so that when we transfer ownsership we leave a copy in this thread for other modules to use
		theWorker.SetPosData(buffer,N_val,timebase,pixPerM,BYTES_PER_POS_SAMPLE,POS_NAN,[buffer]);

	}
	
	var ShowIm = function(imBuffer,slotInd,sizeXY,generation){
        var $canvas = $("<canvas width='" + sizeXY[0] + "' height='" + sizeXY[1] + "' />");
        var ctx = $canvas.get(0).getContext('2d');

		var imData = ctx.createImageData(sizeXY[0],sizeXY[1]);
		imData.data.set(new Uint8ClampedArray(imBuffer));
		ctx.putImageData(imData, 0, 0);

		CanvasUpdateCallback(slotInd,TILE_CANVAS_NUM,$canvas); //send the plot back to main
    }

    var SlotsInvalidated = function(cut,newlyInvalidatedSlots,isNewCut){

        if(cut == null && cCut == null)
            throw(new Error ("SlotsInvalidated ratemap with null cut"));

        if(cut != null)
            cCut = cut;

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
			theWorker.SetImmutable(inds.buffer,s,s,slot_s.generation,[inds.buffer]);
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
        	SlotsInvalidated(null,M.repvec(1,cCut.GetNImmutables())); //invalidate all slots
		}else{
			for(var i=0;i<workerSlotGeneration.length;i++)
				CanvasUpdateCallback(i,TILE_CANVAS_NUM,null);
			workerSlotGeneration = [];
			theWorker.NewCut(); //clears old cut TODO: maybe we can keep the data safely in the worker in case we want to do show again
		}
	}

	var SetCmPerBin = function(v){
		theWorker.SetBinSizeCm(v); //the worker will send back one hist for each slot that it has previously been sent
	}

	var theWorker = BuildBridgedWorker(workerFunction,["SetPosData*","SetTetData*","NewCut","SetBinSizeCm","SetImmutable*"],["ShowIm*"],[ShowIm]);
	console.log("ratemap BridgeWorker is:\n  " + theWorker.blobURL);
	
	return {
		LoadTetData: LoadTetData,
		SlotsInvalidated: SlotsInvalidated,
		LoadPosData: LoadPosData,
		SetShow: SetShow,
		SetCmPerBin: SetCmPerBin
	}

}(T.BYTES_PER_SPIKE,T.BYTES_PER_POS_SAMPLE,T.POS_NAN,T.CutSlotCanvasUpdate,T.CANVAS_NUM_RM)

