import { useSearchParams } from 'react-router-dom';
import { Toolbar } from '../components/layout/Toolbar';
import { Canvas } from '../components/layout/Canvas';
import { PropertiesPanel } from '../components/layout/PropertiesPanel';
import { LayerPanel } from '../components/layout/LayerPanel';
import { Timeline } from '../components/layout/Timeline';
import { MenuBar } from '../components/layout/MenuBar';
import { PageTabs } from '../components/layout/PageTabs';
import SymbolLibraryPanel from '../components/layout/SymbolLibraryPanel';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ExportDialogHost } from '../components/common/ExportDialog';
import { PresentationHost } from '../components/presentation/PresentationPlayer';
import { AnimationSequenceWindow } from '../components/common/AnimationSequenceWindow';
import { SceneGraphProvider } from '../contexts/SceneGraphContext';
import { useTimelineScope } from '../hooks/useTimelineScope';
import { usePlayback } from '../hooks/usePlayback';
import { useSoundPlayback } from '../hooks/useSoundPlayback';
import { useTimelineShortcuts } from '../hooks/useTimelineShortcuts';
import { useProjectActions } from '../hooks/useProjectActions';
import { useUndoShortcuts } from '../hooks/useUndoShortcuts';
import { useFlipShortcuts } from '../hooks/useFlipShortcuts';
import { useSystemClipboard } from '../hooks/useSystemClipboard';
import { useViewShortcuts } from '../hooks/useViewShortcuts';
import { useEditorStore } from '../stores/editorStore';
import { okToDiscard } from '../services/unsavedChanges';
import { useSceneGraph } from '../contexts/SceneGraphContext';
import { useDirtyTracking } from '../hooks/useDirtyTracking';
import { useDocumentFonts } from '../hooks/useDocumentFonts';
import styles from './Editor.module.css';

function EditorInner() {
  const playback = usePlayback();
  // The timeline's sound clips play with it
  useSoundPlayback();
  useTimelineShortcuts(playback);
  useTimelineScope();

  const sceneGraph = useSceneGraph();
  useUndoShortcuts(sceneGraph);
  useFlipShortcuts(sceneGraph);
  // Copy/cut onto the system clipboard, for pasting into other windows and browsers
  useSystemClipboard(sceneGraph);
  // Fit, 100% and zoom keys work wherever focus is
  useViewShortcuts();
  // Unsaved changes: any scene edit, but not an export posing frames
  useDirtyTracking(sceneGraph);
  useDocumentFonts(sceneGraph);

  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');

  const projectActions = useProjectActions({ loadProjectId: projectId });

  // A .quar dropped on the canvas takes the editor's place
  const openDroppedProject = async (file: File) => {
    if (await okToDiscard('Opening the dropped project')) {
      await projectActions.importProjectFile(file);
    }
  };

  const sequenceWindowOpen = useEditorStore((state) => state.sequenceWindowOpen);

  return (
    <div className={styles.editor}>
      <MenuBar projectActions={projectActions} toolbar={<Toolbar />} />
      <PageTabs />
      <div className={styles.main}>
        <div className={styles.workspace}>
          <div className={styles.leftPanel}>
            <LayerPanel />
            <SymbolLibraryPanel />
          </div>
          <div className={styles.canvasArea}>
            <ErrorBoundary>
              <Canvas onProjectFileDrop={openDroppedProject} />
            </ErrorBoundary>
          </div>
          <div className={styles.rightPanel}>
            <PropertiesPanel />
          </div>
        </div>
        <Timeline playback={playback} />
      </div>
      {sequenceWindowOpen && <AnimationSequenceWindow />}
    </div>
  );
}

export function Editor() {
  return (
    <SceneGraphProvider>
      <>
        <EditorInner />
        <ExportDialogHost />
        <PresentationHost />
      </>
    </SceneGraphProvider>
  );
}

export default Editor;
