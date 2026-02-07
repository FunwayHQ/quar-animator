import { vi } from 'vitest';
import { SceneGraph } from '../SceneGraph';
import { Camera } from '../Camera';
import type { Fill, Stroke } from '@quar/types';
import type { ToolContext } from '../tools/BaseTool';

/**
 * Mock WebGL2RenderingContext for testing
 * Provides a minimal implementation sufficient for testing WebGLRenderer and Grid
 */
export function createMockWebGL2Context(): WebGL2RenderingContext {
  const mockProgram = { __isProgram: true } as unknown as WebGLProgram;
  const mockShader = { __isShader: true } as unknown as WebGLShader;
  const mockBuffer = { __isBuffer: true } as unknown as WebGLBuffer;
  const mockVAO = { __isVAO: true } as unknown as WebGLVertexArrayObject;
  const mockUniformLocation = { __isUniform: true } as unknown as WebGLUniformLocation;

  return {
    // Constants
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,
    STATIC_DRAW: 35044,
    DYNAMIC_DRAW: 35048,
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    COLOR_BUFFER_BIT: 16384,
    DEPTH_BUFFER_BIT: 256,
    BLEND: 3042,
    DEPTH_TEST: 2929,
    SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771,
    LEQUAL: 515,
    FLOAT: 5126,
    UNSIGNED_SHORT: 5123,
    LINES: 1,
    TRIANGLES: 4,
    TRIANGLE_FAN: 6,

    // State management
    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    depthFunc: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    viewport: vi.fn(),

    // Shader operations
    createShader: vi.fn().mockReturnValue(mockShader),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn().mockReturnValue(true),
    getShaderInfoLog: vi.fn().mockReturnValue(''),
    deleteShader: vi.fn(),

    // Program operations
    createProgram: vi.fn().mockReturnValue(mockProgram),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn().mockReturnValue(true),
    getProgramInfoLog: vi.fn().mockReturnValue(''),
    useProgram: vi.fn(),
    deleteProgram: vi.fn(),
    getAttribLocation: vi.fn().mockReturnValue(0),
    getUniformLocation: vi.fn().mockReturnValue(mockUniformLocation),

    // Buffer operations
    createBuffer: vi.fn().mockReturnValue(mockBuffer),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    bufferSubData: vi.fn(),
    deleteBuffer: vi.fn(),

    // VAO operations
    createVertexArray: vi.fn().mockReturnValue(mockVAO),
    bindVertexArray: vi.fn(),
    deleteVertexArray: vi.fn(),

    // Attribute operations
    enableVertexAttribArray: vi.fn(),
    disableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),

    // Uniform operations
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    uniform4fv: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    uniformMatrix4fv: vi.fn(),

    // Draw operations
    drawArrays: vi.fn(),
    drawElements: vi.fn(),
    lineWidth: vi.fn(),

    // Canvas reference
    canvas: document.createElement('canvas'),
  } as unknown as WebGL2RenderingContext;
}

/**
 * Create a mock canvas element with WebGL2 support
 */
export function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const mockGL = createMockWebGL2Context();

  // Override getContext to return our mock
  canvas.getContext = vi.fn().mockImplementation((contextType: string) => {
    if (contextType === 'webgl2') {
      return mockGL;
    }
    return null;
  });

  // Mock style object
  Object.defineProperty(canvas, 'style', {
    value: {
      width: '',
      height: '',
    },
    writable: true,
  });

  return canvas;
}

// Global setup for WebGL mocking
beforeEach(() => {
  // Reset any global state if needed
});

/**
 * Canvas pointer event interface for tool testing
 */
export interface CanvasPointerEvent {
  worldPosition: { x: number; y: number };
  screenPosition: { x: number; y: number };
  button: number;
  buttons: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  pressure: number;
  timestamp: number;
}

/**
 * Create a mock canvas pointer event for tool testing
 */
export function createMockPointerEvent(
  overrides: Partial<CanvasPointerEvent> = {}
): CanvasPointerEvent {
  return {
    worldPosition: { x: 0, y: 0 },
    screenPosition: { x: 0, y: 0 },
    button: 0,
    buttons: 1,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    pressure: 0.5,
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Default fill for testing
 */
export const mockDefaultFill: Fill = {
  type: 'solid',
  color: { r: 100, g: 149, b: 237, a: 1 },
  opacity: 1,
  visible: true,
};

/**
 * Default stroke for testing
 */
export const mockDefaultStroke: Stroke = {
  color: { r: 0, g: 0, b: 0, a: 1 },
  width: 2,
  opacity: 1,
  cap: 'round',
  join: 'round',
  visible: true,
  align: 'center',
};

/**
 * Create a mock tool context for tool testing
 */
export function createMockToolContext(): ToolContext {
  const selectedIds = new Set<string>();
  let idCounter = 0;

  return {
    sceneGraph: new SceneGraph(),
    camera: new Camera(),
    getSelectedIds: () => selectedIds,
    setSelectedIds: (ids: string[]) => {
      selectedIds.clear();
      ids.forEach((id) => selectedIds.add(id));
    },
    addToSelection: (id: string) => selectedIds.add(id),
    clearSelection: () => selectedIds.clear(),
    defaultFill: mockDefaultFill,
    defaultStroke: mockDefaultStroke,
    generateId: () => `node-${++idCounter}`,
    setActiveTool: () => {},
  };
}
