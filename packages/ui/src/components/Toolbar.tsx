/**
 * Toolbar component for Quar Animator
 * Container for tool buttons with separator and group support
 */

import React, { type ReactNode } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ToolbarOrientation = 'horizontal' | 'vertical';

export interface ToolbarProps {
  children: ReactNode;
  orientation?: ToolbarOrientation;
  className?: string;
  style?: React.CSSProperties;
}

export interface ToolbarGroupProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export interface ToolbarSeparatorProps {
  orientation?: ToolbarOrientation;
}

// ============================================================================
// Styles
// ============================================================================

const toolbarStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px',
  backgroundColor: 'var(--color-bg-secondary)',
  borderRadius: 'var(--radius-md)',
};

const verticalToolbarStyles: React.CSSProperties = {
  flexDirection: 'column',
};

const groupStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
};

// Reserved for future vertical toolbar support
// const verticalGroupStyles: React.CSSProperties = {
//   flexDirection: 'column',
// };

const separatorBaseStyles: React.CSSProperties = {
  backgroundColor: 'var(--color-border-subtle)',
  flexShrink: 0,
};

const horizontalSeparatorStyles: React.CSSProperties = {
  width: '1px',
  height: '20px',
  margin: '0 4px',
};

const verticalSeparatorStyles: React.CSSProperties = {
  width: '20px',
  height: '1px',
  margin: '4px 0',
};

// ============================================================================
// Components
// ============================================================================

export function Toolbar({
  children,
  orientation = 'horizontal',
  className,
  style,
}: ToolbarProps) {
  return (
    <div
      role="toolbar"
      style={{
        ...toolbarStyles,
        ...(orientation === 'vertical' && verticalToolbarStyles),
        ...style,
      }}
      className={className}
    >
      {children}
    </div>
  );
}

export function ToolbarGroup({
  children,
  className,
  style,
}: ToolbarGroupProps) {
  // Get orientation from parent context (simplified - defaults to horizontal)
  return (
    <div
      role="group"
      style={{
        ...groupStyles,
        ...style,
      }}
      className={className}
    >
      {children}
    </div>
  );
}

export function ToolbarSeparator({
  orientation = 'horizontal',
}: ToolbarSeparatorProps) {
  return (
    <div
      role="separator"
      style={{
        ...separatorBaseStyles,
        ...(orientation === 'horizontal'
          ? horizontalSeparatorStyles
          : verticalSeparatorStyles),
      }}
    />
  );
}

// Create a compound component
Toolbar.Group = ToolbarGroup;
Toolbar.Separator = ToolbarSeparator;

export default Toolbar;
