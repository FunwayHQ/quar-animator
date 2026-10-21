/**
 * Tests for routing Delete/Backspace on the canvas
 */

import { describe, it, expect } from 'vitest';
import { deleteKeyTarget } from './deleteKeyTarget';

const idle = { penDrawing: false, directSelectionActive: false, directSelectionPointCount: 0 };

describe('deleteKeyTarget', () => {
  it('deletes the selected layers by default', () => {
    expect(deleteKeyTarget(idle)).toBe('selection');
  });

  it('lets the Pen take back its last point while a path is being drawn', () => {
    // The path drawn before stays selected, and mustn't be what goes
    expect(deleteKeyTarget({ ...idle, penDrawing: true })).toBe('tool');
  });

  it('lets Direct Selection delete its picked points', () => {
    expect(
      deleteKeyTarget({ ...idle, directSelectionActive: true, directSelectionPointCount: 2 })
    ).toBe('tool');
  });

  it('deletes the layer when Direct Selection has no points picked', () => {
    expect(deleteKeyTarget({ ...idle, directSelectionActive: true })).toBe('selection');
  });
});
