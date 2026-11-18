import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Resolve from this file, not `process.cwd()`: `nx test` runs from the workspace root.
const stylesDir = join(import.meta.dirname, '..', '..');
const uiRoot = join(stylesDir, '..');
const repoRoot = join(uiRoot, '..', '..');

const styles = () => readFileSync(join(stylesDir, 'styles.css'), 'utf8');
const layoutTokens = () => readFileSync(join(stylesDir, 'layout-tokens.css'), 'utf8');
const appStyles = () => readFileSync(join(repoRoot, 'apps', 'web', 'src', 'styles.css'), 'utf8');
const uiPackage = () => JSON.parse(readFileSync(join(uiRoot, 'package.json'), 'utf8'));

describe('shared styles connection', () => {
  it('exports the shared stylesheet from the ui package', () => {
    expect(uiPackage().exports['./styles.css']).toBe('./src/styles.css');
  });

  it('is imported by the app exactly once', () => {
    const css = appStyles();
    expect(css.match(/@sewer-net\/ui\/styles\.css/g)).toHaveLength(1);
    expect(css).toContain("@import '@sewer-net/ui/styles.css';");
  });

  it('keeps a single palette in the shared stylesheet', () => {
    expect(appStyles()).not.toContain('--sn-surface-1');
    expect(styles()).toContain('--sn-surface-1');
  });

  it('connects layout tokens to the shared stylesheet', () => {
    expect(styles()).toContain("@import './layout-tokens.css';");
  });

  it('enforces the hidden attribute over display utilities', () => {
    expect(styles()).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  });

  it('derives the compact scroll clearance from the navigation tokens', () => {
    expect(layoutTokens()).toContain('--sn-bottom-nav-clearance:');
    expect(styles()).not.toContain('--sn-bottom-nav-clearance:'); // single source
  });
});
