import { useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  ProxyChatViewError,
  ProxyChatViewHeader,
  ProxyChatViewInputForm,
  ProxyChatViewMessageList,
  ProxyChatViewPanel,
} from '@sewer-net/ui';
import { ProxyIcon } from '@sewer-net/icons';
import { matrixClient } from '../../lib/matrix-client';
import { credentialsToAuthSession } from '../../lib/legacy-session';
import { useAuthStore } from '../stores/auth-store';
import { useChatStore } from '../stores/chat-store';

interface ChatViewProps {
  onAuthError: (err: unknown) => void;
}

export function ChatView({ onAuthError }: ChatViewProps) {
  const credentials = useAuthStore((state) => state.credentials);
  // Memoized for effect-deps identity stability (see chat-screen).
  const session = useMemo(
    () => (credentials ? credentialsToAuthSession(credentials) : null),
    [credentials],
  );
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
  const [hasMore, setHasMore] = useState(false);
  const [prevToken, setPrevToken] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const loadedRoomRef = useRef<string | null>(null);
  const prevAbortRef = useRef<AbortController | null>(null);

  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? null;
  const events = activeRoomId ? (messages[activeRoomId] ?? []) : [];
  const roomName = activeRoom ? activeRoom.name : '';

  // Пагинация: при скролле к верху списка подгружаем более старые сообщения.
  useEffect(() => {
    const el = bottomRef.current?.parentElement;
    if (!el) return;
    function onScroll() {
      if (!el || el.scrollTop > 0 || !hasMore || !prevToken) return;
      void loadMore();
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasMore, prevToken]);

  async function loadMore() {
    if (!prevToken || !activeRoomId || !session) return;
    setLoadingMessages(true);
    try {
      const res = await matrixClient.getMessages(session, activeRoomId, {
        limit: 50,
        from: prevToken,
      });
      setMessages(activeRoomId, [...res.chunk, ...events]);
      setPrevToken(res.prev ?? null);
      setHasMore(!!res.prev);
    } catch {
      // Ошибку пагинации не показываем поверх основного состояния комнаты:
      // достаточно, что кнопка останется.
    } finally {
      setLoadingMessages(false);
    }
  }

  // Load the full room payload when a room is opened: /state (имя комнаты),
  // /messages (история), /members, /threads, /aliases — пять запросов в одном
  // круге, затем read_markers для последнего события. Имя берётся из
  // m.room.name, не дожидаемся загрузки истории.
  useEffect(() => {
    if (!activeRoomId || !session || loadedRoomRef.current === activeRoomId)
      return;
    let cancelled = false;
    const roomId = activeRoomId;
    const currentSession = session;
    prevAbortRef.current?.abort();

    async function loadRoom() {
      setLoadingMessages(true);
      setError(null);
      try {
        // Пять независимых запросов в одном круге. /state и /messages
        // обязательны, /members, /threads и /aliases — опциональны: их
        // недоступность (403/404 на чужих homeserver'ах) не должна мешать
        // показать историю комнаты.
        const [stateResult, messagesResult] = await Promise.allSettled([
          matrixClient.getRoomState(currentSession, roomId, 'm.room.name'),
          matrixClient.getMessages(currentSession, roomId, { limit: 50 }),
          matrixClient.getRoomMembers(currentSession, roomId),
          matrixClient.getRoomThreads(currentSession, roomId),
          matrixClient.getRoomAliases(currentSession, roomId),
        ]);
        if (messagesResult.status === 'rejected') {
          throw messagesResult.reason;
        }
        if (cancelled) return;

        // Имя из m.room.name — не дожидаемся истории.
        const name =
          stateResult.status === 'fulfilled'
            ? stateResult.value['name']
            : undefined;
        if (typeof name === 'string') {
          useChatStore.setState((state) => ({
            rooms: state.rooms.map((r) =>
              r.id === roomId ? { ...r, name } : r,
            ),
          }));
        }

        const messagesRes = messagesResult.value;
        setMessages(roomId, messagesRes.chunk);
        setPrevToken(messagesRes.prev ?? null);
        setHasMore(!!messagesRes.prev);
        loadedRoomRef.current = roomId;

        // Отмечаем последнее событие прочитанным. Это побочный эффект, а не
        // условие открытия комнаты: homeserver'ы, которые отказывают в
        // read_markers, не должны рисовать ошибку поверх загруженной истории.
        const lastEvent = messagesRes.chunk[0];
        if (lastEvent?.event_id && !cancelled) {
          void matrixClient
            .setReadMarkers(currentSession, roomId, {
              'm.fully_read': lastEvent.event_id,
              'm.read': lastEvent.event_id,
            })
            .catch(() => undefined);
        }
      } catch (err) {
        if (!cancelled) {
          onAuthError(err);
          setError(
            err instanceof Error ? err.message : 'Failed to load room',
          );
        }
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    }

    void loadRoom();
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
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [events.length]);

  async function handleSend() {
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
      <ProxyChatViewHeader
        onBack={() => setActiveRoom(null)}
        backLabel={t`Back`}
        title={roomName}
        subtitle={activeRoom?.id}
      />
      <ProxyChatViewMessageList
        events={events}
        loading={loadingMessages}
        currentUserId={session.userId}
        bottomRef={bottomRef as React.RefObject<HTMLDivElement>}
        hasMore={hasMore}
        onLoadMore={loadMore}
      />
      {error ? <ProxyChatViewError error={error} /> : null}
      <ProxyChatViewInputForm
        draft={draft}
        onChange={(value) => setDraft(value)}
        onSubmit={handleSend}
        sending={sending}
      />
    </ProxyChatViewPanel>
  );
}
