import { describe, it, expect, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { ScrubLabel } from './ScrubLabel';

/** Drag the label `dx` pixels and say what values it gave. */
function scrub(props: Partial<Parameters<typeof ScrubLabel>[0]>, dx: number): number[] {
  const onChange = vi.fn();
  render(<ScrubLabel label="L" value={1.2} onChange={onChange} {...props} />);
  fireEvent.pointerDown(screen.getByText('L'), { clientX: 100 });
  fireEvent.pointerMove(document, { clientX: 100 + dx });
  fireEvent.pointerUp(document);
  return onChange.mock.calls.map(([value]) => value as number);
}

describe('ScrubLabel', () => {
  it('moves a value in whole numbers by default', () => {
    expect(scrub({ value: 10, sensitivity: 0.5 }, 7)).toEqual([14]); // 13.5 rounds
  });

  it('moves a fractional value in its own steps (a line height by 0.01)', () => {
    expect(scrub({ sensitivity: 0.01, step: 0.01 }, 7)).toEqual([1.27]);
  });

  it('keeps to its range', () => {
    expect(scrub({ sensitivity: 0.01, step: 0.01, min: 0.5, max: 1.25 }, 50)).toEqual([1.25]);
  });
});
