import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useBoardStore } from '@/stores/board.store'
import { useCanvas } from '@/composables/useCanvas'
import { sendStickyErase } from '@/services/sync.service'

vi.mock('@/services/sync.service', () => ({
  sendStrokeAdd: vi.fn<(...args: unknown[]) => void>(),
  sendStrokeErase: vi.fn<(...args: unknown[]) => void>(),
  sendStickyAdd: vi.fn<(...args: unknown[]) => void>(),
  sendStickyErase: vi.fn<(...args: unknown[]) => void>(),
}))

let canvasApi: ReturnType<typeof useCanvas>

function mountCanvasComponent() {
  // jsdom doesn't support setPointerCapture or CSS layout
  if (!HTMLCanvasElement.prototype.setPointerCapture) {
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
  }
  if (!HTMLCanvasElement.prototype.getContext) {
    HTMLCanvasElement.prototype.getContext = vi.fn()
  }
  Object.defineProperty(HTMLCanvasElement.prototype, 'getBoundingClientRect', {
    value: () => ({ top: 0, left: 0, bottom: 600, right: 800, width: 800, height: 600, x: 0, y: 0 }),
    configurable: true,
  })
  const wrapper = mount(
    defineComponent({
      setup() {
        canvasApi = useCanvas()
        return canvasApi
      },
      template: '<canvas ref="canvasEl" style="width:800px;height:600px" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointerleave="onPointerLeave" @wheel="onWheel" />',
    }),
    { attachTo: document.body },
  )
  return wrapper
}

describe('useCanvas', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with pencil tool, correct defaults', () => {
      mountCanvasComponent()
      expect(canvasApi.tool.value).toBe('pencil')
      expect(canvasApi.color.value).toBe('#3a3a3c')
      expect(canvasApi.strokeWidth.value).toBe(4)
      expect(canvasApi.zoomDisplay.value).toBe(100)
    })

    it('culledStats starts at 0/0', () => {
      mountCanvasComponent()
      expect(canvasApi.culledStats.rendered).toBe(0)
      expect(canvasApi.culledStats.total).toBe(0)
    })
  })

  describe('tool and cursor', () => {
    it('returns "none" cursor for pencil', () => {
      mountCanvasComponent()
      expect(canvasApi.cursorStyle.value).toBe('none')
    })

    it('returns "grab" cursor for hand tool', () => {
      mountCanvasComponent()
      canvasApi.tool.value = 'hand'
      expect(canvasApi.cursorStyle.value).toBe('grab')
    })

    it('returns "none" cursor for eraser', () => {
      mountCanvasComponent()
      canvasApi.tool.value = 'eraser'
      expect(canvasApi.cursorStyle.value).toBe('none')
    })

    it('switches tool via value assignment', () => {
      mountCanvasComponent()
      canvasApi.tool.value = 'hand'
      expect(canvasApi.tool.value).toBe('hand')
      canvasApi.tool.value = 'eraser'
      expect(canvasApi.tool.value).toBe('eraser')
      canvasApi.tool.value = 'pencil'
      expect(canvasApi.tool.value).toBe('pencil')
    })
  })

  describe('undo and redo', () => {
    it('exposes store undo/redo wired to canUndo/canRedo', () => {
      const store = useBoardStore()
      store.addStroke({
        id: 'a', points: [[0, 0]], color: '#000', width: 2,
        minX: 0, maxX: 0, minY: 0, maxY: 0,
      })
      mountCanvasComponent()

      expect(canvasApi.canUndo.value).toBe(true)
      expect(canvasApi.canRedo.value).toBe(false)

      canvasApi.undo()
      expect(store.strokes).toHaveLength(0)

      canvasApi.redo()
      expect(store.strokes).toHaveLength(1)
    })
  })

  describe('keyboard shortcuts', () => {
    it('switches tool on key press (H, E, P)', () => {
      mountCanvasComponent()

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }))
      expect(canvasApi.tool.value).toBe('hand')

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
      expect(canvasApi.tool.value).toBe('eraser')

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }))
      expect(canvasApi.tool.value).toBe('pencil')
    })

    it('triggers undo on Ctrl+Z', () => {
      const store = useBoardStore()
      store.addStroke({
        id: 'a', points: [[0, 0]], color: '#000', width: 2,
        minX: 0, maxX: 0, minY: 0, maxY: 0,
      })
      mountCanvasComponent()

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
      expect(store.strokes).toHaveLength(0)
    })

    it('triggers redo on Ctrl+Shift+Z', () => {
      const store = useBoardStore()
      store.addStroke({
        id: 'a', points: [[0, 0]], color: '#000', width: 2,
        minX: 0, maxX: 0, minY: 0, maxY: 0,
      })
      store.undo()
      mountCanvasComponent()

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }))
      expect(store.strokes).toHaveLength(1)
    })

    it('triggers redo on Ctrl+Y', () => {
      const store = useBoardStore()
      store.addStroke({
        id: 'a', points: [[0, 0]], color: '#000', width: 2,
        minX: 0, maxX: 0, minY: 0, maxY: 0,
      })
      store.undo()
      mountCanvasComponent()

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }))
      expect(store.strokes).toHaveLength(1)
    })
  })

  describe('zoom controls', () => {
    it('zoomInBtn and zoomOutBtn do not throw', () => {
      mountCanvasComponent()
      expect(() => canvasApi.zoomInBtn()).not.toThrow()
      expect(() => canvasApi.zoomOutBtn()).not.toThrow()
    })

    it('resetView sets zoom display to 100', () => {
      mountCanvasComponent()
      canvasApi.resetView()
      expect(canvasApi.zoomDisplay.value).toBe(100)
    })
  })

  describe('sticky note tool', () => {
    it('switches to sticky-note tool via keyboard S', () => {
      mountCanvasComponent()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
      expect(canvasApi.tool.value).toBe('sticky-note')
    })

    it('adds sticky note on canvas click in sticky-note mode', () => {
      const store = useBoardStore()
      mountCanvasComponent()
      canvasApi.tool.value = 'sticky-note'

      canvasApi.onPointerDown(new PointerEvent('pointerdown', {
        clientX: 400, clientY: 300, button: 0, pointerId: 1,
      }))
      canvasApi.onPointerUp(new PointerEvent('pointerup', {
        clientX: 400, clientY: 300, button: 0, pointerId: 1,
      }))

      expect(store.stickyNotes).toHaveLength(1)
      expect(store.stickyNotes[0]!.text).toBe('')
    })

    it('selects sticky note on click in hand mode', () => {
      const store = useBoardStore()
      store.addStickyNote({
        id: 's1', x: -75, y: -75, width: 150, height: 150,
        text: 'hello', truncate: false, color: '#fff9c4',
      })
      mountCanvasComponent()
      canvasApi.tool.value = 'hand'

      canvasApi.onPointerDown(new PointerEvent('pointerdown', {
        clientX: 400, clientY: 300, button: 0, pointerId: 1,
      }))
      canvasApi.onPointerUp(new PointerEvent('pointerup', {
        clientX: 400, clientY: 300, button: 0, pointerId: 1,
      }))

      expect(store.stickyNotes).toHaveLength(1)
      expect(canvasApi.editingStickyId.value).toBeNull()
    })

    it('exposes editingStickyId when double-clicking a sticky note', () => {
      const store = useBoardStore()
      store.addStickyNote({
        id: 's1', x: -75, y: -75, width: 150, height: 150,
        text: 'hello', truncate: false, color: '#fff9c4',
      })
      mountCanvasComponent()

      canvasApi.onPointerDown(new PointerEvent('pointerdown', {
        clientX: 400, clientY: 300, button: 0, pointerId: 1, detail: 2,
      }))
      expect(canvasApi.editingStickyId.value).toBe('s1')
    })

    it('detects double-tap via timing fallback (touch)', () => {
      const store = useBoardStore()
      store.addStickyNote({
        id: 's1', x: -75, y: -75, width: 150, height: 150,
        text: 'hello', truncate: false, color: '#fff9c4',
      })
      mountCanvasComponent()

      // First tap — pointerdown + pointerup
      canvasApi.onPointerDown(new PointerEvent('pointerdown', {
        clientX: 400, clientY: 300, button: 0, pointerId: 1, detail: 1,
      }))
      canvasApi.onPointerUp(new PointerEvent('pointerup', {
        clientX: 400, clientY: 300, button: 0, pointerId: 1,
      }))

      // Second tap — pointerdown within 300ms should trigger via time check
      canvasApi.onPointerDown(new PointerEvent('pointerdown', {
        clientX: 401, clientY: 300, button: 0, pointerId: 2, detail: 1,
      }))
      expect(canvasApi.editingStickyId.value).toBe('s1')
    })

    it('deletes sticky note on Delete key when selected', () => {
      const store = useBoardStore()
      store.addStickyNote({
        id: 's1', x: -75, y: -75, width: 150, height: 150,
        text: 'hello', truncate: false, color: '#fff9c4',
      })
      mountCanvasComponent()
      canvasApi.tool.value = 'hand'

      canvasApi.onPointerDown(new PointerEvent('pointerdown', {
        clientX: 400, clientY: 300, button: 0, pointerId: 1,
      }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))

      expect(store.stickyNotes).toHaveLength(0)
      expect(sendStickyErase).toHaveBeenCalledWith('s1')
    })

    it('eraser deletes sticky note with full coverage', () => {
      const store = useBoardStore()
      store.addStickyNote({
        id: 's1', x: 0, y: 0, width: 150, height: 150,
        text: 'hello', truncate: false, color: '#fff9c4',
      })
      mountCanvasComponent()
      canvasApi.tool.value = 'eraser'

      canvasApi.onPointerDown(new PointerEvent('pointerdown', {
        clientX: 400, clientY: 300, button: 0, pointerId: 1,
      }))
      canvasApi.onPointerMove(new PointerEvent('pointermove', {
        clientX: 550, clientY: 450, button: 0, pointerId: 1,
      }))
      canvasApi.onPointerUp(new PointerEvent('pointerup', {
        clientX: 550, clientY: 450, button: 0, pointerId: 1,
      }))

      expect(store.stickyNotes).toHaveLength(0)
      expect(sendStickyErase).toHaveBeenCalledWith('s1')
    })
  })
})
