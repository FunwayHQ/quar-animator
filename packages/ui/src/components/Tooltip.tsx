/**
 * Tooltip component for Quar Animator
 */

import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

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

/** Space between the trigger and the tooltip. */
const TOOLTIP_GAP = 8;
/** The closest the tooltip comes to the window's edges. */
const VIEWPORT_MARGIN = 4;

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
  // As wide as its text, up to a width that fits the window; longer text
  // wraps instead of running off screen.
  width: 'max-content',
  maxWidth: `min(320px, calc(100vw - ${2 * VIEWPORT_MARGIN}px))`,
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
  whiteSpace: 'nowrap',
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
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);

  const showTooltip = () => {
    if (disabled) return;

    // Hover and focus both arm the delay; keep only one pending, so leaving
    // cancels it and no earlier one shows the tooltip later.
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  // The tooltip's size is known once it is on the page, so it is placed
  // then (before it is painted) and again when anything scrolls or the
  // window resizes, so it stays next to its trigger.
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const { width, height } = tooltip.getBoundingClientRect();
    setTooltipPosition(
      placeTooltip(trigger.getBoundingClientRect(), width, height, position, getViewportSize())
    );
  }, [position]);

  useLayoutEffect(() => {
    if (!isVisible) return;

    updatePosition();
    // Capturing catches scrolling inside any panel, not just the page.
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible, updatePosition]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

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
          ref={tooltipRef}
          style={{
            ...tooltipStyles,
            top: tooltipPosition.top,
            left: tooltipPosition.left,
          }}
        >
          {content}
          {shortcut && <span style={shortcutStyles}>{shortcut}</span>}
        </div>
      )}
    </>
  );
}

// ============================================================================
// Placement
// ============================================================================

const OPPOSITE_SIDE: Record<TooltipPosition, TooltipPosition> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

/** The window's size, without its scrollbars. */
function getViewportSize(): { width: number; height: number } {
  const root = document.documentElement;
  return {
    width: root.clientWidth || window.innerWidth,
    height: root.clientHeight || window.innerHeight,
  };
}

/**
 * Where to put the top-left corner of a tooltip of the given size: beside
 * its trigger on the side asked for, or on the opposite side when only that
 * one has room, then moved along so it stays inside the window.
 */
function placeTooltip(
  trigger: DOMRect,
  width: number,
  height: number,
  side: TooltipPosition,
  viewport: { width: number; height: number }
): { top: number; left: number } {
  const centeredLeft = trigger.left + trigger.width / 2 - width / 2;
  const centeredTop = trigger.top + trigger.height / 2 - height / 2;
  const corners: Record<TooltipPosition, { top: number; left: number }> = {
    top: { top: trigger.top - TOOLTIP_GAP - height, left: centeredLeft },
    bottom: { top: trigger.bottom + TOOLTIP_GAP, left: centeredLeft },
    left: { top: centeredTop, left: trigger.left - TOOLTIP_GAP - width },
    right: { top: centeredTop, left: trigger.right + TOOLTIP_GAP },
  };
  const hasRoom: Record<TooltipPosition, boolean> = {
    top: corners.top.top >= VIEWPORT_MARGIN,
    bottom: corners.bottom.top + height <= viewport.height - VIEWPORT_MARGIN,
    left: corners.left.left >= VIEWPORT_MARGIN,
    right: corners.right.left + width <= viewport.width - VIEWPORT_MARGIN,
  };

  const opposite = OPPOSITE_SIDE[side];
  const corner = corners[hasRoom[side] || !hasRoom[opposite] ? side : opposite];
  return {
    top: keepInside(corner.top, height, viewport.height),
    left: keepInside(corner.left, width, viewport.width),
  };
}

/**
 * Moves a start coordinate so a span of the given size stays inside
 * [0, limit] with the margin; a span too big to fit starts at the margin.
 */
function keepInside(start: number, size: number, limit: number): number {
  return Math.max(VIEWPORT_MARGIN, Math.min(start, limit - size - VIEWPORT_MARGIN));
}

export default Tooltip;
