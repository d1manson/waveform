"use strict";

var BuildWorker = function(foo){
   var str = foo.toString()
             .match(/^\s*function\s*\(\s*\)\s*\{(([\s\S](?!\}$))*[\s\S])/)[1];
   return  new Worker(window.URL.createObjectURL(
                      new Blob([str],{type:'text/javascript'})));
}

var SimpleClone = function(ob){
	return JSON.parse(JSON.stringify(ob));
}

var isNum = function(x){
	return (typeof(x) === "number") && isFinite(x); //returns false for +-Infinity, NaN, null, undefined, and any other rubbish you might try it with
}