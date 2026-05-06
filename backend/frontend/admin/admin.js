/* ================================================
   MyTicketSA — Admin Portal (admin.js)
   Manages events, tickets, users from the backend API.
   ================================================ */

document.addEventListener('DOMContentLoaded', async () => {

  /* ── Guard: admin only ─────────────────────────────────────────────── */
  if (!Auth.isLoggedIn() || !Auth.isAdmin()) {
    // Not logged in or not admin — redirect to admin login page
    window.location.href = 'login.html';
    return;
  }

  const user = Auth.getUser();
  Utils.setText('#adminUserChip', `${user.firstName} ${user.lastName}`);
  Utils.initMobileNav();

  /* ── Sidebar navigation ────────────────────────────────────────────── */
  window.showSection = function showSection(name) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.admin-nav-item').forEach(a => a.classList.remove('active'));
    document.getElementById(`section-${name}`)?.classList.remove('hidden');
    document.querySelector(`[data-section="${name}"]`)?.classList.add('active');

    const titles = { dashboard: 'Dashboard', events: 'Events', tickets: 'Tickets Sold', users: 'Users', requests: 'Service Requests', organisers: 'Organisers', customers: 'Customers', media: 'Media Library' };
    Utils.setText('#pageTitle', titles[name] || 'Admin');

    if (name === 'events')     loadEvents();
    if (name === 'tickets')    loadTickets();
    if (name === 'users')      loadUsers();
    if (name === 'requests')   loadServiceRequests();
    if (name === 'organisers') loadOrganisers();
    if (name === 'customers')  loadCustomers();
    if (name === 'media')      loadMedia();
  }

  document.querySelectorAll('.admin-nav-item[data-section]').forEach(item => {
    item.addEventListener('click', e => { e.preventDefault(); showSection(item.dataset.section); });
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', () => Auth.logout());
  document.getElementById('refreshRequestsBtn')?.addEventListener('click', () => loadServiceRequests());

  /* Sidebar toggle on mobile */
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('adminSidebar')?.classList.toggle('open');
  });

  /* ── Dashboard stats ───────────────────────────────────────────────── */
  async function loadStats() {
    try {
      const [statsRes, reqRes] = await Promise.all([
        fetch(_API_BASE + '/api/admin/stats',    { headers: Auth.headers() }),
        fetch(_API_BASE + '/api/admin/requests', { headers: Auth.headers() }),
      ]);
      const statsData = await statsRes.json();
      if (statsData.success) {
        const s = statsData.stats;
        Utils.setText('#st-total',      s.totalEvents);
        Utils.setText('#st-published',  s.publishedEvents);
        Utils.setText('#st-pending',    s.pendingEvents);
        Utils.setText('#st-tickets',    s.ticketsSold);
        Utils.setText('#st-users',      s.totalUsers);
        Utils.setText('#st-organisers', s.organisers);
      }
      if (reqRes.ok) {
        const reqData = await reqRes.json();
        const pending = (reqData.requests || []).filter(r => r.status === 'pending').length;
        Utils.setText('#st-requests', pending);
      }
    } catch (err) {
      console.warn('[Admin] Stats load failed:', err.message);
    }
  }

  /* ── Pending events quick list on dashboard ────────────────────────── */
  async function loadPendingList() {
    try {
      const res  = await fetch(_API_BASE + '/api/events?status=pending', { headers: Auth.headers() });
      const data = await res.json();
      const list = document.getElementById('pendingList');
      const pending = (data.events || []).filter(e => e.status === 'pending');

      if (!pending.length) {
        list.innerHTML = `<div class="org-empty"><p>No events pending review. ✅</p></div>`;
        return;
      }

      list.innerHTML = `
        <div style="padding:0 var(--sp-xl) var(--sp-md);display:flex;gap:var(--sp-sm);font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);border-bottom:1px solid var(--border-subtle);padding-top:var(--sp-md);">
          <span style="flex:1;">Event</span><span style="width:100px;">Organiser</span><span style="width:90px;text-align:right;">Actions</span>
        </div>
        ${pending.map(e => `
          <div class="admin-row admin-row-event" style="grid-template-columns:52px 1fr 100px 120px;">
            <img class="admin-row-thumb" src="${e.image || ''}" alt=""
              onerror="this.src='https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=100&q=60'"/>
            <div>
              <div class="admin-row-title">${e.title}</div>
              <div class="admin-row-meta">${e.city} · ${Utils.formatDate(e.date)}</div>
            </div>
            <div class="admin-row-meta" style="text-align:center;">${e.organiser || '—'}</div>
            <div style="display:flex;gap:6px;justify-content:flex-end;">
              <button class="btn btn-primary btn-sm approve-btn" data-id="${e.id}">Approve</button>
              <button class="btn btn-secondary btn-sm reject-btn" data-id="${e.id}">Reject</button>
            </div>
          </div>`).join('')}`;

      list.querySelectorAll('.approve-btn').forEach(btn => btn.addEventListener('click', () => setEventStatus(btn.dataset.id, 'published')));
      list.querySelectorAll('.reject-btn') .forEach(btn => btn.addEventListener('click', () => setEventStatus(btn.dataset.id, 'rejected')));
    } catch { /* silently fail */ }
  }

  /* ── Events section ────────────────────────────────────────────────── */
  let allAdminEvents = [];

  async function loadEvents() {
    document.getElementById('adminEventsBody').innerHTML = `<div class="org-empty"><div class="spinner"></div></div>`;
    try {
      const res  = await fetch(_API_BASE + '/api/events', { headers: Auth.headers() });
      const data = await res.json();
      allAdminEvents = data.events || [];
      renderEventsTable(allAdminEvents);
    } catch {
      document.getElementById('adminEventsBody').innerHTML = `<div class="org-empty"><p>Failed to load events.</p></div>`;
    }
  }

  function renderEventsTable(events) {
    const body = document.getElementById('adminEventsBody');
    if (!events.length) {
      body.innerHTML = `<div class="org-empty"><p>No events found.</p></div>`;
      return;
    }
    body.innerHTML = events.map(e => `
      <div class="admin-row admin-row-event">
        <img class="admin-row-thumb" src="${e.image || ''}" alt=""
          onerror="this.src='https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=100&q=60'"/>
        <div>
          <div class="admin-row-title">${e.title}</div>
          <div class="admin-row-meta">${e.city} · ${Utils.formatDate(e.date)} · ${e.organiser || '—'}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          <span class="status-badge ${e.status}">${e.status}</span>
          ${e.featured ? '<span class="badge badge-blue" style="font-size:.6rem;">★ Featured</span>' : ''}
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <span style="font-weight:700;color:var(--green);font-size:.875rem;min-width:56px;text-align:right;">
            ${Utils.formatCurrency(e.price)}
          </span>
          <div class="admin-event-actions-dropdown" style="position:relative;">
            <button class="org-btn-icon actions-toggle" data-id="${e.id}" title="Actions">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
            </button>
            <div class="event-action-menu hidden" data-id="${e.id}">
              ${e.status !== 'published' ? `<button class="event-action-btn approve-ev" data-id="${e.id}">✅ Publish</button>` : `<button class="event-action-btn unpublish-ev" data-id="${e.id}">⏸ Unpublish</button>`}
              ${!e.featured ? `<button class="event-action-btn feature-ev" data-id="${e.id}">⭐ Feature</button>` : `<button class="event-action-btn unfeature-ev" data-id="${e.id}">☆ Unfeature</button>`}
              <button class="event-action-btn reject-ev" data-id="${e.id}">❌ Reject</button>
              <button class="event-action-btn view-poster-ev" data-id="${e.id}" data-img="${e.image || ''}">🖼 View Poster</button>
              <button class="event-action-btn enhance-ev" data-id="${e.id}">✨ Enhance Image</button>
              <button class="event-action-btn delete-ev" data-id="${e.id}" style="color:#EF4444;">🗑 Delete</button>
            </div>
          </div>
        </div>
      </div>`).join('');

    /* Action menu toggles */
    body.querySelectorAll('.actions-toggle').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        body.querySelectorAll('.event-action-menu').forEach(m => { if (m.dataset.id !== btn.dataset.id) m.classList.add('hidden'); });
        body.querySelector(`.event-action-menu[data-id="${btn.dataset.id}"]`)?.classList.toggle('hidden');
      });
    });
    document.addEventListener('click', () => body.querySelectorAll('.event-action-menu').forEach(m => m.classList.add('hidden')));

    body.querySelectorAll('.approve-ev')  .forEach(b => b.addEventListener('click', () => setEventStatus(b.dataset.id, 'published')));
    body.querySelectorAll('.unpublish-ev').forEach(b => b.addEventListener('click', () => setEventStatus(b.dataset.id, 'pending')));
    body.querySelectorAll('.reject-ev')   .forEach(b => b.addEventListener('click', () => setEventStatus(b.dataset.id, 'rejected')));
    body.querySelectorAll('.feature-ev')  .forEach(b => b.addEventListener('click', () => toggleFeatured(b.dataset.id, true)));
    body.querySelectorAll('.unfeature-ev').forEach(b => b.addEventListener('click', () => toggleFeatured(b.dataset.id, false)));
    body.querySelectorAll('.delete-ev')   .forEach(b => b.addEventListener('click', () => deleteEvent(b.dataset.id)));
    body.querySelectorAll('.view-poster-ev').forEach(b => b.addEventListener('click', () => viewPoster(b.dataset.img)));
    body.querySelectorAll('.enhance-ev').forEach(b => b.addEventListener('click', () => enhanceImage(b.dataset.id)));
  }

  /* Filter & search */
  document.getElementById('adminStatusFilter')?.addEventListener('change', e => {
    const val = e.target.value;
    renderEventsTable(val ? allAdminEvents.filter(ev => ev.status === val) : allAdminEvents);
  });
  document.getElementById('adminSearchInput')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderEventsTable(q ? allAdminEvents.filter(ev => ev.title.toLowerCase().includes(q) || ev.city.toLowerCase().includes(q)) : allAdminEvents);
  });

  /* ── Event status helpers ──────────────────────────────────────────── */
  async function setEventStatus(id, status) {
    try {
      const res  = await fetch(`${_API_BASE}/api/events/${id}/status`, {
        method: 'PUT', headers: Auth.headers(),
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        Utils.showToast(`Event ${status}.`, 'success');
        loadStats(); loadPendingList(); loadEvents();
      } else { Utils.showToast(data.error || 'Failed.', 'error'); }
    } catch { Utils.showToast('Server error.', 'error'); }
  }

  async function toggleFeatured(id, featured) {
    try {
      const res  = await fetch(`${_API_BASE}/api/events/${id}/status`, {
        method: 'PUT', headers: Auth.headers(),
        body: JSON.stringify({ featured }),
      });
      const data = await res.json();
      if (data.success) { Utils.showToast(featured ? 'Event featured!' : 'Removed from featured.', 'success'); loadEvents(); }
    } catch { Utils.showToast('Server error.', 'error'); }
  }

  async function deleteEvent(id) {
    const ev = allAdminEvents.find(e => e.id === id);
    if (!confirm(`Delete "${ev?.title}"? This cannot be undone.`)) return;
    try {
      const res  = await fetch(`${_API_BASE}/api/events/${id}`, { method: 'DELETE', headers: Auth.headers() });
      const data = await res.json();
      if (data.success) { Utils.showToast('Event deleted.', 'success'); loadStats(); loadEvents(); }
    } catch { Utils.showToast('Server error.', 'error'); }
  }

  /* ── Tickets section ───────────────────────────────────────────────── */
  let allTickets = [];

  async function loadTickets() {
    document.getElementById('adminTicketsBody').innerHTML = `<div class="org-empty"><div class="spinner"></div></div>`;
    try {
      const res  = await fetch(_API_BASE + '/api/admin/tickets', { headers: Auth.headers() });
      const data = await res.json();
      allTickets = data.tickets || [];
      renderTicketsTable(allTickets);
    } catch {
      document.getElementById('adminTicketsBody').innerHTML = `<div class="org-empty"><p>Failed to load tickets.</p></div>`;
    }
  }

  function renderTicketsTable(tickets) {
    const body = document.getElementById('adminTicketsBody');
    if (!tickets.length) {
      body.innerHTML = `<div class="org-empty"><p>No tickets sold yet.</p></div>`;
      return;
    }
    body.innerHTML = tickets.map(t => `
      <div class="admin-row admin-row-ticket">
        <div class="admin-row-mono">${t.id}</div>
        <div>
          <div class="admin-row-title">${t.event?.title || '—'}</div>
          <div class="admin-row-meta">${t.ticket?.typeName || ''} × ${t.ticket?.quantity || 1}</div>
        </div>
        <div>
          <div class="admin-row-title">${t.buyer?.firstName || ''} ${t.buyer?.lastName || ''}</div>
          <div class="admin-row-meta">${t.buyer?.email || ''}</div>
        </div>
        <div class="admin-row-meta" style="white-space:nowrap;">
          ${new Date(t.bookedAt).toLocaleDateString('en-ZA')}
        </div>
        <div class="admin-amount">${Utils.formatCurrency(t.pricing?.total || 0)}</div>
      </div>`).join('');
  }

  document.getElementById('ticketSearchInput')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderTicketsTable(q
      ? allTickets.filter(t =>
          t.id.toLowerCase().includes(q) ||
          (t.event?.title  || '').toLowerCase().includes(q) ||
          (t.buyer?.email  || '').toLowerCase().includes(q) ||
          (`${t.buyer?.firstName} ${t.buyer?.lastName}`).toLowerCase().includes(q))
      : allTickets);
  });

  /* ── Users section ─────────────────────────────────────────────────── */
  let allUsers = [];

  async function loadUsers() {
    document.getElementById('adminUsersBody').innerHTML = `<div class="org-empty"><div class="spinner"></div></div>`;
    try {
      const res  = await fetch(_API_BASE + '/api/admin/users', { headers: Auth.headers() });
      const data = await res.json();
      allUsers = data.users || [];
      renderUsersTable(allUsers);
    } catch {
      document.getElementById('adminUsersBody').innerHTML = `<div class="org-empty"><p>Failed to load users.</p></div>`;
    }
  }

  function renderUsersTable(users) {
    const body = document.getElementById('adminUsersBody');
    if (!users.length) {
      body.innerHTML = `<div class="org-empty"><p>No users found.</p></div>`;
      return;
    }
    body.innerHTML = users.map(u => `
      <div class="admin-row admin-row-user">
        <div>
          <div class="admin-row-title">${u.firstName} ${u.lastName}</div>
          <div class="admin-row-meta">${u.email}${u.organisationName ? ` · ${u.organisationName}` : ''}</div>
        </div>
        <span class="role-badge ${u.role}">${u.role}</span>
        <div class="admin-row-meta" style="white-space:nowrap;">
          ${new Date(u.createdAt).toLocaleDateString('en-ZA')}
        </div>
        <div style="display:flex;gap:var(--sp-sm);align-items:center;">
          <select class="form-select role-select" data-id="${u.id}" style="width:120px;padding:6px 12px;font-size:.8125rem;" ${u.id === Auth.getUser().id ? 'disabled' : ''}>
            <option value="attendee"  ${u.role === 'attendee'  ? 'selected' : ''}>Attendee</option>
            <option value="organiser" ${u.role === 'organiser' ? 'selected' : ''}>Organiser</option>
            <option value="admin"     ${u.role === 'admin'     ? 'selected' : ''}>Admin</option>
          </select>
          <button class="btn btn-secondary btn-sm save-role-btn" data-id="${u.id}" ${u.id === Auth.getUser().id ? 'disabled' : ''}>Save</button>
        </div>
      </div>`).join('');

    body.querySelectorAll('.save-role-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = btn.dataset.id;
        const role = body.querySelector(`.role-select[data-id="${id}"]`)?.value;
        if (!role) return;
        try {
          const res  = await fetch(`${_API_BASE}/api/admin/users/${id}/role`, {
            method: 'PUT', headers: Auth.headers(),
            body: JSON.stringify({ role }),
          });
          const data = await res.json();
          if (data.success) Utils.showToast('Role updated!', 'success');
          else Utils.showToast(data.error || 'Failed.', 'error');
        } catch { Utils.showToast('Server error.', 'error'); }
      });
    });
  }

  document.getElementById('userSearchInput')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderUsersTable(q
      ? allUsers.filter(u =>
          u.email.toLowerCase().includes(q) ||
          (`${u.firstName} ${u.lastName}`).toLowerCase().includes(q))
      : allUsers);
  });

  /* ── Inline action menu styles (injected) ───────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    .event-action-menu {
      position: absolute; right: 0; top: calc(100% + 6px);
      background: var(--bg-elevated); border: 1px solid var(--border-default);
      border-radius: var(--r-md); min-width: 160px; z-index: 100;
      box-shadow: var(--shadow-lg); overflow: hidden;
    }
    .event-action-btn {
      display: block; width: 100%; padding: 9px 14px;
      background: none; border: none; text-align: left; cursor: pointer;
      font-size: .875rem; color: var(--text-secondary); font-family: inherit;
      transition: background .15s;
    }
    .event-action-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  `;
  document.head.appendChild(style);

  function viewPoster(imgUrl) {
    if (!imgUrl) { Utils.showToast('No poster uploaded for this event.', 'error'); return; }
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    overlay.innerHTML = `<img src="${imgUrl}" style="max-width:90vw;max-height:90vh;border-radius:12px;box-shadow:0 24px 80px rgba(0,0,0,.8);" alt="Event poster"/>`;
    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  }

  async function enhanceImage(id) {
    const btn = document.querySelector(`.enhance-ev[data-id="${id}"]`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Enhancing…'; }
    try {
      const res = await fetch(`${_API_BASE}/api/admin/events/${id}/enhance`, {
        method: 'POST', headers: Auth.headers(),
      });
      const data = await res.json();
      if (data.success) {
        Utils.showToast('Image enhanced! Refreshing event…', 'success');
        setTimeout(() => loadEvents(), 800);
      } else {
        Utils.showToast(data.error || 'Enhancement failed.', 'error');
      }
    } catch {
      Utils.showToast('Server error during enhancement.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✨ Enhance Image'; }
    }
  }

  /* ── Bootstrap ──────────────────────────────────────────────────────── */
  await loadStats();
  await loadPendingList();
});

/* ════════════════════════════════════════════════════
   ORGANISERS — Admin Management
   ════════════════════════════════════════════════════ */

async function loadOrganisers() {
  const body = document.getElementById('adminOrganisersBody');
  if (!body) return;
  body.innerHTML = '<div class="org-empty"><div class="spinner"></div></div>';
  try {
    const res = await fetch(_API_BASE + '/api/admin/organisers', { headers: Auth.headers() });
    const data = await res.json();
    const orgs = data.organisers || [];
    if (!orgs.length) { body.innerHTML = '<div class="org-empty"><p>No organisers yet.</p></div>'; return; }
    body.innerHTML = orgs.map(o => `
      <div class="admin-row" style="grid-template-columns:1fr 180px 80px 80px;">
        <div>
          <div class="admin-row-title">${escH(o.name)}</div>
          <div class="admin-row-meta">${escH(o.email)}${o.org !== '—' ? ` · ${escH(o.org)}` : ''}</div>
        </div>
        <div class="admin-row-meta">${new Date(o.joined).toLocaleDateString('en-ZA')}</div>
        <div style="text-align:center;font-weight:700;color:var(--text-primary);">${o.events.total}</div>
        <div style="text-align:center;">
          <span class="status-badge published">${o.events.published} live</span>
        </div>
      </div>`).join('');
    document.getElementById('organiserSearchInput')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      body.querySelectorAll('.admin-row').forEach(row => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  } catch (err) {
    body.innerHTML = `<div class="org-empty"><p>Failed to load organisers.</p></div>`;
  }
}

/* ════════════════════════════════════════════════════
   CUSTOMERS — Admin Management
   ════════════════════════════════════════════════════ */

async function loadCustomers() {
  const body = document.getElementById('adminCustomersBody');
  if (!body) return;
  body.innerHTML = '<div class="org-empty"><div class="spinner"></div></div>';
  try {
    const res = await fetch(_API_BASE + '/api/admin/customers', { headers: Auth.headers() });
    const data = await res.json();
    const customers = data.customers || [];
    if (!customers.length) { body.innerHTML = '<div class="org-empty"><p>No customers yet.</p></div>'; return; }
    body.innerHTML = customers.map(c => `
      <div class="admin-row" style="grid-template-columns:1fr 180px 80px 100px;">
        <div>
          <div class="admin-row-title">${escH(c.name)}</div>
          <div class="admin-row-meta">${escH(c.email)}</div>
        </div>
        <div class="admin-row-meta">${new Date(c.joined).toLocaleDateString('en-ZA')}</div>
        <div style="text-align:center;font-weight:700;">${c.bookings}</div>
        <div style="text-align:right;font-weight:700;color:var(--green);">R ${parseFloat(c.spent).toFixed(2)}</div>
      </div>`).join('');
    document.getElementById('customerSearchInput')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      body.querySelectorAll('.admin-row').forEach(row => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  } catch (err) {
    body.innerHTML = `<div class="org-empty"><p>Failed to load customers.</p></div>`;
  }
}

/* ════════════════════════════════════════════════════
   MEDIA LIBRARY — Admin Management
   ════════════════════════════════════════════════════ */

async function loadMedia() {
  const body = document.getElementById('adminMediaBody');
  if (!body) return;
  body.innerHTML = '<div class="org-empty"><div class="spinner"></div></div>';
  try {
    const res = await fetch(_API_BASE + '/api/admin/media', { headers: Auth.headers() });
    const data = await res.json();
    const files = data.files || [];
    document.getElementById('mediaCount').textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
    if (!files.length) {
      body.innerHTML = '<div class="org-empty"><p>No uploaded images yet. Images uploaded via event creation will appear here.</p></div>';
      return;
    }
    body.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;padding:24px;">` +
      files.map(f => `
        <div style="border:1px solid var(--border-subtle);border-radius:12px;overflow:hidden;background:var(--bg-elevated);">
          <img src="${f.url}" alt="${f.filename}" loading="lazy"
            style="width:100%;height:140px;object-fit:cover;cursor:pointer;"
            onclick="viewPosterGlobal('${f.url}')"/>
          <div style="padding:8px 12px;">
            <div style="font-size:.75rem;color:var(--text-secondary);word-break:break-all;">${f.filename}</div>
            <div style="font-size:.7rem;color:var(--text-muted);margin-top:3px;">${(f.size/1024).toFixed(1)} KB</div>
          </div>
        </div>`).join('') + `</div>`;
  } catch (err) {
    body.innerHTML = `<div class="org-empty"><p>Failed to load media.</p></div>`;
  }
}

// Global viewPoster helper for inline onclick in media grid
window.viewPosterGlobal = function(imgUrl) {
  if (!imgUrl) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
  overlay.innerHTML = `<img src="${imgUrl}" style="max-width:90vw;max-height:90vh;border-radius:12px;box-shadow:0 24px 80px rgba(0,0,0,.8);" alt="Event poster"/>`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
};

/* ════════════════════════════════════════════════════
   SERVICE REQUESTS — Admin Management
   ════════════════════════════════════════════════════ */

async function loadServiceRequests() {
  const body = document.getElementById('requestsBody');
  if (!body) return;
  body.innerHTML = '<div class="req-loading"><div class="spinner"></div><span>Loading requests…</span></div>';

  try {
    const res  = await fetch(_API_BASE + '/api/admin/requests', { headers: Auth.headers() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load requests');

    const requests = data.requests || [];

    if (!requests.length) {
      body.innerHTML = `
        <div class="req-empty">
          <div class="req-empty-icon">📋</div>
          <p>No service requests yet.</p>
          <small>When users submit equipment or service requests, they will appear here.</small>
        </div>`;
      return;
    }

    const statusColors = {
      pending:   { bg: 'rgba(245,158,11,.12)',  text: '#F59E0B', border: 'rgba(245,158,11,.3)'  },
      quoted:    { bg: 'rgba(59,130,246,.12)',   text: '#3B82F6', border: 'rgba(59,130,246,.3)'  },
      confirmed: { bg: 'rgba(22,163,74,.12)',    text: '#16A34A', border: 'rgba(22,163,74,.3)'   },
      cancelled: { bg: 'rgba(239,68,68,.12)',    text: '#EF4444', border: 'rgba(239,68,68,.3)'   },
    };

    const badge = s => {
      const c = statusColors[s] || { bg:'rgba(128,128,128,.12)', text:'#888', border:'rgba(128,128,128,.3)' };
      return `<span class="req-status-badge" style="background:${c.bg};color:${c.text};border-color:${c.border}">${s}</span>`;
    };

    const rows = requests.map(r => `
      <tr class="req-row">
        <td class="req-id">#${r.id}</td>
        <td>
          <div class="req-service">${escH(r.service_name || '—')}</div>
        </td>
        <td>
          <div class="req-name">${escH((r.first_name || '') + ' ' + (r.last_name || ''))}</div>
          <div class="req-email">${escH(r.email || '')}</div>
        </td>
        <td class="req-location">${escH(r.location || '—')}</td>
        <td class="req-date">${r.event_date ? new Date(r.event_date).toLocaleDateString('en-ZA') : '—'}</td>
        <td>${badge(r.status || 'pending')}</td>
        <td>
          <select class="req-status-sel" data-req-id="${r.id}">
            <option value="pending"   ${r.status==='pending'   ? 'selected':''}>Pending</option>
            <option value="quoted"    ${r.status==='quoted'    ? 'selected':''}>Quoted</option>
            <option value="confirmed" ${r.status==='confirmed' ? 'selected':''}>Confirmed</option>
            <option value="cancelled" ${r.status==='cancelled' ? 'selected':''}>Cancelled</option>
          </select>
        </td>
      </tr>`).join('');

    const pending = requests.filter(r => r.status === 'pending').length;

    body.innerHTML = `
      <div class="req-summary">
        <span class="req-count">${requests.length} total</span>
        ${pending ? `<span class="req-pending-chip">${pending} pending review</span>` : '<span class="req-ok-chip">All reviewed ✓</span>'}
      </div>
      <div class="req-table-wrap">
        <table class="req-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Service</th>
              <th>Requester</th>
              <th>Location</th>
              <th>Event Date</th>
              <th>Status</th>
              <th>Update</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    body.querySelectorAll('.req-status-sel').forEach(sel => {
      sel.dataset.prev = sel.value;
      sel.addEventListener('change', async function () {
        const id     = this.dataset.reqId;
        const status = this.value;
        const prev   = this.dataset.prev;
        try {
          const r = await fetch(`${_API_BASE}/api/admin/requests/${id}/status`, {
            method: 'PUT', headers: Auth.headers(),
            body: JSON.stringify({ status }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'Update failed');
          Utils.showToast(`Request #${id} marked as "${status}"`, 'success');
          this.dataset.prev = status;
          // Refresh the status badge in the same row
          const badge = this.closest('tr').querySelector('.req-status-badge');
          if (badge) {
            const c = statusColors[status] || { bg:'rgba(128,128,128,.12)', text:'#888', border:'rgba(128,128,128,.3)' };
            badge.style.background   = c.bg;
            badge.style.color        = c.text;
            badge.style.borderColor  = c.border;
            badge.textContent        = status;
          }
        } catch (err) {
          Utils.showToast('Failed: ' + err.message, 'error');
          this.value = prev;
        }
      });
    });

  } catch (err) {
    body.innerHTML = `<div class="req-error"><span>⚠️</span> ${escH(err.message)}</div>`;
  }
}

function escH(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
