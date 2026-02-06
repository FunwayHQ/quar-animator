import { Toolbar } from '../components/layout/Toolbar';
import { Canvas } from '../components/layout/Canvas';
import { PropertiesPanel } from '../components/layout/PropertiesPanel';
import { LayerPanel } from '../components/layout/LayerPanel';
import { Timeline } from '../components/layout/Timeline';
import { MenuBar } from '../components/layout/MenuBar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SceneGraphProvider } from '../contexts/SceneGraphContext';
import { usePlayback } from '../hooks/usePlayback';
import { useTimelineShortcuts } from '../hooks/useTimelineShortcuts';
import styles from './Editor.module.css';

function EditorInner() {
  const playback = usePlayback();
  useTimelineShortcuts(playback);

  return (
    <div className={styles.editor}>
      <MenuBar />
      <Toolbar />
      <div className={styles.main}>
        <div className={styles.workspace}>
          <div className={styles.leftPanel}>
            <LayerPanel />
          </div>
          <div className={styles.canvasArea}>
            <ErrorBoundary>
              <Canvas />
            </ErrorBoundary>
          </div>
          <div className={styles.rightPanel}>
            <PropertiesPanel />
          </div>
        </div>
        <Timeline />
      </div>
    </div>
  );
}

export function Editor() {
  return (
    <SceneGraphProvider>
      <EditorInner />
    </SceneGraphProvider>
  );
}

export default Editor;
