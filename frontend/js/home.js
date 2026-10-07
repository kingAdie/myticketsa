/* ================================================
   TicketsSA Homepage Logic v4 (home.js)
   Loads events from /api/events via EventsData.init()
   ================================================ */

document.addEventListener('DOMContentLoaded', async () => {

  Utils.initMobileNav();
  initSearch();

  /* ── Load events from Supabase (for dynamic grid if present) ─────── */
  await EventsData.init();
  renderLiveEvents();
  renderHeroSpots();

  /* Published events (approved by an admin) appear ahead of the "list your own" tile. */
  function renderLiveEvents() {
    const grid = document.querySelector('.ev-grid');
    if (!grid) return;
    const cta = grid.querySelector('.ev-empty-cta');
    EventsData.getAll().slice(0, 6).forEach(ev => grid.insertBefore(createEventCard(ev), cta));
  }

  /* The events and stays an admin has switched on for the hero replace the
     default "list your lodge" card. With none chosen, the default card stays. */
  async function renderHeroSpots() {
    const card = document.getElementById('heroSpot');
    if (!card || typeof SupabaseAPI === 'undefined' || !SupabaseAPI.getHeroSpots) return;
    let spots = [];
    try { spots = await SupabaseAPI.getHeroSpots(); } catch { return; }
    if (!spots.length) return;                       // nothing chosen: keep the default card

    /* Slides: every item the admin picked, then the default "List your lodge" card.
       They swap on their own, so even a single pick keeps the hero moving. */
    const defaultSlide = card.innerHTML;
    const slideFor = s => `
      <div class="featured-event-card__bg">${s.image ? `<img class="featured-event-card__bg-img" src="${esc(s.image)}" alt="" onerror="this.remove()"/>` : ''}</div>
      <div class="featured-event-card__overlay"></div>
      <div class="featured-event-card__inner">
        <div class="featured-event-card__top">
          <span class="featured-event-badge--price">${esc(s.label)}</span>
          ${s.where ? `<span class="featured-event-region">${esc(s.where)}</span>` : ''}
        </div>
        <h2 class="featured-event-title" style="font-size:clamp(1.6rem,3vw,2.4rem);line-height:1.1;">${esc(s.title)}</h2>
        <div class="featured-event-details">
          <div class="featured-event-row"><span class="featured-event-label">Price</span><span class="featured-event-value">${esc(s.price)}</span></div>
        </div>
        <div class="featured-event-actions">
          <a href="${esc(s.href)}" class="btn btn-primary btn-lg">${s.kind === 'accommodation' ? 'View stay' : 'View event'} →</a>
        </div>
      </div>`;
    const slides = spots.map(slideFor).concat([defaultSlide]);

    card.classList.add('is-carousel');
    card.innerHTML = `
      <div class="hero-slides">${slides.map((h, i) => `<div class="hero-slide${i === 0 ? ' is-active' : ''}" aria-hidden="${i === 0 ? 'false' : 'true'}">${h}</div>`).join('')}</div>
      <div class="hero-ctrl">
        <div class="hero-dots">${slides.map((_, i) => `<button type="button" aria-label="Show slide ${i + 1}" data-i="${i}"></button>`).join('')}</div>
      </div>
      <div class="hero-progress"><i></i></div>`;

    const els  = [...card.querySelectorAll('.hero-slide')];
    const dots = [...card.querySelectorAll('.hero-dots button')];
    const bar  = card.querySelector('.hero-progress i');
    const INTERVAL = 5000;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cur = 0, timer = null, paused = false;

    function show(i) {
      els[cur].classList.remove('is-active'); els[cur].classList.add('is-leaving'); els[cur].setAttribute('aria-hidden', 'true');
      const old = els[cur]; setTimeout(() => old.classList.remove('is-leaving'), 700);
      cur = (i + els.length) % els.length;
      els[cur].classList.add('is-active'); els[cur].setAttribute('aria-hidden', 'false');
      dots.forEach((d, k) => d.classList.toggle('on', k === cur));
      restartBar();
    }
    function restartBar() {
      if (!bar) return;
      bar.style.animation = 'none'; void bar.offsetWidth;
      if (!reduce && !paused) bar.style.animation = `heroBar ${INTERVAL}ms linear forwards`;
    }
    function schedule() {
      clearInterval(timer);
      if (reduce || els.length < 2) return;
      timer = setInterval(() => { if (!paused && !document.hidden) show(cur + 1); }, INTERVAL);
    }
    dots.forEach(d => d.addEventListener('click', () => { show(+d.dataset.i); schedule(); }));
    card.addEventListener('mouseenter', () => { paused = true; bar.style.animationPlayState = 'paused'; });
    card.addEventListener('mouseleave', () => { paused = false; restartBar(); schedule(); });
    card.addEventListener('focusin',  () => { paused = true; });
    card.addEventListener('focusout', () => { paused = false; });
    // touch: swipe left/right
    let x0 = null;
    card.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    card.addEventListener('touchend', e => {
      if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) { show(cur + (dx < 0 ? 1 : -1)); schedule(); }
    }, { passive: true });

    dots[0].classList.add('on'); restartBar(); schedule();
  }

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

  function esc(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function createEventCard(event) {
    const card = document.createElement('article');
    card.className = 'event-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', event.title);

    card.innerHTML = `
      <div class="event-card__img-wrap">
        <img class="event-card__img" src="${esc(event.image || '')}" alt="${esc(event.title)}" loading="lazy"
          onerror="this.src='https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&q=80'"/>
        <div class="event-card__img-overlay"></div>
        ${event.featured ? '<span class="event-card__badge badge badge-green">Featured</span>' : ''}
      </div>
      <div class="event-card__body">
        <div class="event-card__cat">${esc(event.category)}</div>
        <h3 class="event-card__title">${esc(event.title)}</h3>
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
            <span>${esc([event.location, event.city].filter(Boolean).join(', '))}</span>
          </div>
        </div>
        <div class="event-card__foot">
          <div class="event-card__price">
            ${Utils.formatCurrency(event.price)}
            <span class="event-card__price-note">from per ticket</span>
          </div>
          <button class="btn btn-primary btn-sm" data-event-id="${esc(event.id)}" aria-label="View ${esc(event.title)}">
            View Event
          </button>
        </div>
      </div>`;

    card.querySelector('.btn').addEventListener('click', e => {
      e.stopPropagation();
      window.location.href = `event.html?id=${encodeURIComponent(event.id)}`;
    });
    card.addEventListener('click', () => window.location.href = `event.html?id=${encodeURIComponent(event.id)}`);
    return card;
  }

});
