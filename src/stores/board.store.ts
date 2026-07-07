import { ref, computed, readonly } from 'vue'
import { defineStore } from 'pinia'
import type { Stroke, StickyNote, HistoryEntry } from '@/types/board.types'

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
  const stickyNotes = ref<StickyNote[]>([])
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
    } else if (entry.type === 'sticky-add') {
      const ids = new Set(entry.stickyNotes?.map(n => n.id) ?? [])
      stickyNotes.value = stickyNotes.value.filter(n => !ids.has(n.id))
    } else if (entry.type === 'sticky-erase') {
      if (entry.stickyNotes) stickyNotes.value = [...stickyNotes.value, ...entry.stickyNotes]
    } else if (entry.type === 'sticky-edit') {
      const prev = entry.stickyNotes?.[0]
      if (prev) {
        const idx = stickyNotes.value.findIndex(n => n.id === prev.id)
        if (idx !== -1) stickyNotes.value[idx] = { ...prev }
        stickyNotes.value = [...stickyNotes.value]
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
    } else if (entry.type === 'sticky-add') {
      if (entry.stickyNotes) stickyNotes.value = [...stickyNotes.value, ...entry.stickyNotes]
    } else if (entry.type === 'sticky-erase') {
      const ids = new Set(entry.stickyNotes?.map(n => n.id) ?? [])
      stickyNotes.value = stickyNotes.value.filter(n => !ids.has(n.id))
    } else if (entry.type === 'sticky-edit') {
      const next = entry.stickyNotes?.[1]
      if (next) {
        const idx = stickyNotes.value.findIndex(n => n.id === next.id)
        if (idx !== -1) stickyNotes.value[idx] = { ...next }
        else stickyNotes.value = [...stickyNotes.value, { ...next }]
        stickyNotes.value = [...stickyNotes.value]
      }
    }
    renderVersion.value++
  }

  /** Replace all strokes (used during full state sync after reconnect) */
  function replaceAllStrokes(newStrokes: Stroke[]): void {
    strokes.value = newStrokes
    renderVersion.value++
  }

  // ── Sticky note mutations ─────────────────────────────────────────

  function autoSizeNote(note: StickyNote): void {
    const charWidth = 8
    const lineHeight = 20
    const padding = 24
    const maxLineChars = 20
    const lines = note.text ? Math.ceil(note.text.length / maxLineChars) : 1
    const w = note.text.length > 0
      ? Math.max(Math.min(note.text.length * charWidth + padding, maxLineChars * charWidth + padding), 150)
      : 150
    const h = Math.max(lines * lineHeight + padding, 100)
    note.width = w
    note.height = h
  }

  function addStickyNote(note: StickyNote): void {
    autoSizeNote(note)
    stickyNotes.value = [...stickyNotes.value, note]
    pushHistory({ type: 'sticky-add', strokes: [], stickyNotes: [note] })
    renderVersion.value++
  }

  function removeStickyNote(id: string): void {
    const removed = stickyNotes.value.find(n => n.id === id)
    if (!removed) return
    stickyNotes.value = stickyNotes.value.filter(n => n.id !== id)
    pushHistory({ type: 'sticky-erase', strokes: [], stickyNotes: [removed] })
    renderVersion.value++
  }

  function removeStickyNotes(ids: string[]): void {
    const removed = stickyNotes.value.filter(n => ids.includes(n.id))
    if (removed.length === 0) return
    stickyNotes.value = stickyNotes.value.filter(n => !ids.includes(n.id))
    pushHistory({ type: 'sticky-erase', strokes: [], stickyNotes: removed })
    renderVersion.value++
  }

  function updateStickyNote(id: string, patch: Partial<Pick<StickyNote, 'text' | 'truncate'>>): void {
    const note = stickyNotes.value.find(n => n.id === id)
    if (!note) return
    const prev = { ...note }
    if (patch.text !== undefined) note.text = patch.text
    if (patch.truncate !== undefined) note.truncate = patch.truncate
    autoSizeNote(note)
    const next = { ...note }
    pushHistory({ type: 'sticky-edit', strokes: [], stickyNotes: [prev, next] })
    renderVersion.value++
  }

  function replaceAllStickyNotes(notes: StickyNote[]): void {
    stickyNotes.value = notes
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
    stickyNotes: readonly(stickyNotes),
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
    addStickyNote,
    removeStickyNote,
    removeStickyNotes,
    updateStickyNote,
    replaceAllStickyNotes,
    clearHistory,
  }
})
