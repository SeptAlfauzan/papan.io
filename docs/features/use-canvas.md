# useCanvas Composable Feature

## Overview

`useCanvas` is the core canvas composable that manages the infinite canvas experience. It owns the canvas element lifecycle, camera, pointer event routing, render loop, and outgoing sync integration.

## Architecture

### Reactive State (exposed to template/toolbar)
| Ref | Type | Default | Description |
|-----|------|---------|-------------|
| `canvasEl` | `HTMLCanvasElement` | `null` | Canvas element ref |
| `tool` | `ToolMode` | `'pencil'` | Active tool |
| `color` | `string` | `'#3a3a3c'` | Stroke color |
| `strokeWidth` | `number` | `4` | Stroke width in px |
| `zoomDisplay` | `number` | `100` | Zoom percentage for UI |
| `spaceHeld` | `boolean` | `false` | Space key held (temporary pan) |
| `isPointerDown` | `boolean` | `false` | Any pointer down |
| `culledStats` | `{rendered, total}` | `{0,0}` | Render stats for debug badge |
| `canUndo` | `computed` | — | Derived from store.canUndo |
| `canRedo` | `computed` | — | Derived from store.canRedo |
| `cursorStyle` | `computed` | — | CSS cursor string |

### Non-Reactive State (perf-critical)
- `camera: CameraState` — plain object `{x, y, zoom}`
- `canvasSize: {w, h}` — plain object
- `ctx: CanvasRenderingContext2D` — 2D context reference
- `dirty: boolean` — flag for rAF loop
- `rafId: number` — requestAnimationFrame ID
- `hoverPos: {x, y}` — screen-space cursor position
- Gesture tracking: `activePointers`, `panState`, `pinchState`
- `drawState: Stroke` — in-progress stroke
- `eraseState: {cutStrokes, fullyErasedIds}` — in-progress partial erase tracking

### Unique ID Generation
```ts
const CLIENT_ID = Math.random().toString(36).slice(2, 8)
let idCounter = 0
function uid(): string {
  return `${CLIENT_ID}_${Date.now()}_${++idCounter}`
}
```

### Camera Controls

#### `moveCamera(dx, dy)`
Translates camera by (dx, dy) screen pixels. Divides by zoom so movement stays under cursor.

#### `zoomAt(sx, sy, z)`
Zooms so world point under `(sx, sy)` stays glued to cursor.
1. Clamps zoom to `[MIN_ZOOM, MAX_ZOOM] = [0.05, 8]`
2. Computes world point before zoom
3. Applies zoom
4. Adjusts camera offset so world-under-cursor is unchanged

### Resize

`resize()` handles DPI-aware canvas sizing:
- Reads `getBoundingClientRect()` for CSS dimensions
- Multiplies by `devicePixelRatio` for backing store
- Updates `canvasSize` for coordinate transforms

### Render Loop

```
loop() ──► dirty? ──► draw() ──► requestAnimationFrame(loop)
```

`draw()` merges committed store strokes with in-progress `drawState`, then calls `canvas-engine.renderFrame()`.

### Pointer Events

#### `onPointerDown(e)`
1. Captures pointer
2. Single pointer → starts action based on tool:
   - **hand** / middle-click: start pan
   - **pencil**: start stroke (create `drawState` with initial point + bounding box)
   - **eraser**: start erase (create `eraseState`, run `eraseAt`)
3. Second pointer → switches to pinch-zoom mode

#### `onPointerMove(e)`
1. Hover tracking (no active pointer) → update `hoverPos`
2. Pinch zoom → update camera based on two-finger distance/midpoint
3. Pan → translate camera
4. Draw → append point, expand bounding box
5. Erase → run `eraseAt`

#### `onPointerUp(e)`
1. Remove pointer from tracking
2. Last pointer up → `finalizeStroke()` / `finalizeErase()` → commit to store + sync
3. Single remaining pointer with hand → resume pan

#### `onPointerLeave(e)`
Clears `hoverPos` when cursor leaves canvas (no active pointer).

### Eraser Logic

`eraseAt(sx, sy)`: converts screen pos to world, computes eraser radius in world space (`ERASE_RADIUS_SCREEN / zoom`), iterates strokes with viewport culling + AABB fat check, then `strokeErasedPoints` to collect per-point cut indices per stroke. Accumulates cut points across eraser sweep.

`carveStroke(stroke, cutPoints)`: walks stroke points and groups consecutive non-cut runs into fragment sub-strokes. Skips fully-erased strokes (returns `[]`).

`createFragment(original, points)`: builds a new `Stroke` from a point array with computed bounding box, new UID, and inherited color/width.

### Finalize Operations

- `finalizeStroke()`: `store.addStroke(drawState)` + `sendStrokeAdd(drawState)`
- `finalizeErase()`: for each affected stroke, removes original via `store.replaceStrokes()` or `store.removeStrokes()`, syncs removals (`sendStrokeErase`) and additions (`sendStrokeAdd` for each fragment)

### Wheel Handler

`onWheel(e)`:
- Ctrl/Meta + scroll → `zoomAt` with exponential zoom factor
- Plain scroll → `moveCamera` with delta

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Space (hold) | Temporary hand tool |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Redo |
| P | Select pencil tool |
| H | Select hand tool |
| E | Select eraser tool |
| Window blur | Reset all transient states |

### Toolbar Actions

- `zoomInBtn()`: zoom ×1.25 at canvas center
- `zoomOutBtn()`: zoom ÷1.25 at canvas center
- `resetView()`: camera to (0,0,1), display to 100%

### Lifecycle

`onMounted`:
1. Get canvas 2D context
2. `resize()` + `window.resize` listener
3. `window.keydown/keyup/blur` listeners
4. Start `loop()`

`onUnmounted`:
1. Cancel rAF
2. Remove all event listeners

## API Surface

```ts
export function useCanvas() {
  return {
    // Reactive state
    canvasEl, tool, color, strokeWidth, zoomDisplay,
    canUndo, canRedo, culledStats, cursorStyle,
    // Event handlers
    onPointerDown, onPointerMove, onPointerUp,
    onPointerLeave, onWheel,
    // Toolbar actions
    undo, redo, zoomInBtn, zoomOutBtn, resetView,
  }
}
```

## Testing Notes

Integration-level composable requiring Pinia store + canvas element.
Key behaviors:
- `onPointerDown` with pencil creates drawState with correct initial point
- `onPointerMove` during draw appends points and expands bbox
- `finalizeStroke` commits to store and calls sync
- `zoomAt` maintains world-under-cursor invariance
- `resetView` resets camera to origin
- Pinch zoom updates camera correctly
- Keyboard shortcuts switch tools and trigger undo/redo
- `uid` generates unique, ordered IDs
- `eraseAt` hits visible strokes and accumulates erased IDs