"use strict";


T.PROXIMITY = 30;
T.TILE_MOVING_BORDER_WIDTH = 10;
T.WIDGET_CENTRE_RAD = 10;
T.SEPARATOR_MOUSE_DOWN_TIMER_MS = 100;

/* =================== GENERAL =================== */
T.TileMouseDown = function(event){
	$(this).toggleClass('shake',false); //clear any existing dragging animation
	
	if(event.button == 2 || event.ctrlKey)
		T.Tool.TileMouseDown_BeginSplitter.call(this,event);
	else if (event.button == 0)
		T.Tool.TileMouseDown_BeginMerger.call(this,event);

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
	T.Tool.activeMerger.$h.css({left: left+'px', top:top+'px'});
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
	T.Tool.activeMerger.$h.css({left: '',top:'',position:''})
					.removeAttr('moving')
					.toggleClass('shake',true)
					.removeAttr('proximate')
					.find('canvas').eq(0).css({position: '',left: '',top: ''});
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
	m.$h.css({left: left+'px', top: top + 'px'});
	//TODO: snap waveforms together
	
	/* relevant old code ... I think?
	T.Tool.activeMerger.target = null;
	var pos = T.Tool.activeMerger.allTilePositions;
	for(var i = 0;i<pos.length;i++) if(pos[i])
		if(Math.abs(pos[i].left-left-T.TILE_MOVING_BORDER_WIDTH) < T.PROXIMITY && Math.abs(pos[i].top-top-T.TILE_MOVING_BORDER_WIDTH) < T.PROXIMITY){
			T.Tool.activeMerger.target = i;
			T.tiles[i].toggleClass('shake',false); //clear this so that it's ready to be reused if we merge
			T.Tool.activeMerger.$h.attr('proximate',true);
			T.Tool.activeMerger.$h.find('canvas').eq(0).css({
								position: 'relative',
								left: pos[i].left-left-T.TILE_MOVING_BORDER_WIDTH + 'px', 
								top: pos[i].top-top-T.TILE_MOVING_BORDER_WIDTH + 'px'});
			return;
		}
	*/
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


	
/* ========================= SEPARATOR ================== */
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
        
        if(event.button == 2 || event.ctrlKey)
            T.ORG.GetCut().Undo();
}
	
	
	
	
	
	
	
	
/* =================== SPLITTER =================== */
T.Tool.GetSplitter = function($tile){
	var $w = $tile.find('.widget').eq(0);
	if(!$w.length){
		$w = $("<div class='widget'><div class='widget-center'></div></div>");
		$w.mouseup(T.Tool.SplitterMouseUp);
		$tile.append($w);
	}
	return $w;
}

T.Tool.SplitterMouseUp = function(event){
	if(T.Tool.activeSplitter && event.button == 2 || T.Tool.activeSplitter.usedCtrl){
		T.Tool.activeSplitter.$h.remove();
		$(document).off('mousemove mouseup');
		delete T.Tool.activeSplitter;
	}
}

T.Tool.TileMouseDown_BeginSplitter = function(event){
	var offset = $(this).offset();
	var $h = T.Tool.GetSplitter($(this));
	T.Tool.activeSplitter = {usedCtrl: event.button != 2,
					off_left:  -offset.left,
					off_top:  -offset.top,
					$h: $h};

	$h.toggleClass("widget-moving",true)
	   .mousemove(T.Tool.SplitterMouseMove);
	$(document).mousemove(T.Tool.SplitterMouseMove)
			   .mouseup(T.Tool.SplitterMouseUp);
	T.Tool.SplitterMouseMove(event);
}

T.Tool.SplitterMouseMove = function(event){
	if(T.Tool.activeSplitter){
		var left = event.pageX+ T.Tool.activeSplitter.off_left - T.WIDGET_CENTRE_RAD;
		var top = event.pageY + T.Tool.activeSplitter.off_top - T.WIDGET_CENTRE_RAD;
		top = top<-T.WIDGET_CENTRE_RAD?  - T.WIDGET_CENTRE_RAD : top;
		top = top>T.CanvasOuterHeight() - T.WIDGET_CENTRE_RAD*2? T.CanvasOuterHeight()  - T.WIDGET_CENTRE_RAD*2: top;
		left = left<-T.WIDGET_CENTRE_RAD? -T.WIDGET_CENTRE_RAD : left;
		left = left > T.CanvasOuterWidth() -T.WIDGET_CENTRE_RAD*2? T.CanvasOuterWidth() -T.WIDGET_CENTRE_RAD*2: left;
		T.Tool.activeSplitter.$h.css({top:top+'px'})
						  .find('.widget-center').eq(0).css({left:left+'px'});
	}
}


/* =========================== */











