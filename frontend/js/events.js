/* ================================================
   TicketsSA Events Data (events.js)
   Reads directly from Supabase no backend needed.
   ================================================ */

const EventsData = (() => {

  let _cache     = [];
  let _loaded    = false;
  const _listeners = [];

  async function init() {
    try {
      _cache  = await SupabaseAPI.getEvents();
      _loaded = true;
    } catch (err) {
      console.warn('[EventsData] Could not load events:', err.message);
      _cache  = [];
      _loaded = true;
    }
    _listeners.forEach(fn => fn(_cache));
  }

  function onLoad(cb) {
    if (_loaded) cb(_cache);
    else _listeners.push(cb);
  }

  function getAll()           { return _cache; }
  function getFeatured()      { return _cache.filter(e => e.featured); }
  function getById(id)        { return _cache.find(e => e.id === id) || null; }
  function getByCategory(cat) { return _cache.filter(e => e.category.toLowerCase() === cat.toLowerCase()); }
  function getCategories()    { return [...new Set(_cache.map(e => e.category))]; }

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
