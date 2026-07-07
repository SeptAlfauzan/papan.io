# Board Store Feature

## Overview

The Board Store (`useBoardStore`) is the single source of truth for all stroke data in the infinite canvas application. It manages stroke storage, undo/redo history, and provides a reactive interface for the canvas rendering loop.

## Architecture

### State
- **strokes**: Reactive array of `Stroke` objects — the canonical list of all committed strokes
- **historyStack**: Array of `HistoryEntry` objects implementing the command pattern for undo/redo
- **historyIndex**: Integer pointer into `historyStack` (-1 = no history)
- **renderVersion**: Monotonically increasing counter bumped on every mutation; canvas render loop watches this to know when to redraw without deep-watching stroke objects

### Getters
- **canUndo**: `historyIndex >= 0`
- **canRedo**: `historyIndex < historyStack.length - 1`

### Mutations

| Method | Description | Side Effects |
|--------|-------------|--------------|
| `addStroke(stroke)` | Append a completed stroke | Pushes `HistoryEntry{type:'add', strokes:[stroke]}`; bumps `renderVersion` |
| `removeStrokes(strokeIds)` | Remove strokes by ID array | Returns removed strokes; pushes `HistoryEntry{type:'erase', strokes:removed}`; bumps `renderVersion` |
| `replaceStrokes(removed, added)` | Partial-erase: remove originals, add fragments | Pushes single `HistoryEntry{type:'erase', strokes:removed, additions:added}`; bumps `renderVersion` |
| `undo()` | Revert last history entry | Pops or reverses entry; handles `additions` (removes fragments, restores originals); decrements `historyIndex`; bumps `renderVersion` |
| `redo()` | Re-apply next history entry | Advances `historyIndex`; re-applies entry; handles `additions` (removes originals, restores fragments); bumps `renderVersion` |
| `replaceAllStrokes(strokes)` | Full state replacement (used on sync reconnect) | Replaces `strokes`; bumps `renderVersion` |
| `clearHistory()` | Reset history stack | Clears `historyStack`, resets `historyIndex = -1` |

### History Entry Format
```ts
type HistoryEntry = {
  type: 'add' | 'erase'
  strokes: Stroke[]
  additions?: Stroke[]  // present for partial-erase entries
}
```
Each entry stores full `Stroke` objects so undo/redo works correctly even when strokes arrive out-of-order via WebSocket sync.
`additions` field holds replacement fragments for partial-erase operations (`replaceStrokes`).

### Render Version Pattern
The `renderVersion` counter avoids deep reactivity on the `strokes` array. The canvas render loop (in `useCanvas`) watches only this integer. Any mutation that should trigger a redraw increments the counter. This is a deliberate performance optimization for high-frequency rendering (60fps canvas loop).

## API Surface

```ts
export const useBoardStore = defineStore('board', () => {
  // State
  const strokes = ref<Stroke[]>([])
  const historyStack = ref<HistoryEntry[]>([])
  const historyIndex = ref(-1)
  const renderVersion = ref(0)

  // Getters
  const canUndo = computed(() => historyIndex.value >= 0)
  const canRedo = computed(() => historyIndex.value < historyStack.value.length - 1)

  // Mutations
  function addStroke(stroke: Stroke): void
  function removeStrokes(strokeIds: string[]): Stroke[]
  function replaceStrokes(removed: Stroke[], added: Stroke[]): void
  function undo(): void
  function redo(): void
  function replaceAllStrokes(newStrokes: Stroke[]): void
  function clearHistory(): void

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
```

## Usage

```ts
import { useBoardStore } from '@/stores/board.store'

const store = useBoardStore()

// Add a finished stroke (called from useCanvas)
store.addStroke(stroke)

// Erase strokes (called from useCanvas eraser)
store.removeStrokes(strokeIds)

// Toolbar undo/redo buttons
store.undo()
store.redo()

// React to changes in template
<div v-for="stroke in store.strokes" :key="stroke.id">...</div>
<button :disabled="!store.canUndo" @click="store.undo">Undo</button>
```

## Testing Notes

Key behaviors to verify:
- `addStroke` appends and creates history entry
- `removeStrokes` returns removed strokes and creates erase history
- `undo` on add entry removes strokes; `redo` restores them
- `undo` on erase entry restores strokes; `redo` removes them again
- `replaceAllStrokes` replaces entire array and bumps version
- `clearHistory` resets stack and index
- `renderVersion` increments on every mutation
- `canUndo`/`canRedo` computed reflect index boundaries
- Reactive `strokes` array is exposed as `readonly` (prevents external mutation)