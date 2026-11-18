import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import type {
  BottomNavigationProps,
  ChatViewEmptyProps,
  ChatViewInputFormProps,
  ChatViewMessageListProps,
  RoomListEntryProps,
  RoomListHeaderProps,
  RoomListItemsProps,
  RoomListItemProps,
  UiKit,
} from '../ui-kit';
import { UiKitContext } from './ui-kit-context';
import { ProxyBottomNavigation } from './proxy-bottom-navigation';
import { ProxyChatViewEmpty } from './proxy-chat-view-empty';
import { ProxyChatViewInputForm } from './proxy-chat-view-input-form';
import { ProxyChatViewMessageList } from './proxy-chat-view-message-list';
import { ProxyRoomListEntry } from './proxy-room-list-entry';
import { ProxyRoomListHeader } from './proxy-room-list-header';
import { ProxyRoomListItems } from './proxy-room-list-items';
import { ProxyRoomListItem } from './proxy-room-list-item';

/** Records the props a proxy forwards to the selected kit. */
function kitSpy<T>() {
  const seen: T[] = [];
  const Render = (props: T) => {
    seen.push(props);
    return null;
  };
  return { seen, Render };
}

function withKit(kit: Partial<UiKit>, ui: React.ReactNode) {
  return render(
    <I18nProvider i18n={i18n}>
      <UiKitContext.Provider value={kit as unknown as UiKit}>{ui}</UiKitContext.Provider>
    </I18nProvider>,
  );
}

const originalMatchMedia = window.matchMedia;

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('RoomListHeader', () => {
  it('delegates the title to the selected kit', () => {
    const header = kitSpy<RoomListHeaderProps>();
    withKit({ RoomListHeader: header.Render }, <ProxyRoomListHeader title="SewerNet" />);
    expect(header.seen[0]?.title).toBe('SewerNet');
  });

  it('renders a single landmark heading with the app title', () => {
    render(<ProxyRoomListHeader title="SewerNet" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('SewerNet');
  });
});

describe('RoomListItems', () => {
  it('delegates its children to the selected kit', () => {
    const items = kitSpy<RoomListItemsProps>();
    withKit(
      { RoomListItems: items.Render },
      <ProxyRoomListItems>
        <span>row</span>
      </ProxyRoomListItems>,
    );
    expect(items.seen).toHaveLength(1);
  });

  it('renders a scrollable list, not a grid of bare divs', () => {
    const { container } = render(
      <ProxyRoomListItems>
        <ProxyRoomListEntry>
          <ProxyRoomListItem id="!a:hs">Alpha</ProxyRoomListItem>
        </ProxyRoomListEntry>
      </ProxyRoomListItems>,
    );
    expect(container.querySelector('ul')).toBeTruthy();
    expect(container.querySelector('ul > li > button')).toBeTruthy();
  });
});

describe('RoomListEntry', () => {
  it('delegates its row content to the selected kit', () => {
    const entry = kitSpy<RoomListEntryProps>();
    withKit(
      { RoomListEntry: entry.Render },
      <ProxyRoomListEntry>
        <span>row</span>
      </ProxyRoomListEntry>,
    );
    expect(entry.seen).toHaveLength(1);
  });
});

describe('RoomListItem semantics', () => {
  it('exposes each room as a button, not a list option', () => {
    render(
      <ProxyRoomListItems>
        <ProxyRoomListEntry>
          <ProxyRoomListItem id="!a:hs">Alpha</ProxyRoomListItem>
        </ProxyRoomListEntry>
      </ProxyRoomListItems>,
    );
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeTruthy();
  });

  it('marks the selected room with aria-current and a stable data attribute', () => {
    const { rerender } = render(
      <ProxyRoomListItem id="!a:hs" active>
        Alpha
      </ProxyRoomListItem>,
    );
    const button = screen.getByRole('button', { name: 'Alpha' });
    expect(button.getAttribute('aria-current')).toBe('true');
    expect(button.getAttribute('data-room-id')).toBe('!a:hs');

    rerender(<ProxyRoomListItem id="!a:hs">Alpha</ProxyRoomListItem>);
    expect(screen.getByRole('button', { name: 'Alpha' }).hasAttribute('aria-current')).toBe(false);
  });

  it('selects through the delegated kit handler', () => {
    const item = kitSpy<RoomListItemProps>();
    const kit = { RoomListItem: item.Render } as unknown as UiKit;
    const onSelect = vi.fn();
    render(
      <UiKitContext.Provider value={kit}>
        <ProxyRoomListItem id="!a:hs" onSelect={onSelect}>
          Alpha
        </ProxyRoomListItem>
      </UiKitContext.Provider>,
    );
    expect(item.seen[0]?.id).toBe('!a:hs');
    item.seen[0]?.onSelect?.('!a:hs');
    expect(onSelect).toHaveBeenCalledWith('!a:hs');
  });
});

describe('ChatViewEmpty', () => {
  it('delegates icon and label to the selected kit', () => {
    const empty = kitSpy<ChatViewEmptyProps>();
    withKit(
      { ChatViewEmpty: empty.Render },
      <ProxyChatViewEmpty label="Select a chat" />,
    );
    expect(empty.seen[0]?.label).toBe('Select a chat');
  });

  it('announces the empty state with its label', () => {
    render(<ProxyChatViewEmpty label="Select a chat to start messaging" />);
    expect(screen.getByText('Select a chat to start messaging')).toBeTruthy();
  });
});

describe('BottomNavigation', () => {
  function renderNav(props: Partial<BottomNavigationProps> = {}) {
    const onRooms = vi.fn();
    const onSettings = vi.fn();
    render(
      <ProxyBottomNavigation
        section="rooms"
        chatsLabel="Chats"
        settingsLabel="Settings"
        navigationLabel="Main navigation"
        onRooms={onRooms}
        onSettings={onSettings}
        {...props}
      />,
    );
    return { onRooms, onSettings };
  }

  it('delegates the section and labels to the selected kit', () => {
    const nav = kitSpy<BottomNavigationProps>();
    withKit(
      { BottomNavigation: nav.Render },
      <ProxyBottomNavigation
        section="chat"
        chatsLabel="Chats"
        settingsLabel="Settings"
        navigationLabel="Main navigation"
        onRooms={() => undefined}
        onSettings={() => undefined}
      />,
    );
    expect(nav.seen[0]?.section).toBe('chat');
    expect(nav.seen[0]?.navigationLabel).toBe('Main navigation');
  });

  it('is a labelled navigation landmark with two reachable actions', () => {
    renderNav();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('marks the active destination with aria-current and fires callbacks', () => {
    const { onRooms, onSettings } = renderNav({ section: 'settings' });
    expect(
      screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(
      screen.getByRole('button', { name: 'Chats' }).hasAttribute('aria-current'),
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Chats' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onRooms).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('treats the chat section as the chats destination', () => {
    renderNav({ section: 'chat' });
    expect(
      screen.getByRole('button', { name: 'Chats' }).getAttribute('aria-current'),
    ).toBe('page');
  });
});

describe('ChatViewMessageList labels', () => {
  function renderList(props: Partial<ChatViewMessageListProps> = {}) {
    return render(<ProxyChatViewMessageList events={[]} {...props} />);
  }

  it('keeps readable defaults for standalone stories', () => {
    renderList();
    expect(screen.getByText('No messages yet')).toBeTruthy();
  });

  it('renders the translated empty and loading labels from props', () => {
    const { rerender } = renderList({ emptyLabel: 'Пока нет сообщений' });
    expect(screen.getByText('Пока нет сообщений')).toBeTruthy();

    rerender(<ProxyChatViewMessageList events={[]} loading emptyLabel="Пока нет сообщений" loadingLabel="Загрузка сообщений" />);
    expect(screen.getByText('Загрузка сообщений')).toBeTruthy();
  });

  it('renders the translated load-more label next to the pagination state', () => {
    const onLoadMore = vi.fn();
    const { rerender } = renderList({ hasMore: true, onLoadMore, loadMoreLabel: 'Загрузить ещё' });
    expect(screen.getByRole('button', { name: 'Загрузить ещё' })).toBeTruthy();

    rerender(
      <ProxyChatViewMessageList
        events={[]}
        hasMore
        loading
        onLoadMore={onLoadMore}
        loadMoreLabel="Загрузить ещё"
        loadingLabel="Загрузка сообщений"
      />,
    );
    expect(screen.getByRole('button', { name: 'Загрузка сообщений' })).toBeTruthy();
  });
});

describe('ChatViewInputForm labels', () => {
  function renderForm(props: Partial<ChatViewInputFormProps> = {}) {
    return render(
      <ProxyChatViewInputForm
        draft=""
        onChange={() => undefined}
        onSubmit={() => undefined}
        {...props}
      />,
    );
  }

  it('keeps the default message and send labels', () => {
    renderForm();
    expect(screen.getByLabelText('Message')).toBeTruthy();
    expect(screen.getByTitle('Send')).toBeTruthy();
  });

  it('uses the translated message and send labels', () => {
    renderForm({
      messageLabel: 'Сообщение',
      sendLabel: 'Отправить',
      onAttach: () => undefined,
      attachLabel: 'Вложение',
    });
    expect(screen.getByLabelText('Сообщение')).toBeTruthy();
    expect(screen.getByTitle('Отправить')).toBeTruthy();
    expect(screen.getByTitle('Вложение')).toBeTruthy();
  });

  it('does not lose the file input or its callbacks', () => {
    const onAttach = vi.fn();
    const { container } = renderForm({ onAttach });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const file = new File(['x'], 'note.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onAttach).toHaveBeenCalledWith(file);
  });
});

describe('Scroll region contract', () => {
  it('keeps the message list as its own scroll container', () => {
    const { container } = render(<ProxyChatViewMessageList events={[]} />);
    expect(container.querySelector('[data-sn-scroll="messages"]')).toBeTruthy();
  });
});
