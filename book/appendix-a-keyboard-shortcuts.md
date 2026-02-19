# Appendix A — Complete Keyboard Shortcut Reference

This appendix lists every keyboard shortcut in Quar Animator, organized by category. Shortcuts use Ctrl on Windows/Linux and Cmd on macOS unless noted otherwise.

## Tool Shortcuts

Single-key shortcuts that activate drawing and editing tools. These are suppressed when focus is inside an `<input>`, `<textarea>`, or `<select>` element.

| Key | Tool             | Description                                         |
| --- | ---------------- | --------------------------------------------------- |
| V   | Selection        | Select, move, resize, and rotate objects            |
| A   | Direct Selection | Edit individual path points and Bezier handles      |
| H   | Hand             | Pan the canvas by dragging                          |
| R   | Rectangle        | Draw rectangles (Shift = square, Alt = from center) |
| O   | Ellipse          | Draw ellipses (Shift = circle, Alt = from center)   |
| U   | Polygon          | Draw regular polygons (3–12 sides)                  |
| S   | Star             | Draw star shapes with configurable inner radius     |
| P   | Pen              | Create Bezier paths point by point                  |
| B   | Brush            | Freehand drawing with pressure sensitivity          |
| E   | Eraser           | Boolean-subtract freehand strokes from shapes       |
| T   | Text             | Create and edit text nodes                          |
| F   | Artboard         | Create named composition frames                     |
| J   | Bone             | Create bones for skeletal animation                 |
| W   | Weight Paint     | Paint skin weights for mesh deformation             |

## Edit Shortcuts

| Shortcut     | Action           | Notes                                                |
| ------------ | ---------------- | ---------------------------------------------------- |
| Ctrl+Z       | Undo             | Restores previous scene graph snapshot               |
| Ctrl+Shift+Z | Redo             | Also: Ctrl+Y                                         |
| Ctrl+X       | Cut              | Copy to clipboard + delete                           |
| Ctrl+C       | Copy             | Deep-clone selected nodes to clipboard               |
| Ctrl+V       | Paste            | Paste from internal or external clipboard            |
| Ctrl+D       | Duplicate        | Copy + paste in one operation (checks `!e.shiftKey`) |
| Ctrl+A       | Select All       | Selects all root nodes and descendants               |
| Delete       | Delete Selection | Also: Backspace                                      |

## Arrange Shortcuts

| Shortcut     | Action                              |
| ------------ | ----------------------------------- |
| Ctrl+]       | Bring Forward (one step in z-order) |
| Ctrl+Shift+] | Bring to Front (top of z-order)     |
| Ctrl+[       | Send Backward (one step in z-order) |
| Ctrl+Shift+[ | Send to Back (bottom of z-order)    |

## Group & Boolean Shortcuts

| Shortcut     | Action                 |
| ------------ | ---------------------- |
| Ctrl+G       | Group selected nodes   |
| Ctrl+Shift+G | Ungroup selected group |
| Ctrl+Shift+U | Boolean Union          |
| Ctrl+Shift+D | Boolean Subtract       |
| Ctrl+Shift+I | Boolean Intersect      |
| Ctrl+Shift+X | Boolean Exclude (XOR)  |

## Convert Shortcuts

| Shortcut     | Action                                              |
| ------------ | --------------------------------------------------- |
| Ctrl+Shift+P | Convert to Path (text or primitive → editable path) |
| Ctrl+Shift+O | Outline Stroke (stroke → filled path)               |
| Ctrl+Shift+K | Create Symbol (selection → reusable component)      |

## Project Shortcuts

| Shortcut     | Action       |
| ------------ | ------------ |
| Ctrl+N       | New Project  |
| Ctrl+O       | Open Project |
| Ctrl+S       | Save         |
| Ctrl+Shift+S | Save As      |
| Ctrl+I       | Import SVG   |

## View Shortcuts

| Shortcut     | Action                         |
| ------------ | ------------------------------ |
| Ctrl+=       | Zoom In (1.25×)                |
| Ctrl+-       | Zoom Out (0.8×)                |
| Ctrl+1       | Zoom to 100%                   |
| Ctrl+0       | Fit to Window                  |
| Shift+R      | Toggle Rulers                  |
| Shift+G      | Toggle Guides                  |
| Scroll Wheel | Zoom in/out at cursor position |

## Animation Shortcuts

| Shortcut   | Action                 | Notes                                      |
| ---------- | ---------------------- | ------------------------------------------ |
| Space      | Play / Pause           | Toggle animation playback                  |
| Home       | Go to Start            | Jump to frame 0                            |
| End        | Go to End              | Jump to last frame                         |
| , (comma)  | Previous Frame         | Step back 1 frame (stopped only)           |
| . (period) | Next Frame             | Step forward 1 frame (stopped only)        |
| Shift+,    | Jump Back 10 Frames    | Stopped only                               |
| Shift+.    | Jump Forward 10 Frames | Stopped only                               |
| L          | Toggle Loop            | Enable/disable looping playback            |
| K          | Toggle Auto-Keyframe   | Auto-create keyframes on property changes  |
| G          | Toggle Graph Editor    | Switch between dope sheet and curve editor |
| Shift+O    | Toggle Onion Skinning  | Show ghost frames before/after current     |
| I          | Set Work Area Start    | Mark current frame as in-point             |
| Shift+I    | Set Work Area End      | Mark current frame as out-point            |
| Alt+W      | Toggle Work Area       | Show/hide work area range                  |

## Selection & Transform

| Shortcut           | Action                                          |
| ------------------ | ----------------------------------------------- |
| Click              | Select single node                              |
| Shift+Click        | Add to / remove from selection                  |
| Double-click group | Enter group (scope selection to children)       |
| Double-click text  | Enter text editing mode                         |
| Escape             | Exit group / clear selection / cancel operation |
| Arrow keys         | Nudge selection by 1 pixel                      |
| Shift+Arrow keys   | Nudge selection by 10 pixels                    |

## Resize & Rotate Modifiers

These modifiers apply while dragging transform handles:

| Modifier           | Effect                      |
| ------------------ | --------------------------- |
| Shift (resize)     | Lock aspect ratio           |
| Alt (resize)       | Resize from center          |
| Shift+Alt (resize) | Constrained + center-origin |
| Shift (rotate)     | Snap to 15° increments      |

## Direct Selection (Path Editing)

| Shortcut          | Action                                     |
| ----------------- | ------------------------------------------ |
| Shift+Click point | Multi-select path points                   |
| Ctrl+Drag handle  | Break handle symmetry (move independently) |
| Alt+Click point   | Convert point type (corner ↔ smooth)       |
| Delete            | Remove selected path points                |

## Pen Tool

| Shortcut          | Action                        |
| ----------------- | ----------------------------- |
| Click             | Add corner point              |
| Click+Drag        | Add smooth point with handles |
| Click first point | Close path                    |
| Enter             | Finalize open path            |
| Escape            | Cancel current path           |

## Brush & Eraser

| Shortcut | Action                     |
| -------- | -------------------------- |
| [        | Decrease brush/eraser size |
| ]        | Increase brush/eraser size |
| Escape   | Cancel current stroke      |

## Weight Paint Tool

| Shortcut | Action                         |
| -------- | ------------------------------ |
| [        | Decrease brush size            |
| ]        | Increase brush size            |
| X        | Toggle add/subtract paint mode |

## Point Magnet Tool (Smart Bones)

| Shortcut | Action                                          |
| -------- | ----------------------------------------------- |
| [        | Decrease brush radius                           |
| ]        | Increase brush radius                           |
| F        | Cycle falloff mode (smooth → linear → constant) |
| Escape   | Discard recording changes                       |

## Text Editing

| Shortcut    | Action                                |
| ----------- | ------------------------------------- |
| Enter       | Confirm text and exit edit mode       |
| Escape      | Cancel text editing (discard changes) |
| Shift+Enter | Insert line break                     |

## Canvas Interaction

| Input                      | Action                          |
| -------------------------- | ------------------------------- |
| Middle mouse button + drag | Pan canvas                      |
| Space + left click + drag  | Pan canvas (Hand tool override) |
| Scroll wheel               | Zoom at cursor position         |
| Right-click                | Open context menu               |
