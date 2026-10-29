---
title: Slides and presenting
order: 20
summary: Make a page's artboards into slides, set the transitions between them, and present them full screen.
---

The artboards of a page can be slides. The presentation player shows them
full screen, one after another, each playing its own animation and sounds,
and a video or GIF export can play them in a row. Each slide can come on
with a transition: a fade, a push, a wipe.

## Make slides {#slides}

1. On one page, [draw an artboard](artboards.md#draw) for each slide with the
   Artboard tool ([[F]]).
2. Put each slide's artwork inside its artboard, and animate it there: each
   artboard has a [timeline of its own](artboards.md#timelines).
3. Put the slides in order in the Layers panel (1): the artboard at the top
   of the list is the first slide, the one under it the second, and so on.
   Drag an artboard up or down the list to move its slide.

![A page of three artboards, the second selected: the Layers panel, its Slide section and the Play button numbered](img/presenting-slides.png 'Three slides. The top artboard in the Layers panel (1) is the first; the Slide section (2) and the Play button (3) are described below.')

> [!TIP]
> A new artboard goes to the top of the Layers panel, so the last one you
> drew is the first slide until you move it.

Select an artboard, and the **Slide** section (2) in the Properties panel
shows its number: 2 / 3 is the second of three. A hidden artboard isn't a
slide: its section says **Hidden**.

## Transitions {#transitions}

A transition plays as a slide comes on after the one before. Each slide has
its own.

1. Select the slide's artboard.
2. In the **Slide** section, choose **Transition in**: **None**, **Fade**,
   **Fade Through**, **Push**, **Slide Over** or **Wipe**.
3. For a push, a slide-over or a wipe, choose its **Direction**: left, right,
   up or down. Left moves to the left, so the slide comes in from the right.
4. Set its **Duration**, in seconds: from 0.1 to 10. [[Up]] and [[Down]] in
   the field add or take away a tenth of a second, with [[Shift]] a whole
   second.

![The Slide section of the Properties panel: Push chosen, the left arrow of Direction picked, Duration 0.5 s and Apply to all slides](img/presenting-transition.png 'A push in from the right, half a second long.')

- **Fade**: the slide fades in over the one before.
- **Fade Through**: the one before fades out to the background, then the
  slide fades in.
- **Push**: the slide pushes the one before off the screen.
- **Slide Over**: the slide moves in over the one before, which stays still.
- **Wipe**: an edge moves across, uncovering the slide.

The small square beside **Transition in** plays the transition, one slide
number giving way to the next. Point at it to play it again.

**Apply to all slides** puts the transition you see on every slide of the
page.

The first slide opens the show, so nothing plays into it: its controls are
greyed out. Transitions start and end gently, and they're kept in the
project and copied with their artboard. Changing one is a step you can undo.

## Present {#present}

1. Click the Play button (3), **Present**, at the end of the tools in the
   menu bar. It's there while the page has an artboard that isn't hidden
   (and not while you're [editing a symbol](symbols.md#edit)).
2. The slides fill the screen, the first one first. Each plays its timeline
   and its [sounds](sound.md) once from the start, then holds on its last
   frame.
3. Press [[Down]] to go on to the next slide, with its transition.
4. Press [[Esc]] to stop presenting and go back to editing.

![The first slide full screen, the keys to use at the bottom and the slide's number at the bottom right](img/presenting-player.png 'Presenting: the keys show for the first few seconds.')

The keys:

| Key                      | What it does                                                                |
| ------------------------ | --------------------------------------------------------------------------- |
| [[Down]] or [[PageDown]] | The next slide, with its transition. During a transition, skips to its end. |
| [[Up]] or [[PageUp]]     | The slide before, without a transition. On the first slide: starts it over. |
| [[Home]]                 | The first slide, without a transition (on the first slide, starts it over). |
| [[End]]                  | The last slide, without a transition.                                       |
| [[Esc]]                  | Stops presenting.                                                           |

A presentation clicker that sends Page Down and Page Up works too.

- Where the browser allows it, the slides fill the whole screen. Leaving full
  screen stops presenting, as [[Esc]] does.
- Each slide is fitted to the screen. Around it is the document's background
  color.
- The slide's number shows for a moment at the bottom right when it comes
  on, and the pointer hides when you stop moving it.
- Presenting changes nothing in the project: the player shows a copy of the
  page as it was when you clicked Play.

### Getting the slides ready {#loading}

Before the first slide plays, the player loads what the slides need: their
pictures, the sounds they play and the fonts of their text
([Google Fonts](text.md#google-fonts) only if you've let the editor use them). If that takes more than a moment, a
loading screen shows the first slide's name, how many slides there are, and
how far it has got with the **Slides**, and with the **Sounds** and **Fonts**
when they have any. [[Esc]] leaves from there too.

## Slides in exports {#exports}

With no artboard selected, MP4, WebM, GIF and PNG Sequence exports of a page
with two or more artboards play every slide, one after another, with the
transitions between them. Each slide's sounds start once its transition is
over. A PDF export has a page for each slide. See
[What's exported](exporting.md#scope).
