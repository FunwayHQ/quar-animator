import { Toolbar } from '../components/layout/Toolbar';
import { Canvas } from '../components/layout/Canvas';
import { PropertiesPanel } from '../components/layout/PropertiesPanel';
import { LayerPanel } from '../components/layout/LayerPanel';
import { Timeline } from '../components/layout/Timeline';
import { MenuBar } from '../components/layout/MenuBar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SceneGraphProvider } from '../contexts/SceneGraphContext';
import styles from './Editor.module.css';

export function Editor() {
  return (
    <SceneGraphProvider>
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
    </SceneGraphProvider>
  );
}

export default Editor;
