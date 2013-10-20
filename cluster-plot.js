"use strict"; 


T.CP = function($canvasParent,ORG){

	//TODO: it may be woth moving the plotting into a worker
	
	var cCut = null;
	var amps = null;
	var ctxes = [];
	var W = 50;
	var C = 4;
	var N = null;
	var chanList = [];
	var canvS = 128;
	var canvasesAreNew = null;
	var ready = false;
	
	var PALETTE_FLAG = function(){ //duplicated in webgl-waveforms  TODO: put it in main
        var data = new Uint8Array(256*4);
        for(var i=0;i<256;i++)
    		data[i*4+3] = 255; //set alpha to opaque
        data[0*4+0] = 190;    data[0*4+1] = 190;    data[0*4+2] = 190; //was 220 for all three
        data[1*4+2] = 200;
    	data[2*4+0] = 80;	data[2*4+1] = 255;
        data[3*4+0] = 255;
        data[4*4+0] = 245;	data[4*4+2] = 255;
    	data[5*4+1] = 75;	data[5*4+1] = 200;	data[5*4+2] = 255;
        data[6*4+1] = 185;
    	data[7*4+0] = 255;	data[7*4+1] = 185;	data[7*4+2] = 50;
        data[8*4+1] = 150;	data[8*4+2] = 175;
        data[9*4+0] = 150;	data[9*4+2] = 175;
    	data[10*4+0] = 170;	data[10*4+1] = 170;
    	data[11*4+0] = 200;
    	data[12*4+0] = 255;	data[12*4+1] = 255;
    	data[13*4+0] = 140;	data[13*4+1] = 140;	data[13*4+2] = 140;
    	data[14*4+1] = 255; data[14*4+2] = 235;
    	data[15*4+0] = 255; data[15*4+2] = 160;
    	data[16*4+0] = 175; data[16*4+1] = 75; data[16*4+2] = 75;
    	data[17*4+0] = 255; data[17*4+1] = 155; data[17*4+2] = 175;
    	data[18*4+0] = 190; data[18*4+1] = 190; data[18*4+2] = 160;
    	data[19*4+0] = 255; data[19*4+1] = 255; data[19*4+2] = 75;
    	data[20*4+0] = 154; data[20*4+1] = 205; data[20*4+2] = 50;
    	data[21*4+0] = 255; data[21*4+1] = 99; data[21*4+2] = 71;
    	data[22*4+1] = 255; data[22*4+2] = 127;
    	data[23*4+0] = 255; data[23*4+1] = 140;
    	data[24*4+0] = 32; data[24*4+1] = 178; data[24*4+2] = 170;
    	data[25*4+0] = 255; data[25*4+1] = 69; 
    	data[26*4+0] = 240; data[26*4+1] = 230; data[26*4+2] = 140;
    	data[27*4+0] = 100; data[27*4+1] = 149; data[27*4+2] = 237;
    	data[28*4+0] = 255; data[28*4+1] = 218; data[28*4+2] = 185;
    	data[29*4+0] = 153; data[29*4+1] = 50; data[29*4+2] = 204;
    	data[30*4+0] = 250; data[30*4+1] = 128; data[30*4+2] = 114;
        return new Uint32Array(data.buffer); //we're going to want to use it as 4byte words
    }();


	var SlotsInvalidated = function(newlyInvalidatedSlots,isNewCut){ //this = cut object
		
		if(!ready){
			console.warn('cluster-plot SlotsInvalidated without any voltage data.');
			return;
		}
			
		if(isNewCut || cCut == null){//TODO: check exactly when isNewCut is true, and check whether we really need to the following each time it is true
			cCut = this;
			if(!canvasesAreNew)
				for(var i=0;i<ctxes.length;i++)
					ctxes[i].clearRect(0,0,canvS,canvS);
		}

		if(this && this != cCut)
			throw new Error("cluster-plot SlotsInvalidated with unexpected cut instance argument");

		console.time('si cluster');
		var imData32 = Array(ctxes.length);
		var imData = Array(ctxes.length);
		for(var i=0;i<ctxes.length;i++){
			imData[i] = ctxes[i].getImageData(0,0,canvS,canvS)
			imData32[i] = new Uint32Array(imData[i].data.buffer);		
		}
		
		for(var i=0;i<newlyInvalidatedSlots.length;i++)if(newlyInvalidatedSlots[i]){
			var s = cCut.GetImmutableSlot(i);
			
			if(!s || !s.inds || !s.inds.length)
				continue;
				
			var group = s.group_history.slice(-1)[0]; 
			var color = PALETTE_FLAG[group];
			var inds = s.inds;
		
			for(var c1=0,m=0;c1<chanList.length-1;c1++)for(var c2 =c1+1;c2<chanList.length;c2++,m++){
				var im = imData32[m];
				var c1_ = chanList[c1];
				var c2_ = chanList[c2];
				for(var k=0;k<inds.length;k++){
					var amp1 = amps[inds[k]*C + c1_];
					var amp2 =  amps[inds[k]*C + c2_];
					im[amp1*canvS + amp2] = color;
				}
			}
		}
		
		for(var i=0;i<ctxes.length;i++)
			ctxes[i].putImageData(imData[i], 0, 0);
		console.timeEnd('si cluster');
		canvasesAreNew = false;
	}

	var LoadTetrodeData = function(N_val,amps_in){
		$canvasParent.empty();
		ctxes = [];
		chanList = [];
		N = null;
		cCut = null;
		amps = null;
		ready = false;
		
		if(!N_val)	
			return;
				
		console.time('tet cluster');
		// get a reduced precision copy of the amplitudes 
		amps = M.clone(amps_in);
		var factor = 256/canvS; //256 is the maximum amplitude
		for(var i=0;i<amps.length;i++)
			amps[i] /= factor;
			
		N = N_val;
				
		// work out which channels have non-zero amplitude
		chanList = [];
		for(var c=0;c<C;c++){
			for(var i=0;i<N;i++)if(amps[C*i + c] > 0){ //TODO: maybe we could set a threshold slightly greater than zero
				chanList.push(c);
				break;
			}
		}

		for(var i=0;i<chanList.length-1;i++)
			for(var j =i+1;j<chanList.length;j++){
				var $newCanvas = $("<canvas width='" + canvS + "px' height='" + canvS + "px'/>");
				$canvasParent.append($newCanvas);
				ctxes.push($newCanvas.get(0).getContext('2d'));
			}
		console.timeEnd('tet cluster');
		canvasesAreNew = true;
		ready = true;
		
	}

	var FileStatusChanged = function(status,filetype){

		if(filetype == null && status.tet < 3)
				LoadTetrodeData(0);
		
		if(filetype == "tet"){
			T.ORG.GetTetAmplitudes(function(amps){
										LoadTetrodeData(ORG.GetN(),amps);
										if(status.cut == 3)
											ORG.GetCut().ForceChangeCallback(SlotsInvalidated);
									});
		}
	
	}

	ORG.AddCutChangeCallback(SlotsInvalidated);
	ORG.AddFileStatusCallback(FileStatusChanged);
	
	return {}; //there is nothing exported currently
	
} ($('#cluster_panel'),T.ORG);