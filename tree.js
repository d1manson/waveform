T = T || {};

// T.TREE is a class for rendering a binary tree as a table. It provides interactivity too.

T.TREE = function(){

	var cls = function(aInd,bInd,aDescCount,bDescCount){
	
		// leaf nodes are refered to by the indices 0...N-1, joining nodes are N...N-2
		// All four inputs are of the same length, which is N-1. The i'th set of 4 values 
		// describes the join node with index i+N.
		
		var N = aInd.length + 1;
		
		this._ = {$: $("<table class='tree'></table>"),
				  $tbody: $('<tbody />'),
				  $lastRow: $('<tr/>'),
				  nodes: Array(2*N-2).concat({  $: $("<td class='node' isRoot='' colspan='1' style='font-size:" +
												(Math.log(N)/2 + 1) + "em;'>&#9679;</td>"), 
												ind: 2*N-2, //this is the index into the nodes array, which is the full [0 to 2*N-2] indexing
												isExpanded: false}),  
							
				//remember to subtract N when indexing into these four arrays (the first N elements are leaf nodes so don't appear here)
				  aInd: aInd,
				  bInd: bInd,
				  aDescCount: aDescCount,
				  bDescCount: bDescCount,
				  
				  N: N};
		this._.$.append(
			this._.$tbody.append(
				this._.$lastRow.append(
					this._.nodes[2*N-2].$		)));
					
		this._.nodes[2*N-2].$.data('node',this._.nodes[2*N-2]);
					
		var tree = this;
		this._.$.on('mousedown','.node',function(evt){
			var node = $(this).data('node');
			if(!node.isExpanded && node.ind >= tree._.N)
				ShowChildren.call(tree,node);
			evt.stopPropagation();
		});
		
	}
	
	
	var AddRow = function(){
		
		var $newRow = $('<tr/>');
		
		this._.$lastRow.children().each(function(){
			var $newTd = $("<td colspan='1'/>").data('$above',$(this));
			$(this).data('$below',$newTd);
			$newRow.append($newTd);		
		});
				
		this._.$lastRow.after($newRow);
		this._.$lastRow = $newRow;
	}
	
	var ShowChildren = function(node){
		if(!node.$.data('$below'))
			AddRow.call(this);
			
		var newLeft = {$: $("<td class='node' modtwo='1' colspan='1' style='font-size:" + 
								(Math.log(this._.aDescCount[node.ind - this._.N])/2 + 1) + "em;'>&#9679;</td>").data('$above',node.$),
					   ind: this._.aInd[node.ind - this._.N]}
		
		var newRight = {$: $("<td class='node' modtwo='0' colspan='1' style='font-size:" +
								(Math.log(this._.bDescCount[node.ind - this._.N])/2 + 1) + "em;'>&#9679;</td>").data('$above',node.$),
					   ind: this._.bInd[node.ind - this._.N]}
		newLeft.$.data('node',newLeft);
		newRight.$.data('node',newRight);
		this._.nodes[newLeft.ind] = newLeft;
		this._.nodes[newRight.ind] = newRight;
		
		
		var $below = node.$.data('$below');
		var $td = $below.data('$below');

		//starting with $below.data('$below'), add an extra sibling to the right, all the way down
		$left = newLeft.$;
		$right = newRight.$;
		if($td){
			$left.data('$below',$td);
			$td.data('$above',$left);
		}
		var d = 0;
		while($td){
			d++; console.log("Gone down to d=" + d);
		
			var $newTd = $("<td colspan='1'/>").data('$above',$right);
			$right.data('$below',$newTd);
			$td.after($newTd);
			$td = $td.data('$below');
			$left = $td;
			$right = $newTd;
		}

		// starting with this node, go up incrementing colspan by 1
		var $td = node.$;
		while($td){
			$td.attr('colspan',parseInt($td.attr('colspan'))+1);
			$td = $td.data('$above');
		}

		
		// and ok, now we can put in our nodes
		$below.replaceWith(newLeft.$);
		newLeft.$.after(newRight.$);		
		node.isExpanded = true;
		
		
	}
	
	cls.prototype.Get$ = function(){return this._.$;};
	
	return cls;
}();

