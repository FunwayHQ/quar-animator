import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  DEFAULT_TIMELINE_HEIGHT,
  MIN_TIMELINE_HEIGHT,
  useTimelineHeight,
} from './useTimelineHeight';

const STORAGE_KEY = 'quar-animator-timeline-height';

describe('useTimelineHeight', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('starts at the default height', () => {
    const { result } = renderHook(() => useTimelineHeight());
    expect(result.current[0]).toBe(DEFAULT_TIMELINE_HEIGHT);
  });

  it('restores a previously stored height', () => {
    window.localStorage.setItem(STORAGE_KEY, '320');
    const { result } = renderHook(() => useTimelineHeight());
    expect(result.current[0]).toBe(320);
  });

  it.each(['garbage', '40', '-10', ''])('ignores an invalid stored height (%s)', (stored) => {
    window.localStorage.setItem(STORAGE_KEY, stored);
    const { result } = renderHook(() => useTimelineHeight());
    expect(result.current[0]).toBe(DEFAULT_TIMELINE_HEIGHT);
  });

  it('clamps to the minimum, rounds, and remembers the new height', () => {
    const { result } = renderHook(() => useTimelineHeight());

    act(() => result.current[1](10));
    expect(result.current[0]).toBe(MIN_TIMELINE_HEIGHT);

    act(() => result.current[1](287.6));
    expect(result.current[0]).toBe(288);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('288');
  });
});
