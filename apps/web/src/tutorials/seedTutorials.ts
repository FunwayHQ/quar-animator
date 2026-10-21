/**
 * Tutorial Seeding for Quar Animator
 * Adds the tutorials to the user's projects, once each: they're ordinary
 * projects from then on, and a deleted one doesn't come back. When a
 * tutorial's content changes (its version goes up), a copy seeded earlier
 * that was never edited is replaced with the new one.
 */

import { parseQuarFile, writeQuarFile } from '@quar/core';
import { getSetting, loadProject, saveProject, setSetting } from '../services/projectStorage';
import { TUTORIALS } from './tutorials';
import type { Tutorial } from './tutorials';

/** Settings key recording the tutorials given: JSON { id: version } (once a list of ids). */
export const SEEDED_TUTORIALS_KEY = 'seededTutorials';

type Seeded = Record<string, number>;

function parseSeeded(value: string | undefined): Seeded {
  if (!value) return {};
  try {
    const data: unknown = JSON.parse(value);
    // The first record listed ids only: those were version 1
    if (Array.isArray(data)) {
      return Object.fromEntries(
        data.filter((id): id is string => typeof id === 'string').map((id) => [id, 1])
      );
    }
    if (typeof data !== 'object' || data === null) return {};
    return Object.fromEntries(
      Object.entries(data).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number'
      )
    );
  } catch {
    return {};
  }
}

const versionOf = (tutorial: Tutorial) => tutorial.version ?? 1;

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

/** Remember these tutorials as given (at their version), so seeding doesn't add them again. */
async function markSeeded(seeded: Seeded, tutorials: Tutorial[]): Promise<void> {
  const next = { ...seeded };
  for (const tutorial of tutorials) next[tutorial.id] = versionOf(tutorial);
  await setSetting(SEEDED_TUTORIALS_KEY, JSON.stringify(next));
}

/**
 * A copy seeded from an older version, if it was never edited, replaced
 * with this one: tutorials are saved with updatedAt = createdAt, and the
 * app's saves move updatedAt on. A deleted or edited copy is left as it is.
 * Returns whether it was replaced.
 */
async function refreshIfUntouched(tutorial: Tutorial): Promise<boolean> {
  const stored = await loadProject(tutorial.id);
  if (!stored) return false;
  let untouched = false;
  try {
    const data = parseQuarFile(stored.data) as { createdAt?: string; updatedAt?: string };
    untouched = !!data.createdAt && data.updatedAt === data.createdAt;
  } catch {
    return false;
  }
  if (!untouched) return false;
  const data = tutorial.build(new Date().toISOString());
  await saveProject(
    tutorial.id,
    tutorial.name,
    writeQuarFile(data as unknown as Record<string, unknown>)
  );
  return true;
}

/**
 * Save the tutorials this browser hasn't been given yet. Returns the ids of
 * the projects added.
 */
export async function seedTutorials(tutorials: Tutorial[] = TUTORIALS): Promise<string[]> {
  const seeded = parseSeeded(await getSetting(SEEDED_TUTORIALS_KEY));
  const pending = tutorials.filter((tutorial) => seeded[tutorial.id] === undefined);
  // Given before, at an older version: brought up to date if never edited
  const outdated = tutorials.filter(
    (tutorial) => seeded[tutorial.id] !== undefined && seeded[tutorial.id]! < versionOf(tutorial)
  );
  if (pending.length === 0 && outdated.length === 0) return [];

  for (const tutorial of outdated) await refreshIfUntouched(tutorial);
  const added = pending.length > 0 ? await addMissing(pending) : [];
  await markSeeded(seeded, [...pending, ...outdated]);
  return added.map((tutorial) => tutorial.id);
}

/**
 * Bring back the tutorials missing from the user's projects (Help > Restore
 * Tutorials). Ones still there are left alone, edits and all. Returns the
 * tutorials added, in catalog order.
 */
export async function restoreTutorials(tutorials: Tutorial[] = TUTORIALS): Promise<Tutorial[]> {
  const restored = await addMissing(tutorials);
  await markSeeded(parseSeeded(await getSetting(SEEDED_TUTORIALS_KEY)), tutorials);
  return restored;
}
