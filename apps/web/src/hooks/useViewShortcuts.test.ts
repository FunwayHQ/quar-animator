/**
 * Tests for view shortcuts working anywhere in the editor
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useViewShortcuts } from './useViewShortcuts';
import { VIEW_EVENTS } from '../components/layout/MenuBar';

describe('useViewShortcuts', () => {
  const heard = vi.fn();
  const listen = () => {
    for (const name of Object.values(VIEW_EVENTS)) {
      window.addEventListener(name, () => heard(name));
    }
  };
  afterEach(() => heard.mockReset());

  it('sends Ctrl/Cmd+0, 1, + and − to the canvas, keeping the browser from zooming the page', () => {
    listen();
    renderHook(() => useViewShortcuts());
    const keys: [string, boolean][] = [
      ['Digit0', true],
      ['Digit1', false],
      ['Equal', true],
      ['Minus', false],
    ];
    const events = keys.map(([code, meta]) => {
      const event = new KeyboardEvent('keydown', {
        code,
        ctrlKey: !meta,
        metaKey: meta,
        cancelable: true,
        bubbles: true,
      });
      document.body.dispatchEvent(event);
      return event;
    });

    expect(heard.mock.calls.map(([name]) => name)).toEqual([
      VIEW_EVENTS.FIT_TO_WINDOW,
      VIEW_EVENTS.ZOOM_100,
      VIEW_EVENTS.ZOOM_IN,
      VIEW_EVENTS.ZOOM_OUT,
    ]);
    expect(events.every((event) => event.defaultPrevented)).toBe(true);
  });

  it('leaves a key the canvas already handled, and text fields, alone', () => {
    listen();
    renderHook(() => useViewShortcuts());
    const handled = new KeyboardEvent('keydown', {
      code: 'Digit0',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    handled.preventDefault();
    document.body.dispatchEvent(handled);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'Digit0',
        ctrlKey: true,
        cancelable: true,
        bubbles: true,
      })
    );
    input.remove();

    expect(heard).not.toHaveBeenCalled();
  });
});
