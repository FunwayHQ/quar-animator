---
title: Troubleshooting and privacy
order: 22
summary: Where your work is kept and how not to lose it, what the editor sends to anyone (only fonts, and only if you allow them), and what to do when something goes wrong.
---

This chapter answers what to do when saving, the canvas, playback or an export
goes wrong, and how to tell us about a problem. It also says plainly what the
editor keeps, where, and what it sends to anyone.

## Where your projects are kept {#storage}

The free editor keeps your projects in your browser's own storage, on this
computer: each project with its pages, symbols, pictures and sounds. Nothing
is kept anywhere else. So:

- Another browser, another computer, or a private window doesn't have them.
  What you save in a private window is gone when you close it.
- Clearing this site's data in your browser (its cookies and site data)
  deletes every project, and nobody can bring them back.

The way to keep work safe is a backup: **File › Download as .quar** saves the
open project as a file on your computer (see
[Keep a backup](getting-started.md#backups)). Download one before you clear
your browser's data, and now and then for work you care about.

## When saving fails {#saving}

If "Failed to save project" (or "Auto-save failed") appears at the bottom
right, the project in the editor hasn't been saved. A common reason is that
the browser's storage for the site is full: browsers give each site a share of
the disk, and pictures and sounds make projects big (a
[picture](pictures-and-svg.md#import-picture) can be up to 10 MB, a
[sound](sound.md#add) up to 50 MB).

1. Don't close the tab: your work is still in the editor.
2. Choose **File › Download as .quar** to keep it as a file.
3. Make room: on the Projects page, delete projects you've backed up and
   don't need in the browser, or free some space on your disk.
4. Save again ([[Mod+S]]).

## Fonts and Google {#google-fonts}

Inter comes with the editor and needs nothing from anyone. The other fonts in
the [font picker](text.md#fonts) come from Google Fonts, and none of them is asked for until you
allow it. You can allow Google Fonts:

- by ticking **Enable Google Fonts** on the note that greets you on your first
  visit, before you click **Got it**;
- when you first pick one of them: the editor asks, and **Allow Google Fonts**
  loads it, while **Cancel** keeps the font you had;
- with **Help › Use Google Fonts**, ticked while they're allowed.

![The question the editor asks the first time a Google font is picked, with Cancel and Allow Google Fonts](img/troubleshooting-google-fonts.png 'What the editor asks the first time you pick a font from Google Fonts.')

Opening a project whose text is set in a Google font asks too. If you say no,
that text shows in a stand-in font, and opening or pasting more of it doesn't
ask again until you reload. Turn Google Fonts on later, from the Help menu or
the font picker, and the open project's fonts load at once, with no reload.

**What it sends.** Once they're allowed, the editor asks Google's servers for
each font you pick or a project uses, and, for the font picker to show each
name in its own font, for the letters of the names in view. Google can see
your IP address and which fonts were asked for. Nothing about your project
goes with them.

To stop, choose **Help › Use Google Fonts** again: nothing more loads from
Google, and fonts already loaded stay until you reload.

## What stays on your computer {#privacy}

- Your projects, pictures and sounds stay in your browser, and the editor
  sends them nowhere. There's no account to make, and no cookies or tracking.
- The editor shows only pictures that are in the project itself: it doesn't
  load pictures from other websites.
- The links in the menus and on the Projects page — GitHub, TikTok, Facebook,
  the privacy policy and the terms — open those sites only when you click
  them.

The Help menu holds what this chapter is about: **Use Google Fonts** (1),
**Privacy Policy** (2) and **Terms of Service** (3), which open the privacy
policy and the terms, and **Report Issues** (4). The policy and the terms are
also linked from the foot of the Projects page.

![The Help menu open, with Use Google Fonts, Privacy Policy, Terms of Service and Report Issues numbered](img/troubleshooting-help-menu.png 'The Help menu: Google Fonts (1), the privacy policy (2), the terms (3) and Report Issues (4).')

## The canvas stays empty {#webgl}

The canvas is drawn with WebGL 2, the graphics part of your browser. If the
browser can't provide it, the canvas says so: **This browser can't draw the
canvas**, with the steps below and a link to this section. The Layers panel,
the other panels and the menus still work, so you can still keep a copy of
your project with **File › Download as .quar**.

If the browser's graphics stop working while you're using the editor and
don't come back within a few seconds, the canvas says **The canvas stopped
drawing**. Your work is still in the editor: save it (**File › Save**), then
reload the page. If it goes on happening, try the steps below.

To fix it:

1. Turn on hardware acceleration in your browser's settings (Chrome calls it
   "Use graphics acceleration when available"), then restart the browser.
2. Update the browser, and if you can, your computer's graphics drivers.
3. Try another up-to-date browser: Chrome, Edge, Firefox and Safari all have
   WebGL 2.

Exports that make pictures or videos need it too.

## Playback is slow {#slow}

Some things take more drawing than others: shadows, blurs and blend modes, the
more so the further you zoom in, and many shapes bound to bones. To play more
smoothly:

- Zoom out, or make the browser window smaller: there's less to draw.
- Hide layers you aren't working on (the eye in the Layers panel).
- If you've ticked **Show during playback** in the onion skin settings, untick
  it.

Exports aren't affected: they draw every frame in full, however long it takes.

## An export fails {#exports}

When an export can't be made, the Export dialog says why (see
[Exporting](exporting.md)). The usual reasons:

- **Video:** [MP4 and WebM](exporting.md#video) are made by the browser's own
  video encoder, and not every browser or computer has one for each. If MP4 doesn't work, try WebM, or
  the other way round, or another browser; GIF and PNG sequences don't need
  one.
- **MP4 size:** an MP4's width and height must both be even numbers.
- **Sound:** if the browser can't encode the sound, turn **Sound** off in the
  Export dialog to export the video without it.
- **Size:** width and height must be between 1 and 8192 pixels.

## Report a problem {#report}

**Help › Report Issues** (4) opens Quar Animator's issues on GitHub, where you
can tell us what went wrong (GitHub asks you to sign in to write one). It
helps to say:

- what you did, step by step, what you expected, and what happened instead;
- your browser and its version, and your operating system;
- if you can share it, the project: **File › Download as .quar**, and attach
  the file.
