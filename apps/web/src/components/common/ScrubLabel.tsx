import { useRef, useCallback, useEffect, useState } from 'react';
import styles from './ScrubLabel.module.css';

export interface ScrubLabelProps {
  /** The display text for the label (e.g. "X", "Y", "W", "H") */
  label: string;
  /** Current value to scrub */
  value: number;
  /** Called with the new value while scrubbing */
  onChange: (value: number) => void;
  /** Pixels of mouse movement per unit of value change. Default: 1 */
  sensitivity?: number;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
}

export function ScrubLabel({
  label,
  value,
  onChange,
  sensitivity = 1,
  min = -Infinity,
  max = Infinity,
}: ScrubLabelProps) {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const startXRef = useRef(0);
  const startValueRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      startValueRef.current = value;
      setIsScrubbing(true);
    },
    [value]
  );

  useEffect(() => {
    if (!isScrubbing) return;

    const handlePointerMove = (e: PointerEvent) => {
      const dx = e.clientX - startXRef.current;
      const delta = dx * sensitivity;
      const newValue = Math.round(Math.min(max, Math.max(min, startValueRef.current + delta)));
      onChange(newValue);
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
  }, [isScrubbing, sensitivity, min, max, onChange]);

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
