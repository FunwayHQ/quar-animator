/**
 * The timeline in view follows what you work on: selecting a layer brings
 * its artboard's timeline (or, outside every artboard, the page's); the
 * artboard in view deleted, the page's comes back.
 */

import { useEffect } from 'react';
import { timelineScopeOf } from '@quar/core';

import { useSceneGraph } from '../contexts/SceneGraphContext';
import { useEditorStore } from '../stores/editorStore';

export function useTimelineScope(): void {
  const sceneGraph = useSceneGraph();

  useEffect(() => {
    const follow = (selected: ReadonlySet<string>) => {
      const [first] = selected;
      if (first === undefined) return;
      const scope = timelineScopeOf(sceneGraph, first);
      if (scope !== useEditorStore.getState().timelineScope) {
        useEditorStore.getState().setTimelineScope(scope);
      }
    };
    follow(useEditorStore.getState().selectedNodeIds);
    const stopSelection = useEditorStore.subscribe((curr, prev) => {
      if (curr.selectedNodeIds !== prev.selectedNodeIds) follow(curr.selectedNodeIds);
    });
    const gone = () => {
      const { timelineScope } = useEditorStore.getState();
      if (timelineScope !== null && sceneGraph.getNode(timelineScope)?.type !== 'artboard') {
        useEditorStore.getState().setTimelineScope(null);
      }
    };
    const stopRemoved = sceneGraph.on('nodeRemoved', gone);
    const stopReplaced = sceneGraph.on('graphReplaced', gone);
    return () => {
      stopSelection();
      stopRemoved();
      stopReplaced();
    };
  }, [sceneGraph]);
}
