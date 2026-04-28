const _API_BASE = (function () {
  const { protocol, hostname, port } = window.location;

  // Local development
  if (protocol === 'file:') return 'http://localhost:5500';
  if (port === '5500' || port === '3000') return '';

  // Production — point to Railway backend
  return 'https://myticketsa-production.up.railway.app';
})();

const _ORGANISER_API = _API_BASE + '/api/organiser';