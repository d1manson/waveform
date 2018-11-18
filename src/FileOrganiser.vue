<template>
  <div class="outer">
    <div v-if="showDropZone" class="drop-zone" :class="{dragging: isDragging}" ref="drop">
      drop .pos files here
    </div>
    <div v-else class="file-list">
      <div v-for="f in files" :key="f.name" class="file-row" @click="$emit('select-file',f)">
        {{f.name}}
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "FileOrganiser",
  data: () => ({
    isDragging: false,
    files: []
  }),
  computed: {
    showDropZone() {
      return !this.files.length;
    }
  },
  methods: {
    registerDropZone() {
      this._dragenter = e => {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = true;
      };
      this._dragleave = e => {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = false;
      };
      this._dragover = e => {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = true;
      };
      this._drop = e => {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = false;
        this.files = [...e.dataTransfer.files].filter(f =>
          f.name.endsWith(".pos")
        );
      };
      this._dropArea = this.$refs.drop;
      this._dropArea.addEventListener("dragenter", this._dragenter, false);
      this._dropArea.addEventListener("dragleave", this._dragleave, false);
      this._dropArea.addEventListener("dragover", this._dragover, false);
      this._dropArea.addEventListener("drop", this._drop, false);
    }
  },
  watch: {
    showDropZone: {
      immediate: true,
      handler(v) {
        v && this.$nextTick(() => this.registerDropZone());
      }
    }
  }
};
</script>

<style scoped>
.outer {
  display: flex;
  flex-direction: column;
}
.drop-zone {
  margin: 20px;
  border: 10px dashed #666;
  font-size: 18px;
  color: #666;
  font-weight: bold;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-grow: 1;
}
.drop-zone.dragging {
  border-color: rgb(248, 184, 7);
  background: rgb(199, 182, 135);
}
.file-list {
  flex-grow: 1;
  margin: 20px;
  font-size: 14px;
  border: 1px solid #000;
  padding: 10px;
}
.file-row {
  display: inline-block;
  background: rgb(137, 137, 161);
  border-radius: 4px;
  padding: 3px 8px;
  margin-right: 5px;
  cursor: pointer;
}
</style>
