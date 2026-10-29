---
title: Keyboard shortcuts
order: 21
summary: Every key the editor knows, grouped by what you're doing.
---

Shortcuts are shown here for Windows and Linux. On a Mac, [[Mod]] is Cmd and
[[Alt]] is Option; the editor also takes Ctrl in place of Cmd. The menus list
their own shortcuts beside their items, and **Help › Keyboard Shortcuts**
shows the main ones in a window.

![The Keyboard Shortcuts window, listing tools, view, edit, arrange and animation shortcuts](img/shortcuts-dialog.png 'Help › Keyboard Shortcuts. It scrolls to show the rest.')

Most shortcuts work wherever you are in the editor, but not while you're
typing in a field: there, keys type. A few go to the canvas and work once
you've clicked on it: [[Mod+A]], [[Delete]], [[Mod+D]], the arrow keys, the
stacking keys and [[Esc]] (see [Select layers](selecting-and-arranging.md#select)).

> [!NOTE]
> A browser may keep some keys for itself: Chrome, for one, opens a new
> window for [[Mod+N]]. Use the menu item instead.

## Tools {#tools}

| Key   | Tool                                            |
| ----- | ----------------------------------------------- |
| [[V]] | [Selection](selecting-and-arranging.md#select)  |
| [[A]] | [Direct Selection](paths.md#direct-selection)   |
| [[H]] | [Hand](selecting-and-arranging.md#view)         |
| [[R]] | [Rectangle](shapes.md#tools)                    |
| [[O]] | [Ellipse](shapes.md#tools)                      |
| [[U]] | [Polygon](shapes.md#tools)                      |
| [[S]] | [Star](shapes.md#tools)                         |
| [[P]] | [Pen](paths.md#pen)                             |
| [[B]] | [Brush](brush-and-eraser.md#brush)              |
| [[E]] | [Eraser](brush-and-eraser.md#eraser)            |
| [[T]] | [Text](text.md#add)                             |
| [[F]] | [Artboard](artboards.md#draw)                   |
| [[J]] | [Bone](rigging-bones.md#draw)                   |
| [[W]] | [Weight Paint](rigging-weights.md#weight-paint) |

## While you draw {#drawing}

| Keys                                                                      | With                                        | Does                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| [[Shift]] (hold)                                                          | Rectangle, Ellipse, Artboard                | keeps it square, or round                             |
| [[Alt]] (hold)                                                            | Rectangle, Ellipse, Polygon, Star, Artboard | draws it out from the middle                          |
| [[Esc]]                                                                   | any shape, a brush stroke                   | gives up on what you're drawing                       |
| [[Shift]] (hold)                                                          | Pen                                         | keeps the line to steps of 45°                        |
| [[Enter]]                                                                 | Pen                                         | finishes the path, open                               |
| [[Backspace]] or [[Delete]]                                               | Pen                                         | takes away the last point                             |
| [[Esc]]                                                                   | Pen                                         | gives up on the path                                  |
| [[Alt]]+click a point                                                     | Pen                                         | turns it between a corner and a smooth point          |
| [[Alt]] (hold), dragging out a point                                      | Pen                                         | breaks its handles apart: only the one you drag moves |
| <kbd class="keys"><kbd>[</kbd></kbd> <kbd class="keys"><kbd>]</kbd></kbd> | Eraser                                      | makes the eraser smaller or bigger                    |
| [[Esc]]                                                                   | Bone                                        | ends the chain of bones and goes back to Selection    |

More in [Draw a shape](shapes.md#draw), [Draw with the Pen](paths.md#pen),
[Rub out with the Eraser](brush-and-eraser.md#eraser) and
[Draw bones](rigging-bones.md#draw).

## Files {#file}

| Keys            | Does                     |
| --------------- | ------------------------ |
| [[Mod+S]]       | **File › Save**          |
| [[Mod+Shift+S]] | **File › Save As…**      |
| [[Mod+O]]       | **File › Open Project…** |
| [[Mod+N]]       | **File › New Project**   |
| [[Mod+I]]       | **File › Import SVG…**   |

More in [Save your work](getting-started.md#saving) and
[Import SVG](pictures-and-svg.md#svg).

## Edit {#edit}

| Keys                            | Does                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| [[Mod+Z]]                       | Undo                                                         |
| [[Mod+Shift+Z]] or [[Mod+Y]]    | Redo                                                         |
| [[Mod+X]], [[Mod+C]], [[Mod+V]] | Cut, Copy, Paste                                             |
| [[Mod+D]]                       | Duplicate                                                    |
| [[Delete]] or [[Backspace]]     | Delete                                                       |
| [[Mod+A]]                       | Select All (with Direct Selection on a path: all its points) |
| [[Esc]]                         | select nothing; inside a group, come back out of it          |
| [[Mod+Shift+K]]                 | **Edit › Create Symbol**                                     |
| [[Esc]], while editing a symbol | back to the page                                             |

More in [Undo and redo](getting-started.md#undo),
[Copy, paste and duplicate](selecting-and-arranging.md#clipboard) and
[Symbols](symbols.md).

## Arrange {#arrange}

| Keys                                                                                                                                     | Does                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [[Mod+G]]                                                                                                                                | Group                                                           |
| [[Mod+Shift+G]]                                                                                                                          | Ungroup                                                         |
| <kbd class="keys"><kbd data-key="mod">Ctrl</kbd><span class="plus">+</span><kbd>]</kbd></kbd>                                            | Bring Forward                                                   |
| <kbd class="keys"><kbd data-key="mod">Ctrl</kbd><span class="plus">+</span><kbd>Shift</kbd><span class="plus">+</span><kbd>]</kbd></kbd> | Bring to Front                                                  |
| <kbd class="keys"><kbd data-key="mod">Ctrl</kbd><span class="plus">+</span><kbd>[</kbd></kbd>                                            | Send Backward                                                   |
| <kbd class="keys"><kbd data-key="mod">Ctrl</kbd><span class="plus">+</span><kbd>Shift</kbd><span class="plus">+</span><kbd>[</kbd></kbd> | Send to Back                                                    |
| [[Shift+H]]                                                                                                                              | Flip Horizontal                                                 |
| [[Shift+V]]                                                                                                                              | Flip Vertical                                                   |
| [[Up]] [[Down]] [[Left]] [[Right]]                                                                                                       | nudge by 1 (with [[Shift]]: 10; with Snap to Grid: a grid step) |

More in [Select and arrange](selecting-and-arranging.md).

## Shapes and paths {#paths}

| Keys            | Does                                            |
| --------------- | ----------------------------------------------- |
| [[Mod+Shift+U]] | Boolean Union                                   |
| [[Mod+Shift+D]] | Boolean Subtract                                |
| [[Mod+Shift+I]] | Boolean Intersect                               |
| [[Mod+Shift+X]] | Boolean Exclude                                 |
| [[Mod+J]]       | Join (closes an open path, or joins open paths) |
| [[Mod+Shift+P]] | Convert to Path                                 |
| [[Mod+Shift+O]] | Outline Stroke                                  |

More in [Path commands](paths.md#path-commands),
[Convert shapes, strokes and text](paths.md#convert) and
[Combine shapes](paths.md#boolean).

With the Selection tool, double-click a path to edit its points (it switches
to Direct Selection), or double-click text to edit it.

**Editing points with [Direct Selection](paths.md#direct-selection):**

| Keys                               | Does                                            |
| ---------------------------------- | ----------------------------------------------- |
| [[Shift]]+click a point            | adds it to the points selected, or takes it out |
| [[Mod+A]]                          | selects all the path's points                   |
| [[Up]] [[Down]] [[Left]] [[Right]] | moves the points by 1 (with [[Shift]]: 10)      |
| [[Delete]] or [[Backspace]]        | deletes the points                              |
| [[Alt]]+click a point              | turns it between a corner and a smooth point    |
| [[Alt]]+drag a handle              | moves that handle alone                         |
| [[Esc]]                            | selects no points; again, back to Selection     |

**[Editing text](text.md#edit):**

| Keys                     | Does                 |
| ------------------------ | -------------------- |
| [[Enter]]                | starts a new line    |
| [[Esc]] or [[Mod+Enter]] | finishes, keeping it |

## View {#view}

| Keys                   | Does                          |
| ---------------------- | ----------------------------- |
| [[Mod+=]]              | Zoom In                       |
| [[Mod+-]]              | Zoom Out                      |
| [[Mod+1]]              | Zoom to 100%                  |
| [[Mod+0]]              | Fit to Window                 |
| [[Space]]+drag         | pan the canvas                |
| [[Shift]]+scroll       | pan left and right            |
| [[Shift+R]]            | Show Rulers                   |
| [[Shift+G]]            | Show Guides                   |
| [[Delete]], on a guide | removes the guide you clicked |

More in [Move around the canvas](selecting-and-arranging.md#view) and
[Line things up](selecting-and-arranging.md#align).

## Timeline and playback {#timeline}

| Keys                      | Does                                                     |
| ------------------------- | -------------------------------------------------------- |
| [[Space]]                 | play and pause (on the canvas: when you let go of it)    |
| [[Home]] / [[End]]        | go to the start / the end of the animation               |
| [[,]] / [[.]]             | previous / next frame                                    |
| [[Shift+,]] / [[Shift+.]] | 10 frames back / on                                      |
| [[L]]                     | Loop Playback on or off                                  |
| [[K]]                     | Auto-Keyframe on or off                                  |
| [[G]]                     | switch the timeline's rows to the graph editor, and back |
| [[I]] / [[Shift+I]]       | start / end the work area (the range that plays) here    |
| [[Alt+W]]                 | the work area on or off (Windows and Linux)              |
| [[Shift+O]]               | Onion Skinning on or off                                 |
| [[Shift+A]]               | the Animation Sequence window                            |

More in [Play your animation](keyframes.md#playing),
[The work area](keyframes.md#work-area),
[Onion skin](keyframes.md#onion-skin) and
[The Animation Sequence window](presets-and-sequences.md#sequence).

In the [**graph editor**](easing.md#graph-keyframes), after you click in it:
[[Delete]] deletes the selected keyframes, [[Left]] and [[Right]] move them a
frame (with [[Shift]]: 10), [[Up]] and [[Down]] change their value by 1 (with
[[Shift]]: 10).

On the [**sound lane**](sound.md#move), with a clip selected: [[Delete]]
removes it, [[Left]] and [[Right]] move it a frame (with [[Shift]]: 10), [[M]]
mutes it or turns it on again, and [[Enter]] opens its settings.

## Rigging {#rigging}

| Keys                                                                      | With                                               | Does                                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| <kbd class="keys"><kbd>[</kbd></kbd> <kbd class="keys"><kbd>]</kbd></kbd> | Weight Paint                                       | makes the brush smaller or bigger                    |
| [[X]]                                                                     | Weight Paint                                       | switches between adding and taking away weight       |
| <kbd class="keys"><kbd>[</kbd></kbd> <kbd class="keys"><kbd>]</kbd></kbd> | Point Magnet, while you record a Smart Bone target | makes it smaller or bigger                           |
| [[F]]                                                                     | Point Magnet                                       | changes how its push fades: smooth, linear, constant |
| [[Esc]]                                                                   | Point Magnet                                       | clears the target you're recording, to start it over |

More in [Paint weights](rigging-weights.md#weight-paint),
[The Point Magnet](rigging-weights.md#point-magnet) and
[Reshape with Smart Bones](rigging-ik-physics.md#smart-bones).

## Number fields {#fields}

In the Properties panel's number fields: [[Up]] and [[Down]] add or take away
1 (with [[Shift]]: 10), and so does turning the mouse wheel over the field
you're in. [[Right]] goes on from the whole number to the decimals. A slide
transition's **Duration** steps by a tenth of a second instead (with
[[Shift]]: a whole second). More in
[Type exact values](selecting-and-arranging.md#fields).

## Presenting {#presenting}

While the artboards play full screen:

| Keys                     | Does                                                 |
| ------------------------ | ---------------------------------------------------- |
| [[Down]] or [[PageDown]] | the next slide (again, during a transition: skip it) |
| [[Up]] or [[PageUp]]     | the slide before; on the first, start it over        |
| [[Home]] / [[End]]       | the first / last slide                               |
| [[Esc]]                  | stop presenting                                      |

More in [Present](presenting.md#present).

## Help {#help}

| Keys    | Does                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------- |
| [[F1]]  | opens this guide, at the page about what has the focus or what you're pointing at, if there is one |
| [[Esc]] | closes the guide                                                                                   |

More in [Get help](getting-started.md#help).
