"use strict";

// T.ORG: organises all the files that get drag-dropped (and saved)
// It keeps a list of the available files and organises them into an array of experiments,
// each with an array of tetrodes.
// It is also responsible for content and interactivity of the files pannel div.


T.ORG = function($files_panel,$document,$drop_zone, PAR,
                    FinishedLoadingTet,FinishedLoadingCut,FinishedLoadingPos,FinishedLoadingSet,FinishedLoadingFile){
    
    var exps = [];
    var cExp = {}; //current exp object
    var cTet = -1; //current tetrode number
    
    var EXP_PROPS = function(){
				this.name = null;
				this.pos = null;
				this.set = null;
				this.tets = [];
				this.$div = null;
			};
    var EXP_PROPS_TET = function(){
				this.tet = null;
				this.cut_names = [];
				};
    var REGEX_FILE_EXT = /\.([0-9a-z]+)$/i;
    
    var recoveringFilesFromStorage = false;
    var pendingDropFiles = 0;
    
    var RecoverFilesFromStorage = function(){
    	//takes the files in storage and calls the code as though they had been dropped afresh on the window
    	recoveringFilesFromStorage = true;
        T.FS.GetFileHandleList(NewFiles);
        if($drop_zone){
            $drop_zone.remove();
            $drop_zone = null;
        }
    }

    var NewFiles = function(files){
    	pendingDropFiles = files.length;
    	
        for(var i =0; i <files.length;i++){
            
            if(!recoveringFilesFromStorage)
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
    			pendingDropFiles--;//unknown file type
    			continue; //dont save it
    		}
    		
        }      
    }

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

    //TODO: need to pass this as a callback to LoadCut2
    var GotFileDetails = function(file_name,exp_name,ext,tet){
    	var exp, i;
    	for(i=0,exp=exps[0]; i<exps.length; i++,exp=exps[i]) if(exp && exp.name && exp.name == exp_name)
    		break;	
    		
    	//if we didn't find the expirment in the array we make a new one
    	if(!exp){
    		exp = new EXP_PROPS();
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
    	
    	pendingDropFiles--;
        if(pendingDropFiles == 0){
           DispFiles();
    	   //SwitchToExpTet(0,1); //TODO: cant do this because we need to wait for async writes to complete before we can read them
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
    			//TODO: fix this: new cut is just one generic button that always gives the current cutInds
    			str.push("<div class='file_brick new_cut_file_brick' tet='" + j + "' data-bricktype='new cut' data-expind='" + i + "' draggable='true'>new cut</div>"); 
    			for(var k=0;k<exp.tets[j].cut_names.length;k++)
    				str.push("<div class='file_brick cut_file_brick' tet='" + j + "'>" + exp.tets[j].cut_names[k].replace(exp.name,"~") + "</div>");	//cut file
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
    		SwitchToTet(i,null);
    		break;
    	}
    	recoveringFilesFromStorage = false; // may already have been false, but now it definitely is
    }

    var SwitchToExpTet = function(exp_ind,tet_ind){
    	var exp = exps[exp_ind];
    	cExp = exp;
    	
    	//toggle off the active attr on all but the new exp
    	for(var i=0;i<exps.length;i++)if(i!=exp_ind)
    		exps[i].$div.removeAttr("active");
    	exp.$div.attr("active","true"); 
    	
    	document.title = exp.name + ' [Cutting GUI]';
        SwitchToTet(tet_ind,exp);
    	//	TODO: pos and set file
    
    }


    var SwitchToTet = function(tet_ind,exp){
    	cTet = tet_ind;
        $files_panel.find('[tet]').removeAttr("active");
    	$files_panel.find('[tet=' + tet_ind + ']').attr("active","");
        
        if(recoveringFilesFromStorage || exp == null)
            return; //here we dont actually load anything
            
    	if(exp &&  exp.tets && exp.tets[tet_ind]){
    		if(exp.tets[tet_ind].tet)
    			T.FS.ReadFile(exp.tets[tet_ind].tet,PAR.LoadTetrode,FinishedLoadingTet);		
    		if(exp.tets[tet_ind].cut_names[0])
    			T.FS.ReadFile(exp.tets[tet_ind].cut_names[0],PAR.LoadCut,FinishedLoadingCut);	
    	}
        if(exp && exp.pos)
            T.FS.ReadFile(exp.pos,PAR.LoadPos,FinishedLoadingPos);
        if(exp && exp.set)
            T.FS.ReadFile(exp.set,PAR.LoadSet,FinishedLoadingSet);
        
        if(T.FS.GetPendingReadCount() == 0){ //if none of the files were avaialble we still call FinishLoadingFiles so that we clear the previous tet-ind
            alert('no pos data and no data for tetrode ' + tet_ind);
            FinishedLoadingFile();
        }
    
    }

    var TetrodeRadioClick = function(){
        var oldTet = cTet;
    	var newTet = parseInt($(this).val());
    	SwitchToTet(newTet,cExp);
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
      
    var GetExp = function(){
        return {name: cExp.name};
    }
    
    var GetTet = function(){
        return cTet;
    }
    

    $document.on("dragover", DocumentDragOver) 
             .on("drop", DocumentDropFile);
    $files_panel.on("click",".file_group",FileGroupClick)
                .on("change","input[name=tetrode]:radio",TetrodeRadioClick);
    
    
    return { //expose some of the functions
            SwitchToTet: SwitchToTet, 
            RecoverFilesFromStorage: RecoverFilesFromStorage,
            SwitchToExpTet: SwitchToExpTet,
            GetExp: GetExp,
            GetTet: GetTet
            };
    
}(//Use T.ORG constructor with the following inputs
$('#files_panel'),$(document),$('.file_drop'),T.PAR,T.FinishedLoadingTet,
T.FinishedLoadingCut,T.FinishedLoadingPos,T.FinishedLoadingSet,T.FinishedLoadingFile
);

    
    