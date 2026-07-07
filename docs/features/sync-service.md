# Sync Service Feature

## Overview

The Sync Service (`sync.service.ts`) is a singleton module handling WebSocket communication with offline queue and reconnect resync. Keeps connection state and offline operation queue in module scope so they survive component mount/unmount cycles.

## Architecture

### Lifecycle
1. `initSyncService(store)` — provide Pinia store reference (from `useBoardSocket`)
2. `connectSyncService(roomId)` — open WebSocket connection
3. `sendStrokeAdd()` / `sendStrokeErase()` — called from anywhere in app
4. `disconnectSyncService()` — cleanup on unmount
5. On reconnect: queued ops flushed → full state sync requested

### Exported Reactive State
| Ref/Computed | Type | Description |
|--------------|------|-------------|
| `status` | `ref<ConnectionStatus>` | 'connecting' \| 'connected' \| 'disconnected' \| 'error' |
| `socketError` | `ref<string>` | Error message when status === 'error' |
| `isOnline` | `computed` | `status.value === 'connected'` |
| `statusLabel` | `computed` | Human-readable label for UI badge |

### Internal State
- `socket: Socket | null` — socket.io client instance
- `roomId: string` — current room identifier
- `store: ReturnType<useBoardStore> | null` — Pinia store reference
- `offlineQueue: QueuedOp[]` — operations queued while offline

### Queued Operation Format
```ts
type QueuedOp =
  | { event: 'stroke:add'; data: Stroke }
  | { event: 'stroke:erase'; data: { strokeIds: string[] } }
```

### Connection Flow

#### `connectSyncService(room)`
1. Returns early if already connected
2. Sets `status = 'connecting'`
3. Creates `io(env.socketUrl, { transports: ['websocket'] })`
4. Registers event listeners:
   - `connect` → `onConnect`
   - `board`, `message`, `stroke:add`, `stroke:erase` → `handleIncoming`
   - `sync:state` → `handleSyncState`
   - `connect_error` → `onError`
   - `disconnect` → `onDisconnect`

#### `onConnect()`
1. `status = 'connected'`
2. Emits `room:join` with `roomId`
3. `flushQueue()` — sends queued operations
4. Emits `sync:request` — requests full state from server

#### `onDisconnect()`
Sets `status = 'disconnected'` (unless already 'error')

### Incoming Event Handling

#### `handleIncoming(raw)`
Normalizes legacy payload formats, then:
- `type === 'add' || 'stroke:add'` → `store.addStroke(stroke)`
- `type === 'erase' || 'stroke:erase'` → `store.removeStrokes(strokeIds)`

#### `handleSyncState(raw)` — Full state sync after reconnect
1. Validates `raw.strokes` is array
2. Sanitizes each stroke: requires `id` (string) and `points` (array)
3. `store.replaceAllStrokes(parsedStrokes)`
4. `store.clearHistory()` — history invalid after full sync

### Outgoing Operations

#### `tryEmit(event, payload)`
- If `socket.connected` → `socket.emit(event, payload)`
- Else → push to `offlineQueue`

#### `sendStrokeAdd(stroke)`
Calls `tryEmit('stroke:add', stroke)`

#### `sendStrokeErase(strokeIds)`
Calls `tryEmit('stroke:erase', { strokeIds })` (no-op if empty)

### Queue Flush

#### `flushQueue()`
Drains `offlineQueue` FIFO, emitting each operation. Called on reconnect in `onConnect`.

### Payload Normalization

`normalizeIncoming(raw)` handles backward-compatible envelopes:
- Legacy `board` / `message` events with `data` field
- Stringified JSON in `data` field
- Multiple event type fields: `event`, `action`, `type`
- Direct stroke objects with `strokeId` + `points`
- Erase payloads with `strokeIds` array

Returns `NormalisedPayload { type?, strokeId?, stroke?, strokeIds? }`

## API Surface

```ts
// Reactive state
export const status: Ref<ConnectionStatus>
export const socketError: Ref<string>
export const isOnline: ComputedRef<boolean>
export const statusLabel: ComputedRef<string>

// Initialisation
export function initSyncService(store: ReturnType<typeof useBoardStore>): void
export function clearStoreRef(): void

// Connection lifecycle
export function connectSyncService(room: string): void
export function disconnectSyncService(): void

// Outgoing
export function sendStrokeAdd(stroke: Stroke): void
export function sendStrokeErase(strokeIds: string[]): void
```

## Testing Notes

Module is a singleton with internal state — requires test isolation:
- Mock `socket.io-client` (`io` returns mock socket with event emitter)
- Reset module state between tests (or use fresh module via dynamic import)
- Key behaviors:
  - `connectSyncService` registers listeners and sets connecting status
  - `onConnect` emits room:join, flushes queue, requests sync
  - `handleIncoming` calls store.addStroke/removeStrokes
  - `handleSyncState` validates and calls store.replaceAllStrokes + clearHistory
  - `tryEmit` queues when offline, emits when online
  - `flushQueue` drains queue on reconnect
  - `normalizeIncoming` handles all legacy formats

Vue reactivity (`ref`, `computed`) requires `@vue/test-utils` or manual `effect` tracking in tests.