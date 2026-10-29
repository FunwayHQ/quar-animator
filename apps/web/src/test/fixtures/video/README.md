Small videos for the video-clip tests (made with ffmpeg 8.1, a few KB each):

| File                  | What                                                         | Made with                                        |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------ |
| `clip-h264-aac.mp4`   | 2 s, 160×90, 30 fps, H.264 + AAC 440 Hz                      | `testsrc2` + `sine`, `-profile:v baseline -g 15` |
| `clip-h264-aac.mov`   | the same in a QuickTime file, 660 Hz                         | as above, `.mov`                                 |
| `clip-no-audio.mp4`   | 2 s H.264, no sound                                          | as above, no `sine`                              |
| `clip-vp9-opus.webm`  | 2 s VP9 + Opus                                               | `libvpx-vp9`, `libopus`                          |
| `clip-vp9-alpha.webm` | 1 s VP9 with alpha: half-transparent red, an opaque blue box | `yuva420p`, `-auto-alt-ref 0`                    |
| `not-a-video.mp4`     | 4 KB of random bytes                                         | `/dev/urandom`                                   |

`testsrc2` draws a frame counter, so a decoded frame shows which one it is.
