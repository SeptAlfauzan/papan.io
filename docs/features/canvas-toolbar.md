# Canvas Toolbar Feature

## Overview

`CanvasToolbar` is the floating toolbar component for the infinite canvas board. It provides tool selection, stroke customization, undo/redo controls, and zoom controls. All state is owned by `useCanvas` and passed as props.

## Architecture

### Props

| Prop | Type | Description |
|------|------|-------------|
| `tool` | `ToolMode` | Active tool: 'pencil' \| 'hand' \| 'eraser' |
| `color` | `string` | Current stroke color (hex) |
| `strokeWidth` | `number` | Stroke width in pixels (1–40) |
| `zoomDisplay` | `number` | Zoom percentage readout |
| `canUndo` | `boolean` | Enable/disable undo button |
| `canRedo` | `boolean` | Enable/disable redo button |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `update:tool` | `ToolMode` | Tool selection changed |
| `update:color` | `string` | Color picker changed |
| `update:strokeWidth` | `number` | Stroke width slider changed |
| `undo` | — | Undo action triggered |
| `redo` | — | Redo action triggered |
| `zoomIn` | — | Zoom in triggered |
| `zoomOut` | — | Zoom out triggered |
| `resetView` | — | Reset camera to origin |

### Layout

Positioned `fixed` at bottom center of the board:
- `left: 50%`, `bottom: 20px`, `transform: translateX(-50%)`
- Rounded container with dark theme (`#1c1c1e` background)

### Controls

#### Tool Buttons (left section)
- **Pencil** — SVG icon, tooltip "Pencil (P)"
- **Hand** — SVG icon, tooltip "Hand tool (H)"
- **Eraser** — SVG icon, tooltip "Eraser (E)"

Active tool highlighted with purple tint (`rgba(139, 92, 246, 0.18)`)

#### Undo/Redo
- Undo button (disabled when `canUndo === false`), tooltip "Undo (Ctrl+Z)"
- Redo button (disabled when `canRedo === false`), tooltip "Redo (Ctrl+Shift+Z)"

#### Stroke Customization
- **Color picker**: `<input type="color">` with styled swatch
- **Stroke width slider**: `<input type="range" min="1" max="40">` with px readout

#### Zoom Controls
- **Zoom out** button (SVG minus icon)
- **Zoom readout** button — shows current percentage, clicking resets view
- **Zoom in** button (SVG plus icon)

### Styling

- Dark theme: background `#1c1c1e`, border `#2e2e30`
- Hover: background `#2a2a2d`, text `#e7e7ea`
- Active: `scale(0.92)` press effect
- Disabled buttons: 35% opacity
- Divider lines between sections
- `user-select: none` prevents text selection
- All components use `position: absolute` within `.toolbar` container
- `z-index: 10` to stay above canvas

## API Surface

Component emits typed events — no direct method calls. Designed for use with `v-model` pattern for tool/color/strokeWidth:

```vue
<CanvasToolbar
  :tool="tool"
  :color="color"
  :stroke-width="strokeWidth"
  :zoom-display="zoomDisplay"
  :can-undo="canUndo"
  :can-redo="canRedo"
  @update:tool="tool = $event"
  @update:color="color = $event"
  @update:stroke-width="strokeWidth = $event"
  @undo="undo"
  @redo="redo"
  @zoom-in="zoomInBtn"
  @zoom-out="zoomOutBtn"
  @reset-view="resetView"
/>
```

## Testing Notes

Component test with `@vue/test-utils`:
- Verify all buttons render with correct labels/tooltips
- Verify active class on selected tool button
- Verify disabled state on undo/redo buttons
- Verify color picker and range slider emit correct events
- Verify zoom readout shows correct percentage
- Verify all emit events fire with correct payloads