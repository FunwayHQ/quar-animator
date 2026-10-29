---
title: Select and arrange
order: 7
summary: Select layers, move, resize and turn them, line them up, group them and keep the Layers panel in order.
---

Everything you draw is a layer. This chapter shows how to pick layers, move
and resize them by hand or by number, line them up, group them, change which
is in front, and copy them — within a project or into another one. It ends
with moving around the canvas.

## Select layers {#select}

Press [[V]] for the Selection tool (the arrow at the start of the toolbar).
Then:

- **Click a layer** on the canvas to select it. A click picks the layer in
  front. A click on a layer in a group selects the whole group (see
  [Groups](#groups)). An artboard is selected by its label (see
  [Artboards](artboards.md#select)).
- **[[Shift]]+click** another layer to add it to the selection, or to take it out
  again. [[Mod]]+click does the same.
- **Drag across an empty part of the canvas** to draw a box: every layer the
  box touches is selected. Hold [[Shift]] as you drag to add them to what's
  already selected.
- **Select everything** on the page: **Edit › Select All**, or [[Mod+A]].
- **Select nothing:** click an empty part of the canvas, or press [[Esc]].

You can also select in the Layers panel: click a layer's row, [[Mod]]+click to
add or remove one, and [[Shift]]+click to select every row from the last one you
clicked to this one.

Hidden and locked layers can't be picked on the canvas, but you can still
select them in the Layers panel (see [The Layers panel](#layers)).

Double-click a path with the Selection tool to reshape its points (see
[Paths and the Pen](paths.md#direct-selection)), or text to edit its words
(see [Edit text](text.md#edit)).

## Move, resize and rotate {#transform}

To move layers, drag them. Dragging a layer that isn't selected selects it
and moves it in one go.

A selection has eight square handles around it:

![A selected rectangle with its eight handles, numbered: a corner handle, a side handle, and the place just outside a corner](img/selecting-and-arranging-handles.png 'Resize from a corner (1) or a side (2); rotate from just outside a corner (3).')

1. **Drag a corner handle** to resize in both directions.
2. **Drag a side handle** to resize in one direction.
3. **Rotate:** point just outside a corner, until the pointer becomes a curved
   arrow, and drag around.

While you drag a handle:

- Hold [[Shift]] to keep the proportions (when resizing) or to turn in steps
  of 15° (when rotating).
- Hold [[Alt]] to resize around the middle, so the opposite side moves too.

Press [[Esc]] before you let go to put things back as they were.

## Type exact values {#fields}

The **Transform** section of the Properties panel (scroll down past the
animation presets) holds the selected layer's **Position**, **Size** and
**Rotation**.

![The Transform section of the Properties panel: Position, Size, Corner Radius and Rotation, with the X label, the aspect lock and the grid button numbered](img/selecting-and-arranging-transform.png 'Drag a field’s letter to change it (1). The lock (2) keeps width and height in proportion; the grid button (3) turns snapping to the grid on and off.')

- **Position** is where the layer is: for a shape, **X** and **Y** are its
  top-left corner, and for a group or a symbol instance the top-left corner of
  what it draws. Y counts upward, as the ruler along the left does: a bigger
  Y is higher on the canvas.
- **Size** is its width (**W**) and height (**H**).
- **Rotation** is in degrees. Positive values turn it anticlockwise.

To change a value:

- Click in the field and type. Clicking selects the whole-number part, so
  typing replaces it; press [[Right]] or type a point to go on to the
  decimals. The layer changes as you type.
- Press [[Up]] or [[Down]] to add or take away 1, or 10 with [[Shift]]. Turning
  the mouse wheel over the field you're in does the same.
- Drag the letter in front of a field (1) left or right to scrub the value.

The lock between W and H (2) is **Lock aspect ratio**: while it's closed,
changing the width changes the height in proportion, and the other way round.

The diamond beside each name adds a keyframe: that's for animating (see
[The diamonds in Properties](keyframes.md#diamonds)). With
[Auto-keyframe](keyframes.md#auto-keyframe) on, moving, resizing and turning a
layer set keyframes too.

## Line things up {#align}

![The canvas with its rulers, a guide dragged out of the left ruler, and a pink line showing that the moving rectangle's top lines up with the other's](img/selecting-and-arranging-guides.png 'The rulers (1), a guide (2), and a smart guide (3) while a rectangle is dragged.')

**Smart guides.** As you drag layers, pink lines (3) appear when an edge or
the middle of what you're dragging lines up with another layer's, and it
snaps into line. They also show when the gaps between layers are equal.

**Rulers** (1) run along the top and left of the canvas. **View › Show
Rulers** ([[Shift+R]]) hides and shows them.

**Guides** (2) are lines of your own to line things up against:

1. Drag from a ruler onto the canvas: from the top ruler for a horizontal
   guide, from the left one for a vertical guide.
2. Let go where you want it. Drag it again to move it.
3. To remove it, drag it back onto the ruler, or click it and press
   [[Delete]]. **View › Clear All Guides** removes them all.

Layers you move snap to the guides. **View › Show Guides** ([[Shift+G]]) hides
and shows them. **View › Snap to Guides** turns snapping off and on, for your
guides and the smart guides alike; it's on to begin with.

**The grid.** **View › Snap to Grid**, or the grid button in the Transform
section, makes moved layers snap to the canvas grid, every 20 units.

### Nudge with the arrow keys {#nudge}

With layers selected, the arrow keys move them by 1
unit, or by 10 with [[Shift]]. While **Snap to Grid** is on, they move a whole
grid step.

## Flip {#flip}

To mirror the selection, choose **Edit › Flip Horizontal** ([[Shift+H]]) or
**Edit › Flip Vertical** ([[Shift+V]]), or pick them from the canvas's
right-click menu. Several layers flip together, around the middle of the
selection, so they stay where they are. Their keyframes are flipped with them.
Locked layers and bones aren't flipped.

## Groups {#groups}

A group holds layers together, so they move, resize, turn and animate as one.

- **Group:** select two or more layers and choose **Edit › Group**
  ([[Mod+G]]). They go into a new group, called Group, which is selected.
- **Ungroup:** select the group and choose **Edit › Ungroup**
  ([[Mod+Shift+G]]). Its layers stay where they are on the canvas.

To work on a layer inside a group, double-click the group on the canvas: clicks
now pick the layers in it. Press [[Esc]] to come back out, with the group
selected; clicking a layer outside the group also leaves it. In the Layers
panel you can click a layer in a group straight away.

Groups can hold groups. A group's opacity fades everything in it.

## What's in front {#order}

Layers higher up in the Layers panel are drawn in front of those below them.
To change the order, drag rows in the panel (see below), or use the Edit menu
or a right-click menu:

| Choose             | Shortcut                                                                                                                                 | To                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **Bring Forward**  | <kbd class="keys"><kbd data-key="mod">Ctrl</kbd><span class="plus">+</span><kbd>]</kbd></kbd>                                            | move it up one place        |
| **Bring to Front** | <kbd class="keys"><kbd data-key="mod">Ctrl</kbd><span class="plus">+</span><kbd>Shift</kbd><span class="plus">+</span><kbd>]</kbd></kbd> | put it in front of the rest |
| **Send Backward**  | <kbd class="keys"><kbd data-key="mod">Ctrl</kbd><span class="plus">+</span><kbd>[</kbd></kbd>                                            | move it down one place      |
| **Send to Back**   | <kbd class="keys"><kbd data-key="mod">Ctrl</kbd><span class="plus">+</span><kbd>Shift</kbd><span class="plus">+</span><kbd>[</kbd></kbd> | put it behind the rest      |

A layer moves among the layers beside it: within its group, or its artboard.

## The Layers panel {#layers}

The Layers panel lists everything on the page, the layer in front first. Each
row has an icon for its kind of layer. The layers in a group or an artboard are
listed under it, indented; click the arrow before its name to fold them away or
show them again.

![The Layers panel with an artboard, a group in it and the group's layers; the group is selected and pointed at, showing its eye and lock](img/selecting-and-arranging-layers.png 'Point at a row to see its eye (1) and lock (2).')

- **Hide or show** a layer: point at its row and click the eye (1). A hidden
  layer isn't drawn on the canvas.
- **Lock or unlock** it: click the lock (2). A locked layer stays put: it
  can't be selected, moved or [erased](brush-and-eraser.md#eraser) on the
  canvas, and clicks go through it to what's behind.
- **Rename** it: double-click its row, type the name and press [[Enter]].
  [[Esc]] keeps the old name.
- **Reorder:** drag a row up or down and let go between two rows.
- **Put a layer in a group or an artboard:** drag its row onto the middle of
  the group's or artboard's row. To take it out, drag it between rows outside
  the group. The layer stays where it is on the canvas, and so does its
  animation.

Right-click a row for its menu: **Rename**, **Duplicate**, **Delete**,
**Group**, **Ungroup**, the stacking order, **Hide** or **Show**, and
**Lock** or **Unlock**. With several layers selected, the menu works on all of
them (**Delete 3 Layers**, **Group 3 Layers**…) and also makes masks: see
[Masks, blending and effects](masks-and-effects.md#masks).

## Copy, paste and duplicate {#clipboard}

- **Copy:** [[Mod+C]], or **Edit › Copy**. **Cut** ([[Mod+X]]) copies and
  removes.
- **Paste:** [[Mod+V]], or **Edit › Paste**. The copy lands 20 units to the
  right of and below the original, selected, in the same group or artboard if
  it's still there.
- **Duplicate:** [[Mod+D]], or **Edit › Duplicate**: copy and paste in one.

Copies keep their animation and their rigging, and the
[symbols](symbols.md) they use come with them.

**Between windows and browsers.** Copied layers go onto your computer's
clipboard, so you can paste them into Quar Animator in another tab, another
window, or another browser on the same computer. Their keyframes come too,
retimed if the other project plays at a different frame rate.

To paste there, press [[Mod+V]] or choose **Edit › Paste**. The menu reads
the clipboard through the browser, which may ask you to allow that. If the
browser doesn't let it, a message says so: press [[Mod+V]] instead.

**Delete:** press [[Delete]] or [[Backspace]], or choose **Edit › Delete**.

## Move around the canvas {#view}

- **Pan:** hold [[Space]] and drag, drag with the middle mouse button, or use
  the Hand tool ([[H]]) and drag. Scrolling sideways (or with [[Shift]] held)
  pans left and right.
- **Zoom:** scroll to zoom in and out around the pointer. The bar along the
  bottom of the canvas shows the zoom, from 10% to 3200%, and where the pointer
  is.

| Choose                   | Shortcut  | To                               |
| ------------------------ | --------- | -------------------------------- |
| **View › Zoom In**       | [[Mod+=]] | zoom in                          |
| **View › Zoom Out**      | [[Mod+-]] | zoom out                         |
| **View › Zoom to 100%**  | [[Mod+1]] | show the artwork at its own size |
| **View › Fit to Window** | [[Mod+0]] | fit all the artwork in view      |

These zoom shortcuts work wherever you are in the editor, except while you're
typing in a field.
