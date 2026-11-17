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
import type { MatrixRoomEvent } from '@sewer-net/types';
import { useAuthStore } from '../stores/auth-store';
import { useChatStore } from '../stores/chat-store';
import { useRooms } from '../hooks/use-rooms';
import { roomAvatarUrl } from '../../lib/media-url';
import {
  markRoomRead,
  prepareToEncryptThrottled,
  sendMessageText,
  useRoomEncrypted,
  useTimeline,
} from '../hooks/use-timeline';

interface ChatViewProps {
  onAuthError: (err: unknown) => void;
}

/** Projects a derived timeline item onto the message-list event shape. */
function toRoomEvent(item: (ReturnType<typeof useTimeline>['items'])[number]): MatrixRoomEvent {
  const content: Record<string, unknown> = {
    msgtype: item.content.msgtype ?? 'm.text',
    body: item.content.body,
  };
  if (item.content.formattedBody !== undefined) {
    content['formatted_body'] = item.content.formattedBody;
  }
  return {
    event_id: item.eventId,
    type: item.event.getType(),
    sender: item.sender,
    origin_server_ts: item.ts,
    content: content as MatrixRoomEvent['content'],
  };
}

/** Distance from the bottom that still counts as "at the bottom". */
const AT_BOTTOM_THRESHOLD_PX = 40;

export function ChatView({ onAuthError }: ChatViewProps) {
  const credentials = useAuthStore((state) => state.credentials);
  const activeRoomId = useChatStore((state) => state.activeRoomId);
  const setActiveRoom = useChatStore((state) => state.setActiveRoom);
  const setError = useChatStore((state) => state.setError);
  const error = useChatStore((state) => state.error);
  const { t } = useLingui();

  const sdkRooms = useRooms();
  const activeRoom = sdkRooms.find((room) => room.roomId === activeRoomId) ?? null;
  const roomName = activeRoom ? activeRoom.name : '';

  const { items, hasMore, loadOlder, isLoading } = useTimeline(activeRoomId);
  const encrypted = useRoomEncrypted(activeRoomId);
  const events = useMemo(() => items.map(toRoomEvent), [items]);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  // Track whether the user is reading the latest message: new SDK events
  // only scroll the view when the user did not scroll away.
  useEffect(() => {
    const el = bottomRef.current?.parentElement;
    if (!el) return;
    atBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD_PX;
    function onScroll() {
      if (!el) return;
      atBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD_PX;
      if (el.scrollTop === 0 && hasMore) {
        void loadOlder();
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasMore, loadOlder, activeRoomId]);

  // Opened room counts as read. markRoomRead may resolve synchronously
  // (no receiptable event) — Promise.resolve guards the .catch.
  useEffect(() => {
    if (!activeRoomId) return;
    void Promise.resolve(markRoomRead(activeRoomId)).catch(() => undefined);
  }, [activeRoomId]);

  // Keep the newest message visible only when the user is at the bottom.
  useEffect(() => {
    if (!atBottomRef.current) return;
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [events.length]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || !activeRoomId || sending) return;

    setSending(true);
    setError(null);
    try {
      // Rust-crypto prefetches megolm session keys — at most once per minute.
      prepareToEncryptThrottled(activeRoomId);
      await sendMessageText(activeRoomId, body);
      setDraft('');
    } catch (err) {
      onAuthError(err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  if (!credentials) return null;

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
        subtitle={activeRoom?.roomId}
        avatarUrl={roomAvatarUrl(activeRoom?.avatarMxc, 64)}
        encrypted={encrypted}
        encryptedLabel={t`Encrypted`}
      />
      <ProxyChatViewMessageList
        events={events}
        loading={isLoading}
        currentUserId={credentials.userId}
        bottomRef={bottomRef as React.RefObject<HTMLDivElement>}
        hasMore={hasMore}
        onLoadMore={() => void loadOlder()}
      />
      {error ? <ProxyChatViewError error={error} /> : null}
      <ProxyChatViewInputForm
        draft={draft}
        onChange={(value) => setDraft(value)}
        onSubmit={() => void handleSend()}
        sending={sending}
      />
    </ProxyChatViewPanel>
  );
}
