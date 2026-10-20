/**
 * Tests for seeding the tutorials into the user's projects
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { parseQuarFile } from '@quar/core';
import {
  deleteProject,
  getSetting,
  listProjects,
  loadProject,
  resetDB,
  saveProject,
} from '../services/projectStorage';
import { SEEDED_TUTORIALS_KEY, seedTutorials } from './seedTutorials';
import { TUTORIALS } from './tutorials';
import type { Tutorial } from './tutorials';

describe('seedTutorials', () => {
  beforeEach(() => {
    resetDB();
    indexedDB = new IDBFactory();
  });

  it('adds every tutorial as a project, the first one heading the list', async () => {
    const added = await seedTutorials();

    expect(added).toEqual(TUTORIALS.map((tutorial) => tutorial.id));
    const list = await listProjects();
    expect(list.map((project) => project.id)).toEqual(TUTORIALS.map((tutorial) => tutorial.id));
    expect(list[0]!.name).toBe(TUTORIALS[0]!.name);

    const stored = await loadProject(TUTORIALS[0]!.id);
    const data = parseQuarFile(stored!.data) as { name: string; pages: unknown[] };
    expect(data.name).toBe(TUTORIALS[0]!.name);
    expect(data.pages.length).toBeGreaterThan(1);
  });

  it('adds them once', async () => {
    await seedTutorials();
    expect(await seedTutorials()).toEqual([]);
    expect(await listProjects()).toHaveLength(TUTORIALS.length);
  });

  it('leaves a deleted tutorial deleted', async () => {
    await seedTutorials();
    await deleteProject(TUTORIALS[0]!.id);

    expect(await seedTutorials()).toEqual([]);
    expect((await listProjects()).map((project) => project.id)).not.toContain(TUTORIALS[0]!.id);
  });

  it('adds tutorials shipped later, and remembers both', async () => {
    const [first, ...later] = TUTORIALS as [Tutorial, ...Tutorial[]];
    await seedTutorials([first]);

    expect(await seedTutorials(TUTORIALS)).toEqual(later.map((tutorial) => tutorial.id));
    expect(JSON.parse((await getSetting(SEEDED_TUTORIALS_KEY))!)).toEqual(
      TUTORIALS.map((tutorial) => tutorial.id)
    );
  });

  it('keeps a project that is already there under a tutorial id', async () => {
    const [first] = TUTORIALS as [Tutorial];
    await saveProject(first.id, 'Mine now', '{}');

    await seedTutorials([first]);

    expect((await loadProject(first.id))!.name).toBe('Mine now');
  });

  it('starts over from a garbled record of what was added', async () => {
    const { setSetting } = await import('../services/projectStorage');
    await setSetting(SEEDED_TUTORIALS_KEY, 'not json');

    expect(await seedTutorials()).toHaveLength(TUTORIALS.length);
  });
});
