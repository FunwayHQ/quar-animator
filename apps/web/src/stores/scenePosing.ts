/**
 * Scene Posing
 * Changes to the scene that only show the animation — playback and scrubbing
 * applying keyframes, IK and physics posing bones — aren't edits, so they
 * don't mark the project as having unsaved changes.
 */

let depth = 0;

/** Run `pose`, its scene changes counting as showing the animation, not editing. */
export function poseScene<T>(pose: () => T): T {
  depth++;
  try {
    return pose();
  } finally {
    depth--;
  }
}

/** Whether the scene is being posed right now (see poseScene). */
export function isPosingScene(): boolean {
  return depth > 0;
}
