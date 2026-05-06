const _API_BASE = (function () {
  const { protocol, hostname, port } = window.location;

  // Local file:// — point directly to local backend
  if (protocol === 'file:') return 'http://localhost:5500';

  // Local dev server (Live Server, Vite, etc.)
  if (port === '5500' || port === '3000') return '';

  // Production (Netlify) — use relative path so requests go through
  // the Netlify proxy defined in netlify.toml → no CORS issues at all
  return '';
})();

const _ORGANISER_API = _API_BASE + '/api/organiser';
