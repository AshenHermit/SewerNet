import type { ChatSection } from '@sewer-net/ui';
import { create } from 'zustand';

/**
 * UI-only chat state. Room and timeline data live in the matrix-js-sdk
 * (consumed through use-rooms/use-timeline hooks); the store keeps the
 * active room pointer, the visible section and the error surface.
 *
 * Nothing here is persisted and nothing reads the viewport: the layout mode is
 * derived in the UI kit, so a resize never mutates navigation state. Drafts
 * and the room search query stay in their own controllers.
 */
interface ChatState {
  activeRoomId: string | null;
  section: ChatSection;
  error: string | null;
  setActiveRoom: (roomId: string | null) => void;
  showRooms: () => void;
  showSettings: () => void;
  closeSettings: () => void;
  resetUi: () => void;
  setError: (error: string | null) => void;
}

const INITIAL_SECTION: ChatSection = 'rooms';

export const useChatStore = create<ChatState>()((set) => ({
  activeRoomId: null,
  section: INITIAL_SECTION,
  error: null,

  /**
   * Selecting a room atomically selects it and shows the chat. Clearing the
   * selection returns to the room list. "Back" is `showRooms()`, which keeps
   * the selection, so this null path is not the back-navigation path.
   */
  setActiveRoom: (activeRoomId) =>
    set({ activeRoomId, section: activeRoomId === null ? INITIAL_SECTION : 'chat' }),

  showRooms: () => set({ section: INITIAL_SECTION }),
  showSettings: () => set({ section: 'settings' }),
  closeSettings: () => set({ section: INITIAL_SECTION }),

  /** Clears the UI navigation, keeping the error surface for the caller to own. */
  resetUi: () => set({ activeRoomId: null, section: INITIAL_SECTION }),

  setError: (error) => set({ error }),
}));

/**
 * Resolves the section that can actually be rendered: requesting the chat
 * without a selected room falls back to the room list. Any other combination
 * is returned unchanged. Takes state, never a viewport width.
 */
export function getEffectiveSection(
  section: ChatSection,
  activeRoomId: string | null,
): ChatSection {
  return section === 'chat' && activeRoomId === null ? INITIAL_SECTION : section;
}
