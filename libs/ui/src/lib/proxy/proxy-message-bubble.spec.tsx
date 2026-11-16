import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProxyMessageBubble } from './proxy-message-bubble';

describe('ProxyMessageBubble', () => {
  it('renders message text', () => {
    render(<ProxyMessageBubble text="Hello" />);
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('aligns own messages to the right', () => {
    render(<ProxyMessageBubble own text="Mine" />);
    expect(screen.getByText('Mine').className).toContain('ml-auto');
  });

  it('aligns their messages to the left', () => {
    render(<ProxyMessageBubble text="Theirs" />);
    expect(screen.getByText('Theirs').className).toContain('mr-auto');
  });
});

