import type { Preview } from '@storybook/react';
import { themes } from '@storybook/theming';

// Global styles
const globalStyles = `
:root {
  /* Colors - Background */
  --color-bg-primary: #0D0D0D;
  --color-bg-secondary: #1A1A1A;
  --color-bg-tertiary: #262626;
  --color-bg-elevated: #2D2D2D;
  --color-bg-hover: #333333;
  --color-bg-active: #404040;

  /* Colors - Text */
  --color-text-primary: #FFFFFF;
  --color-text-secondary: #A3A3A3;
  --color-text-tertiary: #737373;
  --color-text-disabled: #525252;
  --color-text-inverse: #0D0D0D;

  /* Colors - Border */
  --color-border-default: #333333;
  --color-border-subtle: #262626;
  --color-border-strong: #404040;
  --color-border-focus: #3B82F6;

  /* Colors - Accent */
  --color-accent-primary: #3B82F6;
  --color-accent-primary-hover: #2563EB;
  --color-accent-primary-active: #1D4ED8;
  --color-accent-secondary: #8B5CF6;
  --color-accent-success: #22C55E;
  --color-accent-warning: #F59E0B;
  --color-accent-error: #EF4444;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Typography */
  --font-family-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-family-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  --font-size-xs: 10px;
  --font-size-sm: 12px;
  --font-size-md: 14px;
  --font-size-lg: 16px;

  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-full: 9999px;

  /* Animation */
  --duration-fast: 100ms;
  --duration-normal: 200ms;
  --easing-default: cubic-bezier(0.4, 0, 0.2, 1);
}

body {
  font-family: var(--font-family-ui);
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
}
`;

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#0D0D0D' },
        { name: 'light', value: '#FFFFFF' },
      ],
    },
    docs: {
      theme: themes.dark,
    },
  },
  decorators: [
    (Story) => {
      // Inject global styles
      const styleId = 'quar-global-styles';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = globalStyles;
        document.head.appendChild(style);
      }
      return Story();
    },
  ],
};

export default preview;
