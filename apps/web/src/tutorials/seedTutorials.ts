/**
 * Tutorial Seeding for Quar Animator
 * Adds the tutorials to the user's projects, once each: they're ordinary
 * projects from then on, and a deleted one doesn't come back.
 */

import { writeQuarFile } from '@quar/core';
import { getSetting, loadProject, saveProject, setSetting } from '../services/projectStorage';
import { TUTORIALS } from './tutorials';
import type { Tutorial } from './tutorials';

/** Settings key listing the tutorials already given (JSON array of ids). */
export const SEEDED_TUTORIALS_KEY = 'seededTutorials';

function parseIds(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const ids: unknown = JSON.parse(value);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Save a fresh copy of each of these tutorials that isn't among the projects
 * (one already there — edited, or just added by another tab — is left as it
 * is). The first is saved last, so it heads the Projects page. Returns the
 * tutorials saved, in catalog order.
 */
async function addMissing(tutorials: Tutorial[]): Promise<Tutorial[]> {
  const added: Tutorial[] = [];
  for (const tutorial of [...tutorials].reverse()) {
    if (await loadProject(tutorial.id)) continue;
    const data = tutorial.build(new Date().toISOString());
    await saveProject(
      tutorial.id,
      tutorial.name,
      writeQuarFile(data as unknown as Record<string, unknown>)
    );
    added.unshift(tutorial);
  }
  return added;
}

/** Remember these tutorials as given, so seeding doesn't add them again. */
async function markSeeded(seeded: string[], tutorials: Tutorial[]): Promise<void> {
  const ids = new Set([...seeded, ...tutorials.map((tutorial) => tutorial.id)]);
  await setSetting(SEEDED_TUTORIALS_KEY, JSON.stringify([...ids]));
}

/**
 * Save the tutorials this browser hasn't been given yet. Returns the ids of
 * the projects added.
 */
export async function seedTutorials(tutorials: Tutorial[] = TUTORIALS): Promise<string[]> {
  const seeded = parseIds(await getSetting(SEEDED_TUTORIALS_KEY));
  const pending = tutorials.filter((tutorial) => !seeded.includes(tutorial.id));
  if (pending.length === 0) return [];

  const added = await addMissing(pending);
  await markSeeded(seeded, pending);
  return added.map((tutorial) => tutorial.id);
}

/**
 * Bring back the tutorials missing from the user's projects (Help > Restore
 * Tutorials). Ones still there are left alone, edits and all. Returns the
 * tutorials added, in catalog order.
 */
export async function restoreTutorials(tutorials: Tutorial[] = TUTORIALS): Promise<Tutorial[]> {
  const restored = await addMissing(tutorials);
  await markSeeded(parseIds(await getSetting(SEEDED_TUTORIALS_KEY)), tutorials);
  return restored;
}
