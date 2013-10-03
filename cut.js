"use strict";

// The CUT module, the primary component of which is a class called cut
T.CUT = function(){//class factory

	//the object this._ is to be considered private, though it is actually public.  
	//Correct me if I'm wrong, but I think this is considered an ok way of emulating OOP in javascript - DM

	//static private functions, variables, and classes (some of which may be exported at the bottom of the factory)

	//The cut is stored in a somewhat complciated data structure which is designed specifically to prevent redundant renders each time the cut is modified.
	//Rather than having an array with one element per group, we instead maintain a list of "immutable" inds arrays.  Each of these immutables is then associated to
	//a particular group.  If/when the group number changes, we push the new group number onto the group_history array for the given immutable.  Each of these inds/group_history pairs is
	//stored in an object that occupies a slot in the immutablesSlots array.  When inds are no longer needed we clear the data, and make the slot available for future use.  In order
	//to keep everyone on the same page with reference to the contents of each slot, we also keep a generation counter for each slot which is incremented each time we reuse the slot 
	//with a new immutable.  The cut pseudo-class exposes two ways of accessing ind data, you can either call GetGroup(group_num) or GetImmutableSlot(slot_num).
	//Note that we also maitain an array, groupToImmutablesMapping, providing the inverse mapping from group_num to slot_num.
	
	//we have two lists of callbacks, which are usually triggered at the same time, but they serve slightly 
	//different purposes and sometimes only the actionCallbacks get triggerd...
	//the changeCallbacks should not worry about the exact action performed, only what the resulting change was, whereas the actioncallbacks
	//dont actually care what the change is they just need to know what action occured.
	var changeCallbacks = []; //callbacks must be of the form foo(cut,invalidatedImmutableSlots,isNewCut){ }, 
							  //where cut is the current cut object and invalidatedImmutableSlots is a logical vector with a true for each immutable slot that has just
							  //been invalidated.  The callback should logically OR the invalidation vector with its current invalidation vector (if it has one) and process each of the invalid slots.
							  //When a cut is constructed the isNewCut parameter is true and the invalidatedImmutablesSlots will all be true.  This means the callbacks
							  //are expected to already have any other needed data by that point (so you need to provide it separately before the new cut)

	var actionCallbacks = []; //callbacks must be of the form foo(cut,info){} where info is an object with at least a string proeprty named description

    //TODO: modify changeCallbacks to work with the immutable system, and debug any outstanding internal issues here with the immutable system

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

	var PushAction = function(type,data,description){
		this._.actionStack.push(new action(type,data,description));

		TriggerActionCallbacks({description:description,type:type,num:this._.actionStack.length});
	}

	var TriggerActionCallbacks = function(ob){
		for(var i=0;i<actionCallbacks.length;i++)
			try{
				actionCallbacks[i](this,SimpleClone(ob));
			}catch(err){console.log("Error in TriggerActionCallbacks: " + err.stack)}
	}

	var TriggerChangeCallbacks = function(invalidatedImmtableSlots,isNew){ 
		for(var i=0;i<changeCallbacks.length;i++)
			try{
				changeCallbacks[i](this,invalidatedImmtableSlots,isNew);
			}catch(err){console.log("Error in TriggerChangeCallbacks: " + err.stack)}
	}
	var ForceChangeCallback = function(fn){ 
		try{
			fn(this,M.repvec(1,this._.immutablesSlots.length),false); //force a full change callback on the requested function, but don't claim that it's a new cut
		}catch(err){console.log("Error in ForceChangeCallback: " + err.stack)}
	}

    var NewImmutable = function(inds,group_num){
		var k = this._.nextImmutableSlot;
		if(!(k > 0 || k==0)) throw('no slot available');
			
        this._.groupToImmutablesMapping[group_num] = k;

        // set all the properties of slot k
        var slot_k = this._.immutablesSlots[k];
        if(slot_k){
            slot_k.generation++;
        }else{
            slot_k = {generation: 1, inds: null, group_history: [],num:k};
            this._.immutablesSlots[k] = slot_k;
        }
        slot_k.inds = new Uint32Array(inds);
        slot_k.group_history = [group_num];

        //find the next vacant slot.  First search from this point to the end...
        for(var i=k+1;i<this._.immutablesSlots.length;i++)
            if(!this._.immutablesSlots[i] || this._.immutablesSlots[i].inds == null){
                this._.nextImmutableSlot = i;
                return k;
            }
        //then, if neccessary, wrap around and search from the beginnning again
        for(var i=0;i<k;i++)
            if(!this._.immutablesSlots[i] || this._.immutablesSlots[i].inds == null){
                this._.nextImmutableSlot = i;
                return k;
            }

        this._.nextImmutableSlot = NaN;
        return k;
    }

    var DeleteImmutable = function(group_num){
        var k = this._.groupToImmutablesMapping[group_num];
        var slot_k = this._.immutablesSlots[k];
        if(slot_k){
            slot_k.inds = null;
            slot_k.group_history = [];
        }//if slot_k doesn't exist we don't need to worry
        this._.groupToImmutablesMapping[group_num] = null;
        this._.nextImmutableSlot = k;
		return k;
    }

	var SpliceImmutables = function(a,n_remove /* , inds_1, inds_2, ... */){	//behaves like javascript array "splice"
		var s = this._.immutablesSlots;
		var m = this._.groupToImmutablesMapping;
		
		var invalidated = M.repvec(0,s.length);
		
		// clear the slots with groups  a,a+1,...,a+n_remove-1
		for(var i=0;i<n_remove;i++)
			invalidated[DeleteImmutable.call(this,a+i)] = 1;
		
		// for all slots corresponding to groups a,a+1,a+2,...,nGroups, push an incremented group number onto the group_history
		var increment = arguments.length-2 - n_remove; //e.g. if you remove one and add three the increment will be two
		for(var i=0;i<s.length;i++)if(s[i] && s[i].group_history.slice(-1)[0] >= a){
			s[i].group_history.push(s[i].group_history(-1)[0] + increment);
			invalidatedSlots[i] = 1;
			m[s[i].group_history(-1)[0]] = i;
		}
		
		// add the new (inds,group_num) pairs into vacant slots, using group numbers a,a+1,a+2,...
		for(var i=2;i<arguments.length;i++)
			invalidated[NewImmutable.call(this,arguments[i],a+i-2)] = 1;

		return invalidated;
	}
	
	var GetImmutableSlot = function(k){
		// the calling function *must* check the generation value is what it expected
		return this._.immutablesSlots[k] || {};
	}
	
	var DoConstruction = function(data_type,data,description){
		switch (data_type){

		case 1: //data is an array specifying the group of each spike
			this._.N = data.length;
			var cutInds = [[]];
			for(var i=0;i<data.length;i++)
				if(cutInds[data[i]] == undefined)
					cutInds[data[i]] = [i];//new subarray
				else
					cutInds[data[i]].push(i);//append to existing subarray
			
			//now that we have an array of inds arrays, we can make the immutables
			for(var i =0;cutInds.length;i++)
				NewImmutable.call(this,cutInds.shift(),i);
			break;

		case 2: //data is a string, previously exported from an instance of this class
			this._ = JSON.parse(data);
            
            //restore the inds in immutablesSlots to being typedArrays (they were encoded as basic arrays)
            var m = this._.immutablesSlots;
            for(var i=0;i<m.length;i++)if(m[i] && m[i].inds)
                m[i].inds = new Uint32Array(m[i].inds);
                
			//TODO: might be worth validating everything and doing the JSON parse inside a try-catch
			break;

		case 3: //data is an array of inds arrays
			var N = 0;
			for(var i =0;i<data.length;i++){
				NewImmutable.call(this,data[i],i);
				N += data[i].length; //count number of spikes in all groups, note that this must include all spikes or export to file will not give useful result
			}
			this._.N = N; 
			break;

		case 4: //data is just N
			this._.N = data;
			//everything in group zero
			NewImmutable.call(this,M.range(0,this._.N-1),0);
			break;
		}

		PushAction.call(this,"load",{},description);
		TriggerChangeCallbacks.call(this,M.repvec(1,this._.immutablesSlots.length),true); 
	}

	var ReTriggerAll = function(){
		//to be used when restoring to view, i.e. after another cut has been in view
		TriggerChangeCallbacks.call(this,M.repvec(1,this._.immutablesSlots.length),true);
		for(var i=0;i<this._.actionStack.length;i++){
			var ac = this._.actionStack[i];
			TriggerActionCallbacks({description:ac.description,type:ac.type,num:i+1}); //TODO: this is a *really* inefficient way of restoring the action list, ought to deliever a batch of all actions
		}
	}

	var GetJSONString = function(){
        
        //we temporarily convert the inds in immutablesSlots to standard arrays
        //this is necceesarry for JSON to work well
        var m = this._.immutablesSlots;
        var tmpInds = [];
        for(var i=0;i<m.length;i++)if(m[i] && m[i].inds){
            tmpInds.push(m[i].inds);
            m[i].inds = M.basic(m[i].inds);
        }
        
		var str = JSON.stringify(this._); //._ doesn't include any out-there object references and is not recursive
        
        //restore the inds arrays to their original typed arrays.
        for(var i=0;i<m.length;i++)if(m[i] && m[i].inds)
            m[i].inds = tmpInds.shift();
        
        return str;
	}

	var Undo = function(){ 
		//this is going to be exported (=made public), it calls the relevant inverse operation (which are private)
		//the inverse operations make a call to TriggerChangeCallbacks, but this function does the call to TriggerActionCallbacks
		if (this._.actionStack.length == 0){
			TriggerActionCallbacks.call(this,{description:"nothing to undo", type:"empty-actions"});
			return;//nothing to undo
		}

		var action = this._.actionStack.pop();
		var undone = true;
		if(action.type=="add")
			UndoAddBtoA.call(this,action.data);
		else if(action.type=="swap")
			UndoSwapBandA.call(this,action.data);
		else if(action.type=="reorder")
			UndoReorderAll.call(this,action.data);
		else if(action.type=="split")
			UndoSplitA.call(this,action.data);
		else
			undone = false;

		if(undone){
			TriggerActionCallbacks.call(this,{description:"",type:"undo"});
		}else{
			this._.actionStack.push(action);//put it back
			TriggerActionCallbacks.call(this,{description:"cannot undo '" + action.type + "' actions", type:"no-undo"});
		}
	}

	var SplitA = function(a,splitMask){
		var cut_a = GetGroup.call(this,a);
		var first_half = [];
		var second_half = [];

		for(var i=0;i<cut_a.length;i++)
			if(splitMask[i])
				second_half.push(cut_a[i]);
			else
				first_half.push(cut_a[i]);
		
		var invalidatedSlots = SpliceImmutables.call(this,a,1,first_half,second_half);
		PushAction.call(this,"split",[a,splitMask],'split group-' + a + ' in two');
		TriggerChangeCallbacks.call(this,invalidatedSlots);
	}
	var UndoSplitA = function(data){ 
		var a = data[0];
		var splitMask = data[1];
		var first_half = M.basic(GetGroup.call(this,a));
		var second_half = M.basic(GetGroup.call(this,a+1));
		var cut_a = [];
		for (var i=0;i<splitMask.length;i++)
			if(splitMask[i])
				cut_a.push(second_half.shift());
			else
				cut_a.push(first_half.shift());	
		var invalidatedSlots = SpliceImmutables.call(this,a,2,cut_a);
		TriggerChangeCallbacks.call(this,invalidatedSlots);
	}

	var AddBtoA = function(a,b){
		var cut_a = GetGroup.call(this,a);
		var cut_b = GetGroup.call(this,b);
		
		var lenB = cut_b.length;
		
		var invalidatedSlots = M.repvec(0,this._.immutablesSlots.length);
		
		//delete the two individual sets of inds
		invalidatedSlots[DeleteImmutable.call(this,a)] = 1;
		invalidatedSlots[DeleteImmutable.call(this,b)] = 1;		

		//create the new inds
		invalidatedSlots[NewImmutable.call(this,M.concat(cut_a,cut_b),a)] = 1;
		
		PushAction.call(this,"add",[a,b,lenB],'merge group-' + b + ' into group-' + a);
		TriggerChangeCallbacks.call(this,invalidatedSlots);
	}
	var UndoAddBtoA = function(data){
		var a = data[0]; var b = data[1]; var lenB = data[2];
		
		var cut_ab = GetGroup.call(this,data[0]);
		
		var invalidatedSlots = M.repvec(0,this._.immutablesSlots.length);
		
		// delete the joint set of inds
		invalidatedSlots[DeleteImmutable.call(this,a)] = 1;
		
		// create the two individual sets of inds
		invalidatedSlots[NewImmutable.call(this,cut_ab.subarray(0,-lenB),a)] = 1;
		invalidatedSlots[NewImmutable.call(this,cut_ab.subarray(-lenB),b)] = 1;		

		TriggerChangeCallbacks.call(this,invalidatedSlots);
	}

	var SwapBandAHelper = function(a,b){
		//since swapping is self-inverse we have this helper function which is utilised by both the do and undo functions
		
		var k_a = this._.groupToImmutablesMapping[a];
		var k_b = this._.groupToImmutablesMapping[b];
		
		// add the updated group numbers to both sets of inds
		this._.immutablesSlots[k_b].group_history.push(a);  // "slot k_b now refers to group a"
		this._.immutablesSlots[k_a].group_history.push(b);  // "slot k_a now refers to group b"
		
		// keep the groupToImmutablesMapping up to date
		this._.groupToImmutablesMapping[a] = k_b;
		this._.groupToImmutablesMapping[b] = k_a;
		
		var invalidatedSlots = M.repvec(0,this._.immutablesSlots.length);
		invalidatedSlots[k_a] = 1;
		invalidatedSlots[k_b] = 1;
		
		return invalidatedSlots;
	}
	var SwapBandA = function(a,b){
		var invalidatedSlots = SwapBandAHelper.call(this,a,b);
		PushAction.call(this,"swap",[a,b],"swap group-" + a + " and group-" + b);
		TriggerChangeCallbacks.call(this,invalidatedSlots);
	}
	var UndoSwapBandA = function(data){
		var invalidatedSlots = SwapBandAHelper.call(this,data[0],data[1]);
		TriggerChangeCallbacks.call(this,invalidatedSlots);
	}

	var ReorderAll = function(newOrder){
		var m_old = this._.groupToImmutablesMapping;
		var m = m_old.slice(0); //during the loop we are going to need a copy of the old mapping
		this._.groupToImmutablesMapping = m;
		
		var s = this._.immutablesSlots;
		var invalidatedSlots = M.repvec(0,this._.immutablesSlots.length);
		
		for (var i=0;i<newOrder.length;i++)if(newOrder[i] != i){
			var k = m_old[newOrder[i]];
			if(s[k]){ //TODO: decide if this if-statement is ok, or whether it's hiding a more serious bug
				s[k].group_history.push(i); // "slot_k now refers to group i" 
				m[i] = k;
			}
			invalidatedSlots[k] = 1; //note that if newOrder[i] == i we avoid invalidating the slot
		}
		
		PushAction.call(this,"reorder",newOrder,"reorder groups");
		TriggerChangeCallbacks.call(this,invalidatedSlots);
	}

	var	UndoReorderAll = function(data){
		//the inverse is pretty simillar to the forward operation, except for the interpretation of the ordering
		
		var m_old = this._.groupToImmutablesMapping;
		var m = m_old.slice(0); //during the loop we are going to need a copy of the old mapping
		this._.groupToImmutablesMapping = m;

		var s = this._.immutablesSlots;
		var invalidatedSlots = M.repvec(0,this._.immutablesSlots.length);

		for (var i=0;i<data.length;i++)if(data[i] != i){
			var k = m_old[i];
			s[k].group_history.push(data[i]); // "slot_k now refers to group data[i]" 
			m[data[i]] = k;
			invalidatedSlots[k] = 1; //note that if newOrder[i] == i we avoid invalidating the slot
		}
				
		TriggerChangeCallbacks.call(this,invalidatedSlots); 
	}

	var GetGroup = function(g){
        var k = this._.groupToImmutablesMapping[g];
        return this._.immutablesSlots[k] ? (this._.immutablesSlots[k].inds || []) : [];
	}

	var GetAsVector = function(cap){
		var N = this._.N;
		var G = GetNGroups.call(this);
		var theCut = new Uint32Array(N);

		if (cap) G = G > cap? cap : G; 

		//convert immutablesSlots inds into a single vector giving a gorup number for each spike
		for(var g=0;g<G;g++){
			var cut_g = GetGroup.call(this,g);
			var Glen = cut_g.length;
			for(var i=0;i<Glen;i++)
				theCut[cut_g[i]] = g;
		}

		return theCut;
	}

    var GetNGroups = function(){
        var m = this._.groupToImmutablesMapping;
        var G= 0;
        for(var i=0;i<m.length;i++)
            if(m[i] || m[i]==0){
                //G++; // this version will give the number of groups in use
				G = i; //this version returns the maximum in-use group number
			}
        return G;
    }
    
	
	var GetProps = function(){
		return {exp_name: this._.exp_name, 
				tet_num: this._.tet_num,
				G: GetNGroups.call(this)};
	}

	var GetFileStr = function(){
		var theCut = GetAsVector.call(this,30);
		var G = M.max(theCut);
        G += G>0 ? 1 : 0; //if there are non-zero groups we need to remember to count the zero group
		var N = this._.N;

		var str = [
			'n_clusters: ' + G,
			'n_channels: 4',
			'n_params: 0',
			'times_used_in_Vt: 0 0 0 0']

		for(var g=0; g<G; g++){
			str.push(' cluster: ' + g + ' center: 0 0 0 0 0 0 0 0');
			str.push(' min:   0 0 0 0 0 0 0 0');
			str.push(' max:   0 0 0 0 0 0 0 99');
		}
		str.push('');
		str.push('Exact_cut_for: '+ this._.exp_name +' spikes: ' + N);
		str.push('');

		str = [str.join('\n')];
		for(var i=0;i<N;i++)
			str.push(theCut[i] + ' ');

		return str.join('');
	}

    var GetNImmutables = function(){
        return this._.immutablesSlots.length; //this is hopefully always 255
    }
	//cut constructor, which we return at the end of the factory
	var cut = function(exp_name,tet_num,data_type,data,description){

		 // convention is to consider ._ as being private  
		this._ = {
				exp_name: exp_name, //exp_name and tet_num ought to redundant, we should always have another way of knowing what exp and tet this cut corresponds to
				tet_num: tet_num,  //but for convenience we rememebr them.
				actionStack: [],
                immutablesSlots: Array(255), //this is where we store the indicies for each group
                nextImmutableSlot: 0, //this makes it quicker to find a vacant slot in the above array when you need one
                groupToImmutablesMapping: [], //the indicies for group g are stored in immutablesSlots[groupToImmutablesMapping[g]]
				N: 0 //number of spikes
			};

		DoConstruction.call(this,data_type,data,description);
	}

	// export some functions as part of the cut class (i.e. they become public)
	cut.prototype.GetGroup = GetGroup;
	cut.prototype.GetProps = GetProps;
	cut.prototype.GetFileStr = GetFileStr;
	cut.prototype.GetJSONString = GetJSONString; //note that this includes all the information needed to recreate the cut instance at a later date, whereas GetFileStr does not
	cut.prototype.AddBtoA = AddBtoA;
	cut.prototype.SwapBandA = SwapBandA;
	cut.prototype.SplitA = SplitA;
	cut.prototype.ReorderAll = ReorderAll;
	cut.prototype.Undo = Undo;
	cut.prototype.ForceChangeCallback = ForceChangeCallback;
	cut.prototype.ReTriggerAll = ReTriggerAll;
	cut.prototype.GetAsVector = GetAsVector;
	cut.prototype.GetImmutableSlot = GetImmutableSlot;
	cut.prototype.GetNImmutables = GetNImmutables;
	// export the cut class together with some explicitly static functions
	return {cls: cut,
			AddChangeCallback: AddChangeCallback,
			AddActionCallback: AddActionCallback
			};
}();

