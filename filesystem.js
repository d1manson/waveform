"use strict";

var T = T || {};
T.FS = function(){
    var FilesInMemory = {};
    var pendingReads = 0;
    
    var ReadFile = function(name,callback,callbackState){
        pendingReads++;
        setTimeout(function(){
            pendingReads--;
            callback(FilesInMemory[name],callbackState);
        },1); //it has to be async to match old version.
    }
    
    var WriteFile = function(name,file){
        FilesInMemory[name] = file;
    }
    
	var FileDate = function(name){	
		var file = FilesInMemory[name];	
		if(file)
			return new Date(file.lastModifiedDate).getTime();
		else
			return new Date().getTime();
	}
    
    var ArrayAsFile = function(data){
        return new Blob([new DataView(data)],{type: "application/octet-binary"});
    }
    
    return {
        ReadFile: ReadFile,
        WriteFile: WriteFile,
        GetPendingReadCount: function(){return pendingReads;},
        ArrayAsFile: ArrayAsFile,
     	FileDate: FileDate
    };
    
}();