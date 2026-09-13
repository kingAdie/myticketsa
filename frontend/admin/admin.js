/* ================================================
   TicketsSA Admin Portal (admin.js)
   Manages events, tickets, users from the backend API.
   ================================================ */

/* ── Module-level request state ─────────────────────────────────────────── */
let allRequests     = [];
let reqStatusFilter = 'all';
let reqSearchQuery  = '';

/* ── Module-level event modal state ─────────────────────────────────────── */
let admTicketTypeCount = 1;

const REQ_STATUS_COLORS = {
  pending:   { bg: 'rgba(245,158,11,.12)',  text: '#F59E0B', border: 'rgba(245,158,11,.3)'  },
  quoted:    { bg: 'rgba(59,130,246,.12)',   text: '#3B82F6', border: 'rgba(59,130,246,.3)'  },
  confirmed: { bg: 'rgba(22,163,74,.12)',    text: '#16A34A', border: 'rgba(22,163,74,.3)'   },
  cancelled: { bg: 'rgba(239,68,68,.12)',    text: '#EF4444', border: 'rgba(239,68,68,.3)'   },
};

document.addEventListener('DOMContentLoaded', async () => {

  /* ── Guard: admin only ─────────────────────────────────────────────── */
  if (!Auth.isLoggedIn() || !Auth.isAdmin()) {
    // Not logged in or not admin redirect to admin login page
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

    const titles = { dashboard: 'Dashboard', events: 'Events', tickets: 'Tickets Sold', users: 'Users', requests: 'Service Requests', organisers: 'Organisers', customers: 'Customers', accommodations: 'Accommodations', media: 'Media Library' };
    Utils.setText('#pageTitle', titles[name] || 'Admin');

    if (name === 'events')          loadEvents();
    if (name === 'tickets')         loadTickets();
    if (name === 'users')           loadUsers();
    if (name === 'requests')        loadServiceRequests();
    if (name === 'organisers')      loadOrganisers();
    if (name === 'customers')       loadCustomers();
    if (name === 'accommodations')  loadAccommodationsSection();
    if (name === 'media')           loadMedia();
  }

  document.querySelectorAll('.admin-nav-item[data-section]').forEach(item => {
    item.addEventListener('click', e => { e.preventDefault(); showSection(item.dataset.section); });
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', () => Auth.logout());
  document.getElementById('refreshRequestsBtn')?.addEventListener('click', () => loadServiceRequests());
  document.getElementById('dashRefreshReq')?.addEventListener('click', () => loadDashboardRequests());

  /* Requests: filter tabs */
  document.querySelectorAll('.req-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.req-filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      reqStatusFilter = tab.dataset.filter;
      renderFilteredRequests();
    });
  });

  /* Requests: search */
  document.getElementById('requestSearchInput')?.addEventListener('input', e => {
    reqSearchQuery = e.target.value.toLowerCase().trim();
    renderFilteredRequests();
  });

  /* ── Admin event modal wiring ─────────────────────────────────────────── */
  document.getElementById('adminCreateEventBtn')?.addEventListener('click', () => openAdminEventModal());
  document.getElementById('admCloseEventModal') ?.addEventListener('click', closeAdminEventModal);
  document.getElementById('admCancelEventBtn')  ?.addEventListener('click', closeAdminEventModal);
  document.getElementById('admEventModal')       ?.addEventListener('click', e => { if (e.target.id === 'admEventModal') closeAdminEventModal(); });
  document.getElementById('admAddTicketTypeBtn') ?.addEventListener('click', () => addAdminTicketTypeRow());

  document.querySelectorAll('input[name="admEvPayType"]').forEach(radio => {
    radio.addEventListener('change', function () {
      document.getElementById('admPayLinkGroup').style.display = this.value === 'link' ? '' : 'none';
      document.getElementById('admPayBankGroup').style.display = this.value === 'bank' ? 'grid' : 'none';
    });
  });

  document.getElementById('admEventForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const saveBtn = document.getElementById('admSaveEventBtn');
    const editId  = document.getElementById('admEditEventId').value;
    const isEdit  = !!editId;

    const ticketTypes = [];
    document.querySelectorAll('#admTicketTypesContainer .tt-row').forEach((row, i) => {
      const name  = row.querySelector('.tt-name') .value.trim();
      const price = parseFloat(row.querySelector('.tt-price').value);
      const avail = parseInt(row.querySelector('.tt-avail').value, 10);
      if (name) ticketTypes.push({ id: `TT-${i+1}`, name, price: isNaN(price) ? 0 : price, available: isNaN(avail) ? 100 : avail, description: name });
    });

    const payload = {
      title:         document.getElementById('admEvTitle').value.trim(),
      category:      document.getElementById('admEvCategory').value,
      date:          document.getElementById('admEvDate').value,
      time:          document.getElementById('admEvTime').value,
      endTime:       document.getElementById('admEvEndTime').value,
      location:      document.getElementById('admEvLocation').value.trim(),
      city:          document.getElementById('admEvCity').value.trim(),
      province:      document.getElementById('admEvProvince').value,
      address:       document.getElementById('admEvAddress').value.trim(),
      description:   document.getElementById('admEvDescription').value.trim(),
      price:         parseFloat(document.getElementById('admEvPrice').value) || 0,
      image:         document.getElementById('admEvImage').value.trim() || null,
      tags:          document.getElementById('admEvTags').value.split(',').map(t => t.trim()).filter(Boolean),
      ticketTypes,
      paymentType:   document.querySelector('input[name="admEvPayType"]:checked')?.value || 'free',
      paymentLink:   document.getElementById('admEvPayLink').value.trim(),
      bankName:      document.getElementById('admEvBankName').value.trim(),
      accountHolder: document.getElementById('admEvAccHolder').value.trim(),
      accountNumber: document.getElementById('admEvAccNumber').value.trim(),
      branchCode:    document.getElementById('admEvBranchCode').value.trim(),
    };

    const status        = document.getElementById('admEvStatus').value;
    const featured      = document.getElementById('admEvFeatured').checked;
    const organiserName = document.getElementById('admEvOrganiser').value.trim();

    if (!payload.title)    { showAdmModalError('Event title is required.');   return; }
    if (!payload.category) { showAdmModalError('Please select a category.'); return; }
    if (!payload.date)     { showAdmModalError('Event date is required.');    return; }

    saveBtn.disabled = true;
    Utils.setText('#admSaveBtnText', isEdit ? 'Saving…' : 'Creating…');
    document.getElementById('admModalError').classList.add('hidden');

    try {
      if (isEdit) {
        await SupabaseAPI.adminUpdateEvent(editId, payload, { status, featured, organiserName });
      } else {
        await SupabaseAPI.adminCreateEvent(payload, { status, featured, organiserName });
      }
      closeAdminEventModal();
      Utils.showToast(isEdit ? 'Event updated!' : 'Event created and published!', 'success');
      loadEvents();
      loadStats();
    } catch (err) {
      showAdmModalError(err.message || 'Could not save event. Please try again.');
      saveBtn.disabled = false;
      Utils.setText('#admSaveBtnText', isEdit ? 'Save Changes' : 'Create Event');
    }
  });

  /* Sidebar toggle on mobile */
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('adminSidebar')?.classList.toggle('open');
  });

  /* ── Image upload zones (wire once after DOM ready) ───────────── */
  initImageUploads();

  /* ── Dashboard stats (Supabase direct) ────────────────────────────── */
  async function loadStats() {
    try {
      const s = await SupabaseAPI.adminGetStats();
      Utils.setText('#st-total',      s.totalEvents);
      Utils.setText('#st-published',  s.publishedEvents);
      Utils.setText('#st-pending',    s.pendingEvents);
      Utils.setText('#st-tickets',    s.ticketsSold);
      Utils.setText('#st-users',      s.totalUsers);
      Utils.setText('#st-organisers', s.organisers);
      Utils.setText('#st-requests',   s.pendingRequests);
    } catch (err) {
      console.warn('[Admin] Stats load failed:', err.message);
    }
  }

  /* ── Pending events quick list on dashboard ────────────────────────── */
  async function loadPendingList() {
    try {
      const list    = document.getElementById('pendingList');
      const events  = await SupabaseAPI.getEvents({ adminAll: true });
      const pending = events.filter(e => e.status === 'pending');

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
      allAdminEvents = await SupabaseAPI.getEvents({ adminAll: true });
      renderEventsTable(allAdminEvents);
    } catch (err) {
      document.getElementById('adminEventsBody').innerHTML = `<div class="org-empty"><p>Could not load events.</p><small>${escH(err.message)}</small></div>`;
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
              <button class="event-action-btn edit-adm-ev" data-id="${e.id}">✏️ Edit</button>
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

    body.querySelectorAll('.edit-adm-ev') .forEach(b => b.addEventListener('click', () => {
      const ev = allAdminEvents.find(ev => ev.id === b.dataset.id);
      if (ev) openAdminEventModal(ev);
    }));
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

  /* ── Event status helpers (Supabase direct) ────────────────────────── */
  async function setEventStatus(id, status) {
    try {
      await SupabaseAPI.adminUpdateEvent(id, {}, { status });
      Utils.showToast(`Event ${status}.`, 'success');
      loadStats(); loadPendingList(); loadEvents();
    } catch (err) { Utils.showToast(err.message || 'Server error.', 'error'); }
  }

  async function toggleFeatured(id, featured) {
    try {
      await SupabaseAPI.adminUpdateEvent(id, {}, { featured });
      Utils.showToast(featured ? 'Event featured!' : 'Removed from featured.', 'success');
      loadEvents();
    } catch (err) { Utils.showToast(err.message || 'Server error.', 'error'); }
  }

  async function deleteEvent(id) {
    const ev = allAdminEvents.find(e => e.id === id);
    if (!confirm(`Delete "${ev?.title}"? This cannot be undone.`)) return;
    try {
      await SupabaseAPI.deleteEvent(id);
      Utils.showToast('Event deleted.', 'success');
      loadStats(); loadEvents();
    } catch (err) { Utils.showToast(err.message || 'Server error.', 'error'); }
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
      allUsers = await SupabaseAPI.adminGetFirestoreUsers();
      renderUsersTable(allUsers);
    } catch (err) {
      document.getElementById('adminUsersBody').innerHTML =
        `<div class="org-empty"><p>Could not load users.</p><small>${escH(err.message)}</small></div>`;
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
          await SupabaseAPI.adminSetUserRole(id, role);
          Utils.showToast('Role updated!', 'success');
          // Refresh list so badge updates
          allUsers = await SupabaseAPI.adminGetFirestoreUsers();
          renderUsersTable(allUsers);
        } catch (err) { Utils.showToast('Failed: ' + err.message, 'error'); }
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
  await loadDashboardRequests();
});

/* ════════════════════════════════════════════════════
   ORGANISERS Admin Management
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
   CUSTOMERS Admin Management
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
   MEDIA LIBRARY Admin Management
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
   SERVICE REQUESTS Dashboard preview
   ════════════════════════════════════════════════════ */

async function loadDashboardRequests() {
  const body = document.getElementById('dashRequestsBody');
  if (!body) return;

  try {
    const requests = await SupabaseAPI.adminGetServiceRequests();
    const pending  = requests.filter(r => r.status === 'pending');

    const badge = document.getElementById('dashReqBadge');
    if (badge) {
      if (pending.length) { badge.textContent = `${pending.length} Pending`; badge.style.display = 'inline-flex'; }
      else                { badge.style.display = 'none'; }
    }

    if (!requests.length) {
      body.innerHTML = `<div class="org-empty"><p>No service requests yet.</p></div>`;
      return;
    }

    const sorted = [...requests].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return 0;
    }).slice(0, 5);

    body.innerHTML = sorted.map(r => {
      const c = REQ_STATUS_COLORS[r.status] || REQ_STATUS_COLORS.pending;
      return `
        <div class="admin-row" style="grid-template-columns:1fr 140px 90px auto;align-items:center;">
          <div>
            <div class="admin-row-title">${escH(r.service_name || '—')}</div>
            <div class="admin-row-meta">${escH((r.first_name || '') + ' ' + (r.last_name || ''))} · ${escH(r.email || '')}</div>
          </div>
          <div class="admin-row-meta" style="white-space:nowrap;">${escH(r.location || '—')}</div>
          <span class="req-status-badge" style="background:${c.bg};color:${c.text};border:1px solid ${c.border}">${r.status || 'pending'}</span>
          <button class="btn btn-primary btn-sm" onclick="showSection('requests')">Review</button>
        </div>`;
    }).join('');

  } catch (err) {
    body.innerHTML = `<div class="org-empty"><p>No requests yet.</p><small>${escH(err.message)}</small></div>`;
  }
}

/* ════════════════════════════════════════════════════
   SERVICE REQUESTS Full section (filter + search)
   ════════════════════════════════════════════════════ */

async function loadServiceRequests() {
  const body = document.getElementById('requestsBody');
  if (!body) return;
  body.innerHTML = '<div class="req-loading"><div class="spinner"></div><span>Loading requests…</span></div>';

  reqStatusFilter = 'all';
  reqSearchQuery  = '';
  document.querySelectorAll('.req-filter-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === 'all'));
  const searchEl = document.getElementById('requestSearchInput');
  if (searchEl) searchEl.value = '';

  try {
    allRequests = await SupabaseAPI.adminGetServiceRequests();
    updateReqTabCounts();
    renderFilteredRequests();

  } catch (err) {
    body.innerHTML = `<div class="org-empty"><p>No service requests yet.</p><small>${escH(err.message)}</small></div>`;
  }
}

function updateReqTabCounts() {
  const el = id => document.getElementById(id);
  if (el('rtc-all')) el('rtc-all').textContent = allRequests.length || '';
  ['pending', 'quoted', 'confirmed', 'cancelled'].forEach(s => {
    const n = allRequests.filter(r => r.status === s).length;
    if (el(`rtc-${s}`)) el(`rtc-${s}`).textContent = n || '';
  });
}

function renderFilteredRequests() {
  const q = reqSearchQuery;
  const filtered = allRequests.filter(r => {
    if (reqStatusFilter !== 'all' && r.status !== reqStatusFilter) return false;
    if (!q) return true;
    const name = `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase();
    return name.includes(q) ||
           (r.email        || '').toLowerCase().includes(q) ||
           (r.service_name || '').toLowerCase().includes(q) ||
           (r.location     || '').toLowerCase().includes(q);
  });
  renderRequests(filtered);
}

function renderRequests(requests) {
  const body = document.getElementById('requestsBody');
  if (!body) return;

  if (!requests.length) {
    body.innerHTML = `
      <div class="req-empty">
        <div class="req-empty-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        </div>
        <p>${reqStatusFilter === 'all' ? 'No service requests yet.' : `No ${reqStatusFilter} requests found.`}</p>
        <small>When users submit equipment or service requests, they will appear here.</small>
      </div>`;
    return;
  }

  const pending = allRequests.filter(r => r.status === 'pending').length;

  const rows = requests.map(r => {
    const c          = REQ_STATUS_COLORS[r.status] || { bg:'rgba(128,128,128,.12)', text:'#888', border:'rgba(128,128,128,.3)' };
    const hasDetails = r.contact_phone || r.duration || r.budget_range || r.details;
    return `
      <tr class="req-row" data-req="${r.id}">
        <td class="req-id">#${r.id}</td>
        <td>
          <div class="req-service-wrap">
            <div class="req-service-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--a-amber)" stroke-width="2.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            </div>
            <div>
              <div class="req-service">${escH(r.service_name || '—')}</div>
              ${r.quantity ? `<div class="req-service-qty">Qty: ${escH(String(r.quantity))}</div>` : ''}
            </div>
          </div>
        </td>
        <td>
          <div class="req-name">${escH((r.first_name || '') + ' ' + (r.last_name || ''))}</div>
          <div class="req-email">${escH(r.email || '')}</div>
        </td>
        <td class="req-location">${escH(r.location || '—')}</td>
        <td class="req-date">${r.event_date ? new Date(r.event_date).toLocaleDateString('en-ZA') : '—'}</td>
        <td>
          <span class="req-status-badge" style="background:${c.bg};color:${c.text};border-color:${c.border}">${r.status || 'pending'}</span>
          ${hasDetails ? '<span class="req-expand-hint">▾ details</span>' : ''}
        </td>
        <td onclick="event.stopPropagation()">
          <select class="req-status-sel" data-req-id="${r.id}">
            <option value="pending"   ${r.status==='pending'   ? 'selected':''}>Pending</option>
            <option value="quoted"    ${r.status==='quoted'    ? 'selected':''}>Quoted</option>
            <option value="confirmed" ${r.status==='confirmed' ? 'selected':''}>Confirmed</option>
            <option value="cancelled" ${r.status==='cancelled' ? 'selected':''}>Cancelled</option>
          </select>
        </td>
      </tr>
      <tr class="req-details-row hidden" id="req-details-${r.id}">
        <td colspan="7">
          <div class="req-details-inner">
            ${r.contact_phone ? `<div class="req-detail-item"><label>Phone</label><span>${escH(r.contact_phone)}</span></div>` : ''}
            ${r.duration      ? `<div class="req-detail-item"><label>Duration</label><span>${escH(r.duration)}</span></div>` : ''}
            ${r.budget_range  ? `<div class="req-detail-item"><label>Budget Range</label><span>${escH(r.budget_range)}</span></div>` : ''}
            ${r.details       ? `<div class="req-detail-item req-detail-full"><label>Notes / Details</label><span>${escH(r.details)}</span></div>` : ''}
            <div class="req-detail-item"><label>Submitted</label><span>${r.created_at ? new Date(r.created_at).toLocaleString('en-ZA') : '—'}</span></div>
          </div>
        </td>
      </tr>`;
  }).join('');

  body.innerHTML = `
    <div class="req-summary">
      <span class="req-count">${requests.length} request${requests.length !== 1 ? 's' : ''}</span>
      ${pending ? `<span class="req-pending-chip">${pending} pending review</span>` : '<span class="req-ok-chip">All reviewed ✓</span>'}
      ${reqSearchQuery || reqStatusFilter !== 'all' ? `<span style="font-size:.75rem;color:var(--a-text-3);">(filtered)</span>` : ''}
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

  /* Expandable row toggle */
  body.querySelectorAll('.req-row[data-req]').forEach(row => {
    row.addEventListener('click', () => {
      const details = document.getElementById(`req-details-${row.dataset.req}`);
      if (details) {
        details.classList.toggle('hidden');
        const hint = row.querySelector('.req-expand-hint');
        if (hint) hint.textContent = details.classList.contains('hidden') ? '▾ details' : '▴ details';
      }
    });
  });

  /* Status update dropdowns */
  body.querySelectorAll('.req-status-sel').forEach(sel => {
    sel.dataset.prev = sel.value;
    sel.addEventListener('change', async function () {
      const id     = this.dataset.reqId;
      const status = this.value;
      const prev   = this.dataset.prev;
      try {
        await SupabaseAPI.adminUpdateServiceRequestStatus(id, status);
        Utils.showToast(`Request #${id} marked as "${status}"`, 'success');
        this.dataset.prev = status;

        const badge = this.closest('tr')?.querySelector('.req-status-badge');
        if (badge) {
          const c = REQ_STATUS_COLORS[status] || { bg:'rgba(128,128,128,.12)', text:'#888', border:'rgba(128,128,128,.3)' };
          badge.style.background  = c.bg;
          badge.style.color       = c.text;
          badge.style.borderColor = c.border;
          badge.textContent       = status;
        }

        const req = allRequests.find(r => String(r.id) === String(id));
        if (req) req.status = status;
        updateReqTabCounts();

      } catch (err) {
        Utils.showToast('Failed: ' + err.message, 'error');
        this.value = prev;
      }
    });
  });
}

/* ════════════════════════════════════════════════════
   ADMIN Create / Edit Event Modal
   ════════════════════════════════════════════════════ */

function openAdminEventModal(ev = null) {
  const modal = document.getElementById('admEventModal');
  if (!modal) return;

  // Reset
  document.getElementById('admEventForm').reset();
  document.getElementById('admTicketTypesContainer').innerHTML = '';
  document.getElementById('admModalError').classList.add('hidden');
  document.getElementById('admPayLinkGroup').style.display = '';
  document.getElementById('admPayBankGroup').style.display = 'none';
  admTicketTypeCount = 1;

  if (ev) {
    document.getElementById('admEditEventId').value    = ev.id;
    document.getElementById('admEvTitle').value        = ev.title       || '';
    document.getElementById('admEvCategory').value     = ev.category    || '';
    document.getElementById('admEvDate').value         = ev.date        || '';
    document.getElementById('admEvTime').value         = ev.time        || '';
    document.getElementById('admEvEndTime').value      = ev.endTime     || '';
    document.getElementById('admEvLocation').value     = ev.location    || '';
    document.getElementById('admEvCity').value         = ev.city        || '';
    document.getElementById('admEvProvince').value     = ev.province    || '';
    document.getElementById('admEvAddress').value      = ev.address     || '';
    document.getElementById('admEvDescription').value  = ev.description || '';
    document.getElementById('admEvPrice').value        = ev.price       ?? 0;
    document.getElementById('admEvImage').value        = ev.image       || '';
    document.getElementById('admEvTags').value         = (ev.tags || []).join(', ');
    document.getElementById('admEvOrganiser').value    = ev.organiser   || '';
    document.getElementById('admEvStatus').value       = ev.status      || 'published';
    document.getElementById('admEvFeatured').checked   = !!ev.featured;

    // Payment type
    const payType = ev.paymentType || 'link';
    const radio = document.querySelector(`input[name="admEvPayType"][value="${payType}"]`);
    if (radio) { radio.checked = true; }
    document.getElementById('admPayLinkGroup').style.display = payType === 'link' ? '' : 'none';
    document.getElementById('admPayBankGroup').style.display = payType === 'bank' ? 'grid' : 'none';
    document.getElementById('admEvPayLink').value     = ev.paymentLink   || '';
    document.getElementById('admEvBankName').value    = ev.bankName      || '';
    document.getElementById('admEvAccHolder').value   = ev.accountHolder || '';
    document.getElementById('admEvAccNumber').value   = ev.accountNumber || '';
    document.getElementById('admEvBranchCode').value  = ev.branchCode    || '';

    // Ticket types
    (ev.ticketTypes || []).forEach(tt => addAdminTicketTypeRow(tt));
    if (!ev.ticketTypes?.length) addAdminTicketTypeRow();

    syncSinglePreview('admEvImage', 'admEvImagePreview');
    Utils.setText('#admModalTitle',  'Edit Event');
    Utils.setText('#admSaveBtnText', 'Save Changes');
  } else {
    document.getElementById('admEditEventId').value = '';
    document.getElementById('admEvStatus').value    = 'published';
    document.getElementById('admEvFeatured').checked = false;
    addAdminTicketTypeRow();
    syncSinglePreview('admEvImage', 'admEvImagePreview');
    Utils.setText('#admModalTitle',  'Create Event');
    Utils.setText('#admSaveBtnText', 'Create Event');
  }

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAdminEventModal() {
  document.getElementById('admEventModal')?.classList.remove('open');
  document.body.style.overflow = '';
}

function addAdminTicketTypeRow(tt = null) {
  const container = document.getElementById('admTicketTypesContainer');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'tt-row';
  row.innerHTML = `
    <div class="form-group" style="margin:0;">
      <input type="text" class="form-input tt-name" placeholder="Type name (e.g. VIP)" value="${escH(tt?.name || '')}"/>
    </div>
    <div class="form-group" style="margin:0;">
      <input type="number" class="form-input tt-price" placeholder="Price (R)" min="0" value="${tt?.price ?? ''}"/>
    </div>
    <div class="form-group" style="margin:0;">
      <input type="number" class="form-input tt-avail" placeholder="Qty" min="1" value="${tt?.available ?? ''}"/>
    </div>
    <button type="button" class="tt-remove" title="Remove">×</button>`;
  row.querySelector('.tt-remove').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function showAdmModalError(msg) {
  const el = document.getElementById('admModalError');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

/* ════════════════════════════════════════════════════
   ACCOMMODATIONS Admin Section
   ════════════════════════════════════════════════════ */

let allAccommodations = [];
let allSpots          = [];
let accTab            = 'listings';

function switchAccTab(tab, el) {
  accTab = tab;
  document.querySelectorAll('.acc-admin-tab').forEach(t => t.classList.remove('active'));
  el?.classList.add('active');
  document.getElementById('accListingsPanel').classList.toggle('hidden', tab !== 'listings');
  document.getElementById('accSpotsPanel')   .classList.toggle('hidden', tab !== 'spots');
  document.getElementById('accBookingsPanel').classList.toggle('hidden', tab !== 'bookings');
  if (tab === 'listings' && !allAccommodations.length) loadAccListings();
  if (tab === 'spots'    && !allSpots.length)          loadAccSpots();
  if (tab === 'bookings')                              loadAccBookings();
}

let _accFiltersWired = false;

async function loadAccommodationsSection() {
  // Reset tab to listings on first load
  document.querySelectorAll('.acc-admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'listings'));
  document.getElementById('accListingsPanel').classList.remove('hidden');
  document.getElementById('accSpotsPanel')   .classList.add('hidden');
  document.getElementById('accBookingsPanel').classList.add('hidden');
  await loadAccListings();

  // Wire province filters only once to prevent duplicate listeners
  if (!_accFiltersWired) {
    _accFiltersWired = true;
    document.getElementById('accProvinceFilter')?.addEventListener('change', e => {
      const val = e.target.value;
      renderAccListings(val ? allAccommodations.filter(a => a.province === val) : allAccommodations);
    });
    document.getElementById('spotProvinceFilter')?.addEventListener('change', e => {
      const val = e.target.value;
      renderAccSpots(val ? allSpots.filter(s => s.province === val) : allSpots);
    });
  }
}

/* ── Accommodation listings ─────────────────────────────────────────────── */
async function loadAccListings() {
  const body = document.getElementById('accListingsBody');
  if (!body) return;
  body.innerHTML = '<div class="org-empty"><div class="spinner"></div></div>';
  try {
    allAccommodations = await SupabaseAPI.getAccommodations({ adminAll: true });
    renderAccListings(allAccommodations);
  } catch (err) {
    body.innerHTML = `<div class="org-empty"><p>Failed to load: ${escH(err.message)}</p></div>`;
  }
}

function renderAccListings(list) {
  const body = document.getElementById('accListingsBody');
  document.getElementById('accListingsCount').textContent = `${list.length} accommodation${list.length !== 1 ? 's' : ''}`;
  if (!list.length) {
    body.innerHTML = '<div class="org-empty"><p>No accommodations yet. Click "Add Accommodation" to get started.</p></div>';
    return;
  }
  body.innerHTML = list.map(a => `
    <div class="admin-row" style="grid-template-columns:60px 1fr 130px 80px 100px;align-items:center;">
      <img src="${a.images?.[0] || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=100&q=60'}"
        alt="${escH(a.name)}" class="admin-row-thumb" style="height:44px;border-radius:8px;"
        onerror="this.src='https://images.unsplash.com/photo-1566073771259-6a8506099945?w=100&q=60'"/>
      <div>
        <div class="admin-row-title">${escH(a.name)}</div>
        <div class="admin-row-meta">${escH(a.city)}, ${escH(a.province)} · ${(a.spaceTypes||[]).length} room type${(a.spaceTypes||[]).length !== 1 ? 's' : ''}</div>
      </div>
      <div class="admin-row-meta">${a.priceFrom > 0 ? `From R ${a.priceFrom.toFixed(0)}/night` : 'Inquiry only'}</div>
      <span class="status-badge ${a.status}">${a.status}</span>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-secondary btn-sm" onclick="openAccModal('${escH(a.id)}')">Edit</button>
        <button class="btn btn-sm" style="background:var(--a-red-bg);color:var(--a-red);border:1px solid rgba(239,68,68,.3);"
          onclick="deleteAcc('${escH(a.id)}', '${escH(a.name)}')">Delete</button>
      </div>
    </div>`).join('');
}

/* ── Accommodation modal ────────────────────────────────────────────────── */
function openAccModal(id = null) {
  const acc = id ? allAccommodations.find(a => a.id === id) : null;
  document.getElementById('accForm').reset();
  document.getElementById('spaceTypesContainer').innerHTML = '';
  document.getElementById('accModalError').classList.add('hidden');
  document.getElementById('accEditId').value = id || '';

  if (acc) {
    document.getElementById('accName').value        = acc.name        || '';
    document.getElementById('accProvince').value    = acc.province    || '';
    document.getElementById('accCity').value        = acc.city        || '';
    document.getElementById('accAddress').value     = acc.address     || '';
    document.getElementById('accCheckIn').value     = acc.checkInTime || '14:00';
    document.getElementById('accCheckOut').value    = acc.checkOutTime|| '10:00';
    document.getElementById('accPriceFrom').value   = acc.priceFrom   || 0;
    document.getElementById('accPhone').value       = acc.contactPhone|| '';
    document.getElementById('accEmail').value       = acc.contactEmail|| '';
    document.getElementById('accWebsite').value     = acc.website     || '';
    document.getElementById('accBookingUrl').value  = acc.bookingUrl  || '';
    document.getElementById('accDescription').value = acc.description || '';
    document.getElementById('accAmenities').value   = (acc.amenities || []).join(', ');
    document.getElementById('accImages').value      = (acc.images    || []).join(', ');
    document.getElementById('accStatus').value      = acc.status      || 'published';
    document.getElementById('accStarRating').value  = acc.starRating  || 0;
    document.getElementById('accFeatured').checked  = !!acc.featured;
    (acc.spaceTypes || []).forEach(st => addSpaceTypeRow(st));
    syncThumbStrip('accImages', 'accImagesThumbStrip');
  } else {
    document.getElementById('accCheckIn').value  = '14:00';
    document.getElementById('accCheckOut').value = '10:00';
    document.getElementById('accStatus').value   = 'published';
    addSpaceTypeRow();
    document.getElementById('accImagesThumbStrip').innerHTML = '';
  }

  Utils.setText('#accModalTitle',  acc ? 'Edit Accommodation' : 'Add Accommodation');
  Utils.setText('#accSaveBtnText', acc ? 'Save Changes' : 'Save Accommodation');
  document.getElementById('accModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAccModal() {
  document.getElementById('accModal')?.classList.remove('open');
  document.body.style.overflow = '';
}

function addSpaceTypeRow(st = null) {
  const container = document.getElementById('spaceTypesContainer');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'tt-row';
  row.style.cssText = 'grid-template-columns:2fr 1fr 1fr auto;';
  row.innerHTML = `
    <input type="text"   class="form-input st-name"     placeholder="Type (e.g. Deluxe Double)" value="${escH(st?.name || '')}"/>
    <input type="number" class="form-input st-price"    placeholder="R/night" min="0" value="${st?.price ?? ''}"/>
    <input type="number" class="form-input st-capacity" placeholder="Max guests" min="1" value="${st?.capacity ?? ''}"/>
    <button type="button" class="tt-remove" title="Remove">×</button>`;
  row.querySelector('.tt-remove').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

document.getElementById('accForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn  = document.getElementById('accSaveBtn');
  const id   = document.getElementById('accEditId').value || null;

  const spaceTypes = [];
  document.querySelectorAll('#spaceTypesContainer .tt-row').forEach(row => {
    const name     = row.querySelector('.st-name').value.trim();
    const price    = parseFloat(row.querySelector('.st-price').value);
    const capacity = parseInt(row.querySelector('.st-capacity').value, 10);
    if (name) spaceTypes.push({ name, price: isNaN(price) ? 0 : price, capacity: isNaN(capacity) ? null : capacity });
  });

  const data = {
    name:         document.getElementById('accName').value.trim(),
    province:     document.getElementById('accProvince').value,
    city:         document.getElementById('accCity').value.trim(),
    address:      document.getElementById('accAddress').value.trim(),
    checkInTime:  document.getElementById('accCheckIn').value,
    checkOutTime: document.getElementById('accCheckOut').value,
    priceFrom:    parseFloat(document.getElementById('accPriceFrom').value) || 0,
    contactPhone: document.getElementById('accPhone').value.trim(),
    contactEmail: document.getElementById('accEmail').value.trim(),
    website:      document.getElementById('accWebsite').value.trim(),
    bookingUrl:   document.getElementById('accBookingUrl').value.trim() || null,
    description:  document.getElementById('accDescription').value.trim(),
    amenities:    document.getElementById('accAmenities').value,
    images:       document.getElementById('accImages').value,
    status:       document.getElementById('accStatus').value,
    starRating:   parseInt(document.getElementById('accStarRating').value) || 0,
    featured:     document.getElementById('accFeatured').checked,
    spaceTypes,
  };

  if (!data.name)    { showAccModalError('Name is required.'); return; }
  if (!data.province){ showAccModalError('Please select a province.'); return; }
  if (!data.city)    { showAccModalError('City is required.'); return; }

  btn.disabled = true;
  Utils.setText('#accSaveBtnText', 'Saving…');
  document.getElementById('accModalError').classList.add('hidden');

  try {
    await SupabaseAPI.adminSaveAccommodation(id, data);
    closeAccModal();
    Utils.showToast(id ? 'Accommodation updated!' : 'Accommodation added!', 'success');
    await loadAccListings();
  } catch (err) {
    showAccModalError(err.message || 'Save failed.');
    btn.disabled = false;
    Utils.setText('#accSaveBtnText', id ? 'Save Changes' : 'Save Accommodation');
  }
});

function showAccModalError(msg) {
  const el = document.getElementById('accModalError');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

async function deleteAcc(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    await SupabaseAPI.adminDeleteAccommodation(id);
    Utils.showToast('Accommodation deleted.', 'success');
    await loadAccListings();
  } catch (err) {
    Utils.showToast('Delete failed: ' + err.message, 'error');
  }
}

/* ── Tourist spots ──────────────────────────────────────────────────────── */
async function loadAccSpots() {
  const body = document.getElementById('accSpotsBody');
  if (!body) return;
  body.innerHTML = '<div class="org-empty"><div class="spinner"></div></div>';
  try {
    allSpots = await SupabaseAPI.getTouristDestinations({ adminAll: true });
    renderAccSpots(allSpots);
  } catch (err) {
    body.innerHTML = `<div class="org-empty"><p>Failed to load: ${escH(err.message)}</p></div>`;
  }
}

function renderAccSpots(list) {
  const body = document.getElementById('accSpotsBody');
  document.getElementById('accSpotsCount').textContent = `${list.length} destination${list.length !== 1 ? 's' : ''}`;
  if (!list.length) {
    body.innerHTML = '<div class="org-empty"><p>No tourist spots yet. Click "Add Tourist Spot" to get started.</p></div>';
    return;
  }
  body.innerHTML = list.map(s => `
    <div class="admin-row" style="grid-template-columns:50px 1fr 120px 80px 100px;align-items:center;">
      <img src="${escH(s.image || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=100&q=60')}"
        alt="${escH(s.name)}" class="admin-row-thumb" style="height:40px;border-radius:8px;"
        onerror="this.src='https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=100&q=60'"/>
      <div>
        <div class="admin-row-title">${escH(s.name)}</div>
        <div class="admin-row-meta">${escH(s.category || 'Nature')} · ${escH(s.city || '')} ${s.city ? ',' : ''} ${escH(s.province)}</div>
      </div>
      <div class="admin-row-meta">${s.entry_fee > 0 ? `R ${parseFloat(s.entry_fee).toFixed(0)} entry` : 'Free entry'}</div>
      <span class="status-badge ${s.status}">${s.status}</span>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-secondary btn-sm" onclick="openSpotModal('${escH(s.id)}')">Edit</button>
        <button class="btn btn-sm" style="background:var(--a-red-bg);color:var(--a-red);border:1px solid rgba(239,68,68,.3);"
          onclick="deleteSpot('${escH(s.id)}', '${escH(s.name)}')">Delete</button>
      </div>
    </div>`).join('');
}

function openSpotModal(id = null) {
  const spot = id ? allSpots.find(s => s.id === id) : null;
  document.getElementById('spotForm').reset();
  document.getElementById('spotModalError').classList.add('hidden');
  document.getElementById('spotEditId').value = id || '';

  if (spot) {
    document.getElementById('spotName').value        = spot.name         || '';
    document.getElementById('spotProvince').value    = spot.province     || '';
    document.getElementById('spotCity').value        = spot.city         || '';
    document.getElementById('spotCategory').value    = spot.category     || 'Nature';
    document.getElementById('spotFee').value         = spot.entry_fee    || 0;
    document.getElementById('spotImage').value       = spot.image        || '';
    document.getElementById('spotWebsite').value     = spot.website      || '';
    document.getElementById('spotDescription').value = spot.description  || '';
    document.getElementById('spotStatus').value      = spot.status       || 'published';
    document.getElementById('spotFeatured').checked  = !!spot.featured;
    syncSinglePreview('spotImage', 'spotImagePreview');
  } else {
    document.getElementById('spotStatus').value = 'published';
    document.getElementById('spotFee').value    = 0;
    syncSinglePreview('spotImage', 'spotImagePreview');
  }

  Utils.setText('#spotModalTitle',  spot ? 'Edit Tourist Spot' : 'Add Tourist Spot');
  Utils.setText('#spotSaveBtnText', spot ? 'Save Changes' : 'Save Tourist Spot');
  document.getElementById('spotModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSpotModal() {
  document.getElementById('spotModal')?.classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('spotForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('spotSaveBtn');
  const id  = document.getElementById('spotEditId').value || null;

  const data = {
    name:        document.getElementById('spotName').value.trim(),
    province:    document.getElementById('spotProvince').value,
    city:        document.getElementById('spotCity').value.trim(),
    category:    document.getElementById('spotCategory').value,
    entryFee:    parseFloat(document.getElementById('spotFee').value) || 0,
    image:       document.getElementById('spotImage').value.trim(),
    website:     document.getElementById('spotWebsite').value.trim(),
    description: document.getElementById('spotDescription').value.trim(),
    status:      document.getElementById('spotStatus').value,
    featured:    document.getElementById('spotFeatured').checked,
  };

  if (!data.name)    { showSpotModalError('Name is required.'); return; }
  if (!data.province){ showSpotModalError('Please select a province.'); return; }

  btn.disabled = true;
  Utils.setText('#spotSaveBtnText', 'Saving…');

  try {
    await SupabaseAPI.adminSaveTouristDestination(id, data);
    closeSpotModal();
    Utils.showToast(id ? 'Tourist spot updated!' : 'Tourist spot added!', 'success');
    await loadAccSpots();
  } catch (err) {
    showSpotModalError(err.message || 'Save failed.');
    btn.disabled = false;
    Utils.setText('#spotSaveBtnText', id ? 'Save Changes' : 'Save Tourist Spot');
  }
});

function showSpotModalError(msg) {
  const el = document.getElementById('spotModalError');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

async function deleteSpot(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    await SupabaseAPI.adminDeleteTouristDestination(id);
    Utils.showToast('Tourist spot deleted.', 'success');
    await loadAccSpots();
  } catch (err) {
    Utils.showToast('Delete failed: ' + err.message, 'error');
  }
}

/* ── Booking enquiries ──────────────────────────────────────────────────── */
const BK_STATUS_COLORS = {
  pending:   { bg:'rgba(245,158,11,.12)', text:'#F59E0B', border:'rgba(245,158,11,.3)' },
  confirmed: { bg:'rgba(22,163,74,.12)',  text:'#16A34A', border:'rgba(22,163,74,.3)'  },
  cancelled: { bg:'rgba(239,68,68,.12)',  text:'#EF4444', border:'rgba(239,68,68,.3)'  },
};

async function loadAccBookings() {
  const body = document.getElementById('accBookingsBody');
  if (!body) return;
  body.innerHTML = '<div class="org-empty"><div class="spinner"></div></div>';
  try {
    const bookings = await SupabaseAPI.adminGetAccommodationBookings();
    document.getElementById('accBookingsCount').textContent = `${bookings.length} booking enquir${bookings.length !== 1 ? 'ies' : 'y'}`;
    if (!bookings.length) {
      body.innerHTML = '<div class="org-empty"><p>No booking enquiries yet.</p></div>';
      return;
    }
    const rows = bookings.map(b => {
      const c = BK_STATUS_COLORS[b.status] || BK_STATUS_COLORS.pending;
      return `
        <div class="admin-row" style="grid-template-columns:1fr 1fr 120px 80px 110px;align-items:center;">
          <div>
            <div class="admin-row-title">${escH(b.accommodation_name)}</div>
            <div class="admin-row-meta">${escH(b.space_type_name)} · ${b.nights || 1} night${b.nights !== 1 ? 's' : ''}</div>
          </div>
          <div>
            <div class="admin-row-title">${escH(b.customer_name)}</div>
            <div class="admin-row-meta">${escH(b.customer_email)}${b.customer_phone ? ' · ' + escH(b.customer_phone) : ''}</div>
          </div>
          <div class="admin-row-meta">
            ${b.check_in_date ? new Date(b.check_in_date).toLocaleDateString('en-ZA') : '—'}
            → ${b.check_out_date ? new Date(b.check_out_date).toLocaleDateString('en-ZA') : '—'}
          </div>
          <span class="req-status-badge" style="background:${c.bg};color:${c.text};border-color:${c.border}">${b.status}</span>
          <select class="req-status-sel" data-bk-id="${escH(b.id)}" style="width:100px;">
            <option value="pending"   ${b.status==='pending'   ?'selected':''}>Pending</option>
            <option value="confirmed" ${b.status==='confirmed' ?'selected':''}>Confirmed</option>
            <option value="cancelled" ${b.status==='cancelled' ?'selected':''}>Cancelled</option>
          </select>
        </div>`;
    }).join('');
    body.innerHTML = rows;

    body.querySelectorAll('.req-status-sel[data-bk-id]').forEach(sel => {
      sel.dataset.prev = sel.value;
      sel.addEventListener('change', async function () {
        const id = this.dataset.bkId;
        const status = this.value;
        try {
          await SupabaseAPI.adminUpdateBookingStatus(id, status);
          Utils.showToast(`Booking marked as "${status}"`, 'success');
          this.dataset.prev = status;
          const badge = this.closest('.admin-row')?.querySelector('.req-status-badge');
          if (badge) {
            const c = BK_STATUS_COLORS[status] || BK_STATUS_COLORS.pending;
            badge.style.background = c.bg; badge.style.color = c.text; badge.style.borderColor = c.border;
            badge.textContent = status;
          }
        } catch (err) {
          Utils.showToast('Update failed: ' + err.message, 'error');
          this.value = this.dataset.prev;
        }
      });
    });
  } catch (err) {
    body.innerHTML = `<div class="org-empty"><p>Failed to load: ${escH(err.message)}</p></div>`;
  }
}

/* ════════════════════════════════════════════════════
   IMAGE UPLOAD ZONES Shared helpers
   ════════════════════════════════════════════════════ */

function initImageUploads() {
  _wireSingleUpload('admEvImageFile', 'admEvImage',  'admEvImagePreview', 'events');
  _wireMultiUpload( 'accImagesFile',  'accImages',   'accImagesThumbStrip', 'accommodations');
  _wireSingleUpload('spotImageFile',  'spotImage',   'spotImagePreview',   'destinations');
}

function _wireSingleUpload(fileInputId, urlInputId, previewId, folder) {
  const fi = document.getElementById(fileInputId);
  if (!fi || fi._wired) return;
  fi._wired = true;

  // Also sync preview whenever the URL input changes manually
  const urlInput = document.getElementById(urlInputId);
  urlInput?.addEventListener('input', () => syncSinglePreview(urlInputId, previewId));

  fi.addEventListener('change', async function () {
    const file = this.files[0];
    if (!file) return;
    _setZoneLoading(fileInputId, true);
    try {
      const url = await Utils.uploadImage(file, folder);
      if (urlInput) urlInput.value = url;
      syncSinglePreview(urlInputId, previewId);
      Utils.showToast('Image uploaded and compressed!', 'success');
    } catch (err) {
      Utils.showToast('Upload failed: ' + err.message, 'error');
    } finally {
      _setZoneLoading(fileInputId, false);
      this.value = '';
    }
  });
}

function _wireMultiUpload(fileInputId, textareaId, thumbStripId, folder) {
  const fi = document.getElementById(fileInputId);
  if (!fi || fi._wired) return;
  fi._wired = true;

  // Sync thumbs when textarea changes manually
  const ta = document.getElementById(textareaId);
  ta?.addEventListener('input', () => syncThumbStrip(textareaId, thumbStripId));

  fi.addEventListener('change', async function () {
    const files = Array.from(this.files);
    if (!files.length) return;
    _setZoneLoading(fileInputId, true, `Uploading ${files.length} image${files.length > 1 ? 's' : ''}…`);
    try {
      const urls = await Promise.all(files.map(f => Utils.uploadImage(f, folder)));

      // Append to existing list in textarea
      const existing = (ta?.value || '').split(',').map(u => u.trim()).filter(Boolean);
      const all = [...existing, ...urls];
      if (ta) ta.value = all.join(', ');

      // Append new thumbnails to strip (don't rebuild keep existing order)
      const strip = document.getElementById(thumbStripId);
      if (strip) urls.forEach(url => strip.appendChild(_makeThumb(url, textareaId, thumbStripId)));

      Utils.showToast(`${urls.length} image${urls.length > 1 ? 's' : ''} uploaded and compressed!`, 'success');
    } catch (err) {
      Utils.showToast('Upload failed: ' + err.message, 'error');
    } finally {
      _setZoneLoading(fileInputId, false);
      this.value = '';
    }
  });
}

function syncSinglePreview(urlInputId, previewId) {
  const url     = document.getElementById(urlInputId)?.value?.trim();
  const preview = document.getElementById(previewId);
  if (!preview) return;
  if (url && url.startsWith('http')) {
    preview.innerHTML = `<img src="${escH(url)}" alt="Preview" onerror="this.parentElement.classList.add('hidden')"/>`;
    preview.classList.remove('hidden');
  } else {
    preview.innerHTML = '';
    preview.classList.add('hidden');
  }
}

function syncThumbStrip(textareaId, thumbStripId) {
  const urls  = (document.getElementById(textareaId)?.value || '')
    .split(',').map(u => u.trim()).filter(u => u.startsWith('http'));
  const strip = document.getElementById(thumbStripId);
  if (!strip) return;
  strip.innerHTML = '';
  urls.forEach(url => strip.appendChild(_makeThumb(url, textareaId, thumbStripId)));
}

function _makeThumb(url, textareaId, thumbStripId) {
  const wrap = document.createElement('div');
  wrap.className = 'img-thumb-wrap';
  const img = document.createElement('img');
  img.src = url; img.alt = '';
  img.onerror = function () { this.closest('.img-thumb-wrap')?.remove(); };
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'img-thumb-wrap__remove'; btn.title = 'Remove'; btn.textContent = '×';
  btn.addEventListener('click', () => _removeThumbUrl(url, textareaId, thumbStripId, wrap));
  wrap.appendChild(img); wrap.appendChild(btn);
  return wrap;
}

function _removeThumbUrl(url, textareaId, thumbStripId, thumbEl) {
  const ta = document.getElementById(textareaId);
  if (ta) {
    const urls = ta.value.split(',').map(u => u.trim()).filter(u => u && u !== url);
    ta.value = urls.join(', ');
  }
  thumbEl?.remove();
}

function _setZoneLoading(fileInputId, loading, label = 'Uploading…') {
  const fi   = document.getElementById(fileInputId);
  const zone = fi?.closest('.img-upload-zone');
  const btn  = zone?.querySelector('.img-upload-zone__btn');
  if (!btn) return;
  if (loading) {
    btn.dataset.origLabel = btn.textContent.trim();
    btn.textContent = label;
    btn.classList.add('img-upload-zone__btn--loading');
  } else {
    btn.textContent = btn.dataset.origLabel || 'Upload';
    btn.classList.remove('img-upload-zone__btn--loading');
  }
  if (fi) fi.disabled = loading;
}

function escH(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
