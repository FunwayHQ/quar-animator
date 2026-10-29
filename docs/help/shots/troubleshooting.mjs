/**
 * Pictures for "Troubleshooting and privacy" (troubleshooting.md).
 */

const HELP_ITEM = (n) => `[data-testid="help-menu-dropdown"] > :nth-child(${n})`;

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'troubleshooting-help-menu',
    about: 'The Help menu: Use Google Fonts, the privacy policy, the terms and Report Issues',
    steps: [{ open: 'tutorial-draw-and-animate' }, { click: '[data-testid="menu-help"]' }],
    keepPointer: true,
    markers: [
      { target: HELP_ITEM(4), label: 1, at: 'right', dx: 40 },
      { target: HELP_ITEM(7), label: 2, at: 'right', dx: 40 },
      { target: HELP_ITEM(8), label: 3, at: 'right', dx: 40 },
      { target: HELP_ITEM(9), label: 4, at: 'right', dx: 40 },
    ],
    capture: {
      selectors: ['[data-testid="menu-help"]', '[data-testid="help-menu-dropdown"]'],
      padding: { top: 6, right: 56, bottom: 12, left: 12 },
    },
  },
  {
    name: 'troubleshooting-google-fonts',
    about: 'Picking a Google font the first time: the editor asks to use Google Fonts',
    steps: [
      { open: 'tutorial-text' },
      { layer: 'Title' },
      {
        run: async (page) => {
          const picker = page.locator('[data-testid="font-picker"]').first();
          await picker.scrollIntoViewIfNeeded();
          await picker.locator('button[aria-label="Show fonts"]').click();
          await page.locator('[role="option"][data-family="Roboto"]').first().click();
          await page.locator('[data-testid="prompt-dialog"]').waitFor();
          await page.waitForTimeout(300);
        },
      },
    ],
    capture: { selector: '[data-testid="prompt-dialog"]', padding: 12 },
  },
];
