/**
 * useProjectInAddress Hook
 * The editor's address names the project open in it (`/editor?project=…`),
 * so reloading the page opens it again: the id it names when the editor
 * opens is the project to load, and from then on the address follows the
 * project the editor has open — saved for the first time, saved as another,
 * opened, imported or a new one begun — without adding to the history.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEditorStore } from '../stores/editorStore';

const PARAM = 'project';

/** The project the address named as the editor opened (null: none, a new project). */
export function useProjectInAddress(): string | null {
  const [searchParams, setSearchParams] = useSearchParams();
  // Read once: the address changing after this only follows the editor, and
  // must never load the project again over its unsaved changes
  const [opening] = useState(() => searchParams.get(PARAM));
  // The project the store held as the editor opened: the store outlives the
  // page, so until the one asked for is open it may still be the last one's
  const [before] = useState(() => useEditorStore.getState().projectId);
  const projectId = useEditorStore((state) => state.projectId);

  useEffect(() => {
    if (opening !== null && projectId === before && projectId !== opening) return;
    setSearchParams(
      (params) => {
        if ((params.get(PARAM) ?? null) === projectId) return params;
        const next = new URLSearchParams(params);
        if (projectId === null) next.delete(PARAM);
        else next.set(PARAM, projectId);
        return next;
      },
      { replace: true }
    );
  }, [projectId, opening, before, setSearchParams]);

  return opening;
}
