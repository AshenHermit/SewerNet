import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProxyRoomListPanel } from './proxy-room-list-panel';
import { ProxyRoomListItem } from './proxy-room-list-item';

describe('ProxyRoomListPanel', () => {
  it('renders room list items', () => {
    render(
      <ProxyRoomListPanel>
        <ProxyRoomListItem id="general">General</ProxyRoomListItem>
      </ProxyRoomListPanel>,
    );
    expect(screen.getByRole('button', { name: 'General' })).toBeTruthy();
  });
});

