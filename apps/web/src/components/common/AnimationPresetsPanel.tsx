import { useCallback, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  ANIMATION_PRESETS,
  applyAnimationPreset,
  applyAnimatedValues,
  evaluateNodeAtFrame,
} from '@quar/animation';
import type {
  AnimationPresetCategory,
  AnimationPresetDirection,
  AnimationPresetId,
} from '@quar/animation';
import type { Node } from '@quar/types';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import styles from './AnimationPresetsPanel.module.css';

const CATEGORIES: AnimationPresetCategory[] = ['Entrance', 'Emphasis', 'Loop', 'Exit'];
const DURATION_OPTIONS = [0.4, 0.8, 1.2, 1.6];
const STAGGER_OPTIONS = [0, 0.05, 0.1, 0.15, 0.2];

export interface AnimationPresetsPanelProps {
  nodeIds: string[];
}

/** A small picker for applying editable keyframe-based motion presets. */
export function AnimationPresetsPanel({ nodeIds }: AnimationPresetsPanelProps) {
  const sceneGraph = useSceneGraph();
  const [isExpanded, setIsExpanded] = useState(true);
  const [durationSeconds, setDurationSeconds] = useState(0.8);
  const [staggerSeconds, setStaggerSeconds] = useState(0);
  const [direction, setDirection] = useState<AnimationPresetDirection>('auto');
  const [intensity, setIntensity] = useState(1);
  const selectedNodes = nodeIds
    .map((id) => sceneGraph.getNode(id))
    .filter((node): node is Node => node !== undefined);
  const availablePresets = ANIMATION_PRESETS.filter(
    (preset) =>
      !preset.nodeType ||
      (selectedNodes.length > 0 && selectedNodes.every((node) => node.type === preset.nodeType))
  );

  const applyPreset = useCallback(
    (presetId: AnimationPresetId) => {
      const state = useEditorStore.getState();
      const nodes = nodeIds
        .map((id) => sceneGraph.getNode(id))
        .filter((node): node is Node => node !== undefined);
      if (nodes.length === 0) return;

      state.pushUndo(sceneGraph);
      let timeline = state.timeline;
      const durationFrames = Math.max(4, Math.round(durationSeconds * state.frameRate));
      const staggerFrames = Math.round(staggerSeconds * state.frameRate);
      for (const [index, node] of nodes.entries()) {
        timeline = applyAnimationPreset(
          timeline,
          node,
          presetId,
          state.currentFrame + index * staggerFrames,
          durationFrames,
          { direction, intensity }
        );
      }

      useEditorStore.setState({
        timeline,
        timelineDuration: Math.max(state.timelineDuration, timeline.duration),
        isDirty: true,
      });

      // Reflect the newly-applied animation at the current playhead immediately.
      for (const node of nodes) {
        const currentNode = sceneGraph.getNode(node.id);
        if (!currentNode) continue;
        const values = evaluateNodeAtFrame(timeline, node.id, state.currentFrame);
        if (values.size > 0)
          sceneGraph.updateNode(node.id, applyAnimatedValues(currentNode, values));
      }
    },
    [direction, durationSeconds, intensity, nodeIds, sceneGraph, staggerSeconds]
  );

  return (
    <section
      className={styles.panel}
      aria-label="Animation presets"
      data-testid="animation-presets"
    >
      <button
        type="button"
        className={styles.header}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        aria-label="Animation presets"
        aria-expanded={isExpanded}
        aria-controls="animation-presets-content"
        data-testid="animation-presets-toggle"
      >
        <span className={styles.title}>Animation</span>
        <span className={styles.headerActions}>
          <span className={styles.selectionCount}>
            {nodeIds.length > 1 ? `${nodeIds.length} objects` : 'Presets'}
          </span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`${styles.chevron} ${isExpanded ? '' : styles.chevronCollapsed}`}
          />
        </span>
      </button>
      {isExpanded && (
        <div id="animation-presets-content">
          <label className={styles.durationRow}>
            <span>Duration</span>
            <select
              aria-label="Animation duration"
              value={durationSeconds}
              onChange={(event) => setDurationSeconds(Number(event.target.value))}
            >
              {DURATION_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds.toFixed(1)} s
                </option>
              ))}
            </select>
          </label>
          <div className={styles.presetOptions}>
            <label className={styles.optionControl}>
              <span>Direction</span>
              <select
                aria-label="Animation direction"
                value={direction}
                onChange={(event) => setDirection(event.target.value as AnimationPresetDirection)}
              >
                <option value="auto">Auto</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
            <label className={styles.optionControl}>
              <span className={styles.intensityLabel}>
                <span>Intensity</span>
                <output>{Math.round(intensity * 100)}%</output>
              </span>
              <input
                type="range"
                aria-label="Animation intensity"
                min="0.5"
                max="2"
                step="0.25"
                value={intensity}
                onChange={(event) => setIntensity(Number(event.target.value))}
              />
            </label>
            {nodeIds.length > 1 && (
              <label className={`${styles.optionControl} ${styles.staggerControl}`}>
                <span>Stagger per object</span>
                <select
                  aria-label="Animation stagger delay per object"
                  value={staggerSeconds}
                  onChange={(event) => setStaggerSeconds(Number(event.target.value))}
                >
                  {STAGGER_OPTIONS.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds === 0 ? 'Off' : `${seconds.toFixed(2)} s`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p className={styles.optionsHint}>
            Direction affects directional presets. Stagger is available with multiple objects.
          </p>
          {CATEGORIES.map((category) => (
            <div className={styles.category} key={category}>
              <h4 className={styles.categoryTitle}>{category}</h4>
              <div className={styles.grid}>
                {availablePresets
                  .filter((preset) => preset.category === category)
                  .map((preset) => (
                    <button
                      className={styles.presetButton}
                      key={preset.id}
                      onClick={() => applyPreset(preset.id)}
                      title={preset.description}
                      aria-label={`Apply ${preset.name} ${category.toLowerCase()} animation`}
                      data-testid={`animation-preset-${preset.id}`}
                    >
                      {preset.name}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
