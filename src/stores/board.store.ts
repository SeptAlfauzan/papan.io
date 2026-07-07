import { ref, computed, readonly } from 'vue'
import { defineStore } from 'pinia'
import type { Stroke, HistoryEntry } from '@/types/board.types'

/**
 * Board store — single source of truth for all stroke data.
 *
 * Strokes held as plain reactive array (not deeply watched for perf).
 * renderVersion counter bumped on every mutation so canvas loop
 * knows when to re-draw without deep-watching every stroke object.
 *
 * History stack uses command pattern: each entry stores the full
 * Stroke objects so undo/redo can add/remove them reliably even
 * when strokes arrive out of order via sync.
 */
export const useBoardStore = defineStore('board', () => {
  // ── State ────────────────────────────────────────────────────────
  const strokes = ref<Stroke[]>([])
  const historyStack = ref<HistoryEntry[]>([])
  const historyIndex = ref(-1)
  /** Monotonically increasing counter — bump to schedule a canvas redraw */
  const renderVersion = ref(0)

  // ── Getters ──────────────────────────────────────────────────────
  const canUndo = computed(() => historyIndex.value >= 0)
  const canRedo = computed(() => historyIndex.value < historyStack.value.length - 1)

  // ── History helpers ──────────────────────────────────────────────
  function pushHistory(entry: HistoryEntry): void {
    // Discard any redo entries beyond current index
    historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
    historyStack.value.push(entry)
    historyIndex.value = historyStack.value.length - 1
  }

  // ── Mutations ────────────────────────────────────────────────────

  /** Add a finished stroke. Called from useCanvas when user finishes drawing. */
  function addStroke(stroke: Stroke): void {
    strokes.value = [...strokes.value, stroke]
    pushHistory({ type: 'add', strokes: [stroke] })
    renderVersion.value++
  }

  /**
   * Remove strokes by ID. Returns the removed strokes so callers can
   * reference them (e.g. for history).
   */
  function removeStrokes(strokeIds: string[]): Stroke[] {
    const removed: Stroke[] = []
    strokes.value = strokes.value.filter((s) => {
      if (strokeIds.includes(s.id)) {
        removed.push(s)
        return false
      }
      return true
    })
    if (removed.length > 0) {
      pushHistory({ type: 'erase', strokes: removed })
      renderVersion.value++
    }
    return removed
  }

  /**
   * Replace strokes with fragments (partial erase).
   * Pushes single history entry for undo/redo.
   */
  function replaceStrokes(removed: Stroke[], added: Stroke[]): void {
    const removedIds = new Set(removed.map(s => s.id))
    strokes.value = [
      ...strokes.value.filter(s => !removedIds.has(s.id)),
      ...added,
    ]
    pushHistory({ type: 'erase', strokes: removed, additions: added })
    renderVersion.value++
  }

  /** Undo the last operation */
  function undo(): void {
    if (historyIndex.value < 0) return
    const entry = historyStack.value[historyIndex.value]
    if (!entry) return
    if (entry.type === 'add') {
      const ids = new Set(entry.strokes.map((s) => s.id))
      strokes.value = strokes.value.filter((s) => !ids.has(s.id))
    } else if (entry.type === 'erase') {
      if (entry.additions && entry.additions.length > 0) {
        const aid = new Set(entry.additions.map(s => s.id))
        strokes.value = [...strokes.value.filter(s => !aid.has(s.id)), ...entry.strokes]
      } else {
        strokes.value = [...strokes.value, ...entry.strokes]
      }
    }
    historyIndex.value--
    renderVersion.value++
  }

  /** Redo a previously undone operation */
  function redo(): void {
    if (historyIndex.value >= historyStack.value.length - 1) return
    historyIndex.value++
    const entry = historyStack.value[historyIndex.value]
    if (!entry) return
    if (entry.type === 'add') {
      strokes.value = [...strokes.value, ...entry.strokes]
    } else if (entry.type === 'erase') {
      if (entry.additions && entry.additions.length > 0) {
        const eid = new Set(entry.strokes.map(s => s.id))
        strokes.value = [...strokes.value.filter(s => !eid.has(s.id)), ...entry.additions]
      } else {
        const ids = new Set(entry.strokes.map((s) => s.id))
        strokes.value = strokes.value.filter((s) => !ids.has(s.id))
      }
    }
    renderVersion.value++
  }

  /** Replace all strokes (used during full state sync after reconnect) */
  function replaceAllStrokes(newStrokes: Stroke[]): void {
    strokes.value = newStrokes
    renderVersion.value++
  }

  /** Clear history (useful after full sync or when starting fresh) */
  function clearHistory(): void {
    historyStack.value = []
    historyIndex.value = -1
  }

  // ── Public API ───────────────────────────────────────────────────
  return {
    strokes: readonly(strokes),
    historyStack: readonly(historyStack),
    historyIndex: readonly(historyIndex),
    renderVersion: readonly(renderVersion),
    canUndo,
    canRedo,
    addStroke,
    removeStrokes,
    replaceStrokes,
    undo,
    redo,
    replaceAllStrokes,
    clearHistory,
  }
})
