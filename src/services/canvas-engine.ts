/**
 * canvas-engine.ts — Pure rendering functions for the infinite canvas.
 *
 * No Vue dependencies. Accepts all state as parameters and returns
 * culling stats. Designed to be called from the rAF loop in useCanvas.
 */
import type { Stroke, CameraState, ToolMode } from '@/types/board.types'

// ── Constants ───────────────────────────────────────────────────────
export const GRID_SPACING = 40        // world units between grid dots
export const ERASE_RADIUS_SCREEN = 16 // screen-space pixels for eraser hit area

// ── Helpers ─────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function pointSegmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return dist(p, a)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = clamp(t, 0, 1)
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}

// ── Coordinate transforms ───────────────────────────────────────────

/** Convert a screen-space position to world coordinates */
export function screenToWorld(
  sx: number,
  sy: number,
  camera: CameraState,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  return {
    x: (sx - canvasWidth / 2) / camera.zoom + camera.x,
    y: (sy - canvasHeight / 2) / camera.zoom + camera.y,
  }
}

/** Compute visible world-space bounds for viewport culling */
export function getViewportBounds(
  camera: CameraState,
  canvasWidth: number,
  canvasHeight: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const halfW = canvasWidth / 2 / camera.zoom
  const halfH = canvasHeight / 2 / camera.zoom
  return {
    minX: camera.x - halfW,
    maxX: camera.x + halfW,
    minY: camera.y - halfH,
    maxY: camera.y + halfH,
  }
}

/** Check whether a stroke's bounding box overlaps the viewport */
export function boundsIntersect(
  s: Stroke,
  vp: { minX: number; maxX: number; minY: number; maxY: number },
): boolean {
  return s.maxX >= vp.minX && s.minX <= vp.maxX && s.maxY >= vp.minY && s.minY <= vp.maxY
}

// ── Rendering primitives ────────────────────────────────────────────

/** Dot grid that adapts to zoom level — hides when dots get too dense */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  vp: { minX: number; maxX: number; minY: number; maxY: number },
  zoom: number,
): void {
  const screenSpacing = GRID_SPACING * zoom
  if (screenSpacing < 6) return // too dense — skip
  const startX = Math.floor(vp.minX / GRID_SPACING) * GRID_SPACING
  const startY = Math.floor(vp.minY / GRID_SPACING) * GRID_SPACING
  ctx.fillStyle = 'rgba(0,0,0,0.09)'
  const r = Math.max(1, 1.4 / zoom)
  for (let x = startX; x <= vp.maxX; x += GRID_SPACING) {
    for (let y = startY; y <= vp.maxY; y += GRID_SPACING) {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** Render a single stroke using quadratic bezier smoothing */
function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, color?: string): void {
  const pts = stroke.points
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = color ?? stroke.color
  ctx.fillStyle = color ?? stroke.color
  ctx.lineWidth = stroke.width

  if (pts.length === 1) {
    const p0 = pts[0]!
    ctx.beginPath()
    ctx.arc(p0[0], p0[1], stroke.width / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  const first = pts[0]!
  ctx.beginPath()
  ctx.moveTo(first[0], first[1])
  for (let i = 1; i < pts.length - 1; i++) {
    const cur = pts[i]!
    const next = pts[i + 1]!
    const mx = (cur[0] + next[0]) / 2
    const my = (cur[1] + next[1]) / 2
    ctx.quadraticCurveTo(cur[0], cur[1], mx, my)
  }
  const last = pts[pts.length - 1]!
  ctx.lineTo(last[0], last[1])
  ctx.stroke()
}

/** Draw the on-canvas cursor preview ring (pencil size / eraser circle) */
function drawCursorPreview(
  ctx: CanvasRenderingContext2D,
  hoverPos: { x: number; y: number },
  tool: ToolMode,
  zoom: number,
  color: string,
  strokeWidth: number,
): void {
  if (tool === 'pencil') {
    ctx.beginPath()
    ctx.arc(hoverPos.x, hoverPos.y, (strokeWidth * zoom) / 2, 0, Math.PI * 2)
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.stroke()
  } else if (tool === 'eraser') {
    ctx.beginPath()
    ctx.arc(hoverPos.x, hoverPos.y, ERASE_RADIUS_SCREEN, 0, Math.PI * 2)
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])
  }
}

// ── Erase preview overlay ─────────────────────────────────────────

export interface ErasePreviewData {
  fullyErasedIds: Set<string>
  cutPoints: Map<string, Set<number>>
  trail: { x: number; y: number }[]
}

const ERASE_SHADOW = 'rgba(255,0,0,0.2)'

function drawErasePreview(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  preview: ErasePreviewData | null,
): void {
  if (!preview) return
  if (preview.fullyErasedIds.size === 0 && preview.cutPoints.size === 0) return

  // Fully erased strokes — draw entire stroke as shadow
  for (const s of strokes) {
    if (!preview.fullyErasedIds.has(s.id)) continue
    drawStroke(ctx, s, ERASE_SHADOW)
  }

  // Partially erased — draw cut segments as shadow
  for (const [id, points] of preview.cutPoints) {
    const s = strokes.find(st => st.id === id)
    if (!s || points.size < 2) continue
    ctx.lineWidth = s.width
    ctx.strokeStyle = ERASE_SHADOW
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const pts = s.points
    for (let i = 0; i < pts.length - 1; i++) {
      if (points.has(i) && points.has(i + 1)) {
        const cur = pts[i]!
        const nxt = pts[i + 1]!
        ctx.beginPath()
        ctx.moveTo(cur[0], cur[1])
        ctx.lineTo(nxt[0], nxt[1])
        ctx.stroke()
      }
    }
  }
}

const ERASE_TRAIL_ALPHA = 0.18

/** Draw translucent red sweep along the eraser's path */
function drawEraseTrail(
  ctx: CanvasRenderingContext2D,
  trail: { x: number; y: number }[],
  radius: number,
): void {
  if (trail.length === 0) return
  ctx.strokeStyle = `rgba(255,0,0,${ERASE_TRAIL_ALPHA})`
  ctx.lineWidth = radius * 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (trail.length === 1) {
    ctx.fillStyle = `rgba(255,0,0,${ERASE_TRAIL_ALPHA})`
    ctx.beginPath()
    ctx.arc(trail[0]!.x, trail[0]!.y, radius, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  ctx.beginPath()
  ctx.moveTo(trail[0]!.x, trail[0]!.y)
  for (let i = 1; i < trail.length; i++) {
    ctx.lineTo(trail[i]!.x, trail[i]!.y)
  }
  ctx.stroke()
}

// ── Hit testing for eraser ─────────────────────────────────────────

/** Return indices of stroke points within eraser radius */
export function strokeErasedPoints(
  stroke: Stroke,
  pt: { x: number; y: number },
  radius: number,
): Set<number> {
  const pad = radius + stroke.width / 2
  const erased = new Set<number>()
  const pts = stroke.points

  if (pts.length === 1) {
    const p0 = pts[0]!
    if (dist(pt, { x: p0[0], y: p0[1] }) <= pad) erased.add(0)
    return erased
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const cur = pts[i]!
    const nxt = pts[i + 1]!
    if (
      pointSegmentDistance(pt, { x: cur[0], y: cur[1] }, { x: nxt[0], y: nxt[1] }) <=
      pad
    ) {
      erased.add(i)
      erased.add(i + 1)
    }
  }
  return erased
}

/** Check whether an eraser circle hits any segment of a stroke */
export function strokeHit(
  stroke: Stroke,
  pt: { x: number; y: number },
  radius: number,
): boolean {
  const pad = radius + stroke.width / 2
  if (
    pt.x < stroke.minX - pad ||
    pt.x > stroke.maxX + pad ||
    pt.y < stroke.minY - pad ||
    pt.y > stroke.maxY + pad
  ) {
    return false
  }
  const pts = stroke.points
  if (pts.length === 1) {
    const p0 = pts[0]!
    return dist(pt, { x: p0[0], y: p0[1] }) <= pad
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const cur = pts[i]!
    const nxt = pts[i + 1]!
    if (
      pointSegmentDistance(pt, { x: cur[0], y: cur[1] }, { x: nxt[0], y: nxt[1] }) <=
      pad
    ) {
      return true
    }
  }
  return false
}

export interface RenderResult {
  rendered: number
  total: number
}

// ── Main render entry point ─────────────────────────────────────────

/**
 * Render a full frame: clear → apply camera → draw grid → draw culled
 * strokes → draw cursor preview.
 *
 * @returns Stats about how many strokes were visible vs total.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvasPixelWidth: number,
  canvasPixelHeight: number,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  camera: CameraState,
  strokes: readonly Stroke[],
  hoverPos: { x: number; y: number } | null,
  tool: ToolMode,
  color: string,
  strokeWidth: number,
  erasePreview?: ErasePreviewData | null,
): RenderResult {
  // Reset to identity for full clear
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvasPixelWidth, canvasPixelHeight)

  // Apply camera transform: scale by DPR → translate to center → zoom → pan
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.translate(cssWidth / 2, cssHeight / 2)
  ctx.scale(camera.zoom, camera.zoom)
  ctx.translate(-camera.x, -camera.y)

  // Viewport bounds for culling
  const vp = getViewportBounds(camera, cssWidth, cssHeight)
  drawGrid(ctx, vp, camera.zoom)

  // Culled stroke rendering
  let rendered = 0
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i]!
    if (boundsIntersect(s, vp)) {
      drawStroke(ctx, s)
      rendered++
    }
  }

  // Switch back to screen-space for overlays
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Eraser trail — filled red circles along the sweep path
  if (erasePreview && erasePreview.trail.length > 0) {
    drawEraseTrail(ctx, erasePreview.trail, ERASE_RADIUS_SCREEN)
  }

  if (hoverPos) {
    drawCursorPreview(ctx, hoverPos, tool, camera.zoom, color, strokeWidth)
  }

  // Re-apply world-space transform for erase stroke shadows
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.translate(cssWidth / 2, cssHeight / 2)
  ctx.scale(camera.zoom, camera.zoom)
  ctx.translate(-camera.x, -camera.y)

  drawErasePreview(ctx, strokes, erasePreview ?? null)

  return { rendered, total: strokes.length }
}
