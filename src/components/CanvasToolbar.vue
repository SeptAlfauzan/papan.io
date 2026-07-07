<script setup lang="ts">
/**
 * CanvasToolbar — Floating toolbar for the infinite canvas.
 *
 * All state is provided from BoardView (which owns useCanvas).
 */
import type { ToolMode } from '@/types/board.types'

defineProps<{
  tool: ToolMode
  color: string
  strokeWidth: number
  zoomDisplay: number
  canUndo: boolean
  canRedo: boolean
}>()

const emit = defineEmits<{
  'update:tool': [value: ToolMode]
  'update:color': [value: string]
  'update:strokeWidth': [value: number]
  undo: []
  redo: []
  zoomIn: []
  zoomOut: []
  resetView: []
}>()
</script>

<template>
  <div class="toolbar">
    <!-- Pencil -->
    <button
      :class="{ active: tool === 'pencil' }"
      @click="emit('update:tool', 'pencil')"
      title="Pencil (P)"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
        <line x1="4" y1="20" x2="20" y2="4" />
        <polyline points="4 17 4 20 7 20" />
        <line x1="13.5" y1="7.5" x2="16.5" y2="10.5" />
      </svg>
    </button>

    <!-- Hand -->
    <button
      :class="{ active: tool === 'hand' }"
      @click="emit('update:tool', 'hand')"
      title="Hand tool (H)"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="3" x2="12" y2="21" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <polyline points="9 6 12 3 15 6" />
        <polyline points="9 18 12 21 15 18" />
        <polyline points="6 9 3 12 6 15" />
        <polyline points="18 9 21 12 18 15" />
      </svg>
    </button>

    <!-- Eraser -->
    <button
      :class="{ active: tool === 'eraser' }"
      @click="emit('update:tool', 'eraser')"
      title="Eraser (E)"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="9" width="16" height="9" rx="2" />
        <line x1="4" y1="14" x2="20" y2="14" />
        <line x1="9" y1="9" x2="9" y2="18" />
      </svg>
    </button>

    <div class="divider" />

    <!-- Undo -->
    <button :disabled="!canUndo" @click="emit('undo')" title="Undo (Ctrl+Z)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 8H4V5" />
        <path d="M4.5 15a8 8 0 1 0 2.5-9.5L4 8" />
      </svg>
    </button>

    <!-- Redo -->
    <button :disabled="!canRedo" @click="emit('redo')" title="Redo (Ctrl+Shift+Z)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 8h3V5" />
        <path d="M19.5 15a8 8 0 1 1-2.5-9.5L20 8" />
      </svg>
    </button>

    <div class="divider" />

    <!-- Color -->
    <input
      type="color"
      :value="color"
      @input="emit('update:color', ($event.target as HTMLInputElement).value)"
      title="Color"
    />

    <!-- Stroke width slider -->
    <input
      type="range"
      min="1"
      max="40"
      :value="strokeWidth"
      @input="emit('update:strokeWidth', Number(($event.target as HTMLInputElement).value))"
      title="Stroke size"
    />
    <span class="size-label">{{ strokeWidth }}px</span>

    <div class="divider" />

    <!-- Zoom out -->
    <button @click="emit('zoomOut')" title="Zoom out">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>

    <!-- Zoom reset / readout -->
    <button class="zoom-readout" @click="emit('resetView')" title="Reset view">
      {{ zoomDisplay }}%
    </button>

    <!-- Zoom in -->
    <button @click="emit('zoomIn')" title="Zoom in">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.toolbar {
  position: absolute;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  background: #1c1c1e;
  border: 1px solid #2e2e30;
  padding: 6px;
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28), 0 1px 0 rgba(255, 255, 255, 0.04) inset;
  user-select: none;
  z-index: 10;
}

.toolbar button {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 9px;
  color: #8a8a90;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
}

.toolbar button svg {
  width: 18px;
  height: 18px;
}

.toolbar button:hover:not(:disabled) {
  background: #2a2a2d;
  color: #e7e7ea;
}

.toolbar button:active:not(:disabled) {
  transform: scale(0.92);
}

.toolbar button.active {
  background: rgba(139, 92, 246, 0.18);
  color: #8b5cf6;
}

.toolbar button:disabled {
  opacity: 0.35;
  cursor: default;
}

.toolbar .divider {
  width: 1px;
  height: 22px;
  background: #2e2e30;
  margin: 0 4px;
}

.toolbar input[type='color'] {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: none;
  padding: 0;
  cursor: pointer;
}

.toolbar input[type='color']::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.toolbar input[type='color']::-webkit-color-swatch {
  border-radius: 6px;
  border: 1px solid #2e2e30;
}

.toolbar input[type='range'] {
  width: 80px;
  accent-color: #8b5cf6;
  margin: 0 4px;
}

.size-label {
  color: #8a8a90;
  font-size: 11px;
  width: 28px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.zoom-readout {
  font-size: 12px;
  width: 50px;
  color: #8a8a90;
  font-variant-numeric: tabular-nums;
}

.zoom-readout:hover {
  color: #e7e7ea;
}
</style>
