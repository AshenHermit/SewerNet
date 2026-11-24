import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const distDir = path.join(workspaceRoot, 'apps', 'backend', 'dist');
const manifestPath = path.join(distDir, 'package.json');
const lockPath = path.join(distDir, 'pnpm-lock.yaml');

// Nx writes the pruned pnpm lockfile (plus its settings-only workspace file).
// The lockfile must be left byte-for-byte intact: pnpm validates it against the
// manifest with --frozen-lockfile at image build time.
if (!fs.statSync(lockPath).isFile()) {
  throw new Error(`missing pruned pnpm lockfile: ${lockPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

for (const key of Object.keys(manifest)) {
  if (!['name', 'version', 'private', 'main', 'dependencies'].includes(key)) {
    delete manifest[key];
  }
}
for (const key of ['devDependencies', 'optionalDependencies', 'peerDependencies']) {
  delete manifest[key];
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// Nx keeps devDependencies in the pruned lockfile importer even though the
// runtime manifest has none. pnpm --frozen-lockfile --prod still validates
// those entries, and Nx 24 relocates workspace dev deps to a local path the
// deploy output does not ship. Drop the unused importer section so the lockfile
// describes exactly the runtime manifest.
const lock = parse(fs.readFileSync(lockPath, 'utf8'));
delete lock.importers?.['.']?.devDependencies;
fs.writeFileSync(lockPath, stringify(lock, { lineWidth: 0 }));
