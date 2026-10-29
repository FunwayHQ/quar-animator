/**
 * The editor's keyboard shortcuts in one place: the keys the menus show
 * beside their items, and the full list Help › Keyboard Shortcuts shows,
 * grouped as the user guide's Keyboard shortcuts chapter has them
 * (docs/help/shortcuts.md; a test checks the two list the same keys).
 *
 * Keys are written as Windows and Linux show them ("Ctrl+Shift+Z", "Up",
 * "PageDown"); formatShortcut() shows them as this computer's keyboard has
 * them: on a Mac ⌘ for Ctrl (the editor takes either), ⌥ for Alt and ⇧ for
 * Shift, as Mac apps print them ("⇧⌘Z").
 */

/** The keys the menus show, so a menu and the list can't tell different keys. */
export const KEYS = {
  // Files
  newProject: 'Ctrl+N',
  openProject: 'Ctrl+O',
  save: 'Ctrl+S',
  saveAs: 'Ctrl+Shift+S',
  importSvg: 'Ctrl+I',
  // Edit
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Shift+Z',
  redoToo: 'Ctrl+Y',
  cut: 'Ctrl+X',
  copy: 'Ctrl+C',
  paste: 'Ctrl+V',
  duplicate: 'Ctrl+D',
  delete: 'Delete',
  selectAll: 'Ctrl+A',
  createSymbol: 'Ctrl+Shift+K',
  // Arrange
  group: 'Ctrl+G',
  ungroup: 'Ctrl+Shift+G',
  bringForward: 'Ctrl+]',
  bringToFront: 'Ctrl+Shift+]',
  sendBackward: 'Ctrl+[',
  sendToBack: 'Ctrl+Shift+[',
  flipHorizontal: 'Shift+H',
  flipVertical: 'Shift+V',
  // Shapes and paths
  union: 'Ctrl+Shift+U',
  subtract: 'Ctrl+Shift+D',
  intersect: 'Ctrl+Shift+I',
  exclude: 'Ctrl+Shift+X',
  join: 'Ctrl+J',
  convertToPath: 'Ctrl+Shift+P',
  outlineStroke: 'Ctrl+Shift+O',
  // View
  zoomIn: 'Ctrl+=',
  zoomOut: 'Ctrl+-',
  zoom100: 'Ctrl+1',
  fitToWindow: 'Ctrl+0',
  rulers: 'Shift+R',
  guides: 'Shift+G',
  onionSkin: 'Shift+O',
  animationSequence: 'Shift+A',
  workArea: 'Alt+W',
  // Timeline and playback
  playPause: 'Space',
  previousFrame: ',',
  nextFrame: '.',
  back10: 'Shift+,',
  forward10: 'Shift+.',
  goToStart: 'Home',
  goToEnd: 'End',
  loop: 'L',
  autoKeyframe: 'K',
  // Tools the Rigging menu picks
  boneTool: 'J',
  weightPaintTool: 'W',
  // Help
  userGuide: 'F1',
} as const;

/** One line of the list: its keys (alternatives, or a pair such as Home / End) and what they do. */
export interface ShortcutEntry {
  keys: string[];
  /** How the keys read together: either one (default), a pair ("/") or a set (" "). */
  join?: 'or' | '/' | ' ';
  label: string;
}

export interface ShortcutGroup {
  title: string;
  entries: ShortcutEntry[];
}

const key = (keys: string, label: string): ShortcutEntry => ({ keys: [keys], label });
const either = (keys: string[], label: string): ShortcutEntry => ({ keys, label });
const pair = (keys: string[], label: string): ShortcutEntry => ({ keys, join: '/', label });
const ARROWS: ShortcutEntry['keys'] = ['Up', 'Down', 'Left', 'Right'];
const arrows = (label: string): ShortcutEntry => ({ keys: ARROWS, join: ' ', label });

/** Every key the editor knows, grouped by what you're doing. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Tools',
    entries: [
      key('V', 'Selection'),
      key('A', 'Direct Selection'),
      key('H', 'Hand'),
      key('R', 'Rectangle'),
      key('O', 'Ellipse'),
      key('U', 'Polygon'),
      key('S', 'Star'),
      key('P', 'Pen'),
      key('B', 'Brush'),
      key('E', 'Eraser'),
      key('T', 'Text'),
      key('F', 'Artboard'),
      key(KEYS.boneTool, 'Bone'),
      key(KEYS.weightPaintTool, 'Weight Paint'),
    ],
  },
  {
    title: 'While you draw',
    entries: [
      key('Shift', 'Hold: a rectangle, ellipse or artboard square, or round'),
      key('Alt', 'Hold: a shape or artboard drawn out from the middle'),
      key('Esc', 'Give up on the shape or brush stroke'),
      key('Shift', 'Hold, with the Pen: lines in steps of 45°'),
      key('Enter', 'Pen: finish the path, open'),
      either(['Backspace', 'Delete'], 'Pen: take away the last point'),
      key('Esc', 'Pen: give up on the path'),
      key('Alt+Click', 'Pen, on a point: corner or smooth'),
      key('Alt+Drag', 'Pen, dragging out a point: break its handles'),
      pair(['[', ']'], 'Eraser: smaller / bigger'),
      key('Esc', 'Bone: end the chain, back to Selection'),
    ],
  },
  {
    title: 'Files',
    entries: [
      key(KEYS.save, 'Save'),
      key(KEYS.saveAs, 'Save As…'),
      key(KEYS.openProject, 'Open Project…'),
      key(KEYS.newProject, 'New Project'),
      key(KEYS.importSvg, 'Import SVG…'),
    ],
  },
  {
    title: 'Edit',
    entries: [
      key(KEYS.undo, 'Undo'),
      either([KEYS.redo, KEYS.redoToo], 'Redo'),
      key(KEYS.cut, 'Cut'),
      key(KEYS.copy, 'Copy'),
      key(KEYS.paste, 'Paste'),
      key(KEYS.duplicate, 'Duplicate'),
      either([KEYS.delete, 'Backspace'], 'Delete'),
      key(KEYS.selectAll, 'Select All'),
      key('Esc', 'Select nothing; in a group, come out of it'),
      key(KEYS.createSymbol, 'Create Symbol'),
      key('Esc', 'Editing a symbol: back to the page'),
    ],
  },
  {
    title: 'Arrange',
    entries: [
      key(KEYS.group, 'Group'),
      key(KEYS.ungroup, 'Ungroup'),
      key(KEYS.bringForward, 'Bring Forward'),
      key(KEYS.bringToFront, 'Bring to Front'),
      key(KEYS.sendBackward, 'Send Backward'),
      key(KEYS.sendToBack, 'Send to Back'),
      key(KEYS.flipHorizontal, 'Flip Horizontal'),
      key(KEYS.flipVertical, 'Flip Vertical'),
      arrows('Nudge by 1 (with Shift: 10)'),
    ],
  },
  {
    title: 'Shapes and paths',
    entries: [
      key(KEYS.union, 'Union'),
      key(KEYS.subtract, 'Subtract'),
      key(KEYS.intersect, 'Intersect'),
      key(KEYS.exclude, 'Exclude'),
      key(KEYS.join, 'Join'),
      key(KEYS.convertToPath, 'Convert to Path'),
      key(KEYS.outlineStroke, 'Outline Stroke'),
    ],
  },
  {
    title: 'Editing points (Direct Selection)',
    entries: [
      key('Shift+Click', 'Add a point to the selection, or take it out'),
      key(KEYS.selectAll, 'All the path’s points'),
      arrows('Move the points by 1 (with Shift: 10)'),
      either(['Delete', 'Backspace'], 'Delete the points'),
      key('Alt+Click', 'A point: corner or smooth'),
      key('Alt+Drag', 'A handle: move it alone'),
      key('Esc', 'Select no points; again: back to Selection'),
    ],
  },
  {
    title: 'Editing text',
    entries: [key('Enter', 'New line'), either(['Esc', 'Ctrl+Enter'], 'Finish, keeping it')],
  },
  {
    title: 'View',
    entries: [
      key(KEYS.zoomIn, 'Zoom In'),
      key(KEYS.zoomOut, 'Zoom Out'),
      key(KEYS.zoom100, 'Zoom to 100%'),
      key(KEYS.fitToWindow, 'Fit to Window'),
      key('Space+Drag', 'Pan the canvas'),
      key('Shift+Scroll', 'Pan left and right'),
      key(KEYS.rulers, 'Show Rulers'),
      key(KEYS.guides, 'Show Guides'),
      key('Delete', 'On a guide: remove it'),
    ],
  },
  {
    title: 'Timeline and playback',
    entries: [
      key(KEYS.playPause, 'Play / Pause'),
      pair([KEYS.goToStart, KEYS.goToEnd], 'Go to the start / the end'),
      pair([KEYS.previousFrame, KEYS.nextFrame], 'Previous / next frame'),
      pair([KEYS.back10, KEYS.forward10], '10 frames back / on'),
      key(KEYS.loop, 'Loop Playback'),
      key(KEYS.autoKeyframe, 'Auto-Keyframe'),
      key('G', 'Graph editor, and back'),
      pair(['I', 'Shift+I'], 'Work area: start / end it here'),
      key(KEYS.workArea, 'Work area on or off'),
      key(KEYS.onionSkin, 'Onion Skinning'),
      key(KEYS.animationSequence, 'Animation Sequence window'),
    ],
  },
  {
    title: 'Timeline rows',
    entries: [
      key('Delete', 'Delete the selected keyframes'),
      key(KEYS.copy, 'Copy them'),
      key(KEYS.paste, 'Paste them at the playhead'),
    ],
  },
  {
    title: 'Graph editor',
    entries: [
      key('Delete', 'Delete the selected keyframes'),
      pair(['Left', 'Right'], 'Move them a frame (with Shift: 10)'),
      pair(['Up', 'Down'], 'Change their value by 1 (with Shift: 10)'),
    ],
  },
  {
    title: 'Sound lane',
    entries: [
      key('Delete', 'Remove the clip'),
      pair(['Left', 'Right'], 'Move it a frame (with Shift: 10)'),
      key('M', 'Mute it, or turn it on again'),
      key('Enter', 'Its settings'),
    ],
  },
  {
    title: 'Rigging',
    entries: [
      pair(['[', ']'], 'Weight Paint: brush smaller / bigger'),
      key('X', 'Weight Paint: add or take away weight'),
      pair(['[', ']'], 'Point Magnet: smaller / bigger'),
      key('F', 'Point Magnet: how its push fades'),
      key('Esc', 'Point Magnet: clear the target, start over'),
    ],
  },
  {
    title: 'Number fields',
    entries: [
      pair(['Up', 'Down'], 'Add or take away 1 (with Shift: 10)'),
      key('Right', 'On from the whole number to the decimals'),
    ],
  },
  {
    title: 'Presenting',
    entries: [
      either(['Down', 'PageDown'], 'Next slide (in a transition: skip it)'),
      either(['Up', 'PageUp'], 'Slide before; on the first, start over'),
      pair(['Home', 'End'], 'First / last slide'),
      key('Esc', 'Stop presenting'),
    ],
  },
  {
    title: 'Help',
    entries: [key(KEYS.userGuide, 'User Guide'), key('Esc', 'Close the guide')],
  },
];

/** Keys printed otherwise than they're written here. */
const KEY_LABELS: Record<string, string> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
};

const MODIFIER = /^(Ctrl|Alt|Shift)\+(?=.)/;

/** "Ctrl+Shift+Z" → its modifiers and the key they go with ("Ctrl+=" → Ctrl, "="). */
export function splitShortcut(keys: string): { modifiers: string[]; key: string } {
  const modifiers: string[] = [];
  let rest = keys;
  for (let match = MODIFIER.exec(rest); match; match = MODIFIER.exec(rest)) {
    modifiers.push(match[1] ?? '');
    rest = rest.slice(match[0].length);
  }
  return { modifiers, key: rest };
}

/** Whether this is a Mac (or an iPad), whose keyboards have ⌘ and ⌥. */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const { userAgentData } = navigator as Navigator & { userAgentData?: { platform?: string } };
  // Chrome's userAgentData says "macOS"; navigator.platform "MacIntel"
  return /mac|iphone|ipad|ipod/i.test(
    userAgentData?.platform || navigator.platform || navigator.userAgent
  );
}

/** A Mac's modifier symbols, in the order its menus print them. */
const MAC_MODIFIERS: Array<[string, string]> = [
  ['Alt', '⌥'],
  ['Shift', '⇧'],
  ['Ctrl', '⌘'],
];

/** Keys a Mac prints otherwise: its delete key is Backspace, Return is ↩. */
const MAC_KEY_LABELS: Record<string, string> = {
  Del: '⌫',
  Delete: '⌫',
  Backspace: '⌫',
  Enter: '↩',
};

/**
 * A shortcut as it's shown on this computer: "Ctrl+Shift+Z" and "Shift+↑",
 * or on a Mac "⇧⌘Z" and "⇧↑".
 */
export function formatShortcut(keys: string, mac: boolean = isMacPlatform()): string {
  const { modifiers, key } = splitShortcut(keys);
  const label = (mac ? MAC_KEY_LABELS[key] : undefined) ?? KEY_LABELS[key] ?? key;
  if (!mac) return [...modifiers, label].join('+');
  const symbols = MAC_MODIFIERS.filter(([name]) => modifiers.includes(name)).map(([, s]) => s);
  return symbols.join('') + label;
}
