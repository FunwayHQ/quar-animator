import type { Preview } from '@storybook/react';
import { generateCSSVariables } from '../src/theme';

// The design tokens come from theme.ts, which mirrors the editor's own
// stylesheet; these are the page styles and the animations the components
// use.
const globalStyles = `
${generateCSSVariables()}

body {
  font-family: var(--font-family-ui);
  font-size: var(--font-size-md);
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Editor theme',
      defaultValue: 'dark',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // The page background follows the theme, as in the editor.
    backgrounds: { disable: true },
    docs: {},
  },
  decorators: [
    (Story, context) => {
      // Inject global styles
      const styleId = 'quar-global-styles';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = globalStyles;
        document.head.appendChild(style);
      }
      // The editor switches themes the same way: data-theme on <html>.
      document.documentElement.dataset.theme = context.globals.theme === 'light' ? 'light' : 'dark';
      return Story();
    },
  ],
};

export default preview;
