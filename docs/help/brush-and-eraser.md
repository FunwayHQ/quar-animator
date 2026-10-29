---
title: Brush and Eraser
order: 4
summary: Paint freehand strokes with the Brush, shape how wide they are, and rub out parts of shapes with the Eraser.
---

The Brush paints the way a pen does on paper: drag, and a stroke follows the
pointer. The Eraser rubs out what you drag it across. Both work with a mouse,
and the Brush makes the most of a pen tablet. This chapter shows how to use
them, and how to change a brush stroke once it's painted.

## Paint with the Brush {#brush}

1. Press [[B]] for the Brush, or click it in the toolbar.
2. Drag on the canvas. The stroke follows the pointer, smoothed as you go, so
   a shaky hand still draws a flowing line.
3. Let go. The stroke is a new layer called Brush Stroke, selected, and the
   editor is back on the Selection tool ([[V]]).

Press [[Esc]] before you let go to throw the stroke away.

With a pen on a tablet, or a screen that feels how hard you press, the stroke
is wider where you press harder and thinner where you press lightly. With a
mouse it's even all along. You can make it wider or thinner afterwards too
(see [Change a stroke's width](#brush-width)).

### The Brush's settings {#brush-settings}

While the Brush is chosen, the top of the Properties panel has a **Brush**
section, whatever is selected:

- **Size**, from 1 to 100: how wide the stroke is where a pen presses
  hardest. A mouse paints about half as wide. It starts at 5.
- **Smoothing**, from 0 to 100: how much a shaky hand is smoothed. At 0 the
  stroke follows the pointer exactly. It starts at 50.

Drag a slider or type a number. The line above them is a sample stroke that
changes as you do, to give you the feel of the settings. They're for the
strokes you paint next; strokes already painted keep theirs.

A brush stroke is a filled shape, not a line: its color is its **Fill** in the
Properties panel, cornflower blue to begin with, and it has no stroke. Color it
as you would any shape (see [Fill and stroke](shapes.md#fill-and-stroke)).

## Change a stroke's width {#brush-width}

Select a brush stroke and the Properties panel has a **Brush Stroke** section.

![A brush stroke that thins to a point at both ends, selected, and its Width and Profile in Properties, numbered](img/brush-stroke.png 'A brush stroke, its width set and tapering at both ends.')

1. **Width** sets how wide the stroke is, from 1 up. Setting it makes the
   stroke the same width all along, in place of the widths your pen pressure
   gave it.
2. **Profile** sets how the width changes from one end of the stroke to the
   other:
   - **Uniform**: the same all along.
   - **Taper Out**: thinning to a point at the end.
   - **Taper In**: starting from a point.
   - **Taper Both**: a point at both ends.
   - **Bulge**: widest in the middle.
   - **Calligraphic**: swelling early and thinning out, like a broad pen.

The stroke keeps the line you painted, and **Width** and **Profile** redraw its
outline along it.

> [!CAUTION]
> A brush stroke is a path, so Direct Selection can move its outline's points
> (see [Paths and the Pen](paths.md#direct-selection)). But changing **Width**
> or **Profile** afterwards redraws the outline from the line you painted, and
> those point edits are lost. Settle its width first.

### Make a profile from a shape {#brush-profile}

You can draw a profile of your own:

1. Draw a shape whose thickness, from one end to the other, is how you want a
   stroke's width to change: a long thin diamond, say. A rectangle, an
   ellipse, a polygon or a path will do.
2. Right-click it and choose **Create Profile from Selection**.
3. Type a name for the profile and click **Create**.

The new profile is at the end of the **Profile** list of every brush stroke.
It's measured along the shape's longer side.

Profiles you make are saved with the project and belong to it: another
project has its own. A stroke pasted into a project that doesn't have its
profile keeps its shape, but changing its **Width** or **Profile** there
makes it **Uniform**.

## Rub out with the Eraser {#eraser}

1. Press [[E]] for the Eraser, or click it in the toolbar.
2. Drag across a shape. A red trail shows what will be rubbed out.
3. Let go. The trail is cut out of every shape it crosses.

![The Eraser being dragged across a circle, its red trail over it](img/brush-eraser-trail.png 'While you drag, the red trail shows what will go.')

![The circle cut in two where the Eraser went](img/brush-erased.png 'When you let go, the trail is cut out of the shape.')

- A click without dragging rubs out a round spot.
- The Eraser stays chosen, so you can go on rubbing out. Undo ([[Mod+Z]])
  brings back what one drag took away.
- It cuts rectangles, ellipses, polygons, stars, closed paths and brush
  strokes. It leaves text, pictures, open paths, and hidden or locked layers
  alone.
- A shape it cuts becomes a path, in the same place in the Layers panel and
  with the same name, fill and stroke, even when it's cut in pieces, as the
  circle above is. A shape rubbed out entirely is deleted.

The Eraser is the same size on the screen whatever the zoom: zoom in to rub out
fine details, out for broad strokes. A ring round the pointer shows how far it
reaches. To make it bigger or smaller, press
<kbd class="keys"><kbd>]</kbd></kbd> or <kbd class="keys"><kbd>[</kbd></kbd>.
Each press changes its size by 5, from 1 to 100. It starts at 10, which rubs
out a trail 20 pixels wide.

### The Eraser's settings {#eraser-settings}

While the Eraser is chosen, the top of the Properties panel has an
**Eraser** section:

- **Mode:**
  - **Cut shapes**, the usual one, cuts the trail out of every shape it
    crosses, as above.
  - **Delete points** deletes the points of the paths it touches instead. A
    closed path it takes points from is left open, and one left with fewer
    than two points is deleted. It works on paths and brush strokes only,
    and leaves rectangles, ellipses, polygons and stars alone. The keyframes
    of the points it deletes go; the other points keep theirs.
- **Size:** the size <kbd class="keys"><kbd>[</kbd></kbd> and <kbd class="keys"><kbd>]</kbd></kbd> change, as a slider and a number.

A shape the Eraser cuts stays the same layer, with its name, its
[effects](masks-and-effects.md#effects), its colors and its animation; a brush
stroke keeps its **Width** and **Profile**. Cut in two, it becomes two layers
side by side, the bigger part keeping the name and the other named after it
(`Leaf 2`), both with the same animation.

> [!NOTE]
> Keyframes that shaped the old outline — its **Shape**, its points, a
> rectangle's size or corner radius — go: the outline they describe isn't there
> any more. Keyframes of its position, rotation, opacity and colors stay.
