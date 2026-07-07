<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import type { StickyNote } from '@/types/board.types'

const props = defineProps<{
  note: StickyNote
}>()

const emit = defineEmits<{
  save: [payload: { text: string; truncate: boolean }]
  close: []
}>()

const text = ref(props.note.text)
const truncate = ref(props.note.truncate)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

onMounted(async () => {
  await nextTick()
  textareaRef.value?.focus()
})

function save(): void {
  emit('save', { text: text.value, truncate: truncate.value })
}

function onOverlayClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
    emit('close')
  }
}
</script>

<template>
  <div class="modal-overlay" @click="onOverlayClick">
    <div class="modal-card">
      <h3 class="modal-title">Edit Sticky Note</h3>

      <textarea
        ref="textareaRef"
        v-model="text"
        class="text-input"
        placeholder="Type your note..."
        rows="6"
      />

      <label class="truncate-label">
        <input type="checkbox" v-model="truncate" />
        <span>Truncate at 100 chars in canvas view</span>
      </label>

      <div class="modal-actions">
        <button class="cancel-btn" @click="emit('close')">Cancel</button>
        <button class="save-btn" @click="save">Done</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  min-width: 320px;
  max-width: 420px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
}
.modal-title {
  margin: 0 0 12px;
  font-size: 16px;
  color: #1c1c1e;
}
.text-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d0d0d5;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: -apple-system, sans-serif;
  resize: vertical;
  outline: none;
}
.text-input:focus {
  border-color: #8b5cf6;
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.15);
}
.truncate-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
  color: #555;
  cursor: pointer;
}
.truncate-label input {
  accent-color: #8b5cf6;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.modal-actions button {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  border: none;
  cursor: pointer;
}
.cancel-btn {
  background: #f0f0f2;
  color: #555;
}
.save-btn {
  background: #8b5cf6;
  color: #fff;
}
.save-btn:hover {
  background: #7c4de8;
}
</style>
