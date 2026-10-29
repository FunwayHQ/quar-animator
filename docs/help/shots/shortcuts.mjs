/**
 * Pictures for "Keyboard shortcuts" (shortcuts.md).
 */

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'shortcuts-dialog',
    about: 'Help › Keyboard Shortcuts: the main shortcuts, in a dialog',
    steps: [
      { open: 'tutorial-draw-and-animate' },
      { click: '[data-testid="menu-help"]' },
      { click: '[data-testid="help-menu-dropdown"] >> text=Keyboard Shortcuts' },
      { waitFor: 'role=dialog[name="Keyboard Shortcuts"]' },
    ],
    capture: { selector: 'role=dialog[name="Keyboard Shortcuts"]', padding: 12 },
  },
];
