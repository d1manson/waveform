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


//Custom jQUery plugin
// translate
$.fn.translate = function(x,y){
   
   var str = x==null ? "" : "translate(" + x + "px," + y + "px)";
   
   this.css({
      transform: str,
      webkitTransform: str,
      mozTransofrm: str
   });
   
   return this;
    
}

$.fn.anyHasClass = function(cls){
	return $.map(this,function(el){
		return $(el).hasClass(cls);
	}).some(function(val){return val;});
}

var CanvToImgStr = function(c,copyClasses){
	return "<img src='" + c.toDataURL() +"' width='" + c.style.width + "' height='" + c.style.height + 
				"' class='" + (copyClasses === true? c.className : '') + "'/>";
}

//From http://stackoverflow.com/a/10284006/2399799
//Pythonic-type zip (ignoring edge cases)
function zip(arrays) {
    return arrays[0].map(function(_,i){
        return arrays.map(function(array){return array[i]})
    });
}



//Escape a user specified string for use in regex search.
// Taken from http://stackoverflow.com/a/3561711
RegExp.escape= function(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};

//Takes an Array of strings and returns a regex which can be used for finding items in the set given in the list
//with the longest possible match returned. e.g.
// RegExp.fromList(["hello","world","hello world"]).exec("this hello world life") will match on "hello world".
RegExp.fromList = function(a){
	return a.length ? RegExp(a.sort(function(a,b){return b.length-a.length;}).map(RegExp.escape).join("|")) : null;
}


Math.hypot = Math.hypot || function(a,b){return Math.sqrt(a*a+b*b);};