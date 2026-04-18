/* ── API base: works from both localhost:5500 and file:// ── */
/* ================================================
   MyTicketSA — Events Data v4 (events.js)
   Fetches live events from /api/events backend.
   Falls back to empty array gracefully if offline.
   ================================================ */

const EventsData = (() => {

  /* Live events cache – populated by init() */
  let _cache = [];
  let _loaded = false;
  const _listeners = [];

  /* ── Fetch from backend ─────────────────────────────────────────────── */
  async function init() {
    try {
      const res = await fetch(_API_BASE + '/api/events');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      _cache  = data.events || [];
      _loaded = true;
    } catch (err) {
      console.warn('[EventsData] Could not load events from API:', err.message);
      _cache  = [];
      _loaded = true;
    }
    _listeners.forEach(fn => fn(_cache));
  }

  /* Call cb immediately if already loaded, else queue it */
  function onLoad(cb) {
    if (_loaded) cb(_cache);
    else _listeners.push(cb);
  }

  /* ── Query helpers (same API as v1 for compatibility) ──────────────── */
  function getAll()             { return _cache; }
  function getFeatured()        { return _cache.filter(e => e.featured); }
  function getById(id)          { return _cache.find(e => e.id === id) || null; }
  function getByCategory(cat)   { return _cache.filter(e => e.category.toLowerCase() === cat.toLowerCase()); }
  function getCategories()      { return [...new Set(_cache.map(e => e.category))]; }

  function search(query) {
    const q = query.toLowerCase();
    return _cache.filter(e =>
      e.title.toLowerCase().includes(q) ||
      (e.city  || '').toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      (e.tags  || []).some(t => t.toLowerCase().includes(q))
    );
  }

  return { init, onLoad, getAll, getFeatured, getById, getByCategory, getCategories, search };
})();
