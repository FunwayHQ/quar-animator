# "Redesign your site in Quar Animator"

A 36-second video, cut both ways (`marketing/quar-website-redesign-16x9.mp4` and `-9x16.mp4`,
plus `-cover.jpg`; all git-ignored), set to "Pool Table Panic": funwayinteractive.com's home
page rebuilt in Quar Animator as one artboard, animated, and exported.

1. Intro card.
2. The live site, scrolled through.
3. The rebuilt page in the editor:
   - the whole page as one artboard;
   - its Animation Sequence (26 numbered reveal steps);
   - the headline picked, showing its real font;
   - playback, following the reveal down the page.
4. The animation as the editor exports it.
5. End card, on the music's breakdown.

The tall cut puts the whole editor above a full-size crop of the part that matters.

| File            | What it is                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------- |
| `measure.mjs`   | Reads the live page at 1440 px: text lines and baselines, icons, hero picture, logo          |
| `page.test.ts`  | Builds the page as a `.quar` (the editor's own types, SVG import, sequence compiler, writer) |
| `build-page.sh` | Runs `page.test.ts` from the app's tests (it's copied in for the one run)                    |
| `cards.html`    | The intro and end cards, the captions and the window chrome, both cuts                       |
| `record.mjs`    | Records the cards, the site and the editor session; exports the frames                       |
| `assemble.py`   | Puts every frame together and encodes, with the music                                        |

## Making it

```sh
cd marketing/source/website-redesign
node measure.mjs                  # -> ../out/website-redesign/{text.json, full.png, assets/}
./build-page.sh                   # -> ../out/website-redesign/Funway.quar
pnpm --filter @quar/web build     # then, in apps/web: npx vite preview --port 3100
node record.mjs                   # cards, stills, site, editor, frames (or name the parts)
python3 assemble.py [out-dir] [music.mp3]   # Python with opencv-python-headless and numpy
```

`node record.mjs ../out/website-redesign probe` saves stills of the editor beats, to check the
framing first. Playwright comes from `PLAYWRIGHT_CORE`, by default the npx cache that
`../record.cjs` uses.

**Notes**

- **Positions.** The page is built from what Chrome measured. Every baseline sits where Chrome
  drew it, and lines break where Chrome broke them. CSS blurs are 2σ and the editor's are 3σ, so
  the builder scales them by 1.5. Negative shadow spreads (the banner's and the button's glows)
  are drawn as shrunken, blurred shapes.
- **Playback.** Live playback of this page is too heavy for a smooth headless recording, so the
  editor's playback is stepped a frame at a time, one screenshot per frame.
- **Music timing.** The cuts fall on the track's bar lines: 139.7 bpm, first beat at 0.151 s.
  The end card comes in on beat 67, where the music drops. For another track, change `BEAT`,
  `FIRST_BEAT` and `BREAKDOWN` in `assemble.py`.
