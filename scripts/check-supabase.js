#!/usr/bin/env node
'use strict';

/* Health check for the Supabase project this site talks to.
 *
 *   npm run check
 *
 * Uses the same public (anon) URL and key the website uses, so it shows what a
 * visitor would experience. It does not change any data.
 */

const fs   = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'api.js'), 'utf8');
const URL_ = (src.match(/SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
const KEY  = (src.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/) || [])[1];

const TABLES = [
  ['events',                 'public events'],
  ['ticket_types',           'ticket types'],
  ['event_tags',             'event tags'],
  ['accommodations',         'stays'],
  ['accommodation_bookings', 'stay booking enquiries'],
  ['tickets',                'ticket bookings'],
  ['equipment_requests',     'equipment requests'],
  ['profiles',               'user profiles'],
  ['seller_listings',        'equipment & merchandise listings (setup.sql)'],
];

const COLUMNS = [
  ['events',          'refund_policy', 'refund policy on events (setup.sql)'],
  ['events',          'review_note',   'decline reason on events (setup.sql)'],
  ['accommodations',  'owner_id',      'accommodation owner (setup.sql)'],
  ['accommodations',  'refund_policy', 'refund policy on stays (setup.sql)'],
  ['seller_listings', 'images',        'photos on equipment/merch (setup.sql)'],
];

const results = [];
const note = (ok, label, detail = '') => { results.push(ok); console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? '  ' + detail : ''}`); };
const hdr  = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function get(p, extra = {}) {
  const res = await fetch(`${URL_}${p}`, { headers: { ...hdr, ...extra } });
  let body = null; try { body = await res.json(); } catch { /* not json */ }
  return { status: res.status, body };
}

(async () => {
  if (!URL_ || !KEY) { console.error('Could not read the Supabase URL/key from frontend/js/api.js'); process.exit(1); }
  console.log(`\nChecking ${URL_}\n`);

  console.log('Project');
  try {
    const h = await get('/auth/v1/health');
    note(h.status === 200, 'Project is reachable and auth is running', `(HTTP ${h.status})`);
    if (h.status !== 200) { console.log('\n  The project did not answer properly. If it was paused, restore it in the Supabase dashboard.\n'); process.exit(1); }
  } catch (e) {
    note(false, 'Project is reachable', `(${e.cause && e.cause.code || e.message}). Deleted, paused, or no internet?`);
    process.exit(1);
  }

  console.log('\nTables the site reads and writes');
  for (const [t, what] of TABLES) {
    const r = await get(`/rest/v1/${t}?select=*&limit=1`);
    if (r.status === 200)      note(true, `${t}`, `(${what})`);
    else if (r.status === 404 || (r.body && /does not exist|schema cache/i.test(r.body.message || ''))) note(false, `${t} is MISSING`, `(${what})`);
    else                       note(false, `${t}`, `HTTP ${r.status} ${(r.body && r.body.message) || ''}`);
  }

  console.log('\nColumns added by supabase/setup.sql');
  for (const [t, c, what] of COLUMNS) {
    const r = await get(`/rest/v1/${t}?select=${c}&limit=1`);
    note(r.status === 200, `${t}.${c}`, r.status === 200 ? `(${what})` : `MISSING: run supabase/setup.sql  (${what})`);
  }

  console.log('\nPhoto storage');
  const b = await get('/storage/v1/object/public/listing-images/_probe.txt');
  const bucketExists = !(b.body && /bucket not found/i.test(JSON.stringify(b.body)));
  note(bucketExists, 'Public bucket "listing-images" exists', bucketExists ? '' : 'MISSING: run supabase/setup.sql');

  console.log('\nSecurity (a visitor who is not signed in should be blocked from these)');
  const w = await fetch(`${URL_}/rest/v1/seller_listings`, { method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ id: 'CHECK', category: 'x', title: 'x' }) });
  note(w.status === 401 || w.status === 403, 'Anonymous visitors cannot add listings', `(HTTP ${w.status})`);
  const p = await get('/rest/v1/profiles?select=email&limit=5');
  note(p.status === 200 ? (Array.isArray(p.body) && p.body.length === 0) : true, 'Anonymous visitors cannot read other people\'s profiles', p.status === 200 && p.body.length ? 'EXPOSED: check RLS on profiles' : '');
  const pend = await get('/rest/v1/events?select=id&status=eq.pending&limit=1');
  note(pend.status === 200 && Array.isArray(pend.body) && pend.body.length === 0, 'Anonymous visitors cannot see unapproved events', pend.body && pend.body.length ? 'EXPOSED: check RLS on events' : '');

  const bad = results.filter(x => !x).length;
  console.log(bad ? `\n${bad} thing(s) need attention. Run supabase/setup.sql in the Supabase SQL Editor, then run this again.\n` : '\nAll good. The database is ready.\n');
  process.exit(bad ? 1 : 0);
})();
