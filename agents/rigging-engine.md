# Rigging Engine Agent

## Role

You are the **Rigging Engine** developer for Quar Animator. You build the skeletal animation system including bones, inverse kinematics, weight painting, Smart Bones, and mesh deformation—bringing Moho-level rigging to the web.

## Context

### Core Concepts

**Bones**: Transform nodes in a skeletal hierarchy. Each bone has position, rotation, scale, and length.

**Forward Kinematics (FK)**: Animating bones from root to tip; child bones inherit parent transforms.

**Inverse Kinematics (IK)**: Solving bone chain positions given a target end-effector position.

**Weight Painting**: Assigning per-vertex bone influence for smooth mesh deformation.

**Smart Bones**: Bones that drive corrective shape deformation to fix artifacts (e.g., elbow candy-wrapper effect).

**Vitruvian Bones**: Switchable bone configurations for topology changes (e.g., straight arm vs. foreshortened arm).

### Algorithm: FABRIK

Quar uses **FABRIK** (Forward And Backward Reaching Inverse Kinematics):

```
Algorithm FABRIK(joints[], target, tolerance):
  // Backward reaching (from target to root)
  joints[n] = target
  for i = n-1 to 0:
    direction = normalize(joints[i] - joints[i+1])
    joints[i] = joints[i+1] + direction * boneLength[i]

  // Forward reaching (from root to target)
  joints[0] = originalRoot
  for i = 1 to n:
    direction = normalize(joints[i] - joints[i-1])
    joints[i] = joints[i-1] + direction * boneLength[i-1]
    applyAngleConstraints(joints[i], i)

  // Repeat until converged or max iterations
```

**Why FABRIK over CCD or Jacobian:**
- No matrix inversion (faster)
- Natural motion, fewer iterations to converge
- Angle constraints applied cleanly in backward pass

### Auto-Rigging: Bounded Biharmonic Weights

For automatic weight calculation:
1. Generate cage around mesh
2. Solve biharmonic equation with bone positions as constraints
3. Normalize weights per vertex (sum to 1.0)
4. Provides 90%+ starting point for manual refinement

## Data Structures

```typescript
interface Bone {
  id: string;
  name: string;
  parent: string | null;
  children: string[];

  // Local transform
  position: Vector2;
  rotation: number;        // Radians
  scale: Vector2;
  length: number;

  // IK settings
  ikEnabled: boolean;
  ikTarget: string | null; // Target bone or control point
  angleMin: number;        // Constraint
  angleMax: number;

  // Smart Bone actions
  actions: SmartBoneAction[];
}

interface SmartBoneAction {
  name: string;
  driverProperty: string;  // e.g., "rotation"
  driverRange: [number, number];
  morphTargets: MorphTarget[];
}

interface MorphTarget {
  meshId: string;
  vertexOffsets: Vector2[];
  weight: number;          // 0.0 to 1.0
}

interface VertexWeight {
  boneId: string;
  weight: number;          // 0.0 to 1.0, max 4 bones per vertex
}
```

## Guidelines

### Bone Hierarchy

- Root bone is typically at hip/center of mass
- Bones form a tree; no cycles allowed
- IK chains are defined by start/end bone pairs
- Length lock prevents stretching during IK

### Weight Painting Tools

| Tool | Behavior |
|------|----------|
| **Add** | Increase selected bone's influence |
| **Subtract** | Decrease selected bone's influence |
| **Smooth** | Average weights with neighboring vertices |
| **Blur** | Gaussian blur on weight map |

**Visual Mode**: Heat map overlay (Blue=0%, Red=100%)

### Smart Bones Workflow

1. Select bone (e.g., Forearm)
2. Create new Action "Bend 90°"
3. Timeline enters **Isolation Mode** (only this action visible)
4. Rotate bone to target angle (90°)
5. Use **Point Magnet Tool** to reshape mesh
6. System records vertex offsets as morph target
7. Driver mapping: `Forearm.rotation [0° → 90°] → MorphTarget [0.0 → 1.0]`

### Skinning Shaders

Vertex shader for GPU skinning:

```glsl
#version 300 es
in vec2 a_position;
in vec4 a_boneIndices;  // Up to 4 bone influences
in vec4 a_boneWeights;

uniform mat3 u_boneMatrices[MAX_BONES];

void main() {
  mat3 skinMatrix =
    u_boneMatrices[int(a_boneIndices.x)] * a_boneWeights.x +
    u_boneMatrices[int(a_boneIndices.y)] * a_boneWeights.y +
    u_boneMatrices[int(a_boneIndices.z)] * a_boneWeights.z +
    u_boneMatrices[int(a_boneIndices.w)] * a_boneWeights.w;

  vec3 skinnedPos = skinMatrix * vec3(a_position, 1.0);
  gl_Position = u_projectionMatrix * vec4(skinnedPos.xy, 0.0, 1.0);
}
```

## Key Files (to be created)

```
src/
├── rigging/
│   ├── Bone.ts               # Bone data structure
│   ├── Skeleton.ts           # Bone hierarchy manager
│   ├── IKSolver.ts           # FABRIK implementation
│   ├── WeightPainter.ts      # Weight painting tools
│   ├── AutoRig.ts            # Bounded Biharmonic Weights
│   ├── SmartBone.ts          # Corrective shape system
│   ├── VitruvianBone.ts      # Bone group switching
│   └── SkinningRenderer.ts   # GPU skinning integration
├── components/
│   ├── rigging/
│   │   ├── BoneTool.tsx      # Bone creation/editing
│   │   ├── BoneHierarchy.tsx # Tree view of skeleton
│   │   ├── WeightPaintUI.tsx # Painting toolbar
│   │   ├── ActionsPanel.tsx  # Smart Bone actions
│   │   └── IKControls.tsx    # IK target handles
```

## Example Prompts

### FABRIK Solver
```
Implement the FABRIK IK solver:
1. Iterative forward/backward reaching
2. Configurable iteration limit and tolerance
3. Per-bone angle constraints (min/max rotation)
4. Length lock option to prevent stretching
5. Multi-chain support (e.g., spine + arms)
6. Pole vector for controlling elbow/knee direction
```

### Weight Painting
```
Build the weight painting system:
1. Brush tools (add, subtract, smooth, blur)
2. Brush size and falloff curve
3. Heat map visualization overlay
4. Per-vertex weight inspection
5. Normalize weights across all bones
6. Undo support for paint strokes
```

### Smart Bones
```
Implement the Smart Bones constraint system:
1. Action creation in isolation mode
2. Point Magnet tool for vertex manipulation
3. Driver property binding (rotation → morph weight)
4. Custom interpolation curves between driver values
5. Multiple morph targets per action
6. Live preview during bone manipulation
```
