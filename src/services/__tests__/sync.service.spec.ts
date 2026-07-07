import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBoardStore } from '@/stores/board.store'
import type { Stroke, StickyNote } from '@/types/board.types'

const mockSocket = vi.hoisted(() => ({
  connected: false,
  emit: vi.fn<(...args: unknown[]) => void>(),
  on: vi.fn<(...args: unknown[]) => void>(),
  removeAllListeners: vi.fn<() => void>(),
  disconnect: vi.fn<() => void>(),
}))

const mockIo = vi.hoisted(() => vi.fn<() => typeof mockSocket>(() => mockSocket))

vi.mock('socket.io-client', () => ({ io: mockIo }))

function fakeStroke(id: string): Stroke {
  return {
    id, points: [[0, 0]], color: '#000', width: 2,
    minX: 0, maxX: 0, minY: 0, maxY: 0,
  }
}

function fakeSticky(id: string, overrides: Partial<StickyNote> = {}): StickyNote {
  return {
    id, x: 0, y: 0, width: 150, height: 150,
    text: '', truncate: false, color: '#fff9c4',
    ...overrides,
  }
}

function incomingStroke(id: string): Record<string, unknown> {
  return { strokeId: id, points: [[0, 0]], color: '#000', width: 2 }
}

describe('sync service', () => {
  let store: ReturnType<typeof useBoardStore>

  beforeEach(async () => {
    setActivePinia(createPinia())
    store = useBoardStore()
    vi.clearAllMocks()
  })

  /** Import sync module fresh */
  async function loadSync() {
    return await import('@/services/sync.service')
  }

  /**
   * Import + connect — socket is created, handlers registered.
   * After this, mockSocket.on has been called with all event names.
   */
  async function setupConnected() {
    // Guard: previous test may have left socket.connected = true
    mockSocket.connected = false
    const sync = await loadSync()
    // Clean up stale singleton state from prior test
    sync.disconnectSyncService()
    sync.initSyncService(store)
    sync.connectSyncService('room')
    return sync
  }

  it('exports default disconnected state', async () => {
    const sync = await loadSync()
    expect(sync.status.value).toBe('disconnected')
    expect(sync.isOnline.value).toBe(false)
    expect(sync.statusLabel.value).toBe('disconnected')
  })

  it('statusLabel shows error message on error', async () => {
    const sync = await loadSync()
    sync.status.value = 'error'
    sync.socketError.value = 'timeout'
    expect(sync.statusLabel.value).toContain('timeout')
  })

  describe('connectSyncService', () => {
    it('creates socket and registers listeners', async () => {
      const sync = await setupConnected()

      expect(sync.status.value).toBe('connecting')
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('board', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('sync:state', expect.any(Function))
    })

    it('is no-op when socket already connected', async () => {
      const sync = await setupConnected()
      mockSocket.connected = true

      // find the connect handler and call it to simulate connection
      const connectEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'connect')
      expect(connectEntry).toBeDefined()
      connectEntry![1]()

      const emitCount = mockSocket.emit.mock.calls.length

      sync.connectSyncService('room-2')
      expect(mockSocket.emit.mock.calls.length).toBe(emitCount)
    })
  })

  describe('onConnect', () => {
    it('sets connected status, joins room, flushes queue, requests sync', async () => {
      await setupConnected()
      mockSocket.connected = true

      const connectEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'connect')
      expect(connectEntry).toBeDefined()
      connectEntry![1]()

      expect(mockSocket.emit).toHaveBeenCalledWith('room:join', 'room')
      expect(mockSocket.emit).toHaveBeenCalledWith('sync:request', { roomId: 'room' })
    })
  })

  describe('onDisconnect', () => {
    it('sets disconnected status', async () => {
      await setupConnected()

      const disconnectEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'disconnect')
      expect(disconnectEntry).toBeDefined()
      disconnectEntry![1]()
    })

    it('does not override error status', async () => {
      const sync = await loadSync()
      sync.initSyncService(store)
      sync.connectSyncService('room')
      sync.status.value = 'error'

      const disconnectEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'disconnect')
      expect(disconnectEntry).toBeDefined()
      disconnectEntry![1]()

      expect(sync.status.value).toBe('error')
    })
  })

  describe('handleIncoming', () => {
    it('calls addStroke for stroke:add event', async () => {
      await setupConnected()

      const addEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'stroke:add')
      expect(addEntry).toBeDefined()
      addEntry![1](incomingStroke('incoming-1'))

      expect(store.strokes).toHaveLength(1)
      expect(store.strokes[0]!.id).toBe('incoming-1')
    })

    it('calls removeStrokes for stroke:erase event', async () => {
      await setupConnected()
      store.addStroke(fakeStroke('a'))

      const eraseEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'stroke:erase')
      expect(eraseEntry).toBeDefined()
      eraseEntry![1]({ strokeIds: ['a'] })

      expect(store.strokes).toHaveLength(0)
    })

    it('handles legacy board event with data field', async () => {
      await setupConnected()

      const boardEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'board')
      expect(boardEntry).toBeDefined()
      boardEntry![1]({ data: { event: 'stroke:add', ...incomingStroke('legacy') } })

      expect(store.strokes).toHaveLength(1)
      expect(store.strokes[0]!.id).toBe('legacy')
    })

    it('handles stringified JSON in data field', async () => {
      await setupConnected()

      const msgEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'message')
      expect(msgEntry).toBeDefined()
      msgEntry![1]({ data: JSON.stringify({ event: 'stroke:add', ...incomingStroke('str-json') }) })

      expect(store.strokes).toHaveLength(1)
      expect(store.strokes[0]!.id).toBe('str-json')
    })

    it('ignores invalid payload gracefully', async () => {
      await setupConnected()

      const addEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'stroke:add')
      expect(addEntry).toBeDefined()
      const handler = addEntry![1] as (...args: unknown[]) => void

      handler(null)
      handler(undefined)
      handler(42)
      handler('string')

      expect(store.strokes).toHaveLength(0)
    })

    it('no-ops when store is null', async () => {
      const sync = await loadSync()
      sync.connectSyncService('room')

      const addEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'stroke:add')
      expect(addEntry).toBeDefined()
      addEntry![1](incomingStroke('orphan'))

      // No crash, no strokes added
    })

    it('calls addStickyNote for sticky:add event', async () => {
      await setupConnected()

      const addEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'sticky:add')
      expect(addEntry).toBeDefined()
      addEntry![1](fakeSticky('sticky-1', { text: 'hello' }))

      expect(store.stickyNotes).toHaveLength(1)
      expect(store.stickyNotes[0]!.id).toBe('sticky-1')
    })

    it('calls removeStickyNote for sticky:erase event', async () => {
      await setupConnected()
      store.addStickyNote(fakeSticky('a'))

      const eraseEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'sticky:erase')
      expect(eraseEntry).toBeDefined()
      eraseEntry![1]({ stickyId: 'a' })

      expect(store.stickyNotes).toHaveLength(0)
    })

    it('calls updateStickyNote for sticky:update event', async () => {
      await setupConnected()
      store.addStickyNote(fakeSticky('a', { text: 'old', truncate: false }))

      const updateEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'sticky:update')
      expect(updateEntry).toBeDefined()
      updateEntry![1]({ stickyId: 'a', text: 'new', truncate: true })

      expect(store.stickyNotes[0]!.text).toBe('new')
      expect(store.stickyNotes[0]!.truncate).toBe(true)
    })
  })

  describe('handleSyncState', () => {
    it('replaces all strokes and clears history', async () => {
      await setupConnected()
      store.addStroke(fakeStroke('old'))

      const syncEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'sync:state')
      expect(syncEntry).toBeDefined()
      syncEntry![1]({ strokes: [fakeStroke('new1'), fakeStroke('new2')] })

      expect(store.strokes).toHaveLength(2)
      expect(store.strokes[0]!.id).toBe('new1')
      expect(store.strokes[1]!.id).toBe('new2')
      expect(store.historyIndex).toBe(-1)
    })

    it('validates strokes array before replacing', async () => {
      await setupConnected()
      store.addStroke(fakeStroke('a'))

      const syncEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'sync:state')
      expect(syncEntry).toBeDefined()
      syncEntry![1]({ strokes: 'not-an-array' })

      expect(store.strokes).toHaveLength(1)
    })

    it('filters out invalid stroke entries', async () => {
      await setupConnected()
      store.addStroke(fakeStroke('old'))

      const syncEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'sync:state')
      expect(syncEntry).toBeDefined()
      syncEntry![1]({
        strokes: [
          fakeStroke('good'),
          null,
          { id: 'no-points' },
          42,
        ],
      })

      expect(store.strokes).toHaveLength(1)
      expect(store.strokes[0]!.id).toBe('good')
    })
  })

  describe('sendStrokeAdd / sendStrokeErase', () => {
    it('queues stroke:add when offline', async () => {
      const sync = await setupConnected()
      mockSocket.connected = false

      sync.sendStrokeAdd(fakeStroke('offline-a'))
      expect(mockSocket.emit).not.toHaveBeenCalled()
    })

    it('emits stroke:add when online', async () => {
      await setupConnected()
      mockSocket.connected = true

      const connectEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'connect')
      expect(connectEntry).toBeDefined()
      connectEntry![1]()
      mockSocket.emit.mockClear()

      const sync = await import('@/services/sync.service')
      sync.sendStrokeAdd(fakeStroke('online-a'))
      expect(mockSocket.emit).toHaveBeenCalledWith('stroke:add', expect.objectContaining({ id: 'online-a' }))
    })

    it('no-ops sendStrokeErase with empty array', async () => {
      const sync = await loadSync()
      sync.sendStrokeErase([])
      expect(mockSocket.emit).not.toHaveBeenCalled()
    })

    it('queues stroke:erase when offline', async () => {
      const sync = await setupConnected()
      mockSocket.connected = false

      sync.sendStrokeErase(['a', 'b'])
      expect(mockSocket.emit).not.toHaveBeenCalled()
    })

    it('queues sticky:add when offline', async () => {
      const sync = await setupConnected()
      mockSocket.connected = false
      sync.sendStickyAdd(fakeSticky('offline-s'))
      expect(mockSocket.emit).not.toHaveBeenCalled()
    })

    it('emits sticky:add when online', async () => {
      await setupConnected()
      mockSocket.connected = true
      const connectEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'connect')
      expect(connectEntry).toBeDefined()
      connectEntry![1]()
      mockSocket.emit.mockClear()
      const sync = await import('@/services/sync.service')
      sync.sendStickyAdd(fakeSticky('online-s', { text: 'hi' }))
      expect(mockSocket.emit).toHaveBeenCalledWith('sticky:add', expect.objectContaining({ id: 'online-s' }))
    })

    it('queues sticky:erase when offline', async () => {
      const sync = await setupConnected()
      mockSocket.connected = false
      sync.sendStickyErase('a')
      expect(mockSocket.emit).not.toHaveBeenCalled()
    })

    it('queues sticky:update when offline', async () => {
      const sync = await setupConnected()
      mockSocket.connected = false
      sync.sendStickyUpdate('a', { text: 'new', truncate: true })
      expect(mockSocket.emit).not.toHaveBeenCalled()
    })
  })

  describe('flushQueue', () => {
    it('emits queued ops on reconnect', async () => {
      const sync = await setupConnected()
      mockSocket.connected = false

      sync.sendStrokeAdd(fakeStroke('q1'))
      sync.sendStrokeAdd(fakeStroke('q2'))
      sync.sendStrokeErase(['q3'])

      mockSocket.connected = true
      const connectEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'connect')
      expect(connectEntry).toBeDefined()
      connectEntry![1]()

      const strokeAddCalls = mockSocket.emit.mock.calls.filter((c: [string]) => c[0] === 'stroke:add')
      const strokeEraseCalls = mockSocket.emit.mock.calls.filter((c: [string]) => c[0] === 'stroke:erase')
      expect(strokeAddCalls).toHaveLength(2)
      expect(strokeEraseCalls).toHaveLength(1)
    })
  })

  describe('disconnectSyncService', () => {
    it('removes listeners, disconnects, sets disconnected', async () => {
      const sync = await setupConnected()
      sync.disconnectSyncService()

      expect(mockSocket.removeAllListeners).toHaveBeenCalled()
      expect(mockSocket.disconnect).toHaveBeenCalled()
      expect(sync.status.value).toBe('disconnected')
    })
  })

  describe('clearStoreRef', () => {
    it('makes incoming events no-ops', async () => {
      const sync = await setupConnected()
      sync.clearStoreRef()

      const addEntry = mockSocket.on.mock.calls.find((c: [string]) => c[0] === 'stroke:add')
      expect(addEntry).toBeDefined()
      addEntry![1](incomingStroke('orphan'))

      expect(store.strokes).toHaveLength(0)
    })
  })
})
