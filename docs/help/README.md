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

## The cloud edition's chapters

The cloud edition (the private fork) adds its own chapters — accounts, sync,
history, sharing, AI apps — in `docs/help-cloud/`, written the same way with
their pictures in `docs/help-cloud/img/`. The generator reads that folder when
it's there and builds both into one guide: chapters are ordered by `order`
across both folders, the cloud ones marked "Cloud edition". A chapter's name
must be unique across the two folders, and so must a picture's.
