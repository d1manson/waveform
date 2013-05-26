"use strict";

T.AC = function($caption,BYTES_PER_SPIKE,ComputeMatrix){
        
    var G_DM_Error = function(s){alert(s);};
    var L = 1024*6;
    var groups = 80;
    var threshold = 800;
    var chan = null;
    var sampInds = [];
    var remInds = [];
    var sampLinkage = null;
    var sampDist = null;
    var workerLinkage = new Worker('worker-agglomerate.js');
    var callback;
    
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
    	
    	var tmp = RandomInds(N,L,true);
    	sampInds = tmp[0];
    	remInds = tmp[1];
    	
    	//Prepare data for sending to gpu
    	var wave_width = 50;
    	var wave_width_pow2 = 64; //have to pad matrix to power of two.
    	var newBuffer = new ArrayBuffer(wave_width_pow2*L);
    	var newDataView = new Uint8Array(newBuffer);
    	var oldDataView = new Int8Array(buffer);
    	var offset = (channel-1)*54 + 4; //channel can be 1-4 , WARNING: not 0-3
    
    	//data matrix is of size [wave_width_pow2 x n]
    	for(var i=0;i<L;i++){
    		var i_samp = sampInds[i];
    		for(var j=0; j<wave_width;j++)
    			newDataView[i*wave_width_pow2 + j] = 128+oldDataView[i_samp*BYTES_PER_SPIKE + offset + j];
    	}
    	//go compute it...good luck!	  
    	console.time('GPU distmat');
    	ComputeMatrix(newBuffer,newBuffer,L,L,wave_width_pow2,GotDistMatrix,G_DM_Error,true);
    }
    
    
    var GotLinkage = function (e){
    	var vector = function(n){return new Uint32Array(new ArrayBuffer(n*4));}
    	
    	sampLinkage = e.data;
    	console.timeEnd('agglomorate');
    
    	var A = sampLinkage.aInd;
    	var B = sampLinkage.bInd;
    	
    	$caption.text('partitioning...');
    		
    	//Build nodeList, which gives the indicies of nodes that will be the group heads
    	var nodeList = T.nodeList = Array();
    	
    	
    	var K = groups;
    	var iThreshold = 2*L-K-1;
    	for(var i=iThreshold-L; i<L-1; i++){  
    		if(A[i] < iThreshold)
    			nodeList.push(A[i]);
    		if(B[i] < iThreshold)
    			nodeList.push(B[i]);		
    	}
    	
    	/*
    	var K = threshold;
    	var dA = sampLinkage.aDescCount;
    	var dB = sanoLinkage.bDescCount;
    	for(var i=0; i<L-1; i++)if((dA[i]<K || dB[i]<K) && dA[i]+dB[i] > K){//that's not right, it should be weighted average of dA and dB
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
    			if(p[d] < L){ //this is a leaf node, store it in the list, and remove top of stack
    				cut_g.push(p[d]);
    				p.pop(); child.pop(); d--;
    			}else if(child[d] == 0){ //first hit of this node, so deal with first child
    				child[d] = 1;
    				p.push(A[p[d]-L]); child.push(0); d++;
    			}else if(child[d] == 1){ //second hit of this node, so go deal with second child
    				child[d] = 2; //we are now dealing with second child
    				p.push(B[p[d]-L]); child.push(0); d++; 
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
        
        //and we're done
    	$caption.text('complete');
    	callback(cut,chan);
    }
    
    
    var GotDistMatrix = function(dist){
    	console.timeEnd('GPU distmat');
        sampDist = dist;
    	
    	workerLinkage.onmessage = GotLinkage;
    	workerLinkage.postMessage({N: L});
    	console.time('agglomorate');
    	
    	$caption.text('linkage...');
    	workerLinkage.postMessage(dist);
    }
    
    
    return {
        DoAutoCut: ComputeDistMatrix
    }

}($('#autocut_caption'),T.BYTES_PER_SPIKE,T.DM.ComputeMatrix)

