<template>
  <div id="app">
    <div class="title">Waveform</div>
    <FileOrganiser class="file-org"/>
  </div>
</template>

<script>
import FileOrganiser from "./FileOrganiser.vue";

export default {
  name: "app",
  components: {
    FileOrganiser
  }
};
</script>

<style>
#app {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
}
.file-org {
  min-height: 100px;
  max-height: 300px;
  flex-grow: 4;
}
.title {
  font-size: 18px;
  text-align: center;
  margin: 30px 0px;
  vertical-align: bottom;
}
</style>
