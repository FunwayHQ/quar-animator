/**
 * Tool Manager for Quar Animator
 * Manages tool instances and routes events to the active tool
 */

import type { ToolType, CanvasPointerEvent, Fill, Stroke } from '@quar/types';
import { BaseTool, type ToolContext, type TransformType } from './BaseTool';
import { SelectionTool } from './SelectionTool';
import { DirectSelectionTool } from './DirectSelectionTool';
import { RectangleTool } from './RectangleTool';
import { EllipseTool } from './EllipseTool';
import { PolygonTool } from './PolygonTool';
import { PenTool } from './PenTool';
import { BrushTool } from './BrushTool';
import { EraserTool } from './EraserTool';
import { HandTool } from './HandTool';
import { TextTool } from './TextTool';
import type { SceneGraph } from '../SceneGraph';
import type { Camera } from '../Camera';

// ============================================================================
// Types
// ============================================================================

export interface ToolManagerOptions {
  sceneGraph: SceneGraph;
  camera: Camera;
  getSelectedIds: () => Set<string>;
  setSelectedIds: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  clearSelection: () => void;
  getDefaultFill: () => Fill;
  getDefaultStroke: () => Stroke;
  onToolChange?: (tool: ToolType) => void;
  onTransformStart?: () => void;
  onTransformComplete?: (nodeIds: Set<string>, type: TransformType) => void;
  getSnapToGrid?: () => boolean;
  getGridSize?: () => number;
  getEnteredGroupId?: () => string | null;
  setEnteredGroupId?: (id: string | null) => void;
  onEnterTextEdit?: (nodeId: string) => void;
}

// ============================================================================
// ToolManager Class
// ============================================================================

export class ToolManager {
  private tools: Map<ToolType, BaseTool> = new Map();
  private activeTool: BaseTool | null = null;
  private activeToolType: ToolType = 'selection';
  private options: ToolManagerOptions;
  private idCounter: number = 0;

  constructor(options: ToolManagerOptions) {
    this.options = options;

    // Create tool context
    const context = this.createToolContext();

    // Initialize tools
    this.tools.set('selection', new SelectionTool(context));
    this.tools.set('direct-selection', new DirectSelectionTool(context));
    this.tools.set('rectangle', new RectangleTool(context));
    this.tools.set('ellipse', new EllipseTool(context));
    this.tools.set('polygon', new PolygonTool(context));

    // Star tool is a PolygonTool with star mode enabled
    const starTool = new PolygonTool(context);
    starTool.setStarMode(true);
    this.tools.set('star', starTool);

    this.tools.set('hand', new HandTool(context));
    this.tools.set('pen', new PenTool(context));
    this.tools.set('brush', new BrushTool(context));
    this.tools.set('eraser', new EraserTool(context));
    this.tools.set('text', new TextTool(context));

    // Set default tool
    this.setActiveTool('selection');
  }

  // --------------------------------------------------------------------------
  // Tool Management
  // --------------------------------------------------------------------------

  /**
   * Set the active tool by type
   */
  setActiveTool(type: ToolType): void {
    if (type === this.activeToolType && this.activeTool !== null) return;

    const tool = this.tools.get(type);
    if (!tool) {
      console.warn(`Tool "${type}" not found`);
      return;
    }

    // Deactivate current tool
    if (this.activeTool) {
      this.activeTool.onDeactivate?.();
    }

    // Activate new tool
    this.activeTool = tool;
    this.activeToolType = type;
    this.activeTool.onActivate?.();

    // Notify listener (e.g., to sync EditorStore)
    this.options.onToolChange?.(type);
  }

  /**
   * Get the currently active tool type
   */
  getActiveToolType(): ToolType {
    return this.activeToolType;
  }

  /**
   * Get the currently active tool instance
   */
  getActiveTool(): BaseTool | null {
    return this.activeTool;
  }

  /**
   * Get a specific tool by type
   */
  getTool<T extends BaseTool>(type: ToolType): T | undefined {
    return this.tools.get(type) as T | undefined;
  }

  /**
   * Get the cursor for the current tool
   * Calls the tool's getCursor() method if available for dynamic cursors
   */
  getCursor(): string {
    if (this.activeTool) {
      // Check for dynamic getCursor method (e.g., SelectionTool)
      const tool = this.activeTool as BaseTool & { getCursor?: () => string };
      if (typeof tool.getCursor === 'function') {
        return tool.getCursor();
      }
      return this.activeTool.cursor;
    }
    return 'default';
  }

  // --------------------------------------------------------------------------
  // Event Routing
  // --------------------------------------------------------------------------

  /**
   * Route pointer down event to active tool
   */
  handlePointerDown(event: CanvasPointerEvent): void {
    this.activeTool?.onPointerDown(event);
  }

  /**
   * Route pointer move event to active tool
   */
  handlePointerMove(event: CanvasPointerEvent): void {
    this.activeTool?.onPointerMove(event);
  }

  /**
   * Route pointer up event to active tool
   */
  handlePointerUp(event: CanvasPointerEvent): void {
    this.activeTool?.onPointerUp(event);
  }

  /**
   * Route key down event to active tool
   */
  handleKeyDown(event: KeyboardEvent): void {
    // Check for tool shortcuts first (skip when Shift is held — Shift+letter is reserved for other shortcuts)
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      const newTool = this.getToolForShortcut(event.key);
      if (newTool) {
        this.setActiveTool(newTool);
        return;
      }
    }

    // Pass to active tool
    this.activeTool?.onKeyDown?.(event);
  }

  /**
   * Route key up event to active tool
   */
  handleKeyUp(event: KeyboardEvent): void {
    this.activeTool?.onKeyUp?.(event);
  }

  // --------------------------------------------------------------------------
  // Preview
  // --------------------------------------------------------------------------

  /**
   * Get preview node from active tool (if any)
   */
  getPreviewNode() {
    return this.activeTool?.getPreviewNode?.() ?? null;
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private createToolContext(): ToolContext {
    const options = this.options;
    return {
      sceneGraph: options.sceneGraph,
      camera: options.camera,
      getSelectedIds: options.getSelectedIds,
      setSelectedIds: options.setSelectedIds,
      addToSelection: options.addToSelection,
      clearSelection: options.clearSelection,
      get defaultFill() {
        return options.getDefaultFill();
      },
      get defaultStroke() {
        return options.getDefaultStroke();
      },
      generateId: this.generateId.bind(this),
      setActiveTool: (tool: ToolType) => this.setActiveTool(tool),
      onTransformStart: options.onTransformStart,
      onTransformComplete: options.onTransformComplete,
      getSnapToGrid: options.getSnapToGrid,
      getGridSize: options.getGridSize,
      getEnteredGroupId: options.getEnteredGroupId,
      setEnteredGroupId: options.setEnteredGroupId,
      onEnterTextEdit: options.onEnterTextEdit,
    };
  }

  private generateId(): string {
    return `node_${Date.now()}_${this.idCounter++}`;
  }

  private getToolForShortcut(key: string): ToolType | null {
    const shortcuts: Record<string, ToolType> = {
      v: 'selection',
      a: 'direct-selection',
      h: 'hand',
      r: 'rectangle',
      o: 'ellipse',
      u: 'polygon',
      s: 'star',
      p: 'pen',
      b: 'brush',
      e: 'eraser',
      t: 'text',
    };

    return shortcuts[key.toLowerCase()] ?? null;
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  dispose(): void {
    if (this.activeTool) {
      this.activeTool.onDeactivate?.();
    }
    this.tools.clear();
    this.activeTool = null;
  }
}
