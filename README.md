# <a name="wiki"/> Waveform

The application is available live at [d1manson.github.io/waveform](http://d1manson.github.io/waveform).   

For a quick, but fairly complete introduction to the application, please see the following demo:

[![link to youtube](img/demo_youtube_hover.png)](http://www.youtube.com/watch?v=36o69CPu-1E)   

Note that although the demo was recorded before the latest major re-write, there should be only minor differences from the point of view of the end-user.

## Additional notes for end-users

As with any other web application, you will always get the latest verison of the application when you navigate to it in your browser, although you may need to clear you cache using `Cltr-Shift-F5` (I think?).  Every now and again, updates will be tagged as a "release", which doesn't mean anything particularly special, but you can get notifications of these releases by subscribing to the [RSS feed](https://github.com/d1manson/waveform/releases.atom) (I recommend [blogtrottr](https://blogtrottr.com/) for getting RSS updates by email).   

If you are looking for the script that lets you run [KlustaKwik](https://github.com/klusta-team/klustakwik) in batches from the right-click menu in Windows Explorer (yes, Windows only), it's [here](https://googledrive.com/host/0B2QfZjKOj5KxT2wwSFZwRUVXNVE/fancykk.zip).   

If you find bugs please, please, please, report them - either using the github issue interface or via email.  And if you have a feature request, don't hold back from suggesting it.  General feedback and thank-yous are also welcome (email is probably most appropriate in this case).

TODO: list shortcuts and think of stuff not mentioned in the video or whatever.

---

## Notes for developers

If you are coming from a Matlab-only backgound you might find developing the applicaiton a bit tough, but it may be worth a shot.  There should hopefully be enough information below to get you started.

You need to download and install [node.js](https://nodejs.org/en/).  You can then install `bower` from the command line:

```
npm install -g bower
```

And then, once you've downloaded/forked this repository, `cd` into the directory and run the following command to download all the dependencies (various things from [Polymer](https://www.polymer-project.org)):

```
bower install
```

At this point you are going to need a way to run a localhost server.  If you have python installed you can use:   

```
python -m SimpleHTTPServer
```

and then go to `localhost:8000\index_full.html` in Chrome.  If you don't have python (and don't feel like installing it specially) then you can (I believe) do something similar using node - [see here](http://stackoverflow.com/a/8427954/2399799).

During developement I suggest using the `index_full.html` url, but when you're ready you can use the following command to build everything, which in this case basically just means concatenating files together in a specialised way:

```
vulcanize index_full.html -o index.html --inline-scripts --strip-comments
```

You can then just go to `localhost:8000` (i.e. without the `index_full.html`.

#### Application Structure

The application is written using the [Polymer framework](https://www.polymer-project.org) (although you're not supposed to refer to it as a "framework").  At the time of writing, Polymer is at version 1.4, which is supposed to be "production ready", but in reality there's still more polishing to be done in terms of making things easy for the developer and giving helpful warnings/errors when you don't do them right.  However it is already a super tool for building interactive interfaces.    

The nice thing about Polymer is that it generally offers clean [declarative](https://en.wikipedia.org/wiki/Declarative_programming) ways of expressing things, where in this case "declarative" means written in HTML without javascript, or with only minimal javascript.  The cleanliness is achived by encapsulating "things" as custom elements, and then hooking up the the dynamic properties of the elements using the Polymer binding syntax.

If you look at `index_full.html` you'll see how, at the top level, the application is defined in HTML using custom elements with their properties bound togather.  Here is a representative snippet from that page:

```html
<head>
	...
	<link rel="import" href="undo-stack-view.html">
	<link rel="import" href="cut-object.html">
	...
</head>
<body>
	<template is="dom-bind" id="the_app">
		...
		<undo-stack-view 
		    undo_stack="[[cut_undo_stack]]"
		    redo_stack="[[cut_redo_stack]]"></undo-stack-view>
		...
		<cut-object 
			groups="{{cut_groups}}"
			cut_box="[[cut_box]]"
			undo_stack_descriptions="{{cut_undo_stack}}"
			redo_stack_descriptions="{{cut_redo_stack}}"></cut-object>
		...
	</template>
</body>
```

In the `head` we import the definitions of two custom elements, `undo-stack-view` and `cut-object`, then somewhere in the page's `body` we use each element once. (Note that in general elements can appear in multiple places on the page, but often we only need to use each once.)  If you've used the application you should recognised the `undo-stack-view` as it has an obvious visual representation on the page. On the other hand, the `cut-object` does not have any visible aspect, as it is just used for encapsulating logic.   

The `some_property="{{some_variable}}"` syntax is the way you tell Polymer to bind things together: `some_property` has been defined inside the custom element, and `some_variable` will be automatically created by the `<template is='dom-bind'>` element that wraps the whole application.  The important thing to recognise is that the `undo-stack-view` and `cut-object` bind using the same variables - `cut_undo_stack` and `cut_redo_stack` - this means that when one element changes the property the other element will automatically update.   

There are various rules about exactly how binding works in Polymer, for example `{{...}}` and `[[...]]` do slightly different things.  At this point it may be worth reading the Polymer docs in a bit of detail, and perhaps looking at some of the more simple uses here: `undo-stack-view`, `document-focus-marker`, `header-view`.

### Other logic

The "beating heart" of the application is composed of the `parsed-data` element and `cut-object` (there is one of each on the page).  The `parsed-data` element is responsible for reading files from disk and producing easy to use arrays of data such as `spike_times`, and `pos_xy`.  The `cut-obejct` manages the list of groups in the current cut.  

Before we dive into all the details of the cut, note that the `file-organiser` element is the thing visible in the top-left of the page. Its job is to respond to `FileList`s being dragged onto the page by organising, sorting, and displaying them, and alowing the user to jump between them.  It has a `selected_files` property which changes exactly once (or not at all) when the user clicks on something in the `file-organiser`.  The `parsed-data` element can then take full control over how it wishes to transition from the old selection of files to the new selection, i.e. only `null`ing and loading the things which are changing.

---

TODO: finish giving the intro, including something like the following...

There are a bunch of things called "keys", used for refering to specific objects in specific ways:

* pkey - Polymer.Collection assigns a key to each unique item that it encounters, whether that item is an object or string/number (I actually don't know the full details of this despite having stared at the code for a while).  Here we have monkey-patched `Polymer.Collection` so that objects with a `._pkey` property will have that property set to the collection's key value when added to the collection. We sometimes request and use this key in our own code, particularlly when communicating between worker and main thread.  It always refers to a particular "box" arround and immutable list of cut indices, or rather to the immutable cut indices themselves.  Note that the key is only unique within the cut array..two different cut arrays will (in general) reuse the same key names for entirely different data.  We thus often qualify the "key" with a "generation" number.  See cut-obj or tac-plots for details.

* okey - when only working on the main thread (i.e. in wave-plots), we can use the object itself as a key (when using Map/WeakMap rather than basic JS objects).  okey refers to the same "box" as does "key", but here it is the actual box rather than a string name for it.

* akey - when we store typed arrays as polymer component properties, we do not use the array directly, but instead store the array with the "typed-array-manager", which then gives us an "akey" with which to refer to it. These akeys are strings with the prefix " (ta-manager)".  They are fully unique.

* ckey - this is similar to the akey, but is for canvases rather than arrays.  See canvas-manger. TODO: actually apply this nomenclature.

* fkey - again, similar to akey, but is for files.  managed by file-organiser. a simple counter, starting at 1.


