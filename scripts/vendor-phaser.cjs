// Keep the static GitHub Pages runtime in sync with the pinned npm dependency.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const phaserRoot = path.dirname(require.resolve('phaser/package.json'));
const target = path.join(root, 'floor', 'vendor');
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(path.join(phaserRoot, 'dist', 'phaser.min.js'), path.join(target, 'phaser.min.js'));
fs.copyFileSync(path.join(phaserRoot, 'LICENSE.md'), path.join(target, 'PHASER-LICENSE.md'));
console.log('Vendored Phaser ' + require('phaser/package.json').version);
