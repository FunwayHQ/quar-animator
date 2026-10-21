/**
 * Moving a layer into or out of a group without it jumping.
 *
 * A node's transform is relative to its parent, so moving it to a parent with
 * a different transform (a group offset by an imported SVG's viewBox, say)
 * would move it on screen. These helpers re-express the transform — and its
 * keyframes, and an Animation Sequence rest pose — in the new parent's space,
 * so the node stays where it is at the current frame.
 */

import { mat3 } from '@quar/core';
import { evaluateTrack } from '@quar/animation';
import type { Matrix3, Node, Timeline, Transform } from '@quar/types';

/** Track properties that make up a node's placement. */
export const PLACEMENT_PROPERTIES = [
  'transform.position.x',
  'transform.position.y',
  'transform.rotation',
  'transform.scale.x',
  'transform.scale.y',
] as const;

type PlacementProperty = (typeof PLACEMENT_PROPERTIES)[number];
export type Placement = Record<PlacementProperty, number>;

const EPSILON = 1e-9;
const DEGREES = 180 / Math.PI;

interface ParentLike {
  getNode(id: string): Node | undefined;
  getWorldTransform(id: string): Matrix3;
}

/**
 * The matrix taking coordinates in the node's current parent space to the new
 * parent's space, or null when the two spaces are the same (or the new parent
 * is degenerate, e.g. scaled to zero).
 */
export function reparentMatrix(
  sceneGraph: ParentLike,
  nodeId: string,
  newParentId: string | null
): Matrix3 | null {
  const oldParentId = sceneGraph.getNode(nodeId)?.parent ?? null;
  if (oldParentId === newParentId) return null;
  const from = oldParentId ? sceneGraph.getWorldTransform(oldParentId) : mat3.identity();
  const to = newParentId ? sceneGraph.getWorldTransform(newParentId) : mat3.identity();
  const toInverse = mat3.invert(to);
  if (!toInverse) return null;
  const m = mat3.multiply(toInverse, from);
  const identity =
    Math.abs(m.a - 1) < EPSILON &&
    Math.abs(m.b) < EPSILON &&
    Math.abs(m.c) < EPSILON &&
    Math.abs(m.d - 1) < EPSILON &&
    Math.abs(m.tx) < EPSILON &&
    Math.abs(m.ty) < EPSILON;
  return identity ? null : m;
}

/** m × a 6-element matrix [a, b, c, d, tx, ty] (e.g. a binding's meshBindLocal). */
export function multiply6(m: Matrix3, matrix: number[]): number[] {
  const [a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0] = matrix;
  const r = mat3.multiply(m, { a, b, c, d, tx, ty });
  return [r.a, r.b, r.c, r.d, r.tx, r.ty];
}

export function placementOf(transform: Transform): Placement {
  return {
    'transform.position.x': transform.position.x,
    'transform.position.y': transform.position.y,
    'transform.rotation': transform.rotation,
    'transform.scale.x': transform.scale.x,
    'transform.scale.y': transform.scale.y,
  };
}

/** The angle (degrees) nearest `near` that is `angle` plus whole turns. */
function unwrap(angle: number, near: number): number {
  return angle + 360 * Math.round((near - angle) / 360);
}

/**
 * A placement re-expressed `m` away. Exact when `m` only moves, rotates,
 * scales uniformly or mirrors (rotation and scale stay in the same terms, so
 * spins and flips keep animating the same way). Otherwise — a parent scaled
 * unevenly around a rotated child — the result would need skew, which
 * transforms don't render, so the nearest skew-free placement is used.
 */
export function mapPlacement(placement: Placement, m: Matrix3): Placement {
  const x = placement['transform.position.x'];
  const y = placement['transform.position.y'];
  const rotation = placement['transform.rotation'];
  const scaleX = placement['transform.scale.x'];
  const scaleY = placement['transform.scale.y'];
  const position = mat3.transformPoint(m, { x, y });
  const result = (r: number, sx: number, sy: number): Placement => ({
    'transform.position.x': position.x,
    'transform.position.y': position.y,
    'transform.rotation': r,
    'transform.scale.x': sx,
    'transform.scale.y': sy,
  });

  const { a, b, c, d } = m;
  const k = Math.hypot(a, b);
  const tolerance = 1e-6 * Math.max(1, k);
  // Rotation θ and uniform scale k: [[k cos, -k sin], [k sin, k cos]]
  if (Math.abs(a - d) < tolerance && Math.abs(b + c) < tolerance) {
    return result(rotation + Math.atan2(b, a) * DEGREES, scaleX * k, scaleY * k);
  }
  // The same, mirrored: R(θ)·S(-k, k) — the child's rotation runs backwards
  if (Math.abs(a + d) < tolerance && Math.abs(b - c) < tolerance) {
    return result(Math.atan2(-b, -a) * DEGREES - rotation, -scaleX * k, scaleY * k);
  }

  // General: decompose m · R(rotation) · S(scale) without skew
  const own = mat3.compose({ x: 0, y: 0 }, rotation, { x: scaleX, y: scaleY });
  const combined = mat3.multiply({ ...m, tx: 0, ty: 0 }, own);
  const sx = Math.hypot(combined.a, combined.b);
  if (sx < EPSILON) return result(rotation, scaleX, scaleY);
  const det = combined.a * combined.d - combined.b * combined.c;
  const r = Math.atan2(combined.b, combined.a) * DEGREES;
  return result(unwrap(r, rotation + Math.atan2(b, a) * DEGREES), sx, det / sx);
}

export function applyPlacement(transform: Transform, placement: Placement): Transform {
  return {
    ...transform,
    position: { x: placement['transform.position.x'], y: placement['transform.position.y'] },
    rotation: placement['transform.rotation'],
    scale: { x: placement['transform.scale.x'], y: placement['transform.scale.y'] },
  };
}

/**
 * The timeline with the node's placement keyframes re-expressed `m` away.
 * Each keyframe is converted with the rest of the placement at its time
 * (other tracks evaluated there, untracked properties from `base`), so moved,
 * spinning or scaling animations keep their shape in the new space.
 */
export function reparentTimeline(
  timeline: Timeline,
  nodeId: string,
  base: Placement,
  m: Matrix3
): Timeline {
  return remapPlacementTimeline(timeline, nodeId, base, (placement) => mapPlacement(placement, m));
}

/**
 * The timeline with the node's placement keyframes passed through `map`,
 * each with the rest of the placement at its time (see reparentTimeline).
 */
export function remapPlacementTimeline(
  timeline: Timeline,
  nodeId: string,
  base: Placement,
  map: (placement: Placement) => Placement
): Timeline {
  const tracks = new Map(
    timeline.tracks
      .filter(
        (track) =>
          track.nodeId === nodeId &&
          (PLACEMENT_PROPERTIES as readonly string[]).includes(track.property)
      )
      .map((track) => [track.property as PlacementProperty, track])
  );
  if (tracks.size === 0) return timeline;

  const placementAt = (time: number): Placement => {
    const placement = { ...base };
    for (const [property, track] of tracks) {
      const value = evaluateTrack(track, time);
      if (typeof value === 'number') placement[property] = value;
    }
    return placement;
  };

  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => {
      if (track.nodeId !== nodeId || !tracks.has(track.property as PlacementProperty)) {
        return track;
      }
      const property = track.property as PlacementProperty;
      return {
        ...track,
        keyframes: track.keyframes.map((keyframe) =>
          typeof keyframe.value === 'number'
            ? { ...keyframe, value: map(placementAt(keyframe.time))[property] }
            : keyframe
        ),
      };
    }),
  };
}

/** An Animation Sequence rest pose (property → value) re-expressed `m` away. */
export function reparentRestPose(
  pose: Record<string, number>,
  base: Placement,
  m: Matrix3
): Record<string, number> {
  return remapRestPose(pose, base, (placement) => mapPlacement(placement, m));
}

/** An Animation Sequence rest pose (property → value) passed through `map`. */
export function remapRestPose(
  pose: Record<string, number>,
  base: Placement,
  map: (placement: Placement) => Placement
): Record<string, number> {
  const placement = { ...base };
  for (const property of PLACEMENT_PROPERTIES) {
    if (pose[property] !== undefined) placement[property] = pose[property];
  }
  const mapped = map(placement);
  const next = { ...pose };
  for (const property of PLACEMENT_PROPERTIES) {
    if (next[property] !== undefined) next[property] = mapped[property];
  }
  return next;
}
