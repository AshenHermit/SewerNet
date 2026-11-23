import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('matrix-widget-api exports toString when Object.prototype is frozen', () => {
  const script = `
    const assert = require('node:assert/strict');
    Object.freeze(Object.prototype);
    const template = require('matrix-widget-api/lib/templating/url-template.js');
    assert.equal(typeof template.toString, 'function');
    assert.equal(template.toString(null), 'null');
    assert.equal(Object.hasOwn(template, 'toString'), true);
  `;
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });

  assert.equal(result.status, 0, `child process failed:\n${result.stderr}`);
});
