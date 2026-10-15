import { describe, expect, it } from 'vitest';
import { getVisibleTextContent } from './textReveal';

describe('getVisibleTextContent', () => {
  it('shows the full content when no reveal value is present', () => {
    expect(getVisibleTextContent({ content: 'Hello' })).toBe('Hello');
  });

  it('clamps the visible character count and reveals Unicode code points', () => {
    expect(getVisibleTextContent({ content: 'A🌟B', visibleCharacters: 2 })).toBe('A🌟');
    expect(getVisibleTextContent({ content: 'Hello', visibleCharacters: 99 })).toBe('Hello');
    expect(getVisibleTextContent({ content: 'Hello', visibleCharacters: -1 })).toBe('');
  });
});
