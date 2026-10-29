/**
 * Design tokens and theme for Quar Animator
 *
 * These mirror the custom properties the editor itself uses, in
 * apps/web/src/styles/globals.css (the source of truth): the dark theme in
 * `:root`, and the light theme's overrides in `:root[data-theme='light']`.
 * theme.test.ts checks that they stay the same.
 */

// ============================================================================
// Color Tokens
// ============================================================================

export const colors = {
  // Background colors (warm charcoal blacks)
  bg: {
    primary: '#0a0a0b',
    secondary: '#111113',
    tertiary: '#18181b',
    elevated: '#1f1f23',
    hover: 'rgba(255, 255, 255, 0.04)',
    active: 'rgba(255, 255, 255, 0.08)',
    canvas: '#09090a',
  },

  // Panel and surface finishes
  surface: {
    panelGradientEnd: 'rgba(17, 17, 19, 0.98)',
    highlight: 'rgba(255, 255, 255, 0.04)',
    sheen: 'rgba(255, 255, 255, 0.03)',
    canvasVignette: 'rgba(0, 0, 0, 0.15)',
    scrollbarThumb: 'rgba(255, 255, 255, 0.1)',
    scrollbarThumbHover: 'rgba(255, 255, 255, 0.2)',
  },

  // Glass effect backgrounds
  glass: {
    background: 'rgba(17, 17, 19, 0.85)',
    border: 'rgba(255, 255, 255, 0.06)',
    highlight: 'rgba(255, 255, 255, 0.03)',
  },

  // Text colors (warmer whites)
  text: {
    primary: '#fafaf9',
    secondary: '#a1a1aa',
    tertiary: '#71717a',
    disabled: '#3f3f46',
    inverse: '#0a0a0b',
  },

  // Border colors
  border: {
    default: 'rgba(255, 255, 255, 0.08)',
    subtle: 'rgba(255, 255, 255, 0.04)',
    strong: 'rgba(255, 255, 255, 0.12)',
    focus: '#e89b47',
  },

  // Accent colors (violet and bordeaux)
  accent: {
    primary: '#a855f7',
    primaryHover: '#c084fc',
    primaryActive: '#9333ea',
    primaryGlow: 'rgba(168, 85, 247, 0.3)',
    /** The logo's corner marks */
    logoFrame: '#eef0ff',
    secondary: '#9f1239',
    secondaryGlow: 'rgba(159, 18, 57, 0.3)',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#fb7185',
  },

  // Timeline colors
  timeline: {
    playhead: '#fb7185',
    keyframe: '#a855f7',
    keyframeSelected: '#c084fc',
    keyframeGlow: 'rgba(168, 85, 247, 0.4)',
    onionBefore: 'rgba(251, 113, 133, 0.6)',
    onionAfter: 'rgba(52, 211, 153, 0.6)',
    workArea: 'rgba(168, 85, 247, 0.15)',
    workAreaBorder: 'rgba(168, 85, 247, 0.6)',
    workAreaBar: 'rgba(168, 85, 247, 0.35)',
    // Sound clips: teal, apart from the violet keyframes
    sound: '#2dd4bf',
    soundFill: 'rgba(45, 212, 191, 0.13)',
    soundFillSelected: 'rgba(45, 212, 191, 0.24)',
    soundWave: 'rgba(94, 234, 212, 0.62)',
    video: '#fb923c',
    videoFill: 'rgba(251, 146, 60, 0.15)',
    videoFillSelected: 'rgba(251, 146, 60, 0.28)',
    videoPerforation: 'rgba(9, 9, 11, 0.62)',
  },

  // Keyframe indicators in the properties panel
  keyframe: {
    active: '#f5a623',
  },
} as const;

/** A full set of colors, shaped like `colors`, for another theme. */
export type ColorTokens = {
  readonly [Group in keyof typeof colors]: {
    readonly [Name in keyof (typeof colors)[Group]]: string;
  };
};

/** The light theme's colors. */
export const lightColors: ColorTokens = {
  bg: {
    primary: '#f3f4f6',
    secondary: '#fafafa',
    tertiary: '#f0f1f4',
    elevated: '#ffffff',
    hover: 'rgba(24, 24, 27, 0.045)',
    active: 'rgba(24, 24, 27, 0.08)',
    canvas: '#e4e7ec',
  },
  surface: {
    panelGradientEnd: 'rgba(250, 250, 250, 0.98)',
    highlight: 'rgba(24, 24, 27, 0.045)',
    sheen: 'rgba(24, 24, 27, 0.025)',
    canvasVignette: 'rgba(24, 24, 27, 0.08)',
    scrollbarThumb: 'rgba(24, 24, 27, 0.16)',
    scrollbarThumbHover: 'rgba(24, 24, 27, 0.28)',
  },
  glass: {
    background: 'rgba(250, 250, 250, 0.9)',
    border: 'rgba(24, 24, 27, 0.1)',
    highlight: 'rgba(255, 255, 255, 0.82)',
  },
  text: {
    primary: '#18181b',
    secondary: '#52525b',
    tertiary: '#71717a',
    disabled: '#a1a1aa',
    inverse: '#ffffff',
  },
  border: {
    default: 'rgba(24, 24, 27, 0.1)',
    subtle: 'rgba(24, 24, 27, 0.065)',
    strong: 'rgba(24, 24, 27, 0.16)',
    focus: '#b45309',
  },
  accent: {
    primary: '#7c3aed',
    primaryHover: '#6d28d9',
    primaryActive: '#5b21b6',
    primaryGlow: 'rgba(124, 58, 237, 0.2)',
    logoFrame: '#1e1b2e',
    secondary: '#be123c',
    secondaryGlow: 'rgba(190, 18, 60, 0.18)',
    success: '#059669',
    warning: '#b45309',
    error: '#e11d48',
  },
  timeline: {
    playhead: '#e11d48',
    keyframe: '#7c3aed',
    keyframeSelected: '#6d28d9',
    keyframeGlow: 'rgba(124, 58, 237, 0.26)',
    onionBefore: 'rgba(225, 29, 72, 0.55)',
    onionAfter: 'rgba(5, 150, 105, 0.55)',
    workArea: 'rgba(124, 58, 237, 0.12)',
    workAreaBorder: 'rgba(124, 58, 237, 0.55)',
    workAreaBar: 'rgba(124, 58, 237, 0.32)',
    sound: '#0f766e',
    soundFill: 'rgba(13, 148, 136, 0.11)',
    soundFillSelected: 'rgba(13, 148, 136, 0.22)',
    soundWave: 'rgba(15, 118, 110, 0.55)',
    video: '#c2410c',
    videoFill: 'rgba(234, 88, 12, 0.11)',
    videoFillSelected: 'rgba(234, 88, 12, 0.22)',
    videoPerforation: 'rgba(255, 255, 255, 0.78)',
  },
  keyframe: {
    active: '#b45309',
  },
};

// ============================================================================
// Spacing Tokens
// ============================================================================

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

// ============================================================================
// Typography Tokens
// ============================================================================

export const typography = {
  fontFamily: {
    ui: "'DM Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    mono: "'IBM Plex Mono', 'SF Mono', 'Consolas', monospace",
  },
  fontSize: {
    '2xs': 9,
    xs: 10,
    sm: 11,
    md: 13,
    lg: 15,
    xl: 18,
    '2xl': 24,
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
  },
  // Not a custom property in the app: its body text uses 1.5.
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
  xs: 3,
  sm: 5,
  md: 8,
  lg: 10,
  xl: 14,
  full: 9999,
} as const;

// ============================================================================
// Shadow Tokens
// ============================================================================

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
  md: '0 4px 12px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.25)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3)',
  xl: '0 16px 48px rgba(0, 0, 0, 0.45), 0 4px 16px rgba(0, 0, 0, 0.35)',
  glow: '0 0 20px var(--color-accent-primary-glow)',
  inset: 'inset 0 1px 0 var(--color-glass-highlight)',
} as const;

/**
 * The light theme's drop shadows. The glow and inset follow the light
 * colors through the custom properties they use.
 */
export const lightShadows: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: '0 1px 2px rgba(24, 24, 27, 0.08)',
  md: '0 4px 12px rgba(24, 24, 27, 0.1), 0 1px 3px rgba(24, 24, 27, 0.06)',
  lg: '0 8px 24px rgba(24, 24, 27, 0.12), 0 2px 8px rgba(24, 24, 27, 0.06)',
  xl: '0 16px 48px rgba(24, 24, 27, 0.16), 0 4px 16px rgba(24, 24, 27, 0.08)',
};

// ============================================================================
// Animation Tokens
// ============================================================================

export const animation = {
  duration: {
    instant: 50,
    fast: 120,
    normal: 200,
    slow: 350,
    slower: 500,
  },
  easing: {
    default: 'cubic-bezier(0.2, 0, 0, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

// ============================================================================
// Z-Index Tokens
// ============================================================================

/** Stacking order, lowest first: tooltips sit above everything else. */
export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  overlay: 1000,
  contextMenu: 1010,
  popover: 1020,
  modal: 1030,
  colorPicker: 1040,
  tooltip: 1050,
} as const;

// ============================================================================
// Effect Tokens
// ============================================================================

/** How strongly the film-grain noise shows over the editor. */
export const noiseOpacity = { dark: 0.015, light: 0.006 } as const;

// ============================================================================
// CSS Variables Generator
// ============================================================================

/** The custom properties for one theme's colors. */
function colorVariables(c: ColorTokens): string {
  return `
  /* Colors - Background */
  --color-bg-primary: ${c.bg.primary};
  --color-bg-secondary: ${c.bg.secondary};
  --color-bg-tertiary: ${c.bg.tertiary};
  --color-bg-elevated: ${c.bg.elevated};
  --color-bg-hover: ${c.bg.hover};
  --color-bg-active: ${c.bg.active};
  --color-bg-canvas: ${c.bg.canvas};
  --color-panel-gradient-end: ${c.surface.panelGradientEnd};
  --color-surface-highlight: ${c.surface.highlight};
  --color-surface-sheen: ${c.surface.sheen};
  --color-canvas-vignette: ${c.surface.canvasVignette};
  --color-scrollbar-thumb: ${c.surface.scrollbarThumb};
  --color-scrollbar-thumb-hover: ${c.surface.scrollbarThumbHover};

  /* Glass effect backgrounds */
  --color-glass: ${c.glass.background};
  --color-glass-border: ${c.glass.border};
  --color-glass-highlight: ${c.glass.highlight};

  /* Colors - Text */
  --color-text-primary: ${c.text.primary};
  --color-text-secondary: ${c.text.secondary};
  --color-text-tertiary: ${c.text.tertiary};
  --color-text-disabled: ${c.text.disabled};
  --color-text-inverse: ${c.text.inverse};

  /* Colors - Border */
  --color-border-default: ${c.border.default};
  --color-border-subtle: ${c.border.subtle};
  --color-border-strong: ${c.border.strong};
  --color-border-focus: ${c.border.focus};

  /* Colors - Accent */
  --color-accent-primary: ${c.accent.primary};
  --color-logo-frame: ${c.accent.logoFrame};
  --color-accent-primary-hover: ${c.accent.primaryHover};
  --color-accent-primary-active: ${c.accent.primaryActive};
  --color-accent-primary-glow: ${c.accent.primaryGlow};
  --color-accent-secondary: ${c.accent.secondary};
  --color-accent-secondary-glow: ${c.accent.secondaryGlow};
  --color-accent-success: ${c.accent.success};
  --color-accent-warning: ${c.accent.warning};
  --color-accent-error: ${c.accent.error};

  /* Colors - Timeline */
  --color-timeline-playhead: ${c.timeline.playhead};
  --color-timeline-keyframe: ${c.timeline.keyframe};
  --color-timeline-keyframe-selected: ${c.timeline.keyframeSelected};
  --color-timeline-keyframe-glow: ${c.timeline.keyframeGlow};
  --color-timeline-onion-before: ${c.timeline.onionBefore};
  --color-timeline-onion-after: ${c.timeline.onionAfter};
  --color-timeline-work-area: ${c.timeline.workArea};
  --color-timeline-work-area-border: ${c.timeline.workAreaBorder};
  --color-timeline-work-area-bar: ${c.timeline.workAreaBar};
  --color-timeline-sound: ${c.timeline.sound};
  --color-timeline-sound-fill: ${c.timeline.soundFill};
  --color-timeline-sound-fill-selected: ${c.timeline.soundFillSelected};
  --color-timeline-sound-wave: ${c.timeline.soundWave};
  --color-timeline-video: ${c.timeline.video};
  --color-timeline-video-fill: ${c.timeline.videoFill};
  --color-timeline-video-fill-selected: ${c.timeline.videoFillSelected};
  --color-timeline-video-perforation: ${c.timeline.videoPerforation};

  /* Colors - Keyframe indicators */
  --color-keyframe-active: ${c.keyframe.active};`;
}

/**
 * The design tokens as CSS custom properties: the dark theme on `:root`
 * and the light theme's overrides on `:root[data-theme='light']`, as the
 * editor's own stylesheet has them.
 */
export function generateCSSVariables(): string {
  return `
:root {
  color-scheme: dark;
${colorVariables(colors)}

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
  --font-size-2xs: ${typography.fontSize['2xs']}px;
  --font-size-xs: ${typography.fontSize.xs}px;
  --font-size-sm: ${typography.fontSize.sm}px;
  --font-size-md: ${typography.fontSize.md}px;
  --font-size-lg: ${typography.fontSize.lg}px;
  --font-size-xl: ${typography.fontSize.xl}px;
  --font-size-2xl: ${typography.fontSize['2xl']}px;
  --font-weight-normal: ${typography.fontWeight.normal};
  --font-weight-medium: ${typography.fontWeight.medium};
  --font-weight-semibold: ${typography.fontWeight.semibold};

  /* Border Radius */
  --radius-none: ${borderRadius.none}px;
  --radius-xs: ${borderRadius.xs}px;
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
  --shadow-glow: ${shadows.glow};
  --shadow-inset: ${shadows.inset};

  /* Animation */
  --duration-instant: ${animation.duration.instant}ms;
  --duration-fast: ${animation.duration.fast}ms;
  --duration-normal: ${animation.duration.normal}ms;
  --duration-slow: ${animation.duration.slow}ms;
  --duration-slower: ${animation.duration.slower}ms;
  --easing-default: ${animation.easing.default};
  --easing-spring: ${animation.easing.spring};
  --easing-in: ${animation.easing.in};
  --easing-out: ${animation.easing.out};
  --easing-in-out: ${animation.easing.inOut};

  /* Z-Index */
  --z-base: ${zIndex.base};
  --z-dropdown: ${zIndex.dropdown};
  --z-sticky: ${zIndex.sticky};
  --z-overlay: ${zIndex.overlay};
  --z-context-menu: ${zIndex.contextMenu};
  --z-popover: ${zIndex.popover};
  --z-modal: ${zIndex.modal};
  --z-color-picker: ${zIndex.colorPicker};
  --z-tooltip: ${zIndex.tooltip};

  /* Noise texture overlay */
  --noise-opacity: ${noiseOpacity.dark};
}

:root[data-theme='light'] {
  color-scheme: light;
${colorVariables(lightColors)}

  /* Shadows */
  --shadow-sm: ${lightShadows.sm};
  --shadow-md: ${lightShadows.md};
  --shadow-lg: ${lightShadows.lg};
  --shadow-xl: ${lightShadows.xl};

  /* Noise texture overlay */
  --noise-opacity: ${noiseOpacity.light};
}
`.trim();
}

// ============================================================================
// Theme Type
// ============================================================================

export interface Theme {
  colors: typeof colors;
  lightColors: ColorTokens;
  spacing: typeof spacing;
  typography: typeof typography;
  borderRadius: typeof borderRadius;
  shadows: typeof shadows;
  lightShadows: typeof lightShadows;
  animation: typeof animation;
  zIndex: typeof zIndex;
  noiseOpacity: typeof noiseOpacity;
}

export const theme: Theme = {
  colors,
  lightColors,
  spacing,
  typography,
  borderRadius,
  shadows,
  lightShadows,
  animation,
  zIndex,
  noiseOpacity,
};

export default theme;
