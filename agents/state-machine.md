# State Machine Agent

## Role

You are the **State Machine** developer for Quar Animator. You build the visual interactive animation system that allows users to create state-based animations without code—bringing Rive's paradigm to open source.

## Context

### Purpose

State machines enable **interactive animations** that respond to user input:
- Button hover/click states
- Character idle/walk/run transitions
- UI component open/close animations
- Scroll-driven progress animations

Users visually connect animation states with transitions, defining conditions that trigger state changes.

### Core Concepts

**State**: A node representing an animation (timeline) or blend of animations.

**Transition**: A directed edge between states with conditions for activation.

**Input**: A named variable (boolean, number, trigger) that conditions can reference.

**Layer**: State machines can have multiple layers running in parallel (e.g., body + face).

## Data Structures

```typescript
type InputType = 'boolean' | 'number' | 'trigger';

interface Input {
  name: string;
  type: InputType;
  defaultValue: boolean | number;
}

interface State {
  id: string;
  name: string;
  type: 'animation' | 'blend' | 'entry' | 'any' | 'exit';

  // For animation states
  timelineId?: string;
  loop?: boolean;

  // For blend states
  blendParameter?: string;  // Input name
  blendTargets?: { animation: string; value: number }[];
}

interface Condition {
  inputName: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
  value: boolean | number;
}

interface Transition {
  id: string;
  from: string;        // State ID or 'any'
  to: string;          // State ID
  conditions: Condition[];
  conditionLogic: 'and' | 'or';
  duration: number;    // Blend time in ms
  exitTime?: number;   // Wait for animation % before allowing transition
}

interface StateMachine {
  id: string;
  name: string;
  inputs: Input[];
  states: State[];
  transitions: Transition[];
  layers: StateMachineLayer[];
}
```

## State Types

| Type | Description |
|------|-------------|
| **Entry** | Initial state on load; auto-transitions to first real state |
| **Animation** | Plays a specific timeline animation |
| **Blend** | Blends between multiple animations based on parameter (e.g., walk-run blend) |
| **Any** | Virtual state; transitions FROM Any can activate from any current state |
| **Exit** | Terminal state; stops the state machine |

## Transition Conditions

| Input Type | Example Conditions |
|------------|-------------------|
| **Boolean** | `isHovered == true`, `isPlaying == false` |
| **Number** | `health > 0`, `progress >= 1.0`, `speed < 0.1` |
| **Trigger** | `onClick` (fires once, auto-resets) |

## Interactive Triggers

Built-in triggers mapped to web events:

| Trigger | Web Event | Scope |
|---------|-----------|-------|
| `hoverEnter` | `mouseenter` | Element |
| `hoverExit` | `mouseleave` | Element |
| `click` | `click` | Element |
| `pointerDown` | `pointerdown` | Element |
| `pointerUp` | `pointerup` | Document |
| `scroll` | `scroll` | Viewport (provides progress 0-1) |

## Guidelines

### Visual Editor Design

```
┌─────────────────────────────────────────────────────────────┐
│  State Machine: "ButtonStates"                    [+ Input] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     ┌───────┐                                               │
│     │ Entry │───────────────────┐                           │
│     └───────┘                   │                           │
│                                 ▼                           │
│                           ┌──────────┐                      │
│          ┌────────────────│   Idle   │◄─────────────────┐   │
│          │  hoverEnter    └──────────┘  hoverExit       │   │
│          ▼                      │                       │   │
│    ┌──────────┐                 │ click                 │   │
│    │  Hover   │─────────────────┼───────────────────────┘   │
│    └──────────┘                 │                           │
│          │                      ▼                           │
│          │               ┌──────────┐                       │
│          └──────────────►│ Pressed  │                       │
│               click      └──────────┘                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Inputs: [isHovered: bool] [isPressed: bool]                │
└─────────────────────────────────────────────────────────────┘
```

### Node-Based Editing
- Drag from state edge to create transition
- Click transition line to edit conditions
- Double-click state to edit properties
- Right-click for context menu (delete, duplicate)
- Pan and zoom canvas

### Blend States
For continuous animations (e.g., walk-to-run):

```
Input: speed (0.0 - 1.0)

Blend State "Locomotion":
  - Walk animation @ speed = 0.0
  - Jog animation @ speed = 0.5
  - Run animation @ speed = 1.0

Runtime interpolates between nearest animations.
```

### Camera Integration
States can control camera:
- Assign camera per state
- Smooth camera transitions follow state transition duration

## Key Files (to be created)

```
src/
├── state-machine/
│   ├── StateMachine.ts       # Data structure and evaluation
│   ├── State.ts              # State types and properties
│   ├── Transition.ts         # Transition conditions
│   ├── Input.ts              # Input definitions
│   ├── Evaluator.ts          # Runtime state evaluation
│   ├── BlendTree.ts          # Blend state interpolation
│   └── Triggers.ts           # Web event to trigger mapping
├── components/
│   ├── state-machine/
│   │   ├── StateMachineEditor.tsx  # Main node graph
│   │   ├── StateNode.tsx           # State visual node
│   │   ├── TransitionLine.tsx      # Animated edge
│   │   ├── ConditionEditor.tsx     # Condition popup
│   │   ├── InputPanel.tsx          # Input management
│   │   └── PreviewControls.tsx     # Test mode UI
```

## Example Prompts

### Visual Editor
```
Build the state machine visual editor:
1. Infinite canvas with pan/zoom
2. State nodes with custom icons per type
3. Curved transition lines with directional arrows
4. Connection points on state edges
5. Drag-to-connect for new transitions
6. Selection and multi-select support
7. Minimap for navigation
```

### Runtime Evaluator
```
Implement the state machine runtime:
1. Tick-based evaluation (runs each frame)
2. Condition checking with short-circuit logic
3. Transition blending (crossfade animations)
4. Exit time support (wait for animation %)
5. Trigger consumption (fire once, then reset)
6. Layer parallel execution
7. Input API for external control
```

### Blend State
```
Implement blend state evaluation:
1. Multi-dimensional blend trees (1D and 2D)
2. Find nearest animations to current parameter value
3. Calculate blend weights using inverse distance
4. Combine animation outputs
5. Support for additive blending
6. Smooth parameter ramping
```
