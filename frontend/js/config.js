/* ================================================
   TicketsSA Client Config
   Stack: Supabase (auth + data) + Netlify (hosting)
   No backend server all data goes direct to Supabase.
   ================================================ */

/* _API_BASE is kept for legacy compatibility.
   On production (Netlify) this is '' no proxy needed.
   Auth, events, checkout all use SupabaseAPI directly. */
const _API_BASE = (function () {
  const { protocol, port } = window.location;
  if (protocol === 'file:') return 'http://localhost:5500';
  return '';
})();

const _ORGANISER_API = _API_BASE + '/api/organiser';
