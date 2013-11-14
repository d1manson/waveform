var M = {
	IN_PLACE: {}, //some of the functions below can take this as a flag and perform the calculation "in place", i.e. using one of the inputs as the output
	
	pick: function(from,indices){
		var result =  new from.constructor(indices.length); //make an array of the same type as the from array
		
		for(var i=0;i<indices.length;i++)
			result[i] = from[indices[i]];
			
		return result;
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
        
	
	basic: function(typedArr){
		return Array.apply([],typedArr);//turns typed array into a basic javascript array
	}
}
