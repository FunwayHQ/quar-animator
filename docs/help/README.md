# The user guide

Every chapter of Quar Animator's user guide is a Markdown file in this folder.
They're built into the static pages served at `/help/` (and shown in the
editor's help panel) by `apps/web/scripts/help/build-help.mjs`, which runs on
its own before `pnpm dev` and `pnpm build`. To build by hand: `pnpm help:build`,
then open <http://localhost:3000/help/> with the dev server running.

This file isn't a chapter: `README.md`, and files whose names start with `_`,
are left out.

## Write a chapter

1. Make `docs/help/<name>.md`. The name is the page's address
   (`/help/<name>/`), so use lowercase letters, digits and dashes, and don't
   change it once it's out: the editor and other chapters link to it.
2. Start it with its frontmatter:

   ```markdown
   ---
   title: Getting started
   order: 1
   summary: Make a project, find your way around the editor and keep your work safe.
   ---
   ```

   `order` places it in the guide (decimals are fine: 2.5 goes between 2 and
   3); `summary` is shown under the title and on the contents page. Quote a
   summary with a colon in it.

3. Write it: a few opening sentences, then a `##` heading for each task.

### What you can write

Ordinary Markdown (CommonMark, with tables), and:

| Write                                           | For                                                                                                                                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `## Save your work {#saving}`                   | A heading with an id of your choosing. Every heading gets one (made from its words otherwise); choose one for any heading that's linked to, so rewording it doesn't break the links.               |
| `[[Mod+S]]`                                     | A keyboard shortcut, drawn as keycaps. `Mod` is Ctrl, or Cmd on a Mac; `Alt` shows as Option on a Mac. Also `Shift`, `Enter`, `Esc`, `Space`, `Delete`, `Up`/`Down`/`Left`/`Right`, `F1`, letters. |
| `![What it shows](img/name.png "The caption.")` | On a line of its own: a numbered figure, its title the caption. The description (alt text) says what the picture shows, for people who can't see it.                                               |
| `> [!TIP]`, `> [!NOTE]`, `> [!CAUTION]`         | A callout (the first line of a quote). Tips are shortcuts and good habits; notes are background; cautions are where work can be lost.                                                              |
| `[Pages](pages.md#adding)`                      | A link to another chapter (or a part of one): write it as the file, as GitHub shows it.                                                                                                            |
| `[below](#undo)`                                | A link within the chapter.                                                                                                                                                                         |

Links to the web open in a new tab. Inline HTML works, but the pages allow no
inline styles or scripts.

### How to write it

- Plain, friendly and exact. Second person ("you"), present tense, short
  paragraphs.
- Tasks first: what you want to do, then how. Steps as numbered lists, one
  action each.
- Name things as the editor does, in bold when you mean a control:
  **New Project**, **File › Download as .quar**.
- Check every sentence against the app, and say what you see happen.
- Keep words out of pictures: number the parts of a screenshot and name them
  in the text (it keeps the pictures right when the guide is translated).

## Pictures

Every picture is a screenshot taken by a script, so they can all be taken
again when the editor changes. They're described in `shots.mjs` beside the
chapters and written to `img/<name>.png` (committed: the guide is built
without a browser).

```sh
pnpm --filter @quar/web exec playwright install chromium   # once
pnpm help:shots                    # every shot
pnpm help:shots editor-layout      # one (or several; projects-* for a family)
pnpm help:shots --list             # what there is
pnpm help:shots --url http://localhost:3000   # use a dev server that's running
```

By default it starts a dev server of its own for this checkout. Each shot
runs in a fresh browser (its own storage, so the tutorials are seeded as on a
first visit), 1280 × 800 at twice the size (DPR 2), dark unless it says
otherwise. On a Mac it draws the canvas on the GPU; elsewhere in software.

A shot:

```js
{
  name: 'editor-layout',              // img/editor-layout.png
  about: 'The editor, its parts numbered',
  theme: 'dark',                      // or 'light'
  viewport: { width: 1280, height: 800 },
  steps: [
    { open: 'tutorial-draw-and-animate' },   // 'projects', 'new', or a project's id
    { press: 'Control+0' },                  // Fit to Window
    { layer: 'Ball' },                       // click a layer by name
  ],
  markers: [{ target: '[data-testid="page-tabs"]', label: 2, at: 'left', dx: 414 }],
  capture: { selectors: ['…', '…'], padding: 8 },   // or 'viewport' (the default), { clip }
}
```

Steps, one action each: `open`, `goto`, `seed` (`{ id, name, file }`: a
`.quar` from beside the shot list, put among the projects), `click`,
`dblclick`, `rightClick`, `hover`, `press` (Playwright key names; use
`Control`, which the editor takes on a Mac too), `type`, `fill`
(`[selector, text]`), `waitFor`, `wait` (ms), `page` (a page tab by name),
`layer`, `drag` (`{ from: [x, y], to: [x, y], within?, shift?, alt? }`, in the
canvas's own pixels by default), `evaluate` and `run` (`async (page, kit) =>
{…}`, for anything else). `date` fixes the clock (for dates shown on the
Projects page), `storage` adds localStorage, `keepPointer` leaves the pointer
hovering where the steps left it.

Markers are numbered badges drawn over the picture (`at`: `center`, `top`,
`top-left` and so on, nudged by `dx`/`dy`; `outline: true` rings the target).
Name what each number points at in the text, not in the picture.

Pictures are shown at half their pixel size; a picture made another way can
end its name in `@1x` to be shown at its own size.

## Checks

`pnpm help:check` (also a test in the normal run, `src/help/helpCheck.test.ts`)
fails when:

- a chapter has no frontmatter, or is missing its title, order or summary;
- a picture isn't in `img/`, isn't there, has no description, or (a PNG) has
  no shot to take it again;
- a link to a chapter, or to a heading's `#id`, goes nowhere;
- the editor asks for a page or part that isn't there (`openHelp('page',
'anchor')`, `helpUrl(…)` or `data-help="page#anchor"` in `apps/web/src/`);
- a built page has a tag left open, anything the pages' policy refuses (inline
  styles, scripts or handlers), a picture without its size, or a local link,
  picture or `#anchor` that isn't there.

It warns about pictures no chapter shows.

## The cloud edition's chapters

The cloud edition (the private fork) adds its own chapters — accounts, sync,
history, sharing, AI apps — in `docs/help-cloud/`, written the same way with
their pictures in `docs/help-cloud/img/`. The generator reads that folder when
it's there and builds both into one guide: chapters are ordered by `order`
across both folders, the cloud ones marked "Cloud edition". A chapter's name
must be unique across the two folders, and so must a picture's.

## Linking from the editor

**Help › User Guide** (or <kbd>F1</kbd>) opens the guide in the help panel, a
floating window beside the canvas (`apps/web/src/components/help/`). To open
it at the page about a feature, call:

```ts
import { openHelp } from '../help/helpPanel';

openHelp('getting-started', 'saving'); // the chapter's file name, a heading's id
```

or mark the part of the editor with `data-help="getting-started#saving"`: F1
opens the page of whatever has the focus, or else of what's under the
pointer, and the guide's contents when nothing says. Choose the heading's id
with `{#…}` so it stays put when the heading is reworded.
