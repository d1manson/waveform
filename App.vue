<template>
  <div id="app">
    <basic-file-drop
      v-model="filesForBase"
      />
  </div>
</template>

<script>
import BasicFileDrop from './BasicFileDrop';

export default {
  name: 'app',
  components: {
    BasicFileDrop
  },
  data: () => ({
    filesForBase: {},
  })
}
</script>

<style>
#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
}
</style>
