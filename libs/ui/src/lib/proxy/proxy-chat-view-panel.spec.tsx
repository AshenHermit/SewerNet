import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProxyChatViewPanel } from './proxy-chat-view-panel';

describe('ProxyChatViewPanel', () => {
  it('renders children', () => {
    render(<ProxyChatViewPanel>Chat view</ProxyChatViewPanel>);
    expect(screen.getByText('Chat view')).toBeTruthy();
  });
});

