import { create } from 'zustand';
import type { MatrixRoomEvent } from '@sewer-net/types';

interface ChatState {
  activeRoomId: string | null;
  /** event id -> message event, keyed per room (legacy path until the timeline migration). */
  messages: Record<string, MatrixRoomEvent[]>;
  /** Last known /sync position per room (legacy long-poll path). */
  syncedPos: Record<string, string>;
  loadingMessages: boolean;
  sending: boolean;
  error: string | null;
  setActiveRoom: (roomId: string | null) => void;
  setMessages: (roomId: string, events: MatrixRoomEvent[]) => void;
  appendMessage: (roomId: string, event: MatrixRoomEvent) => void;
  setSyncedPos: (roomId: string, pos: string) => void;
  setLoadingMessages: (loading: boolean) => void;
  setSending: (sending: boolean) => void;
  setError: (error: string | null) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  activeRoomId: null,
  messages: {},
  loadingMessages: false,
  sending: false,
  error: null,
  syncedPos: {},
  setActiveRoom: (activeRoomId) => set({ activeRoomId }),
  setMessages: (roomId, events) =>
    set((state) => ({ messages: { ...state.messages, [roomId]: events } })),
  appendMessage: (roomId, event) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [roomId]: [...(state.messages[roomId] ?? []), event],
      },
    })),
  setSyncedPos: (roomId, pos) =>
    set((state) => ({ syncedPos: { ...state.syncedPos, [roomId]: pos } })),
  setLoadingMessages: (loadingMessages) => set({ loadingMessages }),
  setSending: (sending) => set({ sending }),
  setError: (error) => set({ error }),
}));

/** Derives a readable room name from state events, falling back to the id. */
export function roomNameFromEvents(roomId: string, events: MatrixRoomEvent[]): string {
  const nameEvent = [...events]
    .reverse()
    .find((e) => e.type === 'm.room.name' && typeof e.content?.['name'] === 'string');
  const name = nameEvent ? (nameEvent.content['name'] as string) : '';
  return name || roomId.replace(/![^:]*:/, '!…:');
}

/** Best-effort preview text for the room list. */
export function previewFromEvent(event: MatrixRoomEvent | undefined): string {
  if (!event) return '';
  const content = event.content as { body?: unknown; msgtype?: unknown };
  return typeof content.body === 'string' ? content.body : event.type;
}
