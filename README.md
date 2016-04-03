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

#### Understanding the code

TODO: bring this section up to date.   

There are a bunch of things called "keys", used for refering to specific objects in specific ways:

* pkey - Polymer.Collection assigns a key to each unique item that it encounters, whether that item is an object or string/number (I actually don't know the full details of this despite having stared at the code for a while).  Here we have monkey-patched `Polymer.Collection` so that objects with a `._pkey` property will have that property set to the collection's key value when added to the collection. We sometimes request and use this key in our own code, particularlly when communicating between worker and main thread.  It always refers to a particular "box" arround and immutable list of cut indices, or rather to the immutable cut indices themselves.  Note that the key is only unique within the cut array..two different cut arrays will (in general) reuse the same key names for entirely different data.  We thus often qualify the "key" with a "generation" number.  See cut-obj or tac-plots for details.

* okey - when only working on the main thread (i.e. in wave-plots), we can use the object itself as a key (when using Map/WeakMap rather than basic JS objects).  okey refers to the same "box" as does "key", but here it is the actual box rather than a string name for it.

* akey - when we store typed arrays as polymer component properties, we do not use the array directly, but instead store the array with the "typed-array-manager", which then gives us an "akey" with which to refer to it. These akeys are strings with the prefix " (ta-manager)".  They are fully unique.

* ckey - this is similar to the akey, but is for canvases rather than arrays.  See canvas-manger. TODO: actually apply this nomenclature.

* fkey - again, similar to akey, but is for files.  managed by file-organiser. a simple counter, starting at 1.


