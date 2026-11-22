import { useEffect, useMemo, useRef, useState } from 'react';
import { registerDraft } from '../../platform/draft-registry';
import { useLingui } from '@lingui/react/macro';
import {
  ProxyChatViewEmpty,
  ProxyChatViewError,
  ProxyChatViewHeader,
  ProxyChatViewInputForm,
  ProxyChatViewMessageList,
  ProxyChatViewPanel,
} from '@sewer-net/ui';
import type { MatrixRoomEvent } from '@sewer-net/types';
import { useAuthStore } from '../stores/auth-store';
import { useChatStore } from '../stores/chat-store';
import { useRooms } from '../hooks/use-rooms';
import { roomAvatarSource } from '../../lib/media-url';
import { useMedia } from '../hooks/use-media';
import { MessageAttachment } from './message-attachment';
import {
  markRoomRead,
  prepareToEncryptThrottled,
  sendMessageFile,
  sendMessageText,
  useRoomEncrypted,
  useTimeline,
} from '../hooks/use-timeline';

interface ChatViewProps {
  onAuthError: (err: unknown) => void;
}

/** Projects a derived timeline item onto the message-list event shape. */
export function toRoomEvent(item: (ReturnType<typeof useTimeline>['items'])[number]): MatrixRoomEvent {
  const content: Record<string, unknown> = {
    msgtype: item.content.msgtype ?? 'm.text',
    body: item.content.body,
  };
  if (item.content.url !== undefined) content['url'] = item.content.url;
  if (item.content.file !== undefined) content['file'] = item.content.file;
  if (item.content.info !== undefined) content['info'] = item.content.info;
  if (item.content.formattedBody !== undefined) {
    content['formatted_body'] = item.content.formattedBody;
  }
  return {
    event_id: item.eventId,
    type: 'm.room.message',
    sender: item.sender,
    origin_server_ts: item.ts,
    content: content as MatrixRoomEvent['content'],
    ...(item.redacted ? { unsigned: { redacted_because: { type: 'm.room.redaction' } } } : {}),
  };
}

/** Distance from the bottom that still counts as "at the bottom". */
const AT_BOTTOM_THRESHOLD_PX = 40;

export function ChatView({ onAuthError }: ChatViewProps) {
  const credentials = useAuthStore((state) => state.credentials);
  const activeRoomId = useChatStore((state) => state.activeRoomId);
  const showRooms = useChatStore((state) => state.showRooms);
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
  useEffect(() => registerDraft(`chat:${activeRoomId ?? 'none'}`, () => draft.length > 0), [activeRoomId, draft]);
  const roomAvatar = useMedia(roomAvatarSource(activeRoom?.avatarMxc, 64));
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  // Track whether the user is reading the latest message: new SDK events
  // only scroll the view when the user did not scroll away. A hidden timeline
  // (`display: none` shell slots) has no meaningful scroll geometry, so it
  // neither paginates nor changes the "at the bottom" verdict.
  useEffect(() => {
    const el = bottomRef.current?.parentElement;
    if (!el) return;
    function measure() {
      if (!el) return false;
      if (el.closest('[hidden]')) return false;
      atBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD_PX;
      return true;
    }
    measure();
    function onScroll() {
      if (!measure()) return;
      if (el && el.scrollTop === 0 && hasMore) {
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

  // Keep the newest message visible only when the user is at the bottom. A
  // hidden timeline must never scroll — the browser cannot lay it out.
  useEffect(() => {
    if (!atBottomRef.current) return;
    const bottom = bottomRef.current;
    if (!bottom || bottom.closest('[hidden]')) return;
    bottom.scrollIntoView?.({ behavior: 'smooth' });
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

  async function handleAttach(file: File) {
    if (!activeRoomId || sending) return;

    setSending(true);
    setError(null);
    try {
      prepareToEncryptThrottled(activeRoomId);
      await sendMessageFile(activeRoomId, file);
    } catch (err) {
      onAuthError(err);
      setError(err instanceof Error ? err.message : 'Failed to send file');
    } finally {
      setSending(false);
    }
  }

  if (!credentials) return null;

  if (!activeRoomId) {
    return <ProxyChatViewEmpty label={t`Select a chat to start messaging`} />;
  }

  return (
    <ProxyChatViewPanel>
      <ProxyChatViewHeader
        onBack={showRooms}
        backLabel={t`Back`}
        title={roomName}
        subtitle={activeRoom?.roomId}
        avatarUrl={roomAvatar.url}
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
        loadingLabel={t`Loading messages`}
        emptyLabel={t`No messages yet`}
        loadMoreLabel={t`Load older messages`}
        renderAttachment={(event) => {
          const msgtype = event.content['msgtype'];
          if (msgtype !== 'm.image' && msgtype !== 'm.file' && msgtype !== 'm.video' && msgtype !== 'm.audio') return null;
          return <MessageAttachment event={event} downloadLabel={t`Download`} loadingLabel={t`Loading attachment`} retryLabel={t`Retry`} />;
        }}
      />
      {error ? <ProxyChatViewError error={error} /> : null}
      <ProxyChatViewInputForm
        draft={draft}
        onChange={(value) => setDraft(value)}
        onSubmit={() => void handleSend()}
        sending={sending}
        onAttach={(file) => void handleAttach(file)}
        attachLabel={t`Attach`}
        messageLabel={t`Message`}
        sendLabel={t`Send`}
      />
    </ProxyChatViewPanel>
  );
}
