"use strict";

// The cut class
T.cut = function(){//class factory
	
	//the object this._ is to be considered private, though it is actually public.  
	//Correct me if I'm wrong, but I think this is considered an ok way of emulating OOP in javascript - DM
	
	//static private functions, variables, and classes
	var ChangeCallbacks = []; //callbacks must be of the form foo(cut,changeFrom,changeTo,noInterior){ }, 
							  //where cut is the current cut object and changeFrom and changeTo give the range of modified cut groups, 
							  //noInterior is true if only the from- and to- groups changed and not the groups inbetween
							  //Note that the modules with these callbacks will recieve their first change event at the point a cut is constructed, 
							  //they are expected to already have any other needed data by that point (so you need to provide it separately before the new cut)
							  
	//TODO: need some sort of ActionCallback which gets action added events with action descriptions (and maybe more) and undo events
	
	//the undo stack is an array of these objects
	var action = function(type,data,description){ 
		this.type=type;
		this.data=data;
		this.description=description
	} 
	
	var DoConstruction = function(data_type,data){
		switch (data_type){
		
		case 1: //data is an array specifying the group of each spike
			this._.cutInds = [[]];
			this._.N = data.length;
			for(var i=0;i<data.length;i++)
				if(this._.cutInds[data[i]] == undefined)
					this._.cutInds[data[i]] = [i];//new subarray
				else
					this._.cutInds[data[i]].push(i);//append to existing subarray
			//TODO: action
		
		case 2:
			//TODO: implement import from JSON exported version of this class
		
		}
		
		TriggerCallbacks(0,this._.cutInds.length,false);
	}
	
	var GetJSONString = function(){
		//TODO implement export of all _. data, for keeping in localStorage or FileSystem API
	}
	
	var PushAction = function(type,data,description){
		this._.actionStack.push(new action(type,data,description));
		//TODO: trigger action callback
	}
	
	var Undo = function(){
		//this is going to be exported (=made public), it calls the relevant inverse operation (which are private)
		
		//TODO: pop action, switch action.type and call relevant inverse function
	}
	
	var TriggerCallbacks = function(a,b,flag){
		for(var i=0;i<ChangeCallbacks.length;i++)
			ChangeCallbacks[i](this,Math.min(a,b),Math.max(a,b),flag);
	}
	
	var AddBToA = function(a,b){
		this._.cutInds[a] = this._.cutInds[a].concat(this._.cutInds[b]);
		this._.cutInds[b] = [];
		//TODO: action
		TriggerCallbacks(a,b,true);
	}
	
	var SwapBandA = function(a,b){
		var tmp = this._.cutInds[a];
		this._.cutInds[a] = this._.cutInds[b];
		this._.cutInds[b] = tmp;
		//TODO: action
		TriggerCallbacks(a,b,true);
	}
	
	var ReorderAll = function(){
		//TODO: implement reorder
		
		//TODO: action
		TriggerCallbacks(0,this._.cutInds.length,false);
	}
	
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
	
	
	//constructor, which we return at the end of the factory
	var cls = function(exp_name,tet_num,data_type,data){
		
		 // convention is to consider ._ as being private  
		this._ = {
				exp_name: exp_name, //exp_name and tet_num ought to redundant, we should always have another way of knowing what exp and tet this cut corresponds to
				tet_num: tet_num,  //but for convenience we rememebr them.
				cutInds: [],
				actionStack: [],
				N: 0 //number of spikes
			};
			
		DoConstruction.call(this,data_type,data);
	}
	
	// export some private functions, making them public
	cls.prototype.GetGroup = GetGroup;
	cls.prototype.GetProps = GetProps;
	cls.prototype.GetFileStr = GetFileStr;	
	cls.prototype.AddBToA = AddBToA;
	cls.prototype.SwapBandA = SwapBandA;
	cls.prototype.GetJSONString = GetJSONString;
	cls.prototype.Undo = Undo;
	
	return cls;
}();

