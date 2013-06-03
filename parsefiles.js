"use strict";

//T.PAR: consists of several functions that take a file handle and a callback.
// The functions asynchrounously parse the files into a header object and data buffer (if applicable)
// these two items then get provided to the callback.

T.PAR = function(BYTES_PER_POS_SAMPLE,BYTES_PER_SPIKE){

    var REGEX_CUT_A = /n_clusters:\s*(\S*)\s*n_channels:\s*(\S*)\s*n_params:\s*(\S*)\s*times_used_in_Vt:\s*(\S*)\s*(\S*)\s*(\S*)\s*(\S*)/;
    var REGEX_CUT_B = /Exact_cut_for: ((?:[\s\S](?! spikes:))*[\s\S])\s*spikes: ([0-9]*)/;
    var REGEX_CUT_C = /[0-9]+/g;
    var REGEX_HEADER_A = /((?:[\S\s](?!\r\ndata_start))*[\S\s])(\r\ndata_start)/
    var REGEX_HEADER_B = /(\S*) ([\S ]*)/g
    var SPIKE_FORMAT = "t,ch1,t,ch2,t,ch3,t,ch4";
    var POS_FORMAT = "t,x1,y1,x2,y2,numpix1,numpix2";
    var pendingParse = 0;
    
    var Swap16 = function (val) {
        return ((val & 0xFF) << 8) | ((val >> 8) & 0xFF);
    }
    
    var endian = (function(){
        var b = new ArrayBuffer(2);
        (new DataView(b)).setInt16(0,256,true);
        return (new Int16Array(b))[0] == 256? 'L' : 'B';
    })();

    var LoadTetrodeC = function(dataStart,dataLen,header,callback){
        return function(evt){
            //recieve main data
        	if (evt.target.readyState != FileReader.DONE)
        		return;
        	var buffer = evt.target.result.slice(dataStart,dataStart+dataLen);
            pendingParse--;
            callback({header:header,buffer:buffer});
        }
    }
    
    var LoadTetrodeB = function(file,callback){ 
    	return function(evt) {
    		//receive header data and being async reading of main data
    		if (evt.target.readyState != FileReader.DONE)
    			return;
    
    		var match = REGEX_HEADER_A.exec(evt.target.result);
    		if(!match){
    			alert('did not find end of header.');
    			return
    		}
    		var dataStart = match.index + match[0].length;
    		var header = {};
    		var headerStr = match[0];
    		while (match = REGEX_HEADER_B.exec(headerStr))
    			header[match[1]] = match[2];
    
    		if (header.spike_format != SPIKE_FORMAT){
    			alert("Code implements '" + SPIKE_FORMAT + "' format, but data is in '" +  header.spike_format + "'.");
    			return;  
    		}
    
            var N = header.num_spikes;
    	    var dataLen = parseInt(N)*BYTES_PER_SPIKE;
        
    		var reader = new FileReader();
    		reader.onloadend = LoadTetrodeC(dataStart,dataLen,header,callback);
    		reader.readAsArrayBuffer(file);
    	}
    }
    
    var LoadTetrodeA = function(file,callback){
    	//begin aysnc reading of header
        pendingParse++;
    	var reader = new FileReader();
    	reader.onloadend = LoadTetrodeB(file,callback);
    	reader.readAsBinaryString(file.slice(0, 1024 + 1));
    }
    
    //LoadCut2 just reads the experiment name from the header and sends the info elsewhere,
    //whereas LoadCut reads the full header and parses the remainder of the file into the cut array
    var LoadCut2B = function(file,tet,callback){
    	return function(evt){
    		//receive file data
    		if (evt.target.readyState != FileReader.DONE)
    			return;
    		var match = REGEX_CUT_B.exec(evt.target.result);
            pendingParse--;
    		callback(file.name,match[1],"cut",tet);
    	}
    }
    var LoadCut2A = function(file,tet,callback){
    	//begin async reading of the file
        pendingParse++;
    	var reader = new FileReader();
    	reader.onloadend = LoadCut2B(file,tet,callback);
    	reader.readAsBinaryString(file);
    }
    
    
    //LoadCut2 just reads the experiment name from the header and sends the info elsewhere,
    //whereas LoadCut reads the full header and parses the remainder of the file into the cut array
    var LoadCutB = function(callback,cutProps){
        return function(evt){
        	//receive file data
        	if (evt.target.readyState != FileReader.DONE)
        		return;
        
        	var match = REGEX_CUT_A.exec(evt.target.result);		
        	cutProps.n_clusters =  parseInt(match[1]);
        	cutProps.n_channels =  parseInt(match[2]);
        	cutProps.n_params =  parseInt(match[3]);
        	match = REGEX_CUT_B.exec(evt.target.result);
        	cutProps.exp = match[1];
        	cutProps.N = parseInt(match[2]);
        	cutProps.dataStart = match.index + match[0].length;
        	
        
        	var cutStr = evt.target.result.slice(cutProps.dataStart);// results in a copy being made (probably)
        	var cut = [];
        	while(match = REGEX_CUT_C.exec(cutStr))
        		cut.push(parseInt(match[0]));
            pendingParse--;
            callback({cut:cut,header:cutProps});
        }
    	
    }
    var LoadCutA = function(file,callback){
    	//begin async reading of the file
        pendingParse++;
    	var cutProps = {file_name: file.name};
    	var reader = new FileReader();
    	reader.onloadend = LoadCutB(callback,cutProps);
    	reader.readAsBinaryString(file);
    }
    
    
    var LoadPosC = function(swapBytes,dataStart,dataLen,header,callback){
    	return function(evt){
    		//recieve main data
    		if (evt.target.readyState != FileReader.DONE)
    			return;
    		var posBuffer = evt.target.result.slice(dataStart,dataStart+dataLen);
    		if(swapBytes){
    			var data = new Int16Array(posBuffer);
    			for (var k=0;k<data.length;k++) //note that timestamps are 4 bytes, so this is really unhelpful if you want to read timestamps
    				data[k] = Swap16(data[k]);
    		}
            pendingParse--;
    		callback({header:header,buffer:posBuffer});
    	}
    }
    
    var LoadPosB = function(file,callback){
    	return function(evt) {
    		//receive header data and being async reading of main data
    		if (evt.target.readyState != FileReader.DONE)
    			return;
    
    		var match = REGEX_HEADER_A.exec(evt.target.result);
    		if(!match){
    			alert('did not find end of header in pos file.');
    			return
    		}
    		var dataStart = match.index + match[0].length;
    		var posHeader = {};
    		var headerStr = match[0];
    		while (match = REGEX_HEADER_B.exec(headerStr))
    			posHeader[match[1]] = match[2];
        	var dataLen = parseInt(posHeader.num_pos_samples)*BYTES_PER_POS_SAMPLE;
            
    		if (posHeader.pos_format != POS_FORMAT){
    			alert("Code implements '" + POS_FORMAT + "' format, but pos data is in '" +  posHeader.pos_format + "'.");
    			return;  
    		}
    
    		var reader = new FileReader();
    		reader.onloadend = LoadPosC(endian == 'L',dataStart,dataLen,posHeader,callback);
    		reader.readAsArrayBuffer(file);
    	}
    }
    
    var LoadPosA = function(file,callback){
    	//begin async reading of the file
        pendingParse++;
    	var reader = new FileReader();
    	reader.onloadend = LoadPosB(file,callback);
    	reader.readAsBinaryString(file);
    }

	var LoadSetB = function(callback){
		return function(evt){
			//receive header data and being async reading of main data
    		if (evt.target.readyState != FileReader.DONE)
    			return;
				
    		var header = {};
    		var headerStr = evt.target.result;
			var match;
    		while (match = REGEX_HEADER_B.exec(headerStr))
    			header[match[1]] = match[2];
				
			pendingParse--;
			callback({header:header});
		}
	}
	
	var LoadSetA = function(file,callback){
	    //begin async reading of the file
        pendingParse++;
    	var reader = new FileReader();
    	reader.onloadend = LoadSetB(callback);
    	reader.readAsBinaryString(file);
	}
	
    var GetPendingParseCount = function(){
        return pendingParse;
    }
    
    return {
        LoadPos: LoadPosA,
        LoadCut: LoadCutA,
        LoadCut2: LoadCut2A,
        LoadTetrode: LoadTetrodeA,
		LoadSet: LoadSetA,
        GetPendingParseCount: GetPendingParseCount
    }
    
}(T.BYTES_PER_POS_SAMPLE,T.BYTES_PER_SPIKE)