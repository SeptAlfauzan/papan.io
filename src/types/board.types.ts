/** 2D point in world coordinates */
export type Point = [number, number]

/** A single stroke on the infinite canvas */
export interface Stroke {
  id: string
  points: Point[]
  color: string
  width: number
  /** Bounding box for viewport culling */
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Camera state: world-space coordinate at screen center */
export interface CameraState {
  x: number
  y: number
  zoom: number
}

/** Operation stored in undo/redo history */
export interface HistoryEntry {
  type: 'add' | 'erase'
  strokes: Stroke[]
  additions?: Stroke[]
}

/** Connection status for WebSocket */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

/** Tool modes available in the toolbar */
export type ToolMode = 'pencil' | 'hand' | 'eraser'
