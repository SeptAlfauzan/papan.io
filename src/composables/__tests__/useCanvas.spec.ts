import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useBoardStore } from '@/stores/board.store'
import { useCanvas } from '@/composables/useCanvas'

vi.mock('@/services/sync.service', () => ({
  sendStrokeAdd: vi.fn<(...args: unknown[]) => void>(),
  sendStrokeErase: vi.fn<(...args: unknown[]) => void>(),
}))

let canvasApi: ReturnType<typeof useCanvas>

function mountCanvasComponent() {
  const wrapper = mount(
    defineComponent({
      setup() {
        canvasApi = useCanvas()
        return canvasApi
      },
      template: '<canvas ref="canvasEl" style="width:800px;height:600px" />',
    }),
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
})
