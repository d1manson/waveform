"use strict";
//Based on : http://figue.googlecode.com/svn/trunk/figue.js
//For an "official" paper with a very similar algorithm see the "The generic clustering algorithm" in..
//	Modern hierarchical, agglomerative clustering algorithms, Daniel Müllner 2011.
//		http://arxiv.org/pdf/1109.2378.pdf

var inf32 = Math.pow(2,32)-1;
var N;
var dist;
function vector(n){
	return new Uint32Array(new ArrayBuffer(n*4));
}

self.onmessage = function(e) {
	var data = e.data;

	if(data.N !== undefined){
		N = data.N;
	}else{
		// otherwise data is ArrayBuffer
		dist = new Uint16Array(data);
		var ret = Agglomerate(N,dist);
		self.postMessage(ret);
	}
}
  

function Agglomerate(N,dist) {
		var N_, i, j, p, childA, childB, min_inds, min_vals, 
			descendants, wA, wB, wAB, desA, desB,
			global_min_val, aInd, bInd, min_ind, min_val, P, tmp, joinDist;
			
		N = N;
		N_ = N-1;
		
		//The result will be this list of pairs: (aInd,bInd,aDescendantCount,bDescendantCount,dist_ab)
		childA = vector(N_);
		childB = vector(N_);
		desA = vector(N_);
		desB = vector(N_);
		joinDist = vector(N_);
		
		// This will keep track of the minimum for each row
		min_inds = vector(N);
		min_vals = vector(N);
		
		// This will keep track of the number of descendants for each of the elements
		descendants = vector(N);
		for(i=0;i<N;i++)
			descendants[i] = 1;
		
		//Set diagonal of dist matrix to infinity
		for(i=0;i<N;i++)
			dist[i*N+i] = inf32;
		
		// Initialise min_inds and min_vals
		for(i=0;i<N;i++){    
			min_val = inf32;
			min_ind = 0;
			for(j=0;j<N;j++)if(dist[i*N+j]<min_val){
				min_val = dist[i*N+j];
				min_ind = j;
			}
			min_vals[i] = min_val;
			min_inds[i] = min_ind;
		}
			
		// Main loop
		for (p=0; p<N_; p++){
			// Using the pre-computed row minima, find the global minima, (aInd,bInd)
			aInd = 0 ;
			global_min_val = inf32;
			for(i=0; i<N; i++) if(descendants[i] && min_vals[i] < global_min_val){
				aInd = i;
				global_min_val = min_vals[i];
			}
			bInd = min_inds[aInd];
	
			//Record that these children are the p'th siblings, note that we correct the numbering system after the main loop
			childA[p] = aInd;
			childB[p] = bInd;
			joinDist[p] = global_min_val;
			
			//Get the old descendant counts, and store the new values
			desA[p] = wA = descendants[aInd];
			desB[p] = wB = descendants[bInd];
			wAB = wA+wB;
			descendants[aInd] = wAB;
			descendants[bInd] = 0; //this acts as a flag in the 4 inner loops
			
			//Overwrite row aInd and col aInd with the wieghted average of the children's dists
			for (i=0; i<N; i++) if(descendants[i])
				dist[i*N +aInd] = dist[aInd*N +i] =  ( wA * dist[aInd*N +i] + wB * dist[bInd*N +i])  / wAB;
			dist[aInd*N +aInd] = inf32; //set (aInd,aInd) back to inf32
			
			//Find row-a's new minimum value and its ind
			min_val = inf32;
			min_ind = 0;
			for (i=0; i<N; i++) if (descendants[i] && dist[aInd*N +i] < min_val) {
				min_val = dist[aInd*N + i];
				min_ind = i;
			}
			min_inds[aInd] = min_ind;
			min_vals[aInd] = min_val;
			
			//Update any minima that pointed to column-b, to now point to column-a 
			//not quite sure why this is guaranteed to be true, but I can just about believe that it is
			for (i=0; i<N; i++) if (descendants[i] && min_inds[i] == bInd){
				min_inds[i] = aInd;
				min_vals[i] = dist[aInd*N + i];			
			}
			
		}
		
		
		//number each leaf from 0 to N-1 and each node from N to 2N-2, and rename childA and childB to reflect this scheme
		P = vector(N);// keep track of which node is held in each slot
		for(i=0;i<N;i++)
			P[i] = i;
			
		for(i=0; i<N_; i++){
			tmp = childA[i];
			childA[i] = P[tmp];
			childB[i] = P[childB[i]];
			P[tmp] = i+N;
		}	
	
		return {aInd: childA, bInd: childB, aDescCount: desA, bDescCount: desB, dist: joinDist};
}


/*
var imagesc = function(){
	var canvas =  $('<canvas/>', {heiGht: 1024, widtH: 1024});
	canvas.css({position:"absolute",background:"#0f0"});
	$('body').append(canvas);
	canvas = canvas.get(0);
	
	return function(data16){
		var ctx = canvas.getContext('2d');
		var imageData = ctx.getImageData(0, 0, 1024, 1024);
		var data8 = imageData.data;
		
		for (var y = 0; y < 1024; ++y) 
			for (var x = 0; x < 1024; ++x) {
				var ind =  (y * 1024 + x) * 4;
				data8[ind+1] = data8[ind+2] = data8[ind] = data16[y*1024 +x] >> 3;
				data8[ind+3] = 255;
				if(data16[y*1024 +x] == Math.pow(2,16)-1)
					data8[ind] = 0;
			}
		ctx.putImageData(imageData, 0, 0);
		
	}
}();
*/
