import { useCallback, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  ANIMATION_PRESETS,
  applyAnimationPreset,
  applyAnimatedValues,
  evaluateNodeAtFrame,
} from '@quar/animation';
import type { AnimationPresetCategory, AnimationPresetId } from '@quar/animation';
import type { Node } from '@quar/types';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import styles from './AnimationPresetsPanel.module.css';

const CATEGORIES: AnimationPresetCategory[] = ['Entrance', 'Emphasis', 'Exit'];
const DURATION_OPTIONS = [0.4, 0.8, 1.2, 1.6];

export interface AnimationPresetsPanelProps {
  nodeIds: string[];
}

/** A small picker for applying editable keyframe-based motion presets. */
export function AnimationPresetsPanel({ nodeIds }: AnimationPresetsPanelProps) {
  const sceneGraph = useSceneGraph();
  const [isExpanded, setIsExpanded] = useState(true);
  const [durationSeconds, setDurationSeconds] = useState(0.8);

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
      for (const node of nodes) {
        timeline = applyAnimationPreset(
          timeline,
          node,
          presetId,
          state.currentFrame,
          durationFrames
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
    [durationSeconds, nodeIds, sceneGraph]
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
          {CATEGORIES.map((category) => (
            <div className={styles.category} key={category}>
              <h4 className={styles.categoryTitle}>{category}</h4>
              <div className={styles.grid}>
                {ANIMATION_PRESETS.filter((preset) => preset.category === category).map(
                  (preset) => (
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
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
