"use strict";

T.AC = function($caption,BYTES_PER_SPIKE,ComputeMatrix){
        
    var G_DM_Error = function(s){alert(s);};
    var L = 1024*6;
    var groups = 250;
    var thresholdDist = 800;
	var joinRatioThreshold = 1.2;
	var jRvsD = [3,0.003];
    var chan = null;
    var sampInds = [];
    var remInds = [];
    var sampLinkage = null;
    var sampDist = null;
    var callback;
    
	var workerLinkage = BuildWorker(function(){
		"use strict";
		//Based on : http://figue.googlecode.com/svn/trunk/figue.js
		//For an "official" paper with a very similar algorithm see the "The generic clustering algorithm" in..
		//	Modern hierarchical, agglomerative clustering algorithms, Daniel M?llner 2011.
		//		http://arxiv.org/pdf/1109.2378.pdf

		var inf32 = Math.pow(2,32)-1;
		var params = {N:0,S:0};
		var dist;
		function vector(n){
			return new Uint32Array(new ArrayBuffer(n*4));
		}

		self.onmessage = function(e) {
			var data = e.data;

			if(data.N !== undefined || data.S !== undefined){
				params.N = data.N || params.N;
				params.S = data.S || params.S;
			}else{
				// otherwise data is ArrayBuffer
				var ret = Agglomerate(params.N,new Uint16Array(data),params.S);
				data = null; //this destroys the distance matrix entierly, since there was only ever one copy (it was passed to the worker and released from the main thread)		
				self.postMessage(ret);
			}
		}

		function MaskedMinSearch(X,mask,S){
			var min_ind = 0;
			var min_val = inf32;
			for(var i=0; i<S; i++) if(mask[i] && X[i] < min_val){
						min_ind = i;
						min_val = X[i];
			}
			return {val: min_val,ind: min_ind};
		}

		function MaskedWeightedMeanRowCol(X,mask,aInd,bInd,wA,wB,N,S){
			//for a symmetrix matrix, X, it replaces column aInd and row aInd with the weighted sum of the data in aInd and bInd,
			//mask is a vector, the same length as the sides of X, which specifies which entries in the row/col to modify.
			var inverseSumWaWb = 1/(wA + wB);
			
			for (var i=0; i<S; i++) if(mask[i])
				X[i*N +aInd] = X[aInd*N +i] =  ( wA * X[aInd*N +i] + wB * X[bInd*N +i])  * inverseSumWaWb;
		}
					
		function Agglomerate(N,dist,S) {
				var S_, i, j, p, childA, childB, min_inds, min_vals, 
					descendants, wA, wB, wAB, desA, desB,
					global_min_val, aInd, bInd, min_ind, min_val, P, tmp, joinDist;

				S_ = S-1;

				//The result will be this list of pairs: (aInd,bInd,aDescendantCount,bDescendantCount,dist_ab)
				childA = vector(S_);
				childB = vector(S_);
				desA = vector(S_);
				desB = vector(S_);
				joinDist = vector(S_);

				// This will keep track of the minimum for each row
				min_inds = vector(S);
				min_vals = vector(S);

				// This will keep track of the number of descendants for each of the elements
				descendants = vector(S);
				for(i=0;i<S;i++)
					descendants[i] = 1;

				//Set diagonal of dist matrix to infinity
				for(i=0;i<S;i++)
					dist[i*N+i] = inf32;

				// Initialise min_inds and min_vals
				for(i=0;i<S;i++){    
					min_val = inf32;
					min_ind = 0;
					for(j=0;j<S;j++)if(dist[i*N+j]<min_val){
						min_val = dist[i*N+j];
						min_ind = j;
					}
					min_vals[i] = min_val;
					min_inds[i] = min_ind;
				}
				
				// Main loop
				for (p=0; p<S_; p++){
					// Using the pre-computed row minima, find the global minima, (aInd,bInd)
					tmp = MaskedMinSearch(min_vals,descendants,S);
					aInd = tmp.ind;
					global_min_val = tmp.val;
					bInd = min_inds[aInd];

					//Record that these children are the p'th siblings, note that we correct the numbering system after the main loop
					childA[p] = aInd;
					childB[p] = bInd;
					joinDist[p] = global_min_val;

					//Get the old descendant counts, and store the new values
					desA[p] = wA = descendants[aInd];
					desB[p] = wB = descendants[bInd];
					descendants[aInd] = wA+wB;
					descendants[bInd] = 0; //this acts as a flag in the 4 inner loops

					//Overwrite row aInd and col aInd with the wieghted average of the children's dists
					MaskedWeightedMeanRowCol(dist,descendants,aInd,bInd,wA,wB,N,S);
					dist[aInd*N +aInd] = inf32; //set (aInd,aInd) back to inf32

					//Find row-a's new minimum value and its ind
					tmp = MaskedMinSearch(dist.subarray(aInd*N,aInd*N+S),descendants,S); 
					min_inds[aInd] = tmp.ind;
					min_vals[aInd] = tmp.val;

					//Update any minima that pointed to column-b, to now point to column-a 
					//not quite sure why this is guaranteed to be true, but I can just about believe that it is
					for (i=0; i<S; i++) if (descendants[i] && min_inds[i] == bInd){
						min_inds[i] = aInd;
						min_vals[i] = dist[aInd*N + i];			
					}

				}


				//number each leaf from 0 to S-1 and each node from S to 2S-2, and rename childA and childB to reflect this scheme
				P = vector(S);// keep track of which node is held in each slot
				for(i=0;i<S;i++)
					P[i] = i;

				for(i=0; i<S_; i++){
					tmp = childA[i];
					childA[i] = P[tmp];
					childB[i] = P[childB[i]];
					P[tmp] = i+S;
				}	

				return {aInd: childA, bInd: childB, aDescCount: desA, bDescCount: desB, dist: joinDist};
		}
	});
		
		
    var RandomInds = function(n,k,doSort) {
    //returns an array of k unique integers in the range [0 n-1]
      var rem_inds = Array(n);
      for (var i=0; i<n; i++)
    	rem_inds[i] = i;
    	
      var chosen_inds = [];
      for (var i=0; i < k; i++) 
        chosen_inds.push(rem_inds.splice(Math.floor(Math.random() * (n-i)),1)[0]);
    
      if (doSort)
    	chosen_inds.sort(function(a,b){return a-b;});
    	
      return [chosen_inds,rem_inds];
    }
    
    
    var ComputeDistMatrix = function(channel,N,buffer,callback_in){
    	$caption.text('dist matrix...');
    	chan = channel;
        callback = callback_in;
    	
		if(N>L){
			var tmp = RandomInds(N,L,true);
			sampInds = tmp[0];
			remInds = tmp[1];
    	}else{
			sampInds = M.basic(M.range(0,N-1));
			remInds = [];
		}
		
    	//Prepare data for sending to gpu
    	var wave_width = 50;
    	var wave_width_pow2 = 64; //have to pad matrix to power of two.
    	var newBuffer = new ArrayBuffer(wave_width_pow2*L);
    	var newDataView = new Uint8Array(newBuffer);
    	var oldDataView = new Int8Array(buffer);
    	var offset = (channel-1)*54 + 4; //channel can be 1-4 , WARNING: not 0-3
    
    	//data matrix is of size [wave_width_pow2 x n]
    	for(var i=0;i<sampInds.length;i++){
    		var i_samp = sampInds[i];
    		for(var j=0; j<wave_width;j++)
    			newDataView[i*wave_width_pow2 + j] = 128+oldDataView[i_samp*BYTES_PER_SPIKE + offset + j];
    	}
    	//go compute it...good luck!	  
    	console.time('GPU distmat');
    	ComputeMatrix(newBuffer,newBuffer,L,L,wave_width_pow2,GotDistMatrix,G_DM_Error,true);
    }
    
    
    var GotLinkage = function (e){
    	var vector = function(len){return new Uint32Array(len);}
    	
    	sampLinkage = e.data;
    	console.timeEnd('agglomorate');
    
    	var A = sampLinkage.aInd;
    	var B = sampLinkage.bInd;
    	
    	$caption.text('partitioning...');
    		
    	//Build nodeList, which gives the indicies of nodes that will be the group heads
    	var nodeList = T.nodeList = Array();
    	
    	var n = sampInds.length;
		
		/*
    	var K = groups;
    	var iThreshold = 2*n-K-1;
    	for(var i=iThreshold-n; i<n-1; i++){  
    		if(A[i] < iThreshold)
    			nodeList.push(A[i]);
    		if(B[i] < iThreshold)	
    			nodeList.push(B[i]);		
    	}
    	*/
    	
		
		var ds = sampLinkage.dist;
		var nA = sampLinkage.aDescCount;
    	var nB = sampLinkage.bDescCount;
		
		//compute "join ratio" = "new average dist" / "weighted mean of the two constituent average dists"
		var joinRatio = new Float32Array(n-1);
		for(var i=0;i<n-1;i++)
			joinRatio[i] = ds[i] *(nA[i] + nB[i])/(nA[i] * (A[i]<n? 0 : ds[A[i]-n]) + nB[i] * (B[i]<n? 0 : ds[B[i]-n]))
		
		//find first over-threhold node
		var start = 0;
		for(start=0;start<n;start++)
			if(ds[start] > thresholdDist)
				break;
		//TODO: what if start==n?
		
		for(var i=start;i<n;i++){
			var tA = A[i] < n || !isNaN(joinRatio[A[i]-n]);
			var tB = B[i] < n || !isNaN(joinRatio[B[i]-n]);
			
			if(joinRatio[i] > joinRatioThreshold || !tA || !tB || i==n-1){	//if this node is a bad join or one of its descendants contains group heads, or this is the root node
				if(tA) nodeList.push(A[i]);
				if(tB) nodeList.push(B[i]);
				joinRatio[i] = NaN;
			}
		}
		
		
		
		/*
		for(i=0;i<n-1;i++){
			if (joinRatio[i] < joinRatioThreshold){
				if(  (A[i] > n-1 || joinRatio[A[i]-n] == 0) 
				  && (B[i] > n-1 || joinRatio[B[i]-n] == 0) ){
					joinRatio[i] = 0;
					if(A[i] > n-1) joinRatio[A[i]-n] = Infinity;
					if(B[i] > n-1) joinRatio[B[i]-n] = Infinity;
				  }
			}
		}
		*/
		
		/*
		//start at the top and go down..doesn't work well
		for(i =n-2;i>-1 && nodeList.length<groups;i--){
			if (joinRatio[i] < joinRatioThreshold)
				nodeList.push(i+n);
			else if (joinRatio[i] < Infinity)
				continue;
			
			//If this node has Inifite joinRatio or has just been made into a node, then set its children to have infintie joinRatios
			//This will ensure that all descendants of a node will be set to Inifinity rather than potentially be added to the nodeList
			if(A[i] > n-1) joinRatio[A[i]-n] = Infinity;
			if(B[i] > n-1) joinRatio[B[i]-n] = Infinity;	
		}*/
		
		
		/*
    	var K = threshold;
    	var dA = sampLinkage.aDescCount;
    	var dB = sampLinkage.bDescCount;
    	for(var i=0; i<n-1; i++)if((dA[i]<K || dB[i]<K) && dA[i]+dB[i] > K){//that's not right, it should be weighted average of dA and dB
    		if(dA[i] < K)
    			nodeList.push(A[i]);
    		if(dB[i] < K)
    			nodeList.push(B[i]);		
    	}
    	*/
    	
    	
    	//For each node in the list collect all the leaf nodes
    	var G = nodeList.length;
    	var cut = Array(G);
    	for(var g=0;g<G;g++){
    		var cut_g = [];
    		//Starting at the node head, we recurse down to all the leaves (it looks like a loop but it is recursion)
    		
    		var p = [nodeList[g]]; //this will keep track of which node we are on at each depth
    		var d = 0; //this will hold the depth of the stack, not entierly neccessary but useful
    		var child = [0]; //this will keep track of how many of the two children we have recursed down at each depth
    
    		while(d>=0){
    			if(p[d] < n){ //this is a leaf node, store it in the list, and remove top of stack
    				cut_g.push(p[d]);
    				p.pop(); child.pop(); d--;
    			}else if(child[d] == 0){ //first hit of this node, so deal with first child
    				child[d] = 1;
    				p.push(A[p[d]-n]); child.push(0); d++;
    			}else if(child[d] == 1){ //second hit of this node, so go deal with second child
    				child[d] = 2; //we are now dealing with second child
    				p.push(B[p[d]-n]); child.push(0); d++; 
    			}else{ //we have dealt with both of this node's childem, so remove it from the top of the stack
    				p.pop(); child.pop(); d--;
    			}
    		}
    		cut[g] = cut_g;
    	}
    
    	//go from samp indicies back to original indicies
    	for(var g=0;g<G;g++){
    		var cut_g = cut[g];
    		for(var i=0, G_len=cut_g.length;i<G_len;i++)
    			cut_g[i] = sampInds[cut_g[i]];
    		cut[g] = cut_g;
    	}
    	
        //sort in descending order
    	cut.sort(function(a,b){return b.length-a.length;});

        //add the remainder waves on as group 0
        cut.unshift(remInds);
        
		//crop cut beyond n-groups
		while(cut.length>groups+1)
			cut[0] = cut[0].concat(cut.pop());
        
        //and we're done
    	$caption.text('complete');
    	callback(cut,chan);
    }
    
    
    var GotDistMatrix = function(dist){
    	console.timeEnd('GPU distmat');
        sampDist = dist;
    	
    	workerLinkage.onmessage = GotLinkage;
    	workerLinkage.postMessage({N: L, S: sampInds.length});
    	console.time('agglomorate');
    	
    	$caption.text('linkage...');
    	workerLinkage.postMessage(dist,[dist]);
    }
    
	// This last bit is for debugging only 
	var debugCanvas = null;
	var ImagescDist = function(){
		if (debugCanvas == null){
			debugCanvas =  $('<canvas/>', {heiGht: 1024, widtH: 1024});
			debugCanvas.css({position:"absolute",left:"200px", background:"#0f0"});
			$('body').append(debugCanvas);
			debugCanvas = debugCanvas.get(0);
		}
		
		(function(data16){ //note that this only shows the top-left 1024x1024 section of the matrix
			var ctx = debugCanvas.getContext('2d');
			var imageData = ctx.getImageData(0, 0, L, L);
			var data8 = imageData.data;
			
			for (var y = 0; y < 1024; ++y) 
				for (var x = 0; x < 1024; ++x) {
					var ind =  (y * L+ x) * 4;
					data8[ind+1] = data8[ind+2] = data8[ind] = data16[y*L +x] >> 3;
					data8[ind+3] = 255;
					if(data16[y*L +x] == Math.pow(2,16)-1)
						data8[ind] = 0;
				}
			ctx.putImageData(imageData, 0, 0);
			
		})(new Uint16Array(sampDist));
	}
	
    return {
        DoAutoCut: ComputeDistMatrix,
		ImagescDist: ImagescDist //for debugging only
    }

}($('#autocut_caption'),T.BYTES_PER_SPIKE,T.DM.ComputeMatrix)

