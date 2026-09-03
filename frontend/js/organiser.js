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
          <p>You haven't listed an event yet. Click <strong>Create Listing</strong> above to sell your first tickets.</p>
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
    body.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => {
      // One canonical event form lives in the staged wizard now.
      window.location.href = `sell-event.html?edit=${encodeURIComponent(btn.dataset.id)}`;
    }));
    body.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => deleteEvent(btn.dataset.id)));
  }

  // ── Status filter ─────────────────────────────────────────────────────
  document.getElementById('statusFilter').addEventListener('change', e => {
    const val = e.target.value;
    renderTable(val ? allEvents.filter(ev => ev.status === val) : allEvents);
  });

  // ── Event create/edit lives in the staged wizard now ─────────────────
  //    sell-event.html (create)  ·  sell-event.html?edit=<id> (edit)
  //    The old in-page modal and its form handler were removed with it.

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

  // ── Bootstrap ──────────────────────────────────────────────────────────
  await loadEvents();
});
