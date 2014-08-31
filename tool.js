"use strict";
/*
T.Tool deals with most/all of the cut-modification interactivity...painting, splitting, merging, swapping etc.
Note that T.CUT defines the actual logic of the backen datastructure for the cut, here we are concerned with
the interface aspect.
By bad design, the grabber tool (which doesn't actually effect the cut) is also located in this file...I guess
because it has some things in common with the other stuff going on here even though it doesn't modify the cut.
Also by bad design, the undo tool (I guess it is a tool) is located in main rather than in this file.

T.Tool.cState will hold one of the values in T.Tool.STATES. Note that only one of the tools should be active
at any one time.
Where the value is an object it may have further properties relating to that particular type of state.
In some cases, a reference is held to the object and used even when it is not the active state.
For example, PAINTER exists as T.Tool.PainterState, which is needed so we can adjust r, and src and dest
even when the PAINTER is not the active state.
*/


T.Tool.STATES = { 
    NOTHING: "nothing",
    SPLITTER: { name:"splitter"},
    MERGER: { name:"merger"},
    PAINTER: { name:"painter"},
    GRABBER: { name: "grabber" }};
T.Tool.cState = T.Tool.STATES.NOTHING;

/* =================== GENERAL =================== */
T.TileMouseDown = function(event){
	this.clearShake();//clear any existing dragging animation
	if(T.Tool.cState == T.Tool.STATES.GRABBER) return; 
	T.CP.BringGroupToFront(this.group_num);
	if(T.Tool.cState == T.Tool.STATES.SPLITTER && (event.button == 2 || event.altKey)){
		T.Tool.TileMouseDown_ContinueSplitter.call(this,event);
	}else if(T.Tool.cState == T.Tool.STATES.NOTHING){ 
		if(event.button == 2 || event.altKey)
			T.Tool.TileMouseDown_BeginSplitter.call(this,event);
		else if (event.button == 0)
			T.Tool.TileMouseDown_BeginMerger.call(this,event);
	}
    event.preventDefault();
}


T.Tool.Swap = function(g){
    var ng = parseInt(prompt("Swap group " + g + " with:",g+""));
    if(ng >=0 && ng <= 256)
        T.ORG.GetCut().SwapBandA(g,ng);
}


T.Tool.PainterSrc_Toggle = function(g){
	if(key.shift){
		var ind = T.Tool.PainterState.srcGroups.indexOf(g);
		var newGs = T.Tool.PainterState.srcGroups.slice(0);
		if (ind == -1) {
		    newGs.push(g);
		    T.CP.BringGroupToFront(g);
		} else
		    newGs.splice(ind, 1);
		T.Tool.SetPainterSrcGroups(newGs); 
	}else{
	    T.Tool.SetPainterSrcGroups([g]);
	    T.CP.BringGroupToFront(g);
	}
}

T.Active_TileMouseMove = function(e){
	//if(T.Tool.cState === T.Tool.STATES.NOTHING)
	T.SetGroupOver(this.group_num);
}


T.Tool.TileButton_Click = function(e){
	var id = e.originalEvent.detail.id;
	if(id == 0) //too much python leads to abandoning pefectly good switch statements!
		T.Tool.Swap(this.group_num);
	else if(id == 1)
		T.Tool.SetPainterDestGroup(this.group_num);
	else if(id == 2)
		T.Tool.PainterSrc_Toggle(this.group_num);
}

// These are the only registered listeners initially, on triggering they "activate" a tool which means other listeners are 
// temporarily registerd on $tile's, $tilewall, and $document.
T.$tilewall.on({
    "mousedown": T.TileMouseDown,
    "mousemove": T.Active_TileMouseMove,
    "mouseout": function () { T.SetGroupOver(-1) },
	"buttonclick": T.Tool.TileButton_Click,
},"tile-element");


/* =================== MERGER =================== */

T.Tool.TileMouseDown_BeginMerger = function(event){
	
	var $h = $(this);
	var offset = $h.position();
	var $parent = $h.parent();
	var s = T.Tool.cState = T.Tool.STATES.MERGER;
	s.off_left= offset.left-event.clientX;
	s.off_top= offset.top-event.clientY;
	s.$h = $h;
	s.$parent = $parent;
	s.$target = null;
	s.targetOffX = null;
	s.targetOffY = null;
	s.lastClientX= event.clientX;
	s.lastClientY= event.clientY;
	s.extraBorderSize= -this.borderWidth;//we assume its got same borders all round
	$(this.placeholder).insertAfter($h);
	this.moving = true;
	s.extraBorderSize += this.borderWidth; //it's now got a different border width because it's moving
	s.$pos_overlay = $(CanvToImgStr(T.$pos_overlay.get(0),true));
	s.$pos_overlay.insertBefore(T.$pos_overlay);
	T.$tilewall.attr('tilemoving',true)
				
	//attach mousemove, mouseup handlers for document 
	// and mousemove, mouseup, mouseenter, mouseleave for all the tiles (the placeholder and moving tiles are invisible to the mouse)
	// and scroll for tilewall
	$(document).mousemove(T.Tool.DocumentMouseMove_Merger)
			   .mouseup(T.Tool.DocumentMouseUp_Merger);
	T.$tilewall.on({
	    "mouseenter mouseleave": T.Tool.TileMouseLeaveEnter_MergerTarget,
	    "mouseup": T.Tool.TileMouseUp_MergerTarget,
	    "mousemove":T.Tool.TileMouseMove_MergerTarget
	}, "tile-element")
	T.$tilewall.on("scroll", T.Tool.DocumentMouseMove_Merger);

	T.Tool.DocumentMouseMove_Merger(); //call it now to update position
}

T.Tool.DocumentMouseMove_Merger = function(event){
	var m = T.Tool.cState;
	
	m.lastClientX = event && 'clientX' in event ? event.clientX : m.lastClientX;
	m.lastClientY = event && 'clientY' in event ? event.clientY : m.lastClientY;
	
	if(m.$target)
		return;
		
	var left = m.lastClientX + m.off_left - m.extraBorderSize;
	var top = m.lastClientY + m.off_top + m.$parent.scrollTop() - m.extraBorderSize; 
	m.$h.translate(left, top);
}
T.Tool.DocumentMouseUp_Merger = function (event) {
    if (event.button != 0)
        return;
	//this happens on an abandonded merge (otherwise the target tile would intercept the event)
	T.Tool.STATES.MERGER.$h.get(0).active = false; //this is a bit of a hack 
	T.Tool.EndMerger();
}

T.Tool.EndMerger = function(){
    $(document).off('mousemove mouseup');
    T.$tilewall.off({
        "mouseenter mouseleave": T.Tool.TileMouseLeaveEnter_MergerTarget,
        "mouseup": T.Tool.TileMouseUp_MergerTarget,
        "mousemove": T.Tool.TileMouseMove_MergerTarget
    }, "tile-element");
	T.$tilewall.off("scroll");
	var s = T.Tool.STATES.MERGER;
	s.$pos_overlay.remove();
	s.$pos_overlay = null;
	s.$h.translate(null);
	var h = s.$h.get(0);
	var p = h.placeholder;
	p.parentNode.removeChild(p);
	h.placeholder = null;
	h.moving = false; //also ends proximate if it was on
	h.shake();
	T.$tilewall.removeAttr('tilemoving');
	T.Tool.cState = T.Tool.STATES.NOTHING;
}

T.Tool.TileMouseLeaveEnter_MergerTarget = function(event){
	var m = T.Tool.cState;
	if(event.type == "mouseenter"){
		m.$h.get(0).proximate = true;
		m.$target = $(this);
		var pos = m.$target.position();
		m.targetX = pos.left;
		m.targetY = pos.top;
	}else{
		m.$h.get(0).proximate = false;
		m.$target = null;
		m.targetX = null;
		m.targetY = null;
	}
}
T.Tool.TileMouseMove_MergerTarget = function(event){
	var m = T.Tool.cState;
	
	var left = m.targetX - m.extraBorderSize;
	var top = m.targetY + m.$parent.scrollTop() - m.extraBorderSize;
	m.$h.translate(left, top);
	
}
T.Tool.TileMouseUp_MergerTarget = function(event){
    //Successful merger
    if (event.button != 0)
        return;
	var ind_a = T.Tool.cState.$h.get(0).group_num;
	var ind_b = this.group_num;
	this.shake();
	if(ind_a > ind_b){
		var tmp = ind_b;
		ind_b = ind_a;
		ind_a = tmp;
	}

	T.ORG.GetCut().AddBtoA(ind_a,ind_b);	
	T.Tool.EndMerger();
	event.stopPropagation();

}


	
	
	
	
	
	
/* =================== SPLITTER =================== 
TODO: what about the user clicking undo during the split? or switching to another cut-tet-exp

state object consists of the following:
	g_a, g_b - the goup numbers for the initial group a, and the group b=a+1
	a,b - the tiles for a and b. b starts off as null.
	downOn - while mouse is down it is 'a' or 'b', indicating which of the two tiles the mouse went down on. 
				it is null when mouse is not down.
	buttonUsed - what mouse button was used for current mouse down
	cut, srcCutInds - the cut object and the cut indices for group a before the split began.
	splitDone - false until the first mouse up occurs when it becomes true.
*/

T.Tool.TileMouseDown_BeginSplitter = function(event){
	var g = this.group_num;
	var canvInfo = this.getCanvInfo(T.CANVAS_NUM_WAVE,event.pageX,event.pageY);
	if(!canvInfo)
		return;
	var cut = T.ORG.GetCut();
	var srcCutInds = cut.GetGroup(g);
	var s = T.Tool.cState = T.Tool.STATES.SPLITTER;
	s.usedCtrl = event.button != 2;
	s.g_a = g;
	s.g_b = g+1;
	s.a = this
	s.b = null;
	s.srcCutInds= srcCutInds;
	s.cut= cut;
	s.splitDone= false;
	s.downOn = 'a';
	s.buttonUsed= event.button;
	s.x = canvInfo.x;
	s.y = canvInfo.y;
	T.tiles.forEach(function(el){el.disabled = true;});
	this.disabled = false;
	this.updateCrossHair(T.CANVAS_NUM_WAVE,canvInfo.x,canvInfo.y);
	
	$(this).on("mousemove",T.Tool.TileMouseMove_Splitter);	
	T.$tilewall.on('mousedown',T.Tool.TileWallMouseDown_Splitter);
	$(document).on('mouseup',T.Tool.DocumentMouseUp_Splitter);
	T.AddCanvasUpdatedListener(T.Tool.CanvasUpdated_Splitter);
	event.stopPropagation();
}

T.Tool.TileMouseDown_ContinueSplitter = function (event) {
    event.stopPropagation();
 
	// this can be called for tile a or tile b
	var s = T.Tool.cState;
	if (s.downOn != null)
	    return;
	s.buttonUsed = event.button;
	s.downOn = this.group_num == s.g_a ? 'a' : 'b'; 
	
	// (re)attach the  mousemove and mouseup handlers (which get removed on mouseup)
	$(this).on("mousemove",T.Tool.TileMouseMove_Splitter);	
	$(document).on('mouseup',T.Tool.DocumentMouseUp_Splitter);
	
	T.Tool.TileMouseMove_Splitter.call(this,event); //update the location of the widgets
}

T.Tool.DocumentMouseUp_Splitter = function (event) {
    event.stopPropagation();
    var s = T.Tool.cState;
    if (s.downOn == null || s.buttonUsed != event.button)
        return;
	var t = s.downOn =='a' ? s.a : s.b;
	$(t).off("mousemove",T.Tool.TileMouseMove_Splitter);	
	$(document).off('mouseup',T.Tool.DocumentMouseUp_Splitter);

	var canvInfo = t.getCanvInfo(T.CANVAS_NUM_WAVE,event.pageX,event.pageY);
	
    if(!canvInfo) //when mouse up is out of range of canvas use last available x,y values
        canvInfo = {x: s.x, y:s.y,el: t.getCanv(T.CANVAS_NUM_WAVE)};
    
	var waveMouseMeaning = T.WV.MouseToVandT($(canvInfo.el),canvInfo.x,canvInfo.y); //TODO: avoid explicitly passing the canvas - that's messy.
	var splitMask = T.Tool.VIsOverThreshAtT_Splitter(s.srcCutInds,waveMouseMeaning.ch,waveMouseMeaning.t,waveMouseMeaning.v);
	if(s.splitDone)
		s.cut.ModifySplitA(splitMask); 
	else
		s.cut.SplitA(s.g_a,splitMask); 
	s.splitDone = true;
	s.downOn = null;
}

T.Tool.TileMouseMove_Splitter = function(event){
	var s = T.Tool.cState;
	var canvInfo = this.getCanvInfo(T.CANVAS_NUM_WAVE,event.pageX,event.pageY);
	if(!canvInfo)
		return;
	
	s.x = canvInfo.x;
	s.y = canvInfo.y;
	s.a.updateCrossHair(T.CANVAS_NUM_WAVE,canvInfo.x,canvInfo.y);
	
	if(s.b)
		s.b.updateCrossHair(T.CANVAS_NUM_WAVE,canvInfo.x,canvInfo.y);
	
}

T.Tool.CanvasUpdated_Splitter = function(canvasNum,$canvas,group){
	// We use this callback to deal with changes in the tiles as well as changes in the canvas within a static tile
	
	var s = T.Tool.cState;
	if(canvasNum != T.CANVAS_NUM_WAVE || !(group == s.g_a || group == s.g_b))
		return;
	
	// TODO: check whether all this makes sense...whether tiles can go astray with crosshair that they shouldnt have or missing crosshair they should have
	if(group == s.g_a){
		s.a = T.tiles[s.g_a]; //TODO: decide whether the tile can really have changed
		s.a.updateCrossHair(T.CANVAS_NUM_WAVE,s.x,s.y);
		s.a.disabled = false;
	}else{ //group == s.g_b
		s.b = T.tiles[s.g_b]; //TODO: decide whether the tile can really have changed
		s.b.updateCrossHair(T.CANVAS_NUM_WAVE,s.x,s.y);
		s.b.disabled = false;
	}
}


T.Tool.TileWallMouseDown_Splitter = function (event) {
	//This is the EndSplitter
    event.stopPropagation();
    var s = T.Tool.cState;
    if (s.downOn != null)
        return;
	
	s.a.updateCrossHair(T.CANVAS_NUM_WAVE,null);
	if(s.b)
		s.b.updateCrossHair(T.CANVAS_NUM_WAVE,null);
			
	T.tiles.forEach(function(el){el.disabled = false;});
	T.$tilewall.off('mousedown',T.Tool.TileWallMouseDown_Splitter);
	T.RemoveCanvasUpdatedListener(T.Tool.CanvasUpdated_Splitter);
	
	if(T.Tool.cState && (event.button == 2 || event.altKey))
		s.cut.Undo();
	
	T.Tool.cState = T.Tool.STATES.NOTHING;
}

T.Tool.VIsOverThreshAtT_Splitter = function(cutInds,ch,t,vThresh){
	// ch is channel, 0-3
	// t is offset 0-49
	// vThresh is voltage threshold to compare against the value in the file
	// cutInds is the usual list of indicies for spikes
		
	var isOverThresh = new Uint8Array(cutInds.length);
	var buffer = new Int8Array(T.ORG.GetTetBufferProjected());
	for (var i=0;i<cutInds.length;i++)
		isOverThresh[i] = buffer[T.PAR.BYTES_PER_SPIKE*cutInds[i] + ch*(50+4) + 4 + t]> vThresh ? 255 : 0;
	
	return isOverThresh;
}

/* =========================== */

/* ========================= PLOT-GRABBER ================== */
//TODO: this shouldnt really be in this file. it is really better grouped with main
T.Tool.$GrabIt_Css = $(
"<style>"+
".grabbable:hover:after, " +
".floatinginfo:hover:after{"+
	"position: absolute; "+
	"left:0px; top:0px; "+
	"display: block;"+
	"width: 100%;"+
	"height: 100%;"+
	"border: 3px solid #F00;"+
	"box-sizing:border-box;-moz-box-sizing:border-box;" +
	"background: rgba(255,255,255,0.5);"+
	"content: ' ';}"+
".floatinginfo:hover:after{"+
	"background: rgba(255,200,200,0.5);}"+
".grabbable, .floatinginfo{" +
	"cursor:pointer !important;}" +
"</style>");

T.$floating_layer = $('.floating_layer');

T.Tool.GrabIt = function(){
	// This whole thing is a bit of a messy hack at the moment and could do with some cleaning up.
	
	
	// clones $this into a floating info pane
	var str =  T.ORG.GetExpName();
	
	var $clone;
	if(this.tagName.toLowerCase() == "tile-element"){
		//tile-elements have a proper method for this...
		$clone = $(this.getCopyOfCanvs(true));
		str += " t" + T.ORG.GetTet() + "c" + this.group_num;//this is pretty hacky
	}else{
		$clone = $(this).clone()
		var $srcCanvs = $(this).find('canvas');
		var $destCanvs = $clone.find('canvas');
		for (var i=0;i<$srcCanvs.length;i++)
			$destCanvs[i].getContext('2d').drawImage($srcCanvs[i],0,0);	
		$clone.find('.hidden_grabbed').remove();
		if(this.id == "cluster_panel")
			str += " tet " + T.ORG.GetTet();
		$clone.toggleClass('grabbable',false)
			  .css({position:'',
					webkitTransform: '',
					width: $(this).width() + 'px',
					height: $(this).height() + 'px',
					display: 'block',
					boxShadow: 'initial'});
	}
	
	var p = $(this).offset();
	
	var $pane = $("<div class='floatinginfo grabbed_info'><div class='floating_title'>" + str + " (Grabbed)</div> </div>")
			.append($("<div class='floating_body'/>").append($clone))
			.translate(p.left +30,p.top +30)
			.show();
	
	T.$floating_layer.append($pane);
	
}

T.Tool.GrabIt_DocumentKeyDown = function(e){
	if (e.which != 32 || T.Tool.cState != T.Tool.STATES.NOTHING) 
		return;
	T.Tool.cState = T.Tool.STATES.GRABBER;
	$('head').append(T.Tool.$GrabIt_Css);
	$('body').on('mouseup','.grabbable',T.Tool.GrabIt);
	e.preventDefault();
}
T.Tool.GrabIt_DocumentKeyPress = function(e){
	if (e.which == 32 )
		e.preventDefault(); // this is needed to prevent scrolling with space
}
T.Tool.GrabIt_DocumentKeyUp = function(e){
	if (e.which != 32 || T.Tool.cState != T.Tool.STATES.GRABBER)
		return;
	T.Tool.cState = T.Tool.STATES.NOTHING;
	$('body').off('mouseup','.grabbable',T.Tool.GrabIt);
	T.Tool.$GrabIt_Css.remove();
}

$(document).on("keydown",T.Tool.GrabIt_DocumentKeyDown)
$(document).on("keyup",T.Tool.GrabIt_DocumentKeyUp)
$(document).on("keypress",T.Tool.GrabIt_DocumentKeyPress)
/* =========================== */



/* ================== CLUSTER PAINTER ========= */

//TODO: use crosshair element (with width bars removed) rather than explicitly dealing with svg here

T.Tool.UpdateCursor_Painter = (function(){
	var $el = $("<svg style='display:none;pointer-events:none;'></svg>")
					.appendTo(T.$cluster_panel);
	var cur_r = 0;
	var isShowing = false;
	
	return function(x,y,r){
		if (r == 0 || T.Tool.cState == T.Tool.STATES.GRABBER){
			if(isShowing){
				$el.hide();
				isShowing = false;
			}
		}else{
			if(r != cur_r){
				var $old = $el;
				$el = $("<svg height=" + (2*r+2) + " width=" + (2*r+2) + " style='position:absolute;left:0px;top:0px;pointer-events:none;z-index:100;' xmlns='http://www.w3.org/2000/svg' version='1.1'>"
				+ "<circle cx='" + (r+1) + "' cy='" + (r+1) + "' r='" + r + "' stroke='black' stroke-width='1' fill='none'/>"
				+ "<circle cx='" + (r+1) + "' cy='" + (r+1) + "' r='" + r + "' stroke='white' stroke-dasharray='2,2' stroke-width='1' fill='none'/>"
				+ "</svg>")	
				$old.replaceWith($el);
				cur_r = r;
			}else if(!isShowing){
				$el.show();
			}
			isShowing = true;
			$el.translate(x-r-1,y-r-1);			
		}
	}
})();

T.Tool.PAINTER_COLOR = '#003300';

T.Tool.Painter_ClusterMouseDown = function(e){
	if(T.Tool.cState != T.Tool.STATES.NOTHING)
		return; //this can happen if you press one mouse button down and then the other or if the grabber is active
		
	var offset = T.$cluster_panel.offset();
	var x = event.pageX - offset.left; 
	var y = event.pageY - offset.top + T.$cluster_panel.scrollTop();
	
	var $canvs = T.$cluster_panel.find('canvas');
	var dists = $.map($canvs,function($canvas){
		var toLeft = $canvas.offsetLeft - x;
		var toRight = x-$canvas.offsetLeft - $canvas.offsetWidth;
		var above = $canvas.offsetTop- y;
		var below = y-$canvas.offsetTop - $canvas.offsetHeight;
		
		var xDist = toLeft < 0 && toRight < 0 ? 0 :
					toLeft > 0 ? toLeft : toRight;
									   
		var yDist = above < 0 && below < 0 ? 0 :
					above > 0 ? above : below;
									   
		return xDist*xDist + yDist*yDist;
				
	})
	var s = T.Tool.cState = T.Tool.STATES.PAINTER;
	var canv_i = s.canvInd = dists.indexOf(Math.min.apply(Math,dists));
	var $c = s.$canv1 = $canvs.eq(canv_i);
	
	var b = parseFloat($c.css('margin')) + parseFloat($c.css('border-width'));
	$c.wrap($("<div style='display:inline-flex;position:relative;margin:" + b +  "px'></div>")); 
	var $c2 = s.$canv2 = $("<canvas class='cluster_canv' width=" + $c.get(0).width + " height=" + $c.get(0).height + "/>")
				.insertAfter($c)
				.css({position: 'absolute',
					left: '0px',
					opacity: '0.4'});
	
	var ctx = s.ctx = $c2.get(0).getContext('2d');
	var pos = T.Tool.Painter_GetXY(e);
	s.prevX = pos.x;
	s.prevY = pos.y;
	s.isNegative = (event.button == 2 || event.altKey);
	s.buttonUsed = event.button;
    if (s.isNegative){
        ctx.fillStyle=T.Tool.PAINTER_COLOR;
        ctx.fillRect(0,0,$c.get(0).width,$c.get(0).height);
        ctx.globalCompositeOperation = "destination-out";
    }
    T.Tool.Painter_ClusterMouseMove(event);
	$(document).on("mouseup", T.Tool.Painter_DocumentMouseUp);
}
T.Tool.Painter_GetXY = function(e){
    var $c2 = T.Tool.cState.$canv2;
    var offset = $c2.offset();
    var scale = $c2.get(0).width / $c2.width();
    return {
            x: (e.pageX - offset.left)*scale,
	        y: (e.pageY - offset.top /*+ T.$cluster_panel.scrollTop()*/)*scale
    };
}

T.Tool.SetPainterDestGroup = function(g){
	if (g==-1){
		g = T.Tool.PainterState.destGroup + 1;
		//TODO: want this to mean assign to unused group rather than enxt group.
	}
	T.$painter_dest.text(g)
				   .css({backgroundColor: T.PALETTE_FLAG_CSS[g],
											color: T.PALETTE_FLAG_CSS_TEXT[g]})
				   .attr('data-group',g); //use proper data attr to match stickers in src and other categories.
	T.Tool.PainterState.destGroup = g;
	var c = T.ORG.GetCut();
	if(c){
		c.GetExtraStuff().painterDest = g;
		T.Tool.ClusterOthersUpdate(c);
	}
}

T.Tool.SetPainterSrcGroups = function(gs){
	var str = [];
	for(var i=0;i<gs.length;i++)
		str.push("<div class='cluster-sticker'  data-group='" + gs[i] + "' style='background: " 
					+ T.PALETTE_FLAG_CSS[gs[i]] + "; color:" + T.PALETTE_FLAG_CSS_TEXT[gs[i]] 
					+ "'>" + gs[i] + "</div>");
	T.$painter_src.html(str.join(""));
	T.Tool.PainterState.srcGroups = gs;
	var c = T.ORG.GetCut();
	if(c){
		c.GetExtraStuff().painterSrc = gs;
		T.Tool.ClusterOthersUpdate(c);
	}
}

T.Tool.ClusterOthersUpdate = function(c){
	var gs = c.GetGroupList();
	var str = [];
	for(var i=0;i<gs.length;i++)if(!(T.Tool.PainterState.destGroup == gs[i] || T.Tool.PainterState.srcGroups.indexOf(gs[i])>-1))
		str.push("<div class='cluster-sticker' data-group='" + gs[i] + "' style='background: " 
					+ T.PALETTE_FLAG_CSS[gs[i]] + "; color:" + T.PALETTE_FLAG_CSS_TEXT[gs[i]] 
					+ "'>" + gs[i] + "</div>");
	T.$cluster_others.html(str.join(""));
}

T.Tool.ClusterPlotChangeCallback = function(invalidatedSlots_,isNew){
	if(isNew){
		var extra = this.GetExtraStuff();
		T.Tool.SetPainterSrcGroups( 'painterSrc' in extra ? extra.painterSrc : [0])
		T.Tool.SetPainterDestGroup( 'painterDest' in extra ? extra.painterDest : 1)
	}
	T.Tool.ClusterOthersUpdate(this);
}


T.Tool.PainterState = T.Tool.STATES.PAINTER;
T.Tool.PainterState.r = 20;
T.ORG.AddCutChangeCallback(T.Tool.ClusterPlotChangeCallback);
T.Tool.SetPainterDestGroup(1);
T.Tool.SetPainterSrcGroups([0]);

T.Tool.Painter_DocumentMouseUp = function (e) {
    var s = T.Tool.cState;
    if (e.button != s.buttonUsed)
        return;
    var $c2 = s.$canv2;    
    var rgbaData = s.ctx.getImageData(0,0,$c2.get(0).width,$c2.get(0).height).data;
    var mask = new Uint8Array(rgbaData.length/4);
    for(var i=0;i<mask.length;i++)
        mask[i] = rgbaData[i*4 +3]; //reduce rgba data to just alpha, which tells us what is non-transparent.
        
    var $c = s.$canv1;    
	$c.parent().replaceWith($c);
	s.$canv1 = undefined;
	s.$canv2 = undefined;
	$(document).off("mouseup",T.Tool.Painter_DocumentMouseUp);
    var splitMasks = T.CP.ClusterMaskToSpikeMask(mask,s.canvInd,s.srcGroups);
    var cut = T.ORG.GetCut();
    cut.TransplantFromAsToB(s.srcGroups, splitMasks, s.destGroup);
    T.Tool.cState = T.Tool.STATES.NOTHING;
}

T.Tool.Painter_ClusterMouseMove = function (event) {
    var s = T.Tool.PainterState;
	var offset = T.$cluster_panel.offset();
	var x = event.pageX - offset.left; 
	var y = event.pageY - offset.top + T.$cluster_panel.scrollTop();
	var $oldSvg = s.$svg;
    T.Tool.UpdateCursor_Painter(x,y,s.r);
	
	var $c2 = s.$canv2;
	if($c2){
		//TODO: currently doesn't work when this is called via scroll
        var pos = T.Tool.Painter_GetXY(event);
        var $c2 = s.$canv2; 
        var scale = $c2.get(0).width / $c2.width();

		var ctx = s.ctx
		ctx.beginPath();
		ctx.lineWidth = s.r*2*scale;
		ctx.strokeStyle = T.Tool.PAINTER_COLOR;
		ctx.lineCap = 'round';
		ctx.moveTo(s.prevX, s.prevY);
		ctx.lineTo(pos.x, pos.y);
		ctx.stroke();
		ctx.closePath();
		s.prevX = pos.x;
		s.prevY = pos.y;
	}
}

T.Tool.Painter_ClusterMouseLeave = function (e) {
	T.Tool.UpdateCursor_Painter(0,0,0);
}

T.Tool.Painter_ClusterMouseWheel = function (e) {
    var s = T.Tool.PainterState;
	s.r += e.deltaY * 3;
	s.r = s.r < 3 ? 3 :
			s.r > 39 ? 39 : s.r;
	
	T.Tool.Painter_ClusterMouseMove(e);
	e.preventDefault();
}

T.$cluster_panel.on({
    "mousemove": T.Tool.Painter_ClusterMouseMove,
    "mouseleave": T.Tool.Painter_ClusterMouseLeave,
    "mousewheel": T.Tool.Painter_ClusterMouseWheel,
    "mousedown": T.Tool.Painter_ClusterMouseDown
});

/* =========================== */





