#!/usr/bin/env node
/* ============================================================
   Stamp one cache-busting version on every local script and
   stylesheet in every HTML page:   src="wallet.js?v=<version>"

   Usage:   npm run bump-version            → version = today + time
            npm run bump-version -- 2026.10.1  → explicit version

   Run it before each deploy so browsers fetch the new files
   instead of mixing cached old scripts with new ones.
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report']);
const now = new Date();
const pad = n => String(n).padStart(2, '0');
const version = process.argv[2]
  || `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

if (!/^[\w.-]+$/.test(version)) {
  console.error(`Invalid version "${version}" — use letters, numbers, dots, dashes.`);
  process.exit(1);
}

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : htmlFiles(path.join(dir, entry.name));
    return entry.name.endsWith('.html') ? [path.join(dir, entry.name)] : [];
  });
}

// Local .js / .css references only (skip http(s):, protocol-relative, data:).
const ASSET_REF = /\b(src|href)="(?![a-z]+:|\/\/)([^"?#]+\.(?:js|css))(?:\?[^"#]*)?"/gi;

let changedFiles = 0;
let refs = 0;
for (const file of htmlFiles(ROOT)) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(ASSET_REF, (_, attr, url) => { refs++; return `${attr}="${url}?v=${version}"`; });
  if (after !== before) {
    fs.writeFileSync(file, after);
    changedFiles++;
  }
}
console.log(`Stamped ?v=${version} on ${refs} asset references (${changedFiles} files updated).`);
