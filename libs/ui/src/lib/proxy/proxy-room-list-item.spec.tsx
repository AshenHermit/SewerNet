import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProxyRoomListItem } from './proxy-room-list-item';

describe('ProxyRoomListItem', () => {
  it('renders room name as a button', () => {
    render(<ProxyRoomListItem id="general">General</ProxyRoomListItem>);
    expect(screen.getByRole('button', { name: 'General' })).toBeTruthy();
  });

  it('marks active item with aria-current', () => {
    render(<ProxyRoomListItem id="random" active>Random</ProxyRoomListItem>);
    const button = screen.getByRole('button', { name: 'Random' });
    expect(button.getAttribute('aria-current')).toBe('true');
    // Navigation state, not a listbox selection.
    expect(button.hasAttribute('aria-selected')).toBe(false);
    expect(button.getAttribute('role')).not.toBe('option');
  });

  it('shows unread badge', () => {
    render(<ProxyRoomListItem id="random" unread={3}>Random</ProxyRoomListItem>);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('calls onSelect with id on click', () => {
    const onSelect = vi.fn();
    render(<ProxyRoomListItem id="general" onSelect={onSelect}>General</ProxyRoomListItem>);
    fireEvent.click(screen.getByRole('button', { name: 'General' }));
    expect(onSelect).toHaveBeenCalledWith('general');
  });
});
