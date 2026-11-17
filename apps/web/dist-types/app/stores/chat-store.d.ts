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
export declare const useChatStore: import("zustand").UseBoundStore<import("zustand").StoreApi<ChatState>>;
/** Derives a readable room name from state events, falling back to the id. */
export declare function roomNameFromEvents(roomId: string, events: MatrixRoomEvent[]): string;
/** Best-effort preview text for the room list. */
export declare function previewFromEvent(event: MatrixRoomEvent | undefined): string;
export {};
//# sourceMappingURL=chat-store.d.ts.map