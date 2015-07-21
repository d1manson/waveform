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
		var DATA_END = "\r\ndata_end";
		var amps = null;
		var N = null;
		var buffer = null;

		var ParseTetrodeFile = function(file, SPIKE_FORMAT, BYTES_PER_SPIKE){
			buffer = N = amps = null; // invalidate old stuff

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
            
			//Sometimes DACQ creates a header with num_spikes >0, but there are no spikes (this happens when you choose not to record a given tetrode but a file previously existed)
			if(topStr.slice(dataStart,dataStart + DATA_END.length) == DATA_END){
				header.num_spikes_claimed = header.num_spikes;
				header.num_spikes = 0;
			}
	
            N = header.num_spikes;
    	    var dataLen = parseInt(N)*BYTES_PER_SPIKE;
		
			//read the data section of the file as an array buffer
    		buffer = reader.readAsArrayBuffer(file.slice(dataStart,dataStart+dataLen)); 
			var buffer_copy = buffer.slice(); // this is annoying, really we just need one copy which we aren't going to modify
			main.TetrodeFileRead(null,header,buffer_copy,[buffer_copy]);
			GetTetrodeAmplitude(false); // pre-cache amps, main is about to ask for them.
		}
		
		var GetTetrodeAmplitude_sub = function(oldData, amps, NxC, W){
			NxC = NxC | 0; // int
			W = W | 0; // int
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
		}
		var GetTetrodeAmplitude = function(call_main){
			if (!amps){
				var C = 4; //TODO: generalise this properly everywhere in the code
				var W = 50; //TODO: generalise this properly everywhere in the code
				
				var oldData = new Int8Array(buffer);
				var NxC = N*C;
				amps = new Uint8Array(NxC);
				GetTetrodeAmplitude_sub(oldData, amps, NxC, W);
			}
			if(call_main){
				var amps_copy = amps.buffer.slice(0)
				main.GotTetAmps(amps_copy,[amps_copy]);
			}
		}
	
		
	}
		
	var posWorkerCode = function(){
		"use strict"; // POS WORKER
		var NAN16 = -32768; //custom nan value, equal to minimum int16 value	
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
		
		var sqr = function(a){return a*a;}
	
		var clone = function(a){ 
			if(a.slice){
				return a.slice(0); //for basic arrays and pure ArrayBuffer
			}else{
				var result = new a.constructor(a.length); //
				result.set(a);
				return result;
			}
		}

		var minus = function(a,b,c){
			// we subtract b and c from alternate elemetns of a, inplace, NAN16 is skipped
			for(var i=0;i<a.length;i++){
    			a[i] -= a[i] == NAN16? 0 : b;
    			i++;
    			a[i] -= a[i] == NAN16? 0 : c;
    		}
		}
	
	
		var REGEX_HEADER_A = /((?:[\S\s](?!\r\ndata_start))*[\S\s])(\r\ndata_start)/
		var REGEX_HEADER_B = /(\S*) ([\S ]*)/g


		var ParsePosFile = function(file,POS_FORMAT,BYTES_PER_POS_SAMPLE,MAX_SPEED,SMOOTHING_W_S,HEADER_OVERRIDE,USE_BOTH_LEDS){
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
            
            // Apply overrides
            for (k in HEADER_OVERRIDE){
            	if(header[k] !== undefined)
            		header[k+"_original"] = header[k];
            	header[k] = HEADER_OVERRIDE[k];
            }

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

			PostProcessPos(header,buffer,BYTES_PER_POS_SAMPLE,MAX_SPEED,SMOOTHING_W_S,USE_BOTH_LEDS);
		}
		


		var interpXY_sub = function(XY,x_a,y_a,x_b,y_b,i,nNans){
			//interpolates from element i-1 back to i-nNans, where element i is x_b,y_b and element i-nNans-1 is x_a,x_b
			var dX = (x_b-x_a)/(nNans+1);
			var dY = (y_b-y_a)/(nNans+1);
			for(var j=0;j<nNans;j++){
				XY[(i-nNans + j)*2+0] = x_a + (j+1)*dX;
				XY[(i-nNans + j)*2+1] = y_a + (j+1)*dY; 
			}
		}
        
    	var interpXY = function(XY,nPos){
     	   /* 
     	   	Interpolates linearly across nan blocks for single XY stream.
     	   	Does it in place.

			TODO: verify that this does exactly what we want
     	   */

 	   		// Find first (x,y) that is non-nan
			for(var start=0; start<nPos; start++){
				var ix = start*2+0;
				var iy = start*2+1;
				if(XY[ix] != NAN16 && XY[iy] !=NAN16)
					break;
			}

			var ix = start*2+0;
			var iy = start*2+1;	
            var x_a = XY[ix];
            var y_a = XY[iy];
            var nNans = start; //this will cause first non-nan to be copied back through all previous nan values
            for(var i=start;i<nPos;i++){
				var ix = i*2+0;
				var iy = i*2+1;	
                var x_b = XY[ix];
                var y_b = XY[iy];
                if(x_b == NAN16 || y_b == NAN16){
                    nNans++;
                }else{
					if(nNans) 
						interpXY_sub(XY, x_a, y_a, x_b, y_b, i, nNans)
                    x_a = x_b;
                    y_a = y_b;
                    nNans = 0;
                }
            }
			
			if(nNans) //fill end-nan values with last non-nan val
				interpXY_sub(XY, x_a, y_a, x_a, y_a, i, nNans);

        }

		var smoooth1D_IN_PLACE = function(X,stride,k){
            //Box car smoothing of length 2*k + 1
			// (If we pretend the stride=1) The first few values of X will be:
			//  X[0] = (X[0] + X[1] + ... + X[k])/(k+1)
			//  X[1] = (X[0] + X[1] + ... + X[k+1])/(k+2)
			//  ... and then we get to..
			//  X[b] = (X[b-k] + ... + X[b] + ... X[b+k])/(2*k+1)
			// and then we ramp down at the end as with the start.
                     
            //A couple of checks for unimplemented generalisations...
            if(stride != 2)
                throw("stride must be 2");
            if(2*k+1 > 256)
                throw("smoothing kernel max length is 256")
			if(k==0)
				return; //no smoothing

            /* Note: (a & 0xff) is (a mod 256) */
            var n = X.length/2;
			
            var circBuff_1 = new X.constructor(256);
            var circBuff_2 = new X.constructor(256);
            var tot_1 = 0;
            var tot_2 = 0;
            
			//a is the lowest-index in the sum, b is the central and destination index, c is the highgest index in the sum
			var a=-2*k,b=-k,c=0; 
			
			// ramp up part 1: push the first k values into the buffer and sum
			for(;c<k;a++,b++,c++){
				tot_1 += circBuff_1[c & 0xff] = X[c*2 + 0]; 
                tot_2 += circBuff_2[c & 0xff] = X[c*2 + 1];
			}
			
			// ramp up part 2: calculate the first k values
            for(;a<0;a++,b++,c++){
				tot_1 += circBuff_1[c & 0xff] = X[c*2 + 0]; 
                tot_2 += circBuff_2[c & 0xff] = X[c*2 + 1];
                X[b*2+0] = tot_1 / (c+1);
				X[b*2+1] = tot_2 / (c+1);
            }
                
            // main section
			var d = 2*k+1;
			for(;c<n;a++,b++,c++){
				tot_1 += circBuff_1[c & 0xff] = X[c*2 + 0]; 
                tot_2 += circBuff_2[c & 0xff] = X[c*2 + 1];
				X[b*2+0] = tot_1/d;
				X[b*2+1] = tot_2/d;
				tot_1 -= circBuff_1[a & 0xff]; 
                tot_2 -= circBuff_2[a & 0xff];
			}
			
			// ramp down: calculate last k values
            for(;b<n;a++,b++,c++){
                X[b*2+0] = tot_1 / (n-a);
				X[b*2+1	] = tot_2 / (n-a);
				tot_1 -= circBuff_1[a & 0xff]; 
                tot_2 -= circBuff_2[a & 0xff];
            }
            
	}

	var JumpFilter = function(XY, nPos, MAX_SPEED, UNITS_PER_M, sampFreq){
		/*
			For a single stream of XY values, it finds the first non-nan point,
			and then checks the speed required to reach the next point, given the
			sampling rate.  If the speed is too high, it skips that point and calcualtes
			the speed required to get to the following point. This continues until,
			the speed requirement is satisfied. The "skipped" points are set to NAN, inplace.
			The number of points skipped over is returned as an integer.
		*/

		if(!MAX_SPEED)
			return 0;

		var sqrMaxSampStep = sqr(MAX_SPEED*UNITS_PER_M /sampFreq);

		// Find first (x,y) that is non-nan
		for(var start=0; start<nPos; start++){
			var ix = start*2+0;
			var iy = start*2+1;
			if(XY[ix] != NAN16 && XY[iy] !=NAN16)
				break;
		}
				
		var ix = start*2+0;
		var iy = start*2+1;		
		var x_from = XY[ix];
		var y_from = XY[iy];
		var jumpLen = 1;
		
		// Set big jump sections to nan
		for(var i=start+1,nJumpy=0; i<nPos; i++){
			var ix = i*2+0;
			var iy = i*2+1;
			// check if this pos is already nan
			// or if (dx^2 + dy^2)/dt^2 is greater than maxSpeed^2, where the d's are relative to the last "good" sample
			if(XY[ix] == NAN16 || XY[iy] == NAN16){
				XY[ix] = XY[iy] = NAN16; //just in case only one or the other was nan
				jumpLen++; // note we don't count njumpy here
			}else if ((sqr(x_from-XY[ix]) + sqr(y_from-XY[iy])) / sqr(jumpLen) > sqrMaxSampStep ){
				//sample is nan or speed is too large, so make this a jump
				XY[ix] = XY[iy] = NAN16; 
				nJumpy++;
				jumpLen++;
			}else{
				//speed is sufficiently small, so this point is ok
				jumpLen = 1;
				x_from = XY[ix];
				y_from = XY[iy];
			}
		}

		return nJumpy;
	}		

	var swap = function(A, B, do_swap){
		var n = 0;
		for(var i=0;i<A.length;i++) if(do_swap[i]){
			var tmp = A[i];
			A[i] = B[i];
			B[i] = tmp;
			n++;
		}
		return n;
	}

	var nanmean_and_std_2 = function(X){
		/* 
			X is nx2 array, we want nancount, nanmean, and nanstd for both columns.
		*/

		var sum_1 = 0; var sum_2 = 0;
		var n1 = 0; var n2 = 0;

		for(var i=0; i<X.length/2; i++){
			var i1 = i*2+0;
			var i2 = i*2+1;
			if(X[i1] && X[i1] != NAN16){
				n1++;
				sum_1 += X[i1];
			}
			if(X[i2] && X[i2] != NAN16){
				n2++;
				sum_2 += X[i2];
			}
		}
		var mean_1 = sum_1/n1; var mean_2 = sum_2/n2;

		// now get sum(sqr(xy-mean_xy)) and use to calculate nanstd...
		sum_1 = 0; sum_2 = 0;  // NOTE: reusing sums vars!!!!
		for (var i=0; i<X.length/2; i++){
			var i1 = i*2+0;
			var i2 = i*2+1;
			if(X[i1] && X[i1] != NAN16)
				sum_1 += sqr(X[i1] - mean_1);
			if(X[i2] && X[i2] != NAN16)
				sum_2 += sqr(X[i2] - mean_2);
		}
		var std_1 = Math.sqrt(sum_1/n1); var std_2 = Math.sqrt(sum_2/n2);

		return {mean_1: mean_1, mean_2: mean_2, std_1: std_1, std_2: std_2, n_1: n1, n_2: n2};
	}

	var CombineXY = function(XY1, XY2, weight_1, weight_2){
		/*
			XY1 and XY2 are both streams of (x,y) values. 
			We combine them into a single stream according to the ratio of the weights.
		*/
		var weight_sum = (weight_1 + weight_2);
		var weight_1 = weight_1/weight_sum;
		var weight_2 = weight_2/weight_sum;
		var ret = new XY1.constructor(XY1.length);
		for(var i=0;i<XY1.length/2;i++){
			var ix = 2*i+0;
			var iy = 2*i+1;
			ret[ix] = XY1[ix]*weight_1 + XY1[ix]*weight_2;
			ret[iy] = XY1[iy]*weight_1 + XY1[iy]*weight_2;
		}
		return ret;
	}

	var GetDirection = function(XY1, XY2){
		var ret = new Float32Array(XY1.length/2);
		var pi = 3.14159265;
		for(var i=0;i<XY1.length/2;i++){
			var ix = 2*i+0;
			var iy = 2*i+1;
			var dy = XY2[iy] - XY1[iy];
			var dx = XY2[ix] - XY1[ix];
			ret[i] = Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001 ? NaN : Math.atan2(dy, dx) + pi;
		}
		return ret;
	}

	var PostProcessPos = function(header,buffer,BYTES_PER_POS_SAMPLE,
					MAX_SPEED, /*meters per second, e.g. 5 */
					SMOOTHING_W_S, /* box car smoothing width in seconds, e.g. 0.2 */
					USE_BOTH_LEDS
					){
		
			var data = new Int16Array(buffer);
			var elementsPerPosSample = BYTES_PER_POS_SAMPLE/2;
			var nPos = parseInt(header.num_pos_samples); 
			var end = nPos * elementsPerPosSample; 
			
			var POS_NAN = 1023;

			 // for each pos sample take bytes 4-7, and then view them as a pair of int16s 
			var XY1 = new Int16Array(take(new Int32Array(buffer),1,BYTES_PER_POS_SAMPLE/4).buffer);
			replaceVal_IN_PLACE(XY1,POS_NAN,NAN16); //switch from axona custom nan value to our custom nan value
			
			var nLED = 1;
			if (USE_BOTH_LEDS){
				// Rather than using colactive header value in set file (which is a massive pain to get asynchrously here)
				// We see if any of the pixel counts are non-zero/non-nan for the second led, to establish how many leds were used.
				var XYpix = new Int16Array(take(new Int32Array(buffer), 3, BYTES_PER_POS_SAMPLE/4).buffer);
				replaceVal_IN_PLACE(XYpix,POS_NAN,NAN16); //switch from axona custom nan value to our custom nan value
				for(var i=0; i<nPos; i++){
					if(XYpix[i*2 +1] && XYpix[i*2 +1] != POS_NAN){
						nLED = 2;
						break;
					}
				} // if we make it to the end of the loop then nLED reamined as =1.

			}

			if(nLED == 2){
				 // for each pos sample take bytes 8-11, and then view them as a pair of int16s 
				var XY2 = new Int16Array(take(new Int32Array(buffer), 2, BYTES_PER_POS_SAMPLE/4).buffer);
				replaceVal_IN_PLACE(XY2,POS_NAN,NAN16); //switch from axona custom nan value to our custom nan value
			
			}
			
			if(header.need_to_subtract_mins){
				var min_x = parseInt(header.window_min_x);
				var min_y = parseInt(header.window_min_y);
				minus(XY1, min_x, min_y);
				if(nLED == 2)
					minus(XY2, min_x, min_y);
			}

			var ppm = parseInt(header.pixels_per_metre);
			var UNITS_PER_M = 10000;
			times_IN_PLACE(XY1, UNITS_PER_M/ppm,NAN16); //convert from pixels to milimeters (we use mm because then we can happily use Int16s)
			if(nLED == 2)
				times_IN_PLACE(XY2, UNITS_PER_M/ppm,NAN16); //convert from pixels to milimeters (we use mm because then we can happily use Int16s)

			if(nLED == 2){
				// check for and apply LED swaping...
				var shrunk_and_switched = new Uint8Array(nPos);  

				var SWAPPING_THRESH_PIX = 5; // it's a bit odd, but it seems this was always defined in pixels not cms.

				// firstly we check to see if number of pixels for first LED is actually closer to pixel count mean for second led,
				// where "closer" is defined as z-score, i.e. distance/std for the relevant distribution.
				var pix_props = nanmean_and_std_2(XYpix);
				var weight_1 = pix_props.n_1/nPos; var weight_2 = pix_props.n_2/nPos;

				var mean_1 = pix_props.mean_1; var mean_2 = pix_props.mean_2; var std_1 = pix_props.std_1; var std_2 = pix_props.std_2;
				header.POST_n_pix_led1 = "mean=" + pix_props.mean_1.toFixed(2) + " std=" + pix_props.std_1.toFixed(2) + " (nan count=" + (nPos - pix_props.n_1) + ")";
				header.POST_n_pix_led2 = "mean=" + pix_props.mean_2.toFixed(2) + " std=" + pix_props.std_2.toFixed(2) + " (nan count=" + (nPos - pix_props.n_2) + ")";

				// use std and mean to get z score of pix1 to pix1 and pix2
				for( var i=0; i< nPos; i++){
					var i1 = i*2+0;
					var i2 = i*2+1;
					if(XYpix[i1] && XYpix[i2] && XYpix[i1] != NAN16 && XYpix[i2] != NAN16){
						var z11 = (mean_1 - XYpix[i1])/std_1;
						var z12 = (XYpix[i1] - mean_2)/std_2;
						shrunk_and_switched[i] = z11 > z12;
					}
				}


				// Now we calculate jump distance (from time i-1 to time i)
				// four distnaces: led1 to led1, led1 to led2, led2 to led1, led2 to led2.
				// if the recorded version of distance is more than SWAPPING_THRESH_PIX further
				// than the potential "swapped" version, then consider it a swap.

				// Find first (x,y) that is non-nan on both XY and XY2
				for(var start=0; start<nPos; start++){
					var ix = start*2+0;
					var iy = start*2+1;
					if(XY1[ix] != NAN16 && XY1[iy] !=NAN16 && XY2[ix] != NAN16 && XY2[iy] !=NAN16)
						break;
				}

				for(var i = start+1; i<nPos; i++)if(shrunk_and_switched[i]){
					// we are going to do diffs with XY_i - XY_(i-1)
					var ix = i*2+0;
					var iy = i*2+1;
					var i_1x = i*2-2;
					var i_1y = i*2-1;
					if(XY1[ix] == NAN16 || XY1[iy] == NAN16 || XY2[ix] == NAN16 || XY2[iy] == NAN16){
						shrunk_and_switched[i] = 0;
						i++; // skip next iteration as well becuase the current index cannot be used as i, or as (i-1)
						shrunk_and_switched[i] = 0;
						continue; 
					}

					var dist12 = Math.hypot(XY1[ix] - XY2[i_1x],  XY1[iy] - XY2[i_1y]);
					var dist11 = Math.hypot(XY1[ix] - XY1[i_1x],  XY1[iy] - XY1[i_1y]);
					var dist21 = Math.hypot(XY2[ix] - XY1[i_1x],  XY2[iy] - XY1[i_1y]);
					var dist22 = Math.hypot(XY2[ix] - XY2[i_1x],  XY2[iy] - XY2[i_1y]);

					shrunk_and_switched[i] = (dist12 < dist11-SWAPPING_THRESH_PIX) || (dist21 < dist22 - SWAPPING_THRESH_PIX);

				}

				// Swap XY1 with XY2 where we decided we need to swap. (Note we use 32bit to swap 2x16bit XY in one go)
				header.POST_n_swapped = swap(new Uint32Array(XY1.buffer), new Uint32Array(XY2.buffer), shrunk_and_switched);
			}
			
			var sampFreq = parseInt(header.sample_rate);
			header.POST_n_jumpy_led1 = JumpFilter(XY1, nPos, MAX_SPEED, UNITS_PER_M, sampFreq)
			if(nLED == 2)
				 header.POST_n_jumpy_led2 = JumpFilter(XY2, nPos, MAX_SPEED, UNITS_PER_M, sampFreq);

			
			interpXY(XY1,nPos);
			if(nLED == 2)
				interpXY(XY2,nPos);

    		var k = Math.floor(sampFreq*SMOOTHING_W_S/2); //the actual filter will be of length k*2+1, which means it may be one sample longer than desired			
			smoooth1D_IN_PLACE(XY1, 2, k);
			var XY;
			if(nLED == 2){
				smoooth1D_IN_PLACE(XY2, 2, k);
				XY = CombineXY(XY1, XY2, weight_1, weight_2);
			}else{
				XY = XY1;
			}


			var dir = nLED == 2 ? GetDirection(XY1, XY2) : new Float32Array(0);

			header.max_vals = [(parseInt(header.window_max_y)-parseInt(header.window_min_y))*UNITS_PER_M/ppm ,
							   (parseInt(header.window_max_x)-parseInt(header.window_min_x))*UNITS_PER_M/ppm ]; //TODO: decide which way round we want x and y
			header.units_per_meter = UNITS_PER_M;
			main.PosFileRead(null,header, XY.buffer, dir.buffer, [XY.buffer, dir.buffer]);
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
	
	// ==== WORKER CODE ===============================================================================
	var eegWorkerCode = function(){
		"use strict";
		
		var REGEX_HEADER_A = /((?:[\S\s](?!\r\ndata_start))*[\S\s])(\r\ndata_start)/
		var REGEX_HEADER_B = /(\S*) ([\S ]*)/g
		var DATA_END = "\r\ndata_end";
		
		var ParseEEGFile = function(file){
		
			// Read the first 1024 bytes as a string to get the header and find the data start
			var reader = new FileReaderSync();
			var topStr = reader.readAsBinaryString(file.slice(0, 1024 + 1));
			var match = REGEX_HEADER_A.exec(topStr);
    		if(!match){
    			main.EEGFileRead('did not find end of header in eeg file.',[]);
    			return;
    		}
    		var dataStart = match.index + match[0].length;
    		var header = {};
    		var headerStr = match[0];
    		while (match = REGEX_HEADER_B.exec(headerStr))
    			header[match[1]] = match[2];
    
            var N = parseInt(header.num_EEG_samples);
			var b = parseInt(header.bytes_per_sample);
    	    var dataLen = N*b;
		
			//read the data section of the file as an array buffer
    		var buffer = reader.readAsArrayBuffer(file.slice(dataStart,dataStart+dataLen)); 
			
			main.EEGFileRead(null,header,buffer,[buffer]);
			
		}
	}
	
	// ================= End Of Worker Code ========================================================================
	
	var BYTES_PER_POS_SAMPLE = 4 + 2 + 2 + 2 + 2 + 2 + 2 + (2 + 2) ;//the last two uint16s are numpix1 and bnumpix2 repeated
	var BYTES_PER_SPIKE = 4*(4 + 50);
    var SPIKE_FORMAT = "t,ch1,t,ch2,t,ch3,t,ch4";
    var POS_FORMAT = "t,x1,y1,x2,y2,numpix1,numpix2";
	var POS_NAN = 1023;
	
	var callbacks = {pos:[],cut:[],set:[],tet:[],eeg:[]};  //we use callback cues as the workers have to process files in order
	
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
		tetWorker.GetTetrodeAmplitude(true);
    }
	var GotTetAmps = function(ampsBuffer){
        callbacks.tet.shift()(new Uint8Array(ampsBuffer));
	}
	
	var LoadPosWithWorker = function(file,state){
		callbacks.pos.push(state.callback);
    	posWorker.ParsePosFile(file,POS_FORMAT,BYTES_PER_POS_SAMPLE,state.MAX_SPEED,state.SMOOTHING_W_S,state.HEADER_OVERRIDE,state.USE_BOTH_LEDS);
    }
	var PosFileRead = function(errorMessage,header,buffer,dir_buffer){
		if(errorMessage)
			throw(errorMessage);
		callbacks.pos.shift()({header:header, buffer:buffer,dir:new Float32Array(dir_buffer)});
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

	var LoadEEGWithWorker = function(file,callback){
		callbacks.eeg.push(callback);
		eegWorker.ParseEEGFile(file);
	}
	var EEGFileRead = function(errorMessage,header,buffer){
		if(errorMessage)
			throw(errorMessage);
		callbacks.eeg.shift()({header: header,buffer:buffer});
	}
	
	var tetWorker = BuildBridgedWorker(tetWorkerCode,["ParseTetrodeFile","GetTetrodeAmplitude"],["TetrodeFileRead*","GotTetAmps*"],[TetrodeFileRead,GotTetAmps]);	
	var posWorker = BuildBridgedWorker(posWorkerCode,["ParsePosFile"],["PosFileRead*"],[PosFileRead]);	
	var cutWorker = BuildBridgedWorker(cutWorkerCode,["ParseCutFile","ParseCluFile","GetCutFileExpName"],["CutFileRead","CutFileGotExpName"],[CutFileRead, CutFileGotExpName]);	
	var setWorker = BuildBridgedWorker(setWorkerCode,["ParseSetFile"],["SetFileRead"],[SetFileRead]);	
	var eegWorker = BuildBridgedWorker(eegWorkerCode,["ParseEEGFile"],["EEGFileRead"],[EEGFileRead]);	
	
    var GetPendingParseCount = function(){
        return callbacks.cut.length + callbacks.set.length + callbacks.tet.length + callbacks.pos.length;
    }
    

    // The next three funcs are helpers for GetTetrodeTime
    var Swap32_vector = function(X){
    	for(var i=0;i<X.length; i++){
    		var val = X[i];
    		// copy-pasted from utils.js:Swap32 
			X[i] = ((val & 0xFF) << 24)
				   | ((val & 0xFF00) << 8)
				   | ((val >> 8) & 0xFF00)
				   | ((val >> 24) & 0xFF);
    	}
    }
    var Take_Strided = function(ret, X, stride){
    	// Takes the [0,2,3,...,n]*stride'th elements, and places in ret.
    	// n = ret.length
		for(var i=0,p=0; i<ret.length; i++, p+= stride)
			ret[i] = X[p]; 
    }
    var Divide = function(X,c){
    	for(var i=0; i< X.length; i++)
    		X[i] /= c;
    }

    var GetTetrodeTime = function(buffer,header,N){ //get spike times in milliseconds as a Uint32Array 
        var times = new Uint32Array(N);
    	var data = new Int32Array(buffer);

    	Take_Strided(times, data, BYTES_PER_SPIKE/4);

		if (endian == 'L') 
			Swap32_vector(times)

		Divide(times, parseInt(header.timebase)/1000) // get times in miliseconds
            
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
		LoadEEG: LoadEEGWithWorker,
        GetPendingParseCount: GetPendingParseCount,
        GetTetrodeTime: GetTetrodeTime,
		GetTetrodeAmplitude: GetTetrodeAmplitudeWithWorker,
		BYTES_PER_POS_SAMPLE: BYTES_PER_POS_SAMPLE,
		BYTES_PER_SPIKE: BYTES_PER_SPIKE,
		POS_NAN: POS_NAN,
		NAN16: -32768//TODO: share this with pos worker properly
    }
    
}();