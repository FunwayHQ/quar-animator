import type { ToolType } from '@quar/types';
import { useActiveTool, useSetActiveTool } from '../../stores/editorStore';
import styles from './Toolbar.module.css';

interface ToolButtonProps {
  tool: ToolType;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  active: boolean;
  onClick: () => void;
}

function ToolButton({ tool, icon, label, shortcut, active, onClick }: ToolButtonProps) {
  return (
    <button
      className={`${styles.toolButton} ${active ? styles.active : ''}`}
      onClick={onClick}
      title={`${label} (${shortcut})`}
      aria-pressed={active}
      data-tool={tool}
    >
      {icon}
    </button>
  );
}

// Simple SVG icons
const icons = {
  selection: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    </svg>
  ),
  'direct-selection': (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
      <circle cx="17" cy="17" r="3" />
    </svg>
  ),
  rectangle: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  ),
  ellipse: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <ellipse cx="12" cy="12" rx="9" ry="9" />
    </svg>
  ),
  polygon: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="12,2 22,8.5 18,21 6,21 2,8.5" />
    </svg>
  ),
  star: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    </svg>
  ),
  pen: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    </svg>
  ),
  brush: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
      <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
    </svg>
  ),
  eraser: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M7 21h10" />
      <path d="M5.5 12.5L12 6l6.5 6.5-3 3-7-7z" />
      <path d="M5.5 12.5l-2 2a2.12 2.12 0 0 0 0 3l2.5 2.5a2.12 2.12 0 0 0 3 0l2-2" />
    </svg>
  ),
  text: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </svg>
  ),
  bone: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z" />
    </svg>
  ),
};

const tools: Array<{ type: ToolType; icon: React.ReactNode; label: string; shortcut: string }> = [
  { type: 'selection', icon: icons.selection, label: 'Selection', shortcut: 'V' },
  {
    type: 'direct-selection',
    icon: icons['direct-selection'],
    label: 'Direct Selection',
    shortcut: 'A',
  },
  { type: 'rectangle', icon: icons.rectangle, label: 'Rectangle', shortcut: 'R' },
  { type: 'ellipse', icon: icons.ellipse, label: 'Ellipse', shortcut: 'O' },
  { type: 'polygon', icon: icons.polygon, label: 'Polygon', shortcut: 'U' },
  { type: 'pen', icon: icons.pen, label: 'Pen', shortcut: 'P' },
  { type: 'brush', icon: icons.brush, label: 'Brush', shortcut: 'B' },
  { type: 'eraser', icon: icons.eraser, label: 'Eraser', shortcut: 'E' },
  { type: 'text', icon: icons.text, label: 'Text', shortcut: 'T' },
  { type: 'bone', icon: icons.bone, label: 'Bone', shortcut: 'Shift+B' },
];

export function Toolbar() {
  const activeTool = useActiveTool();
  const setActiveTool = useSetActiveTool();

  return (
    <aside className={styles.toolbar}>
      <div className={styles.toolGroup}>
        {tools.map((tool) => (
          <ToolButton
            key={tool.type}
            tool={tool.type}
            icon={tool.icon}
            label={tool.label}
            shortcut={tool.shortcut}
            active={activeTool === tool.type}
            onClick={() => setActiveTool(tool.type)}
          />
        ))}
      </div>
    </aside>
  );
}

export default Toolbar;
