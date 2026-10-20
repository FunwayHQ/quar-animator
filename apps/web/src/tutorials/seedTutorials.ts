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
 * Save the tutorials this browser hasn't been given yet. The first one in
 * the list is saved last, so it heads the Projects page. Returns the ids of
 * the projects added.
 */
export async function seedTutorials(tutorials: Tutorial[] = TUTORIALS): Promise<string[]> {
  const seeded = parseIds(await getSetting(SEEDED_TUTORIALS_KEY));
  const pending = tutorials.filter((tutorial) => !seeded.includes(tutorial.id));
  if (pending.length === 0) return [];

  const added: string[] = [];
  for (const tutorial of [...pending].reverse()) {
    // A project already there (another tab seeding at once) is left as it is
    if (await loadProject(tutorial.id)) continue;
    const data = tutorial.build(new Date().toISOString());
    await saveProject(
      tutorial.id,
      tutorial.name,
      writeQuarFile(data as unknown as Record<string, unknown>)
    );
    added.push(tutorial.id);
  }
  await setSetting(
    SEEDED_TUTORIALS_KEY,
    JSON.stringify([...seeded, ...pending.map((tutorial) => tutorial.id)])
  );
  return added.reverse();
}
