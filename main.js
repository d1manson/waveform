"use strict";

var T = {};
T.header = {};
T.Tool = {};
T.buffer = 0;
T.chanIsOn = [1,1,1,1];
T.paletteMode = 0;
T.actions = [{num: 0}];


T.BYTES_PER_SPIKE = 4*(4 + 50);
T.BYTES_PER_POS_SAMPLE = 4 + 2 + 2 + 2 + 2 + 2 + 2 + (2 + 2);//the last two uint16s are numpix1 and bnumpix2 repeated
T.POS_NAN = 1023;

T.X_SCALE = 2; 
T.Y_SCALE = 0.5;
T.Y_SCALE_BASE = 4; //used as a factor to scale the user-input y-size to get a number of pixels per voltage unit (with units being in the range 0-255).  4 makes y and x scales look similar
T.X_SCALE_BASE = 4; //number of canvas pixels between samples in time dimension
T.BASE_CANVAS_WIDTH = 4*49;
T.BASE_CANVAS_HEIGHT = 256;


T.POS_PLOT_WIDTH = 200;
T.POS_PLOT_HEIGHT = 200;





T.PlotPos = function(){
	var ctx = T.$posplot.get(0).getContext('2d');
	ctx.clearRect(0 , 0 , T.POS_PLOT_WIDTH, T.POS_PLOT_HEIGHT);

	var data = new Int16Array(T.posBuffer);
	var elementsPerPosSample = T.BYTES_PER_POS_SAMPLE/2;
	var end = parseInt(T.posHeader.num_pos_samples) * elementsPerPosSample; 
	var xs = T.POS_PLOT_WIDTH/(parseInt(T.posHeader.window_max_x)-parseInt(T.posHeader.window_min_x));
	var ys = T.POS_PLOT_HEIGHT/(parseInt(T.posHeader.window_max_y)-parseInt(T.posHeader.window_min_y));
	var s = xs<ys? xs: ys;//min of the two
	ctx.beginPath();
	ctx.strokeStyle = "RGB(0,0,0)";
	var i = 2;
	ctx.moveTo(data[i]*s,data[i+1]*s);
	for(;i<end;i+=elementsPerPosSample)if(data[i] != T.POS_NAN && data[i+1] != T.POS_NAN && data[i] && data[i+1])
		ctx.lineTo(data[i]*s,data[i+1]*s);
	ctx.stroke();
}


T.BuildCutIndices = function(cut){
	T.cutInds = [[]];
	for(var i=0;i<cut.length;i++)
		if(T.cutInds[cut[i]] == undefined)
			T.cutInds[cut[i]] = [i];//new subarray
		else
			T.cutInds[cut[i]].push(i);//append to existing subarray
    
    //TODO: not sure if this is a good way of doing it
	if(T.FS.GetPendingReadCount() == 0 && T.PAR.GetPendingParseCount() == 0) 
		T.WV.SetGroupData(T.cutInds);
}

T.RemoveTile = function(ind){
	if(ind == undefined){
		T.$tilewall.html("");
        T.$tile_.splice(0,T.$tile_.length); //remove all without creating a new array instance	
	}else{
        T.$tile_[ind].remove();
        T.$tile_[ind] = null;
	}
}

T.AddTile = function(ind,iW,iH,oW,oH){
	//calling function can help us out here if it already knows what these values are, otherwise we get them ourselves
	iW = iW || T.WV.CanvasInnerWidth(); 
	iH = iH || T.WV.CanvasInnerHeight();
	oW = oW || T.CanvasOuterWidth();
	oH = oH || T.CanvasOuterHeight();

	var $t = $("<div class='tile' id='tile_" + ind + "'>" +
				"<canvas width='" + iW + "' height='" + iH + "' style='width:" + oW + "px;height:" + oH + "px;'></canvas>" + 
				"<canvas width='0' height='0' style='width:0px;height:0px;'></canvas>" +
				"<div class='tile-over'><div class='tile-caption'></div></div></div>");
	$t.mousedown(T.TileMouseDown);
	$t.data("group_num",ind);
	$t.canvas = $t.find('canvas');
	$t.ctx = $t.canvas.get(0).getContext('2d'); //this is for drawing waveforms
	$t.ctx2 = $t.canvas.get(1).getContext('2d'); //this is for drawing ratemaps etc.
    $t.caption = $t.find('.tile-caption');

	var prev = -1;
	//append the new tile after the previous tile
	if(ind<T.$tile_.length)for(prev=ind-1;prev>=0;prev--)if(T.$tile_[prev]) 
		break;
	if(prev >=0)
		T.$tile_[prev].after($t);
	else
		T.$tilewall.append($t);
    T.$tile_[ind] = $t;
	return $t;
}

T.FinishedLoadingFile = function(){
    if(T.FS.GetPendingReadCount() == 0 && T.PAR.GetPendingParseCount() == 0){
        T.RemoveTile();//Clear all...TODO: clear cutInds, buffers and T.WV 
        T.DispHeaders();
		if(T.cutInds){
			var iW = T.WV.CanvasInnerWidth(); 
			var iH = T.WV.CanvasInnerHeight();
			var oW = T.CanvasOuterWidth();
			var oH = T.CanvasOuterHeight();
			T.WV.Setup(parseInt(T.N),T.buffer);
			T.ApplyChannelChoice(T.chanIsOn);
			for(var i=0;i<T.cutInds.length;i++)if(T.cutInds[i] && T.cutInds[i] !== undefined && T.cutInds[i].length)
				T.AddTile(i,iW,iH,oW,oH);
			T.WV.SetPaletteMode(T.paletteMode);
			T.WV.SetGroupData(T.cutInds);
			T.WV.Render();
		}
		if(T.posBuffer)
			T.PlotPos();
    }
}


T.DispHeaders = function(){
	var headerlist = [T.header,T.cutProps,T.posHeader];
    var tet = T.ORG.GetTet();
	var headernames = ['.' + tet +' file (spike data)','_' + tet + '.cut file','.pos file'];

    var $h = $("<div id='header_info' class='header_info'>");
    T.$info_panel.html($h);

	var outerstrbuilder = [];
	for(var i=0,hdr=headerlist[0];i<headerlist.length;hdr=headerlist[++i])if(hdr){
		var strbuilder = [];
		var hdr = headerlist[i];
		for(var k in hdr)if(hdr.hasOwnProperty(k))
			strbuilder.push("<td class='header_field_name'>" + k + "</td><td class='header_field_value'>" + hdr[k] + '</td>');
		outerstrbuilder.push(headernames[i] + "<table><tbody><tr>" + strbuilder.join("</tr><tr>") + "</tr></tbody></table>");
	}

    $h.html("<B>File info and headers</B><br>" + outerstrbuilder.join("<BR><BR>"));
}


T.CanvasOuterWidth = function(){
	T.WV.CanvasInnerWidth() * T.X_SCALE;
}

T.CanvasOuterHeight = function(){
	return T.Y_SCALE*256;
}

T.ApplyChannelChoice = function(setChans){
	//This is a bit inefficent because we only need to resize the canvas and its css 
	//when we change the number of channels being displayed, but it doesn't matter much.
	for(var i=0;i<4;i++)
			T.$chanButton_.eq(i).prop('checked',setChans[i])
	T.chanIsOn = setChans;
	T.WV.ShowChannels(setChans);
	T.ApplyCanvasSizes();
	//Note we don't render here, that's up to the calling function
}

T.ChannelButtonClick = function(evt){
	var oldChans = T.chanIsOn;
	var thisVal =  parseInt($(this).val())-1;
	var setChans;

	if(evt.ctrlKey){
		//if ctrl key is down then toggle this channel, but make sure that there is at least one channel on
		setChans = oldChans;
		setChans[thisVal] = !setChans[thisVal];
		if(setChans[0] + setChans[1] + setChans[2] + setChans[3] == 0)
			setChans[thisVal] = 1;
	}else{
		//turn it on and everything else off
		setChans = [0,0,0,0];
		setChans[thisVal] = 1;
	}
	T.ApplyChannelChoice(setChans);
	T.WV.Render();
}


T.ApplySizeClick = function(){
	var new_x_scale = Math.floor(T.$xsize_input.val()); 
	new_x_scale = new_x_scale < 1? 1 : new_x_scale;
	new_x_scale = new_x_scale > 8? 8 : new_x_scale;
	T.$xsize_input.val(new_x_scale);
	T.X_SCALE = new_x_scale;

	var new_y_scale = Math.round(T.$ysize_input.val())/T.Y_SCALE_BASE;

	new_y_scale = new_y_scale < 0.25? 0.25 : new_y_scale;
	new_y_scale = new_y_scale > 2? 2 : new_y_scale;
	T.$ysize_input.val(new_y_scale*T.Y_SCALE_BASE); 
	T.Y_SCALE = new_y_scale;

	T.ApplyCanvasSizes();
}

T.ApplyCanvasSizes = function(){
	var w = T.CanvasOuterWidth();
	var h = T.CanvasOuterHeight();
	var i = T.$tile_.length;
	while(i--)if(T.$tile_[i])
		T.$tile_[i].canvas.css({width: w + 'px',height: h + 'px'});
}




T.StoreData = function(){
	localStorage.chanIsOn = JSON.stringify(T.chanIsOn);
	localStorage.tet = T.ORG.GetTet();
	localStorage.X_SCALE = T.X_SCALE;
	localStorage.Y_SCALE = T.Y_SCALE;
	localStorage.cutInds = T.cutInds ? JSON.stringify(T.cutInds) : "[]";
	localStorage.FSactive = T.FS.IsActive();
	localStorage.state = 1;
}



T.DocumentReady = function(){

    T.$filesystem_load_button.click(T.ORG.RecoverFilesFromStorage);
    
    
	if(localStorage.state){
		T.ORG.SwitchToTet(localStorage.tet,null);
		T.X_SCALE = localStorage.X_SCALE;
		T.Y_SCALE = localStorage.Y_SCALE;
		T.$xsize_input.val(T.X_SCALE);
		T.$ysize_input.val(T.Y_SCALE*T.Y_SCALE_BASE);
		T.cutInds = JSON.parse(localStorage.cutInds);
		if(T.cutInds.length>0)
			T.AddAction({description: "load cut from localStorage"});
		T.ApplyChannelChoice(JSON.parse(localStorage.chanIsOn));
		if(parseInt(localStorage.FSactive) || localStorage.FSactive=="true") 
			T.ToggleFS();//it starts life in the off state, so this turns it on 

	}else{
		T.ApplyChannelChoice([1,1,1,1]);
	}
}

T.ResetAndRefresh = function(){
if (!confirm("Do you really want to clear all data and settings and reload the page?"))
  return;
	window.onbeforeunload = "";
	localStorage.clear();
	location.reload();
	//todo: I don't know if you can clear the filesystem here because it is async and we want to reload the page.
}

T.ShowHelp = function(){
	T.$help_background.css({display: 'block'});
	T.$help_panel_wrapper.css({display: 'block'});
}

T.HideHelp = function(){
	T.$help_background.css({display: 'none'});
	T.$help_panel_wrapper.css({display: 'none'});
}

T.FinishedLoadingTet = function(header,buffer){
    T.header = header;
    T.buffer = buffer;
    T.N = header.num_spikes;
    T.FinishedLoadingFile();
}

T.FinishedLoadingPos = function(header,buffer){
    T.posHeader = header;
    T.posBuffer = buffer;
    T.FinishedLoadingFile();
}

T.FinishedLoadingCut = function(cut,props){
    T.cutProps = props;
    T.BuildCutIndices(cut);
    T.ClearActions();
	T.AddAction({description: "load cut from file"});
	T.FinishedLoadingFile();
}


T.TogglePalette = function(){
	T.paletteMode = T.paletteMode  ? 0: 1;
	T.WV.SetPaletteMode(T.paletteMode);
	T.WV.Render();
}

T.RunAutocut = function(){
	var chan = -1;
	for(var i=0;i<4;i++)
		if(T.chanIsOn[i])
			if(chan == -1)
				chan = i;
			else{
				alert("Currently you can only autocut on a single channel. Using channel " + (chan+1) + ".");
				break;
			}
	T.ClearActions();
	T.AC.DoAutoCut(chan+1,parseInt(T.N),T.buffer,T.AutocutFinished);
}

T.AutocutFinished = function(cut,chan){
    T.cutInds = cut;
    T.RemoveTile(); //clears all
	for(var i=0;i<T.cutInds.length;i++)if(T.cutInds[i] && T.cutInds[i] !== undefined && T.cutInds[i].length)
		T.AddTile(i);
	T.ApplyCanvasSizes();
	if(!T.WV.IsReady()) 
		T.WV.Setup(parseInt(T.N),T.buffer);
	T.WV.SetGroupData(T.cutInds);
	T.WV.Render();
	T.AddAction({description: 'autocut subsample on channel-' + chan})
}

T.ToggleFS = function(newState){
	if(T.FS.IsActive()){
		//deactivate
		T.$FSbutton.text("turn on FileAPIs");
		T.FS.Toggle(false,T.ShowFileSystemLoaded);
	}else{
		//activate
		T.$FSbutton.text("turn off FileAPIs");
		T.FS.Toggle(true,T.ShowFileSystemLoaded);
	}
}

//For a jQuery element or an array of jQuery elements it removes an existing "state" attribute or adds "state=closed"
T.ToggleElementState = function(el){
	return function(){
		el = [].concat(el); //force it to be an array
		for(var i=0;i<el.length;i++)if(el[i])
			if(el[i].attr("state"))
				el[i].removeAttr("state"); 
			else 
				el[i].attr("state","closed");
	}
}

T.AddAction = function(action){
	action.num = T.actions[T.actions.length-1].num + 1;
	if(action.num == 1)
		T.$undo.show();

	action.$div = $("<div class='action' data-action-num='" + action.num + "'><b>" + action.num + "</b>&nbsp;&nbsp;&nbsp;" + action.description + "</div>");
	T.actions.push(action);

	//insert after the undo button
	T.$undo.after(action.$div);
}

T.UndoLastAction = function(){
	var action = T.actions.pop();
	var undone = false;
	if(action.type=="merge"){
		T.Tool.UndoMerge(action);
		undone = true;
	}else if(action.type=="reorder"){
		T.UndoReorderCut(action);
		undone = true;
	}

	if(undone){
		action.$div.remove();
		if(T.actions.length == 1)
			T.$undo.hide();
	}else{
		T.actions.push(action);//put it back
		alert("Sorry, no undo.");
	}
}

T.ClearActions = function(){
	//clear all but the zeroth action
	while(T.actions.length>1)
		T.actions.pop().$div.remove();
	T.$undo.hide();
}

T.ReorderCut = function(){

	//get the sorting order for the cutInds
	var groups = [];
	for(var i=0;i<T.cutInds.length;i++)
		groups.push({ind: i,
					 len: T.cutInds[i] ? T.cutInds[i].length : 0});
	groups.sort(function(a,b){return b.len-a.len;});
	//sorting order is in groups[].ind

	var action = {inverseOrder: [],description: "reorder",type:"reorder"};
	var oldCutInds = T.cutInds;
	T.cutInds = [];
	for(var i=0;i<groups.length;i++){
		action.inverseOrder.push(groups[i].ind);
		T.cutInds.push(oldCutInds[groups[i].ind] || []);
	}
	T.AddAction(action);
	T.RemoveTile(); //easiest thing is remove all and start again
	T.WV.SetGroupData(T.cutInds);
	for(var i=0;i<T.cutInds.length;i++)if(T.cutInds[i] && T.cutInds[i] !== undefined && T.cutInds[i].length)
		T.AddTile(i);
	T.WV.Render();
}

T.UndoReorderCut = function(action){
	var oldCutInds = T.cutInds;
	T.cutInds = [];
	for(var i=0;i<action.inverseOrder.length;i++){
		T.cutInds[action.inverseOrder[i]] = oldCutInds[i];
	}
	T.RemoveTile(); //easiest thing is remove all and start again
	T.WV.SetGroupData(T.cutInds);
	for(var i=0;i<T.cutInds.length;i++)if(T.cutInds[i] && T.cutInds[i] !== undefined && T.cutInds[i].length)
		T.AddTile(i);
	T.WV.Render();
}

T.ShowFileSystemLoaded = function(file_names){
	if(!file_names || file_names.length == 0){
		$('#filestem_caption').html("No files available.");
		T.$filesystem_load_button.hide();
	}else{
		$('#filestem_caption').html("Found " + file_names.length + " existing files.<BR>" + file_names.join("<BR>")); //TODO: using html here with filenames is potentially a bug
		T.$filesystem_load_button.show();
	}
}

T.$help_background = $('.help_background');
T.$help_panel_wrapper = $('.help_panel_wrapper');
$('.help_button').each(function(){$(this).click(T.ShowHelp);});
$('#apply_size').click(T.ApplySizeClick);
T.close_help_button = $('.close_help_button').click(T.HideHelp);
T.$xsize_input = $('#xsize_input');
T.$ysize_input = $('#ysize_input');
T.$tilewall = $('.tilewall');
T.$posplot = $('#posplot');
T.$action_panel = $('#action_panel');
T.$tile_ = [];
T.$drop_zone = $('.file_drop');				 			 
T.$info_panel = $('#info_panel');
$('#reorder').click(T.ReorderCut);
T.$undo = $('.undo').click(T.UndoLastAction);
$('.bar').click(T.ToggleElementState([$('.bar'),$('.side_panel'),T.$tilewall]));
T.$FSbutton = $('#filesystem_button').click(T.ToggleFS);
$('#spatial_panel_toggle').click(T.ToggleElementState($('#spatial_panel')));
$('#action_panel_toggle').click(T.ToggleElementState(T.$action_panel));
$('#button_panel_toggle').click(T.ToggleElementState($('#button_panel')));
T.$files_panel = $('#files_panel');
$('#files_panel_toggle').click(T.ToggleElementState(T.$files_panel));
$('#reset_button').click(T.ResetAndRefresh);
T.$chanButton_ = $("input[name=channel]:checkbox").click(T.ChannelButtonClick);
$('#toggle_palette').click(T.TogglePalette);
$('#autocut').click(T.RunAutocut);
T.$filesystem_load_button = $('#filesystem_load_button');


if(!(window.requestFileSystem || window.webkitRequestFileSystem))
	$('#filesystem_button').hide();

$(document).bind("contextmenu",function(e){return false;})
		    .ready(T.DocumentReady);
window.onbeforeunload = T.StoreData;
