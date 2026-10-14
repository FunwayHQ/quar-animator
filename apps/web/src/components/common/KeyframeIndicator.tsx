export type KeyframeState = 'none' | 'inactive' | 'active';

export interface KeyframeIndicatorProps {
  state: KeyframeState;
  onToggle: () => void;
  /** Property name used to make the keyframe action clearer to users. */
  propertyLabel?: string;
}

const TITLES: Record<KeyframeState, string> = {
  none: 'Add keyframe',
  inactive: 'Add keyframe',
  active: 'Remove keyframe',
};

export function KeyframeIndicator({ state, onToggle, propertyLabel }: KeyframeIndicatorProps) {
  const action = state === 'active' ? 'Remove' : 'Add';
  const label = propertyLabel ? ` ${propertyLabel}` : '';
  return (
    <button
      type="button"
      className={`keyframe-indicator keyframe-indicator--${state}`}
      onClick={onToggle}
      title={propertyLabel ? `${action}${label} keyframe` : TITLES[state]}
      aria-label={propertyLabel ? `${action}${label} keyframe` : TITLES[state]}
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
              : '1px solid var(--color-keyframe-active)',
        background: state === 'active' ? 'var(--color-keyframe-active)' : 'transparent',
        cursor: 'pointer',
        flexShrink: 0,
        display: 'inline-block',
        boxSizing: 'border-box',
      }}
    />
  );
}

export default KeyframeIndicator;
