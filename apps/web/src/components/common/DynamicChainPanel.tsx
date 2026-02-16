/**
 * DynamicChainPanel — UI for managing Dynamic Bone Chain settings.
 * Sliders for stiffness, damping, gravity, elasticity, wind influence.
 * Rendered in PropertiesPanel when a bone with a dynamic chain is selected.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */

import { useEditorStore } from '../../stores/editorStore';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import type { DynamicChain } from '@quar/types';
import styles from './SmartBonePanel.module.css';

interface DynamicChainPanelProps {
  boneId: string;
}

export function DynamicChainPanel({ boneId }: DynamicChainPanelProps) {
  const sceneGraph = useSceneGraph();
  const dynamicChains: DynamicChain[] = useEditorStore((state) => state.dynamicChains);
  const createDynamicChain = useEditorStore((state) => state.createDynamicChain);
  const removeDynamicChain = useEditorStore((state) => state.removeDynamicChain);
  const setDynamicChainEnabled = useEditorStore((state) => state.setDynamicChainEnabled);
  const updateDynamicChainSettings = useEditorStore((state) => state.updateDynamicChainSettings);

  // Find chain where this bone is the root
  const chain = dynamicChains.find(
    (c: DynamicChain) => c.rootBoneId === boneId || c.boneIds.includes(boneId)
  );

  if (!chain) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.title}>Dynamic Chain</span>
          <button
            onClick={() => createDynamicChain(sceneGraph, boneId)}
            className={styles.addActionButton}
            data-testid="create-dynamic-chain"
          >
            + Chain
          </button>
        </div>
        <div className={styles.emptyMessage} data-testid="no-dynamic-chain-message">
          No dynamic chain on this bone
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Dynamic Chain</span>
        <button
          onClick={() => removeDynamicChain(chain.id)}
          className={styles.deleteButton}
          style={{ opacity: 0.6 }}
          data-testid="remove-dynamic-chain"
          title="Remove dynamic chain"
        >
          ×
        </button>
      </div>

      <div className={styles.actionCard} data-testid="dynamic-chain-settings">
        {/* Header: toggle + name */}
        <div className={styles.actionHeader}>
          <label className={styles.toggle} title="Enable/disable">
            <input
              type="checkbox"
              checked={chain.enabled}
              onChange={(e) => setDynamicChainEnabled(chain.id, e.target.checked)}
              aria-label="Enable dynamic chain"
            />
            <span className={styles.toggleTrack} />
          </label>
          <span className={styles.actionName}>{chain.name}</span>
          <span className={styles.targetValue}>
            {chain.boneIds.length} bone{chain.boneIds.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Stiffness */}
        <SliderRow
          label="Stiffness"
          value={chain.stiffness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateDynamicChainSettings(chain.id, { stiffness: v })}
          testId="stiffness"
        />

        {/* Damping */}
        <SliderRow
          label="Damping"
          value={chain.damping}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateDynamicChainSettings(chain.id, { damping: v })}
          testId="damping"
        />

        {/* Gravity */}
        <SliderRow
          label="Gravity"
          value={chain.gravity}
          min={0}
          max={500}
          step={1}
          onChange={(v) => updateDynamicChainSettings(chain.id, { gravity: v })}
          testId="gravity"
        />

        {/* Gravity Angle */}
        <SliderRow
          label="Grav Angle"
          value={chain.gravityAngle}
          min={-180}
          max={180}
          step={1}
          suffix="°"
          onChange={(v) => updateDynamicChainSettings(chain.id, { gravityAngle: v })}
          testId="gravity-angle"
        />

        {/* Wind Influence */}
        <SliderRow
          label="Wind"
          value={chain.windInfluence}
          min={0}
          max={2}
          step={0.01}
          onChange={(v) => updateDynamicChainSettings(chain.id, { windInfluence: v })}
          testId="wind-influence"
        />

        {/* Elasticity */}
        <SliderRow
          label="Elasticity"
          value={chain.elasticity}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateDynamicChainSettings(chain.id, { elasticity: v })}
          testId="elasticity"
        />

        {/* Freeze Axis */}
        <div className={styles.driverRow}>
          <span className={styles.driverLabel} style={{ width: 'auto', minWidth: 52 }}>
            Freeze
          </span>
          <div className={styles.driverInputGroup} style={{ flex: 1 }}>
            <select
              value={chain.freezeAxis ?? 'none'}
              onChange={(e) =>
                updateDynamicChainSettings(chain.id, {
                  freezeAxis: e.target.value === 'none' ? undefined : (e.target.value as 'x' | 'y'),
                })
              }
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
              data-testid="freeze-axis"
            >
              <option value="none">None</option>
              <option value="x">X Axis</option>
              <option value="y">Y Axis</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SliderRow helper
// ---------------------------------------------------------------------------

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
  testId: string;
}) {
  return (
    <div className={styles.driverRow}>
      <span className={styles.driverLabel} style={{ width: 'auto', minWidth: 52 }}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, height: 14, cursor: 'pointer' }}
        data-testid={`${testId}-slider`}
      />
      <div className={styles.driverInputGroup} style={{ width: 52, flex: 'none' }}>
        <input
          type="number"
          className={styles.driverInput}
          value={Math.round(value * 100) / 100}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          data-testid={`${testId}-input`}
        />
        {suffix && <span className={styles.driverSuffix}>{suffix}</span>}
      </div>
    </div>
  );
}
