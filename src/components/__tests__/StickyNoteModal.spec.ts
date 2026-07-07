import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StickyNoteModal from '@/components/StickyNoteModal.vue'
import type { StickyNote } from '@/types/board.types'

function fakeNote(overrides: Partial<StickyNote> = {}): StickyNote {
  return {
    id: 's1', x: 0, y: 0, width: 150, height: 150,
    text: 'hello', truncate: false, color: '#fff9c4',
    ...overrides,
  }
}

describe('StickyNoteModal', () => {
  it('renders textarea with note text', () => {
    const wrapper = mount(StickyNoteModal, {
      props: { note: fakeNote() },
    })
    const textarea = wrapper.find('textarea')
    expect(textarea.exists()).toBe(true)
    expect((textarea.element as HTMLTextAreaElement).value).toBe('hello')
  })

  it('renders checkbox with truncate state', () => {
    const wrapper = mount(StickyNoteModal, {
      props: { note: fakeNote({ truncate: true }) },
    })
    const checkbox = wrapper.find('input[type="checkbox"]')
    expect(checkbox.exists()).toBe(true)
    expect((checkbox.element as HTMLInputElement).checked).toBe(true)
  })

  it('emits save with updated text and truncate', async () => {
    const wrapper = mount(StickyNoteModal, {
      props: { note: fakeNote() },
    })
    const textarea = wrapper.find('textarea')
    await textarea.setValue('updated text')
    const checkbox = wrapper.find('input[type="checkbox"]')
    await checkbox.setValue(true)
    await wrapper.find('.save-btn').trigger('click')

    expect(wrapper.emitted('save')).toBeTruthy()
    expect(wrapper.emitted('save')![0]).toEqual([{
      text: 'updated text',
      truncate: true,
    }])
  })

  it('emits close when clicking cancel', async () => {
    const wrapper = mount(StickyNoteModal, {
      props: { note: fakeNote() },
    })
    await wrapper.find('.cancel-btn').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emits close when clicking overlay backdrop', async () => {
    const wrapper = mount(StickyNoteModal, {
      props: { note: fakeNote() },
    })
    await wrapper.find('.modal-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
