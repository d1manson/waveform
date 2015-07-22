"use strict";

// T.ORG: organises all the files that get drag-dropped (and saved)
// It keeps a list of the available files and organises them into an array of experiments,
// each with an array of tetrodes.
// It is also responsible for content and interactivity of the files pannel div.

// TODO: implement a cache that alows other modules to store stuff with each tet/exp and later
// retrieve it.  Will probably need to have some sort of mechanism for kicking stuff out the cache
// or it could get stupidly big when examining loads of tet/exps.
// The main things that would benefit form the cache are related to the full spike data, i.e.
// the raw buffer read off disk, the webgl-waveforms voltage buffers, and possibly the amplitudes.
// Implementing these should roughly cut the switching time in half for going back to a previously
// looked at exp-tet. 
var T = T || {};

T.ORG = function(ORG, PAR, CUT, $files_panel, $document, $drop_zone,FS,$status_text,$exp_list ,$tet_list,
			el_pos_smoothing_slider,el_pos_speed_slider,el_pos_smoothing_val,el_pos_speed_val,$banner,$drop_excess_stuff, $keyboard_notifier,
			el_pos_led_slider, el_pos_led_val
			){ // the T.ORG object was created by cut.js, here we add a lot more to it

    var fileStatusCallbacks = $.Callbacks();

    
    
    //used for canceling asynchrounus loads/parses, see InternalPARcallback for useage
	var living = function(){this.alive=true;}

	//c prefix means "current"
    var cExp = {}; //EXP object
    var cTet = {num:-1}; //EXP_TET object
    var cCut = null; //CUT object (not EXP_CUT object)
	var cCutIsFileOrAllZero = false; //is true when the current cut is laoded from file and has not yet been modified, and when we create an all-zero cut, the rest of the time it is false
	var cN = null; // number of spikes
	var makeNullCutFromN = false; //when we recieve a tetrode file we shall generate a null cut if this is true, otherwise we leave the cut generation up to SwitchToCut
	var cCutHeader = null; //object with key name pairs
	var cTetBuffer = null; //arraybuffer
	var cTetBufferProjected  = null; //arraybuffer
	var cTetT = null; //uint32array
	var cTetA = null; //uint16array of form A_11 A_12 A_13 A_14 A_21 A_22 ... A_n4 giving max-min on each wave
	var cTetHeader = null; //object with key name pairs
	var cPosBuffer = null; //arraybuffer
	var cPosDir = null;
	var cPosDir_needs_adjusting = false;  // when we load set file we read correction angle and adjust cposdir.
	var cPosHeader = null; //object with key name pairs
	var cSetHeader = null; //object with key name pairs
	var cEegBuffer = null; //arraybuffer
	var cEegHeader = null; //object with key name pairs
	var cLoadingExp = new living();
	var cLoadingTet = new living();
	var cLoadingCut = new living();
	var cLoadingPos = new living();
	var cLoadingEeg = new living();
	var posMaxSpeed = 5; // meters per second (see PostProcessPos in parsefiles.js)
	var posSmoothingWidth = 0.2 //box car seconds (see PostProcessPos in parsefiles.js)
	var pos_header_override = {}; //key-values to override when reading pos header
	var use_both_leds = 1;
	var getdir_callback = null;

	var cState = {set:0,pos:0,cut:0,tet:0}; 
		//STATE keeps track of what is loaded. For set,pos,cut and tet fields..
			//	0 - file does not exist
			//	1 - file exists but has not been read from file or parsed yet
			//  2 - the file is being announced to the callback
			//  3 - the file has been previously announced
	

                    
    var REGEX_FILE_EXT = /\.([0-9a-z]+)$/i;

    var recoveringFilesFromStorage = false;
    var pendingNewFiles = 0;

	var exps = {}; //exps[some_exp_name] will be an EXP object
	var tet_buttons = []; //ith entry will hold $ of button if files for tet (i+1) are available
			
	// These three classes (EXP, EXP_TET, and EXP_CUT) store file names/cut instances, they also add dom nodes to the $exp_list and store jQuery handles for the new nodes.
	// And EXP_TET also adds to $tet_list and stores jQuery handles in tet_buttons
	// NOTE: variable naming convention here is "tet_ind" is 0,1,2,3 whereas "tet_num" is 1,2,3,4
    var EXP = function(name){
                this.name = name;
    			this.pos_file = null;
				this.set_file = null;
				this.tets = [];
				this.eeg_files = [];

                //create a node for the exp, its title, and a hidden pair of nodes for pos and set files
                this.$ = $("<div class='button file_group'/>")
                                    .data('EXP',this)
                                    .append("<div class='file_group_title'>trial '" + name + "'</div>");
                this.$set = $("<div class='file_brick set_file_brick' style='display:none;'>~.set</div>").data('brick-type','set').data('EXP',this);
                this.$pos = $("<div class='file_brick pos_file_brick' style='display:none;'>~.pos</div>").data('brick-type','pos').data('EXP',this);
                this.$.append(this.$set).append(this.$pos);
                
                // add this exp to the $exp_list, maintining alphabetical order
                var lower_lexically = 0;
                var other_exp_names = Object.keys(exps);
                for(var i =0;i<other_exp_names.length;i++)
                    lower_lexically += other_exp_names[i] < name;
                    
                if(lower_lexically == 0)
                    $exp_list.prepend(this.$)
                else
                    $exp_list.children().eq(lower_lexically-1).after(this.$)

			};
    var EXP_TET = function(tet_num, parent_exp){
                this.parent = parent_exp;
                this.num = tet_num; //this should always match its index in parent_exp.tets[]
				this.cutInstanceCount = 0;
                if(!tet_buttons[tet_num-1]){
					 // add an extra tet button to the list of tet buttons, maintaing numerical order
					tet_buttons[tet_num-1] = {$: $("<div class='button'>" + tet_num +"</div>").data('tet_num',tet_num)};
					for(var i=tet_num-2; i>=-1; i--) if(tet_buttons[i]){
						tet_buttons[i].$.after(tet_buttons[tet_num-1].$);
						break;
					}else if(i==-1){
						$tet_list.children().eq(0).after(tet_buttons[tet_num-1].$);
					}
					if(cTet.num == tet_num)
						MarkTet(tet_num-1); 
				}
    			this.tet_file = null;
				this.cuts = [];
                
                //create a node to wrap the tetrode and its cut file(s), and also create a hidden node for the tetrode file itself
                this.$ = $("<div class='tet_group' tet='" + tet_num + "'/>")
                                    .data('EXP_TET',this);
                this.$tet = $("<div class='file_brick tet_file_brick' style='display:none;'>~." + tet_num + "</div>")
                                    .data('brick-type','tet')
									.data('EXP_TET',this);
                this.$.append(this.$tet);
                
                // add this exp to the list of tetrodes for the given experiment, maintaing numerical order
                for(var i=tet_num-1; i>=-1; i--) if(parent_exp.tets[i]){
                    parent_exp.tets[i].$.after(this.$);
                    break;
                }else if(i == -1){
					parent_exp.$.children().eq(0).after(this.$); //first child is exp name div, after that we want the tetrode
				}
				
			};
            
    var EXP_CUT = function(cut,parent_tet,isClu){
                this.parent = parent_tet;
                if(cut instanceof CUT){
                    this.cut_instance = cut;
                    this.$ = $("<div class='file_brick new_cut_file_brick' draggable='true'>~" + String.fromCharCode("a".charCodeAt(0)+parent_tet.cutInstanceCount) +  "_" + parent_tet.num + ".cut</div>").data('brick-type','cut'); 
					parent_tet.cutInstanceCount++;
                }else{
                    this.cut_file = cut;
					this.isClu = isClu;
                    this.$ = $("<div class='file_brick cut_file_brick'>" + cut.replace(parent_tet.parent.name,"~") + "</div>").data('brick-type','cut'); 
                }
                parent_tet.$.prepend(this.$);
				this.$.data('EXP_CUT',this);
            }
			
    var NewFiles = function(files){
		//this function iterates through a list of file handles, calling GotFileDetails for each file, either synchronously or asynchrously
		//it also stores the files for later use (unless we are currently getting files from storage)
		
    	pendingNewFiles = files.length;
		var cutFiles = []; //cut files are a special case due to their less regular naming
        for(var i =0; i <files.length;i++){

            var ext = REGEX_FILE_EXT.exec(files[i].name);
			var type = -1;
			var base = "";
			
			if (ext){
			    ext = ext[1].toLowerCase();
				base = files[i].name.slice(0,files[i].name.length-ext.length-1);

				if(ext=="cut") 					type = 1;
				else if(ext == "pos") 			type = 2;
				else if(ext == "set") 			type = 3;
				/*else if(ext == "eeg")			type = 9;*/
				else if(!isNaN(parseInt(ext)))
					if(base.slice(-4) == ".clu")
						if(base.slice(-9) == ".temp.clu") type = 8; //we dont care about these
						else							  type = 5; //clu file
					else if(base.slice(-4) == ".fet") type = 6; //we dont care about these
					else if(base.slice(-4) == ".klg") type = 7; //we dont care about these
					else 							  type = 4; //tet file

				if(type != -1)
					FS.WriteFile(files[i].name,files[i]); //store the file in filesystem 	
			}

			switch(type){
				case 1:
					cutFiles.push({file:files[i],base:base,tet:parseInt(base.match(/(\d*)[a-zA-Z _]*$/)[1]),isClu:false});
					break;
				case 5:
					cutFiles.push({file:files[i],base:base,tet:parseInt(ext),isClu:true});
					break;
				case 2:
					GotFileDetails(files[i].name,base,"pos");
					break;
				case 3:
					GotFileDetails(files[i].name,base,"set");
					break;
				case 4:
					GotFileDetails(files[i].name,base,"tet",parseInt(ext));
					break;
				case 9:
					GotFileDetails(files[i].name,base,"eeg");
					break;
				default:
					GotFileDetails(files[i].name);//unknown file type
			}
        }    
		
		$status_text.text("Sorting and organising cut files...");
		window.setTimeout(function(){SortAndAssignCuts(cutFiles);},40); // reading the modifiedBy date is slow, so we pause at this point to allow everything so far to take effect
  
    }

	var SortAndAssignCuts = function(cutFiles){		
		// We only get modifiedDate and do the sorting when there are multiple cut files for a single tet-exp. This is done within GotFileDetails > SortExpTetCuts.
		
		//build a regex to match on experiment names, matching on the longest possible name
		var allExpsRegex = RegExp.fromList(Object.keys(exps));
		
		//Loop through all the cut files and try and assign to an experiment based on filename, otherwise (if tint-style) read file header (asynchrously)..
		for(var i=0;i<cutFiles.length;i++){
			if(allExpsRegex){ //there may not be any experiment names to match against...though I guess we could update the regex as we iterate through this loop...but whatever.
				var match = allExpsRegex.exec(cutFiles[i].base);
				if(match){
					GotFileDetails(cutFiles[i].file.name,match[0],"cut",cutFiles[i].tet,{isClu: cutFiles[i].isClu}); //if we can match one of the experiment names to the file name, then thats great
					continue;
				}
			}
			if(cutFiles[i].isClu)
				GotFileDetails(cutFiles[i].file.name); //if we have a clu file, but we cant match against any names then we're stuck, lets abandon the file
			else
				PAR.LoadCut2(cutFiles[i].file,cutFiles[i].tet,GotFileDetails); //otherwise we need to read the header to find out the experiment name (done asynchrously)
		}
		$status_text.text("No data selected. Choose a trial from the available files.");
	}
	
	var SortExpTetCuts = function(expCutArray){
		// this sorts the cuts left to right:   cut instances last created --> first created, cut files last modified --> first modified
		// the cut instances are already sorted internally, but the cut files may be anywhere in the list and in any order.
		
		if (expCutArray.length <= 1)
			return;
		
		// split the cutFiles into files and insts, and pull them all out of the DOM temporarily
		var cutFiles = [];
		var cutInsts = [];
		while(expCutArray.length){
			var c = expCutArray.shift();
			if('cut_file' in c)
				cutFiles.push(c);
			else
				cutInsts.push(c);
			c.$.detach();
		}
					
		// if there is more than 1 cutFile we need to do the sorting based on the modified date
		if(cutFiles.length > 1){
			//cutFiles.map(function(expCut){console.log("sorting needed for: " + expCut.cut_file);});
			cutFiles.map(function(expCut){expCut.date = expCut.date || FS.FileDate(expCut.cut_file);}); //if we haven't yet looked up the date then do so now
			cutFiles.sort(function(a,b){return a.date-b.date}); //sort from newest to oldest...or maybe its the other way..?
		}
		
		// reinsert into dom and reconstitute expCutArray
		var $parent_tet = cutFiles[0].parent.$;
			
		while(cutFiles.length){
			var c = cutFiles.shift();
			$parent_tet.prepend(c.$);
			expCutArray.push(c);
		}
		while(cutInsts.length){
			var c = cutInsts.pop();
			$parent_tet.prepend(c.$);
			expCutArray.push(c);
		}
	}
	
    var GotFileDetails = function(file_name,exp_name,ext,tet,info){
		//this function stores the file's name in the relevant place in our list of experiments

		if(exp_name){
			if(!(exp_name in exps)) // if this is the first file for this experiment, we create a new EXP object and put it in the exps list
				exps[exp_name] = new EXP(exp_name);
				
			var exp = exps[exp_name];
			
			if(ext=="set"){
				exp.set_file = file_name;
				exp.$set.show();
			}else if(ext=="pos"){
				exp.pos_file = file_name;
				exp.$pos.show();
			}else if(ext =="eeg"){
				exp.eeg_files.push(file_name);
			}else if(ext=="cut"){
				var tet_ob = exp.tets[tet-1] ? exp.tets[tet-1] : (exp.tets[tet-1] = new EXP_TET(tet,exp));
				tet_ob.cuts.push(new EXP_CUT(file_name,tet_ob,info && info.isClu)); 
				SortExpTetCuts(tet_ob.cuts);
			}else{ //tet file
				var tet_ob = exp.tets[tet-1] ? exp.tets[tet-1] : (exp.tets[tet-1] = new EXP_TET(tet,exp));
				tet_ob.tet_file = file_name;
				tet_ob.$tet.show();
			}
		}
		
		pendingNewFiles--;
		if(pendingNewFiles == 0)
            if($.isEmptyObject(cExp))
                ReadAndApplyURL();
            else if(exp == cExp)
			    SwitchToExpTet(exp_name,cTet.num,true);
		
    }


	var InternalPARcallback = function(filetype,info){
		//this function is used by SwitchToExpTet and SwitchToTet to generate a closure for dealing with newly parsed files

		cState[filetype] = 1; //remember that we are loading this filetype

		// store some instance handles for use in the closure below.
		// Note the heirarchy which we enforce with if-returns: exp > tet > cut
		var hLivingExp  = cLoadingExp; 
		var hLivingTet = cLoadingTet;
		var hLivingCut = cLoadingCut;
		var hLivingPos = cLoadingPos;
		var hLivingEeg = cLoadingEeg;
		return function(data){
			if(!hLivingExp.alive) return;

			if (filetype == "cut"){
				if(!hLivingTet.alive || !hLivingCut.alive) return;
				cCut = new CUT(cExp.name,cTet.num,info.isClu ? 1.1 : 1,data.cut,"loaded from " + (info.isClu? "clu" : "cut") + " file");
				cCutHeader = data.header;
			}else if(filetype == "tet"){
				if(!hLivingTet.alive) return;
				cTetBuffer = data.buffer;
				cTetHeader = data.header;
				cN = parseInt(data.header.num_spikes);
				if(makeNullCutFromN){//SwitchToCut may have requested a null-cut to be generated at this point
					cCut = new CUT(cExp.name,cTet.num,4,cN,"blank slate");
					cState.cut = 2; 
					fileStatusCallbacks.fireWith(null,[cState,"cut"]); //it shouldn't matter that we announce the arival of the cut before we announce the arival of the tet (below).
					cState.cut = 3; 
				}	
				makeNullCutFromN = false;
			}else if(filetype == "set"){
				cSetHeader = data.header;

				//this is majorly hacky and horrible ..it is needed because set file has the led bearings when usign 2 LED direction
				if(cPosDir && cPosDir.length && cPosDir_needs_adjusting){
					AdjustCPosDir();
					if(getdir_callback) 
						getdir_callback(cPosDir);
					getdir_callback = null;
				}
			}else if(filetype == "pos"){
				if(!hLivingPos.alive) return;
				cPosBuffer = data.buffer;
				cPosHeader = data.header;
				cPosDir = data.dir;
				if(cPosDir && cPosDir.length){
					if(cSetHeader || !cExp.set_file)
						AdjustCPosDir();
					else
						cPosDir_needs_adjusting = true;
				}
			}else if(filetype == "eeg"){
				if(!hLivingEeg.alive) return;
				cEegBuffer = data.buffer;
				cEegHeader = data.header;
			}

			cState[filetype] = 2; // tell the callback that this is the filetype that has just loaded
			fileStatusCallbacks.fireWith(null,[cState,filetype]);
			cState[filetype] = 3; //next time we shall tell the callback that it has ben told about this filetype
		}
	}
	
	var AdjustCPosDir = function(){
		/* Either set is loaded first, in which case pos is loaded second and should call this (in InternalPARcallback),
		   Or pos is loaded first, and thus set is loaded second, in which case set should call this (again, in InternalPARcallback).
		   The final case is when there is a pos file, but no set file available. In such cases pos should call this function
		   from InternalPARcallback. And we will make a dummy 0-correction. 
		   Strictly speaking there is another edge case: if you drop in a set file after loading a pos file, then you will not
		   get the right result, but who cares, right?
		*/
		if(!cExp.set_file){
			cPosDir_needs_adjusting = false;
			return;
		}
		var pi = 3.1415;
		var correction = parseInt(cSetHeader.lightBearing_1)/180*pi; 
		for(var i=0;i<cPosDir.length;i++)
			cPosDir[i] = (cPosDir[i] + correction)  % (2*pi);
		cPosDir_needs_adjusting = false;
	}

    var UpdateURLHistory= function(exp_name,tet_num){
        if(!exp_name || !tet_num)
            return; //don't update if the thing to update is nonsense
            
        try{
            history.replaceState({},exp_name + ' [Cutting GUI]',"?exp=" + encodeURIComponent(exp_name) + "&tet=" + encodeURIComponent(tet_num));
        }catch(e){};
    }
    
    function GetUrlParameters(){
        var paramArray =  window.location.search.substr(1).split("&");
        var paramOb = {};
        while(paramArray.length){
            var parts = paramArray.pop().split("=");
            paramOb[decodeURIComponent(parts[0])] = parts[1] ? decodeURIComponent(parts[1]) : "";
       }
       return paramOb;  
    }

    var ReadAndApplyURL = function(){
        //when the page loads its possible there will be state informaiton in the url from last time (e.g. if the user reloads the page)
        //if so, then once the user has loaded some files into the page, and before they have selected an exp, let see if the old exp is available
        //if so lets select it for the user.
        var params = GetUrlParameters();
        if(params.exp && params.exp in exps && params.tet && !isNaN(parseInt(params.tet)))
            SwitchToExpTet(params.exp,parseInt(params.tet));
        
    }
    
    var SwitchToExpTet = function(exp_name,tet_num,force){
		if(!force && exp_name == cExp.name){
			if(tet_num == cTet.num)
				return;
		}else{ //this is a new experiment
			cExp = exps[exp_name];	
			
			document.title = cExp.name + ' [Cutting GUI]';
            
			cExp.$.attr("active","")
				  .siblings().removeAttr("active");

			cLoadingExp.alive = false; //if there was anything previously loading, we need to stop it
			cSetHeader = null;
			cPosHeader = null; cPosBuffer = null; cPosDir = null; cEegHeader = null; cEegBuffer = null; getdir_callback = null;
			cState.pos = 0; cState.set = 0; cState.cut = 0; cState.tet = 0; cState.eeg = 0;//we are starting from scratch here

			cLoadingExp = new living();		
			// load pos and/or eeg and/or set if they exist
			if(cExp && cExp.pos_file){
				cLoadingPos = new living();
				T.FS.ReadFile(cExp.pos_file,PAR.LoadPos,{callback: InternalPARcallback("pos"),
					SMOOTHING_W_S: posSmoothingWidth,MAX_SPEED: posMaxSpeed,HEADER_OVERRIDE: pos_header_override, USE_BOTH_LEDS: use_both_leds});
			}
			if(cExp && cExp.eeg_files[0]){
				cLoadingEeg = new living();
				T.FS.ReadFile(cExp.eeg_files[0],PAR.LoadEEG,InternalPARcallback("eeg"));
			}
			if(cExp && cExp.set_file)
				T.FS.ReadFile(cExp.set_file,PAR.LoadSet,InternalPARcallback("set"));
		}
		
		SwitchToTet(tet_num); //load tet and cut if they exist, this will trigger the null call to fileStatusCallbacks
    }

    var SwitchToTet = function(tet_num){
			
		var tet_ind = tet_num -1;
		MarkTet(tet_ind);
        UpdateURLHistory(cExp.name,tet_num);
		cLoadingTet.alive = false; //if there were any tet or cut files loading we need to stop them
		cN = null;
		cTetHeader = null; cTetBuffer = null; cTetT = null; cTetA = null; cTetBufferProjected = null;
		cState.tet = 0; //we leave pos and set alone, and we put out a call to SwitchToCut which deals with cState.cut
		cLoadingTet = new living(); 

    	if(cExp && cExp.tets && cExp.tets[tet_ind]){
			cTet = cExp.tets[tet_ind];
			
			// load tet if it exists
    		if(cTet.tet_file)
    			T.FS.ReadFile(cTet.tet_file,PAR.LoadTetrode,InternalPARcallback("tet"));		

			var nCuts = cTet.cuts.length
    		if(cTet.cuts[nCuts-1])
				SwitchToCut(1,nCuts-1); // load the most recent cut (either a cut/clu file or a cut instance)
			else if(cTet.tet_file)
				SwitchToCut(4); //if there aren't any cuts, but we do have tetrode data let's make an all-zero cut
			else
				SwitchToCut(0); //failing all of that, just clear the old cut

    	}else{
			cTet = {num: tet_num};
			SwitchToCut(0); //if there is no data for the tetrode then clear the old cut and announce the situation
		}

    }
		
	var MarkTet = function(tet_ind){
		for(var i=0;i<tet_buttons.length;i++)if(tet_buttons[i])
			if(i == tet_ind)
				tet_buttons[i].$.attr('checked',true);
			else
				tet_buttons[i].$.removeAttr('checked');

		$files_panel.find('.tet_group')	.removeAttr("active")
										.filter('[tet=' + (tet_ind+1) + ']').attr("active","");
	}
	
	var CutActionCallback = function(info){
		if (!cCutIsFileOrAllZero) return; //once we've moved off from being an actual file there is no going back, having said that TODO: might be nice to respond to undoing back to the orginal file		
		if (info.type == "load") return; //the load should have been requested by the SwitchToCut function below, where we deal with its implications fully

		cCutIsFileOrAllZero = false;
		var cutBrick = new EXP_CUT(cCut,cTet);
		cTet.cuts.push(cutBrick);
		MarkCut(cutBrick);
	}
	var MarkCut = function(cutBrick){
		cutBrick.$.attr("active","true")
		  .siblings().removeAttr("active");
	}
	
	var SwitchToCut = function(type,data){
		cCut = null; //if cCutIsFileOrAllZero was true we can happily discard it, if it was false the cut will still be avaialble in the cut_isntance array for the exp-tet
		cCutHeader = null;
		cLoadingCut.alive = false; //if there wa a cut file loading, we need to stop it

		cLoadingCut = new living();
		cState.cut = 0; 
		cCutIsFileOrAllZero = false;
		makeNullCutFromN = false;
				
				
		switch (type){
			case 0:
				//no new cut, just get rid of the old
				cCutIsFileOrAllZero = null;
				fileStatusCallbacks.fireWith(null,[cState,null]); //announce what is about to be loaded
				break;

			case 1:
				//data is an index into cuts in cTet
				data = cTet.cuts[data];
				// carry on to case 2...
				
			case 2:
				//data is an EXP_CUT
				cState.cut = 1;
				fileStatusCallbacks.fireWith(null,[cState,null]); //announce what is about to be loaded
				
				if(data.cut_instance){
					cCut = data.cut_instance;
					cState.cut = 2;
					fileStatusCallbacks.fireWith(null,[cState,"cut"]); //announce that cut has been loaded
					cState.cut = 3; 
					cCut.ReTriggerAll(); //relive the whole life of the cut again
				}else{//data.cut_file
					cCutIsFileOrAllZero = true;
					T.FS.ReadFile(data.cut_file,data.isClu? PAR.LoadClu : PAR.LoadCut,InternalPARcallback("cut",{isClu: data.isClu}));	//before generating the closure InternalPARcallback, cState.cut gets set to 1
				}
				
				MarkCut(data);
				break;
				
			case 3:
				//data is of the same form as the private cutInds array in the cut class (i.e. this is probably the output from some automated cutting function)
				cState.cut = 1;
				fileStatusCallbacks.fireWith(null,[cState,null]); //announce what is about to be loaded
				cCut = new CUT(cExp.name,cTet.num,3,data,"special cut");
				cState.cut = 2;
				fileStatusCallbacks.fireWith(null,[cState,"cut"]); //announce that cut has been loaded
				cState.cut = 3;
				var cut_brick = new EXP_CUT(cCut,cTet); 
				cTet.cuts.push(cut_brick);
				MarkCut(cut_brick);
				break;

			case 4:
				//data is null, we need to make an all-zero cut
				cState.cut = 1;
				fileStatusCallbacks.fireWith(null,[cState,null]); //announce what is about to be loaded
				cCutIsFileOrAllZero = true;
				if(cN == null)
					makeNullCutFromN = true; //shall have to wait for the tet file to load, it will check this flag and make a cut
				else{
					cCut = new CUT(cExp.name,cTet.num,4,cN,"blank slate");
					cState.cut = 2;
					fileStatusCallbacks.fireWith(null,[cState,"cut"]); //announce that cut has been loaded
					cState.cut = 3;
				}
				break;

		}


	}


	var ReloadPosForNewSettings = function(){
		if(cExp && cExp.pos_file){
			cLoadingPos.alive = false;
			cLoadingPos = new living();
			T.FS.ReadFile(cExp.pos_file,PAR.LoadPos,{callback: InternalPARcallback("pos"),
                            SMOOTHING_W_S: posSmoothingWidth, MAX_SPEED: posMaxSpeed,HEADER_OVERRIDE: pos_header_override,  USE_BOTH_LEDS: use_both_leds});
			fileStatusCallbacks.fireWith(null,[cState,null]);
		}		
	}
	var SetPosMaxSpeed = function(val,viaSlider){
		posMaxSpeed = val;//
		el_pos_speed_val.textContent = val == 0? "off" : val + " m/s";
		if(viaSlider !== true)
			el_pos_speed_slider.value = val;
		ReloadPosForNewSettings();
	}

    var SetPosSmoothing = function(val,viaSlider){
		posSmoothingWidth = val;//
		el_pos_smoothing_val.textContent = val == 0? "off" : val + " s";
		if(viaSlider !== true)
			el_pos_smoothing_slider.value = val;
		ReloadPosForNewSettings();	
	}
    
    
	var SetPosHeaderOverride = function(val){
		pos_header_override = SimpleClone(val);
		ReloadPosForNewSettings();		
	}

	var SetUseBothLEDs = function(val, viaSlider){
		use_both_leds = val == 2 ? 1 : 0;
		el_pos_led_val.textContent = val == 2? "2 LEDs (if available)" : "just 1 LED (even if 2 available)";
		if(viaSlider !== true)
			el_pos_led_slider.value = val;
		ReloadPosForNewSettings();	
	}


	var GetDir = function(callback){
		//TODO: this should be returned by the pos file loader as with posbuffer (or whatever it's called these days)
		// Also it should use both LEDs.
		if(!cPosBuffer)
			return; //this shouldn't happen

		if(cPosDir_needs_adjusting){ // this happens if pos file loads before set file (and there is a set file to be loaded)
			getdir_callback = callback;
			return;
		}

		if(cPosDir && cPosDir.length > 0){	
			if(callback){
				callback(cPosDir); // 2LED dir
				return;
			}else{
				return cPosDir;
			}
		}

		var xy = new Int16Array(cPosBuffer);
		var dir = new Float32Array(xy.length/2);
		var pi = 3.14159265;
		for(var i=1;i<dir.length;i++){
			var ix = 2*i+0;
			var iy = 2*i+1;
			var ix_1 = 2*i-2;
			var iy_1 = 2*i-1;
			var dy = xy[iy] - xy[iy_1];
			var dx = xy[ix] - xy[ix_1];
			dir[i] = Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001 ? NaN : Math.atan2(dy, dx) + pi;
		}
		dir[0] = dir[1];
		if (callback)
			callback(dir);
		else
			return dir;
	}
	
	var GetCTetT = function(callback){ //get the timestamp for each spike
		if(!cTetT)
    		cTetT = PAR.GetTetrodeTime(cTetBuffer,cTetHeader,cN);
        // else we already have it

        return cTetT;
	}

	var GetCTetA = function(callback){ // get an array of the length waveWidth (= 50 probably), where each element of the array is a typedarray giving the voltage at time t for every wave
 
		if(!cTetA)
    		cTetA = PAR.GetTetrodeAmplitude(GetTetBufferProjected(),cTetHeader,cN,function(amps){cTetA = amps; callback(amps);});
		else // we already have it, return it asynchrousously for consistency
			setTimeout(function(){callback(cTetA);},1);
	}

	var GetSpeedHist = function(callback,timeMode,canvW,canvH){
		//TODO: cache result and be more careful about what point this might be called i.e. before/after posBuffer is available etc.
		//and make this async and possibly in a worker.
		var BIN_SIZE = 4;//cm per second
		var MAX_SPEED = 45; //cm per second
		if(!cPosBuffer)
			return;
		
		var data = new Int16Array(cPosBuffer); 
		var nBins = Math.ceil(MAX_SPEED/BIN_SIZE);
		var hist = new Int32Array(nBins);
		var nPos = data.length/2;
		
		var f = 1/BIN_SIZE*parseFloat(cPosHeader.sample_rate)/cPosHeader.units_per_meter*100;
		//compute speed bin inds and count number of occurances of each bin
		var binInd = new Uint8Array(nPos);
		for(var i=0;i<nPos-1;i++){
			var speed = Math.hypot(data[i*2+2]-data[i*2+0],data[i*2+3]-data[i*2+1]);
			binInd[i] = Math.floor(speed*f);
			if (binInd[i] < MAX_SPEED)
				hist[binInd[i]]++;
		}
		
		setTimeout(function(){callback(hist);},10);
	}
	
	var GetTetBufferProjected = function(){
		if(ORG.noProjection)
			return cTetBuffer;
		
		if(cTetBufferProjected)
			return cTetBufferProjected ;
			
		/*
		var oldInt8 = new Int8Array(cTetBuffer);
		var newInt8 = new Int8Array(cTetBuffer.byteLength);
		var project = function(dest,src){
			for(var i=0;i<50;i++){
				var v = (src[i + 3] - src[i+1])*2 + (src[i+4]-src[i]);
				dest[i] = v < -127 ? -127 : v> 127? 127 : v;
			}
		}
	
		for(var i=0;i<cN*4;i++)
			project(newInt8.subarray(i*(4+50),i*(4+50) + 50),oldInt8.subarray(i*(4+50),i*(4+50) + 50));
		cTetBufferProjected  = newInt8.buffer
		*/
		var oldInt8 = new Int8Array(cTetBuffer);
		var x_f32 = M.SGolayGeneralised({X:oldInt8,W:50,N:cN*4,S:50+4,off:4},12,4,0);
		var dxdt_f32 = M.SGolayGeneralised({X:oldInt8,W:50,N:cN*4,S:50+4,off:4},5,2,1);
		var d2xdt2_f32 = M.SGolayGeneralised({X:oldInt8,W:50,N:cN*4,S:50+4,off:4},5,2,2);

				
		//cast from float to int8 and normalise
		var projI8 = new Int8Array(dxdt_f32.length);
		for(var i=0;i<projI8.length;i++){
			var v = x_f32[i];
			projI8[i] = v<-127? -127 : v>127? 127 : v;
		}
		cTetBufferProjected  = projI8.buffer;
		return cTetBufferProjected ;
	}



	var DocumentDropFile = function(evt){
        evt = evt.originalEvent;
        evt.stopPropagation();
        evt.preventDefault();
        HideDropZone();
        recoveringFilesFromStorage = false;
        NewFiles(evt.dataTransfer.files); // FileList object.
    }
	var HideDropZone = function(){
        $drop_zone.hide();
        $drop_zone.toggleClass('alreadyUsed',true);
        $drop_excess_stuff.hide();
        if (!haveDroppedAtLeastOnce){
	        setTimeout(function(){$keyboard_notifier.toggleClass('ease', true)},100); //this prevents an ugly transition at the start
	        haveDroppedAtLeastOnce = true;
        }
        /*if($drop_zone){
            $drop_zone.remove();
            $drop_zone = null;
        }*/
	}
    var TetrodeButtonClick = function(){
    	var newTet = $(this).data('tet_num');
    	SwitchToTet(newTet);
    }
    var FileGroupClick = function(evt){
    	SwitchToExpTet($(this).data("EXP").name,cTet.num);
    }   
    var dragEndTimer = 0;
    var haveDroppedAtLeastOnce = false;
    var DocumentDragOver = function (evt) {
		if(draggingOut)
			return;
        evt = evt.originalEvent;
        evt.stopPropagation();
        evt.preventDefault();
        evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
        $banner.toggleClass('wibbly_wobbly',true);
        $drop_zone.show();
        if(dragEndTimer)
            clearTimeout(dragEndTimer)
        dragEndTimer = setTimeout(DocumentDragEnd,500); //this should work because the drag over even is fired every few ms, even if it isn't we still see a bit of wobble at least
    }
    var DocumentDragEnd = function(evt){
        $banner.toggleClass('wibbly_wobbly',false);
        if(haveDroppedAtLeastOnce)
            HideDropZone();
    }
	var draggingOut = false;
	var SaveFileDragStart = function(evt){

		if( $(this).data('brick-type') != 'cut')
			return;

		var cut_brick = $(this).data('EXP_CUT');
		if(!cut_brick.cut_instance)
			return;
		draggingOut = true;
		SaveCutDragStart(evt,cut_brick.parent.parent,cut_brick.parent.num,cut_brick.cut_instance);

	}
	var SaveFileDragEnd = function(evt){
		draggingOut = false;
	}

	var SaveCutDragStart = function(evt,exp,tet,cut){
		var b = new Blob([cut.GetFileStr()], {type: 'text/plain'}); 
		var blobURL = window.URL.createObjectURL(b);
		var filename = exp.name + "_" + tet +".cut";
		evt.originalEvent.dataTransfer.setData("DownloadURL",'application/octet-stream:' + filename +':' + blobURL);
		return true;
	};

	var FileBrickClick = function(evt){
		evt.stopPropagation();

		var $this = $(this);
		var brick_type = $this.data('brick-type');
		if(brick_type == 'cut'){
			var cut_brick = $this.data('EXP_CUT');
			SwitchToExpTet(cut_brick.parent.parent.name,cut_brick.parent.num);
			SwitchToCut(2,$this.data('EXP_CUT'));			
		}else if(brick_type == 'tet'){
			var tet_brick = $this.data('EXP_TET');
			SwitchToExpTet(tet_brick.parent.name,tet_brick.num);
		}else if(brick_type == 'pos' || brick_type == 'set'){
			SwitchToExpTet($this.data('EXP').name,cTet.num);
		}
		
		
	};
	
	

	el_pos_smoothing_slider.addEventListener("change",function(){SetPosSmoothing(this.value,true)});
	el_pos_speed_slider.addEventListener("change",function(){SetPosMaxSpeed(this.value,true)});
	el_pos_led_slider.addEventListener("change",function(){SetUseBothLEDs(this.value,true)});

	$files_panel.on("dragstart",".file_brick",SaveFileDragStart)
				.on("dragend",".file_brick",SaveFileDragEnd);
    $document.on("dragover", DocumentDragOver) 
             .on("drop", DocumentDropFile);
    $files_panel.on("click",".file_group",FileGroupClick)
				.on("click",".file_brick",FileBrickClick);
	$tet_list.on('click','.button',TetrodeButtonClick);

    ORG.AddCutActionCallback(CutActionCallback); //this function was added to ORG by cut.js



	//finally, we are ready to add the extra stuff to the ORG namespace
	ORG.SwitchToTet = SwitchToTet;
    ORG.SwitchToExpTet = SwitchToExpTet;
	ORG.SwitchToCut = SwitchToCut;
    ORG.GetExpName = function(){return cExp.name;};
	ORG.GetSetHeader = function(){return cSetHeader;};
    ORG.GetTet = function(){return cTet.num;};
	ORG.GetN = function(){return cN;};
	ORG.GetTetBuffer = function(){return cTetBuffer;};
	ORG.GetTetHeader = function(){return cTetHeader;};
	ORG.GetTetTimes = GetCTetT;
	ORG.GetTetAmplitudes = GetCTetA;
	ORG.GetPosBuffer = function(){return cPosBuffer;};
	ORG.GetPosHeader = function(){return cPosHeader;};
	ORG.GetCut = function(){return cCut;};
	ORG.GetCutHeader = function(){return cCutHeader;};
	ORG.AddFileStatusCallback = fileStatusCallbacks.add;
	ORG.RemoveFileStatusCallback = fileStatusCallbacks.remove;
	ORG.GetTetBufferProjected = GetTetBufferProjected;
	ORG.noProjection = true;
	ORG.GetState = function(){return SimpleClone(cState)};
	ORG.SetPosMaxSpeed = SetPosMaxSpeed;
	ORG.GetPosMaxSpeed = function(){return posMaxSpeed;};
    ORG.SetPosSmoothing = SetPosSmoothing;
    ORG.GetPosSmoothing = function(){return posSmoothingWidth;};
    ORG.SetUseBothLEDs = SetUseBothLEDs;
    ORG.GetUseBothLEDs = function(){return use_both_leds? 2 : 1 ;};
	ORG.GetSpeedHist = GetSpeedHist;
	ORG.GetEEGBuffer = function(){return cEegBuffer;};
	ORG.GetEEGHeader = function(){return cEegHeader;};
	ORG.SetPosHeaderOverride = SetPosHeaderOverride;
	ORG.GetDir = GetDir;
	ORG.GenerateDirCSVForDebug = function(){M.debug_print(GetDir(),function(x){return Math.round(x/3.1415*180);})};
	ORG.GenerateXYCSVForDebug = function(){M.debug_print(new Uint16Array(cPosBuffer),function(x){return x;},2)};
    return ORG;

}(T.ORG, T.PAR, T.CUT, $('#files_panel'),$(document),$('.file_drop'),T.FS,$('.tilewall_text'),$('#exp_list'),$('#tet_list'),
	document.getElementById('pos_smoothing_slider'),document.getElementById('pos_speed_slider'),
	document.getElementById('pos_smoothing_val'),document.getElementById('pos_speed_val')
	,$('.drop_banner'),$('.github_button_filedrop,#works_with_chrome'),
	$('.keyboard_focus_notifier'), document.getElementById('pos_led_slider'), document.getElementById('pos_led_val')
);


