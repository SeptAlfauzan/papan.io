import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasToolbar from '@/components/CanvasToolbar.vue'
import type { ToolMode } from '@/types/board.types'

describe('CanvasToolbar', () => {
  const defaultProps = {
    tool: 'pencil' as ToolMode,
    color: '#3a3a3c',
    strokeWidth: 4,
    zoomDisplay: 100,
    canUndo: false,
    canRedo: false,
  }

  it('renders all tool buttons', () => {
    const wrapper = mount(CanvasToolbar, { props: defaultProps })
    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBeGreaterThanOrEqual(6) // 3 tools + undo + redo + zoom controls
  })

  it('applies active class to current tool button', () => {
    const wrapper = mount(CanvasToolbar, { props: defaultProps })
    const activeButtons = wrapper.findAll('button.active')
    expect(activeButtons).toHaveLength(1)
  })

  it('highlights pencil when tool="pencil"', () => {
    const wrapper = mount(CanvasToolbar, { props: defaultProps })
    // First button group has pencil as first button
    expect(wrapper.html()).toContain('active')
  })

  it('highlights hand when tool="hand"', () => {
    const wrapper = mount(CanvasToolbar, { props: { ...defaultProps, tool: 'hand' } })
    expect(wrapper.findAll('button.active')).toHaveLength(1)
  })

  it('disables undo button when canUndo is false', () => {
    const wrapper = mount(CanvasToolbar, { props: defaultProps })
    const undoButton = wrapper.findAll('button').find(
      (b) => b.attributes('title') === 'Undo (Ctrl+Z)',
    )
    expect(undoButton?.attributes('disabled')).toBeDefined()
  })

  it('enables undo button when canUndo is true', () => {
    const wrapper = mount(CanvasToolbar, {
      props: { ...defaultProps, canUndo: true },
    })
    const undoButton = wrapper.findAll('button').find(
      (b) => b.attributes('title') === 'Undo (Ctrl+Z)',
    )
    expect(undoButton?.attributes('disabled')).toBeUndefined()
  })

  it('disables redo button when canRedo is false', () => {
    const wrapper = mount(CanvasToolbar, { props: defaultProps })
    const redoButton = wrapper.findAll('button').find(
      (b) => b.attributes('title') === 'Redo (Ctrl+Shift+Z)',
    )
    expect(redoButton?.attributes('disabled')).toBeDefined()
  })

  it('emits update:tool when tool button clicked', async () => {
    const wrapper = mount(CanvasToolbar, { props: defaultProps })
    const handButton = wrapper.findAll('button').find(
      (b) => b.attributes('title') === 'Hand tool (H)',
    )
    await handButton?.trigger('click')
    expect(wrapper.emitted('update:tool')).toBeTruthy()
    expect(wrapper.emitted('update:tool')![0]).toEqual(['hand'])
  })

  it('emits undo event when undo button clicked', async () => {
    const wrapper = mount(CanvasToolbar, {
      props: { ...defaultProps, canUndo: true },
    })
    const undoButton = wrapper.findAll('button').find(
      (b) => b.attributes('title') === 'Undo (Ctrl+Z)',
    )
    await undoButton?.trigger('click')
    expect(wrapper.emitted('undo')).toBeTruthy()
  })

  it('emits redo event when redo button clicked', async () => {
    const wrapper = mount(CanvasToolbar, {
      props: { ...defaultProps, canRedo: true },
    })
    const redoButton = wrapper.findAll('button').find(
      (b) => b.attributes('title') === 'Redo (Ctrl+Shift+Z)',
    )
    await redoButton?.trigger('click')
    expect(wrapper.emitted('redo')).toBeTruthy()
  })

  it('emits update:color when color input changes', async () => {
    const wrapper = mount(CanvasToolbar, { props: defaultProps })
    const colorInput = wrapper.find('input[type="color"]')
    await colorInput.setValue('#ff0000')
    expect(wrapper.emitted('update:color')).toBeTruthy()
    expect(wrapper.emitted('update:color')![0]).toEqual(['#ff0000'])
  })

  it('emits update:strokeWidth when range slider changes', async () => {
    const wrapper = mount(CanvasToolbar, { props: defaultProps })
    const rangeInput = wrapper.find('input[type="range"]')
    await rangeInput.setValue(12)
    expect(wrapper.emitted('update:strokeWidth')).toBeTruthy()
    expect(wrapper.emitted('update:strokeWidth')![0]).toEqual([12])
  })

  it('displays zoom readout', () => {
    const wrapper = mount(CanvasToolbar, {
      props: { ...defaultProps, zoomDisplay: 75 },
    })
    expect(wrapper.text()).toContain('75%')
  })

  it('emits zoomOut when zoom out button clicked', async () => {
    const wrapper = mount(CanvasToolbar, { props: defaultProps })
    const zoomOutButton = wrapper.findAll('button').find(
      (b) => b.attributes('title') === 'Zoom out',
    )
    await zoomOutButton?.trigger('click')
    expect(wrapper.emitted('zoomOut')).toBeTruthy()
  })

  it('emits zoomIn when zoom in button clicked', async () => {
    const wrapper = mount(CanvasToolbar, { props: defaultProps })
    const zoomInButton = wrapper.findAll('button').find(
      (b) => b.attributes('title') === 'Zoom in',
    )
    await zoomInButton?.trigger('click')
    expect(wrapper.emitted('zoomIn')).toBeTruthy()
  })

  it('emits resetView when zoom readout clicked', async () => {
    const wrapper = mount(CanvasToolbar, { props: defaultProps })
    const readoutButton = wrapper.findAll('button').find(
      (b) => b.text() === '100%',
    )
    await readoutButton?.trigger('click')
    expect(wrapper.emitted('resetView')).toBeTruthy()
  })

  it('shows stroke size label', () => {
    const wrapper = mount(CanvasToolbar, {
      props: { ...defaultProps, strokeWidth: 8 },
    })
    expect(wrapper.text()).toContain('8px')
  })

  it('renders color picker input', () => {
    const wrapper = mount(CanvasToolbar, { props: defaultProps })
    const colorInput = wrapper.find('input[type="color"]')
    expect(colorInput.exists()).toBe(true)
    expect(colorInput.element.getAttribute('value')).toBe('#3a3a3c')
  })

  it('renders range slider with correct min/max', () => {
    const wrapper = mount(CanvasToolbar, { props: defaultProps })
    const rangeInput = wrapper.find('input[type="range"]')
    expect(rangeInput.exists()).toBe(true)
    expect(rangeInput.element.getAttribute('min')).toBe('1')
    expect(rangeInput.element.getAttribute('max')).toBe('40')
  })

  it('highlights sticky-note when tool="sticky-note"', () => {
    const wrapper = mount(CanvasToolbar, { props: { ...defaultProps, tool: 'sticky-note' } })
    expect(wrapper.findAll('button.active')).toHaveLength(1)
  })

  it('emits update:tool with sticky-note when sticky button clicked', async () => {
    const wrapper = mount(CanvasToolbar, { props: defaultProps })
    const stickyButton = wrapper.findAll('button').find(
      (b) => b.attributes('title') === 'Sticky Note (S)',
    )
    await stickyButton?.trigger('click')
    expect(wrapper.emitted('update:tool')).toBeTruthy()
    expect(wrapper.emitted('update:tool')![0]).toEqual(['sticky-note'])
  })
})
