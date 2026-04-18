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
  function showSection(name) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.admin-nav-item').forEach(a => a.classList.remove('active'));
    document.getElementById(`section-${name}`)?.classList.remove('hidden');
    document.querySelector(`[data-section="${name}"]`)?.classList.add('active');

    const titles = { dashboard: 'Dashboard', events: 'Events', tickets: 'Tickets Sold', users: 'Users' };
    Utils.setText('#pageTitle', titles[name] || 'Admin');

    if (name === 'events')   loadEvents();
    if (name === 'tickets')  loadTickets();
    if (name === 'users')    loadUsers();
    if (name === 'requests') loadServiceRequests();
  }

  document.querySelectorAll('.admin-nav-item[data-section]').forEach(item => {
    item.addEventListener('click', e => { e.preventDefault(); showSection(item.dataset.section); });
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', () => Auth.logout());

  /* Sidebar toggle on mobile */
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('adminSidebar')?.classList.toggle('open');
  });

  /* ── Dashboard stats ───────────────────────────────────────────────── */
  async function loadStats() {
    try {
      const res  = await fetch(_API_BASE + '/api/admin/stats', { headers: Auth.headers() });
      const data = await res.json();
      if (!data.success) return;
      const s = data.stats;
      Utils.setText('#st-total',      s.totalEvents);
      Utils.setText('#st-published',  s.publishedEvents);
      Utils.setText('#st-pending',    s.pendingEvents);
      Utils.setText('#st-tickets',    s.ticketsSold);
      Utils.setText('#st-users',      s.totalUsers);
      Utils.setText('#st-organisers', s.organisers);
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

  /* ── Bootstrap ──────────────────────────────────────────────────────── */
  await loadStats();
  await loadPendingList();
});

/* ════════════════════════════════════════════════════
   SERVICE REQUESTS — Admin Management
   ════════════════════════════════════════════════════ */

async function loadServiceRequests() {
  const container = document.getElementById('section-requests');
  if (!container) return;
  container.innerHTML = '<div class="admin-loading">Loading requests…</div>';

  try {
    const res  = await fetch(_API_BASE + '/api/admin/requests', { headers: Auth.headers() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const requests = data.requests || [];

    if (!requests.length) {
      container.innerHTML = '<div class="admin-empty">No service requests yet.</div>';
      return;
    }

    const statusColors = {
      pending:   '#F59E0B',
      quoted:    '#3B82F6',
      confirmed: '#16A34A',
      cancelled: '#EF4444',
    };

    const rows = requests.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${escH(r.service_name)}</td>
        <td>${escH(r.first_name + ' ' + r.last_name)}<br>
            <small style="color:var(--text-3)">${escH(r.email)}</small></td>
        <td>${escH(r.location)}</td>
        <td>${r.event_date || '—'}</td>
        <td><span class="admin-badge" style="background:${statusColors[r.status] || '#888'}22;color:${statusColors[r.status] || '#888'};border-color:${statusColors[r.status] || '#888'}44">${r.status}</span></td>
        <td>
          <select class="admin-status-sel" data-req-id="${r.id}" style="font-size:.8125rem;padding:4px 8px;background:var(--bg-3);border:1px solid var(--b1);border-radius:6px;color:var(--text);cursor:pointer">
            <option value="pending"   ${r.status==='pending'   ? 'selected':''}>Pending</option>
            <option value="quoted"    ${r.status==='quoted'    ? 'selected':''}>Quoted</option>
            <option value="confirmed" ${r.status==='confirmed' ? 'selected':''}>Confirmed</option>
            <option value="cancelled" ${r.status==='cancelled' ? 'selected':''}>Cancelled</option>
          </select>
        </td>
      </tr>`).join('');

    container.innerHTML = `
      <div class="admin-section-head">
        <h2>Service / Equipment Requests</h2>
        <span class="admin-count">${requests.length} total</span>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>#</th><th>Service</th><th>Organiser</th>
            <th>Location</th><th>Date</th><th>Status</th><th>Action</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    // Wire up status change selects
    container.querySelectorAll('.admin-status-sel').forEach(sel => {
      sel.addEventListener('change', async function () {
        const id     = this.dataset.reqId;
        const status = this.value;
        try {
          const r = await fetch(`${_API_BASE}/api/admin/requests/${id}/status`, {
            method: 'PUT',
            headers: Auth.headers(),
            body: JSON.stringify({ status }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          if (typeof Utils !== 'undefined') Utils.showToast(`Request #${id} → ${status}`, 'success');
        } catch (err) {
          if (typeof Utils !== 'undefined') Utils.showToast('Failed: ' + err.message, 'error');
          this.value = this.dataset.prev || 'pending';
        }
        this.dataset.prev = this.value;
      });
      sel.dataset.prev = sel.value;
    });

  } catch (err) {
    container.innerHTML = `<div class="admin-error">${err.message}</div>`;
  }
}

function escH(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
