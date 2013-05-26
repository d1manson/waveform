"use strict";

//T.WV: uses webgl to render waveforms

T.WV = function($tile_){
    
    var bW = 1024;
    var bH = 1024;
    var rowHeight = 128;
    var horz = 2; //horizontal spacing
    var colWidth = horz * 50; //includes a single point's worth of spacing
    var groupsPerRow = Math.floor(bW/(colWidth));
    var groupsPerPage = groupsPerRow * Math.floor(bH/rowHeight);
    var hasGroupData = false;
    var ready = false;
    var VERTEX_BATCH_SIZE = 1024*1024*2; //2 "million"
    var START_CAP = 60; //special constant used in our vertex shader
    var END_CAP = 62; //special constant used in our vertex shader
    
    var chanIsOn = [1,1,1,1];
    var gl = null;
    var prog = null;
    var error_callback = function(s){console.log(s)};
    var success_callback = function(s){console.log(s);};
    var Canvas = null;
    var bufferDataGL, N, cutIndLengths;
    var locWaveData,locGroupInfoIndex,locPalette,locPaletteB,locUsePaletteB,
        locGroupData,groupDataTexReg,locFirstGroup,locLastGroup;
    
    var VERTEX_SHADER_STR = [
    "   attribute vec2 waveData;                                                      				  ",
    "   attribute vec3 groupInfoIndex;                                                      	 	  ",
    "   varying lowp vec4 vCol;                                                                  	  ",
    "   uniform sampler2D palette;                                                  	       		  ",
    "   uniform sampler2D paletteB;                                              		          	  ",
    "   uniform bool usePaletteB;                                          		              		  ",
    "   uniform sampler2D groupData;                                                       			  ",
    "   uniform lowp float firstGroup01; 							                           		  ",// suffix 01, means need to times by 255 to get group number
    "   uniform lowp float lastGroup01;                                                      		  ",// we are rendering a page of groups, form first to last inclusive.  
    "   const int groupsPerRow = " + groupsPerRow + "; 						  				          ",
    "   const int w = " + bW + ";                                                                     ",
    "   const int h = " + bH + ";                                                                     ",
    "   const lowp int rowHeight = " + rowHeight + "; 										          ",//having no border does result in bleeding, but never mind
    "	const lowp int horz = " + horz + ";												              ",//horizontal spacing in pixels
    "   const lowp int colWidth = " + colWidth  + ";							    			      ",
    " 	const lowp int START_CAP = " + START_CAP + ";											      ",
    "   const lowp int END_CAP = " + END_CAP + ";												      ",
    "	int mod(int a, int b){ return a - (a/b)*b;}													  ",//Mate, why's there no native int mod function?
    
    "   void main(void) {                                                                   		  ",	
    
           //fetch group index and colmap index using groupInfoIndex from groupData     		      
    "       int rowBlock, colBlock, subCol, subRow;                              			 		  ",
    "       ivec3 groupInfoIndex255 = ivec3(groupInfoIndex*255.5);                                    ",
    "		rowBlock = groupInfoIndex255[2];													      ",//0-3 or 128-131
    "       colBlock = mod(groupInfoIndex255[1],4);   	                            			      ",//0-3
    "		subCol = groupInfoIndex255[0]/2;										                  ",//integer division, so floor giving 0-127
    "		subRow =  groupInfoIndex255[1]/4;									                      ",//integer division, so floor giving 0-63
    "       vec4 myGroupData = texture2D(groupData,                                       			  ",
    "                          vec2(float(subCol)/(128.*4.) + float(colBlock)*0.25, 				  ",
    "					       float(subRow)/(64.*4.) + float(rowBlock)*0.25));      				  ",
    "       bool isFirstTwoBytes = mod(groupInfoIndex255[0],2) == 0;                             	  ",
    
    	   //We render one channel at a time and then composite each group's image using drawImage.
    "       int x,y,z;                                                               		     	  ",
    "       x = int(waveData[0]*255.5);                                                          	  ",
    "		z = x > 49 ? -2 : 0;											  						  ", //if X is START_CAP or END_CAP
    "		x = x == START_CAP ? 0 																	  ",
    "		  : x == END_CAP   ? 49																	  ",
    "		  : 				 x;																  	  ",
    "       y = int(waveData[1]*float(rowHeight));                                                    ",
    "		x *= horz;																				  ", 
    
            //read the group index
    "       float myGroupInd01;                                                     		 		  ",
    "		myGroupInd01 = isFirstTwoBytes ? myGroupData[0]											  ",
    "									 : myGroupData[2];											  ",
    
           //shift whole groups upwards (i.e. hide them) if they are off the page         			  
    "       if(myGroupInd01 < firstGroup01 -0.1 || myGroupInd01 > lastGroup01 +0.1 ){				  ",//0.1 for rounding error, seems to be neccessary
    "           z = -2;                                                                               ", //we don't set vCol at all because it never gets used
    
    "       }else{                                                                        			  ",
            //if the group is on the page then position it at the required row and column
    "           int groupOnPage = int((myGroupInd01 - firstGroup01)*255.5);                     	  ",
    "    	    float myColmap = isFirstTwoBytes ? myGroupData[1]									  ",
    "								       : myGroupData[3];										  ",
    "           vCol = !usePaletteB? texture2D(palette,vec2(myColmap,0.))         		 		      ",
    "                              : texture2D(paletteB,vec2(myGroupInd01,0.));           	          ",	
    "           x += colWidth * mod(groupOnPage,groupsPerRow);              			 	  		  ",
    "           y += rowHeight * (groupOnPage/groupsPerRow);		         				  		  ",
    "       }                                                                              			  ",
    "		gl_Position = vec4(float(x)/" + bW/2 + ". - 1. ,									      ",
    "						   1.-float(y)/" + bH/2 + ".	,									      ",
    "						   float(z),   1.);                                                 	  ",                                                                                           
    "   }                                                                                 			  "
    ].join('\n');
    
    var FRAGMENT_SHADER_STR = [
    "   varying lowp vec4 vCol;                                                                		  ",     
    "   void main(void) {                                                                       	  ",
    "    gl_FragColor = vCol;                                                                 		  ",
    "  }                                                                                        	  "
    ].join('\n');
    
    var GetCanvas = function(){
        var canvas =  $('<canvas/>', {heiGht: bW, widtH: bH});
    	//canvas.css({position:"absolute",left:"400px",background:"#fff"});
    	//$('body').append(canvas);
        return canvas.get(0);
    };
    
    var PALETTE = function(){
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
    
    var PALETTE_B = function(){
        var data = new Uint8Array(new ArrayBuffer(256*4));
        for(var i=0;i<256;i++)
    		data[i*4+3] = 255; //set alpha to opaque
        data[0*4+0] = 220;    data[0*4+1] = 220;    data[0*4+2] = 220;
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
    
    var GetShaderFromString = function(str,type){
       var shader = gl.createShader(type);
       gl.shaderSource(shader, str);
       gl.compileShader(shader);
       return ValidShader(shader,str);
    }
    
    var UploadPalette = function(registerInd,data){
        UploadTexture(registerInd,data,256,1);
    }
    
    var UploadTexture = function(registerInd,data,w,h){
        //data should be 256*4 8-bit uints
    	gl.activeTexture(gl.TEXTURE0 + registerInd);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }
    
    var BuildBufferData = function(buffer){
        //bufferData is a set of four large uint8arrays, each of the large arrays holds data for one channel
    	//Each "vertex" is composed of 5-packed-bytes: x,y,g_a,g_b,g_c,g,   x,y,g_a,g_b,g_c  x,y,...  
        //x is 0-49, or one of the special values: START_CAP or END_CAP
    	//y is any value from 0 to 255, it is the voltage
    	//g_a-g_c encode a 3-byte little endian number giving the index of the spike (which is used for looking up group info in a texture)
    
        var oldData = new Int8Array(buffer);
    
    	var allBuffers = [];
    	
    	for(var c=0; c<4;c++){
    		var bufferData = new Uint8Array(new ArrayBuffer(N*52*5));
    		var p=0; //pointer for bufferData
    		var q=(50+4)*c; //pointer for oldData, we start at the timestamp of the first data sample for channel c
    		
    		for(var i=0; i<N; i++){ //for each spike
    			var g_a = i % 256;
    			var g_b = Math.floor(i/256) % 256;
    			var g_c = Math.floor(i/256/256);
    			q += 4; //to jump timestamp 
    
    			//duplicate the vertex at the wave start
    			bufferData[p++] = START_CAP; //speical value outside normal x range
    			bufferData[p++] = 127 - oldData[q]; // y
    			bufferData[p++] = g_a;
    			bufferData[p++] = g_b;
    			bufferData[p++] = g_c;
    
    			//add a vertex for each point in the wave
    			for(var j=0;j<50; j++ ){
    				bufferData[p++] = j; // x
    				bufferData[p++] = 127 - oldData[q++]; // y
    				bufferData[p++] = g_a; 
    				bufferData[p++] = g_b;
    				bufferData[p++] = g_c;
    			}
    
    			//duplicate the vertex at the wave end
    			bufferData[p++] = END_CAP; //speical value outside normal x range
    			bufferData[p++] = 127 - oldData[q-1]; // y
    			bufferData[p++] = g_a;
    			bufferData[p++] = g_b;
    			bufferData[p++] = g_c; 
    			
    			q+= (50+4)*3; //jump 3 channels
    		}
    		
    		allBuffers.push(bufferData);
    	}
    	
        return allBuffers;
    };
    
    var SetGroupData = function(cutInds){
        //group data is 256x512 4-byte texture
        //each 4bytes have data for 2 spikes: gid_1 cm_1 g_id2 cm_2
        //  where gid says which group it is and cm says what colormap index
        //Working out the full coordinate of any spike is a bit tricky, but we only have
        //to do that in the shader; here it's just a 1D array in normal order.
        //TODO: if this is slow it might be better to only update groups that have changed.
        var data = new Uint8Array(new ArrayBuffer(256*512*4));
    
        var G = cutInds.length;
        if (G>255)
            error_callback("Exceeded 255 groups");
        cutIndLengths = Array(G);
        
        for(var g=0;g<G;g++)if(cutInds[g]){
    		var cut_g = cutInds[g];
    		var Glen = cut_g.length;
            cutIndLengths[g] = Glen;
    		for(var i=0;i<Glen;i++){
    			data[cut_g[i]*2] = g;
                data[cut_g[i]*2 + 1] = i*255/Glen;
    		}
    	}
    
        UploadTexture(groupDataTexReg,data,512,256)
    	hasGroupData = true;
    }
    
    var CanvasInnerWidth = function(){
    	var nChans = chanIsOn[0] + chanIsOn[1] + chanIsOn[2] + chanIsOn[3];
    	return (50*horz)*nChans - 1;
    }
    
    var CanvasInnerHeight = function(){
    	return rowHeight;
    }
    
    var ShowChannels = function(newChanIsOn){
        //chanIsOn is a vector of 4 logicals specifying which of the 4 channels to show
        chanIsOn = newChanIsOn;
    	
    	var w = CanvasInnerWidth();
    	var h = CanvasInnerHeight();
    	for(var i=0;i<$tile_.length;i++)if($tile_[i]){
    		$tile_[i].canvas.get(0).width = w;
    		$tile_[i].canvas.get(0).height = h;
    	}
    	//Note this doesn't render, it just sets the channels
    }
    
    var SetPaletteMode = function(m){
        if(m==0)
            gl.uniform1i(locUsePaletteB ,0);
        else
            gl.uniform1i(locUsePaletteB ,1);
    }
    
    
    var Setup = function(N_val,buffer){ //N should be numeric not string
        N = N_val;
        hasGroupData = false;
    	ready = false;
    	Canvas = GetCanvas();
    
        if(!ValidN(N)) return;
    
    	// initialise gl context and program
    	gl =  ValidGL(Canvas.getContext("experimental-webgl"));
        //gl = WebGLDebugUtils.makeDebugContext(gl, throwOnGLError, validateNoneOfTheArgsAreUndefined); //DEBUG ONLY
    
        prog = gl.createProgram();	
    	gl.attachShader(prog, GetShaderFromString(VERTEX_SHADER_STR, gl.VERTEX_SHADER));
    	gl.attachShader(prog, GetShaderFromString(FRAGMENT_SHADER_STR, gl.FRAGMENT_SHADER)); 
    	gl.linkProgram(prog)
        ValidProgram(prog);
    	gl.useProgram(prog);
    
        //each channel has its own buffer, with voltage-time data packed together with group index data
        var bufferData = BuildBufferData(buffer);
    	bufferDataGL = Array(4);
    	for(var i=0;i<4;i++){
    		bufferDataGL[i] = gl.createBuffer();
    		gl.bindBuffer(gl.ARRAY_BUFFER, bufferDataGL[i]);
    		gl.bufferData(gl.ARRAY_BUFFER,  bufferData[i], gl.STATIC_DRAW);
    	}
    
        //prepare ourselves and the GPU for using vertex data
    	locWaveData = gl.getAttribLocation(prog, "waveData");
    	gl.enableVertexAttribArray(locWaveData);
    	locGroupInfoIndex = gl.getAttribLocation(prog, "groupInfoIndex");
    	gl.enableVertexAttribArray(locGroupInfoIndex);    	
    	//note we have to make a call to vertexAtrribPointer for both sets of data each time we change the active array_buffer (see RenderPage)

    
        //Send the GPU the palette and tell the vertex shader where to find it
        UploadPalette(3,PALETTE); //randomly take the 3rd texture register, why not?
        locPalette = gl.getUniformLocation(prog, "palette");    
    	gl.uniform1i(locPalette, 3); //texture register 3 for palette
    
        //Send the GPU the other palette and tell the vertex shader where to find it
        UploadPalette(2,PALETTE_B); //randomly take the 2nd texture register, why not?
        locPaletteB = gl.getUniformLocation(prog, "paletteB");    
        gl.uniform1i(locPaletteB, 2); //texture register 5 for palette
    	
    	//this is what lets us toggle between the two palette options
        locUsePaletteB = gl.getUniformLocation(prog,"usePaletteB");
    	SetPaletteMode(0);
    	
        //Prepare group data buffer on GPU, will later fill with data
        locGroupData = gl.getUniformLocation(prog, "groupData");    
        groupDataTexReg = 1; //texture register 1 for groupData, why not?
        gl.uniform1i(locGroupData, groupDataTexReg); 
    
    	//doesn't actually do any webGl stuff, but useful to set default here
        ShowChannels([1,1,1,1]); 
    
        //Prepare uniforms for paged rendering
        locFirstGroup = gl.getUniformLocation(prog,"firstGroup01");
        locLastGroup = gl.getUniformLocation(prog,"lastGroup01"); 
    
    	//turn off depth testing since we want to just render in order (negative z is still invisible)
    	gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND); //think this is off by default, but anyway we don't need it.
    
        gl.viewport(0, 0, bW,bH);
    	ready = true;
    
    }
    
    var RenderPage = function(firstGroup,lastGroup){
    
    	var w = CanvasInnerWidth();
    	var h = CanvasInnerHeight();
    	//TODO: maybe a bit wasteful doing this here, could move it elsewhere (when we do more advanced handling of cutInds)
    	for(var i=firstGroup;i<=lastGroup;i++)if(i< cutIndLengths.length && $tile_[i]){
    		$tile_[i].caption.text("group " + i + " | " + cutIndLengths[i] + " waves ");
    		$tile_[i].ctx.clearRect( 0 , 0 , w , h );
    	}
    		
    		
    	console.time("render page");
    	gl.uniform1f(locFirstGroup, firstGroup/255);
    	gl.uniform1f(locLastGroup, lastGroup/255);
    	var verts = N*52;
    	var xOff = 0;
    	
    	for(var c=0;c<4;c++)if(chanIsOn[c]){ //for each channel
    		
    		//choose the right vertex buffer ..TODO: maybe best to iterate through all pages of one channel and then come back and do subsequent channels?
    		gl.bindBuffer(gl.ARRAY_BUFFER, bufferDataGL[c]);
    		gl.vertexAttribPointer(locWaveData, 2, gl.UNSIGNED_BYTE, true, 5, 0); 
    		gl.vertexAttribPointer(locGroupInfoIndex, 3, gl.UNSIGNED_BYTE, true, 5, 2); 
    		
    		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); 
    	
    		//render all verticies, batching if there are a very large number
    		for(var start=0; start<verts; start += VERTEX_BATCH_SIZE-1)
    			gl.drawArrays(gl.LINE_STRIP, start, Math.min(VERTEX_BATCH_SIZE, verts-start)); 
    
    		//copy the results to the relevant sections on the relevant canvases
    		for(var i=firstGroup;i<=lastGroup;i++)if(i< cutIndLengths.length && $tile_[i]){
    			var row = Math.floor((i-firstGroup)/groupsPerRow);
    			var col = (i-firstGroup) % groupsPerRow;
    			$tile_[i].ctx.drawImage(Canvas,col*colWidth,row*rowHeight,colWidth-horz,rowHeight,xOff,0,colWidth-horz,rowHeight);
    		}
    		
    		xOff += 50*horz;
    	}
    	console.timeEnd("render page");
    }
    
    
    var Render = function(firstGroup,lastGroup,isAsync){
        //The render target is not big enough to render all groups in one go, 
        //e.g. when we are showing all channels, we might fit 2 groups on a row and have 8 rows so 16 groups per page
    
    	if(isAsync === undefined)
    		window.setTimeout(function(){Render(firstGroup,lastGroup,true);},1); //call this function again but via timeout
    	else{
    		firstGroup = firstGroup === undefined? 0 : firstGroup;
    		lastGroup = lastGroup === undefined? cutIndLengths.length-1 : lastGroup;
    		RenderPage(firstGroup,Math.min(lastGroup,firstGroup+ groupsPerPage-1))
    		firstGroup += groupsPerPage;
    		if(firstGroup < lastGroup)
    			window.setTimeout(function(){Render(firstGroup,lastGroup,true);},1);
    	}
    }
    
    
    // =============================================================================================
    // Some boring validation functions which alert errors and return null if input is invalid
    
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
        return ready;
    }
    
    return {
        Setup: Setup,
        Render: Render,
        SetPaletteMode: SetPaletteMode,
        CanvasInnerHeight: CanvasInnerHeight,
        CanvasInnerWidth: CanvasInnerWidth,
        ShowChannels: ShowChannels,
        SetGroupData: SetGroupData,
        IsReady: IsReady
    }

}(T.$tile_)
