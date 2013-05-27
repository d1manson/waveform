"use strict";


T.PROXIMITY = 30;
T.TILE_MOVING_BORDER_WIDTH = 10;
T.WIDGET_CENTRE_RAD = 10;

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
			T.AddAction({description: 'merge group-' + ind_b + ' into group-' + ind_a,
						 type: "merge",
						 dest_ind: ind_a,
						 second_ind: ind_b,
						 lengthSecond: T.cutInds[ind_b].length});
			T.cutInds[ind_a] = T.cutInds[ind_a].concat(T.cutInds[ind_b]);
			T.cutInds[ind_b] = [];
			T.RemoveTile(ind_b);
			T.WV.SetGroupData(T.cutInds);
			T.WV.Render(ind_a,ind_a); //only render the merged group
		}
	}
	delete T.Tool.activeMerger;
}

T.Tool.UndoMerge = function(action){
	T.cutInds[action.second_ind] = T.cutInds[action.dest_ind].splice(-action.lengthSecond,action.lengthSecond);
	T.AddTile(action.second_ind);
	T.WV.SetGroupData(T.cutInds);
	T.WV.Render(action.dest_ind,action.second_ind); //render all groups from the first to the second. TODO: only render the two groups in question
}

T.TileMouseUp = function(event){
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