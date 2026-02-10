/**
 * @quar/core
 * Core rendering engine and scene graph for Quar Animator
 */

export * from './math';
export * from './SceneGraph';
export * from './Camera';
export * from './rendering';
export * from './path';
export * from './tools';
export * from './selection';
export * from './gradient/gradientUtils';
export * from './svg';
export * from './boolean';
export * from './font';

// Re-export types for convenience
export type { Vector2, Vector3, Rect, Matrix3, Node, Transform } from '@quar/types';
