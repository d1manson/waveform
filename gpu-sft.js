"use strict";
// T.SFT: GPU calculation of stack of short 1D fourier transforms

T.SFT = function(){ 

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
    
    //computes stack of s 1d fourier transforms with real valued 8-bit inputs of length W
    var FRAGMENT_SHADER_STR= [
    " 	precision highp float; 																	",
    "	varying vec2 coord_01;																	",
    "	uniform sampler2D data;																	",
    "	const float W = 50.;																	",
    "	const float W_pow2_packed = 16.; 														",
    "	const float L = " + S + ".;														        ",
    "	const float oneTexel = 1./L;															",
    "	void main(void) {																		",
    "	   float t_y = coord_01.x - oneTexel; 													",
    "	   float r = vev4(0.,0.,0.,0.);															",
    "	   float i = vev4(0.,0.,0.,0.);															",
	"	   float k = coord_01.y ;", // TODO
	"	   float pi2k_N = 2*3.1415926 *W * k;													",
    "	   for(float n = 0.; n< W; n+=4.){														",
    "	       float t_x = n/4./W_pow2_packed; 													",
	"		   vec4 x__x = texture2D(data, vec2(t_x,t_y)); 										",
    "		   r += cos((vec4(0.,1.,2.,3.)+n)*-pi2k_N) * x__x;									", //data[n] * Math.cos(-pi2k_N *n)
	"		   i += sin((vec4(0.,1.,2.,3.)+n)*-pi2k_N) * x__x;									", //data[n] * Math.sin(-pi2k_N *n)
    "	   }																					",
	"	float r_ = r[0] + r[1] + r[2] + r[3];													",
	"	float i_ = i[0] + i[1] + i[2] + i[3];													",
	
    endian =="L" ? //TODO...
    "	    gl_FragColor = vec4(fract(d1),floor(d1)/256.,fract(d2) ,floor(d2)/256.); 			": // for litte-endian javascript
    "	    gl_FragColor = vec4(floor(d1)/256.,fract(d1),floor(d2)/256.,fract(d2) ); 			", // for big-endian javascript
    "	}																						"
    ].join('\n');
  
    
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
    
    var ComputeSFT = function(data,L,W,success_callback_in,error_callback_in){
    	window.setTimeout(function(){ComputeMatrixTimeout(data,L,W,success_callback_in,error_callback_in)},1);
    }
    
    var ComputSFTTimeout = function(data,L,W,success_callback_in,error_callback_in){	
    	success_callback = success_callback_in;
    	error_callback = error_callback_in;
    	Canvas = document.createElement("canvas");
    	
    	if(W != 64){error_callback('Width must be 64'); return;}
    
    	//1. initialise gl context and program
    	gl = ValidGL(Canvas.getContext("experimental-webgl"));
    	gl = WebGLDebugUtils.makeDebugContext(gl, throwOnGLError, validateNoneOfTheArgsAreUndefined); //DEBUG ONLY
    
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
    
    	//2. Initialise offscreen texture/buffer for blocks of size WxS
        var tmp = MakeFrameBuffer(W,S);
        var resultBuffer = tmp.fbo;
        var resultTexture = tmp.texture;
    
    	//3. Tell GPU which register data will be in
    	locData = gl.getUniformLocation(prog, "data");    
    	gl.uniform1i(locData, 0); //texture register 0 for data
        
		var result = new Int16Array(L*W);
		
    	//4-6. Generate the output in batches, using blocks of length S
    	for(var a=0;a<L;a+=S){
    		//4 upload input_a to GPU
    		UploadTexture(0,data.slice(a*W,(a+S)*W),W,S);   
        
    		//5. Run the GPU program
    		RenderViewportRectangle(resultBuffer,S/2,S);    	
    
    		//6. Copy the values from the GPU back to CPU
    		gl.readPixels(0, 0, W/2, S, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(result.slice(a*W,(a+S)*W).buffer));    
    	}
    	
    	Canvas = null; //shoul get rid of all webgl stuff
		
    	success_callback(result);
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
        ComputeSFT: ComputeSFT
    }
}()
