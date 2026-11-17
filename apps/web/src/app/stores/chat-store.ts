import { create } from 'zustand';
import type { MatrixRoomEvent } from '@sewer-net/types';

export interface RoomInfo {
  id: string;
  name: string;
  preview: string;
  lastTs: number;
  avatar?: string;
  topic?: string;
}

interface ChatState {
  rooms: RoomInfo[];
  activeRoomId: string | null;
  /** event id -> message event, keyed per room */
  messages: Record<string, MatrixRoomEvent[]>;
  /** Last known /sync position per room, used to resume long-poll after reconnect. */
  syncedPos: Record<string, string>;
  loadingRooms: boolean;
  loadingMessages: boolean;
  sending: boolean;
  error: string | null;
  setRooms: (rooms: RoomInfo[]) => void;
  setActiveRoom: (roomId: string | null) => void;
  setMessages: (roomId: string, events: MatrixRoomEvent[]) => void;
  appendMessage: (roomId: string, event: MatrixRoomEvent) => void;
  setSyncedPos: (roomId: string, pos: string) => void;
  setLoadingRooms: (loading: boolean) => void;
  setLoadingMessages: (loading: boolean) => void;
  setSending: (sending: boolean) => void;
  setError: (error: string | null) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  rooms: [],
  activeRoomId: null,
  messages: {},
  loadingRooms: false,
  loadingMessages: false,
  sending: false,
  error: null,
  syncedPos: {},
  setRooms: (rooms) => set({ rooms }),
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
  setLoadingRooms: (loadingRooms) => set({ loadingRooms }),
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
