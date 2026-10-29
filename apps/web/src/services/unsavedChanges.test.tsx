import { describe, expect, it } from 'vitest';

import { act, fireEvent, render, screen } from '../test/utils';
import { PromptDialogHost } from '../components/common/PromptDialog';
import { useEditorStore } from '../stores/editorStore';
import { okToDiscard } from './unsavedChanges';

describe('okToDiscard', () => {
  it('asks nothing when nothing is unsaved', async () => {
    useEditorStore.setState({ isDirty: false });
    render(<PromptDialogHost />);
    await expect(okToDiscard('Opening another project')).resolves.toBe(true);
    expect(screen.queryByTestId('prompt-dialog')).toBeNull();
  });

  it('asks, saying what would discard the changes', async () => {
    useEditorStore.setState({ isDirty: true });
    render(<PromptDialogHost />);
    let answer: Promise<boolean> = Promise.resolve(false);
    act(() => {
      answer = okToDiscard('Opening another project');
    });
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
    expect(
      screen.getByText('Opening another project will discard your unsaved changes.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('prompt-dialog-confirm'));
    await expect(answer).resolves.toBe(true);
  });

  it('keeps the changes when the question is cancelled', async () => {
    useEditorStore.setState({ isDirty: true });
    render(<PromptDialogHost />);
    let answer: Promise<boolean> = Promise.resolve(true);
    act(() => {
      answer = okToDiscard('Importing a project');
    });
    fireEvent.click(await screen.findByTestId('prompt-dialog-cancel'));
    await expect(answer).resolves.toBe(false);
  });
});
