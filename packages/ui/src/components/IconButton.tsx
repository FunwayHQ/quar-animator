/**
 * IconButton component for Quar Animator
 * Button optimized for icons, commonly used in toolbars
 */

import React, { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

// ============================================================================
// Types
// ============================================================================

export type IconButtonSize = 'sm' | 'md' | 'lg';
export type IconButtonVariant = 'default' | 'ghost' | 'primary';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  active?: boolean;
  tooltip?: string;
}

// ============================================================================
// Styles
// ============================================================================

const baseStyles: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  transition: 'all var(--duration-fast) var(--easing-default)',
  outline: 'none',
  color: 'var(--color-text-secondary)',
};

const sizeStyles: Record<IconButtonSize, React.CSSProperties> = {
  sm: {
    width: '24px',
    height: '24px',
  },
  md: {
    width: '32px',
    height: '32px',
  },
  lg: {
    width: '40px',
    height: '40px',
  },
};

const variantStyles: Record<IconButtonVariant, React.CSSProperties> = {
  default: {
    backgroundColor: 'transparent',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  primary: {
    backgroundColor: 'var(--color-accent-primary)',
    color: 'var(--color-text-primary)',
  },
};

const activeStyles: React.CSSProperties = {
  backgroundColor: 'var(--color-accent-primary)',
  color: 'var(--color-text-primary)',
};

const hoverStyles: Record<IconButtonVariant, React.CSSProperties> = {
  default: {
    backgroundColor: 'var(--color-bg-hover)',
    color: 'var(--color-text-primary)',
  },
  ghost: {
    backgroundColor: 'var(--color-bg-hover)',
    color: 'var(--color-text-primary)',
  },
  primary: {
    backgroundColor: 'var(--color-accent-primary-hover)',
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

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      size = 'md',
      variant = 'default',
      active = false,
      tooltip,
      disabled,
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
      ...sizeStyles[size],
      ...variantStyles[variant],
      ...(active && activeStyles),
      ...(isHovered && !disabled && !active && hoverStyles[variant]),
      ...(disabled && disabledStyles),
      ...style,
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        title={tooltip}
        style={computedStyles}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

export default IconButton;
