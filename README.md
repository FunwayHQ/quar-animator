# Quar Animator

<div align="center">

![Version](https://img.shields.io/badge/version-0.1.0-violet)
![License](https://img.shields.io/badge/license-MIT-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![React](https://img.shields.io/badge/React-18-61dafb)
![WebGL](https://img.shields.io/badge/WebGL-2.0-red)
![Tests](https://img.shields.io/badge/tests-891%20passing-brightgreen)

**Free, open-source, web-native 2D animation platform**

_Filling the gap left by Adobe Animate's discontinuation_

[Getting Started](#getting-started) | [Features](#features) | [Documentation](#documentation) | [Contributing](#contributing)

</div>

---

## Overview

Quar Animator is a professional-grade 2D animation tool that runs entirely in your browser. Part of the **QUAR Suite** (alongside Quar Editor for 3D and Quar Vector for 2D illustration), it brings powerful vector animation capabilities to the web with a focus on performance, extensibility, and modern workflows.

### Key Highlights

- **Web-Native**: No installation required, works in any modern browser
- **WebGL 2 Rendering**: Hardware-accelerated graphics for smooth 60fps playback
- **Lottie Export**: First-class support for the industry-standard animation format
- **Professional Tools**: Pen, brush, shape tools with bezier curve editing
- **Modern UI**: Dark theme with violet accent, keyboard-first design

---

## Getting Started

### Prerequisites

- **Node.js** 18.0.0 or higher
- **pnpm** 8.0.0 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/FunwayHQ/quar-animator.git
cd quar-animator

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The app will be available at `http://localhost:3000`

### Development Commands

| Command          | Description                        |
| ---------------- | ---------------------------------- |
| `pnpm dev`       | Start development server           |
| `pnpm build`     | Build all packages for production  |
| `pnpm test`      | Run all tests                      |
| `pnpm storybook` | Launch Storybook component library |
| `pnpm lint`      | Run ESLint                         |
| `pnpm typecheck` | TypeScript type checking           |
| `pnpm format`    | Format code with Prettier          |

---

## Features

### Drawing Tools

| Tool             | Shortcut | Description                                       |
| ---------------- | -------- | ------------------------------------------------- |
| Selection        | `V`      | Select, move, resize, and rotate objects          |
| Direct Selection | `A`      | Edit individual path points and handles           |
| Rectangle        | `R`      | Draw rectangles (Shift: square, Alt: from center) |
| Ellipse          | `O`      | Draw ellipses (Shift: circle, Alt: from center)   |
| Polygon          | `U`      | Draw regular polygons (3-12 sides)                |
| Star             | `S`      | Draw star shapes with configurable inner radius   |
| Pen              | `P`      | Create bezier paths with smooth/corner points     |
| Brush            | `B`      | Freehand drawing with pressure sensitivity        |
| Eraser           | `E`      | Remove paths or individual points                 |

### Canvas Navigation

| Action      | Input                             |
| ----------- | --------------------------------- |
| Pan         | Middle-click drag or Space + drag |
| Zoom        | Mouse wheel or `+`/`-` keys       |
| Fit to view | `Ctrl+0`                          |
| Reset zoom  | `Ctrl+1`                          |

### Selection & Transform

- **Click** to select objects
- **Shift+Click** to add/remove from selection
- **Drag** on canvas for marquee selection
- **Arrow keys** to nudge selected objects (Shift for 10px)
- **Delete/Backspace** to remove selected objects
- **Transform handles** for resize and rotation

---

## Architecture

### Monorepo Structure

```
quar-animator/
├── apps/
│   └── web/                 # Main React application
├── packages/
│   ├── core/                # Rendering, tools, scene graph
│   ├── types/               # Shared TypeScript types
│   └── ui/                  # Reusable UI components
└── ...
```

### Technology Stack

| Layer            | Technology                | Purpose                        |
| ---------------- | ------------------------- | ------------------------------ |
| UI Framework     | React 18 + TypeScript     | Component architecture         |
| State Management | Zustand                   | Lightweight, hooks-based store |
| Rendering        | WebGL 2                   | Hardware-accelerated graphics  |
| Math             | Custom (vec2, mat3, rect) | Coordinate transforms          |
| Testing          | Vitest + RTL              | Unit and component tests       |
| Styling          | CSS Modules               | Scoped component styles        |
| Icons            | Lucide React              | Consistent icon library        |

### Core Modules

1. **Canvas & Vector Engine** - Drawing tools, bezier paths, shape rendering
2. **Selection System** - Multi-select, transform handles, bounds calculation
3. **Scene Graph** - Hierarchical node management with events
4. **Tool System** - Extensible tool architecture with state management

### Rendering Pipeline

```
Vector Path (Bezier) → Earcut Tessellation → WebGL Vertex Buffers → GPU Rendering
```

---

## Project Status

### Completed Sprints

| Sprint | Focus                                   | Tests |
| ------ | --------------------------------------- | ----- |
| 1      | Project Setup & Architecture            | 57    |
| 2      | Design System & UI Components           | 89    |
| 3      | Canvas Foundation (WebGL, Camera, Grid) | 221   |
| 3.5    | Bug Fixes & UI Refresh                  | -     |
| 4      | Vector Drawing Foundation               | 308   |
| 5      | Shape Tools (Polygon, Star)             | 71    |
| 6      | Path Editing (Direct Selection)         | 36    |
| 7      | Brush & Eraser Tools                    | 77    |

**Total Test Coverage: 891 tests** (736 core + 155 web)

### Roadmap

| Phase   | Timeline     | Focus                               |
| ------- | ------------ | ----------------------------------- |
| Phase 1 | Months 1-6   | Vector animation with Lottie export |
| Phase 2 | Months 7-12  | Rigging engine with Smart Bones     |
| Phase 3 | Months 13-18 | State machines & audio sync         |
| Phase 4 | Months 19-24 | Ecosystem integration               |

---

## File Format

Native format is `.quar` based on **glTF 2.0** with custom extensions:

- `QUAR_2d_shapes` - Bezier path data
- `QUAR_smart_constraints` - Smart Bones dependency graph
- `QUAR_vitruvian` - Bone group visibility switching
- `QUAR_state_machines` - Interactive state machine definitions

### Export Formats

**Priority 0 (Core)**

- Lottie JSON / dotLottie
- GIF
- PNG Sequence

**Priority 1 (Standard)**

- Sprite Sheet
- MP4 / WebM
- SVG+SMIL

**Priority 2 (Extended)**

- Spine JSON
- APNG
- glTF/GLB
- DragonBones

---

## Design System

### Color Palette

| Color      | Hex       | Usage                         |
| ---------- | --------- | ----------------------------- |
| Primary    | `#A855F7` | Interactive elements, accents |
| Secondary  | `#831843` | Bordeaux highlights           |
| Background | `#0A0A0B` | Main canvas background        |
| Surface    | `#141416` | Panel backgrounds             |
| Border     | `#2A2A2E` | Subtle dividers               |

### Typography

- **UI Font**: DM Sans
- **Mono Font**: IBM Plex Mono (for numerical values)

### Design Principles

- **Progressive Disclosure**: Simple interface revealing complexity as needed
- **Keyboard-First**: Comprehensive shortcuts for power users
- **Dark Mode Default**: Optimized for extended creative sessions
- **QUAR Family Consistency**: Shared patterns across the suite

---

## Contributing

We welcome contributions! Please read our contributing guidelines before submitting PRs.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `pnpm test`
5. Commit with conventional commits: `git commit -m "feat: add amazing feature"`
6. Push and open a PR

### Code Style

- TypeScript strict mode enabled
- ESLint + Prettier for formatting
- Husky pre-commit hooks enforce quality

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- **Earcut** - Polygon triangulation
- **Lucide** - Beautiful icons
- **Zustand** - State management
- The open-source community

---

<div align="center">

**Built with passion by the QUAR Team**

[Website](https://quar.dev) | [Discord](https://discord.gg/quar) | [Twitter](https://twitter.com/quardev)

</div>
