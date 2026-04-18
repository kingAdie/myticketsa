/* ================================================
   MyTicketSA — Organiser Dashboard (organiser.js)
   ================================================ */

document.addEventListener('DOMContentLoaded', async () => {

  // ── Guard: require login + organiser/admin role ──────────────────────────
  if (!Auth.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }
  // Validate token server-side (catches expired tokens)
  try {
    const meRes = await fetch(_API_BASE + '/api/auth/me', { headers: Auth.headers() });
    if (!meRes.ok) { Auth.logout(); return; }
    const meData = await meRes.json();
    if (!meData.success) { Auth.logout(); return; }
    // Refresh stored user
    localStorage.setItem('mt_user', JSON.stringify(meData.user));
    // Enforce organiser/admin role
    if (!['organiser', 'admin'].includes(meData.user.role)) {
      window.location.href = 'index.html';
      return;
    }
  } catch {
    if (!Auth.isOrganiser()) { window.location.href = 'index.html'; return; }
  }

  const user = Auth.getUser();
  Utils.setText('#orgWelcome', `Welcome, ${user.firstName}`);
  Utils.initMobileNav();

  let allEvents = [];
  let ticketTypeCount = 1;

  // ── Load events ──────────────────────────────────────────────────────
  async function loadEvents() {
    document.getElementById('orgLoading').style.display = 'flex';
    try {
      const res  = await fetch(_ORGANISER_API + '/events', { headers: Auth.headers() });
      const data = await res.json();
      allEvents  = data.events || [];
      renderStats(allEvents);
      renderTable(allEvents);
    } catch (err) {
      document.getElementById('eventsTableBody').innerHTML =
        `<div class="org-empty"><p>Could not load events. Is the server running?</p></div>`;
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────
  function renderStats(events) {
    Utils.setText('#statTotal',     events.length);
    Utils.setText('#statPublished', events.filter(e => e.status === 'published').length);
    Utils.setText('#statPending',   events.filter(e => e.status === 'pending').length);
  }

  // ── Table ─────────────────────────────────────────────────────────────
  function renderTable(events) {
    const body = document.getElementById('eventsTableBody');
    if (events.length === 0) {
      body.innerHTML = `
        <div class="org-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <p>No events yet. Click <strong>Create Event</strong> to get started.</p>
        </div>`;
      return;
    }

    body.innerHTML = events.map(e => `
      <div class="org-event-row" data-id="${e.id}">
        <img class="org-event-thumb" src="${e.image || ''}" alt="${e.title}"
          onerror="this.src='https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=200&q=60'"/>
        <div class="org-event-info">
          <h4>${e.title}</h4>
          <div class="org-event-meta">
            ${Utils.formatDate(e.date)} · ${e.city}
            · <span class="status-badge ${e.status}">${e.status}</span>
            ${e.featured ? '<span class="badge badge-blue" style="margin-left:4px;">Featured</span>' : ''}
          </div>
        </div>
        <div class="org-event-actions">
          <span style="font-size:.9375rem;font-weight:700;color:var(--green);min-width:60px;text-align:right;">
            ${Utils.formatCurrency(e.price)}
          </span>
          <button class="org-btn-icon edit-btn" data-id="${e.id}" title="Edit event" aria-label="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="org-btn-icon delete delete-btn" data-id="${e.id}" title="Delete event" aria-label="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    // Attach edit/delete handlers
    body.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => openEditModal(btn.dataset.id)));
    body.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => deleteEvent(btn.dataset.id)));
  }

  // ── Status filter ─────────────────────────────────────────────────────
  document.getElementById('statusFilter').addEventListener('change', e => {
    const val = e.target.value;
    renderTable(val ? allEvents.filter(ev => ev.status === val) : allEvents);
  });

  // ── Modal helpers ─────────────────────────────────────────────────────
  function openModal() {
    document.getElementById('eventModal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    document.getElementById('eventModal').classList.remove('open');
    document.body.style.overflow = '';
    document.getElementById('eventForm').reset();
    document.getElementById('editEventId').value = '';
    document.getElementById('ticketTypesContainer').innerHTML = '';
    document.getElementById('modalError').classList.add('hidden');
    ticketTypeCount = 1;
    Utils.setText('#modalTitle',  'Create New Event');
    Utils.setText('#saveBtnText', 'Create Event');
  }

  document.getElementById('newEventBtn')    .addEventListener('click', () => { closeModal(); addTicketTypeRow(); openModal(); });
  document.getElementById('closeEventModal').addEventListener('click', closeModal);
  document.getElementById('cancelEventBtn') .addEventListener('click', closeModal);
  document.getElementById('eventModal')     .addEventListener('click', e => { if (e.target.id === 'eventModal') closeModal(); });

  // ── Ticket type rows ─────────────────────────────────────────────────
  function addTicketTypeRow(tt = null) {
    const container = document.getElementById('ticketTypesContainer');
    const idx = ticketTypeCount++;
    const row = document.createElement('div');
    row.className = 'tt-row';
    row.dataset.idx = idx;
    row.innerHTML = `
      <div class="form-group" style="margin:0;">
        <input type="text" class="form-input tt-name" placeholder="Type name (e.g. VIP)" value="${tt?.name || ''}"/>
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

  document.getElementById('addTicketTypeBtn').addEventListener('click', () => addTicketTypeRow());

  // ── Open edit modal ───────────────────────────────────────────────────
  function openEditModal(id) {
    const ev = allEvents.find(e => e.id === id);
    if (!ev) return;

    document.getElementById('editEventId').value = ev.id;
    document.getElementById('evTitle')      .value = ev.title;
    document.getElementById('evCategory')   .value = ev.category;
    document.getElementById('evDate')       .value = ev.date;
    document.getElementById('evTime')       .value = ev.time;
    document.getElementById('evEndTime')    .value = ev.endTime || '';
    document.getElementById('evLocation')   .value = ev.location;
    document.getElementById('evCity')       .value = ev.city;
    document.getElementById('evProvince')   .value = ev.province || '';
    document.getElementById('evDescription').value = ev.description;
    document.getElementById('evImage')      .value = ev.image || '';
    document.getElementById('evPrice')      .value = ev.price;
    document.getElementById('evTags')       .value = (ev.tags || []).join(', ');

    // Ticket types
    document.getElementById('ticketTypesContainer').innerHTML = '';
    ticketTypeCount = 1;
    (ev.ticketTypes || []).forEach(tt => addTicketTypeRow(tt));
    if (!ev.ticketTypes?.length) addTicketTypeRow();

    Utils.setText('#modalTitle',  'Edit Event');
    Utils.setText('#saveBtnText', 'Save Changes');
    openModal();
  }

  // ── Form submit ───────────────────────────────────────────────────────
  document.getElementById('eventForm').addEventListener('submit', async e => {
    e.preventDefault();
    const saveBtn  = document.getElementById('saveEventBtn');
    const editId   = document.getElementById('editEventId').value;
    const isEdit   = !!editId;

    // Collect ticket types
    const ticketTypes = [];
    document.querySelectorAll('.tt-row').forEach((row, i) => {
      const name  = row.querySelector('.tt-name') .value.trim();
      const price = parseFloat(row.querySelector('.tt-price').value);
      const avail = parseInt(row.querySelector('.tt-avail').value, 10);
      if (name) ticketTypes.push({
        id:          `TT-${i + 1}`,
        name,
        price:       isNaN(price) ? 0 : price,
        available:   isNaN(avail) ? 100 : avail,
        description: name,
      });
    });

    const payload = {
      title:       document.getElementById('evTitle')      .value.trim(),
      category:    document.getElementById('evCategory')   .value,
      date:        document.getElementById('evDate')       .value,
      time:        document.getElementById('evTime')       .value,
      endTime:     document.getElementById('evEndTime')    .value,
      location:    document.getElementById('evLocation')   .value.trim(),
      city:        document.getElementById('evCity')       .value.trim(),
      province:    document.getElementById('evProvince')   .value,
      description: document.getElementById('evDescription').value.trim(),
      image:       document.getElementById('evImage')      .value.trim(),
      price:       parseFloat(document.getElementById('evPrice').value) || 0,
      tags:        document.getElementById('evTags').value.split(',').map(t => t.trim()).filter(Boolean),
      ticketTypes,
    };

    saveBtn.disabled = true;
    Utils.setText('#saveBtnText', isEdit ? 'Saving…' : 'Creating…');

    try {
      const url    = isEdit ? `${_ORGANISER_API}/events/${editId}` : `${_API_BASE}/api/events`;
      const method = isEdit ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: Auth.headers(), body: JSON.stringify(payload) });
      const data   = await res.json();

      if (!res.ok || !data.success) {
        const errEl = document.getElementById('modalError');
        errEl.textContent = (data.errors || [data.error]).join(' ');
        errEl.classList.remove('hidden');
        saveBtn.disabled = false;
        Utils.setText('#saveBtnText', isEdit ? 'Save Changes' : 'Create Event');
        return;
      }

      closeModal();
      Utils.showToast(isEdit ? 'Event updated!' : 'Event created! Pending admin review.', 'success');
      await loadEvents();

    } catch (err) {
      Utils.showToast('Server error. Please try again.', 'error');
      saveBtn.disabled = false;
      Utils.setText('#saveBtnText', isEdit ? 'Save Changes' : 'Create Event');
    }
  });

  // ── Delete event ──────────────────────────────────────────────────────
  async function deleteEvent(id) {
    const ev = allEvents.find(e => e.id === id);
    if (!ev) return;
    if (!confirm(`Delete "${ev.title}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`${_ORGANISER_API}/events/${id}`, { method: 'DELETE', headers: Auth.headers() });
      const data = await res.json();
      if (data.success) { Utils.showToast('Event deleted.', 'success'); await loadEvents(); }
      else Utils.showToast(data.error || 'Delete failed.', 'error');
    } catch {
      Utils.showToast('Server error.', 'error');
    }
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────
  await loadEvents();
  addTicketTypeRow(); // Default 1 ticket type in blank form
});
