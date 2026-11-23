import fs from 'node:fs';
function stripComments(text) {
  return text.split(/\r?\n/).map(line => line.replace(/#.*$/, '')).join('\n');
}
const caddy = stripComments(fs.readFileSync('deploy/Caddyfile', 'utf8'));

const regex = /^(.+:\d+|:\d+)\s+\{/gm;
let match;
while ((match = regex.exec(caddy)) !== null) {
  console.log('Match:', JSON.stringify(match[1]), 'at index', match.index);
}