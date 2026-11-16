import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  ProxyButton,
  ProxyChatViewPanel,
  ProxyChatViewMessage,
  ProxyInput,
} from '@sewer-net/ui';
import { ProxyIcon } from '@sewer-net/icons';
import { matrixClient } from '../../lib/matrix-client';
import { useAuthStore } from '../stores/auth-store';
import {
  previewFromEvent,
  roomNameFromEvents,
  useChatStore,
} from '../stores/chat-store';

interface ChatViewProps {
  onAuthError: (err: unknown) => void;
}

export function ChatView({ onAuthError }: ChatViewProps) {
  const session = useAuthStore((state) => state.session);
  const rooms = useChatStore((state) => state.rooms);
  const activeRoomId = useChatStore((state) => state.activeRoomId);
  const messages = useChatStore((state) => state.messages);
  const loadingMessages = useChatStore((state) => state.loadingMessages);
  const sending = useChatStore((state) => state.sending);
  const setActiveRoom = useChatStore((state) => state.setActiveRoom);
  const setMessages = useChatStore((state) => state.setMessages);
  const appendMessage = useChatStore((state) => state.appendMessage);
  const setLoadingMessages = useChatStore((state) => state.setLoadingMessages);
  const setSending = useChatStore((state) => state.setSending);
  const setError = useChatStore((state) => state.setError);
  const error = useChatStore((state) => state.error);

  const { t } = useLingui();
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const loadedRoomRef = useRef<string | null>(null);

  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? null;
  const events = activeRoomId ? (messages[activeRoomId] ?? []) : [];
  const roomName = activeRoom
    ? roomNameFromEvents(activeRoom.id, events) || activeRoom.name
    : '';

  // Load history when a room is opened.
  useEffect(() => {
    if (!activeRoomId || !session || loadedRoomRef.current === activeRoomId)
      return;
    let cancelled = false;
    const roomId = activeRoomId;
    const currentSession = session;

    async function loadMessages() {
      setLoadingMessages(true);
      setError(null);
      try {
        const res = await matrixClient.getMessages(currentSession, roomId, {
          limit: 50,
        });
        if (cancelled) return;
        loadedRoomRef.current = roomId;
        setMessages(roomId, res.chunk);
        // Enrich the room list with name/preview derived from history.
        const name = roomNameFromEvents(roomId, res.chunk);
        const lastEvent = [...res.chunk]
          .reverse()
          .find((e) => e.type === 'm.room.message');
        useChatStore.setState((state) => ({
          rooms: state.rooms.map((room) =>
            room.id === roomId
              ? {
                  ...room,
                  name: name || room.name,
                  preview: previewFromEvent(lastEvent),
                }
              : room,
          ),
        }));
      } catch (err) {
        if (!cancelled) {
          onAuthError(err);
          setError(
            err instanceof Error ? err.message : 'Failed to load messages',
          );
        }
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    }

    void loadMessages();
    return () => {
      cancelled = true;
    };
  }, [
    activeRoomId,
    session,
    onAuthError,
    setLoadingMessages,
    setError,
    setMessages,
  ]);

  // Keep the newest message visible.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !activeRoomId || !session || sending) return;

    setSending(true);
    setError(null);
    try {
      const { event_id } = await matrixClient.sendMessage(
        session,
        activeRoomId,
        body,
      );
      appendMessage(activeRoomId, {
        event_id,
        type: 'm.room.message',
        sender: session.userId,
        origin_server_ts: Date.now(),
        content: { msgtype: 'm.text', body },
      });
      setDraft('');
    } catch (err) {
      onAuthError(err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  if (!session) return null;

  if (!activeRoomId) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-3 bg-[var(--sn-surface-1)] text-[var(--sn-text-dim)]">
        <ProxyIcon name="message" size={48} strokeWidth={1.2} />
        <p className="text-sm">
          <Trans>Select a chat to start messaging</Trans>
        </p>
      </section>
    );
  }

  return (
    <ProxyChatViewPanel className="min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col bg-[var(--sn-surface-1)]">
        <header className="flex h-14 items-center gap-3 border-b border-[var(--sn-border)] px-4">
          <button
            onClick={() => setActiveRoom(null)}
            className="text-[var(--sn-text-muted)] hover:text-[var(--sn-text)] md:hidden"
            aria-label={t`Back`}
          >
            <ProxyIcon name="back" />
          </button>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--sn-surface-3)] text-[var(--sn-text-muted)]">
            <ProxyIcon name="room" size={18} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-[var(--sn-text)]">
              {roomName}
            </h1>
            <p className="truncate text-xs text-[var(--sn-text-dim)]">
              {activeRoom?.id}
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loadingMessages ? (
            <p className="text-center text-xs text-[var(--sn-text-dim)]">
              <Trans>Loading messages…</Trans>
            </p>
          ) : events.length === 0 ? (
            <p className="text-center text-xs text-[var(--sn-text-dim)]">
              <Trans>No messages yet</Trans>
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {events.map((event) => (
                <ProxyChatViewMessage
                  key={event.event_id}
                  event={event}
                  own={event.sender === session.userId}
                />
              ))}
            </ul>
          )}
          <div ref={bottomRef} />
        </div>

        {error ? (
          <p className="border-t border-[var(--sn-border)] px-4 py-2 text-xs text-red-400">
            {error}
          </p>
        ) : null}

        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 border-t border-[var(--sn-border)] p-3"
        >
          <ProxyButton
            variant="ghost"
            size="icon"
            type="button"
            title={t`Attach`}
          >
            <ProxyIcon name="paperclip" />
          </ProxyButton>
          <ProxyInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t`Message`}
            aria-label={t`Message`}
            className="flex-1"
          />
          <ProxyButton
            size="icon"
            type="submit"
            loading={sending}
            title={t`Send`}
          >
            {sending ? null : <ProxyIcon name="send" size={18} />}
          </ProxyButton>
        </form>
      </section>
    </ProxyChatViewPanel>
  );
}
