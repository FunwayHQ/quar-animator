/**
 * Saves still being written to this browser's storage. A project is marked
 * saved as soon as it's serialized (so an edit made while it's written marks
 * it unsaved again); until the write is done, leaving the page could cut it
 * off, so the leave warning asks meanwhile (useLeaveWarning).
 */

let writing = 0;

/** Run `write` counted as a save in flight. */
export async function whileSaving<T>(write: () => Promise<T>): Promise<T> {
  writing += 1;
  try {
    return await write();
  } finally {
    writing -= 1;
  }
}

/** How many saves are being written now. */
export function savesInFlight(): number {
  return writing;
}
