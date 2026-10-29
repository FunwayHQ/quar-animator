---
title: Text
order: 5
summary: Add text, type and edit it on the canvas, choose its font, and set its size, weight, alignment and spacing.
---

Text in Quar Animator stays text: you can edit its words, change its font and
animate its size and spacing at any time. This chapter shows how to add it,
edit it, set it, pick fonts (including Google Fonts) and, when you need to,
turn it into shapes.

## Add text {#add}

1. Press [[T]] for the Text tool, or click it in the toolbar.
2. Put the text on the canvas:
   - **Click** for a line that grows as you type: auto width. It only breaks
     where you start a new line.
   - **Drag a box** for text that wraps inside it: a fixed size box. The words
     move to the next line when they reach its right edge.
3. Type. [[Enter]] starts a new line.
4. Finish: press [[Esc]] or [[Mod+Enter]], or click away from the text. The
   editor goes back to the Selection tool ([[V]]), with the text selected.

![A line of auto width text above a fixed box of text, selected, its words wrapped at the box's width](img/text-box.png 'Auto width text, above; a fixed box, selected, below.')

New text is set in Inter, 24 pixels, regular weight, aligned left, and filled
cornflower blue. Text you leave empty is removed when you finish. Text you put
on an artboard [goes into it](artboards.md#layers).

## Edit text {#edit}

Double-click text with the Selection tool. All its words are selected, so what
you type replaces them; click inside the text to put the cursor somewhere
instead. Finish as before, with [[Esc]], [[Mod+Enter]] or a click away.

To change the box, drag the text's handles with the Selection tool. They make
the box bigger or smaller and never stretch the letters. Dragging a side handle
of auto width text gives it a width to wrap at; a handle that changes the
height makes it a fixed size box.

## Set the text {#settings}

Select text, and its settings are in the Properties panel, under **Transform**.

![The Text settings in the Properties panel, numbered](img/text-settings.png 'The settings of a text layer.')

1. **Font**: the typeface. Click it to choose another (see
   [Choose a font](#fonts)).
2. **Font Size**, in pixels.
3. **Weight**: how bold the letters are, from the weights the font has: **400
   (Regular)**, **700 (Bold)** and the others.
4. **Align**: the three buttons line the text up on the left, in the middle or
   on the right.
5. **Resize**: how the text's box sizes itself.
   - **Auto width** (the left-right arrow): as wide as the longest line.
   - **Auto height** (the up-down arrow): a width you set, and as tall as the
     lines it wraps into.
   - **Fixed size** (the square): a width and a height you set.
6. **Line Height**: the space from one line to the next, as a share of the
   font size: **1.20** is 120%.
7. **Letter Spacing**: space added between the letters, in pixels. Below 0,
   the letters close up.

**Size** above them sets the box's width and height, as the handles do.

The text's color is its **Fill**, under **Appearance**, as for any shape (see
[Fill and stroke](shapes.md#fill-and-stroke)): a gradient works too. Text has
a stroke, hidden to begin with: click the stroke's eye to outline the letters.

The diamonds beside **Font Size**, **Line Height** and **Letter Spacing** are
for animating them (see [The diamonds in Properties](keyframes.md#diamonds)).
And text has entrances of its own among the
[animation presets](presets-and-sequences.md#presets), under **Animation** at
the top of the Properties panel: **Typewriter** shows it a letter at a time,
**By Word** a word at a time, **By Line** a line at a time.

## Choose a font {#fonts}

Click the **Font** field: the list of fonts opens under it.

![The font picker open under the Font field, its parts numbered](img/text-font-picker.png 'The font picker.')

1. **The search field.** Type part of a font's name to find it.
2. **The categories**: **All**, **Sans**, **Serif**, **Display**,
   **Handwriting** and **Mono** show only fonts of that kind.
3. **In this document**: the fonts the project's text is already set in.
4. **Recent**: the fonts you picked last.
5. **Google Fonts**: 300 more, the most used first. (Inter, which comes with
   the app, is under **Included** when the document doesn't use it.)
6. **Allow**: until you allow Google Fonts, every font's name is written in the
   editor's own lettering. Once you have, each name shows in its own font.

Click a font to pick it. Or use the keys: [[Up]] and [[Down]] move through the
list, [[Enter]] picks, [[Esc]] closes it, and [[Tab]] goes to the categories,
where the arrow keys choose one.

A font the document uses that can't be loaded here is marked **Missing**: its
text shows in a stand-in font.

### Google Fonts {#google-fonts}

Inter comes with Quar Animator. Every other font comes from Google Fonts, and
loading one sends a request to Google's servers, which can see your IP
address. So nothing is asked of Google until you allow it.

The first time you pick a Google font, the editor asks:

![The Use Google Fonts? question, with Cancel and Allow Google Fonts](img/text-google-fonts.png 'Asked the first time you pick a Google font.')

- **Allow Google Fonts** loads the font, and the ones you pick after it, from
  Google.
- **Cancel** leaves the text in the font it had.

Opening a project whose text uses Google fonts asks the same question. If you
don't allow it, that text shows in a stand-in font. To see it in its own font
after all, turn Google Fonts on (below), save, and reload the page.

To change your mind later, choose **Help › Use Google Fonts**: it's ticked while
Google Fonts are allowed, and choosing it again turns them off. Turned off,
nothing more loads from Google; fonts already loaded stay until you reload the
page. Your choice is remembered in this browser.

## Turn text into shapes {#convert}

To reshape letters, or to animate them one by one, turn the text into shapes:

1. Select the text.
2. Choose **Edit › Convert to Path** ([[Mod+Shift+P]]).

It becomes a group, with the text's name, holding one path for each letter, each
named after its letter. They're shapes from then on: reshape them with Direct
Selection (see [Paths and the Pen](paths.md#direct-selection)) and color them
one by one. Their words can't be edited any more, so keep a copy of the text if
you might want to change them (duplicate it with [[Mod+D]] first).
