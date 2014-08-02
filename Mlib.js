var M = {
	IN_PLACE: {}, //some of the functions below can take this as a flag and perform the calculation "in place", i.e. using one of the inputs as the output
	
	pick: function(from,indices){
		// Take elements specified by indicies from the 1d array "from".
		var result =  new from.constructor(indices.length); //make an array of the same type as the from array
		
		for(var i=0;i<indices.length;i++)
			result[i] = from[indices[i]];
			
		return result;
	},
	
	take: function(data,offset,stride){
		// takes every stride'th element from data, starting with the offset'th element
		
		var n = data.length/stride;
		var res = new data.constructor(n);
		
		for(var i=0,j=offset;i<n;i++,j+=stride)
			res[i] = data[j];
		return res;
	},
		
	max: function(X){
        var m = X[0];
        for(var i = 1;i< X.length; i++){
            (m < X[i]) && (m = X[i])
        }
        return m; //Math.max works recursively and fails for large enough arrays
	},
	
	min: function(X){
        var m = X[0];
        for(var i = 1;i< X.length; i++){
            (m > X[i]) && (m = X[i])
        }
        return m; //Math.min works recursively and fails for large enough arrays
    },

	argmax: function(X){
        var m = X[0];
		var m_i = 0;
        for(var i = 1;i< X.length; i++){
            (m < X[i]) && ((m_i = i) && (m = X[i])) //based on max function above, but not tested this for performance
        }
        return m_i; 
	},

	
	eq: function(X,v){
		var result = new Uint8Array(X.length);
		for(var i=0;i<X.length;i++)
			result[i] = X[i]==v;
		return result
	},
	
	or: function(a,b,flag){
		//bitwise or
		if(flag === M.IN_PLACE){
			for (var i=0;i<a.length;i++)
				a[i] |= b[i]; 	
		}else{
			var result = new Uint8Array(a.length);
			for (var i=0;i<a.length;i++)
				result[i] = a[i] | b[i]; //bitwise or
			return result;			
		}
	},
	
	sum: function(X){
		var result = 0;
		for(var i=0;i<X.length;i++)
			result += X[i];
		return result;
	},
	
	repvec: function(a,n){
		//analogous to Matlab's repmat, but this just repeats the value a n-times.
		var result = new Uint8Array(n);
		for (var i=0;i<n;i++)
			result[i] = a;
		return result;
	},
	
	concat: function(/*v_1,v_2,...*/){
		//output is the same type as the first input (beware of unexpected casting behaviour)
		//if you need to force a different type, provide a 0-length array as the first input
		
		var n = 0;
		for(var i=0;i<arguments.length;i++)
			n+=arguments[i].length;
			
		//now that we know how long the array is going to be we can copy the values across
		var result = new arguments[0].constructor(n); 
		n = 0;
		for(var i=0;i<arguments.length;i++){
			result.set(arguments[i],n);
			n+=arguments[i].length;
		}
		return result;
	},
	
	clone: function(a){ 
		if(a.slice){
			return a.slice(0); //for basic arrays and pure ArrayBuffer
		}else{
			var result = new a.constructor(a.length); //
			result.set(a);
			return result;
		}
	},
	
	range: function(a,b){
		var result = new Int32Array(b-a+1);
		for(var i=a;i<=b;i++)
			result[i-a] = i;
		return result;
	},
	
	rdivide: function(numerator,denominator,flag){
		if(flag == M.IN_PLACE){
			for(var i=0;i<numerator.length;i++)
				numerator[i] /= denominator[i];
		}else{
			//note that this returns a float array no matter what class the numerator and denonminator are
			var result = new Float32Array(numerator.length);
			for(var i=0;i<numerator.length;i++)
				result[i] = numerator[i]/denominator[i];
			return result;
		}
	},
	
	times: function(src,factor,flag){
		if(flag == M.IN_PLACE){
			for(var i=0;i<src.length;i++)
				src[i] *= factor;
		}else{
			var result = new src.constructor(src.length);
			for(var i=0;i<src.length;i++)
				result[i] = src[i]*factor;
			return result;
		}
	},
	
	useMask: function(vector,mask,val){
		//sets vector elemnts to val where mask is true, if val is omitted it defaults to zero
		
		val = typeof(val) === "number" ? val : 0;
		for(var i=0;i<mask.length;i++)
			if(mask[i])
				vector[i] = val;
		//modifies vector in place 
		//TODO: implement consistent behaviour using the IN_PLACE flag
	},
	
	accumarray: function(inds,values,fn){
		if(fn == "mean"){
			var S = M.max(inds) + 1; //zero-based indexing, remember!
			var result = new Float32Array(S); //we assume that whatever the class was we still want a float for the means
			var counts = new Uint32Array(S);
			for(var i=0;i<inds.length;i++){
				result[inds[i]] += values[i];
				counts[inds[i]]++;
			}			
			for(var i=0;i<S;i++)
				result[i] /= counts[i];
			return result;
		}else if (fn == "sum" && values == 1){
    	    var S = M.max(inds) + 1; //zero-based indexing, remember!
			var counts = new Uint32Array(S);
			for(var i=0;i<inds.length;i++)
				counts[inds[i]]++;
			return counts;
		}else
			throw(fn + " is not implemetned, sorry");
		
	},
	
    toInds: function(vals,binWidth){
        //as the moment this is just doing a division
        var ret = new Uint32Array(vals.length); //note we'll have problems with negative values
        for(var i=0;i<vals.length;i++)
            ret[i] = vals[i]/binWidth; // integer assignation is floor
        return ret;
    },
    
	sort: function(x,flag){
		if(flag === M.IN_PLACE){
			Array.prototype.sort.call(x,function(a,b){return a-b;});
		}else{
			var x_ = M.clone(x);
			Array.prototype.sort.call(x_,function(a,b){return a-b;});
			return x_;
		}
		
	},
    
    smooth: function(matrix,nX,nY){
        //Note that there is no normalisation (for nan smooth user can smooth a counts matrix and then use rdivide)!!
        
		var result = new matrix.constructor(matrix.length);
        var counts = new Uint32Array(matrix.length);
		var W = 2; //kernle is box-car of size 2W+1

		for(var ky=-W;ky<=W;ky++)for(var kx=-W;kx<=W;kx++){//for each offset within the kernel square
			var y0 = ky<0? 0 : ky;
			var x0 = kx<0? 0 : kx;
			var yend = ky>0? nY : nY+ky;
			var xend = kx>0? nX : nX+kx;
            
			for(var y=y0;y<yend;y++)for(var x=x0;x<xend;x++)
				result[y*nX +x] += matrix[(y-ky)*nX +(x-kx)];

		}	
        
		return result; 
	},
        
	smooth1D: function(X,stride,k,flag){
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
			if(flag != M.IN_PLACE)
				throw("smoothing must be done in place")
            
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
            
	},
	
	basic: function(typedArr){
		return Array.apply([],typedArr);//turns typed array into a basic javascript array
	},
	
	SGolayGeneralised: function(data,m,n,s){
		//Does a least-squares fit of nth order polynomials to the 2m+1 data points centered on each point of data.X and returns the 
		//s order derivative evaluated at each point of data.X.
		//
		// data.X contains contiguous blocks of "vectors" each of which should be independently SGolay'ed.
		// the total number of vectors is data.N, the length of the vectors is data.W.
		// In order to account for blocks of non-relevant data within X, you also specify the full step size
		// to get from one vector to the next, data.S. The offset from the start to the first vector is given
		// by data.off.  The output will have the same form as the input.
		//  
		//  [data.off data.W ???] [data.off data.W ???] [data.off data.W ???]    data.off + data.W + ??? = data.S
		//
		//
		//See [http://pubs.acs.org/doi/pdf/10.1021/ac00205a007]
		// "General Least-Squares Smoothing and Differentiation by the Convolution (Savitzky-Golay) Method. P. Gorry 1989."
		
		var GramPoly = function (i,m,k,s){
			//Recursively calculates the Gram Polynomial (s=0), or its s'th derivative, evaluated at i, order k, over 2m+l points
			if(k>0)
				return (4*k-2)/(k*(2*m-k+1))*(i *GramPoly(i,m,k-1,s) + s*GramPoly(i,m,k-1,s-1))
						- ((k-1)*(2*m+k))/(k*(2*m-k+1))*GramPoly(i,m,k-2,s) 
			else 
				return k==0 && s== 0? 1 : 0 
		};
		
		var GenFact =  function(a,b) {
			//Calculates the generalised factorial (a)(a-l) ... (a-b+l) 
			for (var gf=1,j=(a-b+1);j<=a;j++)
					gf *= j;
			return gf;
		};
		
		var Weight =  function(i,t,m,n,s){ 
			//Calculates the weight of the i'th data point for the t'th Least-Square point of the s'th derivative, over 2m+1 points order n
			var sum = 0;
			for (var k=0;k<=n;k++)
				sum += (2*k+1)*(GenFact(2*m,k)/GenFact(2*m+k+1,k+1)) *GramPoly(i,m,k,0)*GramPoly(t,m,k,s);
			return sum;
		};

		var T = data.W;
		var Yfull = new Float32Array(data.X.length);
			
		//calculate weights for the first m Y values using the first 2m+1 X values
		var weight_it_start = new Float32Array(m*(2*m+1));
		for(var t=-m;t<0;t++)
			for(var i=-m;i<=m;i++)
				weight_it_start[(t+m)*(2*m+1) + i+m] = Weight(i,t,m,n,s);
				
		//calculate weights for Y values m+1 to T-m-1 using all the X values	
		var weight_i = new Float32Array(2*m+1);
		for(var i=-m;i<=m;i++)
			weight_i[i+m] = Weight(i,0,m,n,s); //With t=0, this is a standard S-G filter

		//calculate weights for the last m Y values using the last 2m+1 X values
		var weight_it_end = new Float32Array(m*(2*m+1));
		for(var t=1;t<=m;t++)
			for(var i=-m;i<=m;i++)
				weight_it_end[(t-1)*(2*m+1) +i+m] = Weight(i,t,m,n,s);


		for(var xx=0;xx<data.N;xx++){
			var X = data.X.subarray(data.off + data.S*xx, data.off + data.S*xx + data.W);
			var Y = Yfull.subarray(data.off + data.S*xx, data.off + data.S*xx + data.W);
			
			//calculate the first m Y values using the first 2m+1 X values
			for(var t=-m;t<0;t++)
				for(var i=-m;i<=m;i++)
					Y[t+m] += X[i+m] * weight_it_start[(t+m)*(2*m+1) + i+m];

			//calculate Y values m+1 to T-m-1 using all the X values					
			for(var yy=m+1;yy<=T-m;yy++)
				for(var i=-m;i<=m;i++)
					Y[yy-1] += X[yy+i-1] * weight_i[i+m];
			
			//calculate the last m Y values using the last 2m+1 X values
			for(var t=1;t<=m;t++)
				for(var i=-m;i<=m;i++)
					Y[t+ T-m-1] += X[i+T-m-1] * weight_it_end[(t-1)*(2*m+1) +i+m];
		}
		
		return Yfull;
	},
	
	circConv: function(source,filter,ret){
		// Assume:
		// source is even length
		// filter is same length as source, but is symmetric with only half actually provided.
		
		var L_s = source.length;
		var L2_s = L_s/2;
		
		for(var a=L2_s,b=0,p=L2_s;a<L_s;a++,b++,p--){ //compute the convolution at two points, a and b, where a=b+L/2
			var v_a = 0,v_b=0;
			for(var j=0;j<p;j++){ //Apply the central section of the filter around the point a and the peripheral section around the point b
				v_a += (source[a-1-j] + source[a+j])*filter[j];
				v_b += (source[p-1-j] + source[p+j])*filter[L2_s-1-j];
			}
			for(j=0;j<b;j++){ // Apply the peripheral section of the filter around the antipodes of a and b, i.e. around the point a-L/2 and b+L/2
				v_a += (source[b-1-j] + source[b+j])*filter[L2_s-1-j];
				v_b += (source[b-1-j] + source[b+j])*filter[j];
			}
			ret[a] = Math.min(Math.max(v_a,-128),127); 
			ret[b] = Math.min(Math.max(v_b,-128),127); 
		}
	},
	
	circShift: function(X,s,ret){
		var L = X.length;
		s = (s+L)%L;//ensure s is positive
		ret.set(X.subarray(s),0);
		ret.set(X.subarray(0,s),L-s);
	}
	

}
