"use strict";

// T.ORG: organises all the files that get drag-dropped (and saved)
// It keeps a list of the available files and organises them into an array of experiments,
// each with an array of tetrodes.
// It is also responsible for content and interactivity of the files pannel div.


T.ORG = function($files_panel,$document,$drop_zone, PAR, FinishedLoadingFileCallback,CUT){

    var exps = []; //this array only ever grows, elemts can be set to null, but they never get spliced out

	//used for canceling asynchrounus loads/parses, see InternalPARcallback for useage
	var living = function(){this.alive=true;}

	//c prefix means "current"
    var cExp = {}; //exp object
    var cTet = -1; //tetrode number
    var cCut = null; //cut object
	var cCutIsFileOrAllZero = false; //is true when the current cut is laoded from file and has not yet been modified, and when we create an all-zero cut, the rest of the time it is false
	var cN = null; // number of spikes
	var makeNullCutFromN = false; //when we recieve a tetrode file we shall generate a null cut if this is true, otherwise we leave the cut generation up to SwitchToCut
	var cCutHeader = null; //object with key name pairs
	var cTetBuffer = null; //arraybuffer
	var cTetT = null; //uint32array
	var cTetA = null; //uint16array of form A_11 A_12 A_13 A_14 A_21 A_22 ... A_n4 giving max-min on each wave
	var cTetHeader = null; //object with key name pairs
	var cPosBuffer = null; //arraybuffer
	var cPosHeader = null; //object with key name pairs
	var cSetHeader = null; //object with key name pairs
	var cLoadingExp = new living();
	var cLoadingTet = new living();
	var cLoadingCut = new living();
	var cState = {set:0,pos:0,cut:0,tet:0}; 
		//STATE keeps track of what is loaded. For set,pos,cut and tet fields..
			//	0 - file does not exist
			//	1 - file exists but has not been read from file or parsed yet
			//  2 - the file is being announced to the callback
			//  3 - the file has been previously announced


    var EXP_PROPS = function(ind){
				this.name = null;
				this.pos = null;
				this.set = null;
				this.tets = [];
				this.ind = ind;
				this.$div = null;
			};
    var EXP_PROPS_TET = function(){
				this.tet = null;
				this.cut_names = []; //for files
				this.cut_instances = []; //for instances of the cut class
				};
    var REGEX_FILE_EXT = /\.([0-9a-z]+)$/i;

    var recoveringFilesFromStorage = false;
    var pendingNewFiles = 0;

    var RecoverFilesFromStorage = function(){
    	//takes the files in storage and calls the code as though they had been dropped afresh on the window
    	recoveringFilesFromStorage = true;
        T.FS.GetFileHandleList(NewFiles);
		HideDropZone();
    }

    var NewFiles = function(files){
		//this function iterates through a list of file handles, calling GotFileDetails for each file, either synchronously or asynchrously
		//it also stores the files for later use (unless we are currently getting files from storage)

    	pendingNewFiles = files.length;
        for(var i =0; i <files.length;i++){

            var ext = REGEX_FILE_EXT.exec(files[i].name);
            ext = ext[1];
    		var base = files[i].name.slice(0,files[i].name.length-ext.length-1);

			var type = -1;
			if(ext=="cut") 					type = 1;
			else if(ext == "pos") 			type = 2;
    		else if(ext == "set") 			type = 3;
            else if(!isNaN(parseInt(ext)))	type = 4;

			if(!recoveringFilesFromStorage && type != -1)//TODO: this is a potential bug, because any files you drop while also loading from storage will not be stored
					T.FS.WriteFile(files[i].name,files[i]); //store the file in filesystem 

			switch(type){
				case 1:
					PAR.LoadCut2(files[i],parseInt(base.slice(-1)),GotFileDetails); //reads the header to find out the experiment name (done asynchrously)
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
				default:
					pendingNewFiles--;//unknown file type
					//TODO: see note in equivalent bit of code in GotFileDetails
					if(pendingNewFiles == 0)
						DispFiles();
			}

        }      
    }

    var GotFileDetails = function(file_name,exp_name,ext,tet){
		//this function stores the file's name in the relevant place in our list of experiments

    	var exp, i;
    	for(i=0,exp=exps[0]; i<exps.length; i++,exp=exps[i]) if(exp && exp.name && exp.name == exp_name)
    		break;	

    	//if we didn't find the expirment in the array we make a new one
    	if(!exp){
    		exp = new EXP_PROPS(exps.length);
    		exp.name = exp_name;
    		exps.push(exp);
    	}

    	if(ext=="set")
    		exp.set = file_name;
    	else if(ext=="pos")
    		exp.pos = file_name;
    	else if(ext=="cut"){
    		if(!exp.tets[tet])
    			exp.tets[tet] = new EXP_PROPS_TET();
    		exp.tets[tet].cut_names.push(file_name);
    	}else{ //tet file
    		if(!exp.tets[tet])
    			exp.tets[tet] = new EXP_PROPS_TET();
    		exp.tets[tet].tet = file_name;
    	}

		pendingNewFiles--;

		//TODO: should immediately display what we have and then as new things come along we should add them to the list, and if they are relevant top the current
		// exp-tet we should load them (except in the case of a new cut when we already have a cut)
        if(pendingNewFiles == 0)
           DispFiles();

    }


	var InternalPARcallback = function(filetype){
		//this function is used by SwitchToExpTet and SwitchToTet to generate a closure for dealing with newly parsed files

		cState[filetype] = 1; //remember that we are loading this filetype

		// store some instance handles for use in the closure below.
		// Note the heirarchy which we enforce with if-returns: exp > tet > cut
		var hLivingExp  = cLoadingExp; 
		var hLivingTet = cLoadingTet;
		var hLivingCut = cLoadingCut;
		return function(data){
			if(!hLivingExp.alive) return;

			if (filetype == "cut"){
				if(!hLivingTet.alive || !hLivingCut.alive) return;
				cCut = new CUT.cls(cExp.name,cTet,1,data.cut,"loaded from file");
				cCutHeader = data.header;
			}else if(filetype == "tet"){
				if(!hLivingTet.alive) return;
				cTetBuffer = data.buffer;
				cTetHeader = data.header;
				cN = parseInt(data.header.num_spikes);
				if(makeNullCutFromN){//SwitchToCut may have requested a null-cut to be generated at this point
					cCut = new CUT.cls(cExp.name,cTet,4,cN,"blank slate");
					cState.cut = 2; 
					FinishedLoadingFileCallback(cState,"cut"); //it shouldn't matter that we announce the arival of the cut before we announce the arival of the tet (below).
					cState.cut = 3; 
				}	
				makeNullCutFromN = false;
			}else if(filetype == "set"){
				cSetHeader = data.header;
			}else if(filetype = "pos"){
				cPosBuffer = data.buffer;
				cPosHeader = data.header;
			}

			cState[filetype] = 2; // tell the callback that this is the filetype that has just loaded
			FinishedLoadingFileCallback(cState,filetype);
			cState[filetype] = 3; //next time we shall tell the callback that it has ben told about this filetype
		}
	}

    var SwitchToExpTet = function(exp_ind,tet_ind){
    	cExp = exps[exp_ind];	
		MarkCurrentExp();

		cLoadingExp.alive = false; //if there was anything previously loading, we need to stop it
		cSetHeader = null;
		cPosHeader = null; cPosBuffer = null;
        cState.pos = 0; cState.set = 0; cState.cut = 0; cState.tet = 0; //we are starting from scratch here

		cLoadingExp = new living();		
		// load pos and set if they exist
		if(cExp && cExp.pos)
            T.FS.ReadFile(cExp.pos,PAR.LoadPos,InternalPARcallback("pos"));
        if(cExp && cExp.set)
            T.FS.ReadFile(cExp.set,PAR.LoadSet,InternalPARcallback("set"));

		SwitchToTet(tet_ind); //load tet and cut if they exist, this will trigger the null call to FinishedLoadingFileCallback
    }

    var SwitchToTet = function(tet_ind){
		cTet = tet_ind;
		MarkCurrentTet();

		cLoadingTet.alive = false; //if there were any tet or cut files loading we need to stop them
		cN = null;
		cTetHeader = null; cTetBuffer = null; cTetT = null; cTetA = null;
		cState.tet = 0; //we leave pos and set alone, and we put out a call to SwitchToCut which deals with cState.cut
		cLoadingTet = new living(); 

    	if(cExp &&  cExp.tets && cExp.tets[cTet]){
			// load tet if it exists
    		if(cExp.tets[cTet].tet)
    			T.FS.ReadFile(cExp.tets[cTet].tet,PAR.LoadTetrode,InternalPARcallback("tet"));		

    		if(cExp.tets[cTet].cut_names[0])
				SwitchToCut(1,0) //if there are one or more cut files, load the first one
			else if(cExp.tets[cTet].cut_instances.length)
				SwitchToCut(2,cExp.tets[cTet].cut_instances.length-1); //otherwise, if there are one or more cut isntances, load the first one
			else if(cExp.tets[cTet].tet)
				SwitchToCut(4); //otherwise, if we have tetrode data let's make an all-zero cut, TODO: this is more complciated because we don't know what cN is until later
			else
				SwitchToCut(0); //failing all of that, just clear the old cut

    	}else{
			SwitchToCut(0); //if there is no data for the tetrode then clear the old cut and announce the situation
		}

    }

	var CutActionCallback = function(cut,info){
		if (!cCutIsFileOrAllZero) return; //once we've moved off from being an actual file there is no going back, having said that TODO: might be nice to respond to undoing back to the orginal file		
		if (info.type == "load") return; //the load should have been requested by the SwitchToCut function below, where we deal with its implications fully

		cCutIsFileOrAllZero = false;
		cExp.tets[cTet].cut_instances.push(cCut);
		ShowCutInstance(cExp.tets[cTet].cut_instances.length-1);
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
				FinishedLoadingFileCallback(cState,null); //announce what is about to be loaded
				break;

			case 1:
				//data is the index of a cut name in the cut_names array for the cTet on cExp, we retrieve the cut file from T.FS
				cCutIsFileOrAllZero = true;
				T.FS.ReadFile(cExp.tets[cTet].cut_names[data],PAR.LoadCut,InternalPARcallback("cut"));	//before generating the closure InternalPARcallback, cState.cut gets set to 1
				FinishedLoadingFileCallback(cState,null); //announce what is about to be loaded
				MarkCurrentCut(data,null);
				break;

			case 2:
				//data is an index into the array of cut instances for the current exp-tet
				cState.cut = 1;
				FinishedLoadingFileCallback(cState,null); //announce what is about to be loaded
				cCut = cExp.tets[cTet].cut_instances[data];
				cState.cut = 2;
				FinishedLoadingFileCallback(cState,"cut"); //announce that cut has been loaded
				cCut.ReTriggerAll(); //relive the whole life of the cut again
				cState.cut = 3;
				MarkCurrentCut(null,data);
				break;

			case 3:
				//data is of the same form as the private cutInds array in the cut class (i.e. this is probably the output from some automated cutting function)
				cState.cut = 1;
				FinishedLoadingFileCallback(cState,null); //announce what is about to be loaded
				cCut = new CUT.cls(cExp.name,cTet,3,data,"special cut");
				cState.cut = 2;
				FinishedLoadingFileCallback(cState,"cut"); //announce that cut has been loaded
				cState.cut = 3;
				cExp.tets[cTet].cut_instances.push(cCut);
				ShowCutInstance(cExp.tets[cTet].cut_instances.length-1);
				break;

			case 4:
				//data is null, we need to make an all-zero cut
				cState.cut = 1;
				FinishedLoadingFileCallback(cState,null); //announce what is about to be loaded
				cCutIsFileOrAllZero = true;
				if(cN == null)
					makeNullCutFromN = true; //shall have to wait for the tet file to load, it will check this flag and make a cut
				else{
					cCut = new CUT.cls(cExp.name,cTet,4,cN,"blank slate");
					cState.cut = 2;
					FinishedLoadingFileCallback(cState,"cut"); //announce that cut has been loaded
					cState.cut = 3;
				}
				break;
		}


	}


	var GetCTetT = function(callback){ //get the timestamp for each spike
		if(!cTetT)
    		cTetT = PAR.GetTetrodeTime(cTetBuffer,cTetHeader,cN);
        // else we already have it
        
        return cTetT;
	}

	var GetCTetA = function(callback){ // get an array of the length waveWidth (= 50 probably), where each element of the array is a typedarray giving the voltage at time t for every wave
		if(!cTetA)
    		cTetA = PAR.GetTetrodeAmplitude(cTetBuffer,cTetHeader,cN,function(amps){cTetA = amps; callback(amps);});
		else // we already have it, return it asynchrousously for consistency
			setTimeout(function(){callback(cTetA);},1);
	}

	//TODO: can do better than this mess of DOM-using functions =================================================
	var DocumentDropFile = function(evt){
        evt = evt.originalEvent;
        evt.stopPropagation();
        evt.preventDefault();
        if($drop_zone){
            $drop_zone.remove();
            $drop_zone = null;
        }
        recoveringFilesFromStorage = false;
        NewFiles(evt.dataTransfer.files); // FileList object.
    }
	var HideDropZone = function(){
	    if($drop_zone){
            $drop_zone.remove();
            $drop_zone = null;
        }
	}
	var DispFiles = function(){
    	exps.sort(function(a,b){return a.name==b.name ? 0 : a.name>b.name ? 1 : -1; });

    	$files_panel.html("");
    	var available_tets = [];
    	var i, exp;
    	for(i=0, exp=exps[0];i<exps.length;i++,exp=exps[i]){
    		var str = []
    		str.push("<div class='file_group' data-expind='" + i + "'><div class='file_group_title'>trial '" + exp.name + "'</div>");
            for(var j=0;j<exp.tets.length;j++)if(exp.tets[j]){
				str.push("<div class='tet_group' tet='" + j + "' data-tetind='" + j + "'>")
    			for(var k=0;k<exp.tets[j].cut_names.length;k++)
    				str.push("<div class='file_brick cut_file_brick' data-bricktype='cut' data-cuttype='file' data-cutind='" + k + "'>" + exp.tets[j].cut_names[k].replace(exp.name,"~") + "</div>");	//cut file
				if(exp.tets[j].tet)
    				str.push("<div class='file_brick tet_file_brick'>" + exp.tets[j].tet.replace(exp.name,"~") + "</div>");		//tet file
				str.push("</div>");
    			available_tets[j] = true;
    		}
    		if(exp.pos)
    			str.push("<div class='file_brick pos_file_brick'>" + exp.pos.replace(exp.name,"~") + "</div>");
    		if(exp.set)
    			str.push("<div class='file_brick pos_file_brick'>" + exp.set.replace(exp.name,"~") + "</div>");
    		str.push("</div>");
    		exp.$div = $(str.join("")).data("index",i);
    		$files_panel.append(exp.$div);
    	}

    	var str = ["<div class='button_group'>tetrode: "];
    	for(i=0;i<available_tets.length;i++)if(available_tets[i])
    		str.push("<input type='radio' name='tetrode' id='tetrode" + i + "' value='" + i + "'/><label for='tetrode" + i + "'>" + i +"</label>");
    	str.push("</div>");
    	$files_panel.prepend($(str.join('\n')));

    	for(i=0;i<available_tets.length;i++)if(available_tets[i]){
    		$('#tetrode' + i).prop('checked',true);
			cTet = i;
			MarkCurrentTet();
    		break;
    	}
    	recoveringFilesFromStorage = false; // may already have been false, but now it definitely is
    }
	var ShowCutInstance = function(ind){
		cExp.$div.find(".tet_group[tet='" + cTet + "']").prepend($(
				"<div class='file_brick new_cut_file_brick' data-bricktype='cut' data-cuttype='new' data-cutind='" + ind + "' " 
				+ "' draggable='true'>~" + String.fromCharCode("a".charCodeAt(0)+ind)+ "_" + cTet + ".cut</div>")); 
		MarkCurrentCut(null,ind);
	}
    var TetrodeRadioClick = function(){
    	var newTet = parseInt($(this).val());
    	SwitchToTet(newTet);
    }
    var FileGroupClick = function(evt){
    	SwitchToExpTet($(this).data("index"),cTet);
    }    
    var DocumentDragOver = function (evt) {
        evt = evt.originalEvent;
        evt.stopPropagation();
        evt.preventDefault();
        evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
    }
	var SaveFileDragStart = function(evt){

		if( $(this).data('bricktype') != 'cut')
			return;

		if( $(this).data('cuttype') != 'new')
			return;

		var exp = exps[$(this).parent().parent().data('expind')];
		var tet = $(this).parent().data('tetind');

		var svCut = exp.tets[tet].cut_instances[$(this).data('cutind')];
		SaveCutDragStart(evt,exp,tet,svCut);

		//todo: for completeness it might be nice to implement dragging of other files too
	}
	var SaveCutDragStart = function(evt,exp,tet,cut){
		var b = new Blob([cut.GetFileStr()], {type: 'text/plain'}); 
		var blobURL = window.URL.createObjectURL(b);
		var filename = exp.name + "_" + tet +".cut";
		evt.originalEvent.dataTransfer.setData("DownloadURL",'application/octet-stream:' + filename +':' + blobURL);
		return true;
	};
	var MarkCurrentTet = function(){
		$files_panel.find('.tet_group').removeAttr("active"); //TODO: ought to keep a jquery cache of all tet_groups with each tet=x value
    	$files_panel.find('.tet_group[tet=' + cTet + ']').attr("active","");
	}
	var MarkCurrentExp = function(){
		document.title = cExp.name + ' [Cutting GUI]';
    	cExp.$div.attr("active","")
				 .siblings().removeAttr("active");
	}
	var MarkCurrentCut = function(file_ind,inst_ind){
		var $cut_brick;
		if(file_ind != null)
			$cut_brick = cExp.$div.find(".tet_group[tet='"+cTet+"'] > .cut_file_brick[data-cutind='" + file_ind + "']");
		else if(inst_ind != null)
			$cut_brick = cExp.$div.find(".tet_group[tet='"+cTet+"'] > .new_cut_file_brick[data-cutind='" + inst_ind + "']");
		else{
			console.log("what do you mean MarkCurrentCut?");
			return;
		}
		$cut_brick.attr("active","")
				  .siblings().removeAttr("active");
	}
	var FileBrickClick = function(evt){
		evt.stopPropagation();

		var $this = $(this);
		if($this.data('bricktype') != 'cut')
			return;

		if($this.data('cuttype') == 'new')
			SwitchToCut(2,$this.data('cutind'));
		else
			SwitchToCut(1,$this.data('cutind'));
	};

	window.URL = window.webkitURL || window.URL;
	$files_panel.on("dragstart",".file_brick",SaveFileDragStart);
    $document.on("dragover", DocumentDragOver) 
             .on("drop", DocumentDropFile);
    $files_panel.on("click",".file_group",FileGroupClick)
                .on("change","input[name=tetrode]:radio",TetrodeRadioClick)
				.on("click",".file_brick",FileBrickClick);

	// '.file_group[active]>tet_group[active]>.file_brick'
	//=======================================================

    T.CUT.AddActionCallback(CutActionCallback);

    return { //expose some of the functions, and a few read-only things via simple Get* functions
            SwitchToTet: SwitchToTet, 
            SwitchToExpTet: SwitchToExpTet,
			SwitchToCut: SwitchToCut,
			RecoverFilesFromStorage: RecoverFilesFromStorage,
            GetExp: function(ind){return ind === undefined? {name: cExp.name} : {name: exps[ind].name};},
			GetSetHeader: function(){return cSetHeader;},
            GetTet: function(){return cTet;},
			GetN: function(){return cN;},
			GetTetBuffer: function(){return cTetBuffer;},
			GetTetHeader: function(){return cTetHeader;},
			GetTetTimes: GetCTetT,
			GetTetAmplitudes: GetCTetA,
			GetPosBuffer: function(){return cPosBuffer;},
			GetPosHeader: function(){return cPosHeader;},
			GetCut: function(){return cCut;},
			GetCutHeader: function(){return cCutHeader;}
            };

}(//Use T.ORG constructor with the following inputs
$('#files_panel'),$(document),$('.file_drop'),T.PAR,T.FinishedLoadingFile, T.CUT
);


