export type KeyframeState = 'none' | 'inactive' | 'active';

export interface KeyframeIndicatorProps {
  state: KeyframeState;
  onToggle: () => void;
}

const TITLES: Record<KeyframeState, string> = {
  none: 'Add keyframe',
  inactive: 'Add keyframe',
  active: 'Remove keyframe',
};

export function KeyframeIndicator({ state, onToggle }: KeyframeIndicatorProps) {
  return (
    <button
      className={`keyframe-indicator keyframe-indicator--${state}`}
      onClick={onToggle}
      title={TITLES[state]}
      data-testid="keyframe-indicator"
      style={{
        width: 10,
        height: 10,
        transform: 'rotate(45deg)',
        padding: 0,
        border:
          state === 'none'
            ? '1px solid var(--color-text-disabled)'
            : state === 'inactive'
              ? '1px solid var(--color-accent-primary)'
              : '1px solid #F5A623',
        background: state === 'active' ? '#F5A623' : 'transparent',
        cursor: 'pointer',
        flexShrink: 0,
        display: 'inline-block',
        boxSizing: 'border-box',
      }}
    />
  );
}

export default KeyframeIndicator;
