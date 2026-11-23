import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProxyPanel } from './proxy-panel';

describe('ProxyPanel', () => {
  it('renders children', () => {
    render(<ProxyPanel>Panel content</ProxyPanel>);
    expect(screen.getByText('Panel content')).toBeTruthy();
  });

  it('applies padding class', () => {
    render(<ProxyPanel p="lg">Padded</ProxyPanel>);
    expect(screen.getByText('Padded').className).toContain('p-6');
  });

  it('can be unbordered', () => {
    render(<ProxyPanel bordered={false}>No border</ProxyPanel>);
    expect(screen.getByText('No border').className).not.toContain('border');
  });
});

