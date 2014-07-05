"use strict";

// T.PAR: consists of several functions that take a file handle and a callback.
// The functions add the callback to a queue and send the file handle off to a worker to be parsed into a header object [and data buffer, if applicable]. 
// The worker returns the parsed data to the main thread, which then forwards it on to the callback at the front of the queue.
// there is a separate worker (each with its own specific code) for set, tet, pos, and cut.
var T = T || {};

T.PAR = function(){

	// ==== WORKER CODE ===============================================================================
	var tetWorkerCode = function(){
		"use strict";
		
		var REGEX_HEADER_A = /((?:[\S\s](?!\r\ndata_start))*[\S\s])(\r\ndata_start)/
		var REGEX_HEADER_B = /(\S*) ([\S ]*)/g

		var ParseTetrodeFile = function(file, SPIKE_FORMAT, BYTES_PER_SPIKE){
		
			// Read the first 1024 bytes as a string to get the header and find the data start
			var reader = new FileReaderSync();
			var topStr = reader.readAsBinaryString(file.slice(0, 1024 + 1));
			var match = REGEX_HEADER_A.exec(topStr);
    		if(!match){
    			main.TetrodeFileRead('did not find end of header in tet file.',[]);
    			return;
    		}
    		var dataStart = match.index + match[0].length;
    		var header = {};
    		var headerStr = match[0];
    		while (match = REGEX_HEADER_B.exec(headerStr))
    			header[match[1]] = match[2];
    
    		if (header.spike_format != SPIKE_FORMAT){
    			main.TetrodeFileRead("Code implements '" + SPIKE_FORMAT + "' format, but data is in '" +  header.spike_format + "'.",[]);
    			return;  
    		}
    
            var N = header.num_spikes;
    	    var dataLen = parseInt(N)*BYTES_PER_SPIKE;
        
			//read the data section of the file as an array buffer
    		var buffer = reader.readAsArrayBuffer(file.slice(dataStart,dataStart+dataLen)); 
			
			main.TetrodeFileRead(null,header,buffer,[buffer]);
			
		}
		
		var GetTetrodeAmplitude = function(buffer,N){
		
			var C = 4; //TODO: generalise this properly everywhere in the code
			var W = 50; //TODO: generalise this properly everywhere in the code
			
			var oldData = new Int8Array(buffer);
			var NxC = N*C;
			var amps = new Uint8Array(NxC);
			
			for(var i=0,p=0;i<NxC;i++){
				p += 4; // skip timestamp 
				var min = 127;
				var max = -128;
				for(var t=0;t<W;t++,p++){
					(oldData[p] > max) && (max = oldData[p]);
					(oldData[p] < min) && (min = oldData[p]);
				}
				amps[i] = max-min; 
			}

			main.GotTetAmps(amps.buffer,[amps.buffer]);
		}
	
		
	}
		
	var posWorkerCode = function(){
		"use strict";
		
		var endian = function(){
			var b = new ArrayBuffer(2);
			(new DataView(b)).setInt16(0,256,true);
			return (new Int16Array(b))[0] == 256? 'L' : 'B';
		}();
	
	    var Swap16 = function (val) {
			return ((val & 0xFF) << 8) | ((val >> 8) & 0xFF);
		}
		
		var take = function(data,offset,stride){
			// takes every stride'th element from data, starting with the offset'th element
			
			var n = data.length/stride;
			var res = new data.constructor(n);
			
			for(var i=0,j=offset;i<n;i++,j+=stride)
				res[i] = data[j];
			return res;
		}
		
		var times_IN_PLACE = function(src,factor,skipVal){
			for(var i=0;i<src.length;i++)if(src[i] != skipVal)
				src[i] *= factor;
		}
		var replaceVal_IN_PLACE = function(src,find,replace){
			for(var i=0;i<src.length;i++)if(src[i] == find)
				src[i] = replace;
		}
		
		var pow2 = function(a){return a*a;}
	
		var REGEX_HEADER_A = /((?:[\S\s](?!\r\ndata_start))*[\S\s])(\r\ndata_start)/
		var REGEX_HEADER_B = /(\S*) ([\S ]*)/g


		var ParsePosFile = function(file,POS_FORMAT,BYTES_PER_POS_SAMPLE){
			// Read the file as a string to get the header and find the data start
			var reader = new FileReaderSync();
			var fullStr = reader.readAsBinaryString(file);
		
			var match = REGEX_HEADER_A.exec(fullStr);
    		if(!match){
    			main.PosFileRead('did not find end of header in pos file.',[]);
    			return
    		}
			var dataStart = match.index + match[0].length;
    		var header = {};
    		var headerStr = match[0];
    		while (match = REGEX_HEADER_B.exec(headerStr))
    			header[match[1]] = match[2];
        	var dataLen = parseInt(header.num_pos_samples)*BYTES_PER_POS_SAMPLE;
            
    		if (header.pos_format != POS_FORMAT){
    			main.PosFileRead("Code implements '" + POS_FORMAT + "' format, but pos data is in '" +  header.pos_format + "'.",[]);
    			return;  
    		}
    
    		var buffer = reader.readAsArrayBuffer(file.slice(dataStart,dataStart+dataLen));
			if(endian == 'L'){
    			var data = new Int16Array(buffer);
    			for (var k=0;k<data.length;k++) //note that timestamps are 4 bytes, so this is really unhelpful if you want to read timestamps
    				data[k] = Swap16(data[k]);
    		}

			PostProcessPos(header,buffer,BYTES_PER_POS_SAMPLE);
		}
		
		var PostProcessPos = function(header,buffer,BYTES_PER_POS_SAMPLE){
		
			var data = new Int16Array(buffer);
			var elementsPerPosSample = BYTES_PER_POS_SAMPLE/2;
			var nPos = parseInt(header.num_pos_samples); 
			var end = nPos * elementsPerPosSample; 
			var XY = new Int16Array(nPos*2);
		
			var XY = new Int16Array(
							take(new Int32Array(buffer),1,BYTES_PER_POS_SAMPLE/4).buffer
						 ); // for each pos sample take bytes 4-7, and then view them as a pair of int16s 
		
			var POS_NAN = 1023;
			var MAX_SPEED = 5;//meters per second
			var NAN16 = -32768; //custom nan value, equal to minimum int16 value
			
			replaceVal_IN_PLACE(XY,POS_NAN,NAN16); //switch from axona custom nan value to our custom nan value
			
			var ppm = parseInt(header.pixels_per_metre);
			var UNITS_PER_M = 1000;
			times_IN_PLACE(XY,UNITS_PER_M/ppm,NAN16); //convert from pixels to milimeters (we use mm because then we can happily use Int16s)
			
			var sampFreq = parseInt(header.sample_rate);
			var pow2MaxSampStep = pow2(MAX_SPEED*UNITS_PER_M /sampFreq);
			
			// Find first (x,y) that is non-nan
			for(var start=0;start<nPos;start++)
				if(XY[start*2+0] != NAN16 && XY[start*2+1] !=NAN16)
					break;
				
			var x_from = XY[start*2+0];
			var y_from = XY[start*2+1];
			var jumpLen = 1;
			
			// Set big jump sections to nan
			for(var i=start+1,nJumpy=0; i<nPos; i++){
				
				// check if this pos is already nan
				// or if (dx^2 + dy^2)/dt^2 is greater than maxSpeed^2, where the d's are relative to the last "good" sample
				if ( XY[i*2+0] == NAN16 || XY[i*2+1] == NAN16 || 
					(pow2(x_from-XY[i*2+0]) + pow2(y_from-XY[i*2+1])) / pow2(jumpLen) > pow2MaxSampStep ){
					//sample is nan or speed is too large, so make this a jump
					XY[i*2 + 0] = XY[i*2 + 1] = NAN16; 
					nJumpy++;
					jumpLen++;
				}else{
					//speed is sufficiently small, so this point is ok
					jumpLen = 1;
					x_from = XY[i*2 + 0];
					y_from = XY[i*2 + 1];
				}
			}
			
			// TODO: interpolate and box-car smooth
			
			header.n_jumpy = nJumpy; //includes untracked
			header.max_vals = [(parseInt(header.window_max_y)-parseInt(header.window_min_y))*UNITS_PER_M/ppm ,
							   (parseInt(header.window_max_x)-parseInt(header.window_min_x))*UNITS_PER_M/ppm ]; //TODO: decide which way round we want x and y
			header.units_per_meter = UNITS_PER_M;
			main.PosFileRead(null,header, XY.buffer,[XY.buffer]);
		}
		
		
	}
	
	var cutWorkerCode = function(){
		"use strict";
		
		var REGEX_CUT_A = /n_clusters:\s*(\S*)\s*n_channels:\s*(\S*)\s*n_params:\s*(\S*)\s*times_used_in_Vt:\s*(\S*)\s*(\S*)\s*(\S*)\s*(\S*)/;
		var REGEX_CUT_B = /Exact_cut_for: ((?:[\s\S](?! spikes:))*[\s\S])\s*spikes: ([0-9]*)/;
		var REGEX_CUT_C = /[0-9]+/g;
		var MAX_LENGTH_MATCH_CUT_B = 300;//this is needed so that when we read in chunks of the cut file we dont have to apply the regex_b to the whole thing each time

		var ParseCutFile = function(file){
		
			// Read the file as a string to get the header 
			var reader = new FileReaderSync();
			var fullStr = reader.readAsBinaryString(file);
			
			var match = REGEX_CUT_A.exec(fullStr);		
			var cutProps = {};
        	cutProps.n_clusters =  parseInt(match[1]);
        	cutProps.n_channels =  parseInt(match[2]);
        	cutProps.n_params =  parseInt(match[3]);
        	match = REGEX_CUT_B.exec(fullStr);
        	cutProps.exp = match[1];
        	cutProps.N = parseInt(match[2]);
        	cutProps.dataStart = match.index + match[0].length;
        	cutProps.is_clu = false;
        
        	var cutStr = fullStr.slice(cutProps.dataStart);// results in a copy being made (probably)
        	var cut = []; //TODO: use Uin32Array instead
        	while(match = REGEX_CUT_C.exec(cutStr))
        		cut.push(parseInt(match[0]));
				
			main.CutFileRead(null,cutProps,cut);
		}
		
		var ParseCluFile = function(file){
			var reader = new FileReaderSync();
			var fullStr = reader.readAsBinaryString(file);
        	var cut = []; //TODO: use Uin32Array instead
			var match;
        	while(match = REGEX_CUT_C.exec(fullStr))
        		cut.push(parseInt(match[0]));
			var cutProps = {nGroups: cut.shift(),is_clu: true}
			main.CutFileRead(null,cutProps,cut);
		}
		
		// This function doesn't bother doing everything it just reads the experiment name
		var GetCutFileExpName = function(file,tet,filename){
			var reader = new FileReaderSync();
			var BLOCK_SIZE = 10*1024; //10KBs at a time.
			var str = "";
			for(var offset=0,match=null;!match && offset<file.size; offset+=BLOCK_SIZE){
				str = str.slice(-MAX_LENGTH_MATCH_CUT_B) + reader.readAsBinaryString(file.slice(offset,offset+BLOCK_SIZE));
				match = REGEX_CUT_B.exec(str);
				if(match){
					main.CutFileGotExpName(filename,match[1],tet);
					return;
				}
			}
			main.CutFileGotExpName(filename,null,tet); //couldn't find the name
		}
	}
	
	var setWorkerCode = function(){
		"use strict";
		var REGEX_HEADER_B = /(\S*) ([\S ]*)/g

		var ParseSetFile = function(file){
			// Read the file as a string to get the header 
			var reader = new FileReaderSync();
			var fullStr = reader.readAsBinaryString(file);
			var header = {};
			var match;
    		while (match = REGEX_HEADER_B.exec(fullStr))
    			header[match[1]] = match[2];
			main.SetFileRead(null,header,file.name);
		}
	}
	
	
	// ================= End Of Worker Code ========================================================================
	
	var BYTES_PER_POS_SAMPLE = 4 + 2 + 2 + 2 + 2 + 2 + 2 + (2 + 2) ;//the last two uint16s are numpix1 and bnumpix2 repeated
	var BYTES_PER_SPIKE = 4*(4 + 50);
    var SPIKE_FORMAT = "t,ch1,t,ch2,t,ch3,t,ch4";
    var POS_FORMAT = "t,x1,y1,x2,y2,numpix1,numpix2";
	var POS_NAN = 1023;
	
	var callbacks = {pos:[],cut:[],set:[],tet:[]};  //we use callback cues as the workers have to process files in order
	
    var LoadTetrodeWithWorker = function(file,callback){
		callbacks.tet.push(callback); 
		tetWorker.ParseTetrodeFile(file,SPIKE_FORMAT, BYTES_PER_SPIKE);
	}
	var TetrodeFileRead = function(errorMessage,header,buffer){
		if(errorMessage)
			throw(errorMessage);
		callbacks.tet.shift()({header:header,buffer:buffer});
	}	
	var GetTetrodeAmplitudeWithWorker = function(buffer,header,N,callback){
		callbacks.tet.push(callback); 
		buffer = buffer.slice(0); //we clone it so there is still a copy in the main thread;
		tetWorker.GetTetrodeAmplitude(buffer,N,[buffer]);
    }
	var GotTetAmps = function(ampsBuffer){
        callbacks.tet.shift()(new Uint8Array(ampsBuffer));
	}
	
	var LoadPosWithWorker = function(file,callback){
		callbacks.pos.push(callback);
    	posWorker.ParsePosFile(file,POS_FORMAT,BYTES_PER_POS_SAMPLE);
    }
	var PosFileRead = function(errorMessage,header,buffer){
		if(errorMessage)
			throw(errorMessage);
		callbacks.pos.shift()({header:header, buffer:buffer});
	}	
	
	var LoadSetWithWorker = function(file,callback){
		callbacks.set.push(callback);
    	setWorker.ParseSetFile(file);
    }
	var SetFileRead = function(errorMessage,header,filename){
		if(errorMessage)
			throw(errorMessage);
		callbacks.set.shift()({header:header});
	}	
	
	//LoadCutWithWorker and LoadCluWithWorker both use the same callback queue and CutFileRead function below.
	var LoadCutWithWorker = function(file,callback){
		callbacks.cut.push(callback);
		cutWorker.ParseCutFile(file);
	}
	var LoadCluWithWorker = function(file,callback){
		callbacks.cut.push(callback);
		cutWorker.ParseCluFile(file);
	}
	var CutFileRead = function(errorMessage,header,cut){
		if(errorMessage)
			throw(errorMessage);
		callbacks.cut.shift()({cut:cut, header:header});
	}
	
	var GetCutExpNameWithWorker = function(file,tet,callback){
		callbacks.cut.push(callback);
		cutWorker.GetCutFileExpName(file,tet,file.name);
	}
	var CutFileGotExpName = function(fileName,expName,tet){
		callbacks.cut.shift()(fileName,expName,"cut",tet);
	}

	var tetWorker = BuildBridgedWorker(tetWorkerCode,["ParseTetrodeFile","GetTetrodeAmplitude*"],["TetrodeFileRead*","GotTetAmps*"],[TetrodeFileRead,GotTetAmps]);	
	var posWorker = BuildBridgedWorker(posWorkerCode,["ParsePosFile"],["PosFileRead*"],[PosFileRead]);	
	var cutWorker = BuildBridgedWorker(cutWorkerCode,["ParseCutFile","ParseCluFile","GetCutFileExpName"],["CutFileRead","CutFileGotExpName"],[CutFileRead, CutFileGotExpName]);	
	var setWorker = BuildBridgedWorker(setWorkerCode,["ParseSetFile"],["SetFileRead"],[SetFileRead]);	

	
    var GetPendingParseCount = function(){
        return callbacks.cut.length + callbacks.set.length + callbacks.tet.length + callbacks.pos.length;
    }
    
    var GetTetrodeTime = function(buffer,header,N){ //get spike times in milliseconds as a Uint32Array 
        var times = new Uint32Array(N);
    	var data = new Int32Array(buffer);

		for(var i=0; i<N; i++)
			times[i] = data[BYTES_PER_SPIKE/4*i]; //we are accessing the buffer as 4byte ints, we want the first 4bytes of the i'th spike

		if (endian == 'L') 
			for(var i=0;i<N; i++)
				times[i] = Swap32(times[i]);

		var timebase = parseInt(header.timebase);

		timebase /= 1000; //get it in miliseconds
		for(var i=0;i<N;i++)
			times[i] /= timebase;
            
        return times;
    }
    
	//TODO: probably want to have a function here which gets waveforms from the tetrode buffer so that other modules do not need to know details of the file format
	

	
    return {
        LoadPos: LoadPosWithWorker,
		LoadTetrode: LoadTetrodeWithWorker,
		LoadSet: LoadSetWithWorker,
        LoadCut: LoadCutWithWorker,
        LoadCut2: GetCutExpNameWithWorker,
		LoadClu: LoadCluWithWorker,
        GetPendingParseCount: GetPendingParseCount,
        GetTetrodeTime: GetTetrodeTime,
		GetTetrodeAmplitude: GetTetrodeAmplitudeWithWorker,
		BYTES_PER_POS_SAMPLE: BYTES_PER_POS_SAMPLE,
		BYTES_PER_SPIKE: BYTES_PER_SPIKE,
		POS_NAN: POS_NAN,
		NAN16: -32768//TODO: share this with pos worker properly
    }
    
}();