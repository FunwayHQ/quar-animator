/**
 * Select component for Quar Animator
 */

import React, { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: SelectSize;
  options: SelectOption[];
  label?: string;
  helperText?: string;
  error?: boolean;
  errorMessage?: string;
  fullWidth?: boolean;
  placeholder?: string;
}

// ============================================================================
// Styles
// ============================================================================

const containerStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const labelStyles: React.CSSProperties = {
  fontSize: 'var(--font-size-sm)',
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
};

const selectWrapperStyles: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
};

const baseSelectStyles: React.CSSProperties = {
  width: '100%',
  fontFamily: 'var(--font-family-ui)',
  backgroundColor: 'var(--color-bg-tertiary)',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-default)',
  borderRadius: 'var(--radius-md)',
  outline: 'none',
  cursor: 'pointer',
  appearance: 'none',
  transition: 'all var(--duration-fast) var(--easing-default)',
};

const sizeStyles: Record<SelectSize, React.CSSProperties> = {
  sm: {
    height: '28px',
    padding: '0 28px 0 8px',
    fontSize: 'var(--font-size-sm)',
  },
  md: {
    height: '36px',
    padding: '0 36px 0 12px',
    fontSize: 'var(--font-size-md)',
  },
  lg: {
    height: '44px',
    padding: '0 44px 0 16px',
    fontSize: 'var(--font-size-lg)',
  },
};

const chevronStyles: React.CSSProperties = {
  position: 'absolute',
  right: '8px',
  pointerEvents: 'none',
  color: 'var(--color-text-tertiary)',
};

const helperTextStyles: React.CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-text-tertiary)',
};

const errorStyles: React.CSSProperties = {
  borderColor: 'var(--color-accent-error)',
};

const errorMessageStyles: React.CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-accent-error)',
};

// ============================================================================
// Component
// ============================================================================

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      size = 'md',
      options,
      label,
      helperText,
      error = false,
      errorMessage,
      fullWidth = false,
      placeholder,
      disabled,
      style,
      onFocus,
      onBlur,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = React.useState(false);

    const handleFocus = (e: React.FocusEvent<HTMLSelectElement>) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLSelectElement>) => {
      setIsFocused(false);
      onBlur?.(e);
    };

    const iconSize = size === 'sm' ? 14 : size === 'md' ? 16 : 18;

    const computedSelectStyles: React.CSSProperties = {
      ...baseSelectStyles,
      ...sizeStyles[size],
      ...(error && errorStyles),
      ...(isFocused && !error && { borderColor: 'var(--color-border-focus)' }),
      ...(disabled && { opacity: 0.5, cursor: 'not-allowed' }),
      ...style,
    };

    return (
      <div style={{ ...containerStyles, ...(fullWidth && { width: '100%' }) }}>
        {label && <label style={labelStyles}>{label}</label>}
        <div style={selectWrapperStyles}>
          <select
            ref={ref}
            disabled={disabled}
            style={computedSelectStyles}
            onFocus={handleFocus}
            onBlur={handleBlur}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown size={iconSize} style={chevronStyles} />
        </div>
        {helperText && !error && <span style={helperTextStyles}>{helperText}</span>}
        {error && errorMessage && <span style={errorMessageStyles}>{errorMessage}</span>}
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;
