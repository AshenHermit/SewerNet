import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProxyRoomListPanel } from './proxy-room-list-panel.js';
import { ProxyRoomListItem } from './proxy-room-list-item.js';

describe('ProxyRoomListPanel', () => {
  it('renders room list items', () => {
    render(
      <ProxyRoomListPanel>
        <ProxyRoomListItem id="general">General</ProxyRoomListItem>
      </ProxyRoomListPanel>,
    );
    expect(screen.getByRole('option', { name: 'General' })).toBeTruthy();
  });
});
