import { describe, expect, it } from 'vitest';
import { hasUnsavedDraft, registerDraft, _resetDraftRegistryForTesting } from './draft-registry';

describe('draft registry', () => {
  it('tracks memory drafts and unregisters safely', () => {
    _resetDraftRegistryForTesting();
    let draft = 'secret';
    const unregister = registerDraft('chat', () => draft.length > 0);
    expect(hasUnsavedDraft()).toBe(true);
    draft = '';
    expect(hasUnsavedDraft()).toBe(false);
    unregister();
    expect(hasUnsavedDraft()).toBe(false);
  });
});
