---
title: Pictures and SVG
order: 6
summary: Bring in photos and drawings, from files or the clipboard, adjust pictures' colors, and turn SVG artwork into shapes you can edit.
---

You can bring two kinds of artwork into a project. Pictures (PNG, JPEG, GIF,
WebP) come in as they are, to place, resize, adjust and animate. SVG files
come in as shapes, each one editable as if you'd drawn it. This chapter shows
both.

## Import a picture {#import-picture}

1. Choose **File › Import Image…**.
2. Choose a PNG, JPEG, GIF or WebP file, up to 10 MB.

The picture comes in at its own size, in the middle of the page, where the
rulers read 0, and selected. Its layer is named after the file. If you can't see
it, press [[Mod+0]] to fit the artwork in the window.

If it lands on an artboard, the picture [goes into it](artboards.md#layers).

### Drop or paste a picture {#drop}

- **Drop it:** drag a picture file from your computer onto the canvas. It comes
  in centered where you drop it, and goes into the
  [artboard](artboards.md#layers) you drop it on.
  Drop several, and only the first picture comes in.
- **Paste it:** copy a picture, in your browser or in another app, then press
  [[Mod+V]] in the editor. It's placed in the middle of the view, and called
  Pasted Image.

The same 10 MB limit applies.

A picture is kept inside the project: it's saved with it and travels in its
`.quar` backup. Nothing links back to the file on your computer, so changing or
deleting that file doesn't change the project.

## Resize and adjust a picture {#adjust}

Select a picture and drag its handles with the Selection tool, or type its
**Size** (**W** and **H**) in the Properties panel: with the lock between them
closed, the two keep in proportion. **Corner Radius** rounds its corners, all
four alike, or each on its own once you click its lock (see
[Round corners](shapes.md#shape-settings)).

A picture has no fill or stroke. Instead, the Properties panel has its
**Adjustments**:

![A picture on an artboard, selected, and its Adjustments in Properties, numbered](img/pictures-adjust.png 'A picture with its saturation and temperature raised.')

1. **An adjustment.** Drag its slider, or type a value in the field beside it.
   **Brightness**, **Exposure**, **Contrast**, **Saturation** and
   **Temperature** go from −100 to 100, **Hue** from −180° to 180°. Each is 0
   to begin with, leaving the picture as it is.
2. **Its reset arrow**, which appears when you point at a changed adjustment:
   click it to put that one back to 0.
3. **Reset** puts every adjustment back. It's there once one has changed.

The adjustments change how the picture is drawn, not the picture itself: reset
them and it's as it was.

A picture also has the **Effects** (shadows and blur) and the **Blend Mode**
any layer has: see [Masks, blending and effects](masks-and-effects.md#blend).

### Pull a picture's corners {#corners}

With Direct Selection ([[A]]), click a picture: its four corners appear as
points. Drag one to pull the picture out of shape, to set it on a slant, say.

![A picture whose top right corner has been pulled up and out with Direct Selection](img/pictures-corners.png 'A picture with one corner pulled out (1).')

To bend a picture along its length, as an arm bends at the elbow, bind it to
bones: see [Bind shapes and pictures](rigging-bones.md#bind).

### Replace a picture {#replace}

There's no command to swap a picture for another. Import the new one, put it
where the old one is (its **Position** and **Size** fields help), and delete the
old one.

## Import SVG {#svg}

SVG is the format drawing apps such as Figma, Illustrator and Inkscape export
vector artwork in. Brought into Quar Animator, an SVG's artwork becomes shapes:
you can select, recolor, reshape and animate each one.

1. Choose **File › Import SVG…** ([[Mod+I]]).
2. Choose an `.svg` file.

The artwork comes in at its own size, in the middle of the page, and selected.
If that's on an artboard, it [goes into it](artboards.md#layers).
A message says how many elements came in. If the SVG has several shapes at its top
level, they're put in a group called Imported SVG.

You can also drop an `.svg` file on the canvas (it comes in where you drop it,
and goes into the artboard there), or paste SVG code with [[Mod+V]]. From
Figma, right-click the artwork and choose **Copy/Paste as › Copy as SVG** first:
Figma's own copies can't be pasted.

![The Layers panel listing an imported SVG's group and its three shapes, named as in the SVG, beside the artwork](img/pictures-svg.png 'An imported SVG: its group (1) and the shapes in it keep the names they had.')

### What comes in {#svg-support}

| In the SVG                           | In Quar Animator |
| ------------------------------------ | ---------------- |
| Rectangles, rounded or not           | Rectangles       |
| Circles and ellipses                 | Ellipses         |
| Paths, lines, polylines and polygons | Paths            |
| Groups                               | Groups           |

Each layer is named after the element's `id`, where it has one. With the shapes
come:

- their fills and strokes: colors, opacity, stroke widths, line ends and
  corners, and dashes;
- linear and radial gradients, with their focal points;
- the even-odd fill rule, for shapes with holes;
- moves, turns, scales and slants, so everything lands where it was drawn;
- styles written in the shapes, as attributes, or in the SVG's style sheet.

Elements hidden with `display: none` or `visibility: hidden` are left out
(though, as in a browser, a layer inside a hidden group that sets
`visibility: visible` comes in), and so are some kinds of artwork:

- text: turn it into outlines in your drawing app before you export;
- embedded pictures;
- clipping paths and masks, filters (blurs, shadows), and copies made with
  `<use>`.

> [!TIP]
> If a drawing relies on what doesn't come in, export it as a PNG instead and
> import that as a picture.
