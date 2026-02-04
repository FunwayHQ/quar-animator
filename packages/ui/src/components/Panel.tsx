/**
 * Panel component for Quar Animator
 * Collapsible panel with header for organizing UI sections
 */

import React, { type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface PanelProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  collapsible?: boolean;
  headerActions?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

// ============================================================================
// Styles
// ============================================================================

const panelStyles: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-secondary)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-subtle)',
  overflow: 'hidden',
};

const headerStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  backgroundColor: 'var(--color-bg-tertiary)',
  borderBottom: '1px solid var(--color-border-subtle)',
  userSelect: 'none',
};

const headerLeftStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const titleStyles: React.CSSProperties = {
  fontSize: 'var(--font-size-sm)',
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  margin: 0,
};

const chevronStyles: React.CSSProperties = {
  color: 'var(--color-text-tertiary)',
  transition: 'transform var(--duration-fast) var(--easing-default)',
};

const contentStyles: React.CSSProperties = {
  padding: '12px',
};

const headerActionsStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
};

// ============================================================================
// Component
// ============================================================================

export function Panel({
  title,
  children,
  defaultExpanded = true,
  expanded: controlledExpanded,
  onExpandedChange,
  collapsible = true,
  headerActions,
  className,
  style,
}: PanelProps) {
  const [internalExpanded, setInternalExpanded] = React.useState(defaultExpanded);

  const isControlled = controlledExpanded !== undefined;
  const isExpanded = isControlled ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    if (!collapsible) return;

    const newExpanded = !isExpanded;
    if (!isControlled) {
      setInternalExpanded(newExpanded);
    }
    onExpandedChange?.(newExpanded);
  };

  const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

  return (
    <div style={{ ...panelStyles, ...style }} className={className}>
      <div
        style={{
          ...headerStyles,
          ...(collapsible && { cursor: 'pointer' }),
          ...(!isExpanded && { borderBottom: 'none' }),
        }}
        onClick={handleToggle}
      >
        <div style={headerLeftStyles}>
          {collapsible && <ChevronIcon size={14} style={chevronStyles} />}
          <h3 style={titleStyles}>{title}</h3>
        </div>
        {headerActions && (
          <div
            style={headerActionsStyles}
            onClick={(e) => e.stopPropagation()}
          >
            {headerActions}
          </div>
        )}
      </div>
      {isExpanded && <div style={contentStyles}>{children}</div>}
    </div>
  );
}

export default Panel;
