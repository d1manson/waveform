"use strict";

var BuildWorker = function(foo){
// see also worker-bridge.js
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

var Swap32 = function(val) {
	return ((val & 0xFF) << 24)
		   | ((val & 0xFF00) << 8)
		   | ((val >> 8) & 0xFF00)
		   | ((val >> 24) & 0xFF);
}

var endian = (function(){
	var b = new ArrayBuffer(2);
	(new DataView(b)).setInt16(0,256,true);
	return (new Int16Array(b))[0] == 256? 'L' : 'B';
})();