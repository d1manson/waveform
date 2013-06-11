var M = {
	pick: function(from,indices){
		var result =  new from.constructor(indices.length); //make an array of the same type as the from array
		
		for(var i=0;i<indices.length;i++)
			result[i] = from[indices[i]];
			
		return result;
	},
	
	max: function(X){
		return Math.max.apply(null,X);
	},
	
	min: function(X){
		return Math.min.apply(null,X);
	},
	
	eq: function(X,v){
		var result = new Uint8Array(X.length);
		for(var i=0;i<X.length;i++)
			result[i] = X[i]==v;
		return result
	},
	
	sum: function(X){
		var result = 0;
		for(var i=0;i<X.length;i++)
			result += X[i];
		return result;
	},
	
	range: function(a,b){
		var result = new Int32Array(b-a+1);
		for(var i=a;i<=b;i++)
			result[i-a] = i;
		return result;
	},
	
	rdivide: function(numerator,denominator){
		//note that this returns a float array no matter what class the numerator and denonminator are
		var result = new Float32Array(numerator.length);
		for(var i=0;i<numerator.length;i++)
			result[i] = numerator[i]/denominator[i];
		return result;
	},
	
	useMask: function(vector,mask){
		//sets vector elemnts to zero where mask is true
		for(var i=0;i<mask.length;i++)
			if(mask[i])
				vector[i] = 0;
		//modifies vector in place
	},
	
	basic: function(typedArr){
		return Array.apply([],typedArr);//turns typed array into a basic javascript array
	}
}
