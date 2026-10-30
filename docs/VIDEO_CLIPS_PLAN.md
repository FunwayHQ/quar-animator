# Video and GIF clips — plan

Import a video (or an animated GIF) and place it on the timeline as a clip, its
sound track separated onto the Sound lane. Decided with the owner on
2026-10-29; all seven steps are built (below).

## Decisions

| Question                      | Decision                                                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| What a video is               | A **video layer** on the canvas (moved, scaled, rotated, faded, masked and keyframed like a picture) whose playing is a **clip**: the frame it starts on, the part of the video it plays. It sits in whatever timeline its layer is in (an artboard's or the page's).                |
| Its sound                     | Extracted at import into the sound library and put on the Sound lane under the video as an ordinary sound clip, **linked**: moving, trimming or changing the speed of the video does the same to its sound until they're unlinked. Fades, gain and mute work as for any sound clip.  |
| Storage                       | **Inside the .quar**, like pictures and sounds, one copy per distinct file. **100 MB per video** at most.                                                                                                                                                                            |
| Formats                       | **MP4 and MOV** (H.264, HEVC where the browser decodes it), **WebM** (VP8, VP9, AV1) **with transparency**, **animated GIF**.                                                                                                                                                        |
| GIF                           | A clip without sound that **loops** (looping to fill the timeline when its file loops forever) and **can be stopped at any frame** (owner, 2026-10-29): Loop off plays it once and holds its last frame; Stop here, or the bar's end dragged, freezes it on the frame showing there. |
| Clip features (first version) | **Trim** in/out, **Loop**, **Speed** (the linked sound changes speed **keeping its pitch**), **Hold last frame**.                                                                                                                                                                    |
| Outside the clip              | The layer shows **nothing** before the clip starts and after it ends, unless Hold last frame is on.                                                                                                                                                                                  |
| On the timeline               | On the **layer's own row**: a bar with a strip of frames, its keyframe diamonds on top.                                                                                                                                                                                              |
| Placement                     | **Fitted to the artboard in view** (else the canvas view), centred; the clip **starts at the playhead**.                                                                                                                                                                             |
| On a video layer              | **Masks and clipping, effects and blend modes, opacity, adjustments** (as pictures have). Not corner pull or bones.                                                                                                                                                                  |
| Lottie, SVG, PDF              | **A still of the frame** at that moment (Lottie: a still picture layer), with a warning in the Export dialog that the video doesn't play there.                                                                                                                                      |
| Unsupported file or browser   | **Say so and don't import**: name the problem, suggest MP4 (H.264) or another browser.                                                                                                                                                                                               |
| Server renders                | A **frame strip** made at import (small stills, a few a second) kept with the video; renders that can't decode video draw those. The strip also draws the clip bar on the timeline.                                                                                                  |
| Shipping                      | **In steps**, each tested and deployed (below).                                                                                                                                                                                                                                      |

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

- **Decoding:** mediabunny, already the export package's muxer, also reads:
  `Input` over a `BlobSource` demuxes MP4, MOV and WebM; the tracks say
  whether this browser can decode them (`canDecode()`); `CanvasSink` decodes
  frames through WebCodecs to canvases, frame-accurately (`getCanvas(t)` to
  seek, `canvases(t)` to play on, `canvasesAtTimestamps` for the strip);
  `AudioBufferSink` decodes the sound. No mp4box.js or EBML reader needed.
  GIF: `ImageDecoder` where present, else a small GIF decoder (gifuct-js,
  MIT).
- **Alpha (WebM):** `CanvasSink({ alpha: true })` reads VP8/VP9 alpha side
  data into transparent canvases; `track.canBeTransparent()` sets the
  video's `hasAlpha`. Where the browser can't, import says so (the decision
  above) rather than drawing it opaque without warning.
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

## Step 1 design (as built)

The foundation (types, clip timing, the library, the renderer's interface)
is in place; the rest of step 1 builds on these names.

- **Types** (`@quar/types`): `VideoNode` (`type: 'video'`, `videoId`, size,
  natural size, corner radius, adjustments, `clip: VideoClip`), `VideoClip`
  (`start` frame, `offset` and `duration` in seconds; speed, loop and hold
  come in step 2 as optional fields), `Video` (the library entry: name, MIME
  type, byte length, size, duration, frame rate, `hasAlpha`, `strip`),
  `VideoStrip` (stills `rate` a second, `height` px, data URIs),
  `SoundClip.linkedTo` (the video layer whose sound it is).
- **Timing** (`packages/animation/src/VideoClips.ts`): `videoTimeAt(clip,
frame, fps)` (null outside the clip; frame f begins at f/fps seconds, as
  for sounds), `videoClipEndFrame`, `videoPosterTime` (a layer outside the
  timeline in view shows its clip's first frame), `movedVideoClip`,
  `linkedSoundClip` (a linked sound put where its layer's clip is).
- **Library and files:** the store's `videos` (`stores/videoActions.ts`,
  `addVideo`; emptied by New Project) holds the JSON-able entries; the files
  are Blobs in `services/videoFiles.ts` (`setVideoFile`, `videoFile`,
  `keepVideoFiles`), so undo snapshots (which clone every node) and the
  JSON never carry them. Video nodes hold no `src`.
- **Saving:** a .quar keeps each video file as a buffer of the v3 container
  (the JSON's `videos[i].file` names it); writing one is async (Blob →
  bytes). The browser's storage keeps each file once, in an object store of
  its own keyed by project and video, written when the project is first
  saved with it; the project record holds only the JSON and small buffers,
  so autosave never rewrites a video. Download, Save As, duplicate and
  delete handle the files; an imported .quar's video buffers become Blobs.
  (The cloud edition syncs the .quar with its files — its step 6.)
- **Decoding:** a frame source per video (`services/videoFrames.ts`):
  mediabunny `CanvasSink` (no bigger than the video, at most 1920 px on its
  long side), a few decoded frames kept round the playhead, decoding ahead
  while playing, seeking when scrubbing, the strip's nearest still shown
  until the exact frame arrives, everything closed when the video goes.
- **Drawing:** core `VideoFrameProvider` (`rendering/videoFrames.ts`): the
  app tells the `ShapeRenderer` the picture each video layer shows now
  (`{ source, key }`, null for nothing); the renderer draws it through the
  picture path (adjustments, corners, masks, effects, blend modes) with a
  texture per layer uploaded again when the key changes. The canvas redraws
  every animation frame, so decoded frames show as they arrive.
- **Import:** File › Import Video…, a video dropped on the canvas or the
  timeline: at most 100 MB, probed first (a decodable video track, else a
  message naming the problem), the strip made, the sound copied out of the
  file without re-encoding into a sound of the library and a clip linked to
  the layer, the layer fitted to the artboard in view, its clip from the
  playhead; one undo step.
- **Timeline:** the clip bar on the layer's own row (its strip, its name),
  dragged to move it (its linked sound with it); diamonds stay on top.
- **Edits:** undo, delete (asks whether to keep its sound), duplicate and
  copy/paste in the window (the video with it; between windows the system
  clipboard can't carry a video: it says so), moving into or out of an
  artboard (its linked sound moves to that timeline), pages, symbols.

## Steps 2 and 3 (as built)

- **Clip features:** `VideoClip.speed` (0.25×–4×), `loop` with `loopFor`
  (a looped clip's length, past the video's end), `holdLastFrame`; the
  timing a sound clip shares (`clipSeconds`, `clipMomentAt`,
  `trimmedVideoStart`/`End`, `withClipSpeed`, `withLoop` in
  `VideoClips.ts`). A linked sound takes the clip's start, offset,
  duration, speed and loop; its speed keeps the pitch (a WSOLA rendition,
  `packages/export/src/audio/timeStretch.ts`, made once per speed and
  shared by playback and exports). Playing runs to the last video clip's
  end; a looped sound dips 5 ms at each join.
- **Raster exports** (MP4, WebM, GIF, PNG sequence, sprite sheet, the
  Properties panel's PNG): `createExportVideoFrames(shots, size, sources)`
  (`packages/export/src/video/exportFrames.ts`) plans every shot's moments
  up front (slides and transitions too), decodes each layer's frames in
  shot order through one `canvasesAtTimestamps` pass, at the layer's
  largest size on the export, and is awaited (`prepare(i)`) before each
  synchronous `renderFrame`. A file that's missing or won't decode falls
  back to its strip (its name in `problems`).
- **Lottie, SVG, PDF:** a still of the moment shown
  (`packages/export/src/video/still.ts`, `videoStills.ts`; app
  `services/videoStills.ts`), put in the posed copy as a picture in the
  layer's place. Lottie shows the first picture in the exported range as a
  still image layer there while the clip is. The Export dialog says so.
- **Renderer:** a drawing's own pictures (`FrameRenderContext.videoFrames`,
  the presenter's) win over the export's (`FrameRenderOptions.videoFrames`).
- **Presenter:** readers of its own (`createVideoFrames()`), decoding ahead
  while a slide plays; the loader waits (5 s at most) for each video's
  first picture. **Thumbnails** draw strip stills.

## Step 4 (as built)

- **Canvas:** a video's pictures are uploaded premultiplied
  (`UNPACK_PREMULTIPLY_ALPHA_WEBGL`) and the picture shader takes the colour
  back (`u_premultiplied`), so see-through edges filter without dark
  fringes. Pictures are still uploaded straight.
- **Alpha as stored:** mediabunny stretched a WebM's alpha stream as limited
  range whenever its header said so (libvpx and Chrome always do), reading
  128 as 130 and 0–16 as clear. A pnpm patch
  (`patches/mediabunny@1.61.4.patch`) takes it as stored, as ffmpeg and the
  browsers' own players do; `alphaMerge.test.ts` runs mediabunny's worker
  code and fails if the stretch comes back (re-check on upgrading).
- **Import:** `probeVideo` decodes a transparent video's first frame and
  refuses it (`'transparency'`) when the frame loses its alpha or the
  browser draws RGBA frames as if premultiplied (Firefox); WebKit and
  Chromium import. Projects already holding one still draw it wrong in
  Firefox.
- **Exports:** every raster export, the strips and the stills keep the
  alpha (PDF as an SMask); MP4 and opaque outputs composite over the
  background; GIF keeps its one-bit rule. `VideoExportSources.onVideoProblems`
  tells the Export dialog which videos fell back to their strips; it stays
  open saying so. The Properties PNG and the Lottie/SVG/PDF stills only
  `console.warn` theirs.
- **Properties:** the Video section's "Alpha · Transparent" line.

## Step 5 (as built)

- **Decoder:** our own (`packages/export/src/video/gif.ts`, no library).
  Reading a GIF walks its blocks: each frame's place, delay (10 ms or less
  plays as 100 ms), disposal, transparent colour, palette and data, and the
  loop count; pixels are decoded (LZW, interlace) only when a frame is
  drawn. The compositor draws each frame over the one before (disposal 2
  clears, 3 puts back), holding one picture and restore points (16 MB at
  most) to seek from. It matches PIL and the browsers' ImageDecoder pixel
  for pixel.
- **ImageDecoder** (`gifMedia.ts`), by frame index, only where it passes a
  4-pixel trial (transparency, disposal) and counts the file's frames the
  same; otherwise, and from any frame it fails on, the compositor. WebKit
  fails the trial (its transparent pixels come out black). Timing always
  comes from the GIF's own delays.
- **One branch:** `openVideoMedia` (`media.ts`) gives a GIF a track and
  sinks shaped like mediabunny's, so the strip, the canvas frame source,
  the presenter's readers, export frames and stills read it as a video.
  `probeVideo` knows a GIF by its first bytes (its rate is frames ÷ length,
  its transparency exact, no sound, `loopCount`); one of a single frame is
  `still-picture`.
- **Import:** File › Import Video… takes `.gif`; a GIF dropped on the
  canvas or chosen in Import Image… is a clip when animated, a picture
  when still. The clip plays as the file says: forever (or unknown) loops
  to the timeline's end; no count plays once and holds; n repeats plays
  n+1 passes and holds — never past the timeline's end unless one pass
  needs it.
- **Stopping:** Loop off on a GIF turns Hold on (`withClipLoop`); Stop Here
  in the settings card, or Stop Clip at Playhead in the row's menu, ends any
  clip on the playhead's frame and holds what shows there
  (`stoppedVideoClip`), one undo step, its linked sound following. Hold
  shows the picture the clip's last frame shows (`heldVideoTime`), so a
  looped clip cut part way through a pass freezes where it stopped.
- **Open:** a big GIF's import composites every frame to learn its
  transparency (slow for very large ones); the Video section's title says
  "Video" for a GIF; saving a project with any video fails in WebKit
  private windows (its storage refuses the file).

## Step 6 (as built)

Built in the cloud edition's own repositories; their docs have the details.

- **Sync:** a project's video files go to the cloud once each and are kept
  once each, however many versions and projects show them; saves after that
  send the project without them. Opening a project on another device
  fetches each file once and keeps it for offline playing; Keep both keeps
  the videos with the copy.
- **Server renders** (AI apps' pictures, version history) draw a video
  layer from its frame strip, the stills the editor makes on import.
- **AI apps** see video layers, edit them as pictures (place, size, masks,
  colour, effects) and arrange their clips (move, trim, speed, loop, hold,
  stop on a frame, unlink the sound), the linked sound following. They
  can't import a video; they ask the person to.
- **Fonts:** the server draws Inter at every weight the editor ships.

## Step 7 (as built)

- A guide chapter, `docs/help/video-clips.md` (after Sound), with five
  pictures; its shots import `docs/help/shots/media/` (a 4 s MP4 with sound
  and a transparent GIF, made by `make-media.py`).
- Updated chapters: shortcuts, exporting (a table of what each format does
  with video), timeline (`keyframes.md`), troubleshooting (videos that
  won't import, Safari private windows), sound (clip speed and loop, a
  video's linked sound), pictures (GIFs as clips) and presenting.
- Fixed from what the guide's writing found: the still-picture warning
  names PNG Sequence and Sprite Sheet too; the transparency refusal
  suggests Safari as well; Help › Keyboard Shortcuts has a Video clips
  group. Left as it is: Delete on a clicked video clip bar does nothing
  (on the Sound lane it removes the clip).

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
