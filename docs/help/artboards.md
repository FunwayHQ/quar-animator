---
title: Artboards
order: 8
summary: Frames on the page for scenes, screens and slides — draw them, size them, fill them with layers, and give each its own timeline.
---

An artboard is a frame on the page: a size of its own, a background, the
layers inside it, and a timeline of its own. Use one for each scene, screen or
slide. The tutorials put each lesson on an artboard.

## Draw an artboard {#draw}

1. Press [[F]] for the Artboard tool (or click it in the toolbar, after Text).
2. Drag on the canvas. Hold [[Shift]] for a square, [[Alt]] to draw out from
   the middle; [[Esc]] before you let go gives up.
3. Let go. The artboard, called Artboard and white, is selected, and the editor
   is back on the Selection tool.

Layers you drew the artboard around go into it: every visible layer on the
page that lies wholly inside it. Layers only partly inside, layers in groups and
other artboards stay where they are.

![An artboard drawn around a circle, its name and size above its top-left corner, and the circle listed inside it in the Layers panel](img/artboards-draw.png 'The artboard’s label (1); the circle it was drawn around is now in it (2).')

## Select and size it {#select}

An artboard is selected by its **label**, its name and size above its
top-left corner (1): click the label, or click the artboard's row in the
Layers panel. Clicking inside the artboard picks the layers in it, not the
artboard, so you can work on them without moving the frame.

- **Move it:** drag its label. Its layers move with it.
- **Resize it:** drag its handles, or type its **Position** and **Size** in
  the Properties panel's Transform section. Unlike a shape, it doesn't turn
  when you drag outside a corner.
- **Rename it:** double-click its row in the Layers panel. The label shows the
  new name.
- **Change its background:** its **Fill**, under Appearance in the Properties
  panel, is the artboard's background color.

## Clip what's in it {#clip}

With **Clip Content** on (under **Artboard** in the Properties panel), the
parts of its layers that reach past its edges are hidden. It's on for a new
artboard; turn it off to see them.

![Two artboards, each with a circle over its right edge: the first hides the part outside, the second shows it; its Clip Content box is unticked in Properties](img/artboards-clip.png 'Intro (1) clips its content; Ending (2) doesn’t, with Clip Content (3) off.')

## Put layers in an artboard {#layers}

A layer goes into an artboard when:

- you draw it on the artboard;
- you move it onto the artboard with the Selection tool, so that its middle is
  over it. Move it off again and it goes back to the page;
- you paste it, drop a file or import a picture onto the artboard;
- you drag its row onto the artboard's row in the Layers panel.

Either way, it stays where it is on the canvas and keeps its animation. Layers
in a group stay in their group when you move them.

## Each artboard has its own timeline {#timelines}

The animation of the layers in an artboard belongs to that artboard: its own
keyframes, its own length (the **Frames** field) and its own
[sounds](sound.md). Layers outside every artboard share the page's timeline.
The frame rate (**FPS**) is the same for the whole project. (More in
[Each artboard's timeline](keyframes.md#artboards).)

The timeline shows one of them at a time. Selecting a layer brings up its
artboard's timeline, and the picker at the top of the timeline's layer list (1)
chooses one: each artboard by name, or **Page (outside artboards)**.

![The timeline's picker set to the Intro artboard, with Intro and its circle listed below it](img/artboards-timeline.png 'The picker (1): Intro’s timeline is in view.')

Playing plays the timeline in view.

## Artboards as slides {#slides}

The artboards at the top of a page also play one after another, as slides:

- When the page has an artboard that isn't hidden, a play button at the end of
  the toolbar presents them full screen, in the order the Layers panel lists
  them (see [Present](presenting.md#present)).
- With no artboard selected, video, GIF and PNG-sequence exports of a page
  with two or more artboards play every one as a slide, each for its own
  timeline (see [What's exported](exporting.md#scope)).

The **Slide** section of an artboard's properties sets the transition that
brings it on after the slide before it (see
[Transitions](presenting.md#transitions)).
