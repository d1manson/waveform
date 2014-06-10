"use strict";

var T = T || {};
T.Tool = {};
T.chanIsOn = [1,1,1,1];
T.mapIsOn = [0];
T.tAutocorrIsOn = 0;
T.paletteMode = -1;
T.binSizeCm = 2.5;

T.BASE_CANVAS_WIDTH = 4*49;
T.BASE_CANVAS_HEIGHT = 256;
T.CANVAS_NUM_WAVE = 0;
T.CANVAS_NUM_RM = 1;
T.CANVAS_NUM_TC = 2;
T.POS_PLOT_WIDTH = 200;
T.POS_PLOT_HEIGHT = 200;
T.DISPLAY_ISON = {CHAN: [0,1,2,3], RM: [4], TC: 5}; //order in DOM

T.xFactor = 2;
T.yFactor = 2;
T.SPECIAL_SCALING = 0.5; //this scaling factor makes the size values presented to the user a bit nicer
T.SPECIAL_SCALING_RM = 2; //this makes ratemaps bigger
T.TILE_MIN_HEIGHT = 128; //TODO: look this up from css rather than state it here manually
T.floatingTopZ = 100;

T.$newTile = $("<div class='tile grabbable'>" +
			"<canvas width='0' height='0' style='width:0px;height:" + T.TILE_MIN_HEIGHT + "px;'></canvas>" + 
			"<canvas width='0' height='0' style='width:0px;height:" + T.TILE_MIN_HEIGHT + "px;'></canvas>" +
			"<canvas width='0' height='0' style='width:0px;height:" + T.TILE_MIN_HEIGHT + "px;'></canvas>" +
			"<div class='tile-sticker'></div>" + 
			"<div class='tile-over'>" +
				"<div class='tile-buttons'>" +
					"<button class='tile-button-swap'></button>" +
					"<button class='tile-button-dest'></button>" +
					"<button class='tile-button-src'></button>" +
					"<div class='tile-caption'></div>" + 
				"</div>" + 
			"</div>" +
			"<div class='blind'></div>" + 
			"</div>");		//this gets cloned and appended to $tilewall


T.PlotPos = function(){
	var buffer = T.ORG.GetPosBuffer();

	var ctx = T.$posplot.get(0).getContext('2d');
	ctx.clearRect(0 , 0 , T.POS_PLOT_WIDTH, T.POS_PLOT_HEIGHT);

	if(buffer == null) return;

	var data = new Int16Array(buffer);
	var header = T.ORG.GetPosHeader();
	var elementsPerPosSample = T.PAR.BYTES_PER_POS_SAMPLE/2;
	var end = parseInt(header.num_pos_samples) * elementsPerPosSample; 
	var xs = T.POS_PLOT_WIDTH/(parseInt(header.window_max_x)-parseInt(header.window_min_x));
	var ys = T.POS_PLOT_HEIGHT/(parseInt(header.window_max_y)-parseInt(header.window_min_y));
	var s = xs<ys? xs: ys;//min of the two
	ctx.beginPath();
	ctx.strokeStyle = "RGB(0,0,0)";
	var i = 2;
	ctx.moveTo(data[i]*s,data[i+1]*s);
	for(;i<end;i+=elementsPerPosSample)if(data[i] != T.PAR.POS_NAN && data[i+1] != T.PAR.POS_NAN && data[i] && data[i+1])
		ctx.lineTo(data[i]*s,data[i+1]*s);
	ctx.stroke();
}

T.SpikeForPathCallback = function($canv){
	T.$pos_overlay.replaceWith($canv);
	T.$pos_overlay = $canv;
}

T.FinishedLoadingFile = function(status,filetype){
	console.log("FinishedLoadingFile(" + JSON.stringify(status) + ", " + filetype + ")");
	if(T.ORG.GetExpName())
		T.$tilewall_text.hide();
		
	T.DispHeaders(status,filetype); //if null, then it displays all (which could still be something if T.PAR.Get*Header isn't null)

	if(filetype == null){	
		if(status.tet < 3){
			T.PlotPos();
		}
		if(status.cut < 3){
			T.ClearAllTiles();
			T.CutActionCallback({num:0,type:"load",description:"no active cut"});
		}
		if(status.pos < 3){
			T.PlotPos();
		}
	}

	if(filetype == "pos"){
		T.PlotPos();
	}

}


T.DispHeaders = function(status,filetype){
	if(T.$file_info_pane.attr("state") != "closed") //closed here confusingly means visible
		return;
	//TODO: move to separate module
	//TODO: if filetype is null then display all, otherwise only display the one given by the filetype string ["tet","set", etc.]
	console.time("DipsHeaders");
	var headerTypeList = ["tet","cut","pos","set"];
	var headerlist = [T.ORG.GetTetHeader(),T.ORG.GetCutHeader(),T.ORG.GetPosHeader(),T.ORG.GetSetHeader()];
    var tet = T.ORG.GetTet();
	var headernames = ['.' + tet +' file (spike data)','_' + tet + '.cut file','.pos file','.set file'];
	var filterStr = T.$header_search.val().toLowerCase();
	var filterOff = !filterStr;
	for(var i=0,hdr=headerlist[0];i<headerlist.length;hdr=headerlist[++i])
		if(hdr && (filetype==headerTypeList[i] || status[headerTypeList[i]]>=2)){
			var strbuilder = [];
			var hdr = headerlist[i];
			var keys = Object.keys(hdr);
			for(var kk=0,k=keys[kk],k_val=hdr[k];kk<keys.length;kk++,k=keys[kk],k_val=hdr[k])
				if(filterOff || ((""+k).toLowerCase().search(filterStr) != -1 || (""+hdr[k]).toLowerCase().search(filterStr) != -1))
					strbuilder.push("<td class='header_field_name'>" + k + "</td><td class='header_field_value'>" + hdr[k] + '</td>'); //TODO: WARNING keys and vals are not escaped ARGH!!
			
			T.$file_info[i].get(0).innerHTML = "<div>" + headernames[i] + "<table><tbody><tr>" + strbuilder.join("</tr><tr>") + "</tr></tbody></table></div>"; //faster than using jquery
			T.$file_info[i].show();
		}else if(status[headerTypeList[i]]<2){
			T.$file_info[i].hide();
		}
	console.timeEnd("DipsHeaders");
}



T.SetDisplayIsOn = function(v){ 

	//there are currently 6 buttons: the first 4 are channels, then 1 for ratemap and 1 for temporal autocorr
	//this function will 
	if('chanIsOn' in v){
		T.chanIsOn = v.chanIsOn; //array of 4
		for(var i=0;i<T.DISPLAY_ISON.CHAN.length;i++)
			T.chanIsOn[i] ?  T.$displayButtons.eq(T.DISPLAY_ISON.CHAN[i]).attr('checked',true) : T.$displayButtons.eq(T.DISPLAY_ISON.CHAN[i]).removeAttr('checked');
		T.WV.ShowChannels(T.chanIsOn);
	}

	if('mapIsOn' in v){
		T.mapIsOn = v.mapIsOn; //array of 1
		for(var i=0;i<T.DISPLAY_ISON.RM.length;i++)
			T.mapIsOn[i] ? T.$displayButtons.eq(T.DISPLAY_ISON.RM[i]).attr('checked',true) : T.$displayButtons.eq(T.DISPLAY_ISON.RM[i]).removeAttr('checked');
		T.RM.SetShow(T.mapIsOn);
	}

	if('tAutocorrIsOn' in v){
		T.tAutocorrIsOn = v.tAutocorrIsOn; //1 or 0 (not an array)
		T.tAutocorrIsOn ? T.$displayButtons.eq(T.DISPLAY_ISON.TC).attr('checked',true) : T.$displayButtons.eq(T.DISPLAY_ISON.TC).removeAttr('checked');
		T.TC.SetShow(T.tAutocorrIsOn);
	}

}

T.DisplayIsOnMouseDown = function(evt){
	if(evt.button == 2){
		var thisVal = $(this).data('domindex');
		var found = false;
		if(thisVal == T.DISPLAY_ISON.TC){
			T.ToggleElementState($('.tc_info'),true);
			found = true;
		}
		if(!found) for(var i=0;i<T.DISPLAY_ISON.RM.length; i++) if(thisVal == T.DISPLAY_ISON.RM[i]){
			T.ToggleElementState($('.rm_info'),true);
			found = true;
			break;
		}
		return;
	}
}

T.DisplayIsOnClick = function(evt,keyboard){
	//displayIsOn are the 6 buttons: 4xchannel 1xratemap 1xtemporal-autocorr
	
	//Can now be called as a keyboard shortcut in which case this is not set and keyboard has the info not evt.
	//Note click is only triggered with left mouse button, see DisplayIsOnMouseDown for right click.

	var oldChans = T.chanIsOn;
	var oldMaps = T.mapIsOn;
	var oldTautocorr = T.tAutocorrIsOn;

	var thisVal = keyboard ? keyboard.val : $(this).data('domindex');
	var shiftKey = keyboard ? keyboard.shiftKey : evt.shiftKey;
	var setChans; var setMaps; var setTautocorr;

	if(shiftKey){
		//if ctrl key is down then at least keep the old values
		setChans = oldChans.slice(0);
		setMaps = oldMaps.slice(0);
		setTautocorr = oldTautocorr;
	}else{
		//if ctr key is not down then we start with a blank slate
		setChans = [0,0,0,0];
		setMaps = [0];
		setTautocorr = 0;
	}

	var found = false;
	if(thisVal == T.DISPLAY_ISON.TC){
		//clicked temporal autocorr button (there's no array, it's just a single button)
		setTautocorr = shiftKey ? !setTautocorr : 1;
		found = true;
	}
	if(!found) for(var i=0;i<T.DISPLAY_ISON.RM.length; i++) if(thisVal == T.DISPLAY_ISON.RM[i]){
		//clicked the i'th ratemap button (there is currently only one available)
		setMaps[i] = shiftKey ? !setMaps[i] : 1;
		found = true;
		break;
	}
	if(!found) for(var i=0;i<T.DISPLAY_ISON.CHAN.length;i++)if(thisVal == T.DISPLAY_ISON.CHAN[i]){
		//clicked the i'th channel button (of which there are 4)
		setChans[i] = shiftKey ? !setChans[i] : 1;
		found = true;
		break;
	}

	if(shiftKey && (M.sum(setChans) + M.sum(setMaps) + setTautocorr == 0)){
		//if ctrl key was down and we are about to turn off the one and only display we should abort that, and keep what we had
		setChans = oldChans; 
		setMaps = oldMaps;
		setTautocorr = oldTautocorr;
	}

	T.SetDisplayIsOn({chanIsOn: setChans, mapIsOn: setMaps, tAutocorrIsOn: setTautocorr});
}


T.ApplyWSize = function(val){
	var new_scale = Math.floor(val); 
	new_scale = isNaN(new_scale)? 2 : new_scale;
	new_scale = new_scale < 1? 1 : new_scale;
	new_scale = new_scale > 8? 8 : new_scale;
	T.xFactor = new_scale;
	T.yFactor = new_scale;
	T.ApplyCanvasSizes();
}

T.ApplyRmSize = function(v){
	var new_scale = Math.floor(v*10)/10; //round to 1 d.p.
	new_scale = isNaN(new_scale)? 2.5 : new_scale;
	new_scale = new_scale < 0.5? 0.5 : new_scale;
	new_scale = new_scale > 20? 20 : new_scale;
	T.binSizeCm = new_scale;
	T.RM.SetCmPerBin(new_scale);
}



T.ApplyCanvasSizes = function(){

	var i = T.tiles.length;
	while(i--)if(T.tiles[i]){
		var $c = T.tiles[i].$.find('canvas').eq(0);
		$c.css({width: $c.get(0).width * T.xFactor*T.SPECIAL_SCALING  + 'px',height: $c.get(0).height * T.yFactor*T.SPECIAL_SCALING*T.WV.HEIGHT_SCALE  + 'px'});
	}
}



//for each cut slot, these two arrays track the updates applied during calls to SetGroupDataTiles
T.cutSlotToTileMapping = [];

T.canvasUpdatedListeners = []; //this allows T.Tool (and potentially other things) to listen for new canvases
T.AddCanvasUpdatedListener = function(foo){
	T.canvasUpdatedListeners.push(foo);
}
T.RemoveCanvasUpdatedListener = function(foo){
	for(var i=0;i<T.canvasUpdatedListeners.length;i++)if(T.canvasUpdatedListeners[i] == foo){
		T.canvasUpdatedListeners.splice(i,1);
		return;
	}
}


T.CutSlotCanvasUpdate = function(slotInd,canvasNum,$canvas){
	//this callback recieves the newly rendered canvases from the waveform rendering and ratemap rendering modules
	//these rendering modules recieve slot-invalidation events directly from the cut module and can choose to ignore them or
	//spend any length of time rendering a new canvas.  They must hwoever guarantee to call this function in chronological order for
	//the invalidation events on each slot. When a group number changes for a given slot the canvas will follow the group, so that if it 
	//doesn't need to be re-rendered it will be in the right place.  Also, if rendering paramaters are changed the rendering modules may need
	//to issue updated canvases without any slot-invalidation events being received by SetGroupDataTiles.
	//slotInd matches the cut immutables slot thing, canvasNum is 0 for waveforms and 1 for ratemaps.
	var g = T.cutSlotToTileMapping[slotInd];
	var t = T.tiles[g];
	if(!t)
		return;

	if($canvas)	{
		var xF = 1;
		var yF = 1;
        switch (canvasNum){
			case T.CANVAS_NUM_WAVE:
				xF = T.xFactor*T.SPECIAL_SCALING;
				yF = T.yFactor*T.SPECIAL_SCALING*T.WV.HEIGHT_SCALE;
				break;
			case T.CANVAS_NUM_RM:
				xF = T.SPECIAL_SCALING_RM;
				yF = T.SPECIAL_SCALING_RM;
				break;
			case T.CANVAS_NUM_TC:
				// for temporal autocorr leave it at 1
				break;
		}
		$canvas.css({width: $canvas.get(0).width *xF + 'px',height: $canvas.get(0).height *yF  + 'px'}); //apply css scaling
    }else
		$canvas = $("<canvas width='0' height='0' style='width:0px;height:" + T.TILE_MIN_HEIGHT + "px;'></canvas>"); //create a zero-size canvas if we weren't given anything

	t.$.find('canvas').eq(canvasNum).replaceWith($canvas); 

	for(var i=0;i<T.canvasUpdatedListeners.length;i++)
		T.canvasUpdatedListeners[i](canvasNum,$canvas,g);
}

T.CreateTile = function(i){
	var $ = T.$newTile.clone();

	$.data("group_num",i);
	return {$: $,
			$caption: $.find('.tile-caption'),
			$sticker: $.find('.tile-sticker')
			}

}

T.SetGroupDataTiles = function(invalidatedSlots_,isNew){ //this = cut object
	//controls the adding, removing, rearanging, and caption-setting for tiles. (Unfortunately the logic is a bit complicated)

	var maxGroupNum = this.GetProps().G; 
	var invalidatedSlots = M.clone(invalidatedSlots_); //we want our own copy for this function to modify

	while(T.tiles.length <= maxGroupNum){ //if there are too few tiles, add more
		var t = T.CreateTile(T.tiles.length-1);
		T.$tilewall.append(t.$);
		t.$.hide();
		T.tiles.push(t);
	}


	var slotCache = Array(invalidatedSlots.length); //this means we only have to call cut.GetImmutableSlot(k) once for each invalidated slot (even though we have two for loops below)
	for(var k=0;k<invalidatedSlots.length;k++)if(invalidatedSlots[k]){ //for every invalidated slot....
		var slot_k = slotCache[k] = this.GetImmutableSlot(k); //get the slot
		if(slot_k.inds == null  || slot_k.inds.length==0 ){ //check if immutable has been cleared (or maybe it never contaiend anything)
			var old_tile_ind = T.cutSlotToTileMapping[k];
			if(isNum(old_tile_ind)){
				//hide the tile if one was associated to the slot
				T.tiles[old_tile_ind].$.hide(); 
				T.cutSlotToTileMapping[k] = null;
			}
			invalidatedSlots[k] = 0; //by getting rid of any existing tile for the slot we have just validated this slot
		}
	}

	var displaced_tiles = []; //if we move tiles around during the loop we store the displaced tiles in this array so that they can be used by subsequent iterations if needed
	for(var k=0;k<invalidatedSlots.length;k++)if(invalidatedSlots[k]){ //for every remaining invalidated slot...
		var slot_k = slotCache[k];
		var new_tile_ind = slot_k.group_history.slice(-1)[0];
		var old_tile_ind = T.cutSlotToTileMapping[k];
		if(isNum(old_tile_ind) && old_tile_ind != new_tile_ind){
			// We already had a tile for this slot, now there is either a new immutable for the slot or the group on the existing immutable has changed.
			// In both cases we need to move the tile

			displaced_tiles[new_tile_ind] = T.tiles[new_tile_ind];  //store the destination group for potential use in a subsequent iteration of k-loop
			var movingTile;
			if(!displaced_tiles[old_tile_ind] ){ 
				//source group has not yet been displaced, need to create a placeholder
				movingTile = T.tiles[old_tile_ind];
				var oldTilePlaceholder = T.tiles[old_tile_ind] = T.CreateTile(old_tile_ind); // create and then insert a new tile to fill in the gap we are creating
				movingTile.$.before(oldTilePlaceholder.$); //add the placeholder 
				oldTilePlaceholder.$.hide(); //had to add it to the DOM before hidding in order to for css to get applied and thus alow jQuery to know what display value should be on show
			}else{
				//source group has already been displaced
				movingTile = displaced_tiles[old_tile_ind];
			}
			T.tiles[new_tile_ind].$.replaceWith(movingTile.$); // make the move 
			T.tiles[new_tile_ind] = movingTile; 

		} //else: an immutable has been put in a slot, where previously there wasn't one (don't need to do anything special)

		T.tiles[new_tile_ind].$.show()
							   .toggleClass('shake',false) //TODO: on a merger we may not want to cancel the shake
							  .data("group_num",new_tile_ind)
		T.tiles[new_tile_ind].$caption.text(slot_k.inds.length);
		T.tiles[new_tile_ind].$sticker.css({backgroundColor: T.PALETTE_FLAG_CSS[new_tile_ind],
											color: T.PALETTE_FLAG_CSS_TEXT[new_tile_ind]})
									  .text(new_tile_ind);
		T.cutSlotToTileMapping[k] = new_tile_ind;
	}


	while(T.tiles.length-1 > maxGroupNum) // if there are too many tiles, delete some (-1 becuase of group 0)
		T.tiles.pop().$.remove();

}

T.ClearAllTiles = function(){
	while(T.tiles.length)
		T.tiles.pop().$.remove();
	T.cutSlotToTileMapping = [];
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
	window.open("https://github.com/d1manson/waveform/tree/master#wiki","_blank");
}

T.TogglePalette = function(val){
	if(typeof val === "number"){
		T.paletteMode = val;
	}else{
		switch (T.paletteMode){
			case -1:
				T.paletteMode = 1;
				break;
			case -2:
				T.paletteMode = -1;
				break;
			case 1:
				T.paletteMode = -2;
				if(T.WV.canDoComplexRender())
					break; //set it to -1 instead
			default:
				T.paletteMode = -1;
		} 
	}
		
	T.WV.SetPaletteMode(T.paletteMode);
}

T.AutocutMouseDown = function(evt){
	if(evt.button == 2)
		T.ToggleElementState($('.autocut_info'),true);
}

T.AutocutMouseDown = function(evt){
	if(evt.button == 2)
		T.ToggleElementState($('.autocut_info'),true);
}

T.RunAutocut = function(){
    T.$autocut_info.attr("state","closed"); //TODO: rename the attribute as closed actually means it's visible
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
		chan = 0;
	}
	T.AC.DoAutoCut(chan+1,T.ORG.GetN(),T.ORG.GetTetBuffer(),T.AutocutFinished);
}

T.AutocutFinished = function(cut,chan,tree){
	T.ORG.SwitchToCut(3,cut);// TODO: send {description: 'autocut subsample on channel-' + chan};

	tree.OnNode('mouseenter',function(evt,ind){
		console.log(ind + ": mouseenter");
	});
	tree.OnNode('mouseleave',function(evt,ind){
		console.log(ind + ": mouseleave");
	});	
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
T.ToggleElementState = function(el,doItNow,onRightClickOnly){
	var foo =  function(e){
		if(onRightClickOnly && e.button == 0)
			return;
			
		el = [].concat(el); //force it to be an array
		for(var i=0;i<el.length;i++)if(el[i])
			if(el[i].attr("state"))
				el[i].removeAttr("state"); 
			else 
				el[i].attr("state","closed");
	};
	
	if(doItNow)
		foo();
	else
		return foo;
}



T.CutActionCallback = function(info){
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
		T.$action_ = [];
		T.$actionList.empty(); //remove all action elements from page	
		T.$undo.removeAttr('disabled');
	}

	var $newAction = $("<div class='action' data-action-num='" + info.num + "'><b>" + info.num + "</b>&nbsp;&nbsp;&nbsp;" + info.description + "</div>");
	T.$action_.push($newAction); //store it in the array
	T.$actionList.prepend($newAction);
}


T.ReorderNCut = function(){
	//reorder the cut based on number of spikes per group

	var groups = []; //we build an array of (ind,len) pairs that we can then sort by <len>.

	var cut = T.ORG.GetCut();
	var G = cut.GetProps().G;
	for(var i=0;i<=G;i++)
		groups.push({ind: i,
					 len: cut.GetGroup(i).length});
	groups.sort(function(a,b){return b.len-a.len;});

	//sorting order is in groups[].ind, now pull the inds out into their own array...
	var inds = [];
	while(groups.length)
		inds.push(groups.shift().ind);

	cut.ReorderAll(inds);
}

T.ReorderACut = function(amps){
	if(!amps || !('length' in amps)) //when the button is clicked the function is called with event oject not with an array, so we have to go and get the amplitudes
		T.ORG.GetTetAmplitudes(T.ReorderACut); //this is asynchrounous

	//amps is 1a 1b 1c 1d 2a 2b ... nd, where a-d are the 4 channels
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
		chan = 0;
	}

	var N = T.ORG.GetN();
	var amps_chan = new Uint16Array(N); //but we only want one channel
	for(var i=0;i<N;i++)
		amps_chan[i] = amps[i*4 + chan];

	var mean_amps = M.accumarray(T.ORG.GetCut().GetAsVector(),amps_chan,"mean");

	//TODO: I think there will be a bug if there are any empty groups beyond the end of the last occupied group, 

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
	T.DispHeaders(T.ORG.GetState());
}

T.UndoLastAction = function () {
    if (T.Tool.State != T.Tool.STATES_ENUM.NOTHING)
        return;
	var c = T.ORG.GetCut();
	if(c)
		c.Undo();
}

T.FloatingInfo_MouseDown = function(event){
    var $this = $(this);
    var offset = $this.position();
	event.preventDefault();
	
    $this.css({zIndex: ++T.floatingTopZ})
    T.FloatInfoMoving = {$: $(this),
                    off_left: offset.left-event.clientX,
    				off_top: offset.top-event.clientY        
                    }
    $(document).mousemove(T.FloatingInfo_DocumentMouseMove)
               .mouseup(T.FloatingInfo_DocumentMouseUp);	
	$('html').attr("dragging",true);
}
T.FloatingInfo_DocumentMouseMove = function(e){
    T.FloatInfoMoving.$.translate(event.clientX + T.FloatInfoMoving.off_left, 
                                  event.clientY + T.FloatInfoMoving.off_top)
        
}
T.FloatingInfo_DocumentMouseUp = function(e){
	var $this = T.FloatInfoMoving.$;
    T.FloatInfoMoving = null;
    $(document).off('mousemove mouseup');
	$('html').removeAttr("dragging");
	if(T.Tool.State == T.Tool.STATES_ENUM.GRABBER){
		if($this.hasClass('grabbed_info'))
			$this.remove();
		else
			T.ToggleElementState($this,true);
	}
}

T.StoreData = function(){
	localStorage.chanIsOn = JSON.stringify(T.chanIsOn);
	localStorage.mapIsOn = JSON.stringify(T.mapIsOn);
	localStorage.tAutocorrIsOn = JSON.stringify(T.tAutocorrIsOn);

	localStorage.tet = T.ORG.GetTet();
	localStorage.xFactor = T.xFactor;
	localStorage.yFactor = T.yFactor;

	//TODO store cuts
	localStorage.FSactive = T.FS.IsActive();
	localStorage.BIN_SIZE_CM = T.binSizeCm;
	localStorage.state = 1;
	localStorage.headerFilter = T.$header_search.val();
	localStorage.paletteMode = T.paletteMode;
    localStorage.painterR = T.Tool.PainterState.r;
    localStorage.clusterPlotSize = T.CP.GetSize();
	localStorage.button_pannel_state = $('#button_panel').attr("state") || "";
    localStorage.spatial_pannel_state = $('#spatial_panel').attr("state") || "";
    
	localStorage.side_panel_width = 100*T.$side_panel.width()/$(document).width();
}

T.DocumentReady = function(){

	if(localStorage.state){
		T.ORG.SwitchToTet(localStorage.tet || 1);
		T.xFactor = localStorage.xFactor || 2;
		T.yFactor = localStorage.yFactor;
		T.binSizeCm = localStorage.BIN_SIZE_CM || 2.5;
		T.$header_search.val(localStorage.headerFilter || '');
		T.TogglePalette(parseInt(localStorage.paletteMode) || -1);
        T.Tool.PainterState.r = parseInt(localStorage.painterR) || 20;
        T.CP.SetSize(parseInt(localStorage.clusterPlotSize) || 128);
		//TODO: load files into T.cut instances
        if(localStorage.button_pannel_state) //this is open by default, so close if required
            $('#button_panel').attr("state",localStorage.button_pannel_state)
        if(localStorage.spatial_pannel_state == "")
            $('#spatial_panel').removeAttr("state") //this is closed by default, so open if required
		T.SetDisplayIsOn({chanIsOn: JSON.parse(localStorage.chanIsOn), mapIsOn: JSON.parse(localStorage.mapIsOn), tAutocorrIsOn: JSON.parse(localStorage.tAutocorrIsOn)});
		T.RM.SetCmPerBin(T.binSizeCm);
		
		var wPc = localStorage.side_panel_width || 25;
		T.$side_panel.css({width: wPc + '%'});
		
		if(parseInt(localStorage.FSactive) || localStorage.FSactive=="true") 
			T.ToggleFS();//it starts life in the off state, so this turns it on 

	}else{
		T.SetDisplayIsOn({chanIsOn: [1,1,1,1]});
	}
}

T.DriftButtonClick = function(){
    T.clusterMode = T.clusterMode ? 0 : 2;
    T.CP.SetRenderMode(T.clusterMode);
	T.RM.SetRenderMode(T.clusterMode);
	
	// TODO: it's a bit lame to do this here
	if(T.groupOver.g >0 || T.groupOver.g==0)
		T.RM.RenderSpikesForPath(T.groupOver.g);
}

T.BarMouseDown = function(e){
	if (e.button != 0)
		return;
	T.barDrag_xOff = e.screenX - T.$side_panel.width()
	$(document).on("mousemove",T.BarDrag_DocumentMouseMove)
			   .on("mouseup",T.BarDrag_DocumentMouseUp);
	T.$mask.css({cursor: "ew-resize",
				 display: "block"})
			
}

T.BarDrag_DocumentMouseMove = function(e){
	var wPx = (e.screenX-T.barDrag_xOff);
	var wPc = 100*wPx/$(document).width();
	wPc = wPc > 80 ? 80 : wPc < 15 ? 15 : wPc;
	T.$side_panel.css({width: wPc + '%'});
}
T.BarDrag_DocumentMouseUp = function(e){
	$(document).off("mousemove",T.BarDrag_DocumentMouseMove)
			   .off("mouseup",T.BarDrag_DocumentMouseUp);
	T.$mask.css({cursor: "",
				display: "none"});
}


T.groupOver = {g: null,$tile:null,$clusterSticker:null};
T.SetGroupOver = function(g){
    g = parseInt(g);//when coming via data-group attr it might be a string
	if(g == T.groupOver.g)
		return;

	if(T.groupOver.$tile)
		T.groupOver.$tile.removeAttr('active');
	if(T.groupOver.$clusterSticker)
		T.groupOver.$clusterSticker.removeAttr('active');
	
    T.$pos_overlay.get(0).getContext('2d').clearRect( 0 , 0 , T.POS_PLOT_WIDTH ,T.POS_PLOT_HEIGHT );
    
	T.groupOver.g = g;
	if(!(g==0 || g>0))
		return;
		
	T.groupOver.$clusterSticker = T.$cluster_info.find('.cluster-sticker[data-group=' + g + ']');
	T.groupOver.$tile = T.tiles[g] ? T.tiles[g].$ : null;
	
    T.RM.RenderSpikesForPath(g);
	if(T.groupOver.$clusterSticker)
		T.groupOver.$clusterSticker.attr('active',true);
	if(T.groupOver.$tile)
		T.groupOver.$tile.attr('active',true);
		
}

T.ToggleHeaderInfo = function(){
	T.ToggleElementState(T.$file_info_pane,true); 
	T.DispHeaders(T.ORG.GetState());
}

$('.help_button').click(T.ShowHelp)
				 .mousedown(T.ToggleElementState($('.help_info'),false,true));
T.$tilewall = $('.tilewall');
T.$posplot = $('#posplot');
T.$pos_overlay = $('#posoverlay');
T.$mask = $('.mask');
T.tiles = [];
T.$actionList = $('.action_list');
T.$drop_zone = $('.file_drop');			
T.$tilewall_text = $('.tilewall_text');	 			 
T.$info_panel = $('#info_panel');
T.$autocut_info = $('.autocut_info');
T.$cluster_panel = $('#cluster_panel');
T.$side_panel = $('.side_panel');
T.$cluster_info = $('.cluster_info');
T.$painter_dest = $('#painter-dest');
T.$painter_src = $('#painter-src');
T.$cluster_others = $('.cluster_others');
$('#reorder_n_button').click(T.ReorderNCut);
$('#reorder_A_button').click(T.ReorderACut);
T.$undo = $('#undo_button').click(T.UndoLastAction)
						   .mousedown(T.ToggleElementState($('.action_info'),false,true));
$('.bar').on("mousedown", T.BarMouseDown);
T.$FSbutton = $('#filesystem_button').click(T.ToggleFS);
$('#spatial_panel_toggle').click(T.ToggleElementState($('#spatial_panel')));
$('#button_panel_toggle').click(T.ToggleElementState($('#button_panel')));
T.$files_panel = $('#files_panel');
$('#files_panel_toggle').click(T.ToggleElementState(T.$files_panel));
T.$displayButtons = $(".display_button").each(function(i){$(this).data('domindex',i);})
										.click(T.DisplayIsOnClick)
										.mousedown(T.DisplayIsOnMouseDown);
$('#toggle_palette').click(T.TogglePalette)
					.mousedown(T.ToggleElementState($('.palette_info'),false,true));
$('#autocut').click(T.RunAutocut)
			 .mousedown(T.ToggleElementState(T.$autocut_info,false,true));
$('#apply_rm_size').click(T.ApplyRmSizeClick);
T.$file_info = [$('#tet_info'),$('#cut_info'),$('#pos_info'),$('#set_info')];
T.$filesystem_load_button = $('#filesystem_load_button');
T.$header_search = $('#header_search');
T.$header_search.on(T.$header_search.get(0).onsearch === undefined ? "input" : "search",T.FilterHeader);
T.$file_info_pane = $('.file_info');
$('#file_headers_button').mousedown(T.ToggleHeaderInfo);
T.$filesystem_load_button.click(T.ORG.RecoverFilesFromStorage);
T.ORG.AddFileStatusCallback(T.FinishedLoadingFile);
T.ORG.AddCutActionCallback(T.CutActionCallback);	
T.ORG.AddCutChangeCallback(T.SetGroupDataTiles);
$('#drift_button').click(T.DriftButtonClick)
				  .mousedown(T.ToggleElementState($('.drift_info'),false,true));
$(document).on("mousedown",".floatinginfo",T.FloatingInfo_MouseDown)
$('input').on("mousedown",function(e){e.stopPropagation()}); //this is neccessary to allow the user to click inputs within a dragable floatinginfo

// KEYBOARD SHORTCUTS from keymaster  (github.com/madrobby/keymaster)
key('p',T.TogglePalette);
key('a',T.RunAutocut);

key('esc',T.ToggleElementState([$('.bar'),$('.side_panel'),T.$tilewall]));
key('1, shift+1',function(){T.DisplayIsOnClick(null,{val:T.DISPLAY_ISON.CHAN[0],shiftKey:key.shift});});
key('2, shift+2',function(){T.DisplayIsOnClick(null,{val:T.DISPLAY_ISON.CHAN[1],shiftKey:key.shift});});
key('3, shift+3',function(){T.DisplayIsOnClick(null,{val:T.DISPLAY_ISON.CHAN[2],shiftKey:key.shift});});
key('4, shift+4',function(){T.DisplayIsOnClick(null,{val:T.DISPLAY_ISON.CHAN[3],shiftKey:key.shift});});
key('r, shift+r',function(){T.DisplayIsOnClick(null,{val:T.DISPLAY_ISON.RM[0],shiftKey:key.shift});});
key('t, shift+t',function(){T.DisplayIsOnClick(null,{val:T.DISPLAY_ISON.TC,shiftKey:key.shift});});
key('d',T.DriftButtonClick);
key('h, alt+h',T.ToggleHeaderInfo);
key('alt+a',T.ToggleElementState(T.$autocut_info));
key('ctrl+z, z',T.UndoLastAction);
key('alt+r',T.ToggleElementState($('.rm_info')));
key('/, alt+/',T.ToggleElementState($('.help_info')));
key('alt+p',T.ToggleElementState($('.palette_info')));
key('alt+d',T.ToggleElementState($('.drift_info')));
key('alt+t',T.ToggleElementState($('.tc_info')));
key('alt+z',T.ToggleElementState($('.action_info')));
key('ctrl+shift+q',T.ResetAndRefresh); //this shortcut is the only way of calling this function
key('=',function(){T.CP.SetSize(T.CP.GetSize()+20)})
key('-',function(){T.CP.SetSize(T.CP.GetSize()-20)})
key('enter',function(){T.Tool.SetPainterDestGroup(-1);});
key('e',function(){if(T.groupOver.g>0 || T.groupOver.g==0) T.Tool.SetPainterDestGroup(T.groupOver.g);});
key('f, shift+f',function(){if(T.groupOver.g>0 || T.groupOver.g==0) T.Tool.PainterSrc_Toggle(T.groupOver.g);});
key('s',function(){if(T.groupOver.g>0 || T.groupOver.g==0) T.Tool.Swap(T.groupOver.g);});
if(!(window.requestFileSystem || window.webkitRequestFileSystem))
	$('#filesystem_button').hide();

$(document).bind("contextmenu",function(e){return false;})
		    .ready(T.DocumentReady);
window.onbeforeunload = T.StoreData;


T.PALETTE_FLAG = function(){
        var data = new Uint8Array(256*4);
        for(var i=0;i<256;i++)
    		data[i*4+3] = 255; //alpha to full opaque
        data[0*4+0] = 190;    data[0*4+1] = 190;    data[0*4+2] = 190; //was 220 for all three
        data[1*4+2] = 200;
    	data[2*4+0] = 80;	data[2*4+1] = 255;
        data[3*4+0] = 255;
        data[4*4+0] = 245;	data[4*4+2] = 255;
    	data[5*4+1] = 75;	data[5*4+1] = 200;	data[5*4+2] = 255;
        data[6*4+1] = 185;
    	data[7*4+0] = 255;	data[7*4+1] = 185;	data[7*4+2] = 50;
        data[8*4+1] = 150;	data[8*4+2] = 175;
        data[9*4+0] = 150;	data[9*4+2] = 175;
    	data[10*4+0] = 170;	data[10*4+1] = 170;
    	data[11*4+0] = 200;
    	data[12*4+0] = 255;	data[12*4+1] = 255;
    	data[13*4+0] = 140;	data[13*4+1] = 140;	data[13*4+2] = 140;
    	data[14*4+1] = 255; data[14*4+2] = 235;
    	data[15*4+0] = 255; data[15*4+2] = 160;
    	data[16*4+0] = 175; data[16*4+1] = 75; data[16*4+2] = 75;
    	data[17*4+0] = 255; data[17*4+1] = 155; data[17*4+2] = 175;
    	data[18*4+0] = 190; data[18*4+1] = 190; data[18*4+2] = 160;
    	data[19*4+0] = 255; data[19*4+1] = 255; data[19*4+2] = 75;
    	data[20*4+0] = 154; data[20*4+1] = 205; data[20*4+2] = 50;
    	data[21*4+0] = 255; data[21*4+1] = 99; data[21*4+2] = 71;
    	data[22*4+1] = 255; data[22*4+2] = 127;
    	data[23*4+0] = 255; data[23*4+1] = 140;
    	data[24*4+0] = 32; data[24*4+1] = 178; data[24*4+2] = 170;
    	data[25*4+0] = 255; data[25*4+1] = 69; 
    	data[26*4+0] = 240; data[26*4+1] = 230; data[26*4+2] = 140;
    	data[27*4+0] = 100; data[27*4+1] = 149; data[27*4+2] = 237;
    	data[28*4+0] = 255; data[28*4+1] = 218; data[28*4+2] = 185;
    	data[29*4+0] = 153; data[29*4+1] = 50; data[29*4+2] = 204;
    	data[30*4+0] = 250; data[30*4+1] = 128; data[30*4+2] = 114;
        return data;
    }(); //Note incosistency..this is uint8, but palette_time is uint32..not a big deal though.
T.PALETTE_FLAG_CSS = function(){
	var ret = [];
	
	for(var i=0;i<T.PALETTE_FLAG.length;i+=4)
		ret.push('rgb(' + T.PALETTE_FLAG[i] +"," +T.PALETTE_FLAG[i+1] +","+ T.PALETTE_FLAG[i+2]+")") //maybe a bit inefficient but it's only 256 values so whatever
	return ret;
}();

T.PALETTE_FLAG_CSS_TEXT = function(){
	var black_list = [0,2,3,4,5,6,7,10,12,13,14,15,17,18,19,20,21,22,23,25,26,27,28,30]; //these group numbers are black, all others are white
	
	var ret = [];
	for(var i=0;i<T.PALETTE_FLAG.length/4;i++)
		ret.push( black_list.indexOf(i) == -1 ? '#FFF' : '#000');
		
	return ret;
}();

T.PALETTE_TIME = function(){
	var data = new Uint8Array(256*4);
        for(var i=0;i<256;i++){
			data[i*4 +0] = 256-i;  //decreasing red
			data[i*4 +1] = i; //increasing green
		    data[i*4+3] = 255; //set alpha to opaque
		}
		return new Uint32Array(data.buffer);
}();