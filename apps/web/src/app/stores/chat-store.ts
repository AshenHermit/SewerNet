import { create } from 'zustand';

/**
 * UI-only chat state. Room and timeline data live in the matrix-js-sdk
 * (consumed through use-rooms/use-timeline hooks); the store keeps the
 * active room pointer and error surface.
 */
interface ChatState {
  activeRoomId: string | null;
  error: string | null;
  setActiveRoom: (roomId: string | null) => void;
  setError: (error: string | null) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  activeRoomId: null,
  error: null,
  setActiveRoom: (activeRoomId) => set({ activeRoomId }),
  setError: (error) => set({ error }),
}));
