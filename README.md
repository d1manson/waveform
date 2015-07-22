# <a name="wiki"/> Waveform

Daniel decided that browsers are good for rapid design of user-friendly interfaces. This is very much a work in progress.  Note that only Chrome is actively supported. Firefox seems to work okay, but other browsers less so.

**To use the application** do one of the following:
+ go to [d1manson.github.io/waveform](http://d1manson.github.io/waveform) for the latest fairly stable version
+ [download](https://github.com/d1manson/waveform/archive/master.zip) the code and open index.html in your browser.
+ if you want an older "stable" version you will need to navigate through the git history of the ``gh-pages``  branch and download the version you like.  Note that only recent releases have been tagged with human-readable names.

**Updates** will be downloaded simply by refreshing the page. In terms of being informed of changes, I will endevaour to create named releases when new features are implemented so that you can subscribe to the [RSS feed for releases] (https://github.com/d1manson/waveform/releases.atom).  You can use any RSS reader or [RSS email service](https://blogtrottr.com/) to get the RSS.  I will endeavor not to spam the RSS with lots of small update releases.

**Bugs, features, and feedback.** If you are using the application, I'd love to know!  If you find any bugs then definitely report them as soon as possible.  There are many features I'd like to add at some point, but most of them are rather time consuming to implement using the current framework. However, if you let me know what it is you want, I may be more inclined to implement it, especially if it's one of the less tricky things to do.

#### Screenshots
Example view of the whole application, with a few things labeled:    
![screenshot](/screenshot1.png "screenshot with labels")

Some screenshots of individual features:     

|                                   |                                         |
|:----------------------------------|:---------------------------------------:|
|Merger tool                        | ![mergetool](/mergertool.png)           |
|Splitter tool                      | ![splittertool](/splittertool.png)      |
|Cluster painting tool              | ![paintingtool](/clusterpainting.png)  |        
|Wave rendering in  "density" mode   | ![density](/countmode.png)              |  
|Cluster rendering in "drift" mode  | ![drift](/drift.png)                    |  


#### Quickstart   (... it's short and worth reading!)
**Loading the data.** Open your operating system's file explorer and drag all the files you want into the GUI.  They will automatically be organised in the file panel on the left.  Click on a given experiment (aka "trial") to activate it. You switch tetrodes by selecting one of the numbered buttons to the right of the word "tetrode" at the top of the file panel.  If you have multiple cuts on a given tetrode you can switch cuts by clicking on the cut's name.  By default the most recently modified cut file will be used.

**Viewing the data.**
You can select to view a single channel, ratemap, or temporal autocorrelogram by clicking the relevant button in the main toolbar.  Hold down shift to select multiple views.

**Merge groups.** You can drag a tile onto another tile in order to merge two groups together.  

**Split a group.** Right click a group (and drag) to use the split tool.  This tool lets you specify a time and voltage threshold on which to split up a group (voltage threshold applied on a single channel).   The split is shown when you release the right mouse button, but you can right click again to adjust it. To finalise the split left click on the tilewall outside the two active tiles (or right click the tilewall to cancel the split).

**Cluster paint** The top left of the cluster panel shows the current source and destination groups for cluster painting.  There are two ways of painting a region: either use the left mouse button to select the area you do want to transfer, or use the right mouse button to select an area you don't want to transfer, i.e. transfer everything else. In both cases the region to be transfered is always shown as a transparent green overlay.  There are two ways of selecting the source and destination groups (use whichever is most convenient for you): (1) left click the relevant group's "sticker" at the top of the cluster panel to select it as the destiation, or right click to select it as the source; (2) With your cursor over the group use the shortcuts ``f``/``e`` to select source or destination (this works for the cursor over either the group's sticker, its tile, or its coloured pixels in the cluster plots). For all of the above 3 methods you can select multiple source groups by holding down shift. To increment the destination group use the shorcut `Enter` (strictly speaking it's not actually a "shorcut" as there's no other way of doing this at the moment!).

**Reorder the groups.** The main toolbar has two reordering tools: reorder by N sorts the groups by the number of waves in the group; reorder by A sorts the groups by the amplitude of the mean waveform for the group (it uses the first of the currently displayed channels).

**Swap groups** Press `s` when your cursor is over one of the groups you want to swap.  Type the new group number in the dialog that appears and hit `Enter` (or `Esc` to cancel).  Note that you can swap a group to a group number which doesn't currently exist.

**Autocut.** Primative autocut support has been removed from this project. It is recommended that you try using [KlustaKwik](https://github.com/klusta-team/klustakwik), to do so you will need to some kind of script to parse `tet` files and output an `n x m` plaintext table with ``n`` rows for the `n` spikes each with  `m` "dimensions".  Typically the "dimensions" will correspond to principle components or amplitude, but you are free to choose any projection of the data that gives good clustering results.  The (very simple) `.clu` files output by KlustaKwik are recognised by this GUI, so there is no need to conver to the (also very simple) `.cut` format.    

If you're on Windows, you should find that you can use [this fancykk bundle](https://googledrive.com/host/0B2QfZjKOj5KxT2wwSFZwRUVXNVE/fancykk.zip) to take care of the PCA etc.  The zip file contains a readme that explains how to get the batch file setup to run from the windows right-click context menu.  It's not particularly well tested or fault tollerant, but it should work if everything is done correctly and there are no funny issues with the files.

**Save the cut.** Drag the cut file from the file panel to your operating system's file explorer.  It will be given the standard name for a cut file.

**Checking for drift**
Using the drift button (shortcut `d`) you can see whether there was any shift in the clusters during the trial.  (see image below for an example).  You can also see whether a particular cell's spatial pattern changed during the trial. 

**Info panes and plot grabbing**
There are several floating info panes (header info, action list, shorcut list etc.) that appear when you move your cursor over the relevant button in the main toolbar.  If you right click the given button it will pin/unpin the info pane, so it will remain even when you move the cursor off the button. These info panes can be dragged around freely.    
To grab a plot, hold down space and then click the plot. This works for tiles in the tilewall, the cluster panel, and the spatial panel.   To close of a grabbed plot or info pane, hold down space again and click the floating pane.    

It is also possible to copy a tile's plots to the system clipboard (e.g. for pasting into an email or note taking application). To to do this, simply press `ctrl-c` when one of the groups in the tile wall is "active".  Note that not all programs will correctly interpret the clipboard data - Gmail and Google Docs have been tested and seem to work.

**Reset preferences**
The GUI will in general remember your preferences (i.e. bin size, smoothing, cluster painting brush size etc.).  However there may very occasionally be a problem with this, perhaps caused by an update to the code since your last visit to the page.  If you find the page hasn't loaded properly you should open up the developer tools and go to the "console" tab (press `F12` or find the option in your browser's menu).  You should then type the command `T.ResetAndRefresh()`.  This will clear your preferences and reset the page. If this still doesn't work then submit a bug report asap (see the navigation the icon on the right here on GitHub).

**Keyboard shortcuts**
+ `k` show list of keyboard shortcuts
+ `escape` open/close the main toolbar.
+ `p` toggle palette. 
+ `ctrl+z` or just `z` undo.
+ `1`, `2`, `3`, `4`, `r`, `c`, `v`,`t` view channel 1-4, spatial/directional/speed ratemap or temporal-autocorr. Use `shift` to show multiple views (as when using the mouse in the button panel).
+ `d` toggle drift mode rendering of the cluster plots.
+ `f` select group under cursor as source (i.e. "From group") group for cluster painting. Use `shift` to select multiple.
+ `e` select group under cursor as destination (i.e. "Enter into group") group for cluser painting.
+ `Enter` increment destination group number for cluster painting.
+ `s` launch group swap dialog for group under cursor.
+ `Space` hold down `space` and click plots to grab them, or click existing floating dialogues to close them.
+ `+` and `-` change size of cluser plots. (Note that `+` is actually the `=` key.)
+ `?` go to the GitHub page.
+ `a`  do autocut. 
+ `ctrl-c` copy to the system clipboard the info and plots for the group under the cursor.

_Right clicking with a touchpad._ In some cases right clicking can be emulated by holding the `alt` key and left-clicking.

**Console-only features**    
Some stuff doesn't yet have a proper user-interface implementation, but can be accessed by pressing `F12` and going to `Console`:   
+ `T.ORG.SetPosHeaderOverride({window_max_x: '300',window_max_y: '400'})` - the stuff inside the `{...}` can be any values in the pos header. The override occurs immediately after reading the header, before even reading the binary part of the data. Thus you can override ppm before speed filter, or just override window min/max for ratemaps etc.  Note that normally the `window_min_x/y` values are not subtracted from the read in data, but if you do want them to be subtracted then provide  `need_to_subtract_mins: 1` in the list of overrides.  

+ `T.ORG.GenerateXYCSVForDebug()` and `T.ORG.GenerateDirCSVForDebug()`. Both these functions open a new tab, and populate it with csv data which can be copy-pasted into Excel or a text document.  Note the direction data is computed from displacement when using 1-spot LED, or from relative positions when using full 2-spot LED. You may need to allow popups in order for the new tabs to actually open.    

#### Change Log
* Added support for 2LEDs, and fixed directional plotting.
* Added speed plots.
* Merge tool now slowly flashes dragged group's plots while over another group.
* Removed speed-hist-drift rendering mode.
* Removed "hot" wave rendering mode and buttons on tiles.
* Added dir ratemaps.
* Encapsulated some parts of the page as polymer components: tile-element and cross-hair.
* Removed autocut and filesystem api.
* Made drop zone a bit fancier.   
* Added a speed histogram to the info ontop of pos, and later added a drift mode rendering.    
* Implemented some post processing for position data together with an info pane to control some of the paramaters.
* Added sliders for ratemap and temporal autocorr paramaters.
* Added copy function.
* Switched to using flex layout and polymer web components.
* Added support for `.clu` files. Also improved the process of assigning cut files to trials. And cut files are now chronologically ordered and the most recent is the default.    
* Optimised parts of the loading process and fixed a few bugs to do with using both mouse buttons.
* Added a raw spike rendering feature to the spatial panel, which also renders mean time in drift mode.
* Added cluster painter tool.
* Added a grabbing feature for easy comparisons across trials/cuts.
* Tidied up the look and feel of the interface.
* Added a new wave rendering mode which shows the densities.
* Created a drift mode for rendering cluster plots.
* Re-worked the `T.ORG` module so that you can now switch cuts/tets/exps more easily.
* Each module now registers its own handlers with `T.ORG` rather than letting `main.js` do it.
* Added the cluster plots (not yet interactive).
* Created some keyboard shortcuts using keymaster.
* Implemented splitter tool. (Separator tool mentioned in change log below no longer exists.)
* Created BridgedWorker function and re-wrote temporal autocorr and ratemap to use it.
* Created temporal autocorr view.
* Webgl-rendering is now much simpler and possibly faster (there are a couple of minor bugs in the new version.)
* Cut now stores immutable data in slots rather than keeping a basic array with one element for each cut group.
* Added double click separator UI.  It's not as helpful as I'd hoped though.
* Restuctured much of the code for dealing with cuts and organising multiple files.  Can now switch between different cuts.
* Added basic ratemap generating code.
* Several sections of code have been restructured to make them more modular and easier to use.
* Can now toggle each channel on and off, by holding ctrl key when selecting channels in the button pane.
* Modified the webgl waveform rendering so that it now renders each channel separately, this simplifies the code and probably ought to be faster. (I'm too sure if it is faster because rendering times are very inconsistent.)
* Implemented (basic) multi-experiment, multi-tetrode functionality. Need to extend this to multi-cut functionality.
* Implemented reorder together with undo function.
* Have implemented an undo panel and undo button.  This is relatively simple for merging, but may be more complicated for other things.
* Have actually implemented merge.  Hooray, you can now use the program for something!
* Have added a button to toggle useage of HTML5 FileSystem.  The main reason for using it is for reloading the page on debugging, probably not that important for other users.</li>
* Have now implemented rendering with WebGl, it's really complicated and doesn't seem to be any faster.  Also it's still pretty rough around the edges.
* Can now display path data in the spatial panel on the left.   The impelementation of this is currently fairly ruidmentary: it only uses the first tracking LED, doesn't do any filtering and may not match the path shown in Tint.
* A heirarchical autoclusering method has been partially implemented. See below. 
* Can now drag cut file back onto the desktop to save it. 

#### Understanding the code

**Notes for serious future development**    
There are a bunch of web standards/stuff which are in early stages of development at the time of writing, but which will be useful in future:  [Polymer 1.0](https://www.polymer-project.org/1.0/), [Shared Array Buffers](https://www.chromestatus.com/feature/4570991992766464) (and allied atomic/threading APIs), [Chrome asm.js optimisation](https://code.google.com/p/v8/issues/detail?id=2599), [WebGL 2.0](http://blog.tojicode.com/2013/09/whats-coming-in-webgl-20.html), [SIMD in JS](https://hacks.mozilla.org/2014/10/introducing-simd-js/) (in some form).   

I have grand plans for a serious framework, which if I ever write and finish, would offer great promisses for a future re-write of this project.  But that might be too ambitious.

**Notes for the uninitated**    

If you've never tried to style a `div` with CSS then you would do well to start off by Googling a basic HTML5 and CSS tutorial - if you are reluctant to do this then open the developer tools in your browser using `F12` and look through the "elements" tab to decide whether you can understand the structure of the page and its styling.

If you are a proficient programmer and know a bit of HTML but no JavaScript, you should expect to find the code pretty confusing at first, but hopefully it will make sense soon enough.  Here are some **important** things to grasp before going much further:
* [jQuery](http://en.wikipedia.org/wiki/JQuery) - this makes interaction with elements on the page easier than with "Vanillia" JavaScript.  However for an application such as this that only aims to support one (or two) modern browsers it could be considered unneccessary overhead - in some places in the code base Vanilla JavaScript is used instead of jQuery.
* [callbacks and the asynchronous paradigm](http://recurial.com/programming/understanding-callback-functions-in-javascript/) - Everything in JavaScript begins with an event, and only one such event is being processed at any one time.  This means there is a "queue" of events that are (waiting to be) processed in a strict order.  You can add things to this queue by requesting an event after a short delay (e.g. 2ms).  Although only one piece of the JavaScript code is executing at any given time, other things can be happening, such as loading data from a file.  In many cases these "other things" will be designed to occur in the background and then trigger an event when they are completed.  This model of letting things happen in the background is described as being "asynchronous".
* [Workers](http://www.w3schools.com/html/html5_webworkers.asp) - As decsribed in the previous point, only one thing is happening at any given time in JavaScript.  While this restriction doesn't apply to non-JavaScript things, such as the file loading example mentioned, there are several occasions when it would be nice to be able to run multiple pieces of code at the same time.  This is what Workers do.  They are entirely separate instances of JavaScript running in parallel, which are only able to communicate by sending messages to each other (these messages are delivered as events into the event cues at either end).
* [closures](http://stackoverflow.com/questions/111102/how-do-javascript-closures-work) - this alows variables to be passed around in a way that will be unfamiliar to programmers only experinced with C/C++ and or Matlab/Fortran (actually Matlab does in support closures but they are not a well known feautre of the lanugage).
* [TypedArrays](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays) - these are roughly speaking like arrays in "traditional" numerical computing languages such as C or Fortran in that they are (almost certainly) implemented as contiguous blocks of memory, and are designed for storing a vector of numbers using a particular precision (e.g. 32-bit floatin point or 8bit integer).  They even permit a certain kind of pointer useage.
* WebGL. ([Nice diagram](https://www.ssugames.org/pluginfile.php/1401/mod_resource/content/1/08-alpha/index.html#slide-3)) - this enables us to harness the power of the GPU.
* [WebComponents and Polymer](http://www.polymer-project.org/) - this is a new web technology which alows the devloper to make parts of an application far more modular and reusable than was previously possible.  All the visual and interactive aspects of a particular item on the page can be encapsualted in one place and not find themselves tampered with unexpectedly by other parts of the page.  Polymer wraps around the new web standards to make this concept even neater/easier and provides a "polyfill" for missing features (a "pollyfill" is essentially a hack that is inserted into the page to make it seem to the developer that all browsers support the latest features even if they don't quite...his hack is (usually) possible because the extra features can be written in JavaScript and left in the global "window" namespace as though they were put there by the browser.)
* JavaScript Blobs - this isn't that important; google if you're interested.
* V8 optimization in Chrome - the web wasn't born with JavaScript (was it?), rather it was aquired at some later point and then gradually grew in signficance.  Early JavaScript engines were not especially intelligent as there wasn't anything interesting for them to process, but over time they went through several stages of improvement.  Current engines (in particular Chromium's V8 engine) are the result of huge amounts of man hours of work. The result is that the browser will try really hard to run JavaScript as close to native speed as possible, i.e. it will take a function and try and convert it into machine code that would be very similar to the machine code emitted by a C/C++ compiler for an euqivalent function.  Because of the nature of the language it is rarely possible to get below 3-4 times the speed of "native" code, but often that will be sufficient.  There are no hard and fast rules about writing code that will make V8 "happy", but if a particular section of code is running slow there are some rules of thumb and some profiling tools that will be of interest.

A couple of final notes:
* You will also need to accept that although JavaScript is not as fast as  C/Java/Matlab/Python etc and in many ways is a horrible language, it is pretty easy to write a very interactive and responsive application using it.
* In most browsers you can press F12 to gain access to the developer tools, which include a feature-rich debugger and interactive console, plus a way of examining the properties of elements on the page.  Note that because you have access to the command line you can easily write a simple script to modify the cut, or better still, you can add a new function to the code-base without bothering to create a proper interactive way of using it, but you will still be able to access it from the command line.
* Oh, and if you've got this far and are still not sure whether JavaScript has anything to do with Java, let me teach you the number one JavaScript fact: JavaScript and Java having nothing in common (beyond the fact they are both programming languages that begin with the letters j-a-v-a).

**Custom elements**    

There are a (growing) number of Polymer custom elements which encapsulate DOM, CSS and JS in one place. Each element exists in a separate `.html` file:    
* `tile-element` - each group in the tilewall gets one of these elements.  It has various methods for adjusting its visual state (e.g. make it look one way while it is being dragged and another way when it is being split etc.).  It also has a method for showing and updating the position of a cross-hair on a canvas; a method for copying its canvases; and one or two other methods.  The line between what should be contained within the tile-element and what is in ``T.Tool`` is slightly ambiguous but worth maintaing.
*  `cross-hair` - this displays an SVG black and white dashed circle, optionally with a horizontal line either side.  All its methods relate to positioning the centre and setting the radius of the circle and extent of the horizontal lines.
* `core-` - the GUI uses a few publicly available elements such as the splitters and the buttons.  Detailed information on these elements is available at the Polymer-Project's website (but note that we use a particular snapshot of the code so documentation may possibly be out of date). 

**Misc. utility code**    

There are a few javasript files that we consider utility code rather than integral to the application:
* `jQuery` - if you dont know what this is go back to the section entitled "notes for the uninitated"
* `jQuery.mousewheel` - a freely available jquery plugin for mousewheel events
* `keymaster` - a freely available module for handling keyboard events and shorcuts. Note that thre is (at least) one example where keyboard interaction is used without this (from memory the `space` key used in plto grabbing and the `ctrl` key used in copying tiles may use raw JS).
* `webgl-debug` - this is a freely avaialble script that can be used to wrap webgl calls in order to give better error reporting.  It is not normally needed so ahs been commmented out in `index.html`, however when doing webgl development it is worth using.
* `utils.js` - this includes a small number of (mostly) custom written utitlity functions, polyfills, and jQuery plugins. Take a look and see.
* `Mlib.js` - contains a namespace `M` with some basic functions for doing Matlab style manipulation of arrays.  It is very basic, poorly organised and only the functions that have so far been needed have been coded, and not in a particularly generalized form.  Note also that many functions have been copied from here and simplified for use by various workers (e.g. in ratemap production).
* `bridged-worker.js` makes it easier to use HTML5 workers - I was so pleased with this file that I gave it its own [GitHub gist](https://gist.github.com/d1manson/6714892) which was then turned into a standalone repo by someone else.   

**The main modules in the application**    

The core of the application "lives" within a namespace `T`, each subnamespace has its own appropriately names JS file. Note that there are some slightly awwkard interdependencies meaning that the order the files are loaded in is not that flexible (see the bottom of `index.html` to see what the order is).
* `T` - the file `main.js`  deals with the stuff in `T` itself. It is where all the miscellaneous interactive stuff is coded and everything comes together nicely...by which I mean it is a bit of a mess and if everything was really well designed there wouldn't be much need for it.
* `T.PAR` - this module exposes a number of functions, each of which accepts a file handle to a particular type of file that it knows how to parse into a header and binary data buffer.  In addition, it also exposes some functions for getting at the data in the raw buffers, for example there is a function to get the spike times and spike amplitudes.
* `T.CUT` - This exposes a (pseudo)class that represnts a cut.  The class exposes methods for doing various kinds of manipulaiotion such as swapping, splitting and merging groups.  It stores a history of such actions, which can be reverse using the undo method.  Cut instances can be constructed in a variety of different ways (e.g. you can have an all-zero cut of length N, or load from a list of lists of cutindices etc.).
* `T.Tool` - this module has heavy interactions with `tile-element`s and the cluster plots and some other bits and bobs. It essentially exposes an interactive way of calling the modification functions for the current cut instance. There is a `T.Tool.STATE` key-value map which holds each of the tools and their corresponding state objects. While a particular tool is active, `T.Tool.cState` is set to to that tool's `STATE` object.  These state objects hold details like active group number and references to relevant dom nodes.
* `T.WV` - this module uses [WebGL](https://developer.mozilla.org/en-US/docs/Web/WebGL) to render waveforms.  It is complicated and messy.
* `T.RM` - this module produces ratemaps.
* `T.TC` - this module produces temporal autocorellograms.
* `T.EEG` - this module is not ready for use yet, but contains some semi-functional code for dealing with EEG data.
* `T.CP` - this module produces cluster plots.
* `T.FS` - this module originally served a more complex purpose (it interacted with the HTML5 FileSystem APIs).  It now is a fairly simple wrapper around a single object which holds references to all the files by name.   

**Subscribing to Events**      

A good GUI is highly interactive and responsive, even when it is doing heavy processing or rendering, however achieving this in code can be pretty complicated.  One of the pardigms we use here is we allow bits of code to "subscribe" to "events", meaning that whenever a particular kind of event occurs a list of functions will be called and passed the data relating to the event.  There is not a great deal of standardisation, but here is a (possibly incomplete) list of the "events" that can be "subscribed" to together with a few nuggets of information about the corresponding section of the application (hopefully this will all be tidied up and nicely standardised):   

##### `FileStatusCallback`     
Whenever we switch experiment, tetrode or cut, the `T.ORG` module loads only the minimal number of new files.  It uses `T.PAR` to load and parse the files (which is done with a worker on another thread). As the files become available the callbacks registered with `AddFileStatusCallback` are informed. These callbacks recieve a `status` object with one field for each of the filetypes (`pos`,`set`,`tet`, and `cut`) and a `filetype` string to say which file has just been loaded (or `null` if this is a "heads-up" occurring at the start of a load).  The four `status` fields store an integer with the following meanings:
  * 0 - file does not exist
  * 1 - file exists but has not been announced yet
  * 2 - this is the file currently being announced
  * 3 - file has already been announced

##### `CutChangeCallback` and `CutActionCallback`    
One of the main features of the GUI is its ability to modify cut groups.  Whenever a change is made both the `CutChangeCallback` and `CutActionCallback` "events" fire, there is supposed to be a slight difference between these two events (for more details see the comments at the top of `cut.js`). Modifying cuts should be a fluid process with no major delays or unresponsiveness. In order to achieve this, the `CUT` class keeps a list of immutable `cutInds` arrays.  Whenever one of these cutInds arrays needs to be modified, we create a new immutable and remove the old one.  Each immutable has a history of cut groups associated to it.  This makes it easy for the waveform rendering module (and other modules) to avoid doing unnecessary work.  A slight detail in the way the immutables are implemented is that they each occupy a "slot" in an array of slots.  When immutables are deleted and created, slots get reused (this prevents the array of immutables from growing too large).  Thus in order to distinguish between all the immutables that occupy a given slot over time, we have an extra property, which is the `generation` of the immutable in the slot. 

##### `canvasUpdatedListeners`    
This event fires whenever a new plot is produced for one of the groups.  It's a while since I've looked at this, but I think its only purpose is for telling the splitting tool when the new tile has been populated.  A more important thing to note is the way `T.CutSlotCanvasUpdate` operates as the "delivery" point for plots that are produced by the different modules (temporal autocorr, ratemap, waves).  The creation of these plots is triggered by the loading of the relevant files and by changes in the cut, i.e. it's not the case that some central part of the program requests a list of particular plots and then waits to have them produced.

##### `modeChangeCallbacks`    
This event fires when we toggle between normal and "drift" mode.  It hints at being a slightly more general event, but at the moment I think that is all it does.  Several of the plotting modules subscribe to this event so they can produce new plots whenever the mode changes.


**Rendering the waves**       

Rendering the waves is done on a hidden canvas using WebGL, the resulting images are then copied to small visible canvases on the page.  When the tetrode data is first loaded, it gets copied across to the GPU so that it can be used quickly during rendering.  Every effort is made to ensure that redundant rendering is avoided (making use of the immutable cut slot structure).  When we do need to render, a special vector is created that gives the x and y offset on the offscreen canvas for each wave, plus a colormap index for the wave.  We render a line from `t` to `t+1` for every single wave simultaneously, then increment `t` and render the next line (there are 50 points on the wave so 49 lines to be drawn per channel).  The rendering is done this way as it minimises the amount of data that needs to be written to the gpu for each render, it also makes for a very simple vertex shader.



