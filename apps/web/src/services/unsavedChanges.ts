/**
 * Unsaved changes, asked about the same way wherever the project in the
 * editor is about to be replaced: New, Open, Import, a .quar dropped on the
 * canvas, going back to the projects.
 */

import { confirmDialog } from '../components/common/PromptDialog';
import { useEditorStore } from '../stores/editorStore';

/**
 * True when the project can be replaced: nothing is unsaved, or the person
 * chose to discard it. `doing` begins the question's sentence ("Opening
 * another project") — "… will discard your unsaved changes."
 */
export async function okToDiscard(doing: string): Promise<boolean> {
  if (!useEditorStore.getState().isDirty) return true;
  return confirmDialog({
    title: 'Discard unsaved changes?',
    message: `${doing} will discard your unsaved changes.`,
    confirmLabel: 'Discard',
  });
}
