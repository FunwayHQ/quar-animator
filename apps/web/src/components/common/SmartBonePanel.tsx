/**
 * SmartBonePanel — UI for managing Smart Bone actions and morph targets.
 * Rendered in PropertiesPanel when a BoneNode is selected.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */

import { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import type { SmartBoneAction, MorphTarget } from '@quar/types';
import styles from './SmartBonePanel.module.css';

interface SmartBonePanelProps {
  boneId: string;
}

export function SmartBonePanel({ boneId }: SmartBonePanelProps) {
  const sceneGraph = useSceneGraph();
  const smartBoneActions: SmartBoneAction[] = useEditorStore((state) => state.smartBoneActions);
  const createSmartBoneAction = useEditorStore((state) => state.createSmartBoneAction);
  const removeSmartBoneAction = useEditorStore((state) => state.removeSmartBoneAction);
  const setSmartBoneActionEnabled = useEditorStore((state) => state.setSmartBoneActionEnabled);
  const updateSmartBoneDriver = useEditorStore((state) => state.updateSmartBoneDriver);
  const addMorphTarget = useEditorStore((state) => state.addMorphTarget);
  const removeMorphTarget = useEditorStore((state) => state.removeMorphTarget);
  const startSmartBoneRecording = useEditorStore((state) => state.startSmartBoneRecording);
  const stopSmartBoneRecording = useEditorStore((state) => state.stopSmartBoneRecording);
  const recordingActionId: string | null = useEditorStore(
    (state) => state.smartBoneRecordingActionId
  );
  const recordingTargetId: string | null = useEditorStore(
    (state) => state.smartBoneRecordingTargetId
  );

  const boneActions = smartBoneActions.filter((a: SmartBoneAction) => a.driver.boneId === boneId);
  const isRecording = recordingActionId !== null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Smart Bones</span>
        <button
          onClick={() => createSmartBoneAction(boneId)}
          disabled={isRecording}
          className={styles.addActionButton}
          data-testid="create-smart-bone-action"
        >
          + Action
        </button>
      </div>

      {boneActions.length === 0 && (
        <div className={styles.emptyMessage} data-testid="no-actions-message">
          No actions defined
        </div>
      )}

      {boneActions.map((action: SmartBoneAction) => (
        <SmartBoneActionItem
          key={action.id}
          action={action}
          isRecording={recordingActionId === action.id}
          recordingTargetId={recordingTargetId}
          onRemove={() => removeSmartBoneAction(action.id)}
          onToggleEnabled={(enabled: boolean) => setSmartBoneActionEnabled(action.id, enabled)}
          onUpdateDriver={(updates: { rangeMin?: number; rangeMax?: number }) =>
            updateSmartBoneDriver(action.id, updates)
          }
          onAddTarget={(driverValue: number) => addMorphTarget(action.id, driverValue)}
          onRemoveTarget={(targetId: string) => removeMorphTarget(action.id, targetId)}
          onStartRecording={(targetId: string) =>
            startSmartBoneRecording(action.id, targetId, sceneGraph)
          }
          onStopRecording={() => stopSmartBoneRecording(sceneGraph)}
          disabled={isRecording && recordingActionId !== action.id}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: SmartBoneActionItem
// ---------------------------------------------------------------------------

interface SmartBoneActionItemProps {
  action: SmartBoneAction;
  isRecording: boolean;
  recordingTargetId: string | null;
  onRemove: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onUpdateDriver: (updates: { rangeMin?: number; rangeMax?: number }) => void;
  onAddTarget: (driverValue: number) => void;
  onRemoveTarget: (targetId: string) => void;
  onStartRecording: (targetId: string) => void;
  onStopRecording: () => void;
  disabled: boolean;
}

function SmartBoneActionItem({
  action,
  isRecording,
  recordingTargetId,
  onRemove,
  onToggleEnabled,
  onUpdateDriver,
  onAddTarget,
  onRemoveTarget,
  onStartRecording,
  onStopRecording,
  disabled,
}: SmartBoneActionItemProps) {
  const [newTargetValue, setNewTargetValue] = useState('');

  const cardClass = [
    styles.actionCard,
    disabled ? styles.actionCardDisabled : '',
    isRecording ? styles.actionCardRecording : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cardClass} data-testid="smart-bone-action">
      {/* Header: toggle + name + delete */}
      <div className={styles.actionHeader}>
        <label className={styles.toggle} title="Enable/disable">
          <input
            type="checkbox"
            checked={action.enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            aria-label="Enable action"
          />
          <span className={styles.toggleTrack} />
        </label>
        <span className={styles.actionName}>{action.name}</span>
        <button
          onClick={onRemove}
          className={styles.deleteButton}
          data-testid="remove-action"
          title="Delete action"
        >
          ×
        </button>
      </div>

      {/* Driver range: Min° — Max° */}
      <div className={styles.driverRow}>
        <span className={styles.driverLabel}>Min</span>
        <div className={styles.driverInputGroup}>
          <input
            type="number"
            className={styles.driverInput}
            value={action.driver.rangeMin}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onUpdateDriver({ rangeMin: v });
            }}
            data-testid="range-min"
          />
          <span className={styles.driverSuffix}>°</span>
        </div>
        <span className={styles.driverSeparator}>—</span>
        <span className={styles.driverLabel}>Max</span>
        <div className={styles.driverInputGroup}>
          <input
            type="number"
            className={styles.driverInput}
            value={action.driver.rangeMax}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onUpdateDriver({ rangeMax: v });
            }}
            data-testid="range-max"
          />
          <span className={styles.driverSuffix}>°</span>
        </div>
      </div>

      {/* Targets section */}
      <div className={styles.targetsHeader}>
        <span className={styles.targetsLabel}>Targets</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div className={styles.driverInputGroup} style={{ width: 52 }}>
            <input
              type="number"
              className={styles.driverInput}
              value={newTargetValue}
              onChange={(e) => setNewTargetValue(e.target.value)}
              placeholder="0"
              data-testid="new-target-value"
            />
            <span className={styles.driverSuffix}>°</span>
          </div>
          <button
            onClick={() => {
              const val = parseFloat(newTargetValue);
              const driverVal = isNaN(val)
                ? (action.driver.rangeMin + action.driver.rangeMax) / 2
                : val;
              onAddTarget(driverVal);
              setNewTargetValue('');
            }}
            disabled={isRecording}
            className={styles.addTargetButton}
            data-testid="add-target"
          >
            +
          </button>
        </div>
      </div>

      {action.targets.map((target: MorphTarget) => {
        const isTargetRecording = isRecording && recordingTargetId === target.id;
        const rowClass = [styles.targetRow, isTargetRecording ? styles.targetRowRecording : '']
          .filter(Boolean)
          .join(' ');

        return (
          <div key={target.id} className={rowClass} data-testid="morph-target">
            {isTargetRecording && <span className={styles.recordingDot} />}
            <div className={styles.targetInfo}>
              <span className={styles.targetName}>{target.name}</span>
              <span className={styles.targetValue}>{target.driverValue}°</span>
            </div>
            {isTargetRecording ? (
              <button
                onClick={onStopRecording}
                className={styles.stopButton}
                data-testid="stop-recording"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={() => onStartRecording(target.id)}
                disabled={isRecording}
                className={styles.recordButton}
                data-testid="start-recording"
              >
                Rec
              </button>
            )}
            <button
              onClick={() => onRemoveTarget(target.id)}
              disabled={isRecording}
              className={styles.removeTargetButton}
              data-testid="remove-target"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
