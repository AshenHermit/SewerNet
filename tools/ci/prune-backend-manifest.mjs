import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const distDir = path.join(workspaceRoot, 'apps', 'backend', 'dist');
const manifestPath = path.join(distDir, 'package.json');
const lockPath = path.join(distDir, 'package-lock.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

for (const key of Object.keys(manifest)) {
  if (!['name', 'version', 'private', 'main', 'dependencies'].includes(key)) {
    delete manifest[key];
  }
}
for (const key of ['devDependencies', 'optionalDependencies', 'peerDependencies']) {
  delete manifest[key];
}

const rootLockPackage = lock.packages?.[''];
if (rootLockPackage) {
  for (const key of ['devDependencies', 'optionalDependencies', 'peerDependencies']) {
    delete rootLockPackage[key];
  }
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
