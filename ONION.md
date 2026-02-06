# Onion Skinning - Manual Testing Guide

## Overview

Onion skinning renders ghost frames before and after the current frame as tinted, semi-transparent overlays. This helps animators visualize motion across frames.

- **Before ghosts**: Red-tinted (`#FF6B6B`) - show where the shape _was_
- **After ghosts**: Teal-tinted (`#4ECDC4`) - show where the shape _will be_
- Ghost frames render **behind** the current frame, so only the non-overlapping edges are visible

## Setup: Create a Test Animation

1. Open the editor (`pnpm dev` then navigate to `localhost:3000/editor`)
2. Select the **Rectangle** tool (press `R`)
3. Draw a **small rectangle** (~60x60px) on the left side of the canvas
4. The tool auto-switches to Selection after drawing

### Add Keyframe at Frame 0

5. Click the rectangle to select it
6. In the Properties panel, note the X position (e.g., X = -200)
7. Press `K` to enable **Auto-Keyframe** mode (the diamond icon in the timeline controls should highlight)
8. Confirm you are at **frame 0** (timecode shows `00:00:00`)
9. The position keyframe is set automatically when auto-keyframe is on

### Add Keyframe at Frame 30

10. Click the timeline ruler at the **frame 30** mark (or click Next Frame `.` button 30 times)
11. In the Properties panel, change the **X position** to something far away (e.g., X = 400)
12. A second keyframe diamond should appear at frame 30 on the timeline track
13. Press `K` again to disable auto-keyframe mode

### Verify Animation Works

14. Press `Home` to go to frame 0 - rectangle should be at the original position
15. Press `End` to go to frame 30 - rectangle should be at the new position
16. Use `,` and `.` keys to step through frames and see the rectangle move

> **Tip**: A small shape with a large position change (600+ pixels) makes ghost frames much more visible, since there's less overlap between ghost and current frame.

## Test 1: Enable Onion Skinning via Keyboard

1. Press `Shift+O`
2. The onion skin button in the timeline controls (bottom-right area) should become active/highlighted
3. Ghost frames should appear on the canvas as colored semi-transparent copies of the rectangle
4. Press `Shift+O` again to toggle off - ghosts disappear
5. Press `Shift+O` once more to re-enable

**Expected**: Pressing plain `O` should activate the **Ellipse tool**, NOT toggle onion skin. Only `Shift+O` toggles onion skin.

## Test 2: Enable via UI Button

1. Click the **onion skin button** in the timeline controls (layered-squares icon, bottom-right)
2. The **OnionSkinPanel** popover should open above the button
3. Check the **Enable** checkbox
4. Ghost frames should appear on the canvas
5. Click the onion skin button again to close the panel

## Test 3: Navigate Frames and Observe Ghosts

With onion skinning enabled:

1. Go to **frame 0** (press `Home`)
   - Only **after** (teal) ghosts should be visible to the right of the rectangle
   - No before ghosts since there are no negative frames
2. Go to **frame 15** (midpoint - click the ruler or step with `.`)
   - **Before** (red) ghosts should appear to the **left** (where the rectangle was)
   - **After** (teal) ghosts should appear to the **right** (where the rectangle will be)
3. Go to **frame 30** (press `End`)
   - Only **before** (red) ghosts should be visible to the left
   - No after ghosts beyond the last keyframe (shape stays in place)
4. Use `Shift+,` and `Shift+.` to jump **10 frames at a time** for quick navigation

**Expected**: Ghost positions update immediately when the frame changes.

## Test 4: OnionSkinPanel Settings

Click the onion skin button to open the settings panel.

### Before/After Frame Count (1-5)

1. Use the **+/-** stepper buttons next to "Before" to change count
2. Increase to **5** - more ghost frames should appear on one side
3. Decrease to **1** - only one ghost frame on each side
4. Do the same for "After" count
5. Set Before to **0** - no red ghosts should render

### Colors

1. Click the **red color swatch** next to Before - a native color picker should open
2. Change the before color to bright green - ghost tint should update immediately
3. Click the **teal color swatch** next to After - change to yellow
4. Reset to defaults (red `#FF6B6B` / teal `#4ECDC4`) if desired

### Opacity (0-100%)

1. Drag the **Opacity** slider to **100%** - ghosts should be fully opaque (solid tinted rectangles)
2. Drag to **50%** - ghosts should be semi-transparent
3. Drag to **0%** - ghosts should be invisible
4. A good default is **50%**

### Falloff (0-100%)

1. Set opacity to **80%** and before/after count to **5**
2. Set **Falloff** to **0%** - all 5 ghost frames should have equal opacity
3. Set Falloff to **50%** - distant ghost frames should be significantly fainter than nearby ones
4. Set Falloff to **100%** - only the nearest ghost frame should be visible; distant ones are fully transparent
5. A good default is **30%**

### Show During Playback

1. Uncheck "Show during playback" (default)
2. Press `Space` to play the animation - ghost frames should **disappear** during playback
3. Press `Space` to stop - ghost frames should **reappear**
4. Check "Show during playback"
5. Press `Space` to play - ghost frames should now **remain visible** during playback
6. Press `Space` to stop

## Test 5: Playback Polish Shortcuts

### 10-Frame Jump

1. Go to frame 0 (`Home`)
2. Press `Shift+.` (Shift + period) - should jump to **frame 10**
3. Press `Shift+.` again - should jump to **frame 20**
4. Press `Shift+,` (Shift + comma) - should jump back to **frame 10**
5. Press `Shift+,` at frame 0 - should stay at **frame 0** (no negative frames)

### Standard Navigation (verify no regressions)

| Shortcut | Action               |
| -------- | -------------------- |
| `Space`  | Play/Pause           |
| `Home`   | Go to frame 0        |
| `End`    | Go to last frame     |
| `,`      | Previous frame       |
| `.`      | Next frame           |
| `L`      | Toggle loop          |
| `K`      | Toggle auto-keyframe |

## Test 6: Tool Shortcut Conflicts

Verify that onion skin shortcuts don't conflict with drawing tools:

1. Press `O` (no Shift) - should activate **Ellipse** tool (check toolbar)
2. Press `V` to go back to Selection tool
3. Press `Shift+O` - should toggle **onion skinning** (NOT activate Ellipse)
4. Press `R` - should activate Rectangle tool
5. Press `Shift+,` - should jump frames (NOT activate any tool)

## Test 7: Different Shape Types

Repeat the basic ghost frame test with different shapes to verify rendering:

1. **Ellipse**: Draw circle, animate position - ghosts should show as tinted circles
2. **Polygon**: Draw hexagon, animate position - ghosts should show as tinted polygons
3. **Path** (Pen tool): Draw a path, animate position - ghosts should show as tinted paths
4. **Multiple shapes**: Select all, verify ghosts render for all animated shapes simultaneously

## Test 8: Edge Cases

1. **No keyframes**: Enable onion skin with no animation - no ghosts should appear (all frames are identical)
2. **Single keyframe**: Add one keyframe only - ghosts should all show the same position
3. **Frame 0 with before count = 5**: Frames -5 to -1 should be skipped, no crash
4. **Very high frame numbers**: Navigate to frame 200+, ghosts should still work for before frames
5. **Rapid scrubbing**: Quickly drag the timeline scrubber back and forth - ghosts should update smoothly without flickering

## Visual Reference

At **frame 15** with a small rectangle animated from X=0 to X=600 over 30 frames:

```
  [red ghost 5]  [red ghost 4]  [red ghost 3] [red ghost 2] [red ghost 1] [CURRENT] [teal ghost 1] [teal ghost 2]  [teal ghost 3]  [teal ghost 4]  [teal ghost 5]
       |              |              |             |             |           |###|         |              |               |               |               |
       |              |              |             |             |         ==|###|==       |              |               |               |               |
       |              |              |             |           ==|==       ##|###|##     ==|==            |               |               |               |
     faint         faint          medium        visible      visible     SOLID       visible         visible          medium           faint           faint
   (with falloff)                                                                                                   (with falloff)
```

- Ghost rectangles overlap significantly - only the **edges** sticking out beyond the current frame are visible
- Closer ghosts are brighter (with falloff > 0%), distant ones are fainter
- Before ghosts have a **red** tint, after ghosts have a **teal** tint

## Troubleshooting

| Symptom                                       | Likely Cause                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| No ghosts visible                             | Onion skin not enabled, or opacity at 0%                                              |
| Ghosts not visible but enabled                | Shape too large relative to per-frame movement; use smaller shape or larger animation |
| Ghosts disappear during playback              | "Show during playback" is unchecked (default behavior)                                |
| `O` key toggles onion skin instead of Ellipse | Bug - should require `Shift+O`                                                        |
| Ghost colors look wrong                       | Check before/after color settings in the panel                                        |
| Ghosts only on one side                       | Check before/after count - one may be set to 0                                        |
