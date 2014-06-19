"use strict";

var T = T || {};
T.FS = function(requestFileSystem,PERSISTANCE){
    var active = 0;
    var FilesInMemory = {};
    var FILE_SYSTEM_SIZE = 500*1024*1024; //500MB
    var files = {};
    var pendingReads = 0;
    var h = null; //will be a handle to the file system
    var readEntriesList = [];
    var listEntriesCount = 0;
    var listEntries = [];
    var haveTriedExtendingQuota = false;
    
    var ReadFile = function(name,callback,callbackState){
        pendingReads++;
        if(active)
            ReadDataFromAppFile(name,callback,callbackState);
        else
            ReadDataFromMemoryFile(name,callback,callbackState);
    }
    
    var WriteFile = function(name,file){
        if(active)
            WriteDataToAppFile(name,file);
        else
            WriteDataToMemoryFile(name,file);
    }
    
    var WriteDataToMemoryFile = function(name,file){
        FilesInMemory[name] = file;
    };
    
    var ReadDataFromMemoryFile = function(name,callback,callbackState){
    	setTimeout(function(){
            pendingReads--;
            callback(FilesInMemory[name],callbackState);
        },1); //it has to be async to match other version.
    };

	var FileDate = function(name){
		if(active)
			return new Date().getTime(); //TODO: make it work here too..though we don't really care about appdata any more.
			
		var file = FilesInMemory[name];	
		if(file)
			return new Date(file.lastModifiedDate).getTime();
		else
			return new Date().getTime();
	}

    var Toggle = function(newState,callback){
        if(newState == active)
            return;
    
        active = newState;
    
        if(active){
            requestFileSystem(PERSISTANCE, FILE_SYSTEM_SIZE, OnInit(callback), OnError(callback));
        }else{
            RemoveAll(callback);
        }

    }
    
    var GetPendingReadCount = function(){
        return pendingReads;
    }

    var RemoveAll = function(callback){
        if(h && h.root){
    		var reader = h.root.createReader();
    		reader.readEntries(RemoveEntries(reader,callback),OnError(callback));
	    }
    }

    var ArrayAsFile = function(data){
        return new Blob([new DataView(data)],{type: "application/octet-binary"});
    }

    var ReadDataFromAppFile = function(name,callback,callbackState){
    	if(!h)
    		throw("unable to read file '" + name + "' because the fileSystem is not yet initialised.");
    
    
    	if(!files.hasOwnProperty(name))
    		files[name] = {}
    	files[name].state = 'r';
    	files[name].read_callback = callback;
        files[name].read_callbackState = callbackState;
    	if(!files[name].fileEntry)
    		h.root.getFile(name, {create: true}, GotFileEntryHandle(name), OnError(callback));	//Should throw an error if the files already exists
    	else if(!files[name].file)
    		files[name].fileEntry.file(GotFileHandle(name),OnError(callback));
    	else 
    		setTimeout(function(){ReadDataFromAppFileB(name);},1); //we promissed to be async
    }

    //file is from a fileList array 
    var WriteDataToAppFile = function(name,file){
    	if(!h)
    		throw("unable to save file '" + name + "' because the fileSystem is not yet initialised.");
    
    	if(!files.hasOwnProperty(name))
    		files[name] = {}
    
    	files[name].state = 'w';
        files[name].pending_item = file;
    
    	if(!files[name].fileEntry)
    		h.root.getFile(name, {create: true}, GotFileEntryHandle(name), OnError(null));
    	else if(!files[name].writer)
    		files[name].fileEntry.createWriter(GotFileWriter(name),OnError(null));
    	else
    		WriteDataToAppFileB(name);
    
    }

    var GetFileList = function(callback){
    	listEntries = [];
        listEntriesCount = 0;
    	var reader = h.root.createReader();
    	reader.readEntries(ReadFullEntries(reader,callback),OnError(null)); 
    }


    var ReadDataFromAppFileB = function(name){
    	files[name].state = 'x';
        pendingReads--;
    	files[name].read_callback(files[name].file,files[name].read_callbackState);
    	files[name].read_callback = null;
        files[name].read_callbackState = null;
    }


    var WriteDataToAppFileB = function(name){
	    //either called directly by WriteDataToAppFile or called indirectly via GotFileEntryHandle, GotFileWriter
	    files[name].writer.write(files[name].pending_item);
	    files[name].state = 'x';
    }

    var GotFileEntryHandle = function(name) {
    	return function(fileEntry) {
    		files[name].fileEntry = fileEntry;
    		fileEntry.file(GotFileHandle(name),OnError(null));
    		fileEntry.createWriter(GotFileWriter(name),OnError(null));
    	}
    }

    var GotFileHandle = function(name){
    	return function(file){
    		files[name].file = file;
    		if(files[name].state == 'r')
    			ReadDataFromAppFileB(name);
    	}
    }

    var GotFileWriter = function(name){
    	return function(fileWriter) {
    		files[name].writer = fileWriter;
    		fileWriter.onerror = OnError(null);
    		fileWriter.onwriteend = WriteCompleted(name);
    		if(files[name].state == 'w')
    			WriteDataToAppFileB(name);
    	}
    }

    var WriteCompleted = function(name){
    	return function(evt){
    		delete files[name].pending_item;
    	}
    }

    var OnError = function(callback){
        return function(evt){
            if(!haveTriedExtendingQuota){
            	//if we haven't yet tried extending the quota lets do it now
            	haveTriedExtendingQuota = true;
            	webkitStorageInfo.requestQuota(PERSISTANCE,FILE_SYSTEM_SIZE,QuotaObtained(callback),OnError(callback)); 
            	console.log("trying to extend quota");
            	//we'll still throw the error below, but that makes sense because we will have failed to finish whatever async process it was we were doing
            }
        	
            var msg = "unknown error";
            switch (evt.code) {
            case FileError.QUOTA_EXCEEDED_ERR:
              msg = 'QUOTA_EXCEEDED_ERR';
              break;
            case FileError.NOT_FOUND_ERR:
              msg = 'NOT_FOUND_ERR';
              break;
            case FileError.SECURITY_ERR:
              msg = 'SECURITY_ERR';
              break;
            case FileError.INVALID_MODIFICATION_ERR:
              msg = 'INVALID_MODIFICATION_ERR';
              break;
            case FileError.INVALID_STATE_ERR:
              msg = 'INVALID_STATE_ERR';
              break;
            };
            
            throw('FileSystemError: ' + msg);
        }
    }

    var QuotaObtained = function(callback){
        return function(){
	        requestFileSystem(PERSISTANCE, FILE_SYSTEM_SIZE, OnInit(callback), OnError(callback));
        }
    }

    var RemoveEntries = function(reader,callback) {
    	return function(results){
          if (results.length) {
    		for(var i=0;i<results.length;i++)
    			results[i].remove(function() {console.log('Removed file.');}, OnError(callback));
            reader.readEntries(RemoveEntries(reader,callback),OnError(callback)); //there's still more to read
          }else{
              callback(null); //no more files to delete
    	  }
    	}
     }

     //this is used to just get a list of file names
    var ReadEntries = function(reader,callback) {
    	return function(results){
          if (!results.length) {
                callback(readEntriesList.sort());
          } else {
    		for(var i=0;i<results.length;i++)
    			readEntriesList.push(results[i].name);
            reader.readEntries(ReadEntries(reader,callback),OnError); //there's still more to read
          }
    	}
    }

    //this receives batches of fileEntry lists, it sends out requests for the individual file handles of each entry in the list
    //it then asks for the next batch of fileEntries.  
    var ReadFullEntries = function(reader,callback){
    	return function(results){
          if (results.length) {
            listEntriesCount += results.length;
    		for(var i=0;i<results.length;i++)
    			results[i].file(ReadFullEntriesGotFileHandle(callback),OnError(callback));//get the file handle from the fileEntry
            reader.readEntries(ReadFullEntries(reader,callback),OnError(callback)); //there's still more to read
          }
    	}
    }
    
    //this is a callback used by the ReadFullEntries function above
    var ReadFullEntriesGotFileHandle = function(callback){
        return function(file){
            listEntries.push(file);
            listEntriesCount--;
            if(listEntriesCount == 0){
                callback(listEntries);
            	listEntries = [];
            }
        }
    }


    var OnInit = function(callback){
        return function(fs){
        	h = fs;
        	files = {};
        	var dirReader = fs.root.createReader();
			readEntriesList = [];
        	dirReader.readEntries(ReadEntries(dirReader,callback),OnError(callback)); 
        }
    }

    var IsActive = function(){
        return active;
    }
    
    return {
        ReadFile: ReadFile,
        WriteFile: WriteFile,
        GetFileHandleList: GetFileList,
        Toggle: Toggle,
        GetPendingReadCount: GetPendingReadCount,
        ArrayAsFile: ArrayAsFile,
        IsActive: IsActive,
		FileDate: FileDate
    };
    
}(window.requestFileSystem || window.webkitRequestFileSystem,window.PERSISTENT);