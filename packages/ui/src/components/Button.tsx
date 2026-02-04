/**
 * Button component for Quar Animator
 */

import React, { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  iconOnly?: boolean;
  fullWidth?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const baseStyles: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  fontFamily: 'var(--font-family-ui)',
  fontWeight: 500,
  borderRadius: 'var(--radius-md)',
  border: '1px solid transparent',
  cursor: 'pointer',
  transition: 'all var(--duration-fast) var(--easing-default)',
  outline: 'none',
  userSelect: 'none',
  whiteSpace: 'nowrap',
};

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: 'var(--color-accent-primary)',
    color: 'var(--color-text-primary)',
    borderColor: 'var(--color-accent-primary)',
  },
  secondary: {
    backgroundColor: 'var(--color-bg-tertiary)',
    color: 'var(--color-text-primary)',
    borderColor: 'var(--color-border-default)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
    borderColor: 'transparent',
  },
  danger: {
    backgroundColor: 'var(--color-accent-error)',
    color: 'var(--color-text-primary)',
    borderColor: 'var(--color-accent-error)',
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    height: '28px',
    padding: '0 12px',
    fontSize: 'var(--font-size-sm)',
  },
  md: {
    height: '36px',
    padding: '0 16px',
    fontSize: 'var(--font-size-md)',
  },
  lg: {
    height: '44px',
    padding: '0 24px',
    fontSize: 'var(--font-size-lg)',
  },
};

const iconOnlySizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    width: '28px',
    height: '28px',
    padding: 0,
  },
  md: {
    width: '36px',
    height: '36px',
    padding: 0,
  },
  lg: {
    width: '44px',
    height: '44px',
    padding: 0,
  },
};

const disabledStyles: React.CSSProperties = {
  opacity: 0.5,
  cursor: 'not-allowed',
  pointerEvents: 'none',
};

// ============================================================================
// Component
// ============================================================================

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      iconLeft,
      iconRight,
      iconOnly = false,
      fullWidth = false,
      disabled,
      children,
      style,
      onMouseEnter,
      onMouseLeave,
      ...props
    },
    ref
  ) => {
    const [isHovered, setIsHovered] = React.useState(false);

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      setIsHovered(true);
      onMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      setIsHovered(false);
      onMouseLeave?.(e);
    };

    const computedStyles: React.CSSProperties = {
      ...baseStyles,
      ...variantStyles[variant],
      ...(iconOnly ? iconOnlySizeStyles[size] : sizeStyles[size]),
      ...(fullWidth && { width: '100%' }),
      ...(disabled && disabledStyles),
      ...(isHovered && !disabled && getHoverStyles(variant)),
      ...style,
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        style={computedStyles}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        {loading ? (
          <LoadingSpinner size={size} />
        ) : (
          <>
            {iconLeft && <span style={{ display: 'flex' }}>{iconLeft}</span>}
            {!iconOnly && children}
            {iconRight && <span style={{ display: 'flex' }}>{iconRight}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

// ============================================================================
// Helpers
// ============================================================================

function getHoverStyles(variant: ButtonVariant): React.CSSProperties {
  switch (variant) {
    case 'primary':
      return { backgroundColor: 'var(--color-accent-primary-hover)' };
    case 'secondary':
      return { backgroundColor: 'var(--color-bg-hover)' };
    case 'ghost':
      return { backgroundColor: 'var(--color-bg-hover)' };
    case 'danger':
      return { filter: 'brightness(1.1)' };
    default:
      return {};
  }
}

// ============================================================================
// Loading Spinner
// ============================================================================

interface LoadingSpinnerProps {
  size: ButtonSize;
}

function LoadingSpinner({ size }: LoadingSpinnerProps) {
  const spinnerSize = size === 'sm' ? 14 : size === 'md' ? 16 : 18;

  return (
    <svg
      width={spinnerSize}
      height={spinnerSize}
      viewBox="0 0 24 24"
      fill="none"
      style={{
        animation: 'spin 1s linear infinite',
      }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="31.4 31.4"
        opacity={0.25}
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="31.4 31.4"
        strokeDashoffset="23.55"
      />
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </svg>
  );
}

export default Button;
