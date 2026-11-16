import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProxyRoomListItem } from './proxy-room-list-item';

describe('ProxyRoomListItem', () => {
  it('renders room name', () => {
    render(<ProxyRoomListItem id="general">General</ProxyRoomListItem>);
    expect(screen.getByRole('option', { name: 'General' })).toBeTruthy();
  });

  it('marks active item with aria-selected', () => {
    render(<ProxyRoomListItem id="random" active>Random</ProxyRoomListItem>);
    expect(screen.getByRole('option', { name: 'Random' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('shows unread badge', () => {
    render(<ProxyRoomListItem id="random" unread={3}>Random</ProxyRoomListItem>);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('calls onSelect with id on click', () => {
    const onSelect = vi.fn();
    render(<ProxyRoomListItem id="general" onSelect={onSelect}>General</ProxyRoomListItem>);
    fireEvent.click(screen.getByRole('option', { name: 'General' }));
    expect(onSelect).toHaveBeenCalledWith('general');
  });
});

