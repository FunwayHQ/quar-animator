/**
 * Bin Packing for Sprite Sheet Layout
 *
 * Pure math functions for packing frames into a rectangular atlas.
 * Two strategies: simple grid and MaxRects (best-short-side-fit).
 */

// ============================================================================
// Types
// ============================================================================

export interface PackedRect {
  frameIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
}

export interface PackResult {
  rects: PackedRect[];
  atlasWidth: number;
  atlasHeight: number;
}

// ============================================================================
// Utility
// ============================================================================

/**
 * Returns the smallest power of two >= n.
 */
export function nextPowerOfTwo(n: number): number {
  if (n <= 0) return 1;
  n = Math.ceil(n);
  n--;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  return n + 1;
}

// ============================================================================
// Grid Packing
// ============================================================================

/**
 * Pack frames in a simple uniform grid layout.
 *
 * @param frameCount - Number of frames to pack
 * @param frameW - Width of each frame
 * @param frameH - Height of each frame
 * @param columns - Number of columns (auto-computed if omitted)
 * @param padding - Padding between frames (default 0)
 */
export function packGrid(
  frameCount: number,
  frameW: number,
  frameH: number,
  columns?: number,
  padding: number = 0
): PackResult {
  if (frameCount <= 0 || frameW <= 0 || frameH <= 0) {
    return { rects: [], atlasWidth: 0, atlasHeight: 0 };
  }

  const cols = columns ?? Math.ceil(Math.sqrt(frameCount));
  const rows = Math.ceil(frameCount / cols);
  const cellW = frameW + padding;
  const cellH = frameH + padding;

  const rects: PackedRect[] = [];
  for (let i = 0; i < frameCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    rects.push({
      frameIndex: i,
      x: col * cellW,
      y: row * cellH,
      width: frameW,
      height: frameH,
      rotated: false,
    });
  }

  const atlasWidth = cols * cellW - padding;
  const atlasHeight = rows * cellH - padding;

  return { rects, atlasWidth, atlasHeight };
}

// ============================================================================
// MaxRects Bin Packing (Best Short Side Fit)
// ============================================================================

interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pack variable-size frames using MaxRects Best Short Side Fit heuristic.
 *
 * @param frames - Array of { width, height } for each frame
 * @param maxW - Maximum atlas width
 * @param maxH - Maximum atlas height
 * @param padding - Padding between frames (default 0)
 * @param allowRotation - Allow 90-degree rotation to fit (default false)
 */
export function packMaxRects(
  frames: Array<{ width: number; height: number }>,
  maxW: number,
  maxH: number,
  padding: number = 0,
  allowRotation: boolean = false
): PackResult {
  if (frames.length === 0) {
    return { rects: [], atlasWidth: 0, atlasHeight: 0 };
  }

  const freeRects: FreeRect[] = [{ x: 0, y: 0, width: maxW, height: maxH }];
  const rects: PackedRect[] = [];
  let usedW = 0;
  let usedH = 0;

  // Sort frames by area descending for better packing
  const indices = frames.map((_, i) => i);
  indices.sort((a, b) => {
    const areaA = (frames[a].width + padding) * (frames[a].height + padding);
    const areaB = (frames[b].width + padding) * (frames[b].height + padding);
    return areaB - areaA;
  });

  for (const frameIdx of indices) {
    const fw = frames[frameIdx].width + padding;
    const fh = frames[frameIdx].height + padding;

    const placement = findBestShortSideFit(freeRects, fw, fh, allowRotation);
    if (!placement) {
      // Frame doesn't fit — still include it with -1 position to indicate failure
      rects.push({
        frameIndex: frameIdx,
        x: -1,
        y: -1,
        width: frames[frameIdx].width,
        height: frames[frameIdx].height,
        rotated: false,
      });
      continue;
    }

    const { rectIdx, rotated } = placement;
    const freeRect = freeRects[rectIdx];
    const placedW = rotated ? fh : fw;
    const placedH = rotated ? fw : fh;

    rects.push({
      frameIndex: frameIdx,
      x: freeRect.x,
      y: freeRect.y,
      width: rotated ? frames[frameIdx].height : frames[frameIdx].width,
      height: rotated ? frames[frameIdx].width : frames[frameIdx].height,
      rotated,
    });

    usedW = Math.max(usedW, freeRect.x + placedW - padding);
    usedH = Math.max(usedH, freeRect.y + placedH - padding);

    // Split free rectangles
    splitFreeRects(freeRects, freeRect.x, freeRect.y, placedW, placedH);
    pruneFreeRects(freeRects);
  }

  // Sort results back to original frame order
  rects.sort((a, b) => a.frameIndex - b.frameIndex);

  return { rects, atlasWidth: usedW, atlasHeight: usedH };
}

function findBestShortSideFit(
  freeRects: FreeRect[],
  fw: number,
  fh: number,
  allowRotation: boolean
): { rectIdx: number; rotated: boolean } | null {
  let bestShortSide = Infinity;
  let bestLongSide = Infinity;
  let bestIdx = -1;
  let bestRotated = false;

  for (let i = 0; i < freeRects.length; i++) {
    const r = freeRects[i];

    // Try normal orientation
    if (fw <= r.width && fh <= r.height) {
      const shortSide = Math.min(r.width - fw, r.height - fh);
      const longSide = Math.max(r.width - fw, r.height - fh);
      if (shortSide < bestShortSide || (shortSide === bestShortSide && longSide < bestLongSide)) {
        bestShortSide = shortSide;
        bestLongSide = longSide;
        bestIdx = i;
        bestRotated = false;
      }
    }

    // Try rotated orientation
    if (allowRotation && fh <= r.width && fw <= r.height) {
      const shortSide = Math.min(r.width - fh, r.height - fw);
      const longSide = Math.max(r.width - fh, r.height - fw);
      if (shortSide < bestShortSide || (shortSide === bestShortSide && longSide < bestLongSide)) {
        bestShortSide = shortSide;
        bestLongSide = longSide;
        bestIdx = i;
        bestRotated = true;
      }
    }
  }

  return bestIdx >= 0 ? { rectIdx: bestIdx, rotated: bestRotated } : null;
}

function splitFreeRects(
  freeRects: FreeRect[],
  px: number,
  py: number,
  pw: number,
  ph: number
): void {
  const toAdd: FreeRect[] = [];

  for (let i = freeRects.length - 1; i >= 0; i--) {
    const r = freeRects[i];

    // Check overlap
    if (px >= r.x + r.width || px + pw <= r.x || py >= r.y + r.height || py + ph <= r.y) {
      continue; // No overlap
    }

    // Split into up to 4 sub-rectangles
    // Left strip
    if (px > r.x) {
      toAdd.push({ x: r.x, y: r.y, width: px - r.x, height: r.height });
    }
    // Right strip
    if (px + pw < r.x + r.width) {
      toAdd.push({ x: px + pw, y: r.y, width: r.x + r.width - (px + pw), height: r.height });
    }
    // Top strip
    if (py > r.y) {
      toAdd.push({ x: r.x, y: r.y, width: r.width, height: py - r.y });
    }
    // Bottom strip
    if (py + ph < r.y + r.height) {
      toAdd.push({ x: r.x, y: py + ph, width: r.width, height: r.y + r.height - (py + ph) });
    }

    // Remove the split rect
    freeRects.splice(i, 1);
  }

  freeRects.push(...toAdd);
}

function pruneFreeRects(freeRects: FreeRect[]): void {
  for (let i = freeRects.length - 1; i >= 0; i--) {
    for (let j = freeRects.length - 1; j >= 0; j--) {
      if (i === j) continue;
      const a = freeRects[i];
      const b = freeRects[j];
      // If a is fully contained in b, remove a
      if (
        a.x >= b.x &&
        a.y >= b.y &&
        a.x + a.width <= b.x + b.width &&
        a.y + a.height <= b.y + b.height
      ) {
        freeRects.splice(i, 1);
        break;
      }
    }
  }
}
