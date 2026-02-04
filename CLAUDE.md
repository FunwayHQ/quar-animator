# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Quar Animator is a free, open-source, web-native 2D animation platform designed to fill the gap left by Adobe Animate's discontinuation. It's part of the QUAR Suite (alongside Quar Editor for 3D and Quar Vector for 2D illustration).

**Current Status**: Pre-development/planning phase. The comprehensive PRD (`Quar-Animator-PRD.md`) defines all specifications, but implementation has not started.

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Vector Rasterization | ThorVG (WASM) | Path tessellation, Lottie parsing |
| GPU Rendering | WebGL 2 / WebGPU | Mesh deformation, skinning shaders |
| Physics | Rapier (WASM) | Dynamic secondary motion, cloth/hair |
| Video Export | FFmpeg.wasm | Client-side MP4, WebM, GIF encoding |
| UI Framework | React + TypeScript | Component architecture |
| Desktop Wrapper | Electron | Native file access, menu integration |

## Architecture

The application is designed as five interconnected modules:

1. **Canvas & Vector Engine** - Drawing tools, vector editing, mesh generation (shares DNA with Quar Vector)
2. **Timeline & Animation** - Unified interpolation engine (no fragmented tween types), dope sheet, graph editor, onion skinning
3. **Rigging Laboratory** - Bone tools, FABRIK IK solver, weight painting, Smart Bones constraints, Vitruvian Bones
4. **State Machines** - Visual node-based editor for interactive animations without code
5. **Asset Management** - Symbol library with instances/overrides, multi-format import

## File Format

Native format is `.quar` based on glTF 2.0 with custom extensions:
- `QUAR_2d_shapes` - Bezier path data
- `QUAR_smart_constraints` - Smart Bones dependency graph
- `QUAR_vitruvian` - Bone group visibility switching
- `QUAR_state_machines` - Interactive state machine definitions

## Key Algorithms

- **IK Solver**: FABRIK (Forward And Backward Reaching Inverse Kinematics) - chosen for web performance, no matrix inversion
- **Auto-Rigging**: Bounded Biharmonic Weights for automatic smooth skinning
- **Physics**: Rapier WASM for deterministic cross-platform simulation

## Rendering Pipeline

```
Vector Path (Bezier) → WASM Tessellation → WebGL Vertex Buffers → GPU Skinning Shaders
```

ThorVG handles vector rasterization in WASM for 6-10x performance over JavaScript. Target: 60fps with 200+ mesh-deforming characters.

## Export Formats

Priority order:
- **P0**: Lottie JSON, dotLottie, GIF, PNG Sequence
- **P1**: Sprite Sheet, MP4, WebM, SVG+SMIL
- **P2**: Spine JSON, APNG, glTF/GLB, DragonBones

## Development Phases

| Phase | Focus |
|-------|-------|
| 1 (Months 1-6) | Vector animation with Lottie export |
| 2 (Months 7-12) | Rigging engine with Smart Bones |
| 3 (Months 13-18) | State machines & audio sync |
| 4 (Months 19-24) | Ecosystem integration |

## Design Principles

- **Progressive Disclosure**: Simple interface revealing complexity as needed
- **QUAR Family Consistency**: Shared patterns across suite
- **Keyboard-First**: Comprehensive shortcuts (V=Selection, P=Pen, B=Brush, Space=Play)
- **Dark Mode Default**: For extended sessions
