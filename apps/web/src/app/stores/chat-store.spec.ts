import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEffectiveSection, useChatStore } from './chat-store';

const state = () => useChatStore.getState();

beforeEach(() => {
  state().resetUi();
  state().setError(null);
  vi.restoreAllMocks();
});

describe('chat section transitions', () => {
  it('starts in rooms', () => {
    expect(state().section).toBe('rooms');
    expect(state().activeRoomId).toBeNull();
  });

  it('selects a room and opens chat', () => {
    state().setActiveRoom('!a:hs');
    expect([state().activeRoomId, state().section]).toEqual(['!a:hs', 'chat']);
  });

  it('back preserves selection', () => {
    state().setActiveRoom('!a:hs');
    state().showRooms();
    expect([state().activeRoomId, state().section]).toEqual(['!a:hs', 'rooms']);
  });

  it('settings close returns to rooms', () => {
    state().setActiveRoom('!a:hs');
    state().showSettings();
    expect(state().section).toBe('settings');
    state().closeSettings();
    expect([state().activeRoomId, state().section]).toEqual(['!a:hs', 'rooms']);
  });

  it('navigation preserves errors', () => {
    state().setError('boom');
    state().setActiveRoom('!a:hs');
    state().showSettings();
    expect(state().error).toBe('boom');
    state().closeSettings();
    expect(state().error).toBe('boom');
  });

  it('clearing the selection returns to rooms', () => {
    state().setActiveRoom('!a:hs');
    state().setActiveRoom(null);
    expect([state().activeRoomId, state().section]).toEqual([null, 'rooms']);
  });

  it('resets the whole UI but not the error surface contract', () => {
    state().setActiveRoom('!a:hs');
    state().showSettings();
    state().resetUi();
    expect([state().activeRoomId, state().section]).toEqual([null, 'rooms']);
  });

  it('does not persist UI navigation', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    state().setActiveRoom('!a:hs');
    state().showSettings();
    state().showRooms();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('does not expose layout width or mode', () => {
    const keys = Object.keys(state());
    expect(keys).not.toContain('width');
    expect(keys).not.toContain('mode');
    expect(keys).not.toContain('layoutMode');
  });

  it('keeps media queries out of the navigation model', () => {
    const setActiveRoom = state().setActiveRoom;
    const matchMedia = vi.fn();
    vi.stubGlobal('matchMedia', matchMedia);
    state().setActiveRoom('!a:hs');
    state().showRooms();
    expect(setActiveRoom).toBe(state().setActiveRoom);
    expect(matchMedia).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('getEffectiveSection', () => {
  it('falls back from chat without a selection', () => {
    expect(getEffectiveSection('chat', null)).toBe('rooms');
  });

  it('keeps settings without a selection', () => {
    expect(getEffectiveSection('settings', null)).toBe('settings');
  });

  it('leaves other combinations unchanged', () => {
    expect(getEffectiveSection('chat', '!a:hs')).toBe('chat');
    expect(getEffectiveSection('rooms', '!a:hs')).toBe('rooms');
    expect(getEffectiveSection('rooms', null)).toBe('rooms');
  });
});
