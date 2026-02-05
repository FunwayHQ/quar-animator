import { Toolbar } from '../components/layout/Toolbar';
import { Canvas } from '../components/layout/Canvas';
import { PropertiesPanel } from '../components/layout/PropertiesPanel';
import { LayerPanel } from '../components/layout/LayerPanel';
import { Timeline } from '../components/layout/Timeline';
import { MenuBar } from '../components/layout/MenuBar';
import styles from './Editor.module.css';

export function Editor() {
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
            <Canvas />
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

export default Editor;
