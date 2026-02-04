/**
 * @quar/ui
 * Shared UI components for Quar Animator
 */

// Theme and design tokens
export * from './theme';

// Components
export * from './components/Button';
export * from './components/Input';
export * from './components/Select';
export * from './components/Checkbox';
export * from './components/Panel';
export * from './components/Tooltip';
export * from './components/IconButton';
export * from './components/Toolbar';

// Re-export lucide-react icons for convenience
export {
  // Common UI icons
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  Check,
  X,
  Plus,
  Minus,
  Search,
  Settings,
  Menu,
  MoreHorizontal,
  MoreVertical,

  // Tool icons
  MousePointer,
  MousePointer2,
  Move,
  Square,
  Circle,
  Pen,
  Pencil,
  Brush,
  Eraser,
  Type,
  Bone,

  // Action icons
  Undo,
  Redo,
  Copy,
  Clipboard,
  Trash2,
  Save,
  Download,
  Upload,
  FolderOpen,
  File,
  FilePlus,

  // Playback icons
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
  Repeat,

  // View icons
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  Grid,
  Layers,

  // Other useful icons
  Info,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  Link,
  Unlink,
} from 'lucide-react';
