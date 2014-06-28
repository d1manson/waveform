"use strict";


T.PROXIMITY = 30;
T.TILE_MOVING_BORDER_WIDTH = 10;
T.WIDGET_CENTRE_RAD = 10;
T.SEPARATOR_MOUSE_DOWN_TIMER_MS = 100;

// T.Tool.cState will hold one of the following values
// Where the value is an object it may have further properties relating to that particular type of state.
// In some cases, a reference is held to the object and used even when it is not the active state.
//  For example, PAINTER exists as T.Tool.PainterState, which is needed so we can adjust r, and src and dest
// even when the PAINTER is not the active state.
T.Tool.STATES = { 
    NOTHING: "nothing",
    SPLITTER: { name:"splitter"},
    MERGER: { name:"merger"},
    PAINTER: { name:"painter"},
    GRABBER: { name: "grabber" }};
T.Tool.cState = T.Tool.STATES.NOTHING;

/* =================== GENERAL =================== */
T.TileMouseDown = function(event){
	$(this).toggleClass('shake',false); //clear any existing dragging animation
	if(T.Tool.cState == T.Tool.STATES.GRABBER) return; 
	T.CP.BringGroupToFront($(this).data("group_num"))
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

T.TileDoubleClick = function(event){
	$(this).toggleClass('shake',false); //clear the failed dragging animation from the second mouse down event
	
	T.TileDoubleClick_BeginSeparator.call(this,event);
}

T.Tool.Button_Swap = function(event){
    var g = $(this).parent().parent().parent().data('group_num');
    T.Tool.Swap(g);
}

T.Tool.Swap = function(g){
    var ng = parseInt(prompt("Swap group " + g + " with:",g+""));
    if(ng >=0 && ng <= 256)
        T.ORG.GetCut().SwapBandA(g,ng);
}

T.Tool.Button_PainterDest = function(event){
	var g = $(this).parent().parent().parent().data('group_num');
	T.Tool.SetPainterDestGroup(g);
}

T.Tool.Button_PainterSrc = function(event){
	var g = $(this).parent().parent().parent().data('group_num');
	
	T.Tool.PainterSrc_Toggle(g);
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
	var g = $(this).data('group_num');
	T.SetGroupOver(g);
}
// These are the only registered listeners initially, on triggering they "activate" a tool which means other listeners are 
// temporarily registerd on $tile's, $tilewall, and $document.
T.$tilewall.on({
    "mousedown": T.TileMouseDown,
    "dblclick": T.TileDoubleClick,
    "mousemove": T.Active_TileMouseMove,
    "mouseout": function () { T.SetGroupOver(-1) }
},".tile");

T.Tool.StopProgagation = function(e){e.stopPropagation();}

T.$tilewall.on("click",".tile-button-swap",T.Tool.Button_Swap); 
T.$tilewall.on("click",".tile-button-dest",T.Tool.Button_PainterDest); 
T.$tilewall.on("click",".tile-button-src",T.Tool.Button_PainterSrc); 
T.$tilewall.on("mousedown",'.tile-buttons',T.Tool.StopProgagation);


/* =================== MERGER =================== */

T.Tool.TileMouseDown_BeginMerger = function(event){
	
	var $h = $(this);
	var offset = $h.position();
	var $parent = $h.parent();
	var $p = $h.clone().attr('placeholder', true);
	var s = T.Tool.cState = T.Tool.STATES.MERGER;
	s.off_left= offset.left-event.clientX;
	s.off_top= offset.top-event.clientY;
	s.$h= $h;
	s.$parent= $parent;
	s.$placeholder= $p;
	s.$target= null;
	s.targetOffX= null;
	s.targetOffY= null;
	s.extraBorderSize= -parseInt($h.css("border-left-width"));//we assume its got same borders all round
	s.lastClientX= event.clientX;
	s.lastClientY= event.clientY;
	
	$p.insertAfter($h);
	$h.css({position:'absolute'})
	  .attr("moving",true); //among other things this means it no longer gets mouse events
	s.extraBorderSize += parseInt($h.css("border-left-width")); //border size should change when we apply the moving attribute
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
	}, ".tile")
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
	T.Tool.EndMerger();
}

T.Tool.EndMerger = function(){
    $(document).off('mousemove mouseup');
    T.$tilewall.off({
        "mouseenter mouseleave": T.Tool.TileMouseLeaveEnter_MergerTarget,
        "mouseup": T.Tool.TileMouseUp_MergerTarget,
        "mousemove": T.Tool.TileMouseMove_MergerTarget
    }, ".tile");
	T.$tilewall.off("scroll");
	T.Tool.cState.$placeholder.remove();
	T.Tool.cState.$h.translate(null)
                    .css({position:'relative'})
					.removeAttr('moving')
					.toggleClass('shake',true)
					.removeAttr('proximate');
	T.$tilewall.removeAttr('tilemoving');
	T.Tool.cState = T.Tool.STATES.NOTHING;
}

T.Tool.TileMouseLeaveEnter_MergerTarget = function(event){
	var m = T.Tool.cState;
	if(event.type == "mouseenter"){
		m.$h.attr("proximate",true);
		m.$target = $(this);
		var pos = m.$target.position();
		m.targetX = pos.left;
		m.targetY = pos.top;
	}else{
		m.$h.removeAttr("proximate");
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
	var ind_a = T.Tool.cState.$h.data("group_num");
	var ind_b = $(this).toggleClass('shake',true)
					   .data("group_num");
	if(ind_a > ind_b){
		var tmp = ind_b;
		ind_b = ind_a;
		ind_a = tmp;
	}

	T.ORG.GetCut().AddBtoA(ind_a,ind_b);	
	T.Tool.EndMerger();
	event.stopPropagation();

}


	
	
	
	
	
	
/* =================== SPLITTER =================== */
//TODO: what about the user clicking undo during the split?
	
T.Tool.TileMouseDown_BeginSplitter = function(event){

	var $this = $(this);
	var g = $this.data('group_num');
	var $waveCanvas = $this.find('canvas').eq(T.CANVAS_NUM_WAVE);

	var offset = $waveCanvas.offset(); 
	var x = event.pageX - offset.left;
	var y = event.pageY - offset.top;
	var w = $waveCanvas.width();
	if (x > w) //TODO: what about y?
		return; //didn't actually click the canvas
		
	var pos = $waveCanvas.position();
	var cut = T.ORG.GetCut();
	var srcCutInds = cut.GetGroup(g);
	
	var $svg_a = $(T.Tool.MakeSVGStr_Splitter(x,y,w,pos.left,pos.top));
	var s = T.Tool.cState = T.Tool.STATES.SPLITTER;
	s.usedCtrl = event.button != 2;
	s.a= g;
	s.b= g+1;
	s.srcCutInds= srcCutInds;
	s.$svg_a= $svg_a;
	s.$svg_b= null;
	s.$a= $waveCanvas; //TODO: on all events need to test if $(this) is the parent of $a or $b, or neither (if we've updated the canvas, possibly even due to changing the view or something)
	s.$b= null;
	s.cut= cut;
	s.splitDone= false;
	s.downOn= 'a';
	s.buttonUsed= event.button;
	
	
	$.each(T.tiles,function(){this.$.attr('disabled','true');})
	T.tiles[g].$.removeAttr('disabled')
				.attr('splitting','true')
				.append($svg_a)
				.on("mousemove",T.Tool.TileMouseMove_Splitter);	
	T.$tilewall.on('mousedown',T.Tool.TileWallMouseDown_Splitter);
	$(document).on('mouseup',T.Tool.DocumentMouseUp_Splitter);
	T.AddCanvasUpdatedListener(T.Tool.CanvasUpdated_Splitter);
	event.stopPropagation();
}

T.Tool.TileMouseDown_ContinueSplitter = function (event) {
    event.stopPropagation();
 
	// this can be called for tile a or tile b
	var $this = $(this);
	var s = T.Tool.cState;
	if (s.downOn != null)
	    return;
	s.buttonUsed = event.button;
	s.downOn = $this.data('group_num') == s.a ? 'a' : 'b'; 
	
	// (re)attach the  mousemove and mouseup handlers (which get removed on mouseup)
	$this.on("mousemove",T.Tool.TileMouseMove_Splitter);	
	$(document).on('mouseup',T.Tool.DocumentMouseUp_Splitter);
	
	T.Tool.TileMouseMove_Splitter.call(this,event); //update the location of the widgets
}

T.Tool.DocumentMouseUp_Splitter = function (event) {
    event.stopPropagation();
    var s = T.Tool.cState;
    if (s.downOn == null || s.buttonUsed != event.button)
        return;
	T.tiles[s.downOn=='a' ? s.a : s.b].$.off("mousemove",T.Tool.TileMouseMove_Splitter);	
	$(document).off('mouseup',T.Tool.DocumentMouseUp_Splitter);
	
	var $canv = s.downOn=='a' ? s.$a : s.$b;
	var offset = $canv.offset(); 
	var pos = $canv.position();
	var x = event.pageX - offset.left;
	var y = event.pageY - offset.top;
	var waveMouseMeaning = T.WV.MouseToVandT($canv,x,y);
	var splitMask = T.Tool.VIsOverThreshAtT_Splitter(s.srcCutInds,waveMouseMeaning.ch,waveMouseMeaning.t,waveMouseMeaning.v);
	if(s.splitDone)
		s.cut.ModifySplitA(splitMask); 
	else
		s.cut.SplitA(s.a,splitMask); 
	s.splitDone = true;
	s.downOn = null;
}

T.Tool.TileMouseMove_Splitter = function(event){
	var s = T.Tool.cState;
	
	var offset = (s.downOn=='a' ? s.$a : s.$b).offset(); 
	var x = event.pageX - offset.left;
	var y = event.pageY - offset.top;
	
	var pos = s.$a.position();
	var w = s.$a.width();
	var $svg_a = $(T.Tool.MakeSVGStr_Splitter(x,y,w,pos.left,pos.top));
	s.$svg_a.replaceWith($svg_a);
	s.$svg_a = $svg_a;

	if(s.$svg_b){
		var $svg_b = $svg_a.clone();
		s.$svg_b.replaceWith($svg_b);
		s.$svg_b = $svg_b; //TODO: in theory canvas sizes could be different and thus require different svg
	}
}

T.Tool.CanvasUpdated_Splitter = function(canvasNum,$canvas,group){
	// We use this callback to deal with changes in the tiles as well as changes in the canvas within a static tile
	
	var s = T.Tool.cState;
	if(canvasNum != T.CANVAS_NUM_WAVE || !(group == s.a || group == s.b))
		return;
	
	// Note that hopefully by moving around the $svg's means that even if tiles moved around the svgs will always end up on only the correct tiles.
	if(group == s.a){
		//TODO: ought to recreate svg in case of new size of canvas
		T.tiles[s.a].$.prepend(s.$svg_a)
					  .attr('splitting','true');
		s.$a = $canvas;
	}else{ //group == s.b
		if(!s.$svg_b){
			s.$svg_b = s.$svg_a.clone(); //TODO: in theory canvas sizes could be different and thus require different svg
			T.tiles[s.b].$.removeAttr('disabled');
		}
		T.tiles[s.b].$.prepend(s.$svg_b)
					   .attr('splitting','true');
		
		s.$b = $canvas;
	}
}

T.Tool.MakeSVGStr_Splitter = function(x,y,w,left,top){
	
	return "<svg style='position:absolute;left:" + left + "px;top:" + top + "px;' xmlns='http://www.w3.org/2000/svg' version='1.1'>"
				+ "<circle cx='" + x + "' cy='" + y + "' r='6' stroke='black' stroke-width='1' fill='none'/>"
				+ "<line x1='" + 0 + "' y1='" + y + "' x2='" + (x-6) + "' y2='" + y + "' stroke='black' stroke-width='1'/>"
				+ "<line x1='" + w + "' y1='" + y + "' x2='" + (x+6) + "' y2='" + y + "' stroke='black' stroke-width='1'/>"
				+ "<circle cx='" + x + "' cy='" + y + "' r='6' stroke='white' stroke-dasharray='2,2' stroke-width='1' fill='none'/>"
				+ "<line x1='" + 0 + "' y1='" + y + "' x2='" + (x-6) + "' y2='" + y + "' stroke='white' stroke-dasharray='2,2' stroke-width='1'/>"
				+ "<line x1='" + w + "' y1='" + y + "' x2='" + (x+6) + "' y2='" + y + "' stroke='white' stroke-dasharray='2,2' stroke-width='1'/>"
				+ "</svg>";
	
}

T.Tool.TileWallMouseDown_Splitter = function (event) {
    event.stopPropagation();
    var s = T.Tool.cState;
    if (s.downOn != null)
        return;
	s.$svg_a.remove();
	if(s.$svg_b)
		s.$svg_b.remove(); 
	
	T.tiles[s.a].$.removeAttr('splitting');
	T.tiles[s.b].$.removeAttr('splitting');
	
	$.each(T.tiles,function(){this.$.removeAttr('disabled');});
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
	"content: ' ';"+
	"cursor:pointer !important;}"+
".floatinginfo:hover:after{"+
	"background: rgba(255,200,200,0.5);}"+
"</style>");

T.$floating_layer = $('.floating_layer');

T.Tool.GrabIt = function(){
	// clones $this into a floating info pane
	var $clone = $(this).clone()
	var $srcCanvs = $(this).find('canvas');
	var $destCanvs = $clone.find('canvas');
	for (var i=0;i<$srcCanvs.length;i++)
		$destCanvs[i].getContext('2d').drawImage($srcCanvs[i],0,0);	
	$clone.toggleClass('grabbable',false).css({position:'',
												webkitTransform: '',
												width: $(this).width() + 'px',
												height: $(this).height() + 'px',
												display: 'block',
												boxShadow: 'initial'});
	var p = $(this).offset();
	var $pane = $("<div class='floatinginfo grabbed_info'><div class='floating_title'>" + T.ORG.GetExpName() + " (Grabbed)</div> </div>")
			.append($("<div class='floating_body'/>").append($clone))
			.translate(p.left +30,p.top +30)
			.show();
	
	T.$floating_layer.append($pane);
	
}

T.Tool.GrabIt_DocumentKeyDown = function(e){
	if (e.which != 32 || T.Tool.cState == T.Tool.STATES.GRABBER)
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
	if (e.which != 32)
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


T.Tool.MakeSVGStr_Painter = function(x,y,r){
	if (r== 0 || T.Tool.cState == T.Tool.STATES.GRABBER)
		return "<svg style='display:none;pointer-events:none;'></svg>";
	else
		return "<svg height=" + (y+r+3) + " style='position:absolute;left:0px;top:0px;pointer-events:none;z-index:100;' xmlns='http://www.w3.org/2000/svg' version='1.1'>"
				+ "<circle cx='" + x + "' cy='" + y + "' r='" + r + "' stroke='black' stroke-width='1' fill='none'/>"
				+ "<circle cx='" + x + "' cy='" + y + "' r='" + r + "' stroke='white' stroke-dasharray='2,2' stroke-width='1' fill='none'/>"
				+ "</svg>";
	
}

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
T.Tool.PainterState.$svg = $(T.Tool.MakeSVGStr_Painter(0, 0, 0)).appendTo(T.$cluster_panel);
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
    s.$svg = $(T.Tool.MakeSVGStr_Painter(x,y,s.r));
	$oldSvg.replaceWith(s.$svg);
	
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
    var s = T.Tool.PainterState;
	var $oldSvg = s.$svg;
	s.$svg  = $(T.Tool.MakeSVGStr_Painter(0,0,0));
	$oldSvg.replaceWith(s.$svg);
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


/* ========================= SEPARATOR ================== 
T.TileDoubleClick_BeginSeparator = function(event){
	var $h = $(this);

	var c = T.ORG.GetCut();
	var g = $h.data("group_num");
	var cut_g = c.GetGroup(g);
	var n_1 = Math.floor(cut_g.length/2);
	var n_2 = Math.ceil(cut_g.length/2);
	c.SplitA(g,T.Tool.SeparatorMakeMask(n_1,n_2));

	$.each(T.tiles,function(){this.$.attr('disabled','true');})
    var $separator_first = $("<div class='separator_half' />")
                            .on("mousedown",function(e){return T.Tool.SeparatorMouseUpDown(e,true,true)})
                            .on("mouseup",function(e){return T.Tool.SeparatorMouseUpDown(e,false,true)});
    var $separator_second = $("<div class='separator_half' />")
                            .on("mousedown",function(e){return T.Tool.SeparatorMouseUpDown(e,true,false)})
                            .on("mouseup",function(e){return T.Tool.SeparatorMouseUpDown(e,false,false)});
	T.tiles[g].$.attr('separating','true')
                .wrap($separator_first);
	T.tiles[g+1].$.attr('separating','true')
                .wrap($separator_second);
	T.$rt.mousedown(T.Tool.TileWallMouseDown_Separating);
    T.Tool.separating = {g:g,n_1:n_1,n_2:n_2,increment:1,isFirst:NaN,timer:null};
}

T.Tool.SeparatorMakeMask = function(n_1,n_2){
	var mask = new Uint8Array(n_1+n_2);
	for(var i=n_1;i<n_1+n_2;i++)
		mask[i] = 1;
	return mask;
}
T.Tool.SeparatorMouseUpDown = function(event,isDown,isFirst){
    event.stopPropagation();
   //isDown is false for up events, isFirst is false when the second separator is the source
   var s = T.Tool.separating;
	if(isDown){
		//mouse down: start timer and run first iteration
		s.isFirst = isFirst;
		s.increment = 1;
		s.timer = setInterval(T.Tool.SeparatorMouseDownTick,T.SEPARATOR_MOUSE_DOWN_TIMER_MS);
		T.Tool.SeparatorMouseDownTick();
	}else{
		//mouse up: apply new n values
		clearInterval(s.timer);
		s.isFirst = NaN;
		s.timer = null;	
		var c = T.ORG.GetCut();
		c.Undo();
		c.SplitA(s.g,T.Tool.SeparatorMakeMask(s.n_1,s.n_2));
	}
 
}
T.Tool.SeparatorMouseDownTick = function(){
	var s = T.Tool.separating;
	if(s.isFirst){
		s.n_1 += s.increment;
		s.n_2 -= s.increment;
		if (s.n_2 < 1){
			s.n_1 += s.n_2 - 1;
			s.n_2 = 1;
		}
	}else{
		s.n_1 -= s.increment;
		s.n_2 += s.increment;
		if (s.n_1 < 1){
			s.n_2 += s.n_1 - 1;
			s.n_1 = 1;
		}
	}
	s.increment += 8;
	s.increment = s.increment > 800 ? 800 : Math.round(s.increment);

	T.tiles[s.g].caption.text("group " + s.g + " | " + s.n_1 + " waves ");
	T.tiles[s.g+1].caption.text("group " + (s.g+1) + " | " + s.n_2 + " waves ");
}

T.Tool.TileWallMouseDown_Separating = function(event){
		//this is the only way to end the separating tool
		
		T.$tilewall.off('mousedown');
        T.tiles[g].$.removeAttr('separating')
                                     .unwrap();
        T.tiles[g+1].$.removeAttr('separating')
                                     .unwrap();
        $.each(T.tiles,function(){this.$.removeAttr('disabled');});
		clearInterval(T.Tool.separating.timer);
        delete T.Tool.separating;
        
        if(event.button == 2 || event.altKey)
            T.ORG.GetCut().Undo();
}
	
	
	*/



