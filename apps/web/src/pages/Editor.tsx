import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Toolbar } from '../components/layout/Toolbar';
import { Canvas } from '../components/layout/Canvas';
import { PropertiesPanel } from '../components/layout/PropertiesPanel';
import { LayerPanel } from '../components/layout/LayerPanel';
import { Timeline } from '../components/layout/Timeline';
import { MenuBar } from '../components/layout/MenuBar';
import { PageTabs } from '../components/layout/PageTabs';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SceneGraphProvider } from '../contexts/SceneGraphContext';
import { usePlayback } from '../hooks/usePlayback';
import { useTimelineShortcuts } from '../hooks/useTimelineShortcuts';
import { useProjectActions } from '../hooks/useProjectActions';
import { useProjectShortcuts } from '../hooks/useProjectShortcuts';
import { useEditorStore } from '../stores/editorStore';
import { useSceneGraph } from '../contexts/SceneGraphContext';
import styles from './Editor.module.css';

function EditorInner() {
  const playback = usePlayback();
  useTimelineShortcuts(playback);

  // Mark project dirty when scene graph changes
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
  const sceneGraph = useSceneGraph();
  useEffect(() => {
    const markDirty = () => useEditorStore.getState().markDirty();
    const unsubs = [
      sceneGraph.on('nodeAdded', markDirty),
      sceneGraph.on('nodeChanged', markDirty),
      sceneGraph.on('nodeRemoved', markDirty),
    ];
    return () => unsubs.forEach((u) => u());
  }, [sceneGraph]);
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');

  const projectActions = useProjectActions({ loadProjectId: projectId });

  // Save As opens the prompt via MenuBar — trigger via shortcut needs name
  const handleSaveAs = useCallback(() => {
    const name = useEditorStore.getState().projectName;
    const newName = window.prompt('Save project as:', name);
    if (newName && newName.trim()) {
      void projectActions.saveProjectAs(newName.trim());
    }
  }, [projectActions]);

  const handleOpen = useCallback(async () => {
    // Ctrl+O shortcut shows prompt-based open (MenuBar has the full dialog)
    const projects = await projectActions.listProjects();
    if (projects.length === 0) {
      return;
    }
    // For keyboard shortcut, use a simple prompt
    const names = projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    const choice = window.prompt(`Open project:\n${names}\n\nEnter number:`);
    if (choice) {
      const idx = parseInt(choice, 10) - 1;
      if (idx >= 0 && idx < projects.length) {
        await projectActions.openProject(projects[idx]!.id);
      }
    }
  }, [projectActions]);

  const shortcutCallbacks = useMemo(
    () => ({
      onSave: () => projectActions.saveProject(),
      onSaveAs: handleSaveAs,
      onNew: () => projectActions.newProject(),
      onOpen: handleOpen,
      onImportSvg: () => projectActions.importSvg(),
    }),
    [projectActions, handleSaveAs, handleOpen]
  );

  useProjectShortcuts(shortcutCallbacks);

  return (
    <div className={styles.editor}>
      <MenuBar projectActions={projectActions} />
      <Toolbar />
      <PageTabs />
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
        <Timeline playback={playback} />
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
