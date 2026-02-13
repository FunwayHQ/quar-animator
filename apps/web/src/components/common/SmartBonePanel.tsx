/**
 * SmartBonePanel — UI for managing Smart Bone actions and morph targets.
 * Rendered in PropertiesPanel when a BoneNode is selected.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */

import { useEditorStore } from '../../stores/editorStore';
import type { SmartBoneAction, MorphTarget } from '@quar/types';

interface SmartBonePanelProps {
  boneId: string;
}

export function SmartBonePanel({ boneId }: SmartBonePanelProps) {
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

  // Filter actions for this bone
  const boneActions = smartBoneActions.filter((a: SmartBoneAction) => a.driver.boneId === boneId);

  const isRecording = recordingActionId !== null;

  return (
    <div style={{ padding: '4px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          Smart Bones
        </span>
        <button
          onClick={() => createSmartBoneAction(boneId)}
          disabled={isRecording}
          style={{
            fontSize: 10,
            padding: '2px 6px',
            cursor: isRecording ? 'not-allowed' : 'pointer',
            background: 'var(--color-surface-hover)',
            border: '1px solid var(--color-border)',
            borderRadius: 3,
            color: 'var(--color-text)',
          }}
          data-testid="create-smart-bone-action"
        >
          + Action
        </button>
      </div>

      {boneActions.length === 0 && (
        <div
          style={{ fontSize: 10, color: 'var(--color-text-tertiary)', padding: '4px 0' }}
          data-testid="no-actions-message"
        >
          No Smart Bone actions
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
          onStartRecording={(targetId: string) => startSmartBoneRecording(action.id, targetId)}
          onStopRecording={stopSmartBoneRecording}
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
  const itemStyle: React.CSSProperties = {
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    padding: 6,
    marginBottom: 4,
    opacity: disabled ? 0.5 : 1,
    pointerEvents: disabled ? 'none' : 'auto',
    background: isRecording ? 'rgba(239, 68, 68, 0.08)' : undefined,
  };

  return (
    <div style={itemStyle} data-testid="smart-bone-action">
      {/* Header: name + controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <input
          type="checkbox"
          checked={action.enabled}
          onChange={(e) => onToggleEnabled(e.target.checked)}
          title="Enable/disable"
        />
        <span style={{ flex: 1, fontSize: 11, fontWeight: 500 }}>{action.name}</span>
        <button
          onClick={onRemove}
          style={{
            fontSize: 10,
            padding: '1px 4px',
            cursor: 'pointer',
            background: 'none',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            color: 'var(--color-danger, #ef4444)',
          }}
          data-testid="remove-action"
          title="Delete action"
        >
          ×
        </button>
      </div>

      {/* Driver range */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 4, fontSize: 10 }}>
        <label>
          Min°
          <input
            type="number"
            value={action.driver.rangeMin}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onUpdateDriver({ rangeMin: v });
            }}
            style={{ width: 48, marginLeft: 2 }}
            data-testid="range-min"
          />
        </label>
        <label>
          Max°
          <input
            type="number"
            value={action.driver.rangeMax}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onUpdateDriver({ rangeMax: v });
            }}
            style={{ width: 48, marginLeft: 2 }}
            data-testid="range-max"
          />
        </label>
      </div>

      {/* Targets list */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Targets</span>
          <button
            onClick={() => {
              const midVal = (action.driver.rangeMin + action.driver.rangeMax) / 2;
              onAddTarget(midVal);
            }}
            disabled={isRecording}
            style={{
              fontSize: 9,
              padding: '1px 4px',
              cursor: isRecording ? 'not-allowed' : 'pointer',
              background: 'none',
              border: '1px solid var(--color-border)',
              borderRadius: 2,
              color: 'var(--color-text)',
            }}
            data-testid="add-target"
          >
            + Target
          </button>
        </div>

        {action.targets.map((target: MorphTarget) => {
          const isTargetRecording = isRecording && recordingTargetId === target.id;
          return (
            <div
              key={target.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 0',
                fontSize: 10,
                background: isTargetRecording ? 'rgba(239, 68, 68, 0.15)' : undefined,
              }}
              data-testid="morph-target"
            >
              <span style={{ flex: 1 }}>
                {target.name} ({target.driverValue}°)
              </span>
              {isTargetRecording ? (
                <button
                  onClick={onStopRecording}
                  style={{
                    fontSize: 9,
                    padding: '1px 4px',
                    cursor: 'pointer',
                    background: 'var(--color-danger, #ef4444)',
                    border: 'none',
                    borderRadius: 2,
                    color: '#fff',
                  }}
                  data-testid="stop-recording"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => onStartRecording(target.id)}
                  disabled={isRecording}
                  style={{
                    fontSize: 9,
                    padding: '1px 4px',
                    cursor: isRecording ? 'not-allowed' : 'pointer',
                    background: 'none',
                    border: '1px solid var(--color-border)',
                    borderRadius: 2,
                    color: 'var(--color-text)',
                  }}
                  data-testid="start-recording"
                >
                  Record
                </button>
              )}
              <button
                onClick={() => onRemoveTarget(target.id)}
                disabled={isRecording}
                style={{
                  fontSize: 9,
                  padding: '1px 3px',
                  cursor: isRecording ? 'not-allowed' : 'pointer',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-danger, #ef4444)',
                }}
                data-testid="remove-target"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
