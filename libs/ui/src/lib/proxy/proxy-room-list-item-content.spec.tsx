import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProxyRoomListItemContent } from './proxy-room-list-item-content';

describe('ProxyRoomListItemContent', () => {
  it('renders room name', () => {
    render(<ProxyRoomListItemContent name="General" />);
    expect(screen.getByText('General')).toBeTruthy();
  });

  it('shows the topic when there is no preview', () => {
    render(<ProxyRoomListItemContent name="General" topic="Talk about anything" />);
    expect(screen.getByText('Talk about anything')).toBeTruthy();
  });

  it('prefers the preview over the topic', () => {
    render(
      <ProxyRoomListItemContent
        name="General"
        preview="latest message"
        topic="Talk about anything"
      />,
    );
    expect(screen.getByText('latest message')).toBeTruthy();
    expect(screen.queryByText('Talk about anything')).toBeNull();
  });
});
