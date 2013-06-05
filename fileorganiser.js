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
            
            if(!recoveringFilesFromStorage) //TODO: this is a potential bug, because any files you drop while also loading from storage will not be stored
    			T.FS.WriteFile(files[i].name,files[i]); //store the file in filesystem 
                
            var ext = REGEX_FILE_EXT.exec(files[i].name);
            ext = ext[1];
    		var base = files[i].name.slice(0,files[i].name.length-ext.length-1);
    
            if(ext=="cut")
                PAR.LoadCut2(files[i],parseInt(base.slice(-1)),GotFileDetails); //reads the header to find out the experiment name (done asynchrously)
    		else if(ext == "pos")
    			GotFileDetails(files[i].name,base,"pos")
    		else if(ext == "set")
    			GotFileDetails(files[i].name,base,"set")
            else if(!isNaN(parseInt(ext)))
    			GotFileDetails(files[i].name,base,"tet",parseInt(ext));
    		else{
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
    	
		//TODO: should immediately display what we have and then as new things come along we should add them to the list, and if they are relevant top the current
		// exp-tet we should load them (except in the case of a new cut when we already have a cut)
    	pendingNewFiles--;
        if(pendingNewFiles == 0){
           DispFiles();
    	   //SwitchToExpTet(0,1); //TODO: cant do this because we need to wait for async writes to complete before we can read them
    	}
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
		cTetHeader = null; cTetBuffer = null;
		cState.tet = 0; //we leave pos and set alone, and we put out a call to SwitchToCut which deals with cState.cut
		cLoadingTet = new living(); 
		
    	if(cExp &&  cExp.tets && cExp.tets[cTet]){
			// load tet if it exists
    		if(cExp.tets[cTet].tet)
    			T.FS.ReadFile(cExp.tets[cTet].tet,PAR.LoadTetrode,InternalPARcallback("tet"));		
				
    		if(cExp.tets[cTet].cut_names[0])
				SwitchToCut(1,cExp.tets[cTet].cut_names[0]) //if there are one or more cut files, load the first one
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
				//data is the name of a cut file to retrieve from T.FS (we assume it is for the current exp-tet)
				cCutIsFileOrAllZero = true;
				T.FS.ReadFile(data,PAR.LoadCut,InternalPARcallback("cut"));	//before generating the closure InternalPARcallback, cState.cut gets set to 1
				FinishedLoadingFileCallback(cState,null); //announce what is about to be loaded
				break;
				
			case 2:
				//data is an index into the array of cut instances for the current exp-tet
				cState.cut = 1;
				FinishedLoadingFileCallback(cState,null); //announce what is about to be loaded
				cCut = cExp.tets[cTet].cut_instances(data); //TODO: somehow need to recover the action list in the gui (it is stored in the cut instance)
				cState.cut = 2;
				FinishedLoadingFileCallback(cState,"cut"); //announce that cut has been loaded
				cState.cut = 3;
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

	//TODO: can do better than this mess of DOM-using functions =================================================
	var DocumentDropFile = function(evt){
        evt = evt.originalEvent;
        evt.stopPropagation();
        evt.preventDefault();
        if($drop_zone){
            $drop_zone.remove();
            $drop_zone = null;
        }
    	T.HideHelp(); //in case it was being shown
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
    		str.push("<div class='file_group'><div class='file_group_title'>" + exp.name + "</div>");
            for(var j=0;j<exp.tets.length;j++)if(exp.tets[j]){
    			for(var k=0;k<exp.tets[j].cut_names.length;k++)
    				str.push("<div class='file_brick cut_file_brick' tet='" + j + "' data-expind='" + i + "'>" + exp.tets[j].cut_names[k].replace(exp.name,"~") + "</div>");	//cut file
    			if(exp.tets[j].tet)
    				str.push("<div class='file_brick tet_file_brick' tet='" + j + "'>" + exp.tets[j].tet.replace(exp.name,"~") + "</div>");		//tet file
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
    	
    	var str = ["<div class='button_group'>"];
    	for(i=0;i<available_tets.length;i++)if(available_tets[i])
    		str.push("<input type='radio' name='tetrode' id='tetrode" + i + "' value='" + i + "'/><label for='tetrode" + i + "'>t" + i +"</label>");
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
	
		cExp.$div.find(".file_brick[tet='" + cTet + "']").eq(0).before($(
				"<div class='file_brick new_cut_file_brick' tet='" + cTet + "' active='' data-bricktype='new cut' " + 
				"data-expind='" + cExp.ind + "' draggable='true'>~" + String.fromCharCode("a".charCodeAt(0)+ind)+ "_" + cTet + ".cut</div>")); 
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
		var exp = exps[$(this).data('expind')];
		var bricktype = $(this).data('bricktype');
		
		if (bricktype == 'new cut')
			SaveCutDragStart(evt,exp,cTet,cCut);//TODO: we don't really want cTet and cCut we want to know which tet and cut were actually clicked on
			
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
		$files_panel.find('[tet]').removeAttr("active");
    	$files_panel.find('[tet=' + cTet + ']').attr("active","");
	}
	var MarkCurrentExp = function(){
		document.title = cExp.name + ' [Cutting GUI]';
    	for(var i=0;i<exps.length;i++)if(i!=cExp)
    		exps[i].$div.removeAttr("active");
    	cExp.$div.attr("active","true"); 
	}
	window.URL = window.webkitURL || window.URL;
	$files_panel.on("dragstart",".file_brick",SaveFileDragStart);
    $document.on("dragover", DocumentDragOver) 
             .on("drop", DocumentDropFile);
    $files_panel.on("click",".file_group",FileGroupClick)
                .on("change","input[name=tetrode]:radio",TetrodeRadioClick);
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
			GetPosBuffer: function(){return cPosBuffer;},
			GetPosHeader: function(){return cPosHeader;},
			GetCut: function(){return cCut;},
			GetCutHeader: function(){return cCutHeader;}
            };
    
}(//Use T.ORG constructor with the following inputs
$('#files_panel'),$(document),$('.file_drop'),T.PAR,T.FinishedLoadingFile, T.CUT
);

    
    