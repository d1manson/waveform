"use strict";


T.PROXIMITY = 30;
T.TILE_MOVING_BORDER_WIDTH = 10;
T.WIDGET_CENTRE_RAD = 10;
T.SEPARATOR_MOUSE_DOWN_TIMER_MS = 100;

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
		$(document).unbind('mousemove')
				   .unbind('mouseup');
		delete T.Tool.activeSplitter;
	}
}

T.Tool.MergerTileMouseUp = function(event){
	$(document).unbind('mousemove')
			   .unbind('mouseup');
	T.Tool.activeMerger.$placeholder.remove();
	T.Tool.activeMerger.$h.css({left: '',top:'',position:''})
					.toggleClass('tile-moving',false)
					.toggleClass('shake',true)
					.toggleClass('tile-proximate',false)
					.find('canvas').eq(0).css({position: '',left: '',top: ''});

	if(T.Tool.activeMerger.target != null){
		var ind_a = T.Tool.activeMerger.$h.data("group_num");
		var ind_b = T.$tile_[T.Tool.activeMerger.target].toggleClass('shake',true)
														.data("group_num");
		if(ind_a != ind_b){
			if(ind_a > ind_b){
				var tmp = ind_b;
				ind_b = ind_a;
				ind_a = tmp;
			}

			T.ORG.GetCut().AddBtoA(ind_a,ind_b);
		}
	}
	delete T.Tool.activeMerger;
}


T.TileMouseUp = function(event){
	console.log("mouse up");
	if(T.Tool.activeMerger && event.button == 0)
		T.Tool.MergerTileMouseUp.call(this,event);
}

T.Tool.BeginSplitterTileMouseDown = function(event){
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

T.Tool.BeginMergerTileMouseDown = function(event){
	var offset = $(this).offset();
	var $h = $(this);
	$h.toggleClass('shake',false); //clear it from any previous dragging
	var $parent = $h.parent();
	var parentOff = $parent.offset();
	parentOff.scrollTop = $parent.scrollTop();
	var $p = $h.clone().toggleClass('tile-placeholder',true);
	T.Tool.activeMerger = {off_left: -parentOff.left + (offset.left-event.clientX) ,
					off_top: -parentOff.top + (offset.top-event.clientY),
					$h: $h,
					$parent: $parent,
					$placeholder: $p,
					allTilePositions: T.$tile_.map(function($t,ind){var bad = {left: 99999, top: 999999}; if(!$t) return bad; var a=$t.position();a.top += parentOff.scrollTop; return a || bad;}),
					target: null};
	$p.insertAfter($h);
	$h.css({position:'absolute'});
	$h.toggleClass("tile-moving",true)
	   .mousemove(T.TileMouseMove)
	   .mouseup(T.TileMouseUp);
	$(document).mousemove(T.TileMouseMove)
			   .mouseup(T.TileMouseUp);
	T.TileMouseMove(event);
}

T.TileMouseDown = function(event){
	console.log("mouse down");
	if(T.Tool.activeSplitter || T.Tool.activeMerger)
		return;

	if(event.button == 2 || event.ctrlKey)
		T.Tool.BeginSplitterTileMouseDown.call(this,event);
	else if (event.button == 0)
		T.Tool.BeginMergerTileMouseDown.call(this,event);

    event.preventDefault();
}

T.Tool.MergerTileMouseMove = function(event){
	var left = event.clientX + T.Tool.activeMerger.off_left;
	var top = event.clientY + T.Tool.activeMerger.off_top + T.Tool.activeMerger.$parent.scrollTop();
	T.Tool.activeMerger.$h.css({left: left+'px', top:top+'px'});

	T.Tool.activeMerger.target = null;
	var pos = T.Tool.activeMerger.allTilePositions;
	for(var i = 0;i<pos.length;i++) if(pos[i])
		if(Math.abs(pos[i].left-left-T.TILE_MOVING_BORDER_WIDTH) < T.PROXIMITY && Math.abs(pos[i].top-top-T.TILE_MOVING_BORDER_WIDTH) < T.PROXIMITY){
			T.Tool.activeMerger.target = i;
			T.$tile_[i].toggleClass('shake',false); //clear this so that it's ready to be reused if we merge
			T.Tool.activeMerger.$h.toggleClass('tile-proximate',true);
			T.Tool.activeMerger.$h.find('canvas').eq(0).css({
								position: 'relative',
								left: pos[i].left-left-T.TILE_MOVING_BORDER_WIDTH + 'px', 
								top: pos[i].top-top-T.TILE_MOVING_BORDER_WIDTH + 'px'});
			return;
		}

	T.Tool.activeMerger.$h.toggleClass('tile-proximate',false)
				   .find('canvas').eq(0).css({position: '',left: '',top: ''});
}

T.TileMouseMove = function(event){
	if(T.Tool.activeMerger)
		T.Tool.MergerTileMouseMove.call(this,event);
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

T.TileDoubleClick = function(event){
	console.log("double click");
	var $h = $(this);
	$h.toggleClass('shake',false); //clear the failed dragging animation (the mouse down events triggered this)

	var c = T.ORG.GetCut();
	var g = $h.data("group_num");
	var cut_g = c.GetGroup(g);
	var n_1 = Math.floor(cut_g.length/2);
	var n_2 = Math.ceil(cut_g.length/2);
	c.SplitA(g,T.Tool.SeparatorMakeMask(n_1,n_2));

	$.each(T.$tile_,function(){$(this).attr('disabled','true');})
    var $separator_first = $("<div class='separator_half' />")
                            .on("mousedown",function(e){return T.Tool.SeparatorMouseUpDown(e,true,true)})
                            .on("mouseup",function(e){return T.Tool.SeparatorMouseUpDown(e,false,true)});
    var $separator_second = $("<div class='separator_half' />")
                            .on("mousedown",function(e){return T.Tool.SeparatorMouseUpDown(e,true,false)})
                            .on("mouseup",function(e){return T.Tool.SeparatorMouseUpDown(e,false,false)});
	T.$tile_[g].attr('separating','true')
                .wrap($separator_first);
	T.$tile_[g+1].attr('separating','true')
                .wrap($separator_second);
    T.Tool.separating = {g:g,n_1:n_1,n_2:n_2,increment:1,isFirst:NaN,timer:null};
}

T.TileWallMouseDown = function(event){
    if(T.Tool.separating){
        var g = T.Tool.separating.g;
        T.$tile_[g].removeAttr('separating')
                                     .unwrap();
        T.$tile_[g+1].removeAttr('separating')
                                     .unwrap();
        $.each(T.$tile_,function(){$(this).removeAttr('disabled');});
		clearInterval(T.Tool.separating.timer);
        delete T.Tool.separating;
        
        if(event.button == 2 || event.ctrlKey)
            T.ORG.GetCut().Undo();
    }
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

	T.$tile_[s.g].caption.text("group " + s.g + " | " + s.n_1 + " waves ");
	T.$tile_[s.g+1].caption.text("group " + (s.g+1) + " | " + s.n_2 + " waves ");
}


T.$tilewall.on("mousedown",T.TileWallMouseDown);
T.$tilewall.on("mousedown",".tile",T.TileMouseDown); 
T.$tilewall.on("dblclick",".tile",T.TileDoubleClick); //double click is triggered after the sequence mouse-down, mouse-up, mouse-down, mouse-up.  Which would have meant the merge tool was started and stopped twice.