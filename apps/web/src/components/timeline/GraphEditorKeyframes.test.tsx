import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createCubicBezier } from '@quar/animation';
import { GraphEditorKeyframes } from './GraphEditorKeyframes';

const transform = {
  offsetX: 0,
  offsetY: 0,
  scaleX: 10,
  scaleY: 2,
  viewWidth: 400,
  viewHeight: 200,
};

function makeTrack(easing: any = createCubicBezier(0.4, 0, 0.2, 1)) {
  return {
    nodeId: 'node-1',
    property: 'transform.position.x',
    keyframes: [
      { id: 'kf-1', time: 0, value: 0, easing: 'linear' },
      { id: 'kf-2', time: 10, value: 20, easing },
    ],
  } as any;
}

describe('GraphEditorKeyframes', () => {
  it('renders keyframe dots and tangent handles only for selected editable segments', () => {
    const onKeyframeMouseDown = vi.fn();
    const onTangentMouseDown = vi.fn();
    const { container } = render(
      <GraphEditorKeyframes
        tracks={[{ track: makeTrack(), globalIndex: 0 }]}
        transform={transform}
        selectedKeyframeIds={new Set(['kf-1', 'kf-2'])}
        onKeyframeMouseDown={onKeyframeMouseDown}
        onTangentMouseDown={onTangentMouseDown}
      />
    );

    const dots = container.querySelectorAll('circle[class*="keyframeDot"]');
    const handles = container.querySelectorAll('circle[class*="tangentHandle"]');
    expect(dots).toHaveLength(2);
    expect(handles).toHaveLength(2);
    expect(container.querySelectorAll('line')).toHaveLength(2);

    fireEvent.mouseDown(dots[0]!);
    expect(onKeyframeMouseDown).toHaveBeenCalledWith(
      expect.anything(),
      'kf-1',
      'node-1',
      'transform.position.x',
      0,
      0
    );

    fireEvent.mouseDown(handles[0]!);
    fireEvent.mouseDown(handles[1]!);
    expect(
      onTangentMouseDown.mock.calls.map(([, keyframeId, , , side]) => [keyframeId, side])
    ).toEqual([
      ['kf-1', 'out'],
      ['kf-2', 'in'],
    ]);
  });

  it('hides handles for unselected keyframes and non-editable easing', () => {
    const { container, rerender } = render(
      <GraphEditorKeyframes
        tracks={[{ track: makeTrack(), globalIndex: 0 }]}
        transform={transform}
        selectedKeyframeIds={new Set()}
        onKeyframeMouseDown={vi.fn()}
        onTangentMouseDown={vi.fn()}
      />
    );

    expect(container.querySelectorAll('circle[class*="tangentHandle"]')).toHaveLength(0);

    rerender(
      <GraphEditorKeyframes
        tracks={[{ track: makeTrack('easeInBounce'), globalIndex: 0 }]}
        transform={transform}
        selectedKeyframeIds={new Set(['kf-2'])}
        onKeyframeMouseDown={vi.fn()}
        onTangentMouseDown={vi.fn()}
      />
    );

    expect(container.querySelectorAll('circle[class*="tangentHandle"]')).toHaveLength(0);
    expect(container.querySelectorAll('circle[class*="keyframeDot"]')).toHaveLength(2);
  });

  it('draws sequence keyframes hollow, without tangents, and reveals their step on press', () => {
    const track = makeTrack();
    track.keyframes[1].sequenceStepId = 'step-7';
    const onKeyframeMouseDown = vi.fn();
    const onManagedKeyframeMouseDown = vi.fn();
    const { container, getByTestId } = render(
      <GraphEditorKeyframes
        tracks={[{ track, globalIndex: 0 }]}
        transform={transform}
        selectedKeyframeIds={new Set(['kf-2'])}
        onKeyframeMouseDown={onKeyframeMouseDown}
        onTangentMouseDown={vi.fn()}
        onManagedKeyframeMouseDown={onManagedKeyframeMouseDown}
      />
    );

    const managed = getByTestId('graph-managed-keyframe-kf-2');
    expect(managed.getAttribute('class')).toMatch(/keyframeDotManaged/);
    expect(container.querySelectorAll('circle[class*="tangentHandle"]')).toHaveLength(0);

    fireEvent.mouseDown(managed);
    expect(onManagedKeyframeMouseDown).toHaveBeenCalledWith('step-7');
    expect(onKeyframeMouseDown).not.toHaveBeenCalled();
  });
});
