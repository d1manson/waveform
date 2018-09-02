<template>
  <div id="app">
    This is in {{framework}}.
  </div>
</template>

<script>

export default {
  name: 'app',
  data: () => ({
    framework: "Vue, of course"
  })
}
</script>

<style>
#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
