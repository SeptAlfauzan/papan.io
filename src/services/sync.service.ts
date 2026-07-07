/**
 * sync.service.ts — WebSocket sync service with offline queue & reconnect resync.
 *
 * Singleton module. Keeps connection state and offline operation queue
 * in module scope so they survive component mount/unmount cycles.
 *
 * Lifecycle:
 * 1. Call `initSyncService(store)` once (from useBoardSocket)
 * 2. Call `connectSyncService(roomId)` to open WebSocket
 * 3. Use `sendStrokeAdd()` / `sendStrokeErase()` anywhere in the app
 * 4. Call `disconnectSyncService()` on unmount
 * 5. On reconnect: queued ops are flushed, then full state sync is requested
 */
import { ref, computed } from 'vue'
import { io, type Socket } from 'socket.io-client'
import { env } from '@/configs/env'
import type { Stroke, StickyNote, ConnectionStatus } from '@/types/board.types'
import type { useBoardStore } from '@/stores/board.store'

// ── Exported reactive state ─────────────────────────────────────────
export const status = ref<ConnectionStatus>('disconnected')
export const socketError = ref('')
export const isOnline = computed(() => status.value === 'connected')

export const statusLabel = computed(() => {
  if (status.value === 'error') return `error: ${socketError.value || 'unknown'}`
  return status.value
})

// ── Internal state ──────────────────────────────────────────────────
type QueuedOp =
  | { event: 'stroke:add'; data: Stroke }
  | { event: 'stroke:erase'; data: { strokeIds: string[] } }
  | { event: 'sticky:add'; data: StickyNote }
  | { event: 'sticky:erase'; data: { stickyId: string } }
  | { event: 'sticky:update'; data: { stickyId: string; patch: Record<string, unknown> } }

let socket: Socket | null = null
let roomId = ''
let store: ReturnType<typeof useBoardStore> | null = null
const offlineQueue: QueuedOp[] = []

// ── Initialisation ──────────────────────────────────────────────────

/** Provide a reference to the Pinia store so incoming events can mutate state. */
export function initSyncService(s: ReturnType<typeof useBoardStore>): void {
  store = s
}

export function clearStoreRef(): void {
  store = null
}

// ── Connection lifecycle ────────────────────────────────────────────

export function connectSyncService(room: string): void {
  if (socket?.connected) return
  roomId = room

  status.value = 'connecting'
  socketError.value = ''

  socket = io(env.socketUrl, {
    transports: ['websocket'],
  })

  socket.on('connect', onConnect)
  socket.on('board', handleIncoming)
  socket.on('message', handleIncoming)
  socket.on('stroke:add', handleIncoming)
  socket.on('stroke:erase', handleIncoming)
  socket.on('sync:state', handleSyncState)
  socket.on('connect_error', onError)
  socket.on('disconnect', onDisconnect)
}

export function disconnectSyncService(): void {
  if (!socket) return
  socket.removeAllListeners()
  socket.disconnect()
  socket = null
  offlineQueue.length = 0
  status.value = 'disconnected'
}

// ── Event handlers ──────────────────────────────────────────────────

function onConnect(): void {
  status.value = 'connected'
  // Join the room
  if (roomId) socket?.emit('room:join', roomId)
  // Flush any operations queued while offline
  flushQueue()
  // Request full state sync from server
  socket?.emit('sync:request', { roomId })
}

function onError(err: Error): void {
  status.value = 'error'
  socketError.value = err.message || 'socket error'
}

function onDisconnect(): void {
  if (status.value !== 'error') {
    status.value = 'disconnected'
  }
}

// ── Incoming data handlers ──────────────────────────────────────────

function handleIncoming(raw: unknown): void {
  if (!store) return
  const data = normalizeIncoming(raw)
  if (!data) return

  const { type, stroke, strokeIds } = data

  if (type === 'add' || type === 'stroke:add') {
    if (stroke) {
      store.addStroke(stroke)
    }
  } else if (type === 'erase' || type === 'stroke:erase') {
    if (strokeIds && strokeIds.length > 0) {
      store.removeStrokes(strokeIds)
    }
  }
}

/** Handle full state sync payload from server after reconnect */
function handleSyncState(raw: unknown): void {
  if (!store) return
  if (!raw || typeof raw !== 'object') return

  const data = raw as Record<string, unknown>
  const rawStrokes = data.strokes

  if (!Array.isArray(rawStrokes)) return

  // Validate and sanitise incoming strokes
  const parsedStrokes: Stroke[] = []
  for (const item of rawStrokes) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    if (typeof s.id !== 'string') continue
    if (!Array.isArray(s.points)) continue
    parsedStrokes.push(s as unknown as Stroke)
  }

  store.replaceAllStrokes(parsedStrokes)
  store.clearHistory()
}

// ── Outgoing helpers ────────────────────────────────────────────────

/**
 * Try to send immediately. If offline, push to queue for later delivery.
 */
function tryEmit(event: string, payload: unknown): void {
  if (socket?.connected) {
    socket.emit(event, payload)
  } else {
    // Push to queue — will be flushed on reconnect
    offlineQueue.push({ event, data: payload } as QueuedOp)
  }
}

/**
 * Send a completed stroke to the server.
 * Called from useCanvas after a draw operation finishes.
 */
export function sendStrokeAdd(stroke: Stroke): void {
  tryEmit('stroke:add', stroke)
}

/**
 * Notify the server that strokes have been erased.
 * Called from useCanvas after an erase operation finishes.
 */
export function sendStrokeErase(strokeIds: string[]): void {
  if (strokeIds.length === 0) return
  tryEmit('stroke:erase', { strokeIds })
}

export function sendStickyAdd(note: StickyNote): void {
  tryEmit('sticky:add', note)
}

export function sendStickyErase(id: string): void {
  tryEmit('sticky:erase', { stickyId: id })
}

export function sendStickyUpdate(id: string, patch: { text?: string; truncate?: boolean }): void {
  tryEmit('sticky:update', { stickyId: id, patch })
}

// ── Queue flush & resync ────────────────────────────────────────────

/** Send all queued operations, then request full state sync */
function flushQueue(): void {
  if (!socket?.connected) return
  if (offlineQueue.length === 0) return

  // Drain queue and emit each operation
   
  while (true) {
    const op = offlineQueue.shift()
    if (!op) break
    socket.emit(op.event, op.data)
  }
}

// ── Payload normalisation (backward-compatible) ──────────────────────

interface NormalisedPayload {
  type?: string
  strokeId?: string
  stroke?: Stroke
  strokeIds?: string[]
}

function normalizeIncoming(raw: unknown): NormalisedPayload | null {
  if (!raw || typeof raw !== 'object') return null

  const input = raw as Record<string, unknown>

  // Handle legacy 'board' / 'message' event envelope
  const body = (() => {
    if (input.data && typeof input.data === 'object') return input.data as Record<string, unknown>
    if (typeof input.data === 'string') {
      try {
        const parsed = JSON.parse(input.data)
        if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
      } catch {
        /* ignore parse errors */
      }
    }
    return input
  })()

  if (!body) return null

  // Infer event type from explicit field or payload structure
  const explicitType =
    (typeof body.event === 'string' ? body.event : undefined) ??
    (typeof body.action === 'string' ? body.action : undefined) ??
    (typeof body.type === 'string' ? body.type : undefined)

  const strokeId = typeof body.strokeId === 'string' ? body.strokeId : undefined
  const strokeIds = Array.isArray(body.strokeIds) ? (body.strokeIds as string[]) : undefined

  const isAdd = strokeId && Array.isArray(body.points)
  const isErase = !isAdd && !!strokeIds

  const type = explicitType ?? (isAdd ? 'add' : isErase ? 'erase' : 'add')

  if (isAdd) {
    // Map server-side strokeId to client-side id
    const stroke = { ...(body as object), id: (body.id as string) ?? strokeId } as unknown as Stroke
    return { type, strokeId, stroke }
  }

  if (isErase) {
    return { type, strokeIds }
  }

  return { type, strokeId }
}
