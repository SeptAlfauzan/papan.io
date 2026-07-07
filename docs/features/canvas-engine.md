# Canvas Engine Feature

## Overview

The Canvas Engine (`canvas-engine.ts`) is a pure rendering library with zero Vue dependencies. It accepts all state as parameters and returns culling statistics. Designed to be called from the rAF loop in `useCanvas`.

## Architecture

### Constants
- `GRID_SPACING = 40` — world units between grid dots
- `ERASE_RADIUS_SCREEN = 16` — screen-space pixels for eraser hit area

### Coordinate Transforms

#### `screenToWorld(sx, sy, camera, canvasWidth, canvasHeight)`
Converts screen-space position to world coordinates.
```ts
{ x: (sx - canvasWidth/2) / camera.zoom + camera.x,
  y: (sy - canvasHeight/2) / camera.zoom + camera.y }
```

#### `getViewportBounds(camera, canvasWidth, canvasHeight)`
Computes visible world-space bounds for viewport culling.
```ts
const halfW = canvasWidth / 2 / camera.zoom
const halfH = canvasHeight / 2 / camera.zoom
return { minX: camera.x - halfW, maxX: camera.x + halfW,
         minY: camera.y - halfH, maxY: camera.y + halfH }
```

#### `boundsIntersect(stroke, viewportBounds)`
AABB test: returns true if stroke's bounding box overlaps viewport.

### Rendering Primitives

#### `drawGrid(ctx, viewportBounds, zoom)`
Draws adaptive dot grid. Hides when screen-space spacing < 6px (too dense).
- Grid spacing scales with zoom
- Dot radius adapts: `Math.max(1, 1.4 / zoom)`

#### `drawStroke(ctx, stroke, color?)`
Renders a single stroke using quadratic Bézier smoothing.
- Single point → filled circle (radius = width/2)
- Multiple points → quadratic curves between midpoints
- `lineJoin = 'round'`, `lineCap = 'round'`
- Optional `color` overrides stroke's own color (used for erase preview shadow)

#### `drawCursorPreview(ctx, hoverPos, tool, zoom, color, strokeWidth)`
- Pencil: circle at `hoverPos` with radius `(strokeWidth * zoom) / 2`
- Eraser: dashed circle at `hoverPos` with radius `ERASE_RADIUS_SCREEN`

### Erase Preview Overlay

#### `ErasePreviewData`
```ts
interface ErasePreviewData {
  fullyErasedIds: Set<string>
  cutPoints: Map<string, Set<number>>
}
```

#### `drawErasePreview(ctx, strokes, preview)`
Draws red shadow (`rgba(255,0,0,0.2)`) on strokes/segments that will be erased:
- Fully erased strokes: entire stroke rendered as red shadow via `drawStroke` with color override
- Partially erased: individual line segments between consecutive cut points drawn in red

### Hit Testing

#### `strokeErasedPoints(stroke, point, radius)`
Returns `Set<number>` of point indices within eraser radius. Used for point-level partial erase.
1. Single point: distance check
2. Multi-point: segment distance check using `pointSegmentDistance`, marks both endpoints of hit segments

#### `strokeHit(stroke, point, radius)`
Returns true if eraser circle hits any segment of stroke.
1. Quick AABB rejection with padding
2. Single point: distance check
3. Multi-point: segment distance check using `pointSegmentDistance`

### Main Entry Point

#### `renderFrame(...)`
Full frame render: clear → apply camera → draw grid → draw culled strokes → draw erase preview (if active) → draw cursor preview.

**Parameters:**
- `ctx` — CanvasRenderingContext2D
- `canvasPixelWidth/Height` — backing store pixels (CSS size × DPR)
- `cssWidth/Height` — CSS layout size
- `dpr` — devicePixelRatio
- `camera` — CameraState {x, y, zoom}
- `strokes` — readonly Stroke[]
- `hoverPos` — screen-space cursor position or null
- `tool` — ToolMode
- `color` — current stroke color
- `strokeWidth` — current stroke width
- `erasePreview?` — optional `ErasePreviewData` for red shadow overlay

**Returns:** `RenderResult { rendered: number, total: number }` — stats for debug badge

**Camera Transform Pipeline:**
```ts
ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
ctx.translate(cssWidth/2, cssHeight/2)
ctx.scale(camera.zoom, camera.zoom)
ctx.translate(-camera.x, -camera.y)
// ... draw in world space ...
ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // back to screen space for cursor
```

## API Surface

```ts
export const GRID_SPACING = 40
export const ERASE_RADIUS_SCREEN = 16

export function screenToWorld(...): { x: number; y: number }
export function getViewportBounds(...): { minX, maxX, minY, maxY }
export function boundsIntersect(s, vp): boolean
export function strokeHit(stroke, pt, radius): boolean
export function strokeErasedPoints(stroke, pt, radius): Set<number>
export function renderFrame(...): RenderResult

export interface RenderResult { rendered: number; total: number }
export interface ErasePreviewData { fullyErasedIds: Set<string>; cutPoints: Map<string, Set<number>> }
```

## Testing Notes

Pure functions — ideal for unit tests. Key test cases:

- `screenToWorld`: identity at zoom=1, center; inverse of world→screen
- `getViewportBounds`: correct bounds at various zooms/positions
- `boundsIntersect`: true/false for overlapping/non-overlapping AABBs
- `strokeHit`: single point, multi-segment, AABB early-out
- `drawStroke`: single point → circle; multi-point → quadratic curves
- `renderFrame`: returns correct culled counts; transform pipeline correct

All functions accept plain objects — no mocking needed.