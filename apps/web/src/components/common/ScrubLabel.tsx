import { useRef, useCallback, useEffect, useState } from 'react';
import styles from './ScrubLabel.module.css';

export interface ScrubLabelProps {
  /** The display text for the label (e.g. "X", "Y", "W", "H") */
  label: string;
  /** Current value to scrub */
  value: number;
  /** Called with the new value while scrubbing */
  onChange: (value: number) => void;
  /** Value change per pixel of mouse movement. Default: 1 */
  sensitivity?: number;
  /** The steps the value moves in (0.01 for a line height). Default: 1 */
  step?: number;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Called once at the start of a scrub gesture (for undo snapshots) */
  onScrubStart?: () => void;
}

export function ScrubLabel({
  label,
  value,
  onChange,
  sensitivity = 1,
  step = 1,
  min = -Infinity,
  max = Infinity,
  onScrubStart,
}: ScrubLabelProps) {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const startXRef = useRef(0);
  const startValueRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      onScrubStart?.();
      startXRef.current = e.clientX;
      startValueRef.current = value;
      setIsScrubbing(true);
    },
    [value, onScrubStart]
  );

  useEffect(() => {
    if (!isScrubbing) return;

    const handlePointerMove = (e: PointerEvent) => {
      const dx = e.clientX - startXRef.current;
      const delta = dx * sensitivity;
      const clamped = Math.min(max, Math.max(min, startValueRef.current + delta));
      // Rounded to a step, then to the step's decimals (no 1.2300000000000002)
      const decimals = Math.max(0, -Math.floor(Math.log10(step)));
      onChange(+(Math.round(clamped / step) * step).toFixed(decimals));
    };

    const handlePointerUp = () => {
      setIsScrubbing(false);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isScrubbing, sensitivity, step, min, max, onChange]);

  return (
    <span
      className={`${styles.scrubLabel} ${isScrubbing ? styles.scrubbing : ''}`}
      onPointerDown={handlePointerDown}
      data-testid={`scrub-label-${label}`}
    >
      {label}
    </span>
  );
}

export default ScrubLabel;
