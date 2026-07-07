<script setup lang="ts">
/**
 * BoardView — Fullscreen infinite canvas with toolbar.
 *
 * Assembles useCanvas (drawing / camera / pointer events)
 * and useBoardSocket (WebSocket sync + offline queue).
 */
import { computed } from 'vue'
import { useCanvas } from '@/composables/useCanvas'
import { useBoardSocket } from '@/composables/useBoardSocket'
import { useBoardStore } from '@/stores/board.store'
import CanvasToolbar from '@/components/CanvasToolbar.vue'
import StickyNoteModal from '@/components/StickyNoteModal.vue'
import { sendStickyUpdate } from '@/services/sync.service'
import type { StickyNote } from '@/types/board.types'

const {
  canvasEl,
  tool,
  color,
  strokeWidth,
  zoomDisplay,
  canUndo,
  canRedo,
  culledStats,
  cursorStyle,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onWheel,
  undo,
  redo,
  zoomInBtn,
  zoomOutBtn,
  resetView,
  editingStickyId,
  closeStickyEdit,
} = useCanvas()

const { statusLabel } = useBoardSocket()

const store = useBoardStore()

const editingNote = computed(() => {
  if (!editingStickyId.value) return null
  return store.stickyNotes.find(n => n.id === editingStickyId.value) ?? null
})

function onStickySave(payload: { text: string; truncate: boolean }): void {
  if (!editingStickyId.value) return
  const note = store.stickyNotes.find(n => n.id === editingStickyId.value)
  if (!note) return
  store.updateStickyNote(editingStickyId.value, payload)
  sendStickyUpdate(editingStickyId.value, payload)
  closeStickyEdit()
}

function onStickyClose(): void {
  closeStickyEdit()
}
</script>

<template>
  <div class="board-root">
    <!-- Canvas — captures all pointer events for drawing/pan/erase -->
    <canvas
      ref="canvasEl"
      :style="{ cursor: cursorStyle }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
      @wheel.prevent="onWheel"
      @contextmenu.prevent
    />

    <!-- Tip overlay -->
    <div class="hint">
      Pencil to draw · Hand tool or middle-click to pan · trackpad
      two-finger scroll pans, pinch or Ctrl+scroll zooms · two-finger
      touch pans &amp; zooms · hold Space to pan temporarily
    </div>

    <!-- Culling stats badge -->
    <div class="stats-badge">
      {{ culledStats.rendered }} / {{ culledStats.total }} strokes rendered (culled)
    </div>

    <!-- Connection status badge -->
    <div class="status-badge" :class="statusLabel === 'connected' ? 'online' : 'offline'">
      {{ statusLabel }}
    </div>

    <!-- Sticky note editing modal -->
    <StickyNoteModal
      v-if="editingNote"
      :note="editingNote"
      @save="onStickySave"
      @close="onStickyClose"
    />

    <!-- Toolbar -->
    <CanvasToolbar
      :tool="tool"
      :color="color"
      :stroke-width="strokeWidth"
      :zoom-display="zoomDisplay"
      :can-undo="canUndo"
      :can-redo="canRedo"
      @update:tool="tool = $event"
      @update:color="color = $event"
      @update:stroke-width="strokeWidth = $event"
      @undo="undo"
      @redo="redo"
      @zoom-in="zoomInBtn"
      @zoom-out="zoomOutBtn"
      @reset-view="resetView"
    />
  </div>
</template>

<style scoped>
/* ── Fullscreen break-out from #app layout ─────────────────────── */
.board-root {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #f6f5f2;
}

canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  background: #f6f5f2;
}

/* ── Overlay badges ────────────────────────────────────────────── */
.stats-badge {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(28, 28, 30, 0.85);
  color: #d8d8dc;
  font-size: 12px;
  letter-spacing: 0.02em;
  padding: 6px 10px;
  border-radius: 8px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  backdrop-filter: blur(6px);
  z-index: 10;
}

.status-badge {
  position: absolute;
  top: 16px;
  right: 270px;
  background: rgba(28, 28, 30, 0.85);
  font-size: 11px;
  letter-spacing: 0.03em;
  padding: 4px 10px;
  border-radius: 8px;
  pointer-events: none;
  backdrop-filter: blur(6px);
  z-index: 10;
  transition: color 0.3s;
}

.status-badge.online {
  color: #4ade80;
}

.status-badge.offline {
  color: #f87171;
}

.hint {
  position: absolute;
  top: 16px;
  left: 16px;
  background: rgba(28, 28, 30, 0.85);
  color: #d8d8dc;
  font-size: 11.5px;
  line-height: 1.5;
  padding: 8px 12px;
  border-radius: 8px;
  pointer-events: none;
  max-width: 240px;
  z-index: 10;
}
</style>
