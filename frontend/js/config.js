/**
 * js/config.js
 * Single source of truth for API base URL.
 */

const _API_BASE = (function () {
  const { protocol, hostname, port } = window.location;

  // Local development
  if (protocol === 'file:') return 'http://localhost:5500';
  if (port === '5500' || port === '3000') return '';

  // Netlify (production) — point to Railway backend
  if (hostname.includes('netlify.app') || hostname.includes('netlify.com')) {
    return 'myticketsa-backend-production.up.railway.app';
  }

  // Railway (served from same origin)
  return '';
})();

const _ORGANISER_API = _API_BASE + '/api/organiser';