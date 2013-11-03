"use strict";

T = T || {};

// T.TREE is a class for rendering a binary tree as a table. It provides interactivity too.

T.TREE = function(){

	var cls = function(aInd,bInd,aDescCount,bDescCount,expandToInds){

		// leaf nodes are refered to by the indices 0...N-1, joining nodes are N...N-2
		// All four inputs are of the same length, which is N-1. The i'th set of 4 values 
		// describes the join node with index i+N.

		var N = aInd.length + 1;

		//TODO: clear up the silly mixutre of $.data and the array of "node" objects
		
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

		this._.$.on('mousedown','.node',NodeMouseDown(this));
		
		if(expandToInds){
			//to make this easier, we convert the list to a logical array saying for eahc node whether or not it is in the list
			var nodeIsInList = new Uint8Array(N*2-1);
			for(var i=0;i<expandToInds.length;i++)
				nodeIsInList[expandToInds[i]] = 1;
			this._.nodeIsInList = nodeIsInList; //to make it a bit clearer that this doesn't change during the recursion, we save it onto the tree object
			ExpandToList.call(this,2*N-2);
			this._.nodeIsInList = null;
		}
		
		
		//debug
		//this._.$.on('mouseenter','td',function(){$(this).data('$below').css({border: '3px solid #00F'})})
		//		.on('mouseleave','td',function(){$(this).data('$below').css({border: ''})});
				

	}

	var ExpandToList = function(ind){
		//This function recurses down the tree, only stopping when a node is in the list
		//this._.nodeIsInList is a logical vector of length 2*N-1
		
		var N = this._.N;
		var leftInd = this._.aInd[ind-N];
		var rightInd = this._.bInd[ind-N];

		ShowChildren.call(this,this._.nodes[ind]);
		
		if(leftInd >= N && !this._.nodeIsInList[leftInd])
			ExpandToList.call(this,leftInd);
		
		if(rightInd >= N && !this._.nodeIsInList[rightInd])
			ExpandToList.call(this,rightInd);
			
	}

    var NodeMouseDown = function(tree){
        return function(evt){
            var node = $(this).data('node');
            
			if((evt.button == 2 || evt.ctrlKey)){
				if(!node.isExpanded && node.ind >= tree._.N){
				    ShowChildren.call(tree,node);
                    evt.stopPropagation();
                }
			}else{
				if(node.ind != tree._.N*2 -2){
        	        MergeSiblings.call(tree, node,null,true);
                    evt.stopPropagation();
    		    }
			}
        }
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
		var $left = newLeft.$;
		var $right = newRight.$;
		if($td){
			$left.data('$below',$td);
			$td.data('$above',$left);
		}
		while($td){
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
		node.$.data('$below',newLeft.$);

	}
    
    var MergeSiblings = function($node,$above,isClicked){
        // This merges the node and its sibling, together with all their descendants back into the parent of this node.
		// we do this recursively.  Note that "too much recursion" occurs at a depth well over 1,000 so is unlikely to ever be a problem.
		// $node must be the left node of a branch.   $above is null unless this node is for the recurssion down the purely left branch, the tds
		// on the left branch are replaced with empty tds rather than being simply removed. Note that because we replace the nodes as we go down 
		// the recurssion, the function uses this value rather than the data('$above') value.
		// If we really wanted to it wouldn't be that hard to manually implement the recursion in a loop.

		if(isClicked){
			//This is where the recursion starts, the inputs are (node object,null,true)
			var node = $node; //here the first object is a node not a $node
			$node = node.$.attr('modtwo') == 1 ? node.$ : node.$.prev();
			$above = $node.data('$above');
			$above.data('node').isExpanded = false;
		} //See also the section at the end of this function for the end of the recursion.
		
		var $belowLeftNode;
		var $belowRightNode;
		$belowLeftNode = $node.data('$below');
		$belowRightNode = $node.next().data('$below');
		
		var totalRemoved = 0;
		
		//deal with the right node and its descendants
		if($node.hasClass('node')){ //the node in question might actually be an empty non-node, in which case there is no right node
			n = $node.next().data('node');
			if(n)
				this._.nodes[n.ind] = null;

			$node.next().remove();
			if($belowRightNode)
				totalRemoved += MergeSiblings.call(this,$belowRightNode,null);
			else
				totalRemoved++;
		}
		
		//deal with the left node and its descendants
		var n = $node.data('node');
		if(n)
			this._.nodes[n.ind] = null;

		if($above){
			//For some reason we create a brand new td rather than modify the existing one.  Note that we need an $above and $below value
			//for the new node, and the node above and below need their respective values set.  The following should achieve that when 
			//understood in the context of the recurssion going on.  Remember that the bottom most node doesn't get a $below value.
			var $newTd = $("<td colspan='1'/>").data('$above',$above);
			$above.data('$below',$newTd); 
			$node.replaceWith($newTd);
			if($belowLeftNode)
				totalRemoved += MergeSiblings.call(this,$belowLeftNode,$newTd);
		}else{				
			$node.remove();
			if($belowLeftNode)
				totalRemoved += MergeSiblings.call(this,$belowLeftNode,null);
			else
				totalRemoved++;
		}
		
		
		if(isClicked){
			//This is at the end of the recursion
			var $td = $above;
			while($td){
				$td.attr('colspan',parseInt($td.attr('colspan'))-totalRemoved);
				$td = $td.data('$above');
			}
		}else{
			return totalRemoved;
		}
		
    }

	cls.prototype.Get$ = function(){return this._.$;};
	cls.prototype.GetInd$ = function(ind){var n = this._.nodes[ind]; return n ? n.$ : null;}; //returns the jQuery el for the node with the given index. Note that this must be got afresh each time a node is shown
																								//(i.e. if tree is collapsed and expanded again a new element is used so this handle will be invalid.)
	cls.prototype.OnNode = function(evtName,foo){this._.$.on(evtName,'.node',function(evt){foo(evt,$(this).data('node').ind)})};  //e.g. x.OnNode('mouseenter',function(evt,ind){console.log('mouse over node-' + ind)});
	
	return cls;
}();

