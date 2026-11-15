import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProxyIcon } from './proxy-icon.js';

describe('ProxyIcon', () => {
  it('renders the default icon set icon', () => {
    const { container } = render(<ProxyIcon name="send" />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
