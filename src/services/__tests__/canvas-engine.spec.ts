import { describe, it, expect } from 'vitest'
import {
  screenToWorld,
  getViewportBounds,
  boundsIntersect,
  strokeHit,
  strokeErasedPoints,
  stickyNoteHit,
  ERASE_RADIUS_SCREEN,
} from '@/services/canvas-engine'
import type { Stroke, CameraState, Point, StickyNote } from '@/types/board.types'

const camera: CameraState = { x: 200, y: 150, zoom: 2 }
const canvasW = 800
const canvasH = 600

describe('screenToWorld', () => {
  it('converts screen center to camera origin', () => {
    const p = screenToWorld(canvasW / 2, canvasH / 2, camera, canvasW, canvasH)
    expect(p.x).toBe(camera.x)
    expect(p.y).toBe(camera.y)
  })

  it('converts screen top-left to world coordinates', () => {
    const p = screenToWorld(0, 0, camera, canvasW, canvasH)
    // sx=0 → (0 - 400)/2 + 200 = -200 + 200 = 0
    // sy=0 → (0 - 300)/2 + 150 = -150 + 150 = 0
    expect(p.x).toBe(0)
    expect(p.y).toBe(0)
  })

  it('handles zoom=1 identity case', () => {
    const cam: CameraState = { x: 0, y: 0, zoom: 1 }
    const p = screenToWorld(400, 300, cam, 800, 600)
    expect(p.x).toBe(0)
    expect(p.y).toBe(0)
  })

  it('scales offset by zoom', () => {
    const cam: CameraState = { x: 100, y: 100, zoom: 0.5 }
    const p = screenToWorld(0, 0, cam, 800, 600)
    // sx=0 → (0 - 400)/0.5 + 100 = -800 + 100 = -700
    // sy=0 → (0 - 300)/0.5 + 100 = -600 + 100 = -500
    expect(p.x).toBe(-700)
    expect(p.y).toBe(-500)
  })
})

describe('getViewportBounds', () => {
  it('computes correct bounds for centered camera', () => {
    const vp = getViewportBounds(camera, canvasW, canvasH)
    // halfW = 400/2 = 200, halfH = 300/2 = 150
    expect(vp.minX).toBe(0)   // 200 - 200
    expect(vp.maxX).toBe(400) // 200 + 200
    expect(vp.minY).toBe(0)   // 150 - 150
    expect(vp.maxY).toBe(300) // 150 + 150
  })

  it('expands bounds at lower zoom', () => {
    const cam: CameraState = { x: 0, y: 0, zoom: 0.5 }
    const vp = getViewportBounds(cam, 800, 600)
    expect(vp.minX).toBe(-800)
    expect(vp.maxX).toBe(800)
    expect(vp.minY).toBe(-600)
    expect(vp.maxY).toBe(600)
  })
})

describe('boundsIntersect', () => {
  const vp = { minX: 0, maxX: 100, minY: 0, maxY: 100 }

  it('returns true when stroke fully inside viewport', () => {
    const s = { minX: 10, maxX: 50, minY: 10, maxY: 50 } as Stroke
    expect(boundsIntersect(s, vp)).toBe(true)
  })

  it('returns true when stroke overlaps viewport edge', () => {
    const s = { minX: -10, maxX: 10, minY: 50, maxY: 150 } as Stroke
    expect(boundsIntersect(s, vp)).toBe(true)
  })

  it('returns false when stroke completely outside', () => {
    const s = { minX: 200, maxX: 300, minY: 200, maxY: 300 } as Stroke
    expect(boundsIntersect(s, vp)).toBe(false)
  })

  it('returns false when stroke left of viewport', () => {
    const s = { minX: -100, maxX: -1, minY: 0, maxY: 100 } as Stroke
    expect(boundsIntersect(s, vp)).toBe(false)
  })

  it('returns false when stroke above viewport', () => {
    const s = { minX: 0, maxX: 100, minY: -100, maxY: -1 } as Stroke
    expect(boundsIntersect(s, vp)).toBe(false)
  })

  it('handles negative coords correctly', () => {
    const vp2 = { minX: -50, maxX: 50, minY: -50, maxY: 50 }
    const s = { minX: -10, maxX: 10, minY: -10, maxY: 10 } as Stroke
    expect(boundsIntersect(s, vp2)).toBe(true)
  })
})

describe('strokeHit', () => {
  const radius = ERASE_RADIUS_SCREEN / 2 // arbitrary screen-space radius

  it('hits a single-point stroke at exact position', () => {
    const s: Stroke = {
      id: '1',
      points: [[50, 50]],
      minX: 50, maxX: 50, minY: 50, maxY: 50,
      width: 4,
      color: '#000',
    }
    expect(strokeHit(s, { x: 50, y: 50 }, radius)).toBe(true)
  })

  it('hits a single-point stroke within radius', () => {
    const s: Stroke = {
      id: '1',
      points: [[50, 50]],
      minX: 50, maxX: 50, minY: 50, maxY: 50,
      width: 4,
      color: '#000',
    }
    expect(strokeHit(s, { x: 50, y: 55 }, radius)).toBe(true)
  })

  it('misses a single-point stroke outside radius', () => {
    const s: Stroke = {
      id: '1',
      points: [[0, 0]],
      minX: 0, maxX: 0, minY: 0, maxY: 0,
      width: 2,
      color: '#000',
    }
    expect(strokeHit(s, { x: 999, y: 999 }, radius)).toBe(false)
  })

  it('hits a multi-point stroke near a segment', () => {
    const s: Stroke = {
      id: '1',
      points: [[0, 0], [100, 0]],
      minX: 0, maxX: 100, minY: 0, maxY: 0,
      width: 4,
      color: '#000',
    }
    // point slightly above the horizontal segment
    expect(strokeHit(s, { x: 50, y: 5 }, radius)).toBe(true)
  })

  it('misses a multi-point stroke far from all segments', () => {
    const s: Stroke = {
      id: '1',
      points: [[0, 0], [100, 0]],
      minX: 0, maxX: 100, minY: 0, maxY: 0,
      width: 4,
      color: '#000',
    }
    expect(strokeHit(s, { x: 50, y: 999 }, radius)).toBe(false)
  })

  it('early-outs via AABB check (far outside)', () => {
    const s: Stroke = {
      id: '1',
      points: [[10, 10], [20, 20]],
      minX: 10, maxX: 20, minY: 10, maxY: 20,
      width: 2,
      color: '#000',
    }
    expect(strokeHit(s, { x: 999, y: 999 }, 10)).toBe(false)
  })

  it('hits vertical segment', () => {
    const s: Stroke = {
      id: '1',
      points: [[100, 0], [100, 200]],
      minX: 100, maxX: 100, minY: 0, maxY: 200,
      width: 4,
      color: '#000',
    }
    expect(strokeHit(s, { x: 105, y: 100 }, 10)).toBe(true)
  })
})

describe('strokeErasedPoints', () => {
  const radius = 10
  const w = 4

  it('returns empty set when no points hit', () => {
    const s: Stroke = {
      id: '1', points: [[0, 0], [100, 0], [200, 0]] as Point[],
      minX: 0, maxX: 200, minY: 0, maxY: 0, width: w, color: '#000',
    }
    const result = strokeErasedPoints(s, { x: 999, y: 999 }, radius)
    expect(result.size).toBe(0)
  })

  it('marks single-point stroke when hit', () => {
    const s: Stroke = {
      id: '1', points: [[50, 50]] as Point[],
      minX: 50, maxX: 50, minY: 50, maxY: 50, width: 2, color: '#000',
    }
    const result = strokeErasedPoints(s, { x: 50, y: 50 }, radius)
    expect(result).toEqual(new Set([0]))
  })

  it('marks both endpoints of a hit segment', () => {
    const s: Stroke = {
      id: '1', points: [[0, 0], [100, 0], [200, 0]] as Point[],
      minX: 0, maxX: 200, minY: 0, maxY: 0, width: w, color: '#000',
    }
    const result = strokeErasedPoints(s, { x: 50, y: 5 }, radius)
    expect(result.has(0)).toBe(true)
    expect(result.has(1)).toBe(true)
  })

  it('does not mark endpoints of untouched segment', () => {
    const s: Stroke = {
      id: '1', points: [[0, 0], [10, 0], [200, 200]] as Point[],
      minX: 0, maxX: 200, minY: 0, maxY: 200, width: w, color: '#000',
    }
    const result = strokeErasedPoints(s, { x: 195, y: 195 }, radius)
    expect(result.has(1)).toBe(true)
    expect(result.has(2)).toBe(true)
    expect(result.has(0)).toBe(false)
  })

  it('marks multiple disjoint segments', () => {
    const s: Stroke = {
      id: '1', points: [[0, 0], [10, 0], [50, 0], [100, 0], [200, 0]] as Point[],
      minX: 0, maxX: 200, minY: 0, maxY: 0, width: w, color: '#000',
    }
    const result = strokeErasedPoints(s, { x: 10, y: 5 }, radius)
    expect(result.size).toBeGreaterThanOrEqual(2)
  })
})

describe('stickyNoteHit', () => {
  function makeSticky(overrides: Partial<StickyNote> = {}): StickyNote {
    return {
      id: 's1', x: 100, y: 100, width: 200, height: 150,
      text: 'hello', truncate: false, color: '#fff9c4',
      ...overrides,
    }
  }

  it('returns true when trail union fully contains sticky rect', () => {
    const s = makeSticky()
    // trail union rect covers [50,50] to [350,300] which contains sticky [100,100] to [300,250]
    const trailUnion = { minX: 50, minY: 50, maxX: 350, maxY: 300 }
    expect(stickyNoteHit(s, trailUnion)).toBe(true)
  })

  it('returns false when trail union partially overlaps', () => {
    const s = makeSticky()
    const trailUnion = { minX: 50, minY: 50, maxX: 150, maxY: 150 }
    // trail only covers top-left quarter of sticky
    expect(stickyNoteHit(s, trailUnion)).toBe(false)
  })

  it('returns false when trail union does not overlap at all', () => {
    const s = makeSticky()
    const trailUnion = { minX: 500, minY: 500, maxX: 600, maxY: 600 }
    expect(stickyNoteHit(s, trailUnion)).toBe(false)
  })

  it('returns true when trail union exactly matches sticky rect', () => {
    const s = makeSticky()
    const trailUnion = { minX: 100, minY: 100, maxX: 300, maxY: 250 }
    expect(stickyNoteHit(s, trailUnion)).toBe(true)
  })

  it('returns true when trail union exceeds sticky rect on all sides', () => {
    const s = makeSticky()
    const trailUnion = { minX: 0, minY: 0, maxX: 400, maxY: 350 }
    expect(stickyNoteHit(s, trailUnion)).toBe(true)
  })
})
