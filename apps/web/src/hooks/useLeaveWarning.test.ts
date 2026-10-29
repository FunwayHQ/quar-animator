import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditorStore } from '../stores/editorStore';
import { useLeaveWarning } from './useLeaveWarning';

function leave(): Event {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe('useLeaveWarning', () => {
  it('asks before leaving while there are unsaved changes', () => {
    useEditorStore.setState({ isDirty: true });
    renderHook(() => useLeaveWarning());
    expect(leave().defaultPrevented).toBe(true);
  });

  it('lets the tab go when everything is saved', () => {
    useEditorStore.setState({ isDirty: false });
    renderHook(() => useLeaveWarning());
    expect(leave().defaultPrevented).toBe(false);
  });

  it('stops asking once the editor is gone', () => {
    useEditorStore.setState({ isDirty: true });
    const { unmount } = renderHook(() => useLeaveWarning());
    unmount();
    expect(leave().defaultPrevented).toBe(false);
  });
});
