"use strict";

var T = T || {};
T.Tool = {};
T.chanIsOn = [1,1,1,1];
T.mapIsOn = [0];
T.tAutocorrIsOn = 0;
T.paletteMode = -1;

T.BASE_CANVAS_WIDTH = 4*49;
T.BASE_CANVAS_HEIGHT = 256;
T.CANVAS_NUM_WAVE = 0;
T.CANVAS_NUM_RM = 1;
T.CANVAS_NUM_RM_DIR = 2;
T.CANVAS_NUM_TC = 3;
T.POS_PLOT_WIDTH = 255;
T.POS_PLOT_HEIGHT = 255;
T.DISPLAY_ISON = {CHAN: [0,1,2,3], RM: [4], TC: 5}; //order in DOM

T.xFactor = 2;
T.yFactor = 2;
T.SPECIAL_SCALING = 0.5; //this scaling factor makes the size values presented to the user a bit nicer
//T.SPECIAL_SCALING_RM = 2; //this makes ratemaps bigger
T.TILE_RM_HEIGHT = 120;
T.TILE_MIN_HEIGHT = 128; //TODO: look this up from css rather than state it here manually
T.floatingTopZ = 100;

T.modeChangeCallbacks = [];
T.$newTile = $("<div class='tile grabbable'>" +
			"<canvas width='0' height='0' style='width:0px;height:" + T.TILE_MIN_HEIGHT + "px;'></canvas>" + 
			"<canvas width='0' height='0' style='width:0px;height:" + T.TILE_MIN_HEIGHT + "px;'></canvas>" +
			"<canvas width='0' height='0' style='width:0px;height:" + T.TILE_MIN_HEIGHT + "px;'></canvas>" +
			"<canvas width='0' height='0' style='width:0px;height:" + T.TILE_MIN_HEIGHT + "px;'></canvas>" +
			"<div class='tile-sticker'></div>" + 
			"<div class='tile-over hidden_grabbed'>" +
				"<div class='tile-buttons' layout vertical>" +
					"<core-tooltip label='swap with... [s]' position='left'>" +
						"<button class='tile-button-swap'></button>" +
					"</core-tooltip>" +
					"<core-tooltip label='make destination group [e]' position='left'>" +
						"<button class='tile-button-dest'></button>" +
					"</core-tooltip>" +
					"<core-tooltip label='make source group [f]' position='left'>" +
						"<button class='tile-button-src'></button>" +
					"</core-tooltip>" +
					"<div class='tile-caption'></div>" + 
				"</div>" + 
			"</div>" +
			"<div class='blind'></div>" + 
			"</div>");		//this gets cloned and appended to $tilewall




T.PlotPos = function(){
	var buffer = T.ORG.GetPosBuffer();

    var canv= T.$posplot.get(0);

	if(buffer == null) {
        var ctx = canv.getContext('2d');
    	ctx.clearRect(0 , 0 , canv.width, canv.height);
	}else{
        var header = T.ORG.GetPosHeader();
        var xs = T.POS_PLOT_WIDTH/header.max_vals[0];
    	var ys = T.POS_PLOT_HEIGHT/header.max_vals[1];
    	var s = xs<ys? xs: ys;//min of the two
        canv.width = Math.ceil(s*header.max_vals[1]);
        canv.height = Math.ceil(s*header.max_vals[0]);
        var ctx = canv.getContext('2d');
        var data = new Int16Array(buffer);
    	
    	var nPos = data.length/2; 
    	ctx.beginPath();
    	ctx.strokeStyle = "RGB(0,0,0)";
    	var i = 0;
    	ctx.moveTo(data[i]*s,data[i+1]*s);
    	for(;i<nPos;i++)
    		ctx.lineTo(data[i*2+0]*s,data[i*2+1]*s);
    	ctx.stroke();    
	}

}

T.PlotSpeedHist = function(hist){
	if (!hist)
		return;
	var canv = T.$speedhist.get(0);
	var ctx = canv.getContext('2d');
	var GAP = 3;
	ctx.clearRect(0,0,canv.width,canv.height);
	var w = canv.height/hist.length; //width of bar, which ends up as the height becuase bar is sideways
	var max = M.max(hist);
	var f = (canv.width-GAP)/max;
	ctx.fillRect(1,0,1,canv.height);

	for(var i=0;i<hist.length;i++){
		ctx.fillRect(GAP,i*w,hist[i]*f,w-0.5);
	}
}

T.PlotSpeedHistDrift = function(x){
	var canv =  T.$speedhist.get(0);
	var ctx = canv.getContext('2d');

	var imData = ctx.createImageData(canv.width,canv.height);
	imData.data.set(new Uint8ClampedArray(x));
	ctx.putImageData(imData, 0, 0);

}

T.GoGetSpeedHist = function(v,g){
	if(v == 2){
		var canv = T.$speedhist.get(0);
		T.ORG.GetSpeedHist(T.PlotSpeedHistDrift,true,canv.width,canv.height)
	}else{
		T.ORG.GetSpeedHist(T.PlotSpeedHist,false)
	}
}
T.modeChangeCallbacks.push(T.GoGetSpeedHist);



T.SpikeForPathCallback = function($canv){
	T.$pos_overlay.replaceWith($canv);
	T.$pos_overlay = $canv;
}

T.ShowInfoSummary = function(status,filetype){
    if(filetype == null && status.set < 3){
        T.$info_summary_text.text("");
    }else if(filetype == "set" && status.set >=2){
		//TODO: I think you can actually get this info from any of the headers.
        var hd = T.ORG.GetSetHeader();
        var startTime = new Date(hd["trial_date"] + " " + hd["trial_time"]);
        var endTime = new Date(startTime)
        endTime.setSeconds(startTime.getSeconds() + parseInt(hd["duration"]));
        var str = startTime.getHours() + ":" + (startTime.getMinutes() <10? "0" : "") +  startTime.getMinutes() + " to "
                    + endTime.getHours() + ":" + (endTime.getMinutes() <10? "0" : "") + endTime.getMinutes();
        T.$info_summary_text.text(str);
		T.$info_summary.css({opacity: 1});
    }
}


T.FinishedLoadingFile = function(status,filetype){
	console.log("FinishedLoadingFile(" + JSON.stringify(status) + ", " + filetype + ")");
	if(T.ORG.GetExpName())
		T.$tilewall_text.hide();
		
	T.DispHeaders(status,filetype); //if null, then it displays all (which could still be something if T.PAR.Get*Header isn't null)
    T.ShowInfoSummary(status,filetype);

	if(filetype == null){	
		if(status.tet < 3){
			T.PlotPos();
			T.PlotSpeedHist(null); //TODO: check whether this is really needed here
		}
		if(status.cut < 3){
			T.ClearAllTiles();
			T.CutActionCallback({num:0,type:"load",description:"no active cut"});
		}
		if(status.pos < 3){
			T.PlotPos();
			T.PlotSpeedHist(null);
		}
	}

	if(filetype == "pos"){
		T.PlotPos();
		T.GoGetSpeedHist(T.clusterMode,T.groupOver.g);
	}

}

T.DispHeadersForced = function(){
	T.DispHeaders(T.ORG.GetState(),undefined,true);
}

T.DispHeaders = function(status,filetype,forced){
	if(!forced && !T.$file_info_pane.hasClass("showing"))
		return;
		
	//TODO: move to separate module
	//TODO: if filetype is null then display all, otherwise only display the one given by the filetype string ["tet","set", etc.]
	console.time("DipsHeaders");
	var headerTypeList = ["tet","cut","pos","eeg","set"];
	var headerlist = [T.ORG.GetTetHeader(),T.ORG.GetCutHeader(),T.ORG.GetPosHeader(),T.ORG.GetEEGHeader(),T.ORG.GetSetHeader()];
    var tet = T.ORG.GetTet();
	var headernames = ['.' + tet +' file (spike data)','_' + tet + '.cut file','.pos file','.eeg file','.set file'];
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


T.DisplayIsOnClick = function(evt,keyboard){
	//displayIsOn are the 6 buttons: 4xchannel 1xratemap 1xtemporal-autocorr
	
	//Can now be called as a keyboard shortcut in which case this is not set and keyboard has the info not evt.
	//Note click is only triggered with left mouse button.

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
				$canvas.css({width: $canvas.get(0).width *xF + 'px',height: $canvas.get(0).height *yF  + 'px'}); //apply css scaling
				break;
			case T.CANVAS_NUM_RM:
			case T.CANVAS_NUM_RM_DIR: //TODO: probably want some special scaling for direction ratemaps that isn't the same as XY-maps
				xF = T.SPECIAL_SCALING_RM;
				yF = T.SPECIAL_SCALING_RM;
				$canvas.css({height:  T.TILE_RM_HEIGHT + 'px'}); //apply css scaling
				break;
			case T.CANVAS_NUM_TC:
				// for temporal autocorr leave it at 1
				break;
		}
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

T.ShowGitHub = function(){
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
    if (T.Tool.cState != T.Tool.STATES.NOTHING)
        return;
	var c = T.ORG.GetCut();
	if(c)
		c.Undo();
}



T.StoreData = function(){
	localStorage.chanIsOn = JSON.stringify(T.chanIsOn);
	localStorage.mapIsOn = JSON.stringify(T.mapIsOn);
	localStorage.tAutocorrIsOn = JSON.stringify(T.tAutocorrIsOn);

	localStorage.tet = T.ORG.GetTet();
	localStorage.xFactor = T.xFactor;
	localStorage.yFactor = T.yFactor;
    
	localStorage.FSactive = T.FS.IsActive();
	localStorage.BIN_SIZE_CM = T.RM.GetCmPerBin();
    localStorage.rmSmoothingW = T.RM.GetSmoothingW();
	localStorage.tcDeltaT = T.TC.GetDeltaT();
        
	localStorage.state = 1;
	localStorage.headerFilter = T.$header_search.val();
	localStorage.paletteMode = T.paletteMode;
    localStorage.painterR = T.Tool.PainterState.r;
    localStorage.clusterPlotSize = T.CP.GetSize();
    localStorage.splitterPercents = JSON.stringify($.map($('core-splitter').get(),function(el){return el.getSize('%');}));
	localStorage.showToolbar = T.$main_toolbar.is(":visible");
	
	localStorage.posSmoothing = T.ORG.GetPosSmoothing();
	localStorage.posMaxSpeed = T.ORG.GetPosMaxSpeed();
}

T.ApplyStoredSettingsA = function(){
	if(localStorage.state){
		T.ORG.SwitchToTet(localStorage.tet || 1);
		T.xFactor = localStorage.xFactor || 2;
		T.yFactor = localStorage.yFactor;
		T.$header_search.val(localStorage.headerFilter || '');
		T.TogglePalette(parseInt(localStorage.paletteMode) || -1);
        T.Tool.PainterState.r = parseInt(localStorage.painterR) || 20;
        T.CP.SetSize(parseInt(localStorage.clusterPlotSize) || 128);
		T.SetDisplayIsOn({chanIsOn: JSON.parse(localStorage.chanIsOn), mapIsOn: JSON.parse(localStorage.mapIsOn), tAutocorrIsOn: JSON.parse(localStorage.tAutocorrIsOn)});
		T.$main_toolbar.toggle(localStorage.showToolbar === undefined || localStorage.showToolbar == "true")
		
		if(parseInt(localStorage.FSactive) || localStorage.FSactive=="true") 
			T.ToggleFS();//it starts life in the off state, so this turns it on 
			

	}else{
		T.SetDisplayIsOn({chanIsOn: [1,1,1,1]});
	}
}

T.ApplyStoredSettingsB = function(e) {
	//this is run when the web components are loaded and ready for action
	$.map(
		zip([
			$('core-splitter').get(),
			JSON.parse(localStorage.splitterPercents || "[30,30,25]") 
		]),function(el_n_val){
			el_n_val[0].setSize(el_n_val[1],'%')
	});

	T.RM.SetCmPerBin(parseFloat(localStorage.BIN_SIZE_CM || "2.5"));
    T.RM.SetSmoothingW(parseInt(localStorage.rmSmoothingW || "2"));
	T.TC.SetDeltaT(parseInt(localStorage.tcDeltaT || "500"));
	T.ORG.SetPosSmoothing(parseFloat(localStorage.posSmoothing || "0.2"));
	T.ORG.SetPosMaxSpeed(parseFloat(localStorage.posMaxSpeed || "5"));
}



T.DocumentReady = function(){
	T.ApplyStoredSettingsA();
	T.InitFloatingInfo();
	T.InitKeyboardShorcuts();
	T.InitButtons();
}

T.DriftButtonClick = function(){
    T.clusterMode = T.clusterMode ? 0 : 2;
	for(var i =0;i<T.modeChangeCallbacks.length;i++)
		T.modeChangeCallbacks[i](T.clusterMode,T.groupOver.g);	
}



T.groupOver = {g: null,$tile:null,$clusterSticker:null};
T.SetGroupOver = function(g){
	if(T.Tool.cState == T.Tool.STATES.GRABBER)
		return; // dont change group over while grabber is active
		
    g = parseInt(g);//when coming via data-group attr it might be a string
	if(g == T.groupOver.g)
		return;

	if(T.groupOver.$tile)
		T.groupOver.$tile.removeAttr('active');
	if(T.groupOver.$clusterSticker)
		T.groupOver.$clusterSticker.removeAttr('active');
	
    T.$pos_overlay.get(0).getContext('2d').clearRect( 0 , 0 , T.POS_PLOT_WIDTH ,T.POS_PLOT_HEIGHT );
    
	T.groupOver.g = g;
	if(!(g==0 || g>0)){
		T.$info_summary.css({opacity: 1});
		return;
	}
	
	T.$info_summary.css({opacity: 0});
	T.groupOver.$clusterSticker = T.$cluster_info.find('.cluster-sticker[data-group=' + g + ']');
	T.groupOver.$tile = T.tiles[g] ? T.tiles[g].$ : null;
	
    T.RM.RenderSpikesForPath(g);
	if(T.groupOver.$clusterSticker)
		T.groupOver.$clusterSticker.attr('active',true);
	if(T.groupOver.$tile)
		T.groupOver.$tile.attr('active',true);
		
}

T.ToggleHeaderInfo = function(){
	T.$file_info_pane.toggleClass('showing');
	T.DispHeadersForced();
}

T.ShowScrollShaddow = function(e){
	var $this = $(this);
	$this.prev().toggleClass("above_scrolled_area", $this.scrollTop() > 3 /*small number */);
}

T.FloatingInfo_MouseDown = function(event){
	// if the mouse-down element or any of its ancestors has the "nodrag" class then dont start the dragging.
	if(event.target != event.currentTarget && 
			$(event.target).hasClass('nodrag') ||
			$(event.target).parentsUntil(event.currentTarget).anyHasClass('nodrag'))
			return;

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
	if(T.Tool.cState == T.Tool.STATES.GRABBER){
		if($this.hasClass('grabbed_info'))
			$this.remove();
		else
			$this.toggleClass('showing');
	}
}
T.Toggle = function(info_name){
	var $el = $('.floating_layer').find("." + info_name); 
	return function(){$el.toggleClass('showing');};
}

T.InitFloatingInfo = function(){
	var $floating_layer = $('.floating_layer');
	$('.info_linked').each(function(){
		var info_name = $(this).data('info-name');
		$(this).data('$info',$floating_layer.find('.' + info_name));
	})
	.on('mouseenter',function(){
		$(this).data('$info').css({display:'block'});
	})
	.on('mouseleave',function(){
		$(this).data('$info').css({display:''});
	})
	.on('mousedown',function(e){
		if(e.button != 0 || e.altKey)
			$(this).data('$info').toggleClass('showing');
	});
}

T.ToggleToolbar = function(){
	T.$main_toolbar.css({height: ''})
				.slideToggle({duration: 400, queue:false});
}

T.MakeCopyData = function(){
	//WARNING: no escaping of text here
	var str = "[" + T.ORG.GetExpName() + "] t" + T.ORG.GetTet();
	if (T.groupOver.g >0 || T.groupOver.g == 0){
		str += "c" + T.groupOver.g +  "  n=" + T.ORG.GetCut().GetGroup(T.groupOver.g).length + "<br>"; 
		str += T.groupOver.$tile.find('canvas').get().map(CanvToImgStr).join("");
	}
	return str;
}

T.Copy = function(e){
    // based on: http://stackoverflow.com/a/11347714/2399799    
    if (e.ctrlKey && !e.altKey && !e.shiftKey && e.which == 67 /* KEY_C */) {
        T.$hidden_clipboard.html(T.MakeCopyData());
        var rng = document.createRange();
        var sel = window.getSelection();
        sel.removeAllRanges();
        rng.selectNodeContents(T.$hidden_clipboard.get(0));
        sel.addRange(rng);
        return true;
    }
}


T.InitKeyboardShorcuts = function(){
	// KEYBOARD SHORTCUTS from keymaster  (github.com/madrobby/keymaster)
	key('p',T.TogglePalette);
	key('a',T.RunAutocut);
	key('esc',T.ToggleToolbar);
	key('1, shift+1',function(){T.DisplayIsOnClick(null,{val:T.DISPLAY_ISON.CHAN[0],shiftKey:key.shift});});
	key('2, shift+2',function(){T.DisplayIsOnClick(null,{val:T.DISPLAY_ISON.CHAN[1],shiftKey:key.shift});});
	key('3, shift+3',function(){T.DisplayIsOnClick(null,{val:T.DISPLAY_ISON.CHAN[2],shiftKey:key.shift});});
	key('4, shift+4',function(){T.DisplayIsOnClick(null,{val:T.DISPLAY_ISON.CHAN[3],shiftKey:key.shift});});
	key('r, shift+r',function(){T.DisplayIsOnClick(null,{val:T.DISPLAY_ISON.RM[0],shiftKey:key.shift});});
	key('t, shift+t',function(){T.DisplayIsOnClick(null,{val:T.DISPLAY_ISON.TC,shiftKey:key.shift});});
	key('d',T.DriftButtonClick);
	key('h, alt+h',T.ToggleHeaderInfo);
	key('k, alt+k',T.Toggle('shortcut_info'));
	key('alt+a',T.Toggle('autocut_info'));
	key('ctrl+z, z',T.UndoLastAction);
	key('alt+r',T.Toggle('rm_info'));
	key('/',T.ShowGitHub);
	key('alt+/',T.Toggle('help_info'));
	key('alt+p',T.Toggle('palette_info'));
	key('alt+d',T.Toggle('drift_info'));
	key('alt+t',T.Toggle('tc_info'));
	key('alt+z',T.Toggle('action_info'));
	key('ctrl+shift+q',T.ResetAndRefresh); //this shortcut is the only way of calling this function
	key('=',function(){T.CP.SetSize(T.CP.GetSize()+20)})
	key('-',function(){T.CP.SetSize(T.CP.GetSize()-20)})
	key('enter',function(){T.Tool.SetPainterDestGroup(-1);});
	key('e',function(){if(T.groupOver.g>0 || T.groupOver.g==0) T.Tool.SetPainterDestGroup(T.groupOver.g);});
	key('f, shift+f',function(){if(T.groupOver.g>0 || T.groupOver.g==0) T.Tool.PainterSrc_Toggle(T.groupOver.g);});
	key('s',function(){if(T.groupOver.g>0 || T.groupOver.g==0) T.Tool.Swap(T.groupOver.g);});
    $(document).on('keydown',T.Copy);

}

T.InitButtons = function(){
	$('#reorder_n_button').click(T.ReorderNCut);
	$('#reorder_A_button').click(T.ReorderACut);
	$('#undo_button').click(T.UndoLastAction);
	T.$displayButtons.each(function(i){$(this).data('domindex',i);})
											.click(T.DisplayIsOnClick);
	$('#toggle_palette').click(T.TogglePalette);
	$('#autocut').click(T.RunAutocut);
	$('#apply_rm_size').click(T.ApplyRmSizeClick);
	T.$header_search.on(T.$header_search.get(0).onsearch === undefined ? "input" : "search",T.FilterHeader);
	$('#file_headers_button').on('mouseenter',T.DispHeadersForced);
	$('.github_button').on('click',T.ShowGitHub);
	$('.menu_toggle').mouseup(T.ToggleToolbar);
	T.$filesystem_load_button.click(T.ORG.RecoverFilesFromStorage);
	$('#drift_button').click(T.DriftButtonClick);
}

$('core-tooltip').on('mouseenter',function(){this.setPosition();}); //POLYMER BUGFIX
T.$main_toolbar = $('.main_toolbar');
T.$hidden_clipboard = $('.hidden_clipboard');
T.$tilewall = $('.tilewall');
T.$posplot = $('#posplot');
T.$pos_overlay = $('#posoverlay');
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
T.$undo = $('#undo_button');
T.$FSbutton = $('#filesystem_button');
T.$files_panel = $('#files_panel');
T.$displayButtons = $(".display_button");
T.$file_info = [$('#tet_info'),$('#cut_info'),$('#pos_info'),$('#eeg_info'),$('#set_info')];
T.$filesystem_load_button = $('#filesystem_load_button');
T.$header_search = $('#header_search');
T.$file_info_pane = $('.file_info');
T.$info_summary = $('.info_summary');
T.$info_summary_text = $('.info_summary_text');
T.$speedhist = $('#speedhist');
T.ORG.AddFileStatusCallback(T.FinishedLoadingFile);
T.ORG.AddCutActionCallback(T.CutActionCallback);	
T.ORG.AddCutChangeCallback(T.SetGroupDataTiles);

$('.floating_layer').on("mousedown",".floatinginfo",T.FloatingInfo_MouseDown)
$('input').on("mousedown",function(e){e.stopPropagation()}); //this is neccessary to allow the user to click inputs within a dragable floatinginfo
$('.scrollable_area').on('scroll',T.ShowScrollShaddow);

if(!(window.requestFileSystem || window.webkitRequestFileSystem))
	$('#filesystem_button').hide();

$(document).bind("contextmenu",function(e){return false;})
		    .ready(T.DocumentReady);
$(window).on('polymer-ready',T.ApplyStoredSettingsB);
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
			data[i*4 +0] = 255-i;  //decreasing red
			data[i*4 +1] = i; //increasing green
		    data[i*4+3] = 255; //set alpha to opaque
		}
		return new Uint32Array(data.buffer);
}();