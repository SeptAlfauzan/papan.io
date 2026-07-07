import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBoardStore } from '../board.store'
import type { Stroke } from '@/types/board.types'

function fakeStroke(id: string, overrides: Partial<Stroke> = {}): Stroke {
  return {
    id,
    points: [[0, 0]],
    color: '#000',
    width: 2,
    minX: 0, maxX: 0, minY: 0, maxY: 0,
    ...overrides,
  }
}

describe('board store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with empty strokes', () => {
    const store = useBoardStore()
    expect(store.strokes).toEqual([])
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(false)
    expect(store.historyIndex).toBe(-1)
    expect(store.renderVersion).toBe(0)
  })

  describe('addStroke', () => {
    it('appends stroke and creates add history entry', () => {
      const store = useBoardStore()
      const s = fakeStroke('a')
      store.addStroke(s)

      expect(store.strokes).toHaveLength(1)
      expect(store.strokes[0]).toStrictEqual(s)
      expect(store.canUndo).toBe(true)
      expect(store.canRedo).toBe(false)
      expect(store.historyIndex).toBe(0)
      expect(store.renderVersion).toBe(1)
    })

    it('increments renderVersion on each add', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.addStroke(fakeStroke('b'))
      expect(store.renderVersion).toBe(2)
    })

    it('supports multiple strokes', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.addStroke(fakeStroke('b'))
      store.addStroke(fakeStroke('c'))
      expect(store.strokes).toHaveLength(3)
    })

    it('truncates redo stack before pushing new history', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.addStroke(fakeStroke('b'))
      store.undo() // index 0, can redo 1
      expect(store.canRedo).toBe(true)
      store.addStroke(fakeStroke('c')) // should truncate entry at index 1
      expect(store.canRedo).toBe(false)
      expect(store.historyIndex).toBe(1)
      expect(store.historyStack).toHaveLength(2)
    })
  })

  describe('removeStrokes', () => {
    it('removes matching strokes and returns them', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.addStroke(fakeStroke('b'))
      store.addStroke(fakeStroke('c'))

      const removed = store.removeStrokes(['a', 'c'])
      expect(removed).toHaveLength(2)
      expect(removed.map((s) => s.id)).toEqual(['a', 'c'])
      expect(store.strokes).toHaveLength(1)
      expect(store.strokes[0]!.id).toBe('b')
    })

    it('creates erase history entry', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.removeStrokes(['a'])

      const lastEntry = store.historyStack[store.historyIndex]!
      expect(lastEntry.type).toBe('erase')
      expect(lastEntry.strokes).toHaveLength(1)
      expect(lastEntry.strokes[0]!.id).toBe('a')
    })

    it('returns empty array and does nothing when no match', () => {
      const store = useBoardStore()
      const removed = store.removeStrokes(['nonexistent'])
      expect(removed).toEqual([])
      expect(store.renderVersion).toBe(0)
      expect(store.historyStack).toHaveLength(0)
    })

    it('handles partial match', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.addStroke(fakeStroke('b'))
      const removed = store.removeStrokes(['a', 'missing'])
      expect(removed).toHaveLength(1)
      expect(store.strokes).toHaveLength(1)
      expect(store.strokes[0]!.id).toBe('b')
    })
  })

  describe('undo', () => {
    it('reverses an add operation', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.addStroke(fakeStroke('b'))

      store.undo()
      expect(store.strokes).toHaveLength(1)
      expect(store.strokes[0]!.id).toBe('a')
      expect(store.canRedo).toBe(true)
    })

    it('reverses an erase operation (restores strokes)', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.addStroke(fakeStroke('b'))
      store.removeStrokes(['a'])

      store.undo()
      expect(store.strokes).toHaveLength(2)
    })

    it('is no-op when no history', () => {
      const store = useBoardStore()
      store.undo()
      expect(store.strokes).toEqual([])
      expect(store.renderVersion).toBe(0)
    })

    it('can undo multiple times', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.addStroke(fakeStroke('b'))
      store.addStroke(fakeStroke('c'))

      store.undo()
      store.undo()
      expect(store.strokes).toHaveLength(1)
      expect(store.strokes[0]!.id).toBe('a')
      store.undo()
      expect(store.strokes).toEqual([])
      store.undo() // no-op
      expect(store.strokes).toEqual([])
    })

    it('bumps renderVersion', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      const ver = store.renderVersion
      store.undo()
      expect(store.renderVersion).toBeGreaterThan(ver)
    })
  })

  describe('redo', () => {
    it('re-applies an undone add', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.undo()
      expect(store.strokes).toHaveLength(0)

      store.redo()
      expect(store.strokes).toHaveLength(1)
      expect(store.strokes[0]!.id).toBe('a')
    })

    it('re-applies an undone erase (removes again)', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.removeStrokes(['a'])
      store.undo()
      expect(store.strokes).toHaveLength(1)

      store.redo()
      expect(store.strokes).toHaveLength(0)
    })

    it('is no-op at head of history', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.redo()
      expect(store.strokes).toHaveLength(1)
    })

    it('bumps renderVersion', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.undo()
      const ver = store.renderVersion
      store.redo()
      expect(store.renderVersion).toBeGreaterThan(ver)
    })
  })

  describe('replaceAllStrokes', () => {
    it('replaces entire strokes array', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.addStroke(fakeStroke('b'))

      const newStrokes = [fakeStroke('x'), fakeStroke('y')]
      store.replaceAllStrokes(newStrokes)
      expect(store.strokes).toEqual(newStrokes)
      expect(store.renderVersion).toBe(3)
    })

    it('works with empty array', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.replaceAllStrokes([])
      expect(store.strokes).toEqual([])
    })
  })

  describe('replaceStrokes', () => {
    it('removes originals and adds fragments in single history entry', () => {
      const store = useBoardStore()
      const orig = fakeStroke('a')
      store.addStroke(orig)
      const frag1 = fakeStroke('a1')
      const frag2 = fakeStroke('a2')

      store.replaceStrokes([orig], [frag1, frag2])

      expect(store.strokes).toHaveLength(2)
      expect(store.strokes.map(s => s.id)).toEqual(['a1', 'a2'])

      const entry = store.historyStack[store.historyIndex]!
      expect(entry.type).toBe('erase')
      expect(entry.strokes).toHaveLength(1)
      expect(entry.strokes[0]!.id).toBe('a')
      expect(entry.additions).toHaveLength(2)
    })

    it('undo removes fragments and restores originals', () => {
      const store = useBoardStore()
      const orig = fakeStroke('a')
      store.addStroke(orig)
      const frag1 = fakeStroke('a1')
      const frag2 = fakeStroke('a2')
      store.replaceStrokes([orig], [frag1, frag2])

      store.undo()

      expect(store.strokes).toHaveLength(1)
      expect(store.strokes[0]!.id).toBe('a')
    })

    it('redo removes originals and restores fragments', () => {
      const store = useBoardStore()
      const orig = fakeStroke('a')
      store.addStroke(orig)
      const frag1 = fakeStroke('a1')
      const frag2 = fakeStroke('a2')
      store.replaceStrokes([orig], [frag1, frag2])
      store.undo()

      store.redo()

      expect(store.strokes).toHaveLength(2)
      expect(store.strokes.map(s => s.id)).toEqual(['a1', 'a2'])
    })
  })

  describe('clearHistory', () => {
    it('resets history stack and index', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.addStroke(fakeStroke('b'))
      expect(store.historyIndex).toBe(1)

      store.clearHistory()
      expect(store.historyStack).toEqual([])
      expect(store.historyIndex).toBe(-1)
    })

    it('does not affect strokes', () => {
      const store = useBoardStore()
      store.addStroke(fakeStroke('a'))
      store.clearHistory()
      expect(store.strokes).toHaveLength(1)
    })
  })
})
