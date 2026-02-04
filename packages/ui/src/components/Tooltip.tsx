/**
 * Tooltip component for Quar Animator
 */

import React, { type ReactNode, useRef, useState, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

export type TooltipPosition = 'top' | 'right' | 'bottom' | 'left';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: TooltipPosition;
  shortcut?: string;
  delay?: number;
  disabled?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const tooltipStyles: React.CSSProperties = {
  position: 'fixed',
  zIndex: 'var(--z-tooltip)' as unknown as number,
  padding: '6px 10px',
  backgroundColor: 'var(--color-bg-elevated)',
  color: 'var(--color-text-primary)',
  fontSize: 'var(--font-size-sm)',
  fontFamily: 'var(--font-family-ui)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-lg)',
  border: '1px solid var(--color-border-default)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  animation: 'fadeIn var(--duration-fast) var(--easing-default)',
};

const shortcutStyles: React.CSSProperties = {
  marginLeft: '8px',
  padding: '2px 6px',
  backgroundColor: 'var(--color-bg-active)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--font-size-xs)',
  fontFamily: 'var(--font-family-mono)',
  color: 'var(--color-text-secondary)',
};

const wrapperStyles: React.CSSProperties = {
  display: 'inline-flex',
};

// ============================================================================
// Component
// ============================================================================

export function Tooltip({
  content,
  children,
  position = 'top',
  shortcut,
  delay = 300,
  disabled = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);

  const showTooltip = () => {
    if (disabled) return;

    timeoutRef.current = window.setTimeout(() => {
      setIsVisible(true);
      updatePosition();
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  const updatePosition = () => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const offset = 8;

    let top = 0;
    let left = 0;

    switch (position) {
      case 'top':
        top = rect.top - offset;
        left = rect.left + rect.width / 2;
        break;
      case 'bottom':
        top = rect.bottom + offset;
        left = rect.left + rect.width / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - offset;
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + offset;
        break;
    }

    setTooltipPosition({ top, left });
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const getTransform = (): string => {
    switch (position) {
      case 'top':
        return 'translate(-50%, -100%)';
      case 'bottom':
        return 'translate(-50%, 0)';
      case 'left':
        return 'translate(-100%, -50%)';
      case 'right':
        return 'translate(0, -50%)';
    }
  };

  return (
    <>
      <div
        ref={triggerRef}
        style={wrapperStyles}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {children}
      </div>
      {isVisible && (
        <div
          style={{
            ...tooltipStyles,
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: getTransform(),
          }}
        >
          {content}
          {shortcut && <span style={shortcutStyles}>{shortcut}</span>}
        </div>
      )}
    </>
  );
}

export default Tooltip;
