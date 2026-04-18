/**
 * js/config.js
 * Single source of truth for API base URL.
 * Must be the FIRST script loaded on every page.
 *
 * Usage: fetch(_API_BASE + '/api/events')
 */

/* Resolves to '' when served from localhost:5500 (relative fetch),
   or the full URL when opened from file:// or a different port. */
const _API_BASE = (function () {
  const { protocol, hostname, port } = window.location;
  if (protocol === 'file:') return 'http://localhost:5500';
  if (port === '5500' || port === '3000') return '';
  return `${protocol}//${hostname}${port ? ':' + port : ''}`;
})();

/* New organiser API prefix */
const _ORGANISER_API = _API_BASE + '/api/organiser';
