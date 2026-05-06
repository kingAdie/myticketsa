/* ================================================
   MyTicketSA — Homepage Logic v4 (home.js)
   Loads events from /api/events via EventsData.init()
   ================================================ */

document.addEventListener('DOMContentLoaded', async () => {

  Utils.initMobileNav();
  initSearch();
  initNewsletter();

  /* ── Load events from API, then render ─────────────────────────────── */
  await EventsData.init();
  renderCategoryFilters();
  renderEvents(EventsData.getAll());

  /* ── Category Filters ───────────────────────────────────────────────── */
  function renderCategoryFilters() {
    const container = document.getElementById('categoryFilters');
    if (!container) return;
    // Remove existing dynamic buttons (keep the "All" button)
    container.querySelectorAll('.filter-btn:not([data-filter="all"])').forEach(b => b.remove());

    EventsData.getCategories().forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'filter-pill';
      btn.textContent = cat;
      btn.dataset.filter = cat;
      btn.setAttribute('role', 'tab');
      btn.addEventListener('click', () => filterByCategory(cat, btn));
      container.appendChild(btn);
    });
  }

  function filterByCategory(category, clickedBtn) {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    clickedBtn.classList.add('active');
    renderEvents(category === 'all' ? EventsData.getAll() : EventsData.getByCategory(category));
  }

  /* ── Render Event Cards ─────────────────────────────────────────────── */
  function renderEvents(events) {
    const grid       = document.getElementById('eventsGrid');
    const emptyState = document.getElementById('emptyState');
    if (!grid) return;

    grid.innerHTML = '';

    if (!events || events.length === 0) {
      emptyState?.classList.remove('hidden');
      return;
    }
    emptyState?.classList.add('hidden');
    events.forEach(event => grid.appendChild(createEventCard(event)));
  }

  function createEventCard(event) {
    const card = document.createElement('article');
    card.className = 'event-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', event.title);

    card.innerHTML = `
      <div class="event-card__img-wrap">
        <img class="event-card__img" src="${event.image || ''}" alt="${event.title}" loading="lazy"
          onerror="this.src='https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&q=80'"/>
        <div class="event-card__img-overlay"></div>
        ${event.featured ? '<span class="event-card__badge badge badge-green">Featured</span>' : ''}
      </div>
      <div class="event-card__body">
        <div class="event-card__cat">${event.category}</div>
        <h3 class="event-card__title">${event.title}</h3>
        <div class="event-card__meta">
          <div class="event-card__meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>${Utils.formatDate(event.date)} at ${Utils.formatTime(event.time)}</span>
          </div>
          <div class="event-card__meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <span>${event.location}, ${event.city}</span>
          </div>
        </div>
        <div class="event-card__foot">
          <div class="event-card__price">
            ${Utils.formatCurrency(event.price)}
            <span class="event-card__price-note">from per ticket</span>
          </div>
          <button class="btn btn-primary btn-sm" data-event-id="${event.id}" aria-label="View ${event.title}">
            View Event
          </button>
        </div>
      </div>`;

    card.querySelector('.btn').addEventListener('click', e => {
      e.stopPropagation();
      window.location.href = `event.html?id=${event.id}`;
    });
    card.addEventListener('click', () => window.location.href = `event.html?id=${event.id}`);
    return card;
  }

  /* ── Search ────────────────────────────────────────────────────────── */
  function initSearch() {
    const searchInput = document.getElementById('heroSearch');
    const searchBtn   = document.getElementById('heroSearchBtn');
    const clearBtn    = document.getElementById('clearSearchBtn');

    function doSearch() {
      const query = searchInput?.value.trim();
      document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' });
      resetCategoryFilter();
      renderEvents(query ? EventsData.search(query) : EventsData.getAll());
    }

    searchBtn?.addEventListener('click', doSearch);
    searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    clearBtn?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      renderEvents(EventsData.getAll());
      resetCategoryFilter();
    });
  }

  function resetCategoryFilter() {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-filter="all"]')?.classList.add('active');
  }

  /* ── Newsletter ─────────────────────────────────────────────────────── */
  function initNewsletter() {
    const form  = document.getElementById('newsletterForm');
    const email = document.getElementById('newsletterEmail');
    form?.addEventListener('submit', e => {
      e.preventDefault();
      const v = email?.value.trim();
      if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        Utils.showToast('Please enter a valid email.', 'error');
        return;
      }
      Utils.showToast("You're subscribed! 🎉", 'success', 4000);
      if (email) email.value = '';
    });
  }

});
