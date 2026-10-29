# Video and GIF clips — plan

Import a video (or an animated GIF) and place it on the timeline as a clip, its
sound track separated onto the Sound lane. Decided with the owner on
2026-10-29; nothing is built yet. Starts once the October bug batches are
merged.

## Decisions

| Question                      | Decision                                                                                                                                                                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What a video is               | A **video layer** on the canvas (moved, scaled, rotated, faded, masked and keyframed like a picture) whose playing is a **clip**: the frame it starts on, the part of the video it plays. It sits in whatever timeline its layer is in (an artboard's or the page's).               |
| Its sound                     | Extracted at import into the sound library and put on the Sound lane under the video as an ordinary sound clip, **linked**: moving, trimming or changing the speed of the video does the same to its sound until they're unlinked. Fades, gain and mute work as for any sound clip. |
| Storage                       | **Inside the .quar**, like pictures and sounds, one copy per distinct file. **100 MB per video** at most.                                                                                                                                                                           |
| Formats                       | **MP4 and MOV** (H.264, HEVC where the browser decodes it), **WebM** (VP8, VP9, AV1) **with transparency**, **animated GIF**.                                                                                                                                                       |
| GIF                           | A clip without sound that **loops to fill** its clip.                                                                                                                                                                                                                               |
| Clip features (first version) | **Trim** in/out, **Loop**, **Speed** (the linked sound changes speed **keeping its pitch**), **Hold last frame**.                                                                                                                                                                   |
| Outside the clip              | The layer shows **nothing** before the clip starts and after it ends, unless Hold last frame is on.                                                                                                                                                                                 |
| On the timeline               | On the **layer's own row**: a bar with a strip of frames, its keyframe diamonds on top.                                                                                                                                                                                             |
| Placement                     | **Fitted to the artboard in view** (else the canvas view), centred; the clip **starts at the playhead**.                                                                                                                                                                            |
| On a video layer              | **Masks and clipping, effects and blend modes, opacity, adjustments** (as pictures have). Not corner pull or bones.                                                                                                                                                                 |
| Lottie, SVG, PDF              | **A still of the frame** at that moment (Lottie: a still picture layer), with a warning in the Export dialog that the video doesn't play there.                                                                                                                                     |
| Unsupported file or browser   | **Say so and don't import**: name the problem, suggest MP4 (H.264) or another browser.                                                                                                                                                                                              |
| Server renders                | A **frame strip** made at import (small stills, a few a second) kept with the video; renders that can't decode video draw those. The strip also draws the clip bar on the timeline.                                                                                                 |
| Shipping                      | **In steps**, each tested and deployed (below).                                                                                                                                                                                                                                     |

## Data

- **Library:** `videos` beside `sounds` in the store and the file — one entry
  per distinct file: `{ id, name, src (a binary buffer in a .quar), mime,
width, height, duration (s), frameRate, hasAlpha, frames: FrameStrip }`.
  Only videos some layer shows are saved, as with sounds.
- **Frame strip:** stills at a fixed rate (4 a second, at most 160 px high,
  WebP/JPEG; PNG where the video has alpha), as buffers in the .quar. Used by
  the timeline's clip bar and by any renderer that can't decode the video.
- **Video layer:** a new node type `video` — like `ImageNode` (width, height,
  natural size, adjustments, corner radius, effects, blend mode, masks) plus
  `videoId` and its clip: `{ start (frame), offset (s, trimmed off the
front), duration (s of the video played), speed, loop, holdLastFrame }`.
  Because the clip is on the layer, it follows the layer into and out of
  artboards, groups, copies, pastes and symbol edits with no extra
  bookkeeping.
- **Linked sound:** `SoundClip.linkedTo?: nodeId` and `SoundClip.speed?`
  (time-stretch factor, pitch kept). Moving/trimming/re-speeding the video
  updates its linked clip; unlinking clears `linkedTo`; deleting the video
  asks whether to keep its sound.
- **Animatable:** the layer's transform, opacity, adjustments and effects
  (keyframes as for pictures). The clip's timing isn't keyframed.
- **Format version:** additive fields only, so older files open unchanged;
  an older editor opening a newer file shows the video layer's still (the
  strip's first frame) — check what it does with an unknown node type and
  degrade to a picture if needed.

## Decoding and drawing

- **Decoding:** WebCodecs `VideoDecoder`, frame-accurate. Demux MP4/MOV
  with mp4box.js (BSD-3, fits the MIT repo); WebM with a small EBML reader
  (SimpleBlock/BlockGroup, BlockAdditions for VP8/VP9 alpha). GIF with
  `ImageDecoder` where present, else a small GIF decoder (gifuct-js, MIT).
- **Alpha (WebM):** the alpha channel is a second VP8/VP9 stream in
  BlockAdditions; decode it with a second `VideoDecoder` and combine the two
  in the shader (alpha from its luma). Where the browser can't, import says
  so (the decision above) rather than drawing it opaque without warning.
- **A frame source per video:** `frameAt(seconds)` → a GPU texture, with a
  small cache of decoded frames around the playhead, decode-ahead while
  playing, seek to the nearest keyframe and decode forward when scrubbing,
  and the strip's still shown until the exact frame arrives (scrubbing stays
  smooth). Frames are closed promptly (VideoFrame memory).
- **Canvas:** the video layer draws like a picture whose texture changes —
  through the same path, so masks, effects, blend modes, adjustments and
  artboard clipping work as they do for pictures. Unchanged-frame caching
  (CLAUDE.md, renderer GPU buffers) must not hold a stale frame.
- **Clip time:** for a frame `f` of the layer's timeline, the clip is active
  when `start ≤ f < start + length`, where length = duration ÷ speed in
  frames (looped clips: any length the clip bar is dragged to). Video time =
  `offset + ((f − start) / fps × speed) mod duration` (looping), clamped
  otherwise; after the end, the last frame if Hold is on, else nothing.

## Sound

- At import, `decodeAudioData` on the file (works for the browsers' own
  containers); if the file has no sound, nothing is added. The extracted
  sound is stored as a sound (WAV or the original stream copied out — pick
  the smaller that decodes back everywhere).
- **Speed with pitch kept:** a time-stretched rendition (WSOLA, written here:
  no GPL/LGPL code) made once per speed and cached, used by playback and
  exports alike so they sound the same. At 1× the original plays.
- Playback, scrubbing and exports reuse the sound clip machinery
  (`services/soundPlayer.ts`, `packages/export/src/soundtrack.ts`).

## Editing

- **Import:** File › Import Video… (MP4, MOV, WebM, GIF), dropping a file on
  the canvas or the timeline, pasting a file. Checks size (100 MB), format
  and decoding first; a progress line while the strip and sound are made.
- **Timeline row:** the clip bar (strip of frames) on the layer's row: drag it
  to move, its ends to trim (with Loop on, the right end lengthens it past
  the video's end), double-click for its settings card (Speed, Loop, Hold
  last frame, Unlink sound). Keyframe diamonds stay on top and selectable.
- **Properties:** a Video section (file, length, size, the clip's settings),
  the picture's Adjustments, Effects, Blend Mode, Opacity, Transform.
- Undo, copy/paste (in-app and between windows: the system-clipboard path
  must carry the video, or say it can't when it's too big), duplicate,
  delete, symbols, pages and artboards all handle video layers.

## Exports and presenting

- **MP4, WebM, GIF, PNG sequence, sprite sheet:** frames decoded exactly for
  each output frame (the frame plan in `exportUtils.ts`); the linked sounds
  go into MP4/WebM soundtracks as other sound clips do.
- **Lottie, SVG, PDF:** a still of the frame at that moment, as a picture;
  the dialog warns.
- **Presentation player:** plays video layers, its loader waits for their
  first frames.

## Steps

1. **Video layers and clips:** import MP4/MOV/WebM, the library, the video
   layer and its clip, decoding and drawing on the canvas, the clip bar,
   playback and scrubbing, the linked sound clip, save/open, undo, copy/paste.
2. **Clip features:** trim, Loop, Speed (with the pitch-kept sound), Hold
   last frame, Unlink.
3. **Exports and the presenter.**
4. **Transparency:** WebM alpha on the canvas and in exports.
5. **GIF clips.**
6. **The cloud edition's part** (planned in its own repository: server
   renders drawing the frame strip, AI apps arranging existing videos).
7. **The guide:** a "Video and GIF clips" chapter, and the shortcuts,
   exporting, timeline and troubleshooting chapters updated; its pictures.

Each step: tests first (decoders and timing in unit tests with small fixture
files, renderer tests, store tests), checked in the running app, one fix or
feature per commit, deployed when the owner says so.

## Risks

- **Memory:** decoded frames are large; the cache must be bounded and frames
  closed. Long 1080p+ clips while exporting at high sizes need care.
- **Browser support:** WebCodecs and the codecs differ by browser (HEVC,
  alpha). Detect per file at import, not per browser name.
- **File size:** projects with videos are big: saving, autosave (every 30 s)
  and copying between windows must not re-copy the video each time.
- **Fixture files:** tests need tiny MP4/WebM/GIF files committed (a few KB).
