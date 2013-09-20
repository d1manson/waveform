"use strict";


//T.WV: uses webgl to render waveforms
T.WV = function(CanvasUpdateCallback, TILE_CANVAS_NUM){

//TODO: might consider adding in an indexed version of drawing if the number of waves to be redrawn is small enough compared to N
//this would hopefully be fairly easy, requiring code to generate the indicies, then upload them, and then use them.
//Adjustments would also need to be made to the UploadWaveBuffer to account for the fact that we are rendering specific groups only.

//TODO: might consider making use of sync objects (comming in webgl2.0), should make it possible to do async rendering (I think)

//TODO: supposedly we should have some code to deal with lost-context, I've not actually found it to be a problem though (possibly because it's offscreen anyway?)

	var offCanv = {$: {}, //jquery handle to the offscreen canvas
					//The following are all in units of actual shader pixels, for the offscreen canvas
				   W: 1024, // full width 
				   H: 1024, // full height
				   waveH: 128, //height of a wave
				   dT: 2, //distance from t to t+1 on the wave
				   waveW: (50-1)*2, //width of a wave (note that the *2 is *dT)
				   waveGap: 2 } //horizontal gap between waves

	var locs = {}; //caches webgl uniform/attribute locations
	var buffs = {}; //holds all the webgl buffers
	var gl = {}; //the webgl instance for the offscreen canvas (that's where all rendering is done)
	var prog = {}; //the webgl program

	var PALETTE_HOT_REGISTER_IND = 1;
	var PALETTE_FLAG_REGISTER_IND = 2;

	var ready = {gl: false,
				 voltage: false,
				 cut: false}; //set to true when each thing is initialised/ready
	// slotRenderState holds all the info we need during a render.  Info is kept for use with subsequent renders.
	// each slot has 0 or 1 canvases associated to it.  At any given time each canvas will display 0-4 channel's worth of data, all corresponding to the same generation of immutable and all rendered using the same colormap.
	// At any one time, different slots may have different channels rendered, and may be using different colormaps (colormap is consitent across channels within a slot).  
	// The desiredChannels and desiredColormaps record the desired render state that we are working towards for all slots where invalidatedSlots[i] is true.
	var blankSlotRenderState = { invalidatedSlots: null, 
							$canvases: [], //array of handles to the canvases corresponding to each slot. The canvases may move around/be deleted from the DOM but only this module will modify their image data.
							chanXOffset: [], // Array of 4-arrays, specifying the xOffset to each channel within the canvas, or NaN if it's not been rendered
							slotGeneration: [], //Records which generation of slot immutable was last rendered for each slot
							slotColMap: [], //records -1 if the hot colormap was last used and 0-n if a flag color was used
							nSlots: 0, 
							firstInd: 0,
							desiredChannels: [0,0,0,0], 
							desiredColormap: -1 //-1: hot, +1: flag
							}; 
	var slotRenderState = SimpleClone(blankSlotRenderState);

	var cRender = {alive: false}; //used for canceling the current render
	var cCut = null;//handle to the current cut instance (TODO: check if there are any potential bugs if we do stuff with this instance, when we are meant to be using a different instance)
	var N = 0; //number of spike

	var VERTEX_SHADER_STR = [
	"   attribute float isTPlusOne;																	  ", // 0 1 0 1 0 1 0 1 ... 1 
    "   attribute float voltage;                                                      				  ", // v_1(t) v_1(t+1) v_2(t) v_2(t+1) v_3(t) ... v_n(t+1)  values are on the interval [0 1]
	"   attribute vec2 waveXYOffset;																  ", // x_1 y_1  #  x_2 y_2  #  ... x_n y_n  #
	"   attribute float waveColorTex;																	  ", //  #   #  c_1  #   #  c_2 ...  #   #  c_n
	"   uniform mediump float tXOffset;																  ", // canavas x-coordiantes from the leftmost point of the wave to point t
    "   varying lowp vec4 vCol;                                                                  	  ",
    "   uniform sampler2D palette;                                                  	       		  ",
	"   const mediump float deltaTXOffset = " + offCanv.dT/offCanv.W*2 + ";							  ", // canvas x-coordinates from point t to point t+1
    "   const mediump float yFactor = " + 2/(offCanv.H/offCanv.waveH)  + ";							  ", //scales voltage values, initially expressed in [0 1], to lie with 128 pixels expressed in canvas coords [-1 +1]

    "   void main(void) {                                                                   		  ",	

			//apply the palette. The colormap index was computed in javascript and either represents group number or order within the group (each case uses a different palette).
    "       vCol = texture2D(palette,vec2(waveColorTex,0.));                           			 	  ", 

			//calculate the x coordiante in canvas coordinates
	"		gl_Position.x = waveXYOffset.x + (tXOffset + deltaTXOffset*isTPlusOne);					  ", //TODO: make sure both coordinates here are going to be in the right units

			//calculate the y coordiante in canvas coordinates
	"		gl_Position.y = waveXYOffset.y + voltage*yFactor;										  ", 

    "   }                                                                                 			  "
    ].join('\n');

	var PerformRenderForChannel = function(c){
	// This function bascially does the core work of the module. It looks fairly simple, but that's only because of all the other stuff done elsewhere to make this function possible.

		// clear the offscreen buffer
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); 

		for(var t=0;t<50-1;t++){
			// update x-offset for the new value of t
			gl.uniform1f(locs.tXOffset, offCanv.dT*t); 

			// bind the voltage buffer with data for (t,t+1)
			gl.bindBuffer(gl.ARRAY_BUFFER, bufs.voltage[c*(50-1) + t]);
    		gl.vertexAttribPointer(locs.voltage, 1, gl.BYTE, true, 1, 0); 

			// for each wave on this channel, render the line from t to t+1
			gl.drawArrays(gl.LINES, 0,2*N); 
		}
	}

	var UploadWaveBuffer = function(cutSlots){
		//cutSlots is an array of the immutable cutSlots, each of which has index data associated to it and a group number
		//given the values in offCanv, there is a limit to how many groups we can simultaneously render.  The calling 
		//function should be aware of this and not provide too many cutSlots.
		//This function produces a vector of the form x_1 y_1 c_1 x_2 y_2 c_2 ... x_n y_n c_n, where x_i and y_i specify the offset for
		//the given wave on the hidden rendering canvas, in canvas coordinates [-1 to +1], but using the units [-128 to +128]. c_i gives
		//the texture coordiantes within the palette for the given wave.

		var yIncrement = offCanv.waveH/offCanv.H * 2 * 128;
		var xIncrement = (offCanv.waveW+offCanv.waveGap)/offCanv.W * 2 * 128;

		//create a typed array buffer of length 3N, and get both a signed and an unsigned 8-bit view of it
		var buffInt8 = new Int8Array(N*3); 
		var buffUint8 = new Uint8Array(buffInt8);

        //set default x to be in the "right hand margin" of the offscreen canvas. We don't care what this area looks like, so
        //it's fine to render all the excess verticies here.
        for(var i=0;i<buffInt8.length;i+=3)
            buffInt8[i] = 128;

		//set x and y data for the desired waves
		for(var y=-128+yIncrement, s=0; y<=128 && s<cutSlots.length; y+=yIncrement)
			for(var x=-128; x<128 && s<cutSlots.length; x+=xIncrement, s++){
				var inds = cutSlots[s].inds;
				for(i=0;i<inds.length;i++){
					buffInt8[inds[i]*3 + 0] = x;
					buffInt8[inds[i]*3 + 1] = y;
				}
			}

		//set color map data for the desired waves
        if(slotRenderState.desiredColormap == -1){
            for(var s=0;s<cutSlots.length;s++){
                var inds = cutSlots[s].inds;
        			for(i=0;i<inds.length;i++)
    				    buffUint8[inds[i]*3 + 2] = i/(inds.length-1)*255; 
            }
        }else{
            for(var s=0;s<cutSlots.length;s++){
                var inds = cutSlots[s].inds;
                var val = cutSlots[s].groupHistory.slice(-1)[0]; //group number is the colormap index
            		for(i=0;i<inds.length;i++)
    				    buffUint8[inds[i]*3 + 2] = val;
            }            
        }

		// upload it to the wave buffer on the gpu
		gl.bindBuffer(gl.ARRAY_BUFFER, buffs.wave);
		gl.bufferData(gl.ARRAY_BUFFER, buffInt8, gl.DYNAMIC_DRAW); 

		// tell the gpu where to find the wave data
		gl.vertexAttribPointer(locs.waveXYOffset, 2, gl.BYTE, true, 3, 0); 
		gl.vertexAttribPointer(locs.waveColorTex, 2, gl.UNSIGNED_BYTE, true, 3, 0); 
	}

	var UploadVoltage = function(buffer){
        //Fills the array of 196 webgl array buffers with vectors 2n in length, and of the form: v_1(t) v_1(t+1) v_2(t) v_2(t+1) v_3(t) ... v_n(t+1)
		//For each of the 4 channels, t goes from 0 to 48, which is why we have 49*4 = 196 buffers.

		var N2 = 2*N;	
        var oldData = new Int8Array(buffer);
		var cBuffer = new Uint8Array(N2);

    	for(var c=0; c<4;c++){ //for each channel
			for(var t=0;t<50-1;t++){ //for each time point (except the last one)
				var p = (50+4)*c + 4 + t; //pointer to the t'th voltage sample on channel c for the first spike
				for(var i=0; i<N; i++){ //for each spike
					cBuffer[N2] = 127 - oldData[p]; //TODO: check that 127 - oldData gives us 0 to 255, with up the way we want.
					cBuffer[N2 +1] = 127 - oldData[p+1];
					p += (50+4)*4; //step through to the same point in the next spike
				}
				//upload the current buffer to the gpu.  
				gl.bindBuffer(gl.ARRAY_BUFFER, buffs.voltage[(50-1)*c + t]);
				gl.bufferData(gl.ARRAY_BUFFER,  cBuffer, gl.STATIC_DRAW); //It is more static than the waves buffer, but it does change when we switch tets.
			}
    	}

		//note that unlike in UploadWaveBuffer and UploadIsTPlusOne we cannot call vertexAttribPointer here.  Instead that happens inside a loop when we come to do the render.
    }

	var LoadTetrodeData = function(N_val, buffer){
		//TODO: if N is zero then we should clear everything (we have no tetrode data)

		ready.voltage = false;
		ready.cut = false;
		cRender.alive = false; //stop render if there is one occuring
		
		N = N_val;
        if(!ValidN(N)) return;

		UploadVoltage(buffer);
		UploadIsTPlusOne(); //only needs to know N
        ready.voltage = true;

		cCut = null;
		slotRenderState = SimpleClone(blankSlotRenderState);

		//Note we do not provide any cut data, so at this point we cannot render yet
	}

	var Init = function(){
		//This function is run on page load.  It does quite a bit of technical webgl stuff but nothing that depends on having actual data

		offCanv.$ = GetCanvas();

		// initialise gl context and program
    	gl =  ValidGL(offCanv.$.getContext("experimental-webgl"));
        gl = WebGLDebugUtils.makeDebugContext(gl, throwOnGLError, validateNoneOfTheArgsAreUndefined); //DEBUG ONLY

        prog = gl.createProgram();	
    	gl.attachShader(prog, GetShaderFromString(VERTEX_SHADER_STR, gl.VERTEX_SHADER));
    	gl.attachShader(prog, GetShaderFromString(FRAGMENT_SHADER_STR, gl.FRAGMENT_SHADER)); 
    	gl.linkProgram(prog)
        ValidProgram(prog);
    	gl.useProgram(prog);

		// fill locs with all the uniforms/attribute locations
		locs.waveXYOffset = gl.getAttribLocation(prog, "waveXYOffset");
		locs.isTPlusOne = gl.getAttribLocation(prog, "isTPlusOne");
		locs.waveColorTex = gl.getAttribLocation(prog, "waveColorTex");
		locs.voltage = gl.getAttribLocation(prog, "voltage");
		locs.tXOffset = gl.getUniformLocation(prog, "tXoffset");
		locs.palette = gl.getUniformLocation(prog, "palette");

		// call enableVertexAttribArray for the four attributes
		gl.enableVertexAttribArray(locs.waveXYOffset);
		gl.enableVertexAttribArray(locs.isTPlusOne);
		gl.enableVertexAttribArray(locs.waveColorTex);
		gl.enableVertexAttribArray(locs.voltage);

		// create all the neccessarry buffers (no space is actually allocated at this stage for data)
		buffs.wave = gl.createBuffer();
		buffs.voltage = Array((50-1)*4);
		for(var i=0;i<buffs.voltage.length;i++)
			buffs.voltage[i] = gl.createBuffer();
		buffs.isTPlusOne = gl.createBuffer();

		// upload both palettes to the gpu
        UploadPalette(PALETTE_HOT_REGISTER_IND,PALETTE_HOT); 
		UploadPalette(PALETTE_FLAG_REGISTER_IND,PALETTE_FLAG); 

		// turn off depth testing since we want to just render in order (negative z is still invisible)
    	gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND); //think this is off by default, but anyway we don't need it.

		// set the viewport on the offscreen canvas
        gl.viewport(0, 0, offCanv.W,offCanv.H);

		ready.gl = true;
	}

	var UploadIsTPlusOne = function(){
		// uploads an n-length vector to the gpu, the vector is of the form 0 1 0 1 ... 0 1

		//create the array
		var b = new Uint8Array(N);
		for(var i=1;i<N;i+=2)
			b[i] = 255;

		//upload to the gpu
		gl.bindBuffer(gl.ARRAY_BUFFER, buffs.isTPlusOne);
		gl.bufferData(gl.ARRAY_BUFFER, b, gl.STATIC_DRAW); 

		//tell the gpu that this is where to find the isTPlusOne data
		gl.vertexAttribPointer(locs.isTPlusOne, 1, gl.UNSIGNED_BYTE, true, 1, 0); 
	}

	var Render = function(hRender){
		// This function is pretty complicated.  To understand it, you need to remember that although the function has been called asynchronously, no 
		// other javascript executes until it completes ("javascript is single-threaded").  Most of the complications of asynchronisity are dealt with
		// by having a single slotRenderState object for this module which is only updated during calls to this function and the SlotsInvalidated function.
		// Also, note how here we request the most up-to-date slot info from the cut rather than caching it in the SlotsInvalidated function.
		// In terms of the single-threadedness, note that at the point we modifying the canvases in the slotsToRender array (and the associated other data)
		// we are guaranteed to reach the end of this function and thus we can be sure that we will trigger the CanvasUpdateCallback for that slot.  This is important,
		// because we need to be sure that all the info stored in the slotsToRender array relates not only to the canvas stored in the array, but also that this
		// canvas was actually attached in the appropriate place in the DOM (using the CanvasUpdateCallback function, without any oppurtunity for any slots to be modified 
		// during the rendering).

		if(!hRender.alive)
			return;
		var r = slotRenderState; 

		var chanIsToBeRendered = [0,0,0,0]; // We render only those channels that do not yet have (the correct) images, but this is not slot-specific. 
											// In other words, even if only one slot is missing a given channel, we still end up rendering that channel for all slots in the list.
		var slotsToRender = []; //slot objects which are chosen to be rendered on this particular run of the Render function

		for(var i=r.firstInd;i<r.nSlots;i++,r.firstInd++)if(r.invalidatedSlots[i]){ //for all slots that have been invalidated...

			if(false /*TODO: need to check if the slotsToRender array is full*/)
				break;  // because r.firstInd is incremented along with i, next time the Render function is called we will carry on from this iteration

			var s = cCut.GetImmutableSlot(i); //get the latest info on the slot

			if(!s || !s.inds || !s.inds.length){ //check if the slot is empty
				//TODO: it's probably redundant but may want to send a blank canvas in this case
				//TODO: may want to update some values in r's arrays, including losing the reference to the canvas 
				continue;
			}

			// if either of the following two tests are false we will need to force a render of all desired channels and add this slot to the render list
			var generationIsCorrect = r.slotGeneration[i] === s.generation;
			var colMapIsCorrect = (r.desiredColormap == -1 && r.slotColMap[i] == -1) || (r.desiredColormap == +1 && r.slotColMap[i] == cachedSlots[i].group_history.slice(-1)[0]);
			if(!generationIsCorrect || !colMapIsCorrect){
				M.useMask(chanIsToBeRendered,r.desiredChannels,1); //force render of all desired channels
				slotsToRender.push(s); //we need to render this slot
				//TODO: need to prepare a blank canvas and set the associated other properties
				continue;
			}

			// If we've got passed the above two if statements it means the slot contains actual data and the last-rendered generation and colormap are still valid.
			// So, here we only need to render channels we don't yet have.
			// TODO: if the existing canvas is not exactly correct we need to copy across the good bits to a new canvas and update all the relevant arrays in r
			var mustRenderThisSlot = 0;
			for(var c = 0;c<chanIsToBeRendered.length;c++)if(r.desiredChannels[i] && !isNum(r.chanXOffset[i][c])){ //if channel-c is desired and we haven't yet rendered it for this slot
				chanIsToBeRendered[c] = 1; // force render of at least this channel
				mustRenderThisSlot = 1; // we need to render this slot (see if statement below)
			}
			if(mustRenderThisSlot)
				slotsToRender.push(s);	
		}

		// setup the gpu for rendering these slots
		UploadWaveBuffer(slotsToRender); 

		// render each of the requested channels, copying all the new images to their individual canvases
		for(var c=0;c<chanIsToBeRendered.length;c++)if(chanIsToBeRendered[c]){
			PerformRenderForChannel(c);
			//TODO: copy any needed new images to their canvases and update the r arrays accordingly
		}

		// trigger a CanvasUpdateCallback for each of the rendered slots
		while(slotsToRender.length){
			var s = slotsToRender.pop();
			CanvasUpdateCallback(s.num, TILE_CANVAS_NUM, r.$canvases[s.num]);
			r.invalidatedSlots[s.num] = 0; // note that this could have been done at any point above (because, due to single-threadedness, no invalidation events can occur during execution of this function)
		}

		// If there are more slots to be rendered, we need to queue another execution of this function (asynchrously)
		if (r.firstInd < r.nSlots)
			window.setTimeout(function(){Render(cRender);},1);
	}

	var SlotsInvalidated = function(cut,newlyInvalidatedSlots,isNewCut){
		if(!ready.voltage)
			throw new Error('SlotsInvalidated without any voltage data.');
		
		if(cRender && cRender.alive)
			cRender.alive = false;  //kill the old render. In a way this is not necessary (due to the fact that rendering tries to use the most up to date information), but it is simpler.

		cRender = {alive: true}; //create a new render handle

		var r = slotRenderState;
		if(isNewCut || cCut == null){//TODO: check exactly when isNewCut is true, and check whether we really need to all of the following each time it is true
			cCut = cut;
			r.invalidatedSlots = M.clone(newlyInvalidatedSlots);
			r.nSlots = newlyInvalidatedSlots.length;
			r.chanXOffset = Array(r.nSlots);
			r.slotColMap = Array(r.nSlots);
			r.slotGeneration = Array(r.nSlots);
			r.$canvases = Array(r.nSlots);
		}else{
			M.or(r.invalidatedSlots,newlyInvalidatedSlots,M.IN_PLACE); //slotRenderState.invalidatedSlots |= newlyInvalidatedSlots
		}

		if(cut && cut != cCut)
			throw new Error("webgl-waveforms SlotsInvalidated with unexpected cut instance argument");

		slotRenderState.nextSlotInd = 0;
		window.setTimeout(function(){Render(cRender);},1);
	}
	
	var InvalidateAll = function(){
		SlotsInvalidated(null,M.repvec(1,slotRenderState.nSlots)); //invalidate all slots
	}
	
	var ShowChannels = function(newChanIsOn){
        //newChanIsOn is a vector of 4 logicals specifying which of the 4 channels to show
        if(slotRenderState.desiredChannels[0] == newChanIsOn[0] && 
		   slotRenderState.desiredChannels[1] == newChanIsOn[1] &&
           slotRenderState.desiredChannels[2] == newChanIsOn[2] &&
		   slotRenderState.desiredChannels[3] == newChanIsOn[3] )
			return; //nothing has changed

		slotRenderState.desiredChannels = newChanIsOn.slice(0);

		if(ready.voltage && ready.cut)
			InvalidateAll();
    }

	var SetPaletteMode = function(m){
		if(m == slotRenderState.desiredColormap)
			return; // we are already aiming to get this palette rendered (we may even have already finished rendering it)

		slotRenderState.desiredColormap = m;
        if(m == +1)
            gl.uniform1i(locs.palette, PALETTE_FLAG_REGISTER_IND); 
        else if (m == -1)
            gl.uniform1i(locs.palette, PALETTE_HOT_REGISTER_IND); 
		else
			throw new Error('palette mode can only be -1 or +1');

		if(ready.voltage && ready.cut)
			InvalidateAll();
    }

	// The rest of the functions are fairly boring...

	var FRAGMENT_SHADER_STR = [
    "   varying lowp vec4 vCol;                                                                		  ",     
    "   void main(void) {                                                                       	  ",
    "    gl_FragColor = vCol;                                                                 		  ",
    "  }                                                                                        	  "
    ].join('\n');

	var GetShaderFromString = function(str,type){
       var shader = gl.createShader(type);
       gl.shaderSource(shader, str);
       gl.compileShader(shader);
       return ValidShader(shader,str);
    }

    var GetCanvas = function(){
        var canvas =  $('<canvas/>', {heiGht: offCanv.W, widtH: offCanv.H});
    	canvas.css({position:"absolute",left:"400px",background:"#fff"}); $('body').append(canvas); // DEBUG ONLY
        return canvas.get(0);
    };

	 var PALETTE_HOT = function(){
        var data = new Uint8Array(new ArrayBuffer(256*4));
    	for(var i=0;i<256;i++)
    		data[i*4+3] = 255; //set alpha to opaque

        for(var i=0;i<100;i++)
            data[i*4] = i*255/100;
        for(var i=0;i<100;i++){
            data[(100+i)*4] = 255;
            data[(100+i)*4 + 1] = i*255/100;
        }
        for(var i=0;i<56;i++){
            data[(200+i)*4] = 255;
            data[(200+i)*4 + 1] = 255;
            data[(200+i)*4 + 2] = i*255/100; // we never add all the blue 
        }    
        return data;
    }();

    var PALETTE_FLAG = function(){
        var data = new Uint8Array(new ArrayBuffer(256*4));
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
        return data;
    }();

    var UploadPalette = function(registerInd,data){
    	gl.activeTexture(gl.TEXTURE0 + registerInd);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }

	 var ValidN = function(test_N){
        if (test_N>256*256*4){
            error_callback("This only works when there are fewer than " + 256*256*4 +"spikes, but here there are " + test_N);
            return null;
        }
        return N;
    }

    var ValidGL = function(test_gl){
        if(!test_gl){
    		error_callback('Failed to initialise WebGL context.');
    		return null;
    	}else
    		return test_gl;
    }

    var ValidShader = function(shader,str){
       if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) == 0){
          error_callback("Shader failed to compile:\n" + gl.getShaderInfoLog(shader) + "\n\n" + AddLineNumbers(str));
    	  return null;
    	}
    	return shader;
    }

    var ValidProgram = function(test_prog){
       gl.validateProgram(test_prog);
       if (!gl.getProgramParameter(test_prog, gl.VALIDATE_STATUS)){
           error_callback("Error during program validation:\n" + gl.getProgramInfoLog(test_prog));
           return null;
       }
       return test_prog;
    }

    var AddLineNumbers = function(str){
    	str = str.split("\n");
    	var newStr = [];
    	var L = str.length;
    	for(var i=0;i<L;i++){
    		newStr.push((i+1) + ".\t");
    		newStr.push(str.shift());
    		newStr.push("\n");
    	}
    	return newStr.join('');
    }

    var IsReady = function(){
        return SimpleClone(ready); //TODO: change main.js to use the new version of ready that is an object with multiple properties
    }

    var error_callback = function(s){console.log(s)};
    var success_callback = function(s){console.log(s);};
	
	Init(); //initialises all the webgl stuff without actually doing any data-specific stuff

	return {LoadTetrodeData: LoadTetrodeData,
			SlotsInvalidated: SlotsInvalidated,
			SetPaletteMode: SetPaletteMode,
			ShowChannels: ShowChannels,
			IsReady: IsReady
			};

}(T.CutSlotCanvasUpdate,0);

