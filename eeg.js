"use strict";

T = T || {};

T.EEG = function($eegCanv,ORG){

	var WorkerCode = function(){
		var FFT = (function() {
			//Taken from https://gist.github.com/mohayonao/3063634
		    "use strict";
		    
		    var FFT = function() {
		        initialize.apply(this, arguments);
		    }, $this = FFT.prototype;
		    
		    var FFT_PARAMS = {
		        get: function(n) {
		            return FFT_PARAMS[n] || (function() {
		                var bitrev = (function() {
		                    var x, i, j, k, n2;
		                    x = new Int16Array(n);
		                    n2 = n >> 1;
		                    i = j = 0;
		                    for (;;) {
		                        x[i] = j;
		                        if (++i >= n) break;
		                        k = n2;
		                        while (k <= j) { j -= k; k >>= 1; }
		                        j += k;
		                    }
		                    return x;
		                }());
		                var i, k = Math.floor(Math.log(n) / Math.LN2);
		                var sintable = new Float32Array((1<<k)-1);
		                var costable = new Float32Array((1<<k)-1);
		                var PI2 = Math.PI * 2;
		                
		                for (i = sintable.length; i--; ) {
		                    sintable[i] = Math.sin(PI2 * (i / n));
		                    costable[i] = Math.cos(PI2 * (i / n));
		                }
		                return FFT_PARAMS[n] = {
		                    bitrev: bitrev, sintable:sintable, costable:costable
		                };
		            }());
		        }
		    };
		    
		    var initialize = function(n) {
		        n = (typeof n === "number") ? n : 512;
		        n = 1 << Math.ceil(Math.log(n) * Math.LOG2E);
		        
		        this.length = n;
		        this.buffer = new Float32Array(n);
		        this.real   = new Float32Array(n);
		        this.imag   = new Float32Array(n);
		        this._real  = new Float32Array(n);
		        this._imag  = new Float32Array(n);
		        
		        var params = FFT_PARAMS.get(n);
		        this._bitrev   = params.bitrev;
		        this._sintable = params.sintable;
		        this._costable = params.costable;
		    };
		    
		    $this.forward = function(_buffer) {
		        var buffer, real, imag, bitrev, sintable, costable;
		        var i, j, n, k, k2, h, d, c, s, ik, dx, dy;
		        
		        buffer = this.buffer;
		        real   = this.real;
		        imag   = this.imag;
		        bitrev = this._bitrev;
		        sintable = this._sintable;
		        costable = this._costable;
		        n = buffer.length;
		        
		        for (i = n; i--; ) {
		            buffer[i] = _buffer[i];
		            real[i]   = _buffer[bitrev[i]];
		            imag[i]   = 0.0;
		        }
		        
		        for (k = 1; k < n; k = k2) {
		            h = 0; k2 = k + k; d = n / k2;
		            for (j = 0; j < k; j++) {
		                c = costable[h];
		                s = sintable[h];
		                for (i = j; i < n; i += k2) {
		                    ik = i + k;
		                    dx = s * imag[ik] + c * real[ik];
		                    dy = c * imag[ik] - s * real[ik];
		                    real[ik] = real[i] - dx; real[i] += dx;
		                    imag[ik] = imag[i] - dy; imag[i] += dy;
		                }
		                h += d;
		            }
		        }
		        return {real:real, imag:imag};
		    };
		    
		    $this.inverse = function(_real, _imag) {
		        var buffer, real, imag, bitrev, sintable, costable;
		        var i, j, n, k, k2, h, d, c, s, ik, dx, dy, t;
		        
		        buffer = this.buffer;
		        real   = this._real;
		        imag   = this._imag;
		        bitrev = this._bitrev;
		        sintable = this._sintable;
		        costable = this._costable;
		        n = buffer.length;
		        
		        for (i = n; i--; ) {
		            j = bitrev[i];
		            real[i] = +_real[j];
		            imag[i] = -_imag[j];
		        }
		        
		        for (k = 1; k < n; k = k2) {
		            h = 0; k2 = k + k; d = n / k2;
		            for (j = 0; j < k; j++) {
		                c = costable[h];
		                s = sintable[h];
		                for (i = j; i < n; i += k2) {
		                    ik = i + k;
		                    dx = s * imag[ik] + c * real[ik];
		                    dy = c * imag[ik] - s * real[ik];
		                    real[ik] = real[i] - dx; real[i] += dx;
		                    imag[ik] = imag[i] - dy; imag[i] += dy;
		                }
		                h += d;
		            }
		        }
		        
		        for (i = n; i--; ) {
		            buffer[i] = real[i] / n;
		        }
		        return buffer;
		    };
		    
		    return FFT;
		}());


		var mag2 = function(real,imag,ret){
			//computes the complex magnitude squared of an aray of complex numbers
			for(var i=0;i<=ret.length;i++)
				ret[i] = real[i]*real[i] + imag[i]*imag[i];
		}
		
		var argmax = function(X){
			var m = X[0];
			var m_i = 0;
			for(var i = 1;i< X.length; i++){
				(m < X[i]) && ((m_i = i) && (m = X[i])) 
			}
			return m_i; 
		}
		
		var sum_strided = function(X,stride){
			//compute sum along stride interleaved blocks of length n
			var n = X.length/stride;
			var res = new Float32Array(stride)
			for(var i=0,p=0;i<n;i++){
				for(var j=0;j<stride;j++,p++)
					res[j] += X[p];
			}
			return res;
		}
	
		var GetPowerspect = function(buffer,sampRate,winLenSeconds,maxFreq,band){
			var eeg = new Int8Array(buffer);
						
			// adjust all the values so that they mean what we need them to mean...yeah probably could be more helpful with naming.
			var winLen = 1 << Math.ceil(Math.log(winLenSeconds*sampRate) * Math.LOG2E); //next power of 2
			winLenSeconds = winLen/sampRate;
			maxFreq = Math.floor(maxFreq*winLenSeconds);
			band[0] = Math.floor(band[0]*winLenSeconds);
			band[1] = Math.floor(band[1]*winLenSeconds);
			var fft = new FFT(winLen);
			
			var nBlocks = Math.floor(eeg.length/winLen);
			var b = maxFreq+1;
			var allPower = new Float32Array(b*nBlocks);
			for(a=0;a<nBlocks;a++){
				fft.forward(eeg.subarray(a*winLen,(a+1)*winLen));
				mag2(fft.real,fft.imag,allPower.subarray(a*b,(a+1)*b));
			}
			
			var ret = sum_strided(allPower,b);
			var peakInd = argmax(ret.subarray(band[0],band[1])) + band[0];
			main.GotSpectSection(ret.buffer,band,peakInd,ret[peakInd],[ret.buffer]);
				
		}
		
	}
	
	var GotSpectSection = function(spect,bandInd,peakInd,peakVal){
		var GAP = 3;
		var canv = $eegCanv.get(0);
		var ctx = canv.getContext('2d');
		ctx.clearRect(0,0,canv.width,canv.height);

		if(!spect)
			return;
		
		ctx.fillRect(1,0,1,canv.height); //draw axis down the side
		
		spect = new Float32Array(spect);
    	ctx.beginPath();
    	ctx.strokeStyle = "RGB(40,40,40)";
		var dw = (canv.width-GAP)/peakVal;
		var dh = canv.height/spect.length;
    	var i = 0;
    	ctx.moveTo(spect[i]*dw+GAP,0);
    	for(;i<spect.length;i++)
    		ctx.lineTo(dw*spect[i]+GAP,i*dh);
    	ctx.stroke();    
		ctx.beginPath();
		ctx.strokeStyle = "RGB(0,0,255)";
		ctx.moveTo(0,dh*bandInd[0]);
		ctx.lineTo(canv.width,dh*bandInd[0]);
		ctx.stroke();    
		ctx.beginPath();
		ctx.moveTo(0,dh*bandInd[1]);
		ctx.lineTo(canv.width,dh*bandInd[1]);
		ctx.stroke();    

	}
	
	var ComputeSpect = function(eeg,header){
		var eeg = M.clone(eeg);//so that we can transfer it to worker.
		var sampRate = 250; //TODO: read from header
		var WIN_LEN = 60; //seconds, but will be rounded up to next power of 2 samples
		var MAX_FREQ = 25; //Hz
		
		theWorker.GetPowerspect(eeg.buffer,
							 sampRate,
							 WIN_LEN,
							 MAX_FREQ,
							 [6,12],
							 [eeg.buffer])
	}
	
	var ReadEEGForPlotting = function(status,filetype){
		if(filetype && filetype !== "eeg")
			return;
		var buffer = ORG.GetEEGBuffer();
		if(buffer){
			ComputeSpect(new Int8Array(buffer),ORG.GetEEGHeader());
		}else{
			GotSpectSection(null);
		}
	}
	
	var theWorker = BuildBridgedWorker(WorkerCode,["GetPowerspect*"],["GotSpectSection*"],[GotSpectSection]);	
	//console.log("EEG BridgeWorker is:\n  " + theWorker.blobURL);
	
	ORG.AddFileStatusCallback(ReadEEGForPlotting);
	return { /* nothing in the end	*/}
}($('#eegspect'),T.ORG)


