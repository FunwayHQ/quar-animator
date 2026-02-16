/**
 * VitruvianPanel — UI for managing Vitruvian Bone Controllers.
 * Allows creating bone groups, switching active group, and capturing skin snapshots.
 * Rendered in PropertiesPanel when a bone node is selected.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */

import { useEditorStore } from '../../stores/editorStore';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import type { VitruvianController, BoneGroup } from '@quar/types';
import styles from './SmartBonePanel.module.css';

interface VitruvianPanelProps {
  boneId: string;
}

export function VitruvianPanel({ boneId }: VitruvianPanelProps) {
  const sceneGraph = useSceneGraph();
  const vitruvianControllers: VitruvianController[] = useEditorStore(
    (state) => state.vitruvianControllers
  );
  const createVitruvianController = useEditorStore((state) => state.createVitruvianController);
  const removeVitruvianController = useEditorStore((state) => state.removeVitruvianController);
  const setVitruvianControllerEnabled = useEditorStore(
    (state) => state.setVitruvianControllerEnabled
  );
  const setVitruvianActiveGroup = useEditorStore((state) => state.setVitruvianActiveGroup);
  const addVitruvianGroup = useEditorStore((state) => state.addVitruvianGroup);
  const removeVitruvianGroup = useEditorStore((state) => state.removeVitruvianGroup);
  const captureVitruvianSkinSnapshots = useEditorStore(
    (state) => state.captureVitruvianSkinSnapshots
  );

  // Find controllers that reference this bone
  const relevantControllers = vitruvianControllers.filter((c: VitruvianController) =>
    c.groups.some((g: BoneGroup) => g.boneIds.includes(boneId))
  );

  if (relevantControllers.length === 0 && vitruvianControllers.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.title}>Vitruvian Bones</span>
          <button
            onClick={() => createVitruvianController()}
            className={styles.addActionButton}
            data-testid="create-vitruvian-controller"
          >
            + Controller
          </button>
        </div>
        <div className={styles.emptyMessage} data-testid="no-vitruvian-message">
          No controllers defined
        </div>
      </div>
    );
  }

  // Show all controllers (since bone groups are managed at controller level)
  const controllers = vitruvianControllers;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Vitruvian Bones</span>
        <button
          onClick={() => createVitruvianController()}
          className={styles.addActionButton}
          data-testid="create-vitruvian-controller"
        >
          + Controller
        </button>
      </div>

      {controllers.map((controller: VitruvianController) => (
        <VitruvianControllerItem
          key={controller.id}
          controller={controller}
          boneId={boneId}
          onRemove={() => removeVitruvianController(controller.id)}
          onToggleEnabled={(enabled: boolean) =>
            setVitruvianControllerEnabled(controller.id, enabled)
          }
          onSetActiveGroup={(groupId: string) => setVitruvianActiveGroup(controller.id, groupId)}
          onAddGroup={() =>
            addVitruvianGroup(controller.id, `Group ${controller.groups.length + 1}`, [boneId])
          }
          onRemoveGroup={(groupId: string) => removeVitruvianGroup(controller.id, groupId)}
          onCaptureSkin={(groupId: string) =>
            captureVitruvianSkinSnapshots(controller.id, groupId, sceneGraph)
          }
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: VitruvianControllerItem
// ---------------------------------------------------------------------------

interface VitruvianControllerItemProps {
  controller: VitruvianController;
  boneId: string;
  onRemove: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onSetActiveGroup: (groupId: string) => void;
  onAddGroup: () => void;
  onRemoveGroup: (groupId: string) => void;
  onCaptureSkin: (groupId: string) => void;
}

function VitruvianControllerItem({
  controller,
  onRemove,
  onToggleEnabled,
  onSetActiveGroup,
  onAddGroup,
  onRemoveGroup,
  onCaptureSkin,
}: VitruvianControllerItemProps) {
  return (
    <div className={styles.actionCard} data-testid="vitruvian-controller">
      {/* Header: toggle + name + delete */}
      <div className={styles.actionHeader}>
        <label className={styles.toggle} title="Enable/disable">
          <input
            type="checkbox"
            checked={controller.enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            aria-label="Enable controller"
          />
          <span className={styles.toggleTrack} />
        </label>
        <span className={styles.actionName}>{controller.name}</span>
        <button
          onClick={onRemove}
          className={styles.deleteButton}
          data-testid="remove-vitruvian-controller"
          title="Delete controller"
        >
          ×
        </button>
      </div>

      {/* Active group selector */}
      {controller.groups.length > 0 && (
        <div className={styles.driverRow}>
          <span className={styles.driverLabel} style={{ width: 'auto' }}>
            Active
          </span>
          <div className={styles.driverInputGroup} style={{ flex: 1 }}>
            <select
              value={controller.activeGroupId}
              onChange={(e) => onSetActiveGroup(e.target.value)}
              style={{
                flex: 1,
                height: 24,
                padding: '0 4px',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--font-size-sm)',
                fontFamily: 'var(--font-family-ui)',
                outline: 'none',
                cursor: 'pointer',
              }}
              data-testid="active-group-select"
            >
              {controller.groups.map((g: BoneGroup) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Groups section */}
      <div className={styles.targetsHeader}>
        <span className={styles.targetsLabel}>Groups</span>
        <button
          onClick={onAddGroup}
          className={styles.addTargetButton}
          data-testid="add-vitruvian-group"
        >
          +
        </button>
      </div>

      {controller.groups.map((group: BoneGroup) => {
        const isActive = controller.activeGroupId === group.id;
        return (
          <div
            key={group.id}
            className={styles.targetRow}
            style={isActive ? { background: 'rgba(168, 85, 247, 0.08)' } : undefined}
            data-testid="vitruvian-group"
          >
            <div className={styles.targetInfo}>
              <span className={styles.targetName}>{group.name}</span>
              <span className={styles.targetValue}>
                {group.boneIds.length} bone{group.boneIds.length !== 1 ? 's' : ''}
              </span>
            </div>
            <button
              onClick={() => onCaptureSkin(group.id)}
              className={styles.recordButton}
              data-testid="capture-skin"
              title="Capture skin snapshots for this group"
            >
              Snap
            </button>
            <button
              onClick={() => onRemoveGroup(group.id)}
              className={styles.removeTargetButton}
              data-testid="remove-vitruvian-group"
              style={{ opacity: 0.5 }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
