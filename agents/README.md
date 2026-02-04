# Quar Animator AI Agents

This directory contains agent definitions for AI-assisted development of Quar Animator. Each agent has a specialized role and set of responsibilities.

## Agent Overview

| Agent | Role | Primary Tools |
|-------|------|---------------|
| [Project Lead](./project-lead.md) | Architecture, coordination, technical decisions | Code analysis, planning |
| [Frontend Designer](./frontend-designer.md) | UI/UX design, component styling | `/frontend-design` skill |
| [Core Engine](./core-engine.md) | ThorVG, WebGL, WASM integration | Rust/C++, WebAssembly |
| [Animation System](./animation-system.md) | Timeline, keyframes, interpolation | TypeScript, React |
| [Rigging Engine](./rigging-engine.md) | Bones, IK, weight painting | TypeScript, WebGL shaders |
| [State Machine](./state-machine.md) | Visual editor, transitions | React, state management |
| [Export Pipeline](./export-pipeline.md) | Lottie, video, sprite sheets | FFmpeg.wasm, file formats |
| [QA Tester](./qa-tester.md) | Manual & automated testing | Playwright MCP |
| [Documentation](./documentation.md) | API docs, tutorials, guides | Markdown, examples |

## Usage

Each agent file contains:
- **Role Description**: What the agent is responsible for
- **Context**: Required knowledge and codebase familiarity
- **Capabilities**: Tools and skills available
- **Guidelines**: How to approach tasks
- **Example Prompts**: Common task patterns

## Invoking Agents

Agents can be invoked via Claude Code's Task tool with their specific context loaded:

```
Use the [Agent Name] agent to [task description]
```

Or by referencing their definition file directly in conversation context.
