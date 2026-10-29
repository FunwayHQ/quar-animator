/**
 * Brush Profiles
 * How a brush stroke's width changes from one end to the other. The built-in
 * profiles come with the editor; those made with Create Profile from
 * Selection are the document's own. A stroke names its profile by id and
 * reads it again whenever its Width or Profile is set, so the document's
 * profiles are saved in its file, as its symbols and sounds are.
 */

import type { BrushProfile } from '@quar/types';

export const BUILT_IN_BRUSH_PROFILES: readonly BrushProfile[] = [
  { id: 'uniform', name: 'Uniform', samples: [1, 1] },
  { id: 'taper-out', name: 'Taper Out', samples: [1, 1, 0.8, 0.5, 0.2, 0] },
  { id: 'taper-in', name: 'Taper In', samples: [0, 0.2, 0.5, 0.8, 1, 1] },
  { id: 'taper-both', name: 'Taper Both', samples: [0, 0.3, 0.8, 1, 1, 0.8, 0.3, 0] },
  { id: 'bulge', name: 'Bulge', samples: [0.3, 0.7, 1, 1, 0.7, 0.3] },
  { id: 'calligraphic', name: 'Calligraphic', samples: [0.2, 0.8, 1, 0.6, 0.3] },
];

const BUILT_IN_IDS = new Set(BUILT_IN_BRUSH_PROFILES.map((profile) => profile.id));

const copy = (profile: BrushProfile): BrushProfile => ({
  ...profile,
  samples: [...profile.samples],
});

/** The profiles of a list that are the document's own (copies), in order. */
export function customBrushProfiles(profiles: readonly BrushProfile[]): BrushProfile[] {
  return profiles.filter((profile) => !BUILT_IN_IDS.has(profile.id)).map(copy);
}

/** Every profile a document has: the built-in ones, then its own. */
export function withBuiltInProfiles(custom: readonly BrushProfile[]): BrushProfile[] {
  return [...BUILT_IN_BRUSH_PROFILES.map(copy), ...custom.map(copy)];
}

/**
 * The document's own profiles as a file holds them. One a hand-edited or
 * tool-made file got wrong (no id or name, fewer than two widths, widths
 * that aren't numbers) is left out, as is a second one with the same id or
 * one that would stand in for a built-in profile; widths are kept to 0–1.
 */
export function readBrushProfiles(value: unknown): BrushProfile[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>(BUILT_IN_IDS);
  const profiles: BrushProfile[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, name, samples } = item as Partial<Record<keyof BrushProfile, unknown>>;
    if (typeof id !== 'string' || !id || seen.has(id) || typeof name !== 'string') continue;
    if (!Array.isArray(samples) || samples.length < 2) continue;
    if (!samples.every((sample) => typeof sample === 'number' && !Number.isNaN(sample))) continue;
    seen.add(id);
    profiles.push({
      id,
      name,
      samples: (samples as number[]).map((sample) => Math.min(1, Math.max(0, sample))),
    });
  }
  return profiles;
}
