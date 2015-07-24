"use strict";


//T.WV: uses webgl to render waveforms
T.WV = function(CanvasUpdateCallback, TILE_CANVAS_NUM, ORG,PALETTE_FLAG){

//TODO: might consider adding in an indexed version of drawing if the number of waves to be redrawn is small enough compared to N
//this would hopefully be fairly easy, requiring code to generate the indicies, then upload them, and then use them.
//Adjustments would also need to be made to the UploadWaveBuffer to account for the fact that we are rendering specific groups only.

//TODO: might consider making use of sync objects (comming in webgl2.0), should make it possible to do async rendering (I think)

//TODO: supposedly we should have some code to deal with lost-context, I've not actually found it to be a problem though (possibly because it's offscreen anyway?)

//TODO: tidy up all the new code for drawing densities, making it toggle-able. Also probably want to make the denominator a uniform equal to N rather than a fixed constant
// (although there may be a limit to it given the available precision...10 bit mantissa for half float is 1024, but 23 bits for full float is plenty).
//Since there are 4 chans in a tetrode and 4 colors in RGBA, it might be worth rendering each channel to its own color and then copying/applying the colormap for each individually.
//The benfit being that there are then a quarter of the number of program switches required - not sure how important that is.
//Also, in terms of colormaps, may want to think about calculating the derivate (probably juse the v-dimensional derivates). Could use r for 0th, g for 1st, b for 2nd derivatives.
// - or maybe have red-shift, blue shift for positive-negative derivative, and use white-black for raw value.
//Also, need to have a group color indicator in the tile when no rendering with group colors.

//TODO: implement a drift colormap that's similar to count but gives mean time rather than just count

	// Create an object to hold basic info about the offscreen canvas
	var offCanv = function(){ 
		var c = { //The following are all in units of actual pixels
				   W: 512, // full width 
				   H: 512, // full height
				   waveH: 256, //height of a wave
				   dT: 2, //distance from t to t+1 on the wave
				   waveGap: 2//horizontal gap between waves
				   }

		c.waveW = (50-1)*c.dT; //width of a wave

		// use the above to compute the x and y offsets of the spaces for waves on the offscreen canvas
		var nSpaces = Math.floor(c.H/c.waveH) * Math.floor(c.W/c.waveW);
		c.xOffsets = new Uint16Array(nSpaces);
		c.yOffsets = new Uint16Array(nSpaces);
		var i = 0;
		for(var y= c.waveH; y<=c.H; y+= c.waveH)for(var x = 0;x+c.waveW<c.W;x+= c.waveW+c.waveGap,i++){
				c.xOffsets[i] = x;
				c.yOffsets[i] = y;
		}

		// convert the x and y offsets from pixel units to units normalised to the range -128 to 128
		c.xOffsetsInt8 = new Int8Array(nSpaces);
		c.yOffsetsInt8 = new Int8Array(nSpaces);
		for(i=0;i<nSpaces;i++){
			c.xOffsetsInt8[i] = c.xOffsets[i]/c.W * 255 - 128;
			c.yOffsetsInt8[i] = 127 - c.yOffsets[i]/c.H * 255 ;
		}

		// in addition to all the coordinate stuff we also need to actually create the canvas and store a reference to it
		c.el = document.createElement('canvas');
		c.el.width = c.W;
		c.el.height = c.H;
		c.el.style.imageRendering = 'pixelated';
    	//$(c.el).css({position:"absolute",left:"800px",background:"#fff"}); $('body').append(canvas); // DEBUG ONLY
 
		return c;
	}();	
    
    var HEIGHT_SCALE = 0.5;
	var locs = {}; //caches webgl uniform/attribute locations
	var buffs = {}; //holds all the webgl buffers
	var gl = {}; //the webgl instance for the offscreen canvas (that's where all rendering is done)
	var prog = {}; //the webgl program
	var copyProg = {}; //the webgl program used when in count-mode for rendering
	var PALETTE_FLAG_REGISTER_IND = 2;
	var FLOAT_TEXTURE_REGISTER_IND = 0; //this may need to be fixed at 0, not sure
	var canDoComplexRender = undefined; //will be set to true or false during Init()
	
	var ready = {gl: false,
				 voltage: false,
				 cut: false}; //set to true when each thing is initialised/ready
	// slotRenderState holds all the info we need during a render.  Info is kept for use with subsequent renders.
	// each slot has 0 or 1 canvases associated to it.  At any given time each canvas will display 0-4 channel's worth of data, all corresponding to the same generation of immutable and all rendered using the same colormap.
	// At any one time, different slots may have different channels rendered, and may be using different colormaps (colormap is consitent across channels within a slot).  
	// The desiredChannels and desiredColormaps record the desired render state that we are working towards for all slots where invalidatedSlots[i] is true.
	var blankSlotRenderState = { invalidatedSlots: null, 
							el_canvases: [], //NO LONGER jQUERY. array of handles to the canvases corresponding to each slot. The canvases may move around/be deleted from the DOM but only this module will modify their image data.
							chanXOffset: [], // Array of 4-arrays, specifying the xOffset to each channel within the canvas, or NaN if it's not been rendered
							slotGeneration: [], //Records which generation of slot immutable was last rendered for each slot
							slotColMap: [], //records -1 if the count colormap was last used and 0-n if a flag color was used, and -2 if the count colormap was used
							nSlots: 0, 
							firstInd: 0,	
							desiredChannels: [0,0,0,0], 
							desiredColormap: 0 //+1: flag, -1: count
							}; 
	var slotRenderState = SimpleClone(blankSlotRenderState);

	var cRender = {alive: false}; //used for canceling the current render
	var cCut = null;//handle to the current cut instance (TODO: check if there are any potential bugs if we do stuff with this instance, when we are meant to be using a different instance)
	var N = 0; //number of spike

	var VERTEX_SHADER_STR = [
	"   attribute float isTPlusOne;																	  ", // 0 1 0 1 0 1 0 1 ... 1 
    "   attribute float voltage;                                                      				  ", // v_1(t) v_1(t+1) v_2(t) v_2(t+1) v_3(t) ... v_n(t+1)  values are on the interval [0 1]
	"   attribute vec2 waveXYOffset;																  ", // x_1 y_1  #  x_1 y_1  #  x_2 y_2  #  x_2 y_2  #  ... x_n y_n  #  x_n y_n  #
	"   attribute float waveColorTex;																  ", //  #   #  c_1  #   #  c_1  #   #  c_2  #   #  c_2 ...  #   #  c_n  #   #  c_n
	"   uniform mediump float tXOffset;																  ", // canavas x-coordiantes from the leftmost point of the wave to point t
	"	uniform bool countMode;																	      ",
	"	uniform highp vec4 countModeColor;																  ",
    "   varying lowp vec4 vCol;                                                                  	  ",
    "   uniform sampler2D palette;                                                  	       		  ",
	"   const mediump float deltaTXOffset = " + (offCanv.dT/offCanv.W*2).toPrecision(3) + ";		  ", // canvas x-coordinates from point t to point t+1
    "   const mediump float yFactor = " + (2/(offCanv.H/offCanv.waveH)).toPrecision(3) + ";			  ", //scales voltage values, initially expressed in [0 1], to lie with 128 pixels expressed in canvas coords [-1 +1]

    "   void main(void) {                                                                   		  ",	

    "       vCol = countMode ? 																		  ",
			// when countMode is true the blend mode will be ADD and we just render a tiny increment to each pixel
	"				countModeColor :																		  ",
			//apply the palette. The colormap index was computed in javascript and either represents group number or order within the group (each case uses a different palette).
	"				texture2D(palette,vec2(waveColorTex,0.));                           			  ", 

			//calculate the x coordiante in canvas coordinates
	"		gl_Position.x = waveXYOffset.x + (tXOffset + deltaTXOffset*isTPlusOne);					  ",

			//calculate the y coordiante in canvas coordinates
	"		gl_Position.y = waveXYOffset.y + voltage*yFactor;										  ", 

			//best to set the fourth element to 1
	"		gl_Position[3] = 1.;																	  ", 
    "   }                                                                                 			  "
    ].join('\n');

	var PerformRenderForChannel = function(c){
	// This function bascially does the core work of the module. It looks fairly simple, but that's only because of all the other stuff done elsewhere to make this function possible.

		// clear the offscreen buffer
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); 

		for(var t=0;t<50-1;t++){
			// update x-offset for the new value of t
			gl.uniform1f(locs.tXOffset,offCanv.dT*t/offCanv.W*2); 

			// bind the voltage buffer with data for (t,t+1)
			gl.bindBuffer(gl.ARRAY_BUFFER, buffs.voltage[c*(50-1) + t]);
    		gl.vertexAttribPointer(locs.voltage, 1, gl.UNSIGNED_BYTE, true, 1, 0); 

			// for each wave on this channel, render the line from t to t+1
			gl.drawArrays(gl.LINES, 0,2*N); 
		}
	}

	var UploadWaveBuffer = function(cutSlots){
		//cutSlots is an array of the immutable cutSlots, each of which has index data associated to it and a group number
		//given the values in offCanv, there is a limit to how many groups we can simultaneously render.  The calling 
		//function should be aware of this and not provide too many cutSlots.
		//This function produces a vector of the form x_1 y_1 c_1 x_1 y_1 c_1  x_2 y_2 c_2 x_2 y_2 c_2 ... x_n y_n c_n x_n y_n c_n, where x_i and y_i specify the offset for
		//the given wave on the hidden rendering canvas, in canvas coordinates [-1 to +1], but using the units [-128 to +128]. c_i gives
		//the texture coordiantes within the palette for the given wave.  Note that each sets of values is repeated.

		//create a typed array buffer of length 6N, and get both a signed and an unsigned 8-bit view of it
		var buffInt8 = new Int8Array(N*3*2); 
		var buffUint8 = new Uint8ClampedArray(buffInt8.buffer);

        //set default x to be in the "right hand margin" of the offscreen canvas. We don't care what this area looks like, so
        //it's fine to render all the excess verticies here.
        for(var i=0;i<buffInt8.length;i+=3)
            buffInt8[i] = 127;

		//set x and y data for the desired waves
		for(var s=0; s<offCanv.xOffsets.length && s<cutSlots.length; s++){
			var inds = cutSlots[s].inds;
			var x = offCanv.xOffsetsInt8[s];
			var y = offCanv.yOffsetsInt8[s];
			for(i=0;i<inds.length;i++){
				buffInt8[inds[i]*6 + 0] = x;
				buffInt8[inds[i]*6 + 1] = y;
				buffInt8[inds[i]*6 + 3] = x;
				buffInt8[inds[i]*6 + 4] = y;
				}
		}

		//set color map data for the desired waves
        if(slotRenderState.desiredColormap == 1){
            for(var s=0;s<cutSlots.length;s++){
                var inds = cutSlots[s].inds;
                var val = cutSlots[s].group_history.slice(-1)[0]; //group number is the colormap index
				for(i=0;i<inds.length;i++){
					buffUint8[inds[i]*6 + 2] = val;
					buffUint8[inds[i]*6 + 5] = val;
				}
            }            
        }

		// upload it to the wave buffer on the gpu
		gl.bindBuffer(gl.ARRAY_BUFFER, buffs.wave);
		gl.bufferData(gl.ARRAY_BUFFER, buffInt8, gl.DYNAMIC_DRAW); 

		// tell the gpu where to find the wave data
		gl.vertexAttribPointer(locs.waveXYOffset, 2, gl.BYTE, true, 3, 0); 
		gl.vertexAttribPointer(locs.waveColorTex, 1, gl.UNSIGNED_BYTE, true, 3, 2); 
	}

	var Int8ToUint8 = function(A){
		// Takes an int8array, A, adds 128 to each element and views it as a uint8 array.
		// this is done inplace.
		// See http://en.wikipedia.org/wiki/Signed_number_representations for info.
		// We are ORing each byte with 128, which in hex is 0x80...here we do it with 4 bytes at a time.
		A = new Uint32Array(A.buffer); 
		for(var i=0;i<A.length;i++)
			A[i] ^= 0x80808080;
		return new Uint8Array(A.buffer);
	}
	
	var BuildVoltageDataBuffers_sub = function(oldData,newData,N){
		// This is "version 2" of this code, we now read from oldData continguously,
		// and write out in strides, whereas previously we wrote out contiguously 
		// and read in strides.  This is roughly 4x faster, but still seems slower 
		// than it ought to be.  ~80ms for 80k spikes, i.e. only 1k spikes per ms for large N.
		// Note that what we are doing is similar to a transpose in terms of memory movement.
        // TODO: can hopefully speed up by having two 16bit views on the oldDara, offset by 1 byte
        // and view the new data also as 16bit...need two views on oldData for odd and even t.
        // then one final t-iteration outside t loop. Not sure whether to use two views of newData,
        // offset by 2N-bytes or whether to just keep the same number of (explicit) adds as we 
        //currently have. ...seems this may not be possible without slicing the oldData in order to
        //start an int16array offset byt 1 byte.
		var q = -1;
		var N2 = 2*N;
		for(var i=0;i<N;i++){ //for each spike
			var p = 2*i;
			for(var c=0;c<4;c++){ //for each channel
				q += 5;
				for(var t=0;t<50-1;t++){ //for each time point (except the last one)
					newData[p ] = oldData[q];
					newData[p | 1] = oldData[++q]; // p is an even number, so p|1 is p+1
					p += N2;
				}
			}
		}
	}
	
	var BuildVoltageDataBuffers = function(buffer,N){
		// see UploadVoltage
		var oldData = new Int8Array(buffer);
		var newData = new Int8Array(4*(50-1)*N*2); //times 2 because each line has two ends
		
		BuildVoltageDataBuffers_sub(oldData,newData,N);
		newData = Int8ToUint8(newData);
			
		var allBuffers = [];
		for(var c=0; c<4;c++){ //for each channel
			for(var t=0;t<50-1;t++){ //for each time point (except the last one)
				var start = ((50-1)*c + t)*2*N;
				allBuffers.push(newData.subarray(start,start+2*N));
			}
		}
		
		return allBuffers;
	}
	
	var UploadVoltage = function(buffer){
        //Fills the array of 196 webgl array buffers with vectors 2n in length, and of the form: v_1(t) v_1(t+1) v_2(t) v_2(t+1) v_3(t) ... v_n(t+1)
		//For each of the 4 channels, t goes from 0 to 48, which is why we have 49*4 = 196 buffers.

		var preparedData = BuildVoltageDataBuffers(buffer,N);
		
    	for(var c=0; c<4;c++){ //for each channel
			for(var t=0;t<50-1;t++){ //for each time point (except the last one)
				//upload the current buffer to the gpu.  
				gl.bindBuffer(gl.ARRAY_BUFFER, buffs.voltage[(50-1)*c + t]);
				gl.bufferData(gl.ARRAY_BUFFER,  preparedData[(50-1)*c+t], gl.STATIC_DRAW); //It is more static than the waves buffer, but it does change when we switch tets.
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
		SetCountModeColor(); //needs to know N (is only actually used when colormap is count mode)
        ready.voltage = true;

		//Clear all the data that is obviously now out of date (we may not need to do this but it makes life easier)
		cCut = null;
		var oldSlotRenderState = slotRenderState;
		slotRenderState = SimpleClone(blankSlotRenderState);
		slotRenderState.desiredChannels = oldSlotRenderState.desiredChannels; //we didn't want to clear this ..
		slotRenderState.desiredColormap = oldSlotRenderState.desiredColormap; //..or this.

		//Note we do not provide any cut data, so at this point we cannot render yet
	}

	var Init = function(){
		//This function is run on page load.  It does quite a bit of technical webgl stuff but nothing that depends on having actual data

		// initialise gl context and program
    	gl =  ValidGL(offCanv.el.getContext("experimental-webgl"));
       // gl = WebGLDebugUtils.makeDebugContext(gl, throwOnGLError, validateNoneOfTheArgsAreUndefined); //DEBUG ONLY

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
		locs.tXOffset = gl.getUniformLocation(prog, "tXOffset");
		locs.palette = gl.getUniformLocation(prog, "palette");
		locs.countMode = gl.getUniformLocation(prog, "countMode");
		locs.countModeColor = gl.getUniformLocation(prog, "countModeColor");

		// create all the neccessarry buffers (no space is actually allocated at this stage for data)
		buffs.wave = gl.createBuffer();
		buffs.voltage = Array((50-1)*4);
		for(var i=0;i<buffs.voltage.length;i++)
			buffs.voltage[i] = gl.createBuffer();
		buffs.isTPlusOne = gl.createBuffer();

		// upload both palettes to the gpu
		UploadPalette(PALETTE_FLAG_REGISTER_IND,PALETTE_FLAG); 

        gl.uniform1i(locs.palette, PALETTE_FLAG_REGISTER_IND); 

		// turn off depth testing since we want to just render in order (negative z is still invisible)
    	gl.disable(gl.DEPTH_TEST);

		// prepare the special floating point render taret for colormap-count-mode
		canDoComplexRender = InitCopyProg();
  
		slotRenderState.desiredColormap = 0; 
		SwitchToMainProg(); //we call this now and then mid-rendering if we are using the colormap-count-mode
		ready.gl = true;
	}
	
	var InitCopyProg = function(withDiffs){
		var COPY_VERTEX_SHADER_STR = "attribute vec2 a_texCoord;varying vec2 v_texCoord;attribute vec2 a_position;const vec2 u_resolution = vec2(" + offCanv.W + ".0," + offCanv.H + ".0);void main() {" + 
								"vec2 zeroToOne = a_position / u_resolution;vec2 zeroToTwo = zeroToOne * 2.0;vec2 clipSpace = zeroToTwo - 1.0;gl_Position = vec4(clipSpace, 0, 1);v_texCoord = a_texCoord;}"
		var COPY_FRAGMENT_SHADER_STR ="precision mediump float;uniform sampler2D u_src;varying vec2 v_texCoord; void main() {" + 
			"highp vec4 src = texture2D(u_src, v_texCoord);" + 
			"highp float counts = sqrt(src.r);" + 
			"gl_FragColor = vec4(counts > 0.5 ? counts > 0.75 ? 4. - 4.*counts : 4.*counts-2. : counts > 0.25 ? 2. - 4.*counts : counts*4.," + 
								"counts < 0.5 ? 2.*counts : 2.-2.*counts," + 
								"counts,src.a);" + 
			"}";
		
		if(withDiffs){
			COPY_FRAGMENT_SHADER_STR ="precision mediump float;uniform sampler2D u_src;varying vec2 v_texCoord; uniform highp float oneTex; void main() {" + 
				"highp vec4 src_p1v = texture2D(u_src, vec2(v_texCoord[0],v_texCoord[1] + oneTex));" + 
				"highp vec4 src_m1v = texture2D(u_src, vec2(v_texCoord[0],v_texCoord[1] - oneTex));" + 
				"highp float dc_dV= src_p1v.r-src_m1v.r;" + 
				"highp vec4 src_p1t = texture2D(u_src, vec2(v_texCoord[0]+ oneTex,v_texCoord[1]));" + 
				"highp vec4 src_m1t = texture2D(u_src, vec2(v_texCoord[0] - oneTex,v_texCoord[1]));" + 
				"highp float dc_dt= src_p1t.r	-src_m1t.r;" + 
				"highp vec4 src = texture2D(u_src, v_texCoord);" + 
				"highp float counts = src.r;" + 
				"gl_FragColor = src.a > 0.? vec4(dc_dt/counts + 0.5,0.,dc_dV/counts + 0.5,1.) : vec4(0.,0.,0.,0.);" + 
				"}";
		}
		if(withDiffs == 2){
			COPY_FRAGMENT_SHADER_STR ="precision mediump float;uniform sampler2D u_src;varying vec2 v_texCoord; uniform highp float oneTex; void main() {" + 
				"highp vec4 src = texture2D(u_src, v_texCoord);" +
				"highp float src_ = src.r;" +
				"highp float src_p1v = texture2D(u_src, vec2(v_texCoord[0],v_texCoord[1] + oneTex)).r;" + 
				"highp float src_m1v = texture2D(u_src, vec2(v_texCoord[0],v_texCoord[1] - oneTex)).r;" + 
				"highp float src_p2v = texture2D(u_src, vec2(v_texCoord[0],v_texCoord[1] + 2.*oneTex)).r;" + 
				"highp float src_m2v = texture2D(u_src, vec2(v_texCoord[0],v_texCoord[1] - 2.*oneTex)).r;" + 
				"highp float gV= src_/(src_p1v-src_m1v)*((src_p2v-src_)/src_p1v -(src_-src_m2v)/src_m1v);" + 
				"highp vec4 src_p1t = texture2D(u_src, vec2(v_texCoord[0]+ oneTex,v_texCoord[1]));" + 
				"highp vec4 src_m1t = texture2D(u_src, vec2(v_texCoord[0] - oneTex,v_texCoord[1]));" + 
				"highp float dc_dt= src_p1t.r	-src_m1t.r;" + 
				"highp float counts = src.r;" + 
				"gl_FragColor = src.a > 0.? vec4(" /*dc_dt/counts + */ + "0.5,0.,gV + 0.5,1.) : vec4(0.,0.,0.,0.);" + 
				"}";
		}
		
		var OES_texture_float = gl.getExtension('OES_texture_float');
		if (!OES_texture_float) {
			console.log("No support for OES_texture_float");
			return false;
		}
		
		var texture = offCanv.offTexture || gl.createTexture();
		gl.activeTexture(gl.TEXTURE0 + FLOAT_TEXTURE_REGISTER_IND);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, offCanv.W, offCanv.H, 0, gl.RGBA,  gl.FLOAT, null);
		var fbo = offCanv.offFBO || gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + FLOAT_TEXTURE_REGISTER_IND, gl.TEXTURE_2D, texture, 0);
		if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
			console.log("gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE");
			return false;
		}
		offCanv.offTexture = texture;
		offCanv.offFBO = fbo;
		copyProg = gl.createProgram();	

		gl.attachShader(copyProg , GetShaderFromString(COPY_VERTEX_SHADER_STR, gl.VERTEX_SHADER));
    	gl.attachShader(copyProg , GetShaderFromString(COPY_FRAGMENT_SHADER_STR, gl.FRAGMENT_SHADER));
     	gl.linkProgram(copyProg)
        ValidProgram(copyProg);

		//prepare data for copy program
		locs.copy_a_position = gl.getAttribLocation(copyProg, "a_position");
		locs.copy_a_texCoord = gl.getAttribLocation(copyProg, "a_texCoord");
		locs.copy_u_src =  gl.getUniformLocation(copyProg, "u_src");
		locs.copy_oneTex = gl.getUniformLocation(copyProg, "oneTex");
		buffs.copy_a_position = gl.createBuffer();
		buffs.copy_a_texCoord = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER,buffs.copy_a_position);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0,offCanv.W, 0,0, offCanv.H,0,offCanv.H,offCanv.W, 0,offCanv.W, offCanv.H]), gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffs.copy_a_texCoord);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0.0,  0.0,1.0,  0.0,0.0,  1.0,0.0,  1.0,1.0,  0.0,1.0,  1.0]), gl.STATIC_DRAW);
		
		return true;
	}
	
	var SwitchToMainProg = function(){
		gl.useProgram(prog); //ahh, but it's not that simple...(not entirely sure how much of this has to be done each time you switch)
		
		// Enable the arrays (see below for addressing them)
		gl.enableVertexAttribArray(locs.waveXYOffset);
		gl.enableVertexAttribArray(locs.isTPlusOne);
		gl.enableVertexAttribArray(locs.waveColorTex);
		gl.enableVertexAttribArray(locs.voltage);
	
		// Address the isTPlusOne buffer (the voltage and wave buffers are always addressed as part of rendering)
		gl.bindBuffer(gl.ARRAY_BUFFER, buffs.isTPlusOne);
		gl.vertexAttribPointer(locs.isTPlusOne, 1, gl.UNSIGNED_BYTE, true, 1, 0); 

		// set uniform values and blend mode and render target
		SetPaletteMode(slotRenderState.desiredColormap,true);

		// set the viewport
        gl.viewport(0, 0, offCanv.W,offCanv.H);
	}


	var UploadIsTPlusOne = function(){
		// uploads an n-length vector to the gpu, the vector is of the form 0 1 0 1 ... 0 1

		//create the array
		var b = new Uint8Array(N*2);
		for(var i=1;i<b.length;i+=2)
			b[i] = 255;

		//upload to the gpu
		gl.bindBuffer(gl.ARRAY_BUFFER, buffs.isTPlusOne);
		gl.bufferData(gl.ARRAY_BUFFER, b, gl.STATIC_DRAW); 

		//tell the gpu that this is where to find the isTPlusOne data
		gl.vertexAttribPointer(locs.isTPlusOne, 1, gl.UNSIGNED_BYTE, true, 1, 0); 
	}

	var SetCountModeColor = function(){
		gl.uniform4fv(locs.countModeColor, [1/N*10,0,0,1]);
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
		var slotsCopyPasted = []; //slot objects which didn't need to be re-rendered, but still have a new canvas consisting of sections copied and pasted from the old canvas
		var canvasContexts = []; //elements in this array correspond to the slots.  Gives the 2d contexts to each of the canvases on which we are to render or copy/paste.
		var nDesiredChannels = M.sum(r.desiredChannels);

		// given the desiredChannels, work out what the x offsets should be for each channel in each rendered group (we may not need this till after the main loop below)
		var xOff = Array(r.desiredChannels.length + 1);
		xOff[0] = 0;
		for(var c=0;c<r.desiredChannels.length;c++)
			xOff[c+1] = xOff[c] + (r.desiredChannels[c]? offCanv.waveW : 0);
			
		for(var i=r.firstInd;i<r.nSlots;i++,r.firstInd++)if(r.invalidatedSlots[i]){ //for all slots that have been invalidated...

			if(slotsToRender.length == offCanv.xOffsets.length)
				break;  // because r.firstInd is incremented along with i, next time the Render function is called we will carry on from this iteration

			var s = cCut.GetImmutableSlot(i); //get the latest info on the slot

			if(!s || !s.inds || !s.inds.length){ //check if the slot is empty
				r.el_canvases[i] = null; //loose the reference to the old canvas, and update the associated properties to reflect this...
				r.slotGeneration[i] = NaN;
				r.slotColMap[i] = NaN;
				r.chanXOffset[i] = [NaN,NaN,NaN,NaN];
				CanvasUpdateCallback(i,TILE_CANVAS_NUM,null); //sending null tells main to remove any existing canvas
				continue;
			}

			// if either of the following two tests are false we will need to force a render of all desired channels and add this slot to the render list
			var generationIsCorrect = r.slotGeneration[i] === s.generation;
			var colMapIsCorrect = (r.desiredColormap < 0 && r.slotColMap[i] == r.desiredColormap) || (r.desiredColormap == +1 && r.slotColMap[i] == s.group_history.slice(-1)[0]);
			if(!generationIsCorrect || !colMapIsCorrect){
				M.useMask(chanIsToBeRendered,r.desiredChannels,1); //force render of all desired channels
				slotsToRender.push(s); //we need to render this slot
				// create a new canvas of the right size and update all associated properties to reflect the fact the canvas is empty...
				var canv = document.createElement('canvas');
				canv.width = offCanv.waveW*nDesiredChannels;
				canv.height = offCanv.waveH;
				r.el_canvases[i] = canv;
				canvasContexts[i] = canv.getContext('2d'); //we're going to need the 2d context for copying image data from the offscreen canvas
				r.slotGeneration[i] = NaN;
				r.slotColMap[i] = NaN;
				r.chanXOffset[i] = [NaN,NaN,NaN,NaN];
				continue;
			}

			// If we've got passed the above two if statements it means the slot contains actual data and the last-rendered generation and colormap are still valid.
			// So, here we only need to render channels we don't yet have.
			var mustRenderThisSlot = 0;
			for(var c = 0;c<chanIsToBeRendered.length;c++)if(r.desiredChannels[c] && !isNum(r.chanXOffset[i][c])){ //if channel-c is desired and we haven't yet rendered it for this slot
				chanIsToBeRendered[c] = 1; // force render of at least this channel
				mustRenderThisSlot = 1; // we need to render this slot (see if statement below)
			}
			if(mustRenderThisSlot)
				slotsToRender.push(s);	
			else
				slotsCopyPasted.push(s);
				
			// Whether or not we need to render this slot we still need to create a new canvas and copy across any desired channels that were rendered in the old
			//TODO: would be good to check if the exisitng canvas is exactly what we want, in which case we can continue the loop at this point
			
			//before we create a new canvas we need to get a copy of the old one in case we want to copy bits across
			var el_old_canvas = r.el_canvases[i];
			var oldOffsets = r.chanXOffset[i].slice(0);
			
			var canv = document.createElement('canvas');
			canv.width = offCanv.waveW*nDesiredChannels;
			canv.height = offCanv.waveH;
			r.el_canvases[i] = canv;
			var newCtx = canv.getContext('2d');
			canvasContexts[i] = newCtx; //we're going to need the 2d context for copying image data from the offscreen canvas
			r.slotGeneration[i] = NaN;
			r.slotColMap[i] = NaN;
			r.chanXOffset[i] = [NaN,NaN,NaN,NaN];
			
			//if we already have any of the desired channels rendered, we should copy them across now
			for(var c = 0;c<chanIsToBeRendered.length;c++)if(r.desiredChannels[c] && isNum(oldOffsets[c])){
				newCtx.drawImage(el_old_canvas,oldOffsets[c],0,offCanv.waveW,offCanv.waveH,xOff[c],0,offCanv.waveW,offCanv.waveH);
				r.chanXOffset[i][c] = xOff[c];
			}
			
		}

		// setup the gpu for rendering these slots
		UploadWaveBuffer(slotsToRender); 

		// render each of the requested channels, copying all the new images to their individual canvases
		for(var c=0;c<chanIsToBeRendered.length;c++)if(chanIsToBeRendered[c]){
			PerformRenderForChannel(c);
			if(r.desiredColormap == -1)
				CrossRenderCounts();
					
			for(var i=0;i<slotsToRender.length;i++){
				var slot_num = slotsToRender[i].num;
				if(isNaN(r.chanXOffset[slot_num][c])){ //we may already have copied it across
					canvasContexts[slot_num].drawImage(offCanv.el,offCanv.xOffsets[i],offCanv.yOffsets[i]-offCanv.waveH,offCanv.waveW,offCanv.waveH,xOff[c],0,offCanv.waveW,offCanv.waveH);
					r.chanXOffset[slot_num][c] = xOff[c];
				}
			}
		}

		// trigger a CanvasUpdateCallback for each of the rendered and copy-pasted slots
		var newlyPreparedSlots = slotsToRender.concat(slotsCopyPasted);
		while(newlyPreparedSlots.length){
			var s = newlyPreparedSlots .pop();
			$(r.el_canvases[s.num]).data('slot_num',s.num);
			CanvasUpdateCallback(s.num, TILE_CANVAS_NUM, r.el_canvases[s.num]);
			r.invalidatedSlots[s.num] = 0; // note that this could have been done at any point above (because, due to single-threadedness, no invalidation events can occur during execution of this function)
			r.slotColMap[s.num] = r.desiredColormap < 0? r.desiredColormap : s.group_history.slice(-1)[0];
			r.slotGeneration[s.num] = s.generation;
		}

		// If there are more slots to be rendered, we need to queue another execution of this function (asynchrously)
		if (r.firstInd < r.nSlots)
			window.setTimeout(function(){Render(cRender);},1);
	}

	var SlotsInvalidated = function(newlyInvalidatedSlots,isNewCut){ // this = cut object
		if(!ready.voltage){
			console.warn('T.WV SlotsInvalidated without any voltage data.');
			return;
		}

		if(cRender && cRender.alive)
			cRender.alive = false;  //kill the old render. In a way this is not necessary (due to the fact that rendering tries to use the most up to date information), but it is simpler.

		cRender = {alive: true}; //create a new render handle

		var r = slotRenderState;
		if(isNewCut || cCut == null){//TODO: check exactly when isNewCut is true, and check whether we really need to all of the following each time it is true
			cCut = this;
			r.invalidatedSlots = M.clone(newlyInvalidatedSlots);
			r.nSlots = newlyInvalidatedSlots.length;
			r.chanXOffset = Array(r.nSlots);
			r.slotColMap = Array(r.nSlots);
			r.slotGeneration = Array(r.nSlots);
			r.el_canvases = Array(r.nSlots);
			ready.cut = true;
		}else{
			M.or(r.invalidatedSlots,newlyInvalidatedSlots,M.IN_PLACE); //slotRenderState.invalidatedSlots |= newlyInvalidatedSlots
		}

		if(this && this != cCut)
			throw new Error("webgl-waveforms SlotsInvalidated with unexpected cut instance context");

		slotRenderState.firstInd = 0;
		window.setTimeout(function(){Render(cRender);},1);
	}

	var InvalidateAll = function(){
		SlotsInvalidated.call(null,M.repvec(1,slotRenderState.nSlots)); //invalidate all slots
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

	var SetPaletteMode = function(m,onSwitchProg){	
		if(!onSwitchProg && m == slotRenderState.desiredColormap)
			return; // we are already aiming to get this palette rendered (we may even have already finished rendering it)

		slotRenderState.desiredColormap = m;
        if(m == +1){
			gl.uniform1i(locs.countMode,false);
			gl.disable(gl.BLEND);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }else{
			gl.uniform1i(locs.countMode,true);					
			gl.enable(gl.BLEND);
			gl.blendEquation(gl.FUNC_ADD);
			gl.blendFunc(gl.ONE, gl.ONE);
			// Re-bind the special floating point render target
			gl.bindFramebuffer(gl.FRAMEBUFFER, offCanv.offFBO);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + FLOAT_TEXTURE_REGISTER_IND, gl.TEXTURE_2D, offCanv.offTexture, 0);
			SetCountModeColor();
		}
		if(!onSwitchProg && ready.voltage && ready.cut)
			InvalidateAll();
    }

	var MouseToVandT = function($canvas,x,y){
		//for a given $canvas, it returns the voltage time and channel coresponding to canvas coordinates (x,y)
		var slot_num = $canvas.data('slot_num');
		var r = slotRenderState;
		
		var xOffs = r.chanXOffset[slot_num];
		var ch;
		
		for(var i=0;i<xOffs.length;i++)if(x >= xOffs[i])
			ch = i;
		
		return {ch: ch,
				t: Math.round((x-xOffs[ch])/offCanv.dT),
				v: 127- y/offCanv.waveH*255/HEIGHT_SCALE //TODO: check if this is exactly correct
				};
	}
	
	
	var FileStatusChange = function(status,filetype){
		if(filetype == null && status.tet < 3)
			LoadTetrodeData(null);	
			
		if(filetype == "tet"){
			LoadTetrodeData(ORG.GetN(),ORG.GetTetBufferProjected());
			if(status.cut == 3) //if we happened to have loaded the cut before the tet, we need to force to accept it now
				ORG.GetCut().ForceChangeCallback(SlotsInvalidated);  //TODO: just invalidate all here directly
		}
		
	}

	var CrossRenderCounts = function(){
		//runs a kernel which copies data from a floating point texture to the off screen canvas itself, rather than copy the data directly it 
		// applies a colorscale to the floating point data.
		gl.useProgram(copyProg);  //TODO: cache locs for copyProg and don't need to reupload buffer data each time
		
		//switch on data
		gl.enableVertexAttribArray(locs.copy_a_position);
		gl.enableVertexAttribArray(locs.copy_a_texCoord);
		gl.bindBuffer(gl.ARRAY_BUFFER,buffs.copy_a_position);
		gl.vertexAttribPointer(locs.copy_a_position, 2, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffs.copy_a_texCoord);
		gl.vertexAttribPointer( locs.copy_a_texCoord, 2, gl.FLOAT, false, 0, 0);
  
		//prepare texture in register FLOAT_TEXTURE_REGISTER_IND
    	gl.uniform1i(locs.copy_u_src,FLOAT_TEXTURE_REGISTER_IND); 
		gl.activeTexture(gl.TEXTURE0 + FLOAT_TEXTURE_REGISTER_IND);
		gl.bindTexture(gl.TEXTURE_2D, offCanv.offTexture); 
		
		gl.uniform1f(locs.copy_oneTex,1/offCanv.W); 
		gl.disable(gl.BLEND); 
				
		//do it
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.drawArrays(gl.TRIANGLES, 0, 6);

		//restore everything		
		SwitchToMainProg();
			
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
        return SimpleClone(ready); 
    }
	
	

    var error_callback = function(s){console.log(s)};
    var success_callback = function(s){console.log(s);};

	Init(); //initialises all the webgl stuff without actually doing any data-specific stuff

	ORG.AddCutChangeCallback(SlotsInvalidated);
	ORG.AddFileStatusCallback(FileStatusChange);
	
	return {canDoComplexRender : function(){return canDoComplexRender;},
			SetPaletteMode: SetPaletteMode,
			ShowChannels: ShowChannels,
			IsReady: IsReady,
			MouseToVandT: MouseToVandT,
			ToggleOffCanv: function(v){//for debugging
					if(v) 
						$('body').prepend($(offCanv.el).css({zIndex: 200, border: '#0f0 4px dashed', position: 'fixed', left: '800px',backgroundColor: '#fff'}));
					else 
						$(offCanv.el).remove();
					},
			InitCopyProg: InitCopyProg, //for experimenting only, this is only supposed to be called once in normal operation
			HEIGHT_SCALE: HEIGHT_SCALE //this factor tells main.js to scale the aspect ratio of canvases, by cutting the height in two.
			};

}(T.CutSlotCanvasUpdate,T.CANVAS_NUM_WAVE, T.ORG, T.PALETTE_FLAG);

