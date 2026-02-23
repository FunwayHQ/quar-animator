/**
 * Export Dialog for Quar Animator
 *
 * Modal dialog with tabs for PNG Sequence, Sprite Sheet, and Lottie JSON export.
 * Follows the PromptDialog imperative + host pattern.
 *
 * Usage (imperative):
 *   import { showExportDialog } from './ExportDialog';
 *   showExportDialog('png-sequence');
 *
 * Mount <ExportDialogHost /> once in the app root.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { exportLottieBlob, analyzeLottieExport } from '@quar/export';
import type { ExportProgress } from '@quar/export';
import { downloadBlob } from '../../services/exportService';
import styles from './ExportDialog.module.css';

// ============================================================================
// Types
// ============================================================================

export type ExportTab = 'png-sequence' | 'sprite-sheet' | 'lottie';

interface ExportDialogState {
  tab: ExportTab;
  // Common
  width: number;
  height: number;
  startFrame: number;
  endFrame: number;
  // PNG Sequence
  pngMultiplier: 1 | 2 | 3 | 4;
  pngTransparent: boolean;
  pngPattern: string;
  // Sprite Sheet
  spriteLayout: 'grid' | 'packed';
  spriteColumns: number;
  spritePadding: number;
  spritePowerOfTwo: boolean;
  spriteIncludeMetadata: boolean;
  // Progress
  exporting: boolean;
  progress: ExportProgress | null;
  cancelled: boolean;
}

const EXIT_MS = 120;

const TABS: { id: ExportTab; label: string }[] = [
  { id: 'png-sequence', label: 'PNG Sequence' },
  { id: 'sprite-sheet', label: 'Sprite Sheet' },
  { id: 'lottie', label: 'Lottie JSON' },
];

// ============================================================================
// Component
// ============================================================================

function ExportDialog({ initialTab, onClose }: { initialTab: ExportTab; onClose: () => void }) {
  const sceneGraph = useSceneGraph();
  const timeline = useEditorStore((s) => s.timeline);
  const timelineDuration = useEditorStore((s) => s.timelineDuration);

  const [exiting, setExiting] = useState(false);
  const [state, setState] = useState<ExportDialogState>(() => ({
    tab: initialTab,
    width: 800,
    height: 600,
    startFrame: 0,
    endFrame: timelineDuration,
    pngMultiplier: 1,
    pngTransparent: false,
    pngPattern: 'frame_{N}',
    spriteLayout: 'grid',
    spriteColumns: 0, // 0 = auto
    spritePadding: 0,
    spritePowerOfTwo: false,
    spriteIncludeMetadata: true,
    exporting: false,
    progress: null,
    cancelled: false,
  }));

  const cancelledRef = useRef(false);

  const close = useCallback(() => {
    setExiting(true);
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (state.exporting) {
          cancelledRef.current = true;
          setState((s) => ({ ...s, cancelled: true }));
        } else {
          close();
        }
      }
    },
    [close, state.exporting]
  );

  const update = <K extends keyof ExportDialogState>(key: K, value: ExportDialogState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  };

  // Lottie analysis
  const lottieAnalysis =
    state.tab === 'lottie' && sceneGraph ? analyzeLottieExport(sceneGraph.getRootNodes()) : null;

  const handleExport = useCallback(async () => {
    if (!sceneGraph || !timeline) return;

    cancelledRef.current = false;
    setState((s) => ({ ...s, exporting: true, progress: null, cancelled: false }));

    try {
      if (state.tab === 'lottie') {
        // Lottie export is synchronous
        const blob = exportLottieBlob(
          sceneGraph.getRootNodes(),
          timeline,
          {
            width: state.width,
            height: state.height,
            startFrame: state.startFrame,
            endFrame: state.endFrame,
            frameRate: timeline.frameRate,
            name: 'Quar Animation',
          },
          (id: string) => sceneGraph.getNode(id)
        );
        downloadBlob(blob, 'animation.json');
        close();
      } else if (state.tab === 'png-sequence') {
        // PNG Sequence requires dynamic import of frameRenderer (WebGL)
        const { createFrameRenderer, getFrameCount, generateFrameFilenames } =
          await import('@quar/export');
        const JSZip = (await import('jszip')).default;

        const frameCount = getFrameCount(state.startFrame, state.endFrame);
        const filenames = generateFrameFilenames(
          state.pngPattern,
          state.startFrame,
          state.endFrame,
          'png'
        );
        const zip = new JSZip();

        const renderer = createFrameRenderer({
          width: state.width,
          height: state.height,
          multiplier: state.pngMultiplier,
          backgroundColor: state.pngTransparent ? null : { r: 26, g: 26, b: 26, a: 1 },
        });

        try {
          for (let i = 0; i < frameCount; i++) {
            if (cancelledRef.current) break;

            const _frame = state.startFrame + i;
            const progress: ExportProgress = {
              phase: 'rendering',
              current: i + 1,
              total: frameCount,
              percentage: Math.round(((i + 1) / frameCount) * 100),
            };
            setState((s) => ({ ...s, progress }));

            const blob = await renderer.renderFrameAsBlob({ sceneGraph, timeline }, _frame);
            if (blob) {
              zip.file(filenames[i], blob);
            }

            await new Promise((r) => setTimeout(r, 0));
          }

          if (!cancelledRef.current) {
            setState((s) => ({
              ...s,
              progress: {
                phase: 'finalizing',
                current: frameCount,
                total: frameCount,
                percentage: 100,
              },
            }));
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            downloadBlob(zipBlob, 'png-sequence.zip');
            close();
          }
        } finally {
          renderer.dispose();
        }
      } else if (state.tab === 'sprite-sheet') {
        const {
          createFrameRenderer,
          getFrameCount,
          packGrid,
          packMaxRects,
          nextPowerOfTwo,
          generateSpriteSheetMetadata,
        } = await import('@quar/export');

        const frameCount = getFrameCount(state.startFrame, state.endFrame);
        const cols = state.spriteColumns > 0 ? state.spriteColumns : undefined;

        let packResult;
        if (state.spriteLayout === 'grid') {
          packResult = packGrid(frameCount, state.width, state.height, cols, state.spritePadding);
        } else {
          const frames = Array.from({ length: frameCount }, () => ({
            width: state.width,
            height: state.height,
          }));
          packResult = packMaxRects(frames, 4096, 4096, state.spritePadding);
        }

        let atlasW = packResult.atlasWidth;
        let atlasH = packResult.atlasHeight;
        if (state.spritePowerOfTwo) {
          atlasW = nextPowerOfTwo(atlasW);
          atlasH = nextPowerOfTwo(atlasH);
        }

        const atlasCanvas = document.createElement('canvas');
        atlasCanvas.width = atlasW;
        atlasCanvas.height = atlasH;
        const atlasCtx = atlasCanvas.getContext('2d');
        if (!atlasCtx) throw new Error('Failed to get 2D context for sprite sheet atlas');

        const renderer = createFrameRenderer({
          width: state.width,
          height: state.height,
          multiplier: 1,
        });

        try {
          for (let i = 0; i < frameCount; i++) {
            if (cancelledRef.current) break;

            const frame = state.startFrame + i;
            const rect = packResult.rects[i];
            if (!rect || rect.x < 0) continue;

            setState((s) => ({
              ...s,
              progress: {
                phase: 'rendering',
                current: i + 1,
                total: frameCount,
                percentage: Math.round(((i + 1) / frameCount) * 90),
              },
            }));

            const frameCanvas = renderer.renderFrame({ sceneGraph, timeline }, frame);
            atlasCtx.drawImage(frameCanvas, rect.x, rect.y);

            await new Promise((r) => setTimeout(r, 0));
          }

          if (!cancelledRef.current) {
            setState((s) => ({
              ...s,
              progress: {
                phase: 'finalizing',
                current: frameCount,
                total: frameCount,
                percentage: 100,
              },
            }));
            const imageBlob = await new Promise<Blob>((resolve, reject) => {
              atlasCanvas.toBlob((blob) => {
                if (blob) {
                  resolve(blob);
                } else {
                  reject(new Error('Failed to generate sprite sheet image blob'));
                }
              }, 'image/png');
            });
            downloadBlob(imageBlob, 'spritesheet.png');

            if (state.spriteIncludeMetadata) {
              const metadata = generateSpriteSheetMetadata(
                packResult,
                {
                  startFrame: state.startFrame,
                  endFrame: state.endFrame,
                  frameWidth: state.width,
                  frameHeight: state.height,
                },
                'spritesheet.png'
              );
              const metaBlob = new Blob([JSON.stringify(metadata, null, 2)], {
                type: 'application/json',
              });
              downloadBlob(metaBlob, 'spritesheet.json');
            }

            close();
          }
        } finally {
          renderer.dispose();
        }
      }
    } catch (err) {
      console.error('Export failed:', err);
      setState((s) => ({ ...s, exporting: false, progress: null }));
    }
  }, [state, sceneGraph, timeline, close]);

  return createPortal(
    <div
      className={`${styles.backdrop} ${exiting ? styles.exiting : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !state.exporting) close();
      }}
      onKeyDown={handleKeyDown}
      data-testid="export-dialog-backdrop"
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Export Animation"
        data-testid="export-dialog"
      >
        {/* Header */}
        <div className={styles.header}>
          <h3 className={styles.title}>Export Animation</h3>
          <button className={styles.closeBtn} onClick={close} data-testid="export-dialog-close">
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`${styles.tab} ${state.tab === t.id ? styles.active : ''}`}
              onClick={() => update('tab', t.id)}
              disabled={state.exporting}
              data-testid={`export-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        {state.exporting && state.progress ? (
          <div className={styles.progress} data-testid="export-progress">
            <div className={styles.progressLabel}>
              {state.progress.phase === 'rendering'
                ? `Rendering frame ${state.progress.current} / ${state.progress.total}...`
                : 'Finalizing...'}
            </div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${state.progress.percentage}%` }}
              />
            </div>
            <button
              className={styles.btnDanger}
              onClick={() => {
                cancelledRef.current = true;
                setState((s) => ({ ...s, cancelled: true }));
              }}
              data-testid="export-cancel"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className={styles.body}>
            {/* Common settings */}
            <div className={styles.formRow}>
              <span className={styles.label}>Size</span>
              <input
                className={styles.inputSmall}
                type="number"
                value={state.width}
                onChange={(e) => update('width', parseInt(e.target.value) || 800)}
                min={1}
                max={8192}
                data-testid="export-width"
              />
              <span className={styles.dimSeparator}>x</span>
              <input
                className={styles.inputSmall}
                type="number"
                value={state.height}
                onChange={(e) => update('height', parseInt(e.target.value) || 600)}
                min={1}
                max={8192}
                data-testid="export-height"
              />
            </div>

            <div className={styles.formRow}>
              <span className={styles.label}>Frame Range</span>
              <input
                className={styles.inputSmall}
                type="number"
                value={state.startFrame}
                onChange={(e) => update('startFrame', parseInt(e.target.value) || 0)}
                min={0}
                data-testid="export-start-frame"
              />
              <span className={styles.dimSeparator}>to</span>
              <input
                className={styles.inputSmall}
                type="number"
                value={state.endFrame}
                onChange={(e) => update('endFrame', parseInt(e.target.value) || 60)}
                min={0}
                data-testid="export-end-frame"
              />
            </div>

            {/* Tab-specific settings */}
            {state.tab === 'png-sequence' && (
              <>
                <div className={styles.formRow}>
                  <span className={styles.label}>Multiplier</span>
                  <select
                    className={styles.select}
                    value={state.pngMultiplier}
                    onChange={(e) =>
                      update('pngMultiplier', parseInt(e.target.value) as 1 | 2 | 3 | 4)
                    }
                    data-testid="export-png-multiplier"
                  >
                    <option value={1}>1x</option>
                    <option value={2}>2x</option>
                    <option value={3}>3x</option>
                    <option value={4}>4x</option>
                  </select>
                </div>
                <div className={styles.formRow}>
                  <span className={styles.label}>Background</span>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={state.pngTransparent}
                      onChange={(e) => update('pngTransparent', e.target.checked)}
                      data-testid="export-png-transparent"
                    />
                    <span>Transparent</span>
                  </label>
                </div>
                <div className={styles.formRow}>
                  <span className={styles.label}>Pattern</span>
                  <input
                    className={styles.input}
                    type="text"
                    value={state.pngPattern}
                    onChange={(e) => update('pngPattern', e.target.value)}
                    placeholder="frame_{N}"
                    data-testid="export-png-pattern"
                  />
                </div>
              </>
            )}

            {state.tab === 'sprite-sheet' && (
              <>
                <div className={styles.formRow}>
                  <span className={styles.label}>Layout</span>
                  <select
                    className={styles.select}
                    value={state.spriteLayout}
                    onChange={(e) => update('spriteLayout', e.target.value as 'grid' | 'packed')}
                    data-testid="export-sprite-layout"
                  >
                    <option value="grid">Grid</option>
                    <option value="packed">Packed</option>
                  </select>
                </div>
                {state.spriteLayout === 'grid' && (
                  <div className={styles.formRow}>
                    <span className={styles.label}>Columns</span>
                    <input
                      className={styles.inputSmall}
                      type="number"
                      value={state.spriteColumns}
                      onChange={(e) => update('spriteColumns', parseInt(e.target.value) || 0)}
                      min={0}
                      placeholder="Auto"
                      data-testid="export-sprite-columns"
                    />
                  </div>
                )}
                <div className={styles.formRow}>
                  <span className={styles.label}>Padding</span>
                  <input
                    className={styles.inputSmall}
                    type="number"
                    value={state.spritePadding}
                    onChange={(e) => update('spritePadding', parseInt(e.target.value) || 0)}
                    min={0}
                    max={64}
                    data-testid="export-sprite-padding"
                  />
                </div>
                <div className={styles.formRow}>
                  <span className={styles.label}>Options</span>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={state.spritePowerOfTwo}
                      onChange={(e) => update('spritePowerOfTwo', e.target.checked)}
                    />
                    <span>Power of Two</span>
                  </label>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={state.spriteIncludeMetadata}
                      onChange={(e) => update('spriteIncludeMetadata', e.target.checked)}
                    />
                    <span>Include JSON</span>
                  </label>
                </div>
              </>
            )}

            {state.tab === 'lottie' && lottieAnalysis && (
              <>
                <div className={styles.formRow}>
                  <span className={styles.label}>Supported</span>
                  <span style={{ fontSize: 11, color: '#a1a1aa' }}>
                    {lottieAnalysis.supportedCount} nodes
                  </span>
                </div>
                {lottieAnalysis.unsupportedCount > 0 && (
                  <div className={styles.warning}>
                    <AlertTriangle size={14} className={styles.warningIcon} />
                    <span className={styles.warningText}>
                      {lottieAnalysis.unsupportedCount} unsupported node(s) will be skipped:{' '}
                      {lottieAnalysis.unsupportedTypes.join(', ')}. Text, images, effects,
                      gradients, and rigging are not yet supported in Lottie export.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer */}
        {!state.exporting && (
          <div className={styles.footer}>
            <button className={styles.btnCancel} onClick={close} data-testid="export-dialog-cancel">
              Cancel
            </button>
            <button
              className={styles.btnPrimary}
              onClick={() => void handleExport()}
              data-testid="export-dialog-export"
            >
              Export
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// Imperative API
// ============================================================================

type HostListener = (tab: ExportTab | null) => void;
const hostListeners = new Set<HostListener>();

/**
 * Show the export dialog with the given format tab active.
 */
export function showExportDialog(tab: ExportTab = 'png-sequence'): void {
  hostListeners.forEach((fn) => fn(tab));
}

/**
 * Mount once in the app root to enable the `showExportDialog()` imperative API.
 */
export function ExportDialogHost() {
  const [activeTab, setActiveTab] = useState<ExportTab | null>(null);

  useEffect(() => {
    const listener: HostListener = (tab) => setActiveTab(tab);
    hostListeners.add(listener);
    return () => {
      hostListeners.delete(listener);
    };
  }, []);

  if (!activeTab) return null;

  return <ExportDialog initialTab={activeTab} onClose={() => setActiveTab(null)} />;
}
