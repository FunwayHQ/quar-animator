# Marketing

`quar-animator-promo-*.mp4` — a 44-second promo (silent, H.264, 30 fps): title card,
the editor in use (Pen, bending a curve, gradient fill, duplicate & flip, one-click
animation presets, playback — sped up 2.6× except the playback), the showcase
animation as the app renders it, and an end card.

| File                             | Size      | For                           |
| -------------------------------- | --------- | ----------------------------- |
| `quar-animator-promo-16x9.mp4`   | 1920×1080 | X, LinkedIn, YouTube, website |
| `quar-animator-promo-1x1.mp4`    | 1080×1080 | Instagram / LinkedIn feed     |
| `quar-animator-promo-9x16.mp4`   | 1080×1920 | Reels, TikTok, Shorts         |
| `quar-animator-promo-poster.jpg` | 1920×1080 | Thumbnail / cover             |

## Making it again

The sources are in `source/`. With the dev server running (`pnpm dev`):

1. **Showcase frames** — `showcase.ts` builds the showcase project. Import it in the
   app (`await (await import('/@fs/<repo>/marketing/source/showcase.ts')).install()` in
   the browser console), open `/editor?project=showcase`, select the artboard and
   Export ▸ PNG Sequence; unzip into `source/out/showcase-frames/`. (Exported without
   the artboard selected, the frames are 1980×1210 with the artboard at 15, 65 — which
   is what `assemble.py` crops.)
2. **Recordings** — `node record.cjs out` records the title cards (`cards.html`) and a
   scripted editor session through Chrome's screencast (headless, Metal GPU), with an
   added cursor and step captions. It loads Playwright from the npx cache; point the
   `require` at any `playwright-core`.
3. **Cut** — `node layouts.cjs` renders the backdrops for the square and vertical cuts,
   then `python3 assemble.py` builds all three videos with ffmpeg (fades between the
   parts, the editor session sped up until its playback).

## "Redesign your site in Quar Animator"

`quar-website-redesign-16x9.mp4` and `-9x16.mp4` (36 s, with "Pool Table Panic" under it) plus
`-cover.jpg`: funwayinteractive.com's home page rebuilt in the editor as one animated artboard,
then exported. The sources, and how to make it again, are in
[`source/website-redesign/`](source/website-redesign/README.md).
