import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  anchorCaret,
  attachIntegerFirstEditing,
  getNumberSegments,
  handleNumberSegmentKey,
  keepSelectionThroughReformat,
  resolveCaret,
} from './numericFieldEditing';

function key(
  k: string,
  mods: Partial<Record<'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey', boolean>> = {}
) {
  return {
    key: k,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...mods,
    preventDefault: vi.fn(),
  };
}

describe('getNumberSegments', () => {
  it('splits a formatted number into integer and fraction', () => {
    expect(getNumberSegments('100.0')).toEqual({
      intStart: 0,
      intEnd: 3,
      fraction: { start: 4, end: 5 },
    });
  });

  it('keeps the sign with the integer part and stops at suffixes', () => {
    expect(getNumberSegments('-12.5°')).toEqual({
      intStart: 0,
      intEnd: 3,
      fraction: { start: 4, end: 5 },
    });
  });

  it('accepts a comma as the decimal separator', () => {
    expect(getNumberSegments('7,25').fraction).toEqual({ start: 2, end: 4 });
  });

  it('has no fraction without a separator', () => {
    expect(getNumberSegments('45')).toEqual({ intStart: 0, intEnd: 2, fraction: null });
  });
});

describe('caret anchoring', () => {
  it('keeps the caret before the separator when "5" is reformatted to "5.0"', () => {
    expect(resolveCaret('5.0', anchorCaret('5', 1))).toBe(1);
  });

  it('keeps the caret inside the integer part when digits are added', () => {
    // "1|00.0" typed "2" → "12|00.0"
    expect(resolveCaret('1200.0', anchorCaret('1200.0', 2))).toBe(2);
  });

  it('keeps the caret in the decimals when editing them', () => {
    // "100.|0" typed "5" → "100.50", formatted to "100.5"
    expect(resolveCaret('100.5', anchorCaret('100.50', 5))).toBe(5);
  });

  it('clamps to the start of the integer part', () => {
    expect(resolveCaret('5.0', { part: 'integer', fromSeparator: 4 })).toBe(0);
  });
});

describe('handleNumberSegmentKey', () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    input = document.createElement('input');
    input.type = 'text';
    input.value = '100.0';
    document.body.appendChild(input);
    input.focus();
  });

  afterEach(() => input.remove());

  it('moves from the end of the integer part to the decimals with →', () => {
    input.setSelectionRange(0, 3);
    const e = key('ArrowRight');
    expect(handleNumberSegmentKey(e, input)).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect([input.selectionStart, input.selectionEnd]).toEqual([4, 5]);
  });

  it('leaves → alone inside the integer part', () => {
    input.setSelectionRange(1, 1);
    expect(handleNumberSegmentKey(key('ArrowRight'), input)).toBe(false);
  });

  it('goes back to the integer part with ← from anywhere in the decimals', () => {
    for (const [start, end] of [
      [4, 5],
      [5, 5],
    ] as const) {
      input.setSelectionRange(start, end);
      expect(handleNumberSegmentKey(key('ArrowLeft'), input)).toBe(true);
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3]);
    }
  });

  it('leaves ← alone inside the integer part', () => {
    input.setSelectionRange(2, 2);
    expect(handleNumberSegmentKey(key('ArrowLeft'), input)).toBe(false);
  });

  it('jumps to the decimals when "." or "," is typed in the integer part', () => {
    for (const separator of ['.', ',']) {
      input.setSelectionRange(2, 2);
      expect(handleNumberSegmentKey(key(separator), input)).toBe(true);
      expect([input.selectionStart, input.selectionEnd]).toEqual([4, 5]);
    }
  });

  it('ignores modified keys so text selection shortcuts still work', () => {
    input.setSelectionRange(0, 3);
    expect(handleNumberSegmentKey(key('ArrowRight', { shiftKey: true }), input)).toBe(false);
  });
});

describe('attachIntegerFirstEditing', () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    vi.useFakeTimers();
    input = document.createElement('input');
    input.type = 'text';
    input.value = '250.5';
    document.body.appendChild(input);
    attachIntegerFirstEditing(input);
  });

  afterEach(() => {
    input.remove();
    vi.useRealTimers();
  });

  it('selects the integer part on focus, and again after a focusing click', () => {
    input.focus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3]);

    input.setSelectionRange(5, 5); // the click put the caret at the end
    input.dispatchEvent(new MouseEvent('mouseup'));
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3]);
  });

  it('keeps the caret before the separator when the typed value is reformatted', () => {
    input.focus();
    // The user typed "5" over the selected integer part
    input.value = '5.5';
    input.setSelectionRange(1, 1);
    input.dispatchEvent(new Event('input'));
    input.value = '5.50'; // React redisplays the formatted value
    vi.runAllTimers();
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 1]);
  });

  it('keeps a selected integer part selected when the value changes by arrow keys', () => {
    input.focus();
    keepSelectionThroughReformat(input);
    input.value = '1250.5';
    vi.runAllTimers();
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4]);
  });
});
