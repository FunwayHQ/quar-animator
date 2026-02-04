/**
 * Design tokens and theme for Quar Animator
 */

// ============================================================================
// Color Tokens
// ============================================================================

export const colors = {
  // Background colors
  bg: {
    primary: '#0D0D0D',
    secondary: '#1A1A1A',
    tertiary: '#262626',
    elevated: '#2D2D2D',
    hover: '#333333',
    active: '#404040',
  },

  // Text colors
  text: {
    primary: '#FFFFFF',
    secondary: '#A3A3A3',
    tertiary: '#737373',
    disabled: '#525252',
    inverse: '#0D0D0D',
  },

  // Border colors
  border: {
    default: '#333333',
    subtle: '#262626',
    strong: '#404040',
    focus: '#3B82F6',
  },

  // Accent colors
  accent: {
    primary: '#3B82F6', // Blue
    primaryHover: '#2563EB',
    primaryActive: '#1D4ED8',
    secondary: '#8B5CF6', // Purple
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
  },

  // Timeline colors
  timeline: {
    playhead: '#EF4444',
    keyframe: '#F59E0B',
    keyframeSelected: '#FBBF24',
    onionBefore: '#FF6B6B',
    onionAfter: '#4ECDC4',
  },
} as const;

// ============================================================================
// Spacing Tokens
// ============================================================================

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

// ============================================================================
// Typography Tokens
// ============================================================================

export const typography = {
  fontFamily: {
    ui: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  },
  fontSize: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    '2xl': 24,
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

// ============================================================================
// Border Radius Tokens
// ============================================================================

export const borderRadius = {
  none: 0,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
} as const;

// ============================================================================
// Shadow Tokens
// ============================================================================

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.5)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.5)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.5)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
} as const;

// ============================================================================
// Animation Tokens
// ============================================================================

export const animation = {
  duration: {
    fast: 100,
    normal: 200,
    slow: 300,
  },
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

// ============================================================================
// Z-Index Tokens
// ============================================================================

export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  modal: 300,
  popover: 400,
  tooltip: 500,
} as const;

// ============================================================================
// CSS Variables Generator
// ============================================================================

export function generateCSSVariables(): string {
  return `
:root {
  /* Colors - Background */
  --color-bg-primary: ${colors.bg.primary};
  --color-bg-secondary: ${colors.bg.secondary};
  --color-bg-tertiary: ${colors.bg.tertiary};
  --color-bg-elevated: ${colors.bg.elevated};
  --color-bg-hover: ${colors.bg.hover};
  --color-bg-active: ${colors.bg.active};

  /* Colors - Text */
  --color-text-primary: ${colors.text.primary};
  --color-text-secondary: ${colors.text.secondary};
  --color-text-tertiary: ${colors.text.tertiary};
  --color-text-disabled: ${colors.text.disabled};
  --color-text-inverse: ${colors.text.inverse};

  /* Colors - Border */
  --color-border-default: ${colors.border.default};
  --color-border-subtle: ${colors.border.subtle};
  --color-border-strong: ${colors.border.strong};
  --color-border-focus: ${colors.border.focus};

  /* Colors - Accent */
  --color-accent-primary: ${colors.accent.primary};
  --color-accent-primary-hover: ${colors.accent.primaryHover};
  --color-accent-primary-active: ${colors.accent.primaryActive};
  --color-accent-secondary: ${colors.accent.secondary};
  --color-accent-success: ${colors.accent.success};
  --color-accent-warning: ${colors.accent.warning};
  --color-accent-error: ${colors.accent.error};

  /* Colors - Timeline */
  --color-timeline-playhead: ${colors.timeline.playhead};
  --color-timeline-keyframe: ${colors.timeline.keyframe};
  --color-timeline-keyframe-selected: ${colors.timeline.keyframeSelected};
  --color-timeline-onion-before: ${colors.timeline.onionBefore};
  --color-timeline-onion-after: ${colors.timeline.onionAfter};

  /* Spacing */
  --space-xs: ${spacing.xs}px;
  --space-sm: ${spacing.sm}px;
  --space-md: ${spacing.md}px;
  --space-lg: ${spacing.lg}px;
  --space-xl: ${spacing.xl}px;
  --space-2xl: ${spacing['2xl']}px;
  --space-3xl: ${spacing['3xl']}px;

  /* Typography */
  --font-family-ui: ${typography.fontFamily.ui};
  --font-family-mono: ${typography.fontFamily.mono};
  --font-size-xs: ${typography.fontSize.xs}px;
  --font-size-sm: ${typography.fontSize.sm}px;
  --font-size-md: ${typography.fontSize.md}px;
  --font-size-lg: ${typography.fontSize.lg}px;
  --font-size-xl: ${typography.fontSize.xl}px;
  --font-size-2xl: ${typography.fontSize['2xl']}px;

  /* Border Radius */
  --radius-none: ${borderRadius.none}px;
  --radius-sm: ${borderRadius.sm}px;
  --radius-md: ${borderRadius.md}px;
  --radius-lg: ${borderRadius.lg}px;
  --radius-xl: ${borderRadius.xl}px;
  --radius-full: ${borderRadius.full}px;

  /* Shadows */
  --shadow-sm: ${shadows.sm};
  --shadow-md: ${shadows.md};
  --shadow-lg: ${shadows.lg};
  --shadow-xl: ${shadows.xl};

  /* Animation */
  --duration-fast: ${animation.duration.fast}ms;
  --duration-normal: ${animation.duration.normal}ms;
  --duration-slow: ${animation.duration.slow}ms;
  --easing-default: ${animation.easing.default};
  --easing-in: ${animation.easing.in};
  --easing-out: ${animation.easing.out};
  --easing-in-out: ${animation.easing.inOut};

  /* Z-Index */
  --z-base: ${zIndex.base};
  --z-dropdown: ${zIndex.dropdown};
  --z-sticky: ${zIndex.sticky};
  --z-modal: ${zIndex.modal};
  --z-popover: ${zIndex.popover};
  --z-tooltip: ${zIndex.tooltip};
}
`.trim();
}

// ============================================================================
// Theme Type
// ============================================================================

export interface Theme {
  colors: typeof colors;
  spacing: typeof spacing;
  typography: typeof typography;
  borderRadius: typeof borderRadius;
  shadows: typeof shadows;
  animation: typeof animation;
  zIndex: typeof zIndex;
}

export const theme: Theme = {
  colors,
  spacing,
  typography,
  borderRadius,
  shadows,
  animation,
  zIndex,
};

export default theme;
