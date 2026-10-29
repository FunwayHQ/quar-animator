/**
 * Deleting video layers whose sounds are on the Sound lane asks, once,
 * whether their sounds go with them or stay as sounds of their own.
 */

import { confirmDialog } from '../components/common/PromptDialog';

/** True to delete the sounds with their videos; false to keep them (Escape keeps them too). */
export function deleteVideoSoundsToo(count: number): Promise<boolean> {
  const one = count === 1;
  return confirmDialog({
    title: one ? 'Delete the video’s sound too?' : 'Delete the videos’ sounds too?',
    message: one
      ? 'Its sound is on the Sound lane. Keep it there as a sound of its own, or delete it with the video.'
      : `Their ${count} sounds are on the Sound lane. Keep them there as sounds of their own, or delete them with the videos.`,
    confirmLabel: one ? 'Delete Sound' : 'Delete Sounds',
    cancelLabel: one ? 'Keep Sound' : 'Keep Sounds',
  });
}
