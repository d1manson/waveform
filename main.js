"use strict";

var T = {};
T.Tool = {};
T.chanIsOn = [1,1,1,1];
T.mapIsOn = [0];
T.paletteMode = 0;
T.binSizeCm = 2.5;

T.BYTES_PER_SPIKE = 4*(4 + 50);
T.BYTES_PER_POS_SAMPLE = 4 + 2 + 2 + 2 + 2 + 2 + 2 + (2 + 2);//the last two uint16s are numpix1 and bnumpix2 repeated
T.POS_NAN = 1023;

T.BASE_CANVAS_WIDTH = 4*49;
T.BASE_CANVAS_HEIGHT = 256;
T.POS_PLOT_WIDTH = 200;
T.POS_PLOT_HEIGHT = 200;
T.MAPS_START = 101-1;
T.xFactor = 2;
T.yFactor = 2;

T.$newTile = $("<div class='tile'>" +
			"<canvas width='0' height='0' style='width:0px;height:0px;'></canvas>" + 
			"<canvas width='0' height='0' style='width:0px;height:0px;'></canvas>" +
			"<div class='tile-over'><div class='tile-caption'></div></div>" + 
			"<div class='blind'></div>" + 
			"</div>");		//this gets cloned and appended to $tilewall


T.PlotPos = function(){
	var buffer = T.ORG.GetPosBuffer();

	var ctx = T.$posplot.get(0).getContext('2d');
	ctx.clearRect(0 , 0 , T.POS_PLOT_WIDTH, T.POS_PLOT_HEIGHT);

	if(buffer == null) return;

	var data = new Int16Array(buffer);
	var header = T.ORG.GetPosHeader();
	var elementsPerPosSample = T.BYTES_PER_POS_SAMPLE/2;
	var end = parseInt(header.num_pos_samples) * elementsPerPosSample; 
	var xs = T.POS_PLOT_WIDTH/(parseInt(header.window_max_x)-parseInt(header.window_min_x));
	var ys = T.POS_PLOT_HEIGHT/(parseInt(header.window_max_y)-parseInt(header.window_min_y));
	var s = xs<ys? xs: ys;//min of the two
	ctx.beginPath();
	ctx.strokeStyle = "RGB(0,0,0)";
	var i = 2;
	ctx.moveTo(data[i]*s,data[i+1]*s);
	for(;i<end;i+=elementsPerPosSample)if(data[i] != T.POS_NAN && data[i+1] != T.POS_NAN && data[i] && data[i+1])
		ctx.lineTo(data[i]*s,data[i+1]*s);
	ctx.stroke();
}


T.FinishedLoadingFile = function(status,filetype){
	//status is an object with a field for each of the file types ["pos","set","tet","cut"] the values have the following meanings:
	//	0 - file does not exist
	//	1 - file exists but has not been delivered here yet
	//  2 - this is the file currently being delievered - see the data object
	//  3 - file has already been delivered
	//  Note that in each round of loading files there will be an initial call with a null filetype, indicating what ui data needs to be flushed.
	// filetype just tells us which item in status is 2, or is null if none of them are.

	console.log("FinishedLoadingFile(" + JSON.stringify(status) + ", " + filetype + ")");

	T.DispHeaders(status,filetype); //if null, then it displays all (which could still be something if T.PAR.Get*Header isn't null)

	if(filetype == null && status.tet != 3)
		T.WV.LoadTetrodeData(null);	

	if(filetype == null && status.cut < 3){
		T.ClearAllTiles();
		T.CutActionCallback(null,{num:0,type:"load",description:"no active cut"});
	}

	if(filetype == "tet"){
		T.WV.LoadTetrodeData(T.ORG.GetN(),T.ORG.GetTetBuffer());
		if(status.cut == 3) //if we happened to have loaded the cut before the tet, we need to force T.WV to accept it now
			T.ORG.GetCut().ForceChangeCallback(T.WV.SlotsInvalidated);
	}

	if(filetype == null && (status.pos != 3 || status.tet != 3)){
		T.PlotPos();
		T.RM.ClearAll();
	}
	if(filetype == "pos")
		T.PlotPos();

	if(status.pos >=2 && status.tet >= 2 && status.set >=2)
		T.SetupRatemaps();

	//note that cut is mainly dealt with separetly by the callbacks registered with the T.CUT module
}


T.DispHeaders = function(status,filetype){
	//TODO: if filetype is null then display all, otherwise only display the one given by the filetype string ["tet","set", etc.]
	var headerTypeList = ["tet","cut","pos","set"];
	var headerlist = [T.ORG.GetTetHeader(),T.ORG.GetCutHeader(),T.ORG.GetPosHeader(),T.ORG.GetSetHeader()];
    var tet = T.ORG.GetTet();
	var headernames = ['.' + tet +' file (spike data)','_' + tet + '.cut file','.pos file','.set file'];

	for(var i=0,hdr=headerlist[0];i<headerlist.length;hdr=headerlist[++i])
		if(hdr && filetype==headerTypeList[i]){
			var strbuilder = [];
			var hdr = headerlist[i];
			for(var k in hdr)if(hdr.hasOwnProperty(k))
				strbuilder.push("<td class='header_field_name'>" + k + "</td><td class='header_field_value'>" + hdr[k] + '</td>');
			T.$file_info[i].html(headernames[i] + "<table><tbody><tr>" + strbuilder.join("</tr><tr>") + "</tr></tbody></table>")
			T.$file_info[i].show();
		}else if(status[headerTypeList[i]]<2){
			T.$file_info[i].hide();
		}

	T.FilterHeader();
}



T.ApplyChannelChoice = function(setChans,setMaps){
	//This is a bit inefficent because we only need to resize the canvas and its css 
	//when we change the number of channels being displayed, but it doesn't matter much.

	setChans = setChans == undefined? T.chanIsOn : setChans;
	setMaps = setMaps == undefined? T.mapIsOn : setMaps;

	for(var i=0;i<T.$chanButton_.length;i++){
		if(i < setChans.length)
			T.$chanButton_.eq(i).prop('checked',setChans[i])
		else if(i-setChans.length < setMaps.length)
			T.$chanButton_.eq(i).prop('checked',setMaps[i-setChans.length]);
	}	
	T.chanIsOn = setChans;
	T.mapIsOn = setMaps;
	T.WV.ShowChannels(setChans);
	
	T.RM.ShowMaps(setMaps); 	//Note we don't render here, that's up to the calling function
}

T.ChannelButtonClick = function(evt){
	//TODO: change "Channel" in button names to reflect the fact it now includes maps
	//Also need to convert buttons to be actuall buttons rather than radio inputs becaues firefox doesn't permit clicking radio buttons with ctrl or alt or shift pressed (I think)

	var oldChans = T.chanIsOn;
	var oldMaps = T.mapIsOn;

	var thisVal =  parseInt($(this).val())-1;
	var setChans; var setMaps;


	if(evt.ctrlKey){
		//if ctrl key is down then toggle this item, but make sure that there is at least one itme on
		setChans = oldChans;
		setMaps = oldMaps;
		if(thisVal >= T.MAPS_START)
			setMaps[thisVal-T.MAPS_START] = +!setMaps[thisVal-T.MAPS_START];
		else
			setChans[thisVal] = +!setChans[thisVal];

		if(M.sum(setChans) + M.sum(setMaps) == 0){
			if(thisVal >= T.MAPS_START)
				setMaps[thisVal-T.MAPS_START] = 1;
			else
				setChans[thisVal] = 1;
		}

	}else{
		//turn it on and everything else off
		setChans = [0,0,0,0];
		setMaps = [0];
		if(thisVal >= T.MAPS_START)
			setMaps[thisVal-T.MAPS_START] = 1;
		else
			setChans[thisVal] = 1;
	}
	T.ApplyChannelChoice(setChans,setMaps);
}


T.ApplySizeClick = function(){
	var new_scale = Math.floor(T.$size_input.val()); 
	new_scale = isNaN(new_scale)? 2 : new_scale;
	new_scale = new_scale < 1? 1 : new_scale;
	new_scale = new_scale > 8? 8 : new_scale;
	T.$size_input.val(new_scale);
	T.xFactor = new_scale;
	T.yFactor = new_scale;

	T.ApplyCanvasSizes();
}

T.ApplyRmSizeClick = function(){
	var new_scale = Math.floor(T.$rm_bin_size.val()*10)/10; //round to 1 d.p.
	new_scale = isNaN(new_scale)? 2.5 : new_scale;
	new_scale = new_scale < 0.5? 0.5 : new_scale;
	new_scale = new_scale > 20? 20 : new_scale;
	T.$rm_bin_size.val(new_scale);
	T.binSizeCm = new_scale;

	//TODO: this is a bit clumsy, isn't there a better way?
	T.RM.ClearAll();
	T.SetupRatemaps();
	T.ORG.GetCut().ForceChangeCallback(T.RM.SetGroupData);
}

T.SetupRatemaps = function(){
	var posHeader = T.ORG.GetPosHeader();

	T.RM.Setup(T.ORG.GetTetBuffer(),T.ORG.GetPosBuffer(),T.ORG.GetN(),parseInt(posHeader.num_pos_samples),
		parseInt(T.ORG.GetTetHeader().timebase),parseInt(posHeader.sample_rate),parseInt(posHeader.pixels_per_metre),T.binSizeCm);
}

T.ApplyCanvasSizes = function(){
	
	var i = T.tiles.length;
	while(i--)if(T.tiles[i]){
		var $c = T.tiles[i].$.find('canvas').eq(0);
		$c.css({width: $c.get(0).width * T.xFactor + 'px',height: $c.get(0).height * T.yFactor + 'px'});
	}
}


T.StoreData = function(){
	localStorage.chanIsOn = JSON.stringify(T.chanIsOn);
	localStorage.tet = T.ORG.GetTet();
	localStorage.xFactor = T.xFactor;
	localStorage.yFactor = T.yFactor;
	
	//TODO store cuts
	localStorage.FSactive = T.FS.IsActive();
	localStorage.BIN_SIZE_CM = T.binSizeCm;
	localStorage.state = 1;

}



//for each cut slot, these two arrays track the updates applied during calls to SetGroupDataTiles
T.cutSlotToTileMapping = [];
//T.cutSlotGeneration = [];  //we don't care about generation here because whenever the group or immutable changes we have to update the caption regardless

T.CutSlotCanvasUpdate = function(slotInd,canvasNum,$canvas){
	//this callback recieves the newly rendered canvases from the waveform rendering and ratemap rendering modules
	//these rendering modules recieve slot-invalidation events directly from the cut module and can choose to ignore them or
	//spend any length of time rendering a new canvas.  They must hwoever guarantee to call this function in chronological order for
	//the invalidation events on each slot. When a group number changes for a given slot the canvas will follow the group, so that if it 
	//doesn't need to be re-rendered it will be in the right place.  Also, if rendering paramaters are changed the rendering modules may need
	//to issue updated canvases without any slot-invalidation events being received by SetGroupDataTiles.
	//slotInd matches the cut immutables slot thing, canvasNum is 0 for waveforms and 1 for ratemaps.

	var t = T.tiles[T.cutSlotToTileMapping[slotInd]];
	if(!t)
		return;
		
	if($canvas)	
		$canvas.css({width: $canvas.get(0).width * T.xFactor + 'px',height: $canvas.get(0).height * T.yFactor + 'px'}); //apply css scaling
	else
		$canvas = $("<canvas width='0' height='0' style='width:0px;height:0px;'></canvas>"); //create a zero-size canvas if we weren't given anything
	
	t.$.find('canvas').eq(canvasNum).replaceWith($canvas); 
	
}

T.CreateTile = function(i){
	var $ = T.$newTile.clone();
	
	$.data("group_num",i);
    $.hide();	
	return {$: $,
			caption: $.find('.tile-caption')
			}

}

T.SetGroupDataTiles = function(cut,invalidatedSlots,isNew){
	//controls the adding, removing, rearanging, and caption-setting for tiles. (Unfortunately the logic is a bit complicated)

	var nGroups = cut.GetProps().G; 

	while(T.tiles.length < nGroups){ //if there are too few tiles, add more
		var t = T.CreateTile(T.tiles.length-1);
		T.$tilewall.append(t.$);
		T.tiles.push(t);
	}

	var displaced_tiles = []; //if we move tiles around during the loop (see the nested "if" statement inside the loop), 
								//we store the displaced tiles in this array so that they can be used by subsequent iterations if needed

	for(var k=0;k<invalidatedSlots.length;k++)if(invalidatedSlots[k]){ //for every invalidated slot....
		var slot_k = cut.GetImmutableSlot(k);
		var old_tile_ind = T.cutSlotToTileMapping[k];

		if(slot_k.inds == null  ||slot_k.inds.length==0 ){
			// immutable has been cleared, it may or may not have been previosuly associated to a tile
				if(isNum(old_tile_ind)){
					//hide the tile if one was associated to the slot
					T.tiles[old_tile_ind].$.hide(); 
					T.cutSlotToTileMapping[k] = null;
				}

		}else{
			var new_tile_ind = slot_k.group_history.slice(-1)[0];

			if(isNum(old_tile_ind) && old_tile_ind != new_tile_ind){
				// We already had a tile for this slot, now there is either a new immutable for the slot or the group on the existing immutable has changed.
				// In both cases we need to move the tile
				
				// there are 3 tiles involved here:
				displaced_tiles[new_tile_ind] = T.tiles[new_tile_ind]; //store the tile which is about to be displaced (in case we need it in a future iteration of the k-loop)
				var movingTile = displaced_tiles[old_tile_ind] || T.tiles[old_tile_ind]; //get the tile which we want to move
				T.tiles[old_tile_ind] = T.CreateTile(old_tile_ind); // create and then insert a new tile to fill in the gap we are creating
				movingTile.$.before(T.tiles[old_tile_ind].$); 
				T.tiles[new_tile_ind].$.replaceWith(movingTile.$); // make the move 
				T.tiles[new_tile_ind] = movingTile; 
				

			} //else: an immutable has been put in a slot, where previously there wasn't one (don't need to do anything special)

			T.tiles[new_tile_ind].$.show()
								  .data("group_num",new_tile_ind)
			T.tiles[new_tile_ind].caption.text("group " + new_tile_ind + " | " + slot_k.inds.length + " waves ");
			
			T.cutSlotToTileMapping[k] = new_tile_ind;
		}
	}

	while(T.tiles.length > nGroups) // if there are too many tiles, delete some
		T.tiles.pop().$.remove();

}

T.ClearAllTiles = function(){
	while(T.tiles.length)
		T.tiles.pop().$.remove();
	T.cutSlotToTileMapping = [];
}


T.DocumentReady = function(){

    T.$filesystem_load_button.click(T.ORG.RecoverFilesFromStorage);
	T.CUT.AddChangeCallback(T.SetGroupDataTiles);
	T.CUT.AddChangeCallback(T.WV.SlotsInvalidated);
	T.CUT.AddChangeCallback(T.RM.SetGroupData);
	T.CUT.AddActionCallback(T.CutActionCallback);

	if(localStorage.state){
		T.ORG.SwitchToTet(localStorage.tet || 1);
		T.xFactor = localStorage.xFactor || 2;
		T.yFactor = localStorage.yFactor;
		T.binSizeCm = localStorage.BIN_SIZE_CM || 2.5;
		T.$rm_bin_size.val(T.binSizeCm);
		T.$size_input.val(T.xFactor);

		//TODO: load files into T.cut instances

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
	window.open("https://github.com/d1manson/waveform/wiki","_blank");
}

T.TogglePalette = function(){
	T.paletteMode = T.paletteMode  ? 0: 1;
	T.WV.SetPaletteMode(T.paletteMode*2 - 1);
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
	if(chan == -1){
		alert("Currently you can only autocut on a single channel. Using channel 1.");
		chan = 1;
	}
	T.AC.DoAutoCut(chan+1,T.ORG.GetN(),T.ORG.GetTetBuffer(),T.AutocutFinished);
}

T.AutocutFinished = function(cut,chan){
	T.ORG.SwitchToCut(3,cut);// TODO: send {description: 'autocut subsample on channel-' + chan};
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



T.CutActionCallback = function(cut,info){
	if(info.type == "undo"){
		var $oldAction = T.$action_.pop();
		$oldAction.remove();
		return;
	}
	if (info.type == "empty-actions" || info.type == "no-undo"){
		alert(info.description);
		return
	}

	if (info.type == "load"){
		//remove any existing action elements and then go on to add the new one
		T.$action_ = T.$action_ || [];
		while(T.$action_.length)
			T.$action_.pop().remove(); //remove all action elements from page	
		T.$undo.show();
	}

	var $newAction = $("<div class='action' data-action-num='" + info.num + "'><b>" + info.num + "</b>&nbsp;&nbsp;&nbsp;" + info.description + "</div>");
	T.$action_.push($newAction); //store it in the array
	T.$undo.after($newAction);
}


T.ReorderNCut = function(){
	//reorder the cut based on number of spikes per group

	var groups = []; //we build an array of (ind,len) pairs that we can then sort by <len>.

	var cut = T.ORG.GetCut();
	var G = cut.GetProps().G;
	for(var i=0;i<G;i++)
		groups.push({ind: i,
					 len: cut.GetGroup(i).length});
	groups.sort(function(a,b){return b.len-a.len;});

	//sorting order is in groups[].ind, now pull the inds out into their own array...
	var inds = [];
	while(groups.length)
		inds.push(groups.shift().ind);

	cut.ReorderAll(inds);
}

T.ReorderACut = function(){
	var chan = -1;
	for(var i=0;i<4;i++)
		if(T.chanIsOn[i])
			if(chan == -1)
				chan = i;
			else{
				alert("Currently you can only reorder-on-amplitude using a single channel, taking channel" + (chan+1) + ".");
				break;
			}
	if(chan == -1){
		alert("Currently you can only reorder-on-amplitude using a single channel, taking channel 1.");
		chan = 1;
	}

	var N = T.ORG.GetN();
	var amps = new Uint8Array(N);	//TODO: cache amplitdues while tetrode is loaded (for all channels)
	var buffer = new Int8Array(T.ORG.GetTetBuffer());
	for (var i=0;i<N;i++){
		var b = buffer.subarray(T.BYTES_PER_SPIKE*i + chan*(50+4) + 4,T.BYTES_PER_SPIKE*i + (chan+1)*54-1);
		amps[i] = M.max(b) - M.min(b);
	}

	var mean_amps = M.accumarray(T.ORG.GetCut().GetAsVector(),amps,"mean");

	//TODO: I think there will be a bug if there are any empty groups beyond the end of the last occupied group, need to do an identity transformation for the end or something

	var groups = []; //we build an array of (ind,amp) pairs that we can then sort by <amp>.
	for(var i=0;i<mean_amps.length;i++)
		groups.push({ind: i,
					 amp: isNaN(i)? 256 : mean_amps[i]});
	groups.sort(function(a,b){return b.amp-a.amp;});

	//sorting order is in groups[].ind, now pull the inds out into their own array...
	var inds = [];
	while(groups.length)
		inds.push(groups.shift().ind);
	T.ORG.GetCut().ReorderAll(inds);
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

T.FilterHeader = function(){
	var str = T.$header_search.val().toLowerCase();
	T.$info_panel.find('tr').each(function(){
			if($(this).text().toLowerCase().search(str)==-1)
				$(this).hide();
			else
				$(this).show()
			})
}

T.UndoLastAction = function(){
	T.ORG.GetCut().Undo();
}

$('.help_button').each(function(){$(this).click(T.ShowHelp);});
$('#apply_size').click(T.ApplySizeClick);
T.$size_input = $('#size_input');
T.$tilewall = $('.tilewall');
T.$posplot = $('#posplot');
T.$action_panel = $('#action_panel');
T.tiles = [];
T.$drop_zone = $('.file_drop');				 			 
T.$info_panel = $('#info_panel');
$('#reorder_n_button').click(T.ReorderNCut);
$('#reorder_A_button').click(T.ReorderACut);
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
T.$rm_bin_size = $('#rm_bin_size');
$('#apply_rm_size').click(T.ApplyRmSizeClick);
T.$file_info = [$('#tet_info'),$('#cut_info'),$('#pos_info'),$('#set_info')];
T.$filesystem_load_button = $('#filesystem_load_button');
T.$header_search = $('#header_search');
T.$header_search.on(T.$header_search.get(0).onsearch === undefined ? "input" : "search",T.FilterHeader);

if(!(window.requestFileSystem || window.webkitRequestFileSystem))
	$('#filesystem_button').hide();

$(document).bind("contextmenu",function(e){return false;})
		    .ready(T.DocumentReady);
window.onbeforeunload = T.StoreData;
