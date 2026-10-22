/**
 * Checkbox component for Quar Animator
 */

import React, { forwardRef, type InputHTMLAttributes } from 'react';
import { Check, Minus } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export type CheckboxSize = 'sm' | 'md' | 'lg';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'type'
> {
  size?: CheckboxSize;
  label?: string;
  indeterminate?: boolean;
  error?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const containerStyles: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  cursor: 'pointer',
  userSelect: 'none',
};

const checkboxWrapperStyles: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const hiddenInputStyles: React.CSSProperties = {
  position: 'absolute',
  opacity: 0,
  width: '100%',
  height: '100%',
  cursor: 'pointer',
  margin: 0,
};

const baseBoxStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--color-bg-tertiary)',
  border: '1px solid var(--color-border-default)',
  borderRadius: 'var(--radius-sm)',
  transition: 'all var(--duration-fast) var(--easing-default)',
};

const sizeStyles: Record<CheckboxSize, { box: React.CSSProperties; icon: number }> = {
  sm: {
    box: { width: '16px', height: '16px' },
    icon: 12,
  },
  md: {
    box: { width: '20px', height: '20px' },
    icon: 14,
  },
  lg: {
    box: { width: '24px', height: '24px' },
    icon: 18,
  },
};

const labelStyles: React.CSSProperties = {
  fontSize: 'var(--font-size-md)',
  color: 'var(--color-text-primary)',
};

const labelSizeStyles: Record<CheckboxSize, React.CSSProperties> = {
  sm: { fontSize: 'var(--font-size-sm)' },
  md: { fontSize: 'var(--font-size-md)' },
  lg: { fontSize: 'var(--font-size-lg)' },
};

// ============================================================================
// Component
// ============================================================================

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      size = 'md',
      label,
      indeterminate = false,
      error = false,
      checked,
      defaultChecked,
      disabled,
      onChange,
      ...props
    },
    ref
  ) => {
    const [isHovered, setIsHovered] = React.useState(false);
    const [isFocused, setIsFocused] = React.useState(false);

    // Without a `checked` prop the box keeps its own state, so the check mark
    // still follows clicks and `defaultChecked`.
    const isControlled = checked !== undefined;
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked ?? false);
    const effectiveChecked = isControlled ? checked : internalChecked;

    // `indeterminate` is a property of the input with no HTML attribute, so
    // it is set on the element itself; that is what screen readers announce
    // as mixed. The input is kept in a ref of our own and passed on to `ref`.
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const setInputRef = React.useCallback(
      (el: HTMLInputElement | null) => {
        inputRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      },
      [ref]
    );

    React.useEffect(() => {
      if (inputRef.current) inputRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // A click clears the input's indeterminate flag; the prop decides it.
      e.target.indeterminate = indeterminate;
      if (!isControlled) setInternalChecked(e.target.checked);
      onChange?.(e);
    };

    const isChecked = effectiveChecked || indeterminate;

    const computedBoxStyles: React.CSSProperties = {
      ...baseBoxStyles,
      ...sizeStyles[size].box,
      ...(isChecked && {
        backgroundColor: 'var(--color-accent-primary)',
        borderColor: 'var(--color-accent-primary)',
      }),
      ...(isHovered &&
        !disabled &&
        !isChecked && {
          borderColor: 'var(--color-border-strong)',
        }),
      ...(isFocused && {
        borderColor: 'var(--color-border-focus)',
        boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.3)',
      }),
      ...(error && {
        borderColor: 'var(--color-accent-error)',
      }),
      ...(disabled && {
        opacity: 0.5,
        cursor: 'not-allowed',
      }),
    };

    return (
      <label
        style={{
          ...containerStyles,
          ...(disabled && { cursor: 'not-allowed', opacity: 0.5 }),
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div style={checkboxWrapperStyles}>
          <input
            ref={setInputRef}
            type="checkbox"
            checked={effectiveChecked}
            disabled={disabled}
            onChange={handleChange}
            style={hiddenInputStyles}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            {...props}
          />
          <div style={computedBoxStyles}>
            {indeterminate ? (
              <Minus size={sizeStyles[size].icon} color="white" strokeWidth={3} />
            ) : effectiveChecked ? (
              <Check size={sizeStyles[size].icon} color="white" strokeWidth={3} />
            ) : null}
          </div>
        </div>
        {label && <span style={{ ...labelStyles, ...labelSizeStyles[size] }}>{label}</span>}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export default Checkbox;
