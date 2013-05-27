"use strict";
// T.DM: GPU calculation of Distance Matrix, by DM Apr 2013

//TODO: among other things, might want to check if reading BGRA is faster than RGBA?
//I'm not sure what this means for switching around bytes in the shader.
//I read that most (?) GPUs use BGRA internally and may use the CPU to convert.


T.DM = function(){ 

    var endian = function(){
        var b = new ArrayBuffer(2);
        (new DataView(b)).setInt16(0,256,true);
        return (new Int16Array(b))[0] == 256? 'L' : 'B';
    }();
        
    var S = 1024;
    var gl = null;
    var success_callback, error_callback, Canvas, prog, locCoord_01a,locInput_a,locInput_b;
    
    var VERTEX_SHADER_STR = [
    "	attribute vec2 coord_01a;                         										",
    "	varying vec2 coord_01;                             										",
    "	void main(void) {                                  										",  
    "		coord_01 = coord_01a;                              									",
    "		gl_Position = vec4(coord_01a *2. - 1.0, 0., 1.);   									",
    "	}                                                  										"
    ].join('\n');
    
    //computes dist matrix for block of size sxs, with input vectors of 8-bit precision and length W
    var FRAGMENT_SHADER_STR= [
    " 	precision mediump float; 																",
    "	varying vec2 coord_01;																	",
    "	uniform sampler2D input_a;																",
    "	uniform sampler2D input_b;																",
    "	const float W = 50.;																	",
    "	const float W_pow2_packed = 16.; 														",
    "	const float L = " + S + ".;														        ",
    "	const float oneTexel = 1./L;															",
    "	void main(void) {																		",
    "	   float a1_y = coord_01.x - oneTexel; 													",
    "	   float a2_y = coord_01.x ; 															",
    "	   float b_y = coord_01.y; 																",
    "	   float d1=0.;																			",
    "	   float d2=0.;																			",
    "	   for(float i = 0.; i< W; i+=4.){														", 
    "	       float i_x = i/4./W_pow2_packed; 													",
    "		   vec4 a1 = texture2D(input_a, vec2(i_x,a1_y)); 									",
    "	       vec4 a2 = texture2D(input_a, vec2(i_x,a2_y)); 									",
    "	       vec4 b = texture2D(input_b, vec2(i_x,b_y)); 										",
    "		   d1 += abs(a1[0]-b[0]) + abs(a1[1]-b[1]) + abs(a1[2]-b[2]) + abs(a1[3]-b[3]);		",
    "		   d2 += abs(a2[0]-b[0]) + abs(a2[1]-b[1]) + abs(a2[2]-b[2]) + abs(a2[3]-b[3]);		",
    "	   }																					",
    endian =="L" ?
    "	    gl_FragColor = vec4(fract(d1),floor(d1)/256.,fract(d2) ,floor(d2)/256.); 			": // for litte-endian javascript
    "	    gl_FragColor = vec4(floor(d1)/256.,fract(d1),floor(d2)/256.,fract(d2) ); 			", // for big-endian javascript
    "	}																						"
    ].join('\n');
    
	var WORKER_STRING = function(){
		"use strict";
		
		// This worker accepts blocks of data and combines them into a single matrix which is returned to the main thread
		var s, L_a, L_b, a, b, result;
		var sym = false;

		self.onmessage = function(e) {
		var data = e.data;

			if(data.params !== undefined){
			
				if(data.s !== undefined)
					s = data.s;
				if(data.L_a !== undefined)
					L_a = data.L_a
				if(data.L_b !== undefined)
					L_b = data.L_b
				if(data.a !== undefined)
					a = data.a;
				if(data.b !== undefined)
					b = data.b;
				if(data.sym !== undefined)
					sym = data.sym;
					
			}else if(data.cmd != undefined){
			
				if (data.cmd == "allocate")
					result = new ArrayBuffer(L_a*L_b*2);
				else if (data.cmd == "return")
					self.postMessage(result,[result]);
					
			}else{
				// if no params and no cmd, data is an ArrayBuffer
				var srcView = new Uint16Array(data);
				var destView = new Uint16Array(result);
				
				for(var i=0;i<s;i++)for(var j=0;j<s;j++)
					destView[(i+b)*L_a +a+j] = srcView[i*s + j];
					
				if(sym){
					for(var i=0;i<s;i++)for(var j=0;j<s;j++)
						destView[(i+a)*L_b +b+j] = srcView[j*s + i];
				}
				
			}
		}
	}.toString().match(/^\s*function\s*\(\s*\)\s*\{(([\s\S](?!\}$))*[\s\S])/)[1];

	var workerCombineBatches = new Worker(window.URL.createObjectURL(new Blob([WORKER_STRING],{type:'text/javascript'})));

    workerCombineBatches.onmessage = function(e) {
    	success_callback(e.data); //should use it as new Uint16Array(data)
    }
    
    var GetShaderFromString = function(str,type){
       var shader = gl.createShader(type);
       gl.shaderSource(shader, str);
       gl.compileShader(shader);
       return ValidShader(shader);
    }
    
    var UploadTexture = function(registerInd,data,w,h){
    	//data should be 8-bit uints of size w x h, but data will be packed down into 32bit units, making w'=w/4, but h'=h still
    	gl.activeTexture(gl.TEXTURE0 + registerInd);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w/4, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(data));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }
    
    var RenderViewportRectangle = function(fbo,w,h){
    	gl.viewport(0, 0, w,h);
    	gl.bindBuffer(gl.ARRAY_BUFFER, gl.rectBuffer);
    	gl.bindFramebuffer(gl.FRAMEBUFFER,fbo); //if fbo is null will render to canvas, but upsidedown.
    	gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    
    
    var MakeFrameBuffer = function(w,h){
    //Frame buffers are an alternative target to the drawing buffer, or rather they allow you to render to a textur
    	var fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    
    	//flesh out the frame buffer with a null texture of the right size
    	var texture = gl.createTexture();
    	gl.bindTexture(gl.TEXTURE_2D, texture);
    	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0); 
    
    	return {fbo: fbo, texture: texture};
    }
    
    var ComputeMatrix = function(input_a,input_b,L_a,L_b,W,success_callback,error_callback,sym){
    	window.setTimeout(function(){ComputeMatrixTimeout(input_a,input_b,L_a,L_b,W,success_callback,error_callback,sym)},1);
    }
    
    var ComputeMatrixTimeout = function(input_a,input_b,L_a,L_b,W,success_callback_in,error_callback_in,sym){	
    	success_callback = success_callback_in;
    	error_callback = error_callback_in;
    	Canvas = document.createElement("canvas");
    	
    	if(L_a != L_b || L_a % 1024){error_callback('Lengths must be equal and multiples of 1024'); return;}
    	if(W != 64){error_callback('Width must be 64'); return;}
    
    	//1. initialise gl context and program
    	gl = ValidGL(Canvas.getContext("experimental-webgl"));
    	//gl = WebGLDebugUtils.makeDebugContext(gl, throwOnGLError, validateNoneOfTheArgsAreUndefined); //DEBUG ONLY
    
        prog = gl.createProgram();
    	gl.attachShader(prog, GetShaderFromString( VERTEX_SHADER_STR, gl.VERTEX_SHADER));
    	gl.attachShader(prog, GetShaderFromString( FRAGMENT_SHADER_STR, gl.FRAGMENT_SHADER)); 
    	gl.linkProgram(prog)
        ValidProgram(prog);
    	gl.useProgram(prog);
    
    	//there is an attribute called coord_01a in the vertex shader which will hold a rectangle
    	gl.rectBuffer = gl.createBuffer();
    	locCoord_01a = gl.getAttribLocation(prog, "coord_01a");
    	gl.enableVertexAttribArray( locCoord_01a );
    	gl.bindBuffer(gl.ARRAY_BUFFER, gl.rectBuffer);
    	gl.bufferData(gl.ARRAY_BUFFER,  new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]), gl.STATIC_DRAW);
    	gl.vertexAttribPointer(locCoord_01a, 2, gl.FLOAT, false, 0, 0); 
    
    	//2. Initialise offscreen texture/buffer for dist matrix blocks of size sxs
        var tmp = MakeFrameBuffer(S/2,S);
        var distMatBuffer = tmp.fbo;
        var distMatTexture = tmp.texture;
    
    	//3. Tell GPU which registers a and b data will be in
    	locInput_a = gl.getUniformLocation(prog, "input_a");    
        locInput_b = gl.getUniformLocation(prog, "input_b"); 
    	gl.uniform1i(locInput_a, 0); //texture register 0 for input_a
    	gl.uniform1i(locInput_b, 1); //texture register 1 for input_b
    
    	//4. Prepare the worker for recieving output
    	workerCombineBatches.postMessage({params:true,L_a:L_a,L_b:L_b,s:S,sym:sym}); 
    	workerCombineBatches.postMessage({cmd:"allocate"});
    
    	//5-7. Generate the output in batches, using blocks of size s x s
    	for(var a=0;a<L_a;a+=S){
    		//5a. upload input_a to GPU
    		UploadTexture(0,input_a.slice(a*W,(a+S)*W),W,S);   
    
    		for(var b=sym?a:0;b<L_b;b+=S){
    			//5b. upload input_b to GPU
    			UploadTexture(1,input_b.slice(b*W,(b+S)*W),W,S); 	
    
    			//6. Run the GPU program
    			RenderViewportRectangle(distMatBuffer,S/2,S);    	
    
    			//7. Copy the values from the GPU back to CPU
    			var tmpMatrix = new ArrayBuffer(S*S*2);
    			var tmpMatrixView8 = new Uint8Array(tmpMatrix);
    			gl.readPixels(0, 0, S/2, S, gl.RGBA, gl.UNSIGNED_BYTE, tmpMatrixView8);
    
    			//8. Store the new batch in the resultMatrix
    			workerCombineBatches.postMessage({params:true,a:a,b:b});
    			workerCombineBatches.postMessage(tmpMatrix,[tmpMatrix]);
    		}
    	}
    	
    	Canvas = null; //shoul get rid of all webgl stuff
    	workerCombineBatches.postMessage({cmd:"return"});
    }
    
    
    
    // =============================================================================================
    // Some boring validation functions which alert errors and return null if input is invalid
    
    var ValidGL = function(test_gl){
    	if(!test_gl){
    		error_callback('Failed to initialise WebGL context.');
    		return null;
    	}else
    		return test_gl;
    }
    
    var ValidShader = function(shader){
       if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) == 0){
          error_callback("Shader failed to compile:\n" + gl.getShaderInfoLog(shader) + "\n\n" + str);
    	  return null;
    	}
    	return shader;
    }
    
    var ValidProgram = function(test_program){
       gl.validateProgram(test_program);
       if (!gl.getProgramParameter(test_program, gl.VALIDATE_STATUS)){
           error_callback("Error during program validation:\n" + gl.getProgramInfoLog(test_program));
           return null;
       }
       return test_program;
    }
    
    return {
        ComputeMatrix: ComputeMatrix
    }
}()
