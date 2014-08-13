"use strict";

T = T || {};

T.EEG = function($eegCanv){

	var WorkerCode = function(){
		var dft_power = function(X,maxFreq){
				var N = X.length;
				var m = maxFreq+1;
				var ret = new Float32Array(m);
				var df_k = - 2*3.14159265/N;
				for(k=0,df_i=0;k<m;k++,df_i+=df_k){
					for(var i=0,s_r=0,s_i=0,f=0;i<N;i++,f+=df_i){
						s_r += X[i] * Math.cos(f);
						s_i += X[i] * Math.sin(f);
					}	
					ret[k] = s_r*s_r + s_i*s_i; 
				}
				return ret;
		}
			
		var argmax = function(X){
			var m = X[0];
			var m_i = 0;
			for(var i = 1;i< X.length; i++){
				(m < X[i]) && ((m_i = i) && (m = X[i])) 
			}
			return m_i; 
		}
	
		var GetPowerspect = function(buffer,winLen,maxFreq,band){
			var eeg= new Int8Array(buffer);
			
			for(p=0;p<eeg.length;p+=winLen){
				var ret = dft_power(eeg.subarray(p,p+winLen),maxFreq);
				
				var lo = Math.floor(band[0]/maxFreq * ret.length); //TODO: check how acurate this calculation is..is it off by more than 1 or 2?
				var hi = Math.ceil(band[1]/maxFreq * ret.length);
				
				var peakInd = argmax(ret.subarray(lo,hi+1)) + lo;
				main.GotSpectSection(ret.buffer,[lo,hi],peakInd,ret[peakInd],[ret.buffer]);
			}
		}
	}
	
	var GotSpectSection = function(spect,bandInd,peakInd,peakVal){
		spect = new Float32Array(spect);
		
		var canv = $eegCanv.get(0);
		var ctx = canv.getContext('2d');
		ctx.clearRect(0,0,canv.width,canv.height);

    	ctx.beginPath();
    	ctx.strokeStyle = "RGB(40,40,40)";
		var dw = canv.width/peakVal;
		var dh = canv.height/spect.length;
    	var i = 0;
    	ctx.moveTo(spect[i]*dw,0);
    	for(;i<spect.length;i++)
    		ctx.lineTo(dw*spect[i],i*dh);
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
		var WIN_LEN = 60; //seconds
		var MAX_FREQ = 25; //Hz
		
		worker.GetPowerspect(eeg.buffer,
							 WIN_LEN*sampRate,
							 MAX_FREQ*WIN_LEN,
							 [6*WIN_LEN,12*WIN_LEN],
							 [eeg.buffer])
	}
	
	var ReadEEGForPlotting = function(){
		T.ORG.GetEEG(function(x){ComputeSpect(new Int8Array(x.buffer),x.header);});
	}
	
	var worker = BuildBridgedWorker(WorkerCode,["GetPowerspect*"],["GotSpectSection*"],[GotSpectSection]);	
	
	return {
		PlotSpect: ReadEEGForPlotting 
	}
}($('#eegspect'))