---
title: Draw shapes
order: 2
summary: Draw rectangles, ellipses, polygons and stars, and give them fills, gradients and outlines.
---

Rectangles, ellipses, polygons and stars are the quickest way to build a
picture, and they stay easy to change: their corners, sides and points are
settings you can type or animate. This chapter shows how to draw them, how to
color them with fills, gradients and strokes, and how to set the color behind
everything.

## The shape tools {#tools}

The four shape tools are in the toolbar at the top of the editor.

![The Rectangle, Ellipse, Polygon and Star tools in the toolbar, numbered, above a shape drawn with each](img/shapes-tools.png 'The shape tools, and what each one draws.')

1. **Rectangle** ([[R]]): rectangles and squares.
2. **Ellipse** ([[O]]): ellipses and circles.
3. **Polygon** ([[U]]): shapes with equal sides, five to begin with.
4. **Star** ([[S]]): stars, five points to begin with.

## Draw a shape {#draw}

1. Press the tool's key, or click it in the toolbar.
2. Drag on the canvas, from one corner of the shape to the opposite one.
3. Let go. The shape is drawn and selected, and the editor is back on the
   Selection tool ([[V]]), ready to move it (see
   [Move, resize and rotate](selecting-and-arranging.md#transform)).

While you drag, you can hold:

- [[Shift]] to draw a square with the Rectangle tool, or a circle with the
  Ellipse tool.
- [[Alt]] to draw from the middle: where you started dragging is the shape's
  center.

Press [[Esc]] before you let go to draw nothing.

A polygon or a star always has equal sides, with a corner at the top. It fits
inside the box you drag, as big as the box's shorter side allows. With [[Alt]], start at its
center and drag outwards: how far you drag is the distance from its center to
its corners.

A shape you draw on an artboard [goes into that artboard](artboards.md#layers).

Every new shape is filled cornflower blue (`#6495ED`) and outlined with a stroke
2 pixels wide. The stroke is black, or near white, whichever stands out against
what's behind the shape: near white on the dark canvas, black on a white
artboard.

## Round corners, sides and points {#shape-settings}

Select a shape and its own settings are in the Properties panel, under
**Transform**, along with its position, size and rotation.

**Rectangles** have a **Corner Radius**: the higher it is, the rounder the
corners. To round each corner by its own amount, click the lock beside the
field: four fields take its place, **TL**, **TR**, **BL** and **BR** (top left,
top right, bottom left, bottom right). Click the lock again to set all four
with one value.

**Polygons and stars** have three settings:

![A six-pointed star with rounded corners, selected, and its settings in Properties, numbered](img/shapes-star-settings.png 'A star with six points and rounded corners.')

1. **Corner Radius** rounds every corner.
2. **Sides** is how many sides a polygon has, or how many points a star has:
   from 3 to 64.
3. **Inner Radius** is how far a star's inner corners are from its center. The
   higher it is, the fatter the star; it can't be more than the star's outer
   radius. A polygon has an **Inner Radius** too: make it smaller and its sides
   fold in, turning it into a star.

> [!TIP]
> To change a number, type it and press [[Enter]], press [[Up]] or [[Down]] in
> the field (with [[Shift]], by 10), or drag the field's short label (**CR**,
> **N**, **IR**) left or right. More in
> [Type exact values](selecting-and-arranging.md#fields).

The diamond beside a setting's name is for animating it: it puts a keyframe at
the current frame (see [The diamonds in Properties](keyframes.md#diamonds)).

## Fill and stroke {#fill-and-stroke}

A shape's colors are under **Appearance** in the Properties panel. The fill
paints the inside of the shape; the stroke is its outline.

![The Appearance section of a selected rectangle, its parts numbered](img/shapes-appearance.png 'Fill, stroke and opacity in the Properties panel.')

1. **The fill.** From left to right: the eye shows or hides it, the diamond
   [animates its color](keyframes.md#diamonds), the swatch opens the color picker (see
   [Pick a color](#color-picker)), then its color as a hex code you can type
   over, and its opacity. Point at the row to see the **×** that removes it.
2. **Solid**, **Linear**, **Radial** and **Conic**: one color, or a gradient
   (see [Gradients](#gradients)).
3. **Add Fill** adds another fill. A shape can have several: each one is
   painted over the fills listed before it, so a half-transparent gradient over
   a solid color tints it, say.
4. **The stroke**, with the same parts as a fill.
5. **The stroke's width** (**W**, from 0.5 to 100) and where it lies along the
   shape's edge: **I** inside it, **C** centered on it, **O** outside it.
   **Add Stroke** adds another stroke.
6. **Opacity**: how see-through the whole shape is, fill and stroke together.

If you [select several shapes](selecting-and-arranging.md#select), a change to a fill or a stroke is made to all of
them.

## Pick a color {#color-picker}

Click a fill's or a stroke's swatch to open the color picker. The shape changes
as you pick.

![The color picker open beside the fill's swatch, its parts numbered](img/shapes-color-picker.png 'The color picker.')

1. **The square**: drag in it to choose how pale or deep, and how light or dark,
   the color is.
2. **The hue strip**: drag along it to choose the color itself.
3. **The opacity strip**: drag it to the left to make the color see-through.
   The two swatches beside the strips show the new color above the one you
   started with.
4. **The fields**: the color's hex code, its red, green and blue (0 to 255),
   and **A**, its opacity (0 to 100). Type a value to set it exactly.
5. **HSL** shows hue, saturation and lightness instead of red, green and blue;
   click **RGB** to go back.

To close the picker, press [[Esc]] or click outside it.

## Gradients {#gradients}

A gradient blends from one color into another. A fill or a stroke can be one of
three kinds:

- **Linear**: the colors change along a straight line.
- **Radial**: they spread out from a center in rings.
- **Conic**: they turn around the center, like the hands of a clock.

To make one:

1. Select the shape.
2. In the fill's row, click **Linear**, **Radial** or **Conic**. (For the
   stroke, use the stroke's row.)
3. To place a linear or radial gradient on the shape, click its kind again:
   handles appear on the canvas.

![A rectangle with a radial gradient, its handles on the canvas, and the gradient's stops in Properties, numbered](img/shapes-gradient.png 'A radial gradient, pulled off center by its focal point.')

On the canvas, a radial gradient has:

1. **The center**: drag it to move the gradient.
2. **The edge**: drag it to make the gradient bigger or smaller.
3. **The focal point**, where the first color sits. A radial gradient has none
   until you hold [[Shift]] and drag out of the center: it pulls the middle of
   the rings to one side, like light falling on a ball. Drag the focal point
   back onto the center to remove it.

A linear gradient has a handle at each end of its line: drag them to set where
it starts and ends, and so its angle. A conic gradient has no handles: set its
**Angle** in the Properties panel, as you can for a linear one. Press [[Esc]] to
hide the handles.

The bar in the Properties panel shows the gradient's colors, with a stop under
it for each:

4. **A stop.** Click a stop to choose it, and drag it along the bar to move
   its color. Click the bar to add a stop there, in the color the gradient has
   at that point.
5. **The chosen stop's color**: click it to open the color picker. The **×**
   beside it removes the stop. You can also double-click a stop to remove it,
   or right-click it and choose **Delete Stop**. A gradient keeps at least two
   stops.
6. **Pos %**: where along the gradient the chosen stop is, from 0 to 100.

## The background {#background}

The color behind your artwork belongs to the document. To change it:

1. Click an empty part of the canvas, so nothing is selected. The Properties
   panel shows **Document**.
2. Click the **Background** swatch and pick a color, or type a hex code in the
   field beside it.

It's saved with the project. The canvas shows it behind everything, the
project's picture on the Projects page has it, and so do the pictures and
videos you make from the **Export** menu, unless you choose a transparent
background when you export (see [What's exported](exporting.md#scope)). An artboard has
[its own fill](artboards.md#select) on top of it.

The background is dark (`#1A1A1A`) in a new project. It doesn't change with the
editor's light or dark appearance.
