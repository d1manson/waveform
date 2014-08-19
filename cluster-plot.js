"use strict"; 


T.CP = function($canvasParent,ORG,PALETTE_B,PALETTE_FLAG,modeChangeCallbacks){

	//TODO: it may be woth moving the plotting into a worker..could also do the painting and mouse-over-group detection in the worker.
    // for the painting it might be best to send the finished painted overlay to the worker for processing rather than trying to paint
    // manually or something in the worker.
    
	var cCut = null;
	var amps = null;
	var ctxes = [];
	var W = 50;
	var C = 4;
	var N = null;
	var chanList = [];
	var canvS = 128;
    var cssSize;
	var canvasesAreNew = null;
	var ready = false;
    var meanTMode = false;
    var meanTModeIsRendered = false;
    
	var SlotsInvalidated = function(newlyInvalidatedSlots,isNewCut){ //this = cut object

		if(!ready){
			console.warn('cluster-plot SlotsInvalidated without any voltage data.');
			return;
		}

		if(isNewCut || cCut == null){//TODO: check exactly when isNewCut is true, and check whether we really need to the following each time it is true
			cCut = this;
			if(!canvasesAreNew  && !meanTMode)
				for(var i=0;i<ctxes.length;i++)
					ctxes[i].clearRect(0,0,canvS,canvS);
		}
            
		if(this && this != cCut)
			throw new Error("cluster-plot SlotsInvalidated with unexpected cut instance argument");

        if(meanTMode && !meanTModeIsRendered){
            RenderAsMeanTime();
        }
        
		var renderSlotList = [];
		for(var i=0;i<newlyInvalidatedSlots.length;i++)if(newlyInvalidatedSlots[i])
			renderSlotList.push(cCut.GetImmutableSlot(i));

		RenderSlots(renderSlotList);

		canvasesAreNew = false;
	}
    var ClusterMaskToSpikeMask = function(clusterMask,plotInd,srcGroups){
        //This is for use by the painter tool.
        
        // this is a very lazy way of getting at c1 and c2 from plotInd
        outerLoop: for(var c1=0,m=0;c1<chanList.length-1;c1++)
            innerLoop: for(var c2 =c1+1;c2<chanList.length;c2++,m++)
                if(m == plotInd)
                    break outerLoop;
                
        var c1_ = chanList[c1];
        var c2_ = chanList[c2];

        
		var allMasks = []
		for(var g=0;g<srcGroups.length;g++){		
			var inds = cCut.GetGroup(srcGroups[g]); 
			var spikeMask = new Uint8Array(inds.length);
			for (var k=0;k<inds.length;k++){
				var amp1 = canvS - 1 - amps[inds[k]*C + c1_];
				var amp2 =  amps[inds[k]*C + c2_];
				spikeMask[k] = clusterMask[amp1*canvS + amp2]
			}
			allMasks.push(spikeMask);
        }
        return allMasks;

    }
    
    
	var RenderSlots = function(slots){
        
        if(meanTMode)
            return;
            
		console.time('si cluster');
		var imData32 = Array(ctxes.length);
		var imData = Array(ctxes.length);
		for(var i=0;i<ctxes.length;i++){
			imData[i] = ctxes[i].getImageData(0,0,canvS,canvS)
			imData32[i] = new Uint32Array(imData[i].data.buffer);		
		}

		while(slots.length){
			var s = slots.shift();

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
					var amp1 = canvS - 1 - amps[inds[k]*C + c1_];
					var amp2 =  amps[inds[k]*C + c2_];
					im[amp1*canvS + amp2] = color;
				}
			}
		}

		for(var i=0;i<ctxes.length;i++)
			ctxes[i].putImageData(imData[i], 0, 0);
        
        for(var c1=0,m=0;c1<chanList.length-1;c1++)for(var c2 =c1+1;c2<chanList.length;c2++,m++){
    			ctxes[m].textAlign = "left";
				ctxes[m].fillText((chanList[c1]+1) + "A" ,3,10);
				ctxes[m].textAlign = "right";
				ctxes[m].fillText((chanList[c2]+1) + "A",canvS-4,canvS- 2);
		}
        
		console.timeEnd('si cluster');
	}

	var ClusterPlot_MouseMove = function(e){
		if(meanTMode)
			return;
		
		var allCanvs = $(this).parent().find('canvas');
		for(var plotInd=0;plotInd<allCanvs.length;plotInd++)
			if(allCanvs[plotInd] == this)
				break;
		// this is a very lazy way of getting at c1 and c2 from plotInd
        outerLoop: for(var c1=0,m=0;c1<chanList.length-1;c1++)
            innerLoop: for(var c2 =c1+1;c2<chanList.length;c2++,m++)
                if(m == plotInd)
                    break outerLoop;
		
		var offset = $(this).offset();
		var x = e.clientX - offset.left;
		var y = e.clientY - offset.top; //TODO: plus some scroll top?
		var scale = this.width / $(this).width();
		x *= scale;
		y *= scale;
		
		var rgbaData = new Uint32Array(this.getContext('2d').getImageData(0,0,this.width,this.height).data.buffer);
		
		// get a histogram of the colors in a 4x4 square around the cursor
		var hist = {}
		var W = 8;
		for (var dx=-W;dx<=W;dx++)for(var dy=-W;dy<=W;dy++){
			if (x-dx < 0 || x+dx > canvS -1|| y-dy < 0 || y+dy > canvS-1)
				continue;
			var c = rgbaData[canvS*Math.round(y+dy) + Math.round(x+dx)];
			hist[c] = (hist[c] || 0) + 1;
		}
		
		//find the modal color
		var c = null;
		var n = 0;
		for (var c_k in hist) if (hist[c_k]>n && c_k != 0){
			n = hist[c_k];
			c = c_k;
		}
		
		//find the group corresponding to the modal colour
		for(var g=0;g<PALETTE_FLAG.length;g++)
			if(c == PALETTE_FLAG[g]) break;
			
		T.SetGroupOver(g);

	}
	
	var BringGroupToFront = function(group_num){
		var slot = cCut.GetGroup(group_num,true);
		RenderSlots([slot]);
	}

	var LoadTetrodeData = function(N_val,amps_in){
		$canvasParent.find('canvas').remove();
		ctxes = [];
		chanList = [];
		N = null;
		cCut = null;
		amps = null;
		ready = false;
        meanTModeIsRendered = false;
        
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
				var $newCanvas = $("<canvas class='cluster_canv' width='" + canvS + "px' height='" + canvS + "px'/>");
				$canvasParent.append($newCanvas);
				ctxes.push($newCanvas.get(0).getContext('2d'));
			}
		canvasesAreNew = true;
        console.timeEnd('tet cluster');
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

    var SetRenderMode = function(v,g){
        switch(v){
            case 2:
                meanTMode = true;
                break;
            default:
                meanTMode = false;
        }
        meanTModeIsRendered = false; //ie. if requested it needs to be rendered now
        SlotsInvalidated.call(null,M.repvec(1,cCut.GetNImmutables())); //invalidate all slots
    }

	var RenderAsMeanTime = function(){
		var times = ORG.GetTetTimes(); //these are in miliseconds
		var expLenInSeconds = parseInt(ORG.GetTetHeader().duration);

		var imData32 = Array(ctxes.length);
		var imData = Array(ctxes.length);
		for(var i=0;i<ctxes.length;i++){
			imData[i] = ctxes[i].getImageData(0,0,canvS,canvS)
			imData32[i] = new Uint32Array(imData[i].data.buffer);		
		}

		console.time('si cluster mean times');

		for(var c1=0,m=0;c1<chanList.length-1;c1++)for(var c2 =c1+1;c2<chanList.length;c2++,m++){
			var c1_ = chanList[c1];
			var c2_ = chanList[c2];

			//For each pixel in this cluster plot, calculate the mean time
			// i.e. accumulate tTotal and counts, and divide one by the other
			var tTotal = new Float32Array(canvS*canvS);
			var counts = new Float32Array(canvS*canvS);
			for(var k=0;k<N;k++){
				var amp1 = canvS - 1 -amps[k*C + c1_]; //TODO: this could probably be more efficient as we're using every index unlike in the other kind of rendering
				var amp2 = amps[k*C + c2_];
				counts[amp1*canvS + amp2]++;
				tTotal[amp1*canvS + amp2] += times[k];
			}

            //Smooth counts and tTotal
            var countsSmooth = M.smooth(counts,canvS,canvS);
            var tTotalSmooth = M.smooth(tTotal,canvS,canvS);
            
			//accumulaitons done, now do division
			M.rdivide(tTotalSmooth,countsSmooth,M.IN_PLACE); // this is: tTotalSmooth /= countsSmooth

			//calculating colormap lookup factor
			var factor = 256/1000/expLenInSeconds;

			var im = imData32[m];
			//apply colormap, leaving 0-alpha in pixels with no counts
			for(var i=0;i<tTotal.length;i++)
				im[i] = counts[i] ? PALETTE_B[Math.floor(tTotalSmooth[i] * factor)] : 0;

		}

		for(var i=0;i<ctxes.length;i++)
			ctxes[i].putImageData(imData[i], 0, 0);
         
        for(var c1=0,m=0;c1<chanList.length-1;c1++)for(var c2 =c1+1;c2<chanList.length;c2++,m++){
    			ctxes[m].textAlign = "left";
				ctxes[m].fillText((chanList[c1]+1) + "A",3,10);
				ctxes[m].textAlign = "right";
				ctxes[m].fillText((chanList[c2]+1) + "A",canvS-4,canvS- 2);
		}
        
        meanTModeIsRendered = true;
		console.timeEnd('si cluster mean times');

	}

    var $cssBlock = $("<style>.cluster_canv{width:" + canvS + "px; height:" + canvS + "px;}</style>").appendTo($('head'));
    cssSize = canvS;
    
    var SetSize = function(s){
        s = s< 64 ? 64 : s > 512 ? 512 : s;
        var $oldCss = $cssBlock; 
        $cssBlock = $("<style>.cluster_canv{width:" + s + "px;height:" + s + "px}</style>"); 
        $oldCss.replaceWith($cssBlock);
        cssSize = s;
    }
    
    var ClusterStickerMouseDown = function(e){
        var g = parseInt($(this).attr('data-group'));
        if(e.button == 2 || e.altKey)
            T.Tool.PainterSrc_Toggle(g);
        else
            T.Tool.SetPainterDestGroup(g);
    }

	ORG.AddCutChangeCallback(SlotsInvalidated);
	ORG.AddFileStatusCallback(FileStatusChanged);
	modeChangeCallbacks.push(SetRenderMode);
	
	T.$cluster_panel.on({"mousemove": ClusterPlot_MouseMove,
						  "mouseout": function(){T.SetGroupOver(-1)}
						},"canvas");
	T.$cluster_info.on({'mouseover': function(){T.SetGroupOver($(this).attr('data-group'));},
					    "mouseout" : function(){T.SetGroupOver(-1)},
						"mousedown" : ClusterStickerMouseDown
						},'.cluster-sticker');
	
	return {BringGroupToFront: BringGroupToFront,
			SetRenderMode: SetRenderMode,
            ClusterMaskToSpikeMask: ClusterMaskToSpikeMask,
            SetSize: SetSize,
            GetSize: function(){return cssSize;}}; 

} (T.$cluster_panel,T.ORG, T.PALETTE_TIME, new Uint32Array(T.PALETTE_FLAG.buffer),T.modeChangeCallbacks);