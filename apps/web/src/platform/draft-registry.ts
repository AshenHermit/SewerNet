/**
 * Memory-only registry of unsaved drafts.
 *
 * Drafts are potentially sensitive message text, so they are never persisted
 * to disk. Views that hold unsaved input register a getter for the lifetime of
 * their mount; the updater and the desktop exit coordinator ask the registry
 * before a reload/shutdown they cannot undo.
 */

type DraftGetter = () => boolean;

const _drafts = new Map<string, DraftGetter>();

export function registerDraft(id: string, hasDraft: () => boolean): () => void {
  _drafts.set(id, hasDraft);
  let active = true;
  return () => {
    if (!active) {
      return;
    }
    active = false;
    if (_drafts.get(id) === hasDraft) {
      _drafts.delete(id);
    }
  };
}

export function hasUnsavedDraft(): boolean {
  for (const getter of _drafts.values()) {
    try {
      if (getter()) {
        return true;
      }
    } catch {
      // A broken getter must not block shutdown forever; treat it as clean.
    }
  }
  return false;
}

/** Test-only reset so one test cannot leak a draft into the next. */
export function _resetDraftRegistryForTesting(): void {
  _drafts.clear();
}
