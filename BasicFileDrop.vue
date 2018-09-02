<template>
<div class="drop-area">
  <div class="drop-text" :class="{active: isDragging}">Drop file here</div>
</div>
</template>

<script>


export default {
  data: () => ({
    isDragging: false,
    value: {} // for use with v-model object mapping base to all files
  }),
  mounted(){
    if(this._eventsRegistered){
      return;
    }
    this._eventsRegistered = true;
    this._dragoverBound = this._dragover.bind(this);
    this._dropBound = this._drop.bind(this);
    document.addEventListener("dragover", this._dragoverBound);
    document.addEventListener("drop", this._dropBound);
  },
  destroyed(){
    if(!this._eventsRegistered){
      return;
    }
    document.addEventListener("dragover", this._dragoverBound);
    document.addEventListener("drop", this._dropBound);
    this._eventsRegistered = false;
  },
  methods: {
    _dragover(e){
      e.stopPropagation();
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
      this.isDragging = true;
      
      // drag over is fired every few ms, show dragging notification for at least 500ms 
      clearTimeout(this._dragEndTimer);
      this._dragEndTimer = setTimeout(() => this._isDragging = false, 500); 
    },
    _drop(e){
      e.stopPropagation();
      e.preventDefault();
      this._isDragging = false;
      let files = e.dataTransfer.files; // FileList object.
          
      let regex_file_ext = /\.([0-9a-z]+)$/i;
      const ignore_exts = new Set(['eeg', 'egf', 'eeg2', 'egf2', 'inp']); 
      let filesForBase = {};
      let pending_cut_files = [];

      // get lists of pos,set,tet files for each trial, and a single list of all cut files
      // and also store a reference to all those files by fkey
      for(let ii=0; ii< files.length; ii++){
          let ff = files[ii];
          let fname = ff.name;
          let ext = regex_file_ext.exec(fname);
          let base; // we will leave/set as undefined if we don't care about the file
          
          if (ext){
              ext = ext[1].toLowerCase();
              base = fname.slice(0, fname.length-ext.length-1);

              if(ext === "pos" || ext === "set"){
                  // good
              } else if(ignore_exts.has(ext)){
                  continue;
              } else if(ext === "cut"){
                  pending_cut_files.push(files[ii]);
                  base = undefined;
              } else if(!isNaN(parseInt(ext))){
                  if(base.slice(-4) === ".clu"){
                      if(base.slice(-9) === ".temp.clu"){
                          continue;
                      } else {
                          pending_cut_files.push(files[ii]);
                          base = undefined;
                      }
                  } else if(base.slice(-4) === ".fet" ||
                            base.slice(-4) === ".klg" ||
                            parseInt(ext) === 0){ // .0 files are DACQ rubbish
                      continue;
                  } // else a tet file
              } else {
                  continue; // entirely unknown file type
              }

              // store permanent reference to the file
              if(base){
                  // unless it was a cut, we now know the base ok...
                  let trial_files = filesForBase[base];
                  if(!trial_files){
                      trial_files = new Set();
                      filesForBase[base] = trial_files;
                  }
                  trial_files.add(files[ii]);
              }
          }
      }
      
      this.$emit('input', filesForBase);
      return;
      // TODO: the following...

      // try and assign cuts based on available trial bases (from this and previous drops)
      var all_bases = new Set();
      for(let [b, ignore] of this._trial_from_base){
          all_bases.add(b);
      }
      for(let [b, ignore] of files_for_base){
          all_bases.add(b);
      }
      var re = Utils.regex_from_list(Array.from(all_bases));
      var difficult_cut_files = [];
      if(re){
          while(pending_cut_files.length){
              let ff = pending_cut_files.pop();
              match = re.exec(ff.name);
              if(match){
                  match = match[0];
                  let trial_files = files_for_base.get(match);
                  if(!trial_files){
                      trial_files = new Set();
                      files_for_base.set(match, trial_files);
                  }
                  let fkey = Utils.file_manager.to_fkey(ff);
                  trial_files.add(fkey);
              } else {
                  let ext = regex_file_ext.exec(ff.name)[1].toLowerCase();
                  if(ext === "cut"){
                      difficult_cut_files.push(ff);
                  } // if it's a clu file we're stuffed
              }
          }       
      } else {
          difficult_cut_files = pending_cut_files;
      }

      if(difficult_cut_files.length){
          this._worker = this._worker || Polymer.DomModule.import('file-organiser', '#cut_reader').create_for(this);
          this._worker.exec('get_base_for_cuts', difficult_cut_files);
      }

      var trials = this.trials; // we are going to make a lot of changes to this, so we do a hack-ed notify-all at the end
      var available_tets = new Set(this.available_tets); // we want this as a set for use bellow...
      for(let [base, trial_files] of files_for_base){
          let trial = this._trial_from_base.get(base);
          if(!trial){
              trial = this._new_trial(base);
              this._trial_from_base.set(base, trial);
              trials.push(trial);
          }
          for(let fkey of trial_files){
              let ff = fkey.file;
              let ext = regex_file_ext.exec(ff.name)[1].toLowerCase();
              if(ext === "set"){
                  trial.set = fkey;
              } else if(ext === "pos"){
                  trial.pos = fkey;
              } else if (ext === "cut"){
                  // note we sort and de-dupe cuts at the end of the trial_files loop (TODO: that)
                  let num = ff.name.match(this._regex_cut_tet_num);
                  if(num){
                      num = parseInt(num[1]);
                      tet_obj = this._get_tet_obj(trial, num, true);
                      available_tets.add(num);
                      tet_obj.cuts.push({
                          cut: fkey,
                          cut_type: 'cut',
                          short_name: ff.name.replace(base, '~')
                      });
                  } 
              } else {
                  let tet_num = parseInt(ext);
                  let tet_obj = this._get_tet_obj(trial, tet_num, true);
                  available_tets.add(tet_num);
                  if(ff.name.slice(-ext.length-".clu".length -1, -ext.length-1) === ".clu"){
                      // clu file
                      tet_obj.cuts.push({
                          cut: fkey,
                          cut_type: 'clu',
                          short_name: ff.name.replace(base, '~')
                      });
                  } else {
                      // tet file
                      tet_obj.tet = fkey;
                  }
              }
          }
          this._sort_trial_innards(trial); // sort tets and cuts
      }


      trials.sort(function(a,b){
          return a.name > b.name ? 1 : -1;
      })
      available_tets = Array.from(available_tets);
      available_tets.sort(this._numeric_sort);
      this._setAvailable_tets(available_tets);
      this._reassign_trials_denovo(); // notify absolutely everything !!!

      if(this._use_url_search){
          // note we do this before sorting all the cuts, but whatever
          let match = (/exp=([^&]+)/g).exec(this._use_url_search);
          let url_trial = match && decodeURIComponent(match[1]);
          match = (/tet=([^&]+)/g).exec(this._use_url_search);
          let url_tet_num = match && parseInt(decodeURIComponent(match[1]));
          if(url_trial && this._trial_from_base.has(url_trial)){
              this.$.trial_list.selectItem(this._trial_from_base.get(url_trial));
          }
          if(url_tet_num && this.available_tets.indexOf(url_tet_num) > -1){
              this.set('selected_tet_num', url_tet_num);
          }
      }
      this._use_url_search = null;

    }
  }
}
</script>

<style lang="scss" scoped>
.drop-area{
  width: 80vw;
  height: 80vh;
  border: 10px dashed #ccc;
  margin: 5vh auto;
  .drop-text{
    font-size:32px;
    font-weight: bold;
    text-align: center;
    margin: 30vh;
    color: #999;
    &.active{
      color: #22ffaa;
    }
  }
}
</style>