---
title: Shape tweening
order: 13
summary: Morph a path from one shape into another by keying its Shape, and keep the morph as you edit its points.
---

A shape tween turns one outline into another: a star into a blob, a closed
eye into an open one, a drop into a splash. You key a path's **Shape** at two
frames or more, change the outline between them, and the editor works out
every frame in between. This chapter shows you how, and how the morph copes
with added points, holes and converted shapes.

Shape tweens are for paths: what you draw with the [Pen](paths.md#pen) or the
[Brush](brush-and-eraser.md#brush), and shapes you've
[made into paths](paths.md#convert). A rectangle, an ellipse, a polygon or a
star animates its size, [corner radius and the like](shapes.md#shape-settings)
instead (see [Keyframes and the timeline](keyframes.md)), until you convert
it.

## Morph a path {#morph}

1. Select the path. (To morph a rectangle, an ellipse, a polygon or a star,
   choose **Edit › Convert to Path** ([[Mod+Shift+P]]) first.)
2. Press [[Home]] to go to frame 0.
3. In the Properties panel, click the diamond beside **Shape**, under
   **Transform**. It fills in: the whole outline is keyed at this frame. The
   row shows how many points the path has.
4. Go to a later frame: press [[Shift+.]], or click the ruler.
5. Press [[A]] for Direct Selection and drag the path's points and handles
   into the new outline (see
   [Reshape a path with Direct Selection](paths.md#direct-selection)). As soon
   as you change it, the outline is keyed at this frame too.
6. Press [[Space]] to watch it morph.

![A star path with its points shown by Direct Selection, one point dragged up at frame 20; the Shape row in Properties and the keyframes on the timeline numbered](img/shape-tweening-edit.png 'Editing a point at frame 20 keys the Shape there. The numbers match the list below.')

1. The point dragged up at frame 20.
2. **Shape** in the Properties panel, its diamond filled: there's a Shape
   keyframe at this frame.
3. The path's Shape keyframes at frames 0 and 20 on the timeline.

Add more keyframes the same way, and change their easing and timing on the
timeline as for any other keyframes (see
[Easing and the graph editor](easing.md)).

> [!TIP]
> Turn on [onion skin](keyframes.md#onion-skin) ([[Shift+O]]) to see the outlines of the frames around
> the playhead while you shape the in-betweens.

![Onion skin showing a star's top point swinging to the right over the frames around the playhead](img/shape-tweening-morph.png 'The morph, frame by frame, with onion skin on: the frames before in red, after in teal.')

## Edit a path whose Shape is keyed {#editing}

Once a path's **Shape** has keyframes, editing its outline on the canvas with
Direct Selection keys the whole Shape at the playhead: dragging points or
handles, bending a segment, nudging points with the arrow keys, changing a
point from corner to smooth. On a frame that already has a Shape keyframe,
that keyframe takes the new outline.

> [!CAUTION]
> Typing a point's position into **X** and **Y** under **Vertex** in the
> Properties panel doesn't key the Shape, so the point goes back when you
> move to another frame. Drag the point on the canvas instead.

Changing the number of points works too. When you add a point to the path or
delete one (with the [Pen](paths.md#pen-points) or Direct Selection), it's
added to or taken from every Shape keyframe, so the keyframes keep matching
and the morph keeps its shape. **Edit › Open Path** and **Edit › Close Path**
(see [Path commands](paths.md#path-commands)) open or close the path in every
Shape keyframe.

> [!NOTE]
> **Edit › Simplify Path** leaves a path alone while its points are animated:
> it would change the points the keyframes hold.

## Shapes with different points {#matching}

The two outlines of a tween don't need the same number of points, or points
in the same places. The editor matches them up as it morphs:

- Between outlines with different numbers of points, it adds points where
  they're needed, so one turns smoothly into the other.
- Closed outlines that run opposite ways round still morph straight into each
  other, rather than turning inside out.
- An open path stays open all through the tween, and a closed one closed.

### Holes {#holes}

A path can have holes: the middle of a letter O
[made into a path](text.md#convert), for instance. A Shape keyframe holds the holes along with the outline, and they
morph with it. A hole that only one of the two keyframes has grows from its
middle, or shrinks away to it, over the tween.

## Convert animated shapes {#convert}

A rectangle, an ellipse, a polygon or a star can be converted to a path with
its animation:

1. Select the animated shape.
2. Choose **Edit › Convert to Path** ([[Mod+Shift+P]]; see
   [Convert shapes, strokes and text](paths.md#convert)).

The shape becomes a path in the same place, with the same name and the rest
of its animation. Its size keyframes — width and height, radius, corner
radius, the number of sides — become **Shape** keyframes: at each of their
frames, the outline the shape had there. The path morphs from one of those
outlines to the next, and from then on you can edit them like any path's.

![Onion skin showing a converted rounded rectangle growing wider over the frames after the playhead](img/shape-tweening-converted.png 'A rounded rectangle whose width was animated, converted to a path: its width keyframes are Shape keyframes now.')
