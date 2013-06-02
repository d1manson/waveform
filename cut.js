"use strict";

// The CUT module, the primary component of which is a class called cut
T.CUT = function(){//class factory
	
	//the object this._ is to be considered private, though it is actually public.  
	//Correct me if I'm wrong, but I think this is considered an ok way of emulating OOP in javascript - DM
	
	//static private functions, variables, and classes (some of which may be exported at the bottom of the factory)
	var changeCallbacks = []; //callbacks must be of the form foo(cut,changeFrom,changeTo,noInterior){ }, 
							  //where cut is the current cut object and changeFrom and changeTo give the range of modified cut groups, 
							  //noInterior is true if only the from- and to- groups changed and not the groups inbetween
							  //Note that the modules with these callbacks will recieve their first change event at the point a cut is constructed, 
							  //they are expected to already have any other needed data by that point (so you need to provide it separately before the new cut)
							  
	var actionCallbacks = []; //callbacks must be of the form foo(info){} where info is an object with at least a string proeprty named description
	
	//the undo stack is an array of these objects
	var action = function(type,data,description){ 
		this.type=type;
		this.data=data;
		this.description=description
	} 
	
	var AddChangeCallback = function(fn){
		changeCallbacks.push(fn);
	}
	var AddActionCallback = function(fn){
		actionCallbacks.push(fn);
	}
	//TODO: may want to implement RemoveCallback, which I think you can do by iterating through list and testing for equality of function objects
	
	var DoConstruction = function(data_type,data,description){
		switch (data_type){
		
		case 1: //data is an array specifying the group of each spike
			this._.cutInds = [[]];
			this._.N = data.length;
			for(var i=0;i<data.length;i++)
				if(this._.cutInds[data[i]] == undefined)
					this._.cutInds[data[i]] = [i];//new subarray
				else
					this._.cutInds[data[i]].push(i);//append to existing subarray
			break;
			
		case 2:
			this._ = JSON.parse(data); 
			//TODO: might be worth validating everything
			break;
			
		case 3: //data is already in the form we want cutInds to be
			this._.cutInds = data; //note we don't bother to clone the array, partly because it's two levels deep but mainly because we hopefully dont need to
			this._.N = 0;
			for(var i = 0;i<data.length;i++)
				this._.N += data[i].length; //count number of spikes in all groups, note that this must include all spikes or export to file will not give useful result
			break;
			
		case 4: //data is just N
			this._.N = data;
			var cut0 = [];
			for(var i=0;i<N;i++)
				cut0.push(i);
			this._.cutInds = [cut0]; //everything in group zero
			break;
		}
		
		PushAction.call(this,"load",{},description);
		TriggerCallbacks.call(this,0,this._.cutInds.length,false);
	}
	
	var GetJSONString = function(){
		//for keeping in localStorage or FileSystem API
		return JSON.stringify(this._); //this is sufficient at present because ._ data is simple, i.e. doesn't include any out-there object references and is not recursive
	}
	
	var PushAction = function(type,data,description){
		this._.actionStack.push(new action(type,data,description));
		//TODO: trigger action callback
	}
	
	var Undo = function(){
		//this is going to be exported (=made public), it calls the relevant inverse operation (which are private)
		if (this._.actionStack.length == 0)
			return;//nothing to undo
			
		var action = this._.actionStack.pop();
		var undone = true;
		if(action.type=="add")
			UndoAdd(action.data);
		else if(action.type=="swap")
			UndoSwap(action.data);
		else if(action.type=="reorder")
			UndoReorder(action.data);
		else
			undone = false;

		if(undone){
			//TODO: trigger action callback
		}else{
			this._.actionStack.push(action);//put it back
			//TODO: still ought to trigger action callback, providing info that action could not be undone
		}
	}
	
	var TriggerCallbacks = function(a,b,flag){
		for(var i=0;i<changeCallbacks.length;i++)
			changeCallbacks[i](this,Math.min(a,b),Math.max(a,b),flag);
	}
	
	var AddBToA = function(a,b){
		var lenB = this._.cutInds[b].length;
		this._.cutInds[a] = this._.cutInds[a].concat(this._.cutInds[b]);
		this._.cutInds[b] = [];
		PushAction("merge",[a,b,lenB],'merge group-' + b + ' into group-' + a);
		TriggerCallbacks(a,b,true);
	}
	
	var SwapBandA = function(a,b){
		var tmp = this._.cutInds[a];
		this._.cutInds[a] = this._.cutInds[b];
		this._.cutInds[b] = tmp;
		PushAction("swap",[a,b],"swap group-" + a + " and group-" + b);
		TriggerCallbacks(a,b,true);
	}
	
	var ReorderAll = function(newOrder){
		var oldCutInds = this._.cutInds;
		
		for(var i=0;i<newOrder.length;i++)
			this._.cutInds.push(oldCutInds[newOrder[i]] || []);
			
		PushAction("reorder",newOrder,"reorder groups");
		TriggerCallbacks(0,this._.cutInds.length,false);
	}
	
	//TODO: implement Undo* functions
	
	var GetGroup = function(g){
		return this._.cutInds[g] || [];
	}

	var GetProps = function(){
		return {exp_name: this._.exp_name, 
				tet_num: this._.tet_num,
				G: this._.cutInds.length};
	}
	
	var GetFileStr = function(){
		var N = this._.N;
		var cutInds = this._.cutInds;
		var G = cutInds.length;
		
		var theCut = new Uint32Array(N);
		G = G > 31? 31 : G; // groups 0-30, spikes in a group higher than 30 will be left as cluster 0

		//convert cutInds nested arrays into a single vector giving a gorup number for each spike
		for(var g=0;g<G;g++){
			var cut_g = cutInds[g];
			var Glen = cut_g.length;
			for(var i=0;i<Glen;i++)
				theCut[cut_g[i]] = g;
		}

		var str = [
			'n_clusters: ' + G,
			'n_channels: 4',
			'n_params: 0',
			'times_used_in_Vt: 0 0 0 0']

		for(g=0; g<G; g++){
			str.push(' cluster: ' + g + ' center: 0 0 0 0 0 0 0 0');
			str.push(' min:   0 0 0 0 0 0 0 0');
			str.push(' max:   0 0 0 0 0 0 0 99');
		}
		str.push('');
		str.push('Exact_cut_for: '+ this._.exp_name +' spikes: ' + N);
		str.push('');
		
		str = [str.join('\n')];
		for(i=0;i<N;i++)
			str.push(theCut[i] + ' ');

		return str.join('');
	}
	
	
	//cut constructor, which we return at the end of the factory
	var cut = function(exp_name,tet_num,data_type,data,description){
		
		 // convention is to consider ._ as being private  
		this._ = {
				exp_name: exp_name, //exp_name and tet_num ought to redundant, we should always have another way of knowing what exp and tet this cut corresponds to
				tet_num: tet_num,  //but for convenience we rememebr them.
				cutInds: [],
				actionStack: [],
				N: 0 //number of spikes
			};
			
		DoConstruction.call(this,data_type,data,description);
	}
	
	// export some functions as part of the cut class (i.e. they become public)
	cut.prototype.GetGroup = GetGroup;
	cut.prototype.GetProps = GetProps;
	cut.prototype.GetFileStr = GetFileStr;	
	cut.prototype.AddBToA = AddBToA;
	cut.prototype.SwapBandA = SwapBandA;
	cut.prototype.GetJSONString = GetJSONString;
	cut.prototype.Undo = Undo;
	
	// export the cut class together with some explicitly static functions
	return {cls: cut,
			AddChangeCallback: AddChangeCallback,
			AddActionCallback: AddActionCallback };
}();

