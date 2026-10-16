/**
 * Integer-first editing for formatted numeric text fields such as "100.0".
 *
 * The properties panel's numeric fields commit on every keystroke and then
 * redisplay the formatted value, which made React move the caret to the end —
 * so after the first digit, typing continued in the decimals. These helpers
 * keep editing in the integer part: focusing selects it, the caret keeps its
 * place relative to the decimal separator when the value is reformatted, and
 * only → (or typing "." / ",") moves on to the decimals.
 */

const DECIMAL_SEPARATORS = ['.', ','];

export interface NumberSegments {
  /** Start of the integer part (after leading spaces; includes any sign). */
  intStart: number;
  /** End of the integer part — the decimal separator's index when there is one. */
  intEnd: number;
  /** The fraction digits, or null when the text has no decimal separator. */
  fraction: { start: number; end: number } | null;
}

export function getNumberSegments(text: string): NumberSegments {
  const match = /^(\s*)([-+]?\d*)/.exec(text);
  const intStart = match?.[1]?.length ?? 0;
  const intEnd = intStart + (match?.[2]?.length ?? 0);
  if (!DECIMAL_SEPARATORS.includes(text.charAt(intEnd))) {
    return { intStart, intEnd, fraction: null };
  }
  const digits = /^\d*/.exec(text.slice(intEnd + 1))?.[0].length ?? 0;
  return { intStart, intEnd, fraction: { start: intEnd + 1, end: intEnd + 1 + digits } };
}

/** A caret position measured from the decimal separator, so it survives reformatting. */
export type CaretAnchor =
  | { part: 'integer'; fromSeparator: number }
  | { part: 'fraction'; fromSeparator: number };

export function anchorCaret(text: string, caret: number): CaretAnchor {
  const { intStart, intEnd, fraction } = getNumberSegments(text);
  if (fraction && caret >= fraction.start) {
    return { part: 'fraction', fromSeparator: caret - fraction.start };
  }
  // At the start of the number it stays at the start, however long it grows
  if (caret <= intStart) return { part: 'integer', fromSeparator: Infinity };
  return { part: 'integer', fromSeparator: Math.max(0, intEnd - caret) };
}

export function resolveCaret(text: string, anchor: CaretAnchor): number {
  const { intStart, intEnd, fraction } = getNumberSegments(text);
  if (anchor.part === 'fraction' && fraction) {
    return Math.min(fraction.end, fraction.start + anchor.fromSeparator);
  }
  const fromSeparator = anchor.part === 'integer' ? anchor.fromSeparator : 0;
  return Math.max(intStart, intEnd - fromSeparator);
}

export function selectIntegerPart(el: HTMLInputElement): void {
  const { intStart, intEnd } = getNumberSegments(el.value);
  el.setSelectionRange(intStart, intEnd);
}

function selectFraction(el: HTMLInputElement): boolean {
  const { fraction } = getNumberSegments(el.value);
  if (!fraction) return false;
  el.setSelectionRange(fraction.start, fraction.end);
  return true;
}

/**
 * Call before a change that will make React redisplay the field (typing, arrow
 * keys, wheel): once the new value is rendered, the selection is put back at
 * the same place relative to the decimal separator.
 */
export function keepSelectionThroughReformat(el: HTMLInputElement): void {
  const before = el.value;
  const { selectionStart, selectionEnd } = el;
  if (selectionStart === null || selectionEnd === null) return;
  const startAnchor = anchorCaret(before, selectionStart);
  const endAnchor = anchorCaret(before, selectionEnd);
  // React re-renders after the event finishes dispatching
  setTimeout(() => {
    if (document.activeElement !== el || el.value === before) return;
    el.setSelectionRange(resolveCaret(el.value, startAnchor), resolveCaret(el.value, endAnchor));
  }, 0);
}

interface SegmentKeyEvent {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  preventDefault: () => void;
}

/**
 * Move between the integer part and the decimals: → at the end of the integer
 * part selects the decimals, ← from the decimals goes back, and "." or ","
 * typed in the integer part jumps to the decimals. A "," typed into a value
 * without decimals is entered as ".". Returns true when the key was handled.
 */
export function handleNumberSegmentKey(e: SegmentKeyEvent, el: HTMLInputElement): boolean {
  if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return false;
  const { selectionStart, selectionEnd } = el;
  if (selectionStart === null || selectionEnd === null) return false;
  const { intEnd, fraction } = getNumberSegments(el.value);

  switch (e.key) {
    case 'ArrowRight':
      if (fraction && selectionEnd === intEnd) {
        e.preventDefault();
        return selectFraction(el);
      }
      return false;
    case 'ArrowLeft':
      // Decimals are a digit or two, so ← anywhere in them returns to the integer part
      if (fraction && selectionStart >= fraction.start) {
        e.preventDefault();
        selectIntegerPart(el);
        return true;
      }
      return false;
    case '.':
    case ',':
      if (fraction && selectionEnd <= intEnd) {
        e.preventDefault();
        return selectFraction(el);
      }
      if (!fraction && e.key === ',') {
        e.preventDefault();
        // execCommand fires a real input event, so React's onChange sees it
        document.execCommand('insertText', false, '.');
        return true;
      }
      return false;
    default:
      return false;
  }
}

/**
 * Attach integer-first editing to a numeric text field (once per element):
 * focusing selects the integer part, and typed values keep the caret in place.
 */
export function attachIntegerFirstEditing(el: HTMLInputElement): void {
  const rec = el as unknown as Record<string, unknown>;
  if (rec.__integerFirstEditing) return;
  rec.__integerFirstEditing = true;

  // A focusing click places the caret on mouseup, after the focus event
  let selectOnMouseUp = false;
  el.addEventListener('focus', () => {
    selectIntegerPart(el);
    selectOnMouseUp = true;
  });
  el.addEventListener('mouseup', () => {
    if (!selectOnMouseUp) return;
    selectOnMouseUp = false;
    // Keep a range the user dragged out while focusing
    if (el.selectionStart === el.selectionEnd) selectIntegerPart(el);
  });
  el.addEventListener('blur', () => {
    selectOnMouseUp = false;
  });
  el.addEventListener('input', () => keepSelectionThroughReformat(el));
}
