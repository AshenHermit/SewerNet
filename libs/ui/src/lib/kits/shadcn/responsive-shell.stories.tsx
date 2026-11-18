import { useMemo, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MatrixRoomEvent } from '@sewer-net/types';
import type { ChatSection } from '../../ui-kit';
import { ProxyChatScreen } from '../../proxy/proxy-chat-screen';
import { ProxyRail } from '../../proxy/proxy-rail';
import { ProxyRoomListPanel } from '../../proxy/proxy-room-list-panel';
import { ProxyRoomListHeader } from '../../proxy/proxy-room-list-header';
import { ProxyRoomListSearch } from '../../proxy/proxy-room-list-search';
import { ProxyRoomListItems } from '../../proxy/proxy-room-list-items';
import { ProxyRoomListEntry } from '../../proxy/proxy-room-list-entry';
import { ProxyRoomListItem } from '../../proxy/proxy-room-list-item';
import { ProxyRoomListItemContent } from '../../proxy/proxy-room-list-item-content';
import { ProxyRoomListEmpty } from '../../proxy/proxy-room-list-empty';
import { ProxyChatViewPanel } from '../../proxy/proxy-chat-view-panel';
import { ProxyChatViewHeader } from '../../proxy/proxy-chat-view-header';
import { ProxyChatViewMessageList } from '../../proxy/proxy-chat-view-message-list';
import { ProxyChatViewInputForm } from '../../proxy/proxy-chat-view-input-form';
import { ProxyChatViewError } from '../../proxy/proxy-chat-view-error';
import { ProxyChatViewEmpty } from '../../proxy/proxy-chat-view-empty';
import { ProxyBottomNavigation } from '../../proxy/proxy-bottom-navigation';
import { ProxySettingsPanel } from '../../proxy/proxy-settings-panel';
import { useLayoutMode } from '../../responsive/layout-mode';
import { usePanelFocus } from '../../responsive/panel-focus';

/**
 * Fullscreen acceptance harness for the adaptive chat shell.
 *
 * The story owns `section`, `activeRoomId`, `draft` and `query` above the
 * adaptive views, exactly like the app does, so resizing the canvas or
 * clicking around never reloads the story and never loses controlled state.
 * No Matrix SDK, no credentials: every room and message is a fixture.
 */

interface FixtureRoom {
  id: string;
  name: string;
  preview: string;
}

const LONG_WORD = 'SupercalifragilisticexpialidociousHyperMegaUltraLongIdentifierWithoutSpaces';
const LONG_URL =
  'https://chat.example.org/_matrix/media/v3/download/example.org/abcdef0123456789abcdef0123456789abcd/very-long-file-name-that-never-breaks.pdf';

const SHORT_ROOMS: FixtureRoom[] = [
  { id: '!general:hs', name: 'General', preview: 'Welcome to the sewer' },
  { id: '!design:hs', name: 'Design', preview: 'New tokens landed' },
  { id: '!random:hs', name: 'Random', preview: LONG_WORD },
];

/** 80 rooms, including long names and ids, for scroll and truncation checks. */
const MANY_ROOMS: FixtureRoom[] = Array.from({ length: 80 }, (_, index) => ({
  id: `!room-${index}-${index % 3 === 0 ? 'a.very.long.id.with.dots' : 'plain'}:example.org`,
  name: index % 3 === 0 ? `Room ${index} — ${LONG_WORD}` : `Room ${String(index).padStart(2, '0')}`,
  preview: index % 4 === 0 ? LONG_URL : `last message ${index}`,
}));

function message(
  index: number,
  body: string,
  opts: { own?: boolean; sender?: string } = {},
): MatrixRoomEvent {
  return {
    event_id: `$evt-${index}:hs`,
    type: 'm.room.message',
    sender: opts.own ? '@alice:hs' : (opts.sender ?? '@bob:hs'),
    origin_server_ts: 1_700_000_000_000 + index * 60_000,
    content: { msgtype: 'm.text', body },
  } as MatrixRoomEvent;
}

const CONVERSATION: MatrixRoomEvent[] = [
  message(1, 'Welcome to the sewer. Mind the pipes.'),
  message(2, 'The responsive shell keeps every panel mounted.', { own: true }),
  message(3, LONG_URL),
  message(4, LONG_WORD),
  message(5, 'Landscape phone, keyboard open, still no clipping.'),
  message(6, 'Last message sits above the compact navigation.', { own: true }),
];

type Locale = 'en' | 'ru';

interface Strings {
  chats: string;
  settings: string;
  navigation: string;
  theme: string;
  logout: string;
  search: string;
  message: string;
  send: string;
  attach: string;
  back: string;
  encrypted: string;
  loadingMessages: string;
  noMessages: string;
  loadOlder: string;
  selectChat: string;
  emptyRooms: string;
  close: string;
  error: string;
}

const STRINGS: Record<Locale, Strings> = {
  en: {
    chats: 'Chats',
    settings: 'Settings',
    navigation: 'Main navigation',
    theme: 'Switch to dark theme',
    logout: 'Log out',
    search: 'Search',
    message: 'Message',
    send: 'Send',
    attach: 'Attach',
    back: 'Back',
    encrypted: 'Encrypted',
    loadingMessages: 'Loading messages',
    noMessages: 'No messages yet',
    loadOlder: 'Load older messages',
    selectChat: 'Select a chat to start messaging',
    emptyRooms: 'No chats yet',
    close: 'Close',
    error: 'Connection to the homeserver was lost. Check your network and try again.',
  },
  ru: {
    chats: 'Чаты',
    settings: 'Настройки',
    navigation: 'Основная навигация',
    theme: 'Переключить на тёмную тему',
    logout: 'Выйти',
    search: 'Поиск',
    message: 'Сообщение',
    send: 'Отправить',
    attach: 'Прикрепить',
    back: 'Назад',
    encrypted: 'Зашифровано',
    loadingMessages: 'Загрузка сообщений',
    noMessages: 'Пока нет сообщений',
    loadOlder: 'Загрузить старые сообщения',
    selectChat: 'Выберите чат, чтобы начать общение',
    emptyRooms: 'Пока нет чатов',
    close: 'Закрыть',
    error: 'Соединение с homeserver потеряно. Проверьте сеть и попробуйте снова.',
  },
};

type Variant = 'rooms' | 'openChat' | 'settings' | 'noSelection' | 'longContent';

interface HarnessArgs {
  variant: Variant;
  locale: Locale;
  /** Story-level override: open the story in a given section. */
  initialSection?: ChatSection;
}

function Harness({ variant, locale, initialSection }: HarnessArgs) {
  const t = STRINGS[locale];
  const rooms = variant === 'longContent' ? MANY_ROOMS : SHORT_ROOMS;
  const initialRoom =
    variant === 'openChat' || variant === 'settings' || variant === 'longContent'
      ? rooms[0].id
      : null;
  const [section, setSection] = useState<ChatSection>(
    initialSection ?? (initialRoom ? 'chat' : 'rooms'),
  );
  const [activeRoomId, setActiveRoomId] = useState<string | null>(initialRoom);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [sent, setSent] = useState(0);

  // Mirror the app's focus contract, so Back/tab/rail navigation is checked in
  // the browser against the real hook rather than a hand-rolled stand-in.
  const shellRef = useRef<HTMLDivElement>(null);
  const mode = useLayoutMode();
  usePanelFocus(shellRef, section, mode, activeRoomId);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rooms;
    return rooms.filter((room) => room.name.toLowerCase().includes(needle));
  }, [query, rooms]);

  const events = useMemo(
    () => (variant === 'longContent' ? [...CONVERSATION, ...CONVERSATION] : CONVERSATION),
    [variant],
  );
  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? null;

  function openRoom(roomId: string) {
    setActiveRoomId(roomId);
    setSection('chat');
  }

  function showRooms() {
    setSection('rooms');
  }

  const roomList = (
    <ProxyRoomListPanel>
      <ProxyRoomListHeader title="SewerNet" />
      <ProxyRoomListSearch query={query} onChange={setQuery} placeholder={t.search} />
      {filtered.length === 0 ? (
        <ProxyRoomListEmpty emptyLabel={t.emptyRooms} />
      ) : (
        <ProxyRoomListItems>
          {filtered.map((room) => (
            <ProxyRoomListEntry key={room.id}>
              <ProxyRoomListItem id={room.id} active={room.id === activeRoomId} onSelect={openRoom}>
                <ProxyRoomListItemContent name={room.name} preview={room.preview} />
              </ProxyRoomListItem>
            </ProxyRoomListEntry>
          ))}
        </ProxyRoomListItems>
      )}
    </ProxyRoomListPanel>
  );

  const chat = activeRoom ? (
    <ProxyChatViewPanel>
      <ProxyChatViewHeader
        onBack={showRooms}
        backLabel={t.back}
        title={activeRoom.name}
        subtitle={activeRoom.id}
        encrypted
        encryptedLabel={t.encrypted}
      />
      <ProxyChatViewMessageList
        events={events}
        currentUserId="@alice:hs"
        hasMore={variant === 'longContent'}
        onLoadMore={() => undefined}
        loadingLabel={t.loadingMessages}
        emptyLabel={t.noMessages}
        loadMoreLabel={t.loadOlder}
      />
      {variant === 'longContent' ? <ProxyChatViewError error={t.error} /> : null}
      <ProxyChatViewInputForm
        draft={draft}
        onChange={setDraft}
        onSubmit={() => {
          setSent((count) => count + 1);
          setDraft('');
        }}
        onAttach={() => undefined}
        attachLabel={t.attach}
        messageLabel={t.message}
        sendLabel={t.send}
      />
    </ProxyChatViewPanel>
  ) : (
    <ProxyChatViewEmpty label={t.selectChat} />
  );

  const settings = (
    <ProxySettingsPanel
      open={section === 'settings'}
      onClose={closeSettings}
      onLogout={() => undefined}
      settingsLabel={t.settings}
      logoutLabel={t.logout}
      closeAriaLabel={t.close}
      appearanceLabel="Appearance"
      interfaceLabel="Interface"
      colorSchemeLabel="Color scheme"
      accentLabel="Accent color"
      fontLabel="Font"
      radiusLabel="Corner radius"
      resetLabel="Reset to defaults"
      kitLabel="shadcn/ui"
      kitId="shadcn"
      onKitChange={() => undefined}
      mode="dark"
      onModeChange={() => undefined}
      modeOptions={[
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
        { value: 'system', label: 'System' },
      ]}
      accent="#22c55e"
      onAccentChange={() => undefined}
      accentPresets={[
        { id: 'sewer', label: 'Sewer Green', value: '#22c55e' },
        { id: 'matrix', label: 'Matrix Blue', value: '#3b82f6' },
      ]}
      font="inter"
      onFontChange={() => undefined}
      fontOptions={[
        { id: 'inter', label: 'Inter' },
        { id: 'system', label: 'System' },
        { id: 'serif', label: 'Serif' },
        { id: 'mono', label: 'Mono' },
      ]}
      radius={10}
      onRadiusChange={() => undefined}
      locale={locale}
      onLocaleChange={() => undefined}
      localeOptions={[
        { value: 'en', label: 'EN' },
        { value: 'ru', label: 'RU' },
      ]}
      onReset={() => undefined}
    />
  );

  function showSettings() {
    // Mirror the app: the rail and the tabs both land in the same section.
    setSection('settings');
  }

  // Mirrors the app store: closing settings returns to the initial section.
  function closeSettings() {
    setSection('rooms');
  }

  return (
    <div data-sn-harness="" data-sn-sent={sent} className="h-full min-h-0">
      <ProxyChatScreen
        ref={shellRef}
        section={section}
        activeRoomId={activeRoomId}
        rail={
          <ProxyRail
            section={section}
            navigationLabel={t.navigation}
            roomsLabel={t.chats}
            onRooms={showRooms}
            settingsLabel={t.settings}
            onSettings={showSettings}
            logoutLabel={t.logout}
            onLogout={() => undefined}
            themeToggleLabel={t.theme}
            themeIcon="moon"
            onThemeToggle={() => undefined}
          />
        }
        rooms={roomList}
        chat={chat}
        settings={settings}
        bottomNavigation={
          <ProxyBottomNavigation
            section={section}
            chatsLabel={t.chats}
            settingsLabel={t.settings}
            navigationLabel={t.navigation}
            onRooms={showRooms}
            onSettings={showSettings}
          />
        }
      />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Acceptance/ResponsiveShell',
  component: Harness,
  parameters: {
    // The fullscreen harness must not inherit the component-story padding,
    // centering or background wrapper.
    layout: 'fullscreen',
    controls: { expanded: true },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['rooms', 'openChat', 'settings', 'noSelection', 'longContent'],
    },
    locale: { control: 'inline-radio', options: ['en', 'ru'] },
  },
  args: { variant: 'rooms', locale: 'en' },
  decorators: [
    (Story) => (
      // Own the viewport height so the shell's `h-full` chain is satisfied.
      <div className="h-[100dvh] w-full">
        <style>{'html, body, #storybook-root { height: 100%; margin: 0; }'}</style>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Harness>;

/** Compact room list, wide rail + list; the baseline geometry. */
export const Rooms: Story = { args: { variant: 'rooms' } };

/** Conversation with long URLs and unbreakable words, composer and back button. */
export const OpenChat: Story = { args: { variant: 'openChat' } };

/** Settings slot: compact screen below 48rem, modal dialog at and above it. */
export const Settings: Story = {
  args: { variant: 'settings', initialSection: 'settings' },
};

/** Wide layout with no room selected: the empty conversation pane. */
export const NoSelection: Story = { args: { variant: 'noSelection' } };

/** 80 rooms, long names/ids/URLs, a long error and pagination. */
export const LongContent: Story = { args: { variant: 'longContent' } };

/** Russian fixture strings through the same harness. */
export const LongContentRu: Story = {
  args: { variant: 'longContent', locale: 'ru' },
};
