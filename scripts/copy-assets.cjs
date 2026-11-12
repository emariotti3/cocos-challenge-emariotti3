// Copies non-TS build assets into dist (tsc only emits compiled sources).
const fs = require('node:fs');
const path = require('node:path');

const assets = [
  ['src/database/seeders/challenge-data.sql', 'dist/database/seeders/challenge-data.sql'],
];

for (const [from, to] of assets) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log(`copied ${from} -> ${to}`);
}
