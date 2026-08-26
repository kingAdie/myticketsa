/* ================================================
   TicketsSA Organiser Dashboard (organiser.js)
   ================================================ */

document.addEventListener('DOMContentLoaded', async () => {

  // ── Guard: require login + organiser/admin role ──────────────────────────
  if (!Auth.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }
  // Enforce organiser/admin role from stored session
  if (!Auth.isOrganiser()) { window.location.href = 'index.html'; return; }

  const user = Auth.getUser();
  Utils.setText('#orgWelcome', `Welcome, ${user.firstName}`);
  Utils.initMobileNav();

  let allEvents = [];
  let ticketTypeCount = 1;

  // ── Load events ──────────────────────────────────────────────────────
  async function loadEvents() {
    document.getElementById('orgLoading').style.display = 'flex';
    try {
      allEvents = await SupabaseAPI.getEvents({ organiserId: user.id });
      renderStats(allEvents);
      renderTable(allEvents);
    } catch (err) {
      document.getElementById('eventsTableBody').innerHTML =
        `<div class="org-empty"><p>Could not load events. Please refresh the page.</p></div>`;
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
    // Reset payment type visibility to default (link)
    const payLinkGrp = document.getElementById('payLinkGroup');
    const payBankGrp = document.getElementById('payBankGroup');
    if (payLinkGrp) payLinkGrp.style.display = '';
    if (payBankGrp) payBankGrp.style.display = 'none';
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
    // image is managed by admin only no field for organisers
    document.getElementById('evPrice')      .value = ev.price;
    document.getElementById('evTags')       .value = (ev.tags || []).join(', ');

    // New payment / address fields
    const addrEl = document.getElementById('evAddress');
    if (addrEl) addrEl.value = ev.address || '';
    const payType = ev.paymentType || 'free';
    document.querySelectorAll('input[name="evPayType"]').forEach(r => { r.checked = r.value === payType; });
    const payLinkGroupEl = document.getElementById('payLinkGroup');
    const payBankGroupEl = document.getElementById('payBankGroup');
    if (payLinkGroupEl) payLinkGroupEl.style.display = payType === 'link' ? '' : 'none';
    if (payBankGroupEl) payBankGroupEl.style.display = payType === 'bank' ? 'grid' : 'none';
    const evPayLinkEl = document.getElementById('evPayLink');
    if (evPayLinkEl) evPayLinkEl.value = ev.paymentLink || '';
    const evBankNameEl = document.getElementById('evBankName');
    if (evBankNameEl) evBankNameEl.value = ev.bankName || '';
    const evAccHolderEl = document.getElementById('evAccountHolder');
    if (evAccHolderEl) evAccHolderEl.value = ev.accountHolder || '';
    const evAccNumEl = document.getElementById('evAccountNumber');
    if (evAccNumEl) evAccNumEl.value = ev.accountNumber || '';
    const evBranchEl = document.getElementById('evBranchCode');
    if (evBranchEl) evBranchEl.value = ev.branchCode || '';

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
      // image omitted backend will keep existing image or use default
      price:       parseFloat(document.getElementById('evPrice').value) || 0,
      tags:        document.getElementById('evTags').value.split(',').map(t => t.trim()).filter(Boolean),
      ticketTypes,
      address:       document.getElementById('evAddress')?.value.trim() || '',
      paymentType:   document.querySelector('input[name="evPayType"]:checked')?.value || 'free',
      paymentLink:   document.getElementById('evPayLink')?.value.trim() || '',
      bankName:      document.getElementById('evBankName')?.value.trim() || '',
      accountHolder: document.getElementById('evAccountHolder')?.value.trim() || '',
      accountNumber: document.getElementById('evAccountNumber')?.value.trim() || '',
      branchCode:    document.getElementById('evBranchCode')?.value.trim() || '',
    };

    saveBtn.disabled = true;
    Utils.setText('#saveBtnText', isEdit ? 'Saving…' : 'Creating…');

    try {
      if (isEdit) {
        await SupabaseAPI.updateEvent(editId, payload);
      } else {
        await SupabaseAPI.createEvent(payload);
      }
      closeModal();
      Utils.showToast(isEdit ? 'Event updated!' : 'Event created! Pending admin review.', 'success');
      await loadEvents();
    } catch (err) {
      const errEl = document.getElementById('modalError');
      errEl.textContent = err.message || 'Could not save event. Please try again.';
      errEl.classList.remove('hidden');
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
      await SupabaseAPI.deleteEvent(id);
      Utils.showToast('Event deleted.', 'success');
      await loadEvents();
    } catch (err) {
      Utils.showToast(err.message || 'Delete failed.', 'error');
    }
  }

  // Payment type toggle
  document.querySelectorAll('input[name="evPayType"]').forEach(radio => {
    radio.addEventListener('change', function() {
      document.getElementById('payLinkGroup').style.display = this.value === 'link' ? '' : 'none';
      document.getElementById('payBankGroup').style.display = this.value === 'bank' ? 'grid' : 'none';
    });
  });

  // ── Bootstrap ──────────────────────────────────────────────────────────
  await loadEvents();
  addTicketTypeRow(); // Default 1 ticket type in blank form
});
