/**
 * Tests for Project Storage Service (IndexedDB)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  initDB,
  resetDB,
  saveProject,
  loadProject,
  listProjects,
  deleteProject,
  getLastProjectId,
  setLastProjectId,
} from './projectStorage';

describe('ProjectStorage', () => {
  beforeEach(() => {
    resetDB();
    // Clear the fake-indexeddb databases
    indexedDB = new IDBFactory();
  });

  describe('initDB', () => {
    it('should initialize the database', async () => {
      const db = await initDB();
      expect(db).toBeDefined();
      expect(db.name).toBe('quar-animator-db');
    });

    it('should return the same database on subsequent calls', async () => {
      const db1 = await initDB();
      const db2 = await initDB();
      expect(db1).toBe(db2);
    });
  });

  describe('saveProject / loadProject', () => {
    it('should save and load a project', async () => {
      await saveProject('proj1', 'My Project', '{"version":"1.0"}');
      const result = await loadProject('proj1');
      expect(result).toBeDefined();
      expect(result!.id).toBe('proj1');
      expect(result!.name).toBe('My Project');
      expect(result!.data).toBe('{"version":"1.0"}');
      expect(result!.updatedAt).toBeDefined();
    });

    it('should overwrite existing project on save', async () => {
      await saveProject('proj1', 'Original', '{"v":1}');
      await saveProject('proj1', 'Updated', '{"v":2}');
      const result = await loadProject('proj1');
      expect(result!.name).toBe('Updated');
      expect(result!.data).toBe('{"v":2}');
    });

    it('should return undefined for non-existent project', async () => {
      await initDB();
      const result = await loadProject('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('listProjects', () => {
    it('should list all projects sorted by updatedAt', async () => {
      await saveProject('proj1', 'First', '{}');
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      await saveProject('proj2', 'Second', '{}');

      const projects = await listProjects();
      expect(projects).toHaveLength(2);
      // Most recent first
      expect(projects[0]!.id).toBe('proj2');
      expect(projects[1]!.id).toBe('proj1');
    });

    it('should return empty array when no projects', async () => {
      await initDB();
      const projects = await listProjects();
      expect(projects).toEqual([]);
    });

    it('should not include data in list items', async () => {
      await saveProject('proj1', 'Test', '{"large":"data"}');
      const projects = await listProjects();
      expect(projects[0]).toHaveProperty('id');
      expect(projects[0]).toHaveProperty('name');
      expect(projects[0]).toHaveProperty('updatedAt');
      expect(projects[0]).not.toHaveProperty('data');
    });
  });

  describe('deleteProject', () => {
    it('should delete a project', async () => {
      await saveProject('proj1', 'Test', '{}');
      await deleteProject('proj1');
      const result = await loadProject('proj1');
      expect(result).toBeUndefined();
    });

    it('should not fail when deleting non-existent project', async () => {
      await initDB();
      await expect(deleteProject('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('settings (last project ID)', () => {
    it('should save and retrieve last project ID', async () => {
      await setLastProjectId('proj1');
      const id = await getLastProjectId();
      expect(id).toBe('proj1');
    });

    it('should return undefined when no last project set', async () => {
      await initDB();
      const id = await getLastProjectId();
      expect(id).toBeUndefined();
    });

    it('should overwrite last project ID', async () => {
      await setLastProjectId('proj1');
      await setLastProjectId('proj2');
      const id = await getLastProjectId();
      expect(id).toBe('proj2');
    });
  });
});
