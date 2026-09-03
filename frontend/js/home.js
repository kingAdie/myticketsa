/* ================================================
   TicketsSA Homepage Logic v4 (home.js)
   Loads events from /api/events via EventsData.init()
   ================================================ */

document.addEventListener('DOMContentLoaded', async () => {

  Utils.initMobileNav();
  initSearch();
  initNewsletter();

  /* ── Load events from Supabase (for dynamic grid if present) ─────── */
  await EventsData.init();

  /* ── Search ────────────────────────────────────────────────────────── */
  function initSearch() {
    const searchInput = document.getElementById('heroSearch');
    const searchBtn   = document.getElementById('heroSearchBtn');
    const clearBtn    = document.getElementById('clearSearchBtn');

    function doSearch() {
      const query = (searchInput?.value || '').trim().toLowerCase();

      /* A real query goes to the full results page, which searches every
         published listing rather than only the cards on this page. */
      if (query) {
        window.location.href = 'browse.html?q=' + encodeURIComponent(query);
        return;
      }

      document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' });

      /* Filter the hardcoded event feature cards on the homepage */
      const featureCards = document.querySelectorAll('.ev-feature-card');
      featureCards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = (!query || text.includes(query)) ? '' : 'none';
      });

      /* Also show/hide the "coming soon" block */
      const comingSoon = document.querySelector('.ev-coming-soon');
      if (comingSoon) comingSoon.style.display = query ? 'none' : '';

      /* If there's a dynamic grid, render Supabase results there too */
      const grid = document.getElementById('eventsGrid');
      if (grid) {
        const events = query ? EventsData.search(query) : EventsData.getAll();
        grid.innerHTML = '';
        events.forEach(event => grid.appendChild(createEventCard(event)));
      }
    }

    function clearSearch() {
      if (searchInput) searchInput.value = '';
      document.querySelectorAll('.ev-feature-card').forEach(c => c.style.display = '');
      const comingSoon = document.querySelector('.ev-coming-soon');
      if (comingSoon) comingSoon.style.display = '';
      const grid = document.getElementById('eventsGrid');
      if (grid) {
        grid.innerHTML = '';
        EventsData.getAll().forEach(event => grid.appendChild(createEventCard(event)));
      }
    }

    searchBtn?.addEventListener('click', doSearch);
    searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    clearBtn?.addEventListener('click', clearSearch);
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
            <span>${Utils.formatDate(event.date)}${event.time ? ' · ' + Utils.formatTime(event.time) : ''}</span>
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
