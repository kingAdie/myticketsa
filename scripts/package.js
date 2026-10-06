#!/usr/bin/env node
'use strict';

/* Builds a clean `deploy/` folder to drag onto Netlify.
 *
 *   npm run package
 *
 * It copies only what the live site needs (frontend/, netlify/functions/, netlify.toml)
 * and leaves out node_modules, .git, .claude, .agents, supabase/, docs and test files,
 * so the upload is small and nothing private/irrelevant goes up.
 */

const fs   = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out  = path.join(root, 'deploy');

const SKIP = new Set(['.DS_Store', 'desktop.ini', 'Thumbs.db']);

function copy(from, to) {
  const st = fs.statSync(from);
  if (st.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) if (!SKIP.has(f)) copy(path.join(from, f), path.join(to, f));
  } else {
    fs.copyFileSync(from, to);
  }
}

fs.rmSync(out, { recursive: true, force: true });
copy(path.join(root, 'frontend'), path.join(out, 'frontend'));
copy(path.join(root, 'netlify', 'functions'), path.join(out, 'netlify', 'functions'));
copy(path.join(root, 'netlify.toml'), path.join(out, 'netlify.toml'));

let files = 0, bytes = 0;
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f), s = fs.statSync(p);
    if (s.isDirectory()) walk(p); else { files++; bytes += s.size; }
  }
})(out);

console.log(`\n  deploy/ is ready: ${files} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log('  Drag the deploy/ folder onto Netlify (Deploys -> drag and drop).\n');
