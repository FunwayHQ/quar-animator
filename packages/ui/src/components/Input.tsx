/**
 * Input component for Quar Animator
 */

import React, { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

// ============================================================================
// Types
// ============================================================================

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize;
  label?: string;
  helperText?: string;
  error?: boolean;
  errorMessage?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
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

const inputWrapperStyles: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
};

const baseInputStyles: React.CSSProperties = {
  width: '100%',
  fontFamily: 'var(--font-family-ui)',
  backgroundColor: 'var(--color-bg-tertiary)',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-default)',
  borderRadius: 'var(--radius-md)',
  outline: 'none',
  transition: 'all var(--duration-fast) var(--easing-default)',
};

const sizeStyles: Record<InputSize, React.CSSProperties> = {
  sm: {
    height: '28px',
    padding: '0 8px',
    fontSize: 'var(--font-size-sm)',
  },
  md: {
    height: '36px',
    padding: '0 12px',
    fontSize: 'var(--font-size-md)',
  },
  lg: {
    height: '44px',
    padding: '0 16px',
    fontSize: 'var(--font-size-lg)',
  },
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

const iconStyles: React.CSSProperties = {
  position: 'absolute',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--color-text-tertiary)',
  pointerEvents: 'none',
};

// ============================================================================
// Component
// ============================================================================

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      size = 'md',
      label,
      helperText,
      error = false,
      errorMessage,
      iconLeft,
      iconRight,
      fullWidth = false,
      disabled,
      style,
      onFocus,
      onBlur,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = React.useState(false);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.(e);
    };

    const iconSize = size === 'sm' ? 14 : size === 'md' ? 16 : 18;
    const iconPadding = size === 'sm' ? 8 : size === 'md' ? 12 : 16;

    const computedInputStyles: React.CSSProperties = {
      ...baseInputStyles,
      ...sizeStyles[size],
      ...(iconLeft && { paddingLeft: `${iconPadding * 2 + iconSize}px` }),
      ...(iconRight && { paddingRight: `${iconPadding * 2 + iconSize}px` }),
      ...(error && errorStyles),
      ...(isFocused && !error && { borderColor: 'var(--color-border-focus)' }),
      ...(disabled && { opacity: 0.5, cursor: 'not-allowed' }),
      ...style,
    };

    return (
      <div style={{ ...containerStyles, ...(fullWidth && { width: '100%' }) }}>
        {label && <label style={labelStyles}>{label}</label>}
        <div style={inputWrapperStyles}>
          {iconLeft && (
            <span style={{ ...iconStyles, left: `${iconPadding}px` }}>
              {iconLeft}
            </span>
          )}
          <input
            ref={ref}
            disabled={disabled}
            style={computedInputStyles}
            onFocus={handleFocus}
            onBlur={handleBlur}
            {...props}
          />
          {iconRight && (
            <span style={{ ...iconStyles, right: `${iconPadding}px` }}>
              {iconRight}
            </span>
          )}
        </div>
        {helperText && !error && <span style={helperTextStyles}>{helperText}</span>}
        {error && errorMessage && <span style={errorMessageStyles}>{errorMessage}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
