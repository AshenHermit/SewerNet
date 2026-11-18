import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getServerLayoutModeSnapshot, readWideMediaQuery } from './layout-mode';

// Resolve from this file, not `process.cwd()`: `nx test` runs from the workspace root.
const stylesDir = join(import.meta.dirname, '..', '..');
const layoutTokens = readFileSync(join(stylesDir, 'layout-tokens.css'), 'utf8');
const sharedStyles = readFileSync(join(stylesDir, 'styles.css'), 'utf8');

describe('responsive source of truth', () => {
  it('reads the CSS breakpoint and rejects ambiguous declarations', () => {
    expect(readWideMediaQuery(layoutTokens)).toBe('(min-width: 48rem)');
    expect(() => readWideMediaQuery(':root { --sn-bg: #000; }')).toThrowError(/sn-wide/);
    expect(() =>
      readWideMediaQuery('--breakpoint-sn-wide: 48rem; --breakpoint-sn-wide: 64rem;'),
    ).toThrowError(/multiple/i);
    expect(() => readWideMediaQuery('--breakpoint-sn-wide: ;')).toThrowError(/empty/);
    expect(() => readWideMediaQuery(undefined as unknown as string)).toThrowError(/raw CSS/);
  });

  it('is connected to the shared stylesheet', () => {
    expect(sharedStyles).toContain("@import './layout-tokens.css';");
  });

  it('returns wide without window', () => {
    expect(getServerLayoutModeSnapshot()).toBe('wide');
  });
});
