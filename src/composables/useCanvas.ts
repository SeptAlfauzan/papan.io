/**
 * useCanvas — Core canvas composable.
 *
 * Ownership:
 * - Canvas element lifecycle, resize, DPI scaling
 * - Camera (pan / zoom via trackpad, pinch, scroll, hand tool)
 * - Pointer event routing (draw, erase, pan, pinch-zoom)
 * - rAF render loop calling canvas-engine
 * - Outgoing sync (calls sync service on stroke add / erase)
 * - Reads/writes stroke state via board.store
 *
 * Camera & pointer tracking deliberately kept outside Vue reactivity
 * (plain JS objects). Only UI-facing values (zoomDisplay, cursorStyle,
 * culledStats) are reactive.
 */
import { ref, reactive, computed, readonly, onMounted, onUnmounted } from 'vue'
import type { Stroke, ToolMode, CameraState, Point, StickyNote } from '@/types/board.types'
import { useBoardStore } from '@/stores/board.store'
import { sendStrokeAdd, sendStrokeErase, sendStickyAdd, sendStickyErase, sendStickyUpdate } from '@/services/sync.service'
import {
  renderFrame,
  screenToWorld,
  getViewportBounds,
  boundsIntersect,
  strokeErasedPoints,
  ERASE_RADIUS_SCREEN,
  stickyNoteHit,
} from '@/services/canvas-engine'
import type { ErasePreviewData } from '@/services/canvas-engine'

// ── Constants ───────────────────────────────────────────────────────
const MIN_ZOOM = 0.05
const MAX_ZOOM = 8

const CLIENT_ID = Math.random().toString(36).slice(2, 8)
let idCounter = 0
function uid(): string {
  return `${CLIENT_ID}_${Date.now()}_${++idCounter}`
}

// ── Helpers ─────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
function mid(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// ── Composable ──────────────────────────────────────────────────────
export function useCanvas() {
  // ── Reactive: exposed to template / toolbar ────────────────────
  const canvasEl = ref<HTMLCanvasElement | null>(null)
  const tool = ref<ToolMode>('pencil')
  const color = ref('#3a3a3c')
  const strokeWidth = ref(4)
  const zoomDisplay = ref(100)
  const spaceHeld = ref(false)
  const isPointerDown = ref(false)
  const culledStats = reactive({ rendered: 0, total: 0 })

  const store = useBoardStore()
  const canUndo = computed(() => store.canUndo)
  const canRedo = computed(() => store.canRedo)

  const editingStickyId = ref<string | null>(null)

  const cursorStyle = computed(() => {
    const t = spaceHeld.value ? 'hand' : tool.value
    if (t === 'hand') return isPointerDown.value ? 'grabbing' : 'grab'
    return 'none'
  })

  // ── Non-reactive: perf-critical render state ───────────────────
  const camera: CameraState = { x: 0, y: 0, zoom: 1 }
  const canvasSize = { w: 0, h: 0 }

  let ctx: CanvasRenderingContext2D | null = null
  let dirty = true
  let rafId: number | null = null
  let hoverPos: { x: number; y: number } | null = null

  // Gesture tracking — plain Maps / objects, not reactive
  const activePointers = new Map<number, { x: number; y: number }>()
  let panState: { lastX: number; lastY: number } | null = null
  let pinchState: { lastDist: number; lastMid: { x: number; y: number } } | null = null

  let stickyPreviewPos: { x: number; y: number } | null = null
  let selectedStickyId: string | null = null

  /** In-progress stroke (mutable — dropped on undo / finalized on pointerup) */
  let drawState: Stroke | null = null
  let eraseState: {
    cutStrokes: Map<string, { stroke: Stroke; cutPoints: Set<number> }>
    fullyErasedIds: Set<string>
    trail: { x: number; y: number }[]
  } | null = null

  // ── Camera ─────────────────────────────────────────────────────
  function moveCamera(dx: number, dy: number): void {
    camera.x += dx / camera.zoom
    camera.y += dy / camera.zoom
    requestRedraw()
  }

  /** Zoom so world point under (sx,sy) stays glued to cursor */
  function zoomAt(sx: number, sy: number, z: number): void {
    z = clamp(z, MIN_ZOOM, MAX_ZOOM)
    const before = screenToWorld(sx, sy, camera, canvasSize.w, canvasSize.h)
    camera.zoom = z
    const after = screenToWorld(sx, sy, camera, canvasSize.w, canvasSize.h)
    camera.x += before.x - after.x
    camera.y += before.y - after.y
    zoomDisplay.value = Math.round(z * 100)
    requestRedraw()
  }

  function requestRedraw(): void {
    dirty = true
  }

  // ── Resize ─────────────────────────────────────────────────────
  function resize(): void {
    const el = canvasEl.value
    if (!el) return
    const dpr = window.devicePixelRatio || 1
    const rect = el.getBoundingClientRect()
    canvasSize.w = rect.width
    canvasSize.h = rect.height
    el.width = Math.round(rect.width * dpr)
    el.height = Math.round(rect.height * dpr)
    requestRedraw()
  }

  // ── Render loop ────────────────────────────────────────────────
  function draw(): void {
    const el = canvasEl.value
    if (!el || !ctx) return
    const dpr = window.devicePixelRatio || 1

    // Merge committed + in-progress stroke for rendering
    // store.strokes appears as DeepReadonly<Stroke[]> — safe cast,
    // we never mutate store strokes in the render path.
    const committed = store.strokes as Stroke[]
    const allStrokes = drawState ? committed.concat(drawState) : committed

    // Build erase preview from active erase state
    let erasePreview: ErasePreviewData | null = null
    if (eraseState) {
      const cutPoints = new Map<string, Set<number>>()
      for (const [id, entry] of eraseState.cutStrokes) {
        if (entry.cutPoints.size > 0) cutPoints.set(id, entry.cutPoints)
      }
      if (eraseState.fullyErasedIds.size > 0 || cutPoints.size > 0 || eraseState.trail.length > 0) {
        erasePreview = {
          fullyErasedIds: eraseState.fullyErasedIds,
          cutPoints,
          trail: eraseState.trail,
        }
      }
    }

    const stickyNotesArr = store.stickyNotes as StickyNote[]
    const spPos = tool.value === 'sticky-note' ? stickyPreviewPos : null

    const res = renderFrame(
      ctx,
      el.width,
      el.height,
      canvasSize.w,
      canvasSize.h,
      dpr,
      camera,
      allStrokes,
      stickyNotesArr,
      hoverPos,
      tool.value,
      color.value,
      strokeWidth.value,
      erasePreview,
      spPos,
    )
    culledStats.rendered = res.rendered
    culledStats.total = res.total
  }

  function loop(): void {
    if (dirty) {
      draw()
      dirty = false
    }
    rafId = requestAnimationFrame(loop)
  }

  // ── Stroke carving helpers ────────────────────────────────────
  function createFragment(original: Stroke, points: Point[]): Stroke {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [x, y] of points) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    return {
      id: uid(),
      points,
      color: original.color,
      width: original.width,
      minX, maxX, minY, maxY,
    }
  }

  function carveStroke(stroke: Stroke, cutPoints: Set<number>): Stroke[] {
    if (cutPoints.size === 0) return [stroke]
    if (cutPoints.size >= stroke.points.length) return []

    const fragments: Stroke[] = []
    let currentPoints: Point[] = []

    for (let i = 0; i < stroke.points.length; i++) {
      if (cutPoints.has(i)) {
        if (currentPoints.length > 0) {
          fragments.push(createFragment(stroke, currentPoints))
          currentPoints = []
        }
      } else {
        currentPoints.push(stroke.points[i]!)
      }
    }

    if (currentPoints.length > 0) {
      fragments.push(createFragment(stroke, currentPoints))
    }

    return fragments
  }

  // ── Eraser hit-testing (world-space, per-point cut) ────────────
  function eraseAt(sx: number, sy: number): void {
    if (!eraseState) return
    eraseState.trail.push({ x: sx, y: sy })
    const world = screenToWorld(sx, sy, camera, canvasSize.w, canvasSize.h)
    const r = ERASE_RADIUS_SCREEN / camera.zoom
    const vp = getViewportBounds(camera, canvasSize.w, canvasSize.h)

    for (const s of store.strokes as Stroke[]) {
      if (eraseState.fullyErasedIds.has(s.id)) continue
      if (!boundsIntersect(s, vp)) continue

      let entry = eraseState.cutStrokes.get(s.id)
      if (!entry) {
        entry = { stroke: s, cutPoints: new Set() }
        eraseState.cutStrokes.set(s.id, entry)
      }
      if (entry.cutPoints.size >= s.points.length) {
        eraseState.fullyErasedIds.add(s.id)
        eraseState.cutStrokes.delete(s.id)
        continue
      }

      const erased = strokeErasedPoints(s, world, r)
      for (const idx of erased) {
        entry.cutPoints.add(idx)
      }

      if (entry.cutPoints.size >= s.points.length) {
        eraseState.fullyErasedIds.add(s.id)
        eraseState.cutStrokes.delete(s.id)
      }
    }
    requestRedraw()
  }

  // ── Finalise operations (commit to store + sync) ──────────────
  function finalizeStroke(): void {
    if (!drawState) return
    store.addStroke(drawState)
    sendStrokeAdd(drawState)
    drawState = null
    requestRedraw()
  }

  function finalizeErase(): void {
    if (!eraseState) return

    // Sticky note eraser deletion
    if (eraseState.trail.length > 0) {
      let tMinX = Infinity, tMaxX = -Infinity, tMinY = Infinity, tMaxY = -Infinity
      for (const p of eraseState.trail) {
        if (p.x < tMinX) tMinX = p.x
        if (p.x > tMaxX) tMaxX = p.x
        if (p.y < tMinY) tMinY = p.y
        if (p.y > tMaxY) tMaxY = p.y
      }
      const worldTL = screenToWorld(tMinX, tMinY, camera, canvasSize.w, canvasSize.h)
      const worldBR = screenToWorld(tMaxX, tMaxY, camera, canvasSize.w, canvasSize.h)
      const trailUnion = {
        minX: Math.min(worldTL.x, worldBR.x),
        maxX: Math.max(worldTL.x, worldBR.x),
        minY: Math.min(worldTL.y, worldBR.y),
        maxY: Math.max(worldTL.y, worldBR.y),
      }

      const deletedIds: string[] = []
      for (const n of store.stickyNotes) {
        if (stickyNoteHit(n, trailUnion)) {
          deletedIds.push(n.id)
        }
      }
      for (const id of deletedIds) {
        store.removeStickyNote(id)
        sendStickyErase(id)
      }
    }

    const originals: Stroke[] = []
    const fragments: Stroke[] = []

    for (const id of eraseState.fullyErasedIds) {
      const s = (store.strokes as Stroke[]).find(st => st.id === id)
      if (s) originals.push(s)
    }

    for (const [, entry] of eraseState.cutStrokes) {
      if (entry.cutPoints.size === 0) continue
      originals.push(entry.stroke)
      const carved = carveStroke(entry.stroke, entry.cutPoints)
      for (const f of carved) fragments.push(f)
    }

    if (originals.length > 0) {
      const removedIds = originals.map(s => s.id)
      if (fragments.length > 0) {
        store.replaceStrokes(originals, fragments)
      } else {
        store.removeStrokes(removedIds)
      }
      sendStrokeErase(removedIds)
      for (const f of fragments) sendStrokeAdd(f)
    }

    eraseState = null
  }

  // ── Pointer events ────────────────────────────────────────────
  function effectiveTool(): ToolMode {
    return spaceHeld.value ? 'hand' : tool.value
  }

  function onPointerDown(e: PointerEvent): void {
    const el = canvasEl.value
    if (!el) return
    el.setPointerCapture(e.pointerId)
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    isPointerDown.value = true

    // Double-click on sticky note
    if (e.detail === 2) {
      const pos = { x: e.clientX, y: e.clientY }
      const w = screenToWorld(pos.x, pos.y, camera, canvasSize.w, canvasSize.h)
      const hit = store.stickyNotes.find(n =>
        w.x >= n.x && w.x <= n.x + n.width &&
        w.y >= n.y && w.y <= n.y + n.height
      )
      if (hit) {
        selectedStickyId = hit.id
        editingStickyId.value = hit.id
        return
      }
    }

    if (activePointers.size === 1) {
      const pos = { x: e.clientX, y: e.clientY }
      hoverPos = pos
      const t = effectiveTool()

      // Sticky selection in hand mode
      if (t === 'hand' && e.button === 0) {
        const w = screenToWorld(pos.x, pos.y, camera, canvasSize.w, canvasSize.h)
        const hit = store.stickyNotes.find(n =>
          w.x >= n.x && w.x <= n.x + n.width &&
          w.y >= n.y && w.y <= n.y + n.height
        )
        if (hit) {
          selectedStickyId = hit.id
          requestRedraw()
          return
        } else {
          selectedStickyId = null
        }
      }

      if (t === 'hand' || e.button === 1) {
        panState = { lastX: pos.x, lastY: pos.y }
      } else if (t === 'pencil' && e.button === 0) {
        const w = screenToWorld(pos.x, pos.y, camera, canvasSize.w, canvasSize.h)
        drawState = {
          id: uid(),
          points: [[w.x, w.y]],
          color: color.value,
          width: strokeWidth.value,
          minX: w.x, maxX: w.x, minY: w.y, maxY: w.y,
        }
      } else if (t === 'eraser' && e.button === 0) {
        eraseState = { cutStrokes: new Map(), fullyErasedIds: new Set(), trail: [] }
        eraseAt(pos.x, pos.y)
      } else if (t === 'sticky-note' && e.button === 0) {
        const w = screenToWorld(pos.x, pos.y, camera, canvasSize.w, canvasSize.h)
        const note: StickyNote = {
          id: uid(),
          x: w.x - 75,
          y: w.y - 75,
          width: 150,
          height: 150,
          text: '',
          truncate: false,
          color: '#fff9c4',
        }
        store.addStickyNote(note)
        sendStickyAdd(note)
        requestRedraw()
      }
      requestRedraw()
    } else if (activePointers.size === 2) {
      // Abandon single-pointer action — second finger arrived
      drawState = null
      eraseState = null
      panState = null
      const pts = [...activePointers.values()]
      pinchState = { lastDist: dist(pts[0]!, pts[1]!), lastMid: mid(pts[0]!, pts[1]!) }
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (!activePointers.has(e.pointerId)) {
      hoverPos = { x: e.clientX, y: e.clientY }
      if (tool.value === 'pencil' || tool.value === 'eraser' || tool.value === 'sticky-note') {
        if (tool.value === 'sticky-note') {
          const w = screenToWorld(hoverPos.x, hoverPos.y, camera, canvasSize.w, canvasSize.h)
          stickyPreviewPos = { x: w.x, y: w.y }
        }
        requestRedraw()
      }
      return
    }
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pos = { x: e.clientX, y: e.clientY }
    hoverPos = pos

    // Pinch zoom + pan
    if (activePointers.size >= 2 && pinchState) {
      const pts = [...activePointers.values()].slice(0, 2)
      const curDist = dist(pts[0]!, pts[1]!)
      const curMid = mid(pts[0]!, pts[1]!)
      const worldAtLastMid = screenToWorld(
        pinchState.lastMid.x,
        pinchState.lastMid.y,
        camera,
        canvasSize.w,
        canvasSize.h,
      )
      const z = clamp(camera.zoom * (curDist / pinchState.lastDist), MIN_ZOOM, MAX_ZOOM)
      camera.zoom = z
      camera.x = worldAtLastMid.x - (curMid.x - canvasSize.w / 2) / z
      camera.y = worldAtLastMid.y - (curMid.y - canvasSize.h / 2) / z
      zoomDisplay.value = Math.round(z * 100)
      pinchState.lastDist = curDist
      pinchState.lastMid = curMid
      requestRedraw()
      return
    }

    if (panState) {
      moveCamera(-(pos.x - panState.lastX), -(pos.y - panState.lastY))
      panState.lastX = pos.x
      panState.lastY = pos.y
    } else if (drawState) {
      const w = screenToWorld(pos.x, pos.y, camera, canvasSize.w, canvasSize.h)
      drawState.points.push([w.x, w.y])
      drawState.minX = Math.min(drawState.minX, w.x)
      drawState.maxX = Math.max(drawState.maxX, w.x)
      drawState.minY = Math.min(drawState.minY, w.y)
      drawState.maxY = Math.max(drawState.maxY, w.y)
      requestRedraw()
    } else if (eraseState) {
      eraseAt(pos.x, pos.y)
    }
  }

  function onPointerUp(e: PointerEvent): void {
    activePointers.delete(e.pointerId)
    isPointerDown.value = activePointers.size > 0

    if (activePointers.size < 2) pinchState = null

    if (activePointers.size === 1 && !panState && !drawState && !eraseState) {
      const rem = [...activePointers.values()][0]
      if (rem && effectiveTool() === 'hand') panState = { lastX: rem.x, lastY: rem.y }
    }
    if (activePointers.size === 0) {
      finalizeStroke()
      finalizeErase()
      panState = null
    }
  }

  function onPointerLeave(e: PointerEvent): void {
    if (!activePointers.has(e.pointerId)) {
      hoverPos = null
      requestRedraw()
    }
  }

  // ── Wheel ──────────────────────────────────────────────────────
  function onWheel(e: WheelEvent): void {
    const rect = canvasEl.value?.getBoundingClientRect()
    if (!rect) return
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (e.ctrlKey || e.metaKey) {
      zoomAt(sx, sy, camera.zoom * Math.exp(-e.deltaY * 0.01))
    } else {
      moveCamera(e.deltaX, e.deltaY)
    }
  }

  // ── Keyboard ───────────────────────────────────────────────────
  function onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space' && !spaceHeld.value) {
      spaceHeld.value = true
      e.preventDefault()
    }
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault()
      redo()
    } else if (!mod) {
      if (e.key === 'p' || e.key === 'P') tool.value = 'pencil'
      if (e.key === 'h' || e.key === 'H') tool.value = 'hand'
      if (e.key === 'e' || e.key === 'E') tool.value = 'eraser'
      if (e.key === 's' || e.key === 'S') tool.value = 'sticky-note'
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedStickyId) {
        store.removeStickyNote(selectedStickyId)
        sendStickyErase(selectedStickyId)
        selectedStickyId = null
        e.preventDefault()
        return
      }
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') spaceHeld.value = false
  }

  function resetTransientStates(): void {
    activePointers.clear()
    panState = null
    pinchState = null
    drawState = null
    eraseState = null
    isPointerDown.value = false
    stickyPreviewPos = null
    selectedStickyId = null
    editingStickyId.value = null
    requestRedraw()
  }

  // ── Toolbar actions ────────────────────────────────────────────
  function undo(): void {
    store.undo()
    requestRedraw()
  }
  function redo(): void {
    store.redo()
    requestRedraw()
  }
  function zoomInBtn(): void {
    zoomAt(canvasSize.w / 2, canvasSize.h / 2, camera.zoom * 1.25)
  }
  function zoomOutBtn(): void {
    zoomAt(canvasSize.w / 2, canvasSize.h / 2, camera.zoom / 1.25)
  }
  function resetView(): void {
    camera.x = 0
    camera.y = 0
    camera.zoom = 1
    zoomDisplay.value = 100
    requestRedraw()
  }

  // ── Lifecycle ──────────────────────────────────────────────────
  onMounted(() => {
    const el = canvasEl.value
    if (!el) return
    ctx = el.getContext('2d')
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', resetTransientStates)
    loop()
  })

  onUnmounted(() => {
    if (rafId !== null) cancelAnimationFrame(rafId)
    window.removeEventListener('resize', resize)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', resetTransientStates)
  })

  return {
    canvasEl,
    tool,
    color,
    strokeWidth,
    zoomDisplay,
    canUndo,
    canRedo,
    culledStats,
    cursorStyle,
    editingStickyId: readonly(editingStickyId),
    closeStickyEdit: () => { editingStickyId.value = null },
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
  }
}
