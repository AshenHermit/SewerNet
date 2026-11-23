import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Proxy-component contract guard (plan Task 5, step 3).
 *
 * `apps/web` must render only named proxy components from `@sewer-net/ui`: the
 * kit owns every intrinsic element and every style, so app screens cannot fork
 * the layout contract or bypass the design tokens. This checks the five
 * controllers that make up the chat experience — the ban is intentionally
 * scoped to them, not to the whole app or landing site.
 */

type Finding = { node: ts.Node; reason: string };

function isIntrinsicTag(tag: ts.JsxTagNameExpression): boolean {
  if (ts.isIdentifier(tag)) {
    return /^[a-z]/.test(tag.text);
  }
  // `<foo.bar>` / `<ns:thing>` render DOM tags too; treat member/fragment tags
  // with a lowercase head as intrinsic.
  if (ts.isPropertyAccessExpression(tag)) {
    return /^[a-z]/.test(tag.name.text);
  }
  return false;
}

function describeNode(node: ts.Node, source: ts.SourceFile): string {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${source.fileName}:${line + 1}`;
}

/** Walks the AST and reports intrinsic elements plus `className`/`style` props. */
function findViolations(fileName: string, text: string): string[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName;
      if (isIntrinsicTag(tag)) {
        findings.push({ node: tag, reason: `intrinsic element <${tag.getText(source)}>` });
      }
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) continue;
        const name = attribute.name.getText(source);
        if (name === 'className' || name === 'style') {
          findings.push({ node: attribute, reason: `${name} attribute` });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return [...new Set(findings.map((finding) => `${describeNode(finding.node, source)} ${finding.reason}`))];
}

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const APP = join(import.meta.dirname, '..');

const GUARDED_FILES = [
  join(APP, 'screens', 'chat-screen.tsx'),
  join(APP, 'components', 'rail.tsx'),
  join(APP, 'components', 'room-list.tsx'),
  join(APP, 'components', 'chat-view.tsx'),
  join(APP, 'components', 'settings-panel.tsx'),
];

describe('architecture guard self-test', () => {
  it('rejects intrinsic elements', () => {
    expect(findViolations('ok.tsx', 'const a = <div />;')).toHaveLength(1);
  });

  it('rejects className and style attributes', () => {
    expect(findViolations('ok.tsx', 'const a = <ProxyPanel className="x" />;')).toHaveLength(1);
    expect(findViolations('ok.tsx', 'const a = <ProxyPanel style={{}} />;')).toHaveLength(1);
  });

  it('accepts proxy components', () => {
    expect(findViolations('ok.tsx', 'const a = <ProxyPanel />;')).toEqual([]);
  });

  it('ignores comments and strings', () => {
    const source = `
      // <div className="x" />
      const text = '<div className="legacy" />';
      const a = <ProxyPanel title="className" />;
    `;
    expect(findViolations('ok.tsx', source)).toEqual([]);
  });
});

describe('app screens are proxy-only', () => {
  it.each(GUARDED_FILES.map((file) => [file.replace(REPO_ROOT, '').replace(/\\/g, '/'), file] as const))(
    'has no intrinsic elements or inline styles in %s',
    (_label, file) => {
      const source = readFileSync(file, 'utf8');
      expect(findViolations(file, source)).toEqual([]);
    },
  );
});
