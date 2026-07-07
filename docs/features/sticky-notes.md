# Sticky Notes Feature

## Overview

Sticky notes are canvas-native rectangles that display user-entered text. Users place them via the sticky note tool (S), edit via double-click modal, and delete via Delete key or eraser (full-coverage only).

## Data Model

```ts
interface StickyNote {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  truncate: boolean
  color: string
}
```

## Tools

| Key | Tool | Action |
|-----|------|--------|
| S | sticky-note | Click to place, hover for preview |
| Double-click | any | Opens edit modal |
| Delete/Backspace | any | Deletes selected note |
| Eraser | eraser | Full-coverage deletes note |

## Rendering

Sticky notes render on canvas as rounded rects with drop shadow, border, and word-wrapped text. When `truncate` is enabled and text exceeds 100 chars, text shows first 100 chars + "...".

## Editing

- Double-click opens modal with `<textarea>` and truncate checkbox
- "Done" commits changes via `store.updateStickyNote`
- Cancel or backdrop click closes without changes

## Eraser Deletion

Eraser calculates union bounding rect of the eraser trail. A sticky note is deleted only if its entire bounding rect is inside the trail union rect (100% coverage).

## Sync

Events: `sticky:add`, `sticky:update`, `sticky:erase`. Same offline queue and reconnect resync pattern as strokes.
