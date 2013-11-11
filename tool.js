"use strict";


T.PROXIMITY = 30;
T.TILE_MOVING_BORDER_WIDTH = 10;
T.WIDGET_CENTRE_RAD = 10;
T.SEPARATOR_MOUSE_DOWN_TIMER_MS = 100;

/* =================== GENERAL =================== */
T.TileMouseDown = function(event){
	$(this).toggleClass('shake',false); //clear any existing dragging animation
	T.CP.BringGroupToFront($(this).data("group_num"))
	if(T.Tool.activeSplitter && (event.button == 2 || event.altKey)){
		T.Tool.TileMouseDown_ContinueSplitter.call(this,event);
	}else{ 
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

// These are the only registered listeners initially, on triggering they "activate" a tool which means other listeners are 
// temporarily registerd on $tile's, $tilewall, and $document.
T.$tilewall.on("mousedown",".tile",T.TileMouseDown); 
T.$tilewall.on("dblclick",".tile",T.TileDoubleClick); 



/* =================== MERGER =================== */

T.Tool.TileMouseDown_BeginMerger = function(event){
	
	var $h = $(this);
	var offset = $h.position();
	var $parent = $h.parent();
	var $p = $h.clone().attr('placeholder',true);
	T.Tool.activeMerger = { off_left: offset.left-event.clientX,
							off_top: offset.top-event.clientY,
							$h: $h,
							$parent: $parent,
							$placeholder: $p,
							$target: null,
							targetOffX: null,
							targetOffY: null,
							extraBorderSize: -parseInt($h.css("border-left-width")),//we assume its got same borders all round
							lastClientX: event.clientX,
							lastClientY: event.clientY};
	$p.insertAfter($h);
	$h.css({position:'absolute'})
	  .attr("moving",true); //among other things this means it no longer gets mouse events
	T.Tool.activeMerger.extraBorderSize += parseInt($h.css("border-left-width")); //border size should change when we apply the moving attribute
	T.$tilewall.attr('tilemoving',true)
				
	//attach mousemove, mouseup handlers for document 
	// and mousemove, mouseup, mouseenter, mouseleave for all the tiles (the placeholder and moving tiles are invisible to the mouse)
	// and scroll for tilewall
	$(document).mousemove(T.Tool.DocumentMouseMove_Merger)
			   .mouseup(T.Tool.DocumentMouseUp_Merger);
	$.each(T.tiles, function(){
						this.$.on("mouseenter mouseleave",T.Tool.TileMouseLeaveEnter_MergerTarget)
							  .on("mouseup",T.Tool.TileMouseUp_MergerTarget)
							  .on("mousemove",T.Tool.TileMouseMove_MergerTarget);	
					 });
	T.$tilewall.on("scroll",T.Tool.DocumentMouseMove_Merger);
	
	T.Tool.DocumentMouseMove_Merger(); //call it now to update position

}

T.Tool.DocumentMouseMove_Merger = function(event){
	var m = T.Tool.activeMerger;
	
	m.lastClientX = event && 'clientX' in event ? event.clientX : m.lastClientX;
	m.lastClientY = event && 'clientY' in event ? event.clientY : m.lastClientY;
	
	if(m.$target)
		return;
		
	var left = m.lastClientX + m.off_left - m.extraBorderSize;
	var top = m.lastClientY + m.off_top + m.$parent.scrollTop() - m.extraBorderSize;
	T.Tool.activeMerger.$h.translate(left, top);
}
T.Tool.DocumentMouseUp_Merger = function(event){
	//this happens on an abandonded merge (otherwise the target tile would intercept the event)
	T.Tool.EndMerger();
}

T.Tool.EndMerger = function(){
	$(document).off('mousemove mouseup');
	$.each(T.tiles, function(){this.$.off("mouseenter mouseleave mouseup mousemove")});
	T.$tilewall.off("scroll");
	T.Tool.activeMerger.$placeholder.remove();
	T.Tool.activeMerger.$h.translate(null)
                    .css({position:'relative'})
					.removeAttr('moving')
					.toggleClass('shake',true)
					.removeAttr('proximate');
	T.$tilewall.removeAttr('tilemoving');
	delete T.Tool.activeMerger;
}

T.Tool.TileMouseLeaveEnter_MergerTarget = function(event){
	var m = T.Tool.activeMerger;
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
	var m = T.Tool.activeMerger;
	
	var left = m.targetX - m.extraBorderSize;
	var top = m.targetY + m.$parent.scrollTop() - m.extraBorderSize;
	m.$h.translate(left, top);
	
}
T.Tool.TileMouseUp_MergerTarget = function(event){
	//Successful merger
	var ind_a = T.Tool.activeMerger.$h.data("group_num");
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
	
	T.Tool.activeSplitter = {usedCtrl: event.button != 2,
							 a: g,
							 b: g+1,
							 srcCutInds: srcCutInds,
							 $svg_a: $svg_a,
							 $svg_b: null,
							 $a: $waveCanvas, //TODO: on all events need to test if $(this) is the parent of $a or $b, or neither (if we've updated the canvas, possibly even due to changing the view or something)
							 $b: null,
							 cut: cut,
							 splitDone: false,
							 downOn: 'a'};

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

T.Tool.TileMouseDown_ContinueSplitter = function(event){
	// this can be called for tile a or tile b
	var $this = $(this);
	var s = T.Tool.activeSplitter;
	s.downOn = $this.data('group_num') == s.a ? 'a' : 'b'; 
	
	// (re)attach the  mousemove and mouseup handlers (which get removed on mouseup)
	$this.on("mousemove",T.Tool.TileMouseMove_Splitter);	
	$(document).on('mouseup',T.Tool.DocumentMouseUp_Splitter);
	
	T.Tool.TileMouseMove_Splitter.call(this,event); //update the location of the widgets
	event.stopPropagation();
}

T.Tool.DocumentMouseUp_Splitter = function(event){
	var s = T.Tool.activeSplitter;
	T.tiles[s.downOn=='a' ? s.a : s.b].$.off("mousemove",T.Tool.TileMouseMove_Splitter);	
	$(document).off('mouseup',T.Tool.DocumentMouseUp_Splitter);
	event.stopPropagation();
	
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
	var s = T.Tool.activeSplitter;
	
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
	
	var s = T.Tool.activeSplitter;
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

T.Tool.TileWallMouseDown_Splitter = function(event){
	var s = T.Tool.activeSplitter;
	s.$svg_a.remove();
	if(s.$svg_b)
		s.$svg_b.remove(); 
	
	T.tiles[s.a].$.removeAttr('splitting');
	T.tiles[s.b].$.removeAttr('splitting');
	
	$.each(T.tiles,function(){this.$.removeAttr('disabled');});
	T.$tilewall.off('mousedown',T.Tool.TileWallMouseDown_Splitter);
	T.RemoveCanvasUpdatedListener(T.Tool.CanvasUpdated_Splitter);
	
	if(T.Tool.activeSplitter && (event.button == 2 || event.altKey))
		s.cut.Undo();
	
	T.Tool.activeSplitter = null;
	event.stopPropagation();
}

T.Tool.VIsOverThreshAtT_Splitter = function(cutInds,ch,t,vThresh){
	// ch is channel, 0-3
	// t is offset 0-49
	// vThresh is voltage threshold to compare against the value in the file
	// cutInds is the usual list of indicies for spikes
		
	var isOverThresh = new Uint8Array(cutInds.length);
	var buffer = new Int8Array(T.ORG.GetTetBuffer());
	for (var i=0;i<cutInds.length;i++)
		isOverThresh[i] = buffer[T.PAR.BYTES_PER_SPIKE*cutInds[i] + ch*(50+4) + 4 + t]> vThresh ? 255 : 0;
	
	return isOverThresh;
}

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



