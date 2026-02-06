import { createContext, useContext, useRef, type ReactNode } from 'react';
import { SceneGraph } from '@quar/core';

const SceneGraphContext = createContext<SceneGraph | null>(null);

export function SceneGraphProvider({ children }: { children: ReactNode }) {
  const sceneGraphRef = useRef<SceneGraph>(new SceneGraph());
  return (
    <SceneGraphContext.Provider value={sceneGraphRef.current}>
      {children}
    </SceneGraphContext.Provider>
  );
}

export function useSceneGraph(): SceneGraph {
  const sceneGraph = useContext(SceneGraphContext);
  if (!sceneGraph) {
    throw new Error('useSceneGraph must be used within a SceneGraphProvider');
  }
  return sceneGraph;
}
