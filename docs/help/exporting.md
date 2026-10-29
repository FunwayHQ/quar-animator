---
title: Exporting
order: 19
summary: Make a GIF, a video, a Lottie file, a picture sequence, a sprite sheet, an SVG or a PDF of your animation, or pictures of the layers you select.
---

When the animation is ready, export it in the format where it's going: a GIF
for a chat or a README, an MP4 or WebM video, Lottie for the web and apps,
pictures for a game engine, a PDF to print or send. Everything is made in your
browser, on your computer: nothing is uploaded. The files go to your
browser's downloads.

## Export the animation {#export}

1. Open the **Export** menu and choose a format: **Export as PNG Sequence…**,
   **Export as GIF…**, **Export as MP4…**, **Export as WebM…**,
   **Export as Lottie JSON…**, **Export as Sprite Sheet…**,
   **Export as SVG…** or **Export as PDF…**.
2. The Export Animation dialog opens at that format's tab. To change your
   mind, click another tab.
3. Set the options, then click **Export**.

![The Export menu, open in the editor](img/exporting-menu.png 'The Export menu: a format on each line.')

While it works, a bar shows how far it has got. **Cancel** (or [[Esc]])
stops it. When it's done, the dialog closes and the file is in your
downloads.

![The Export Animation dialog at its GIF tab, its parts numbered](img/exporting-dialog.png 'The Export Animation dialog. The numbers match the list below.')

1. **The tabs**, a format each.
2. **Size**: the width and height in pixels, up to 8192 each. It starts at
   the size of what's exported. (Not for SVG or PDF, which keep the
   artwork's own size.)
3. **What's exported**, in a line under the size: see
   [What's exported](#scope).
4. **Frame Range**: the first and the last frame, the whole timeline to
   start with.
5. Then the format's own settings: here, the GIF's frame rate and speed…
6. …and its compression.

Exporting changes nothing in the project. The rig is posed as on the canvas
(IK, physics and Smart Bones), but bones are never drawn.

To close the dialog without exporting, click **Cancel** or the **×**, or
press [[Esc]].

## What's exported {#scope}

The line under **Size** says what the export is of:

- **An artboard.** Select one artboard, and only it and its contents are
  exported, playing the artboard's [own timeline](artboards.md#timelines). On a page with a single
  artboard, that one is exported even with nothing selected. To export the
  whole page instead, select everything first ([[Mod+A]]).
- **Every artboard, one after another.** With no artboard selected, on a page
  with two or more, MP4, WebM, GIF and PNG Sequence play them as slides: each
  over its own timeline, in the Layers panel's order (the topmost first),
  with the transitions between them. The line says how many slides there are
  and how long they play. A PDF has a page for each. See
  [Slides and presenting](presenting.md).
- **The whole page.** Otherwise, everything on the page, framed to fit all of
  its animation, wherever things move to.

![The MP4 tab of the Export dialog, its note saying three slides will play one after another](img/exporting-slides.png 'A page of three artboards, exported as slides.')

A slides export plays every slide from start to end, so it has no
**Frame Range**. It's the size of the first slide to start with; slides of
other proportions are fitted into it, centred, not stretched. Hidden
artboards are left out.

Formats without transparency, and those with **Transparent** off, show the
document's background color behind the artwork. To change it, select
nothing and set **Background** under **Document** in the Properties panel
(see [The background](shapes.md#background)).

## Videos in exports {#video-layers}

How a [video or GIF clip](video-clips.md) comes out depends on the format:

| Format                          | The video                                                    |
| ------------------------------- | ------------------------------------------------------------ |
| MP4 and WebM                    | plays, each frame exactly, its sound with it (see **Sound**) |
| GIF, PNG Sequence, Sprite Sheet | plays, each frame exactly                                    |
| Lottie JSON                     | a still: the clip's first picture in the frames you export   |
| SVG                             | a still of the frame you export                              |
| PDF                             | a still of the frame each page shows                         |

For Lottie, SVG and PDF, the dialog warns you: "1 video layer will show as a
still picture" (or 2, and so on).

A transparent video stays see-through in a sprite sheet, and in a WebM, a GIF
or a PNG sequence with **Transparent** ticked (in a GIF, each pixel either
shows or doesn't). An MP4 draws it over the background.

If the browser can't read a video while it exports (say, the project was
made in a browser that plays it and you export in one that doesn't), the
export uses the small pictures of it made when it was imported. The file is
still made, and the dialog stays open to say which video it was:
"Exported. Couldn't decode “sunrise”; its preview stills were used."
Click **Close** to close it.

## GIF {#gif}

GIFs play everywhere and loop forever.

- **Background**: tick **Transparent** for a GIF with nothing behind the
  artwork.
- **Frame rate**: frames a second, up to 50, the most a GIF can play. The
  project's own rate (its [**FPS**](keyframes.md#frames-and-fps)) is marked
  "(project)".
- **Speed**: from 0.25× (slower) to 4× (faster). The line under it says how
  many frames the GIF has and how long it plays.
- **Compression**: from 0% to 100%. At 0% the GIF has 256 colors and stores
  only the pixels that change from one frame to the next, without losing
  anything. Higher, it has fewer colors (16 at 100%) and skips slight color
  changes between frames: a smaller file, at a lower quality. The line under
  the slider says what the setting does.

The file is `animation.gif`.

## MP4 and WebM {#video}

Videos for sharing, for video editors and for the web.

- **MP4** uses H.264, and always has a solid background. Its width and height
  must be even numbers; with an odd one, the dialog says so.
- **WebM** uses VP9 (or VP8, where VP9 isn't available). Tick **Transparent**
  to keep the parts with nothing drawn see-through: Chrome, Edge and Firefox
  show a transparent WebM.
- **Sound**: when the timeline has [sound clips](sound.md), this box (**With
  its 2 sound clips**, say) puts them in the video, as they play in the
  editor. A video layer's sound is one of them. A slides
  export plays each slide's sounds with it. Clear it for a silent video.
- **Frame rate** and **Speed** work as for a GIF, with rates up to 60 frames
  a second (and the project's own).

The files are `animation.mp4` and `animation.webm`.

> [!NOTE]
> Videos are made by your browser's own video encoder, and not every browser
> or device has one for each format. If it hasn't, the dialog says so when
> you click **Export**: try another browser, such as a recent Chrome or Edge.

## PNG Sequence {#png-sequence}

A picture of every frame, in one `.zip` file: `png-sequence.zip`.

- **Multiplier**: 1x to 4x, the size of the pictures (at 2x, twice the width
  and twice the height).
- **Background**: tick **Transparent** for pictures with nothing behind the
  artwork.
- **Pattern**: how the files are named. `{N}` is the frame's number, with
  zeros in front so the names sort in order: for frames 0 to 149,
  `frame_{N}` gives `frame_000.png`, `frame_001.png` and so on.

## Sprite Sheet {#sprite-sheet}

Every frame in one picture, for game engines: `spritesheet.png`.

- **Layout**: **Grid** puts the frames in rows; **Columns** sets how many to
  a row (0 chooses for you). **Packed** fits them in as tightly as it can, up
  to 4096 × 4096 pixels.
- **Padding**: pixels of space between the frames.
- **Power of Two**: makes the sheet's width and height powers of two (256,
  512, 1024…), as some engines want.
- **Include JSON**: downloads `spritesheet.json` too, which says where each
  frame is in the sheet.

## Lottie JSON {#lottie}

Lottie is vector animation for websites and apps: small files that play
sharp at any size. The file is `animation.json`.

The dialog counts the layers Lottie gets, and warns about what it can't take:

- layers of a kind it doesn't take, which are left out;
- [effects](masks-and-effects.md#effects) (shadows and blurs), which are left
  out;
- [blend modes](masks-and-effects.md#blend), which export as normal;
- pictures bound to bones, which don't bend. Shapes bound to bones bend as
  they do in the editor;
- [video layers](#video-layers), which show as still pictures.

A Lottie file has no sound.

An artboard fills the Lottie file's frame, at the **Size** you give it; the
whole page is framed to fit its animated artwork, its size starting at the
artwork's own.

## SVG {#svg}

A still of one frame, as vectors, at the artwork's own size: `frame_0.svg`
for frame 0, say.

- **Frame**: which frame. It starts at the playhead's.
- Shapes bent by their bones are written as their bent outlines. Pictures
  bound to bones aren't bent.
- Video layers are a still picture of the frame.

## PDF {#pdf}

Vector pages, each at its timeline's last frame, as the canvas draws it.

- One artboard: a page of it.
- Two or more artboards (none selected): a page for each slide, every
  artboard at its own size, in the Layers panel's order, in `slides.pdf`.
- Otherwise, a page of all the artwork.

A one-page PDF is named after its frame: `frame_149.pdf` for a timeline of
150 frames.

Layers with a [blur or a drop shadow](masks-and-effects.md#effects), and
pictures bent by bones or [adjusted](pictures-and-svg.md#adjust), go in as
pictures, not vectors. Video layers are a still picture of the page's frame.

## Export selected layers {#export-selection}

The **Export** section at the bottom of the Properties panel makes pictures
of what's selected, as it is at the playhead.

1. Select the layer, layers or artboard.
2. Click **+** beside **Export**. A row appears: **PNG 1x**.
3. Choose **PNG 1x**, **2x**, **3x** or **4x**, or **SVG**. The size in pixels
   is shown beside it.
4. To make more than one file, click **+** again for another row. The **−**
   at the end of a row removes it.
5. Click **Export**.

![The Export section of the Properties panel, with a PNG 2x row and an SVG row and the Export (2) button](img/exporting-selection.png 'Two files from one layer: a PNG at twice its size and an SVG.')

- The files are named after the layer (`Ball.png`), or
  `selection-2-items.png` and so on for several layers.
- A PNG is transparent around the artwork. An artboard's PNG has its
  background color, unless you clear **Include background**.
- A video layer shows the frame at the playhead: in a PNG as it is, in an
  SVG as a still picture.
- The rows are kept with the layer, so the next export takes one click.
