"use strict";

//TODO: consider pushing some of this into a worker, code has been kept fairly segregated to make this easier
//TODO: use more stuff from M.js
 
T.RM = function(BYTES_PER_SPIKE,BYTES_PER_POS_SAMPLE,POS_NAN,CanvasUpdateCallback, TILE_CANVAS_NUM){
	var spikePosBinXY;
	var smoothedDwellCounts;
	var unvisitedBins;
	var nBinsX, nBinsY, nBinsTot;//nBinsTot is just nBinsX *nBinsY
	var ready = false;
	var P_COLORS = 5; //0th entry in palette is white, then p colors
	var cCut = {};
	var renderState = {generation: [],
						binSize: [],  //TODO: this isn't actually used at the moment as the only way to change binSize is to reload the tetrode and pos data
						desiredBinSize: null}
	//matricies will be stored in the following order x1y1 x2y1 x3y1 ... xny1 x1y2 .... which is how imagedata wants it

	var GetSmoothed = function(matrix){
		var result = new Uint32Array(nBinsTot);
		var W = 2; //kernle is box-car of size 2W+1

		for(var ky=-W;ky<=W;ky++)for(var kx=-W;kx<=W;kx++){//for each offset within the kernel square
			var y0 = ky<0? 0 : ky;
			var x0 = kx<0? 0 : kx;
			var yend = ky>0? nBinsY : nBinsY+ky;
			var xend = kx>0? nBinsX : nBinsX+kx;

			for(var y=y0;y<yend;y++)for(var x=x0;x<xend;x++)
				result[y*nBinsX +x] += matrix[(y-ky)*nBinsX +(x-kx)];

		}	
		return result; 
	}

	var accumarray = function(indsXY){
		//This function has aspirations to match the magnificence of its Matlab namesake.  Currently it is rather more simple.
		
		//assume size nBinsX and nBinsY. 
		var result = new Uint32Array(nBinsTot);
		var n = indsXY.length/2;
		for(var i=0;i<n;i++)
			result[indsXY[i*2+1]*nBinsX + indsXY[i*2+0]]++;

		return result;
	}



	var IsZero = function(vector){
		var result = new Uint8ClampedArray(vector.length);
		for(var i=0;i<vector.length;i++)
			result[i] = (vector[i]==0);
		return result;
	}

	//Note about endian-ness:
	// if required, T.PAR will swap pairs of bytes when reading the pos file, which makes sense for x and y data but not for timestamps
	// (so the timestamps in pos data are screwed up, but we don't actually bother to read them , we assume constant sampling at the stated freq)
	// tetrode data is mostly single bytes so nothing is done to it at the point of loading, this means that here we may need to swap the bytes of 
	//the 4-byte timestamps.  See GetPosInds function for more.


	var GetPosInds = function(buffer,N,tetFreq,posFreq){
		//reads timestamps and converts to posSample index

		var oldData = new Int32Array(buffer);
    	var posInds = new Uint32Array(N);

		for(var i=0; i<N; i++) //get the timestamp for each spike
			posInds[i] = oldData[BYTES_PER_SPIKE/4*i]; //we are accessing the buffer as 4byte ints, we want the first 4bytes of the i'th spike


		if (endian == 'L') 
			for(var i=0;i<N; i++)
				posInds[i] = Swap32(posInds[i]);

		var factor = 1/tetFreq * posFreq;
		for(var i=0;i<N;i++)
			posInds[i] = Math.ceil(posInds[i]*factor);

		return posInds;
	}

	var Setup = function(tetBuffer,posBuffer,Ntet,Npos,tetFreq,posFreq,pixPerM,cmPerBin){
		console.time("ratemap setup");
		ClearAll();

		var posInds = GetPosInds(tetBuffer,Ntet,tetFreq,posFreq);
		var posBinXY = new Uint8ClampedArray(2*Npos); // xBin, yBin, xBin , yBin, ... bin numbers from 0 to 255. 

		var factor = 1/pixPerM * 100 /cmPerBin;	

		var posData = new Uint16Array(posBuffer);
		//TODO: subtract min in x and y, deal with POS_NAN

		var wordsPerPosSample = BYTES_PER_POS_SAMPLE/2;

		for(var i=0; i<Npos;i++){
			var s = wordsPerPosSample*i;
			if(posData[s+2]!=0 && posData[s+3]!=0 && posData[s+2]!=POS_NAN && posData[s+3]!=POS_NAN){
				posBinXY[i*2 + 0] = posData[s+2]*factor; //x value
				posBinXY[i*2 + 1] = posData[s+3]*factor; //y value
			}
		}

		var tmp = new Uint8ClampedArray(Npos);
		for(var i=0;i<Npos;i++)
			tmp[i] = posBinXY[2*i+0];
		nBinsX =  M.max(tmp) + 1;//+1 because of zero

		for(var i=0;i<Npos;i++)
			tmp[i] = posBinXY[2*i+1];
		nBinsY =  M.max(tmp) + 1;

		nBinsTot = nBinsX*nBinsY;

		//since the only thing we really care about is pos bins, its the posbinX and posbinY we store for each spike
		spikePosBinXY=M.pick(new Uint16Array(posBinXY.buffer),posInds); //same form as posBinXY, but we store it as 2byte blocks for easy picking

		var dwellCounts = accumarray(posBinXY);
		dwellCounts[0] = 0;//this is where bad points were put, this is a quick fix

		//before we do the smoothing we need to remmber which bins were unvisted
		unvisitedBins = IsZero(dwellCounts);

		//ok now we do the smoothing
		smoothedDwellCounts = GetSmoothed(dwellCounts);

		//TODO: if division really is slow, it may even be while inverting all the elements in the smoothedDwellCounts matrix
		ready = true;

		console.timeEnd("ratemap setup");

	}

	var SlotsInvalidated = function(cut,newlyInvalidatedSlots,isNewCut){
		if(!ready) 
			throw(new Error("SlotsInvalidated ratemap before ready"))

        if(cut == null && cCut == null)
            throw(new Error ("SlotsInvalidated ratemap with null cut"));
        
        if(cut != null)
            cCut = cut;
            
        if(!mapIsOn[0])
            return; //we only render ratemps when we want to see them
            
		if(isNewCut){
			renderState.generation = [];
			renderState.binSize = [];
		}
		
		//for each cutGroup it builds a spikeCount map, smooths it, divides by the dwell count, applies a colorpalette to the result and outputs a matrix to be used as image data.
		//For each cutGroup the peak rate is stored in an array and output at the end as a single list.
		//by output here we mean postmessage

		for(var s=0;s<newlyInvalidatedSlots.length;s++)if(newlyInvalidatedSlots[s]){
			var slot_s = cCut.GetImmutableSlot(s);
			
            if(!slot_s.inds || slot_s.inds.length == 0){
                if(!isNaN(renderState.generation[s])){
                    CanvasUpdateCallback(s,TILE_CANVAS_NUM,null); 
                    renderState.generation[s] = NaN; 
                }
                continue; // immutable is empty or deleted
            }
            
            if(renderState.generation[s] == slot_s.generation)
				continue; //immutable has already been rendered
            
			var groupPosIndsXY = M.pick(spikePosBinXY,slot_s.inds); //spikePosBinXY was stored as 2byte blocks, which is what we want here
			var spikeCounts = accumarray(new Uint8Array(groupPosIndsXY.buffer)); //now we treat it as 1 byte blocks
			spikeCounts[0] = 0; //it's the bad bin, remember

			var smoothedSpikeCounts = GetSmoothed(spikeCounts);
			var ratemap = M.rdivide(smoothedSpikeCounts,smoothedDwellCounts)
			M.useMask(ratemap,unvisitedBins);

			var im = ToImageData(ratemap);
			ShowGroupImage(im,s); 
			renderState.generation[s] = slot_s.generation;
		}

	}

    var InvalidateAll = function(){
		if(!ready)
			return;
		SlotsInvalidated(null,M.repvec(1,cCut.GetNImmutables())); //invalidate all slots
	}


	var PALETTE = function(){
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

	var ToImageData = function(map){
		//we use PALETTE which is a Uint32Array, though really the underlying data is 4 bytes of RGBA

		var buffer = new ArrayBuffer(nBinsTot*4);
		var im = new Uint32Array(buffer);//4 because RGBA each of which is 1 byte

		 //for binning, we want values on interval [1 P], so use eps (lazy solution):
		var eps = 0.0000001;

		var factor = 1/M.max(map)*P_COLORS*(1-eps);
		var i = 0;

		for(var i=0;i<nBinsTot;i++)
			im[i] = unvisitedBins[i]? PALETTE[0] : PALETTE[1+Math.floor(map[i]*factor)];

		return new Uint8ClampedArray(buffer); //this is how it's going to be used by ShowGroupImage
	}


	//=================================================

	var mapIsOn = [0];


	var ShowGroupImage =function(im,slot){		
		var $canvas = $("<canvas width='" + nBinsX + "' height='" + nBinsY + "' />");
		var ctx = $canvas.get(0).getContext('2d');
		var imData = ctx.createImageData(nBinsX,nBinsY);
		var nBytes = nBinsX*nBinsY*4;
		for(var i=0;i<nBytes;i++)
			imData.data[i] = im[i];
		ctx.putImageData(imData, 0, 0);

		CanvasUpdateCallback(slot,TILE_CANVAS_NUM,$canvas);
	}

	var ClearAll = function(){
		spikePosBinXY = null;
		smoothedDwellCounts = null;
		unvisitedBins= null;
		nBinsX = null, nBinsY = null, nBinsTot = null;
		ready = false;
		renderState.generation = [];
		renderState.binSize = [];
	}

	var ShowMaps = function(newMapIsOn){
		if (newMapIsOn[0] == mapIsOn[0])
			return; //nothing has changed;

		mapIsOn = newMapIsOn.slice(0);

		if(mapIsOn[0]){
            InvalidateAll();
		}else{
			for(var i = 0;i<renderState.generation.length;i++)if(isNum(renderState.generation[i]))
				CanvasUpdateCallback(i,TILE_CANVAS_NUM,null);
			renderState.generation = [];
			renderState.binSize = [];
		}

	}

	return {
		Setup: Setup,
		SlotsInvalidated: SlotsInvalidated,
		ShowMaps: ShowMaps,
		ClearAll: ClearAll
	}

}(T.BYTES_PER_SPIKE,T.BYTES_PER_POS_SAMPLE,T.POS_NAN,T.CutSlotCanvasUpdate,1)

