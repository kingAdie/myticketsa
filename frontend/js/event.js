/* ================================================
   TicketsSA event page (event.js)

   The page people land on from a shared link. One job: get them
   from "what is this?" to "I have a seat" in as few taps as possible.
   Poster → facts → pick tickets → Continue (sticky on phones).
   ================================================ */

document.addEventListener('DOMContentLoaded', async () => {

  Utils.initMobileNav();

  let currentEvent = null;
  let selected     = null;   // chosen ticket type
  let quantity     = 1;
  const MAX_QTY    = 10;
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Either event.html?id=EVT-... or the short share link /e/<slug>.
  const slugMatch = location.pathname.match(/^\/e\/([^/?#]+)/);
  const eventId = Utils.getParam('id') || (slugMatch ? decodeURIComponent(slugMatch[1]) : '');
  if (!eventId) { showError('No event specified.'); return; }

  try {
    currentEvent = slugMatch && !Utils.getParam('id')
      ? await SupabaseAPI.getEventBySlug(eventId)
      : await SupabaseAPI.getEvent(eventId);
    if (!currentEvent) { showError('We could not find this event. It may have been removed, or the link is not complete.'); return; }
  } catch (err) {
    showError('Could not load this event. Please check your connection and try again.');
    return;
  }

  window.__eventLink = Utils.eventLink(currentEvent);
  render(currentEvent);

  /* ── Page ─────────────────────────────────────────────── */
  function render(ev) {
    document.title = `${ev.title} · TicketsSA`;

    // Poster: show the organiser's own picture only. While it loads, a soft skeleton.
    const poster = $('epPoster'), img = $('bannerImage'), bg = $('posterBg');
    if (ev.image) {
      const src = Utils.imgUrl(ev.image, 1200);
      img.onload = () => {
        // Fit the frame to the picture: tall posters stay tall, wide photos stay short.
        const r = img.naturalWidth / img.naturalHeight;
        if (r) poster.style.aspectRatio = String(Math.min(16 / 9, Math.max(4 / 5, r)));
        poster.classList.add('is-ready');
      };
      img.onerror = () => { poster.classList.add('is-ready'); poster.classList.add('no-img'); img.remove(); bg.remove(); };
      img.alt = ev.title; img.src = src; bg.src = src;
    } else {
      poster.classList.add('is-ready'); img.remove(); bg.remove();
      poster.insertAdjacentHTML('beforeend', `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:4rem;background:linear-gradient(135deg,#14532d,#0b0b0b)">🎟</div>`);
    }

    $('eventCategory').textContent = ev.category === 'Travel & Tours' ? 'Experience' : (ev.category || 'Event');
    $('eventTitle').textContent    = ev.title;
    $('breadcrumbTitle').textContent = ev.title;
    $('eventDate').textContent     = ev.date ? Utils.formatDate(ev.date) : 'Date to be confirmed';
    $('eventTime').textContent     = ev.time ? `${Utils.formatTime(ev.time)}${ev.endTime && ev.endTime !== ev.time ? ' – ' + Utils.formatTime(ev.endTime) : ''}` : 'Time to be confirmed';
    $('eventLocation').textContent = ev.location || 'Venue to be confirmed';
    $('eventCity').textContent     = [ev.city, ev.province].filter(Boolean).join(', ');
    const where = [ev.address || ev.location, ev.city].filter(Boolean).join(', ');
    if (where) { const m = $('eventMap'); m.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(where); m.hidden = false; }
    $('eventOrganiser').textContent = ev.organiser || 'The organiser';

    const desc = $('eventDescription');
    desc.textContent = ev.description || 'More details coming soon.';
    if ((ev.description || '').length > 420) {
      desc.classList.add('is-clamped');
      const more = $('descMore'); more.hidden = false;
      more.onclick = () => { const open = desc.classList.toggle('is-clamped'); more.textContent = open ? 'Read more' : 'Show less'; };
    }
    (ev.tags || []).forEach(t => { const s = document.createElement('span'); s.textContent = t; $('eventTags').appendChild(s); });
    if (ev.refundPolicy) { $('eventRefund').textContent = ev.refundPolicy; $('refundSection').hidden = false; }

    const types = (ev.ticketTypes && ev.ticketTypes.length) ? ev.ticketTypes
      : [{ id: 'GA', name: 'General admission', price: ev.price, available: 100, description: '' }];
    renderTypes(types);
    // One type only? Pick it for them.
    if (types.length === 1 && Number(types[0].available) > 0) choose(types[0], document.querySelector('.tt'));
    updateBuy();
  }

  /* ── Tickets ──────────────────────────────────────────── */
  function renderTypes(types) {
    const host = $('ticketTypes');
    host.innerHTML = '';
    types.forEach(tt => {
      const left = Number(tt.available);
      const out  = !(left > 0);
      const b = document.createElement('div');
      b.className = 'tt ticket-type' + (out ? ' is-out' : '');
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false'); b.tabIndex = out ? -1 : 0;
      b.innerHTML = `
        <div class="tt__row">
          <span class="tt__radio" aria-hidden="true"></span>
          <span class="tt__main">
            <span class="tt__name">${esc(tt.name)}</span>
            ${tt.description && tt.description !== tt.name ? `<span class="tt__desc">${esc(tt.description)}</span>` : ''}
            ${out ? '<span class="tt__left">Sold out</span>' : left <= 20 ? `<span class="tt__left">Only ${left} left</span>` : ''}
          </span>
          <span class="tt__price">${esc(Utils.priceText(tt.price, currentEvent.paymentType))}</span>
        </div>
        <div class="tt__qty">
          <small>How many?</small>
          <div class="stepper">
            <button type="button" data-q="-1" aria-label="One less">−</button>
            <output aria-live="polite">1</output>
            <button type="button" data-q="1" aria-label="One more">+</button>
          </div>
        </div>`;
      if (!out) {
        b.addEventListener('click', e => {
          const step = e.target.closest('[data-q]');
          if (step) { e.stopPropagation(); bump(Number(step.dataset.q)); return; }
          if (selected !== tt) choose(tt, b);
        });
        b.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === b) { e.preventDefault(); choose(tt, b); } });
      }
      host.appendChild(b);
    });
  }

  function maxQty() { return Math.max(1, Math.min(MAX_QTY, Number(selected && selected.available) || MAX_QTY)); }

  function choose(tt, el) {
    selected = tt; quantity = 1;
    document.querySelectorAll('.tt').forEach(r => { r.classList.remove('is-on'); r.setAttribute('aria-checked', 'false'); });
    el.classList.add('is-on'); el.setAttribute('aria-checked', 'true');
    syncQty(); updateBuy();
  }

  function bump(d) {
    quantity = Math.min(maxQty(), Math.max(1, quantity + d));
    syncQty(); updateBuy();
  }

  function syncQty() {
    const on = document.querySelector('.tt.is-on');
    if (!on) return;
    on.querySelector('output').textContent = quantity;
    on.querySelector('[data-q="-1"]').disabled = quantity <= 1;
    on.querySelector('[data-q="1"]').disabled  = quantity >= maxQty();
  }

  function updateBuy() {
    const btn = $('buyTicketBtn'), barBtn = $('barBtn');
    const types = currentEvent.ticketTypes && currentEvent.ticketTypes.length ? currentEvent.ticketTypes : [{ price: currentEvent.price }];
    if (selected) {
      const total = Number(selected.price) * quantity;
      const label = total > 0 ? `Continue · ${Utils.formatCurrency(total)}` : 'Continue';
      btn.disabled = false; btn.textContent = label;
      $('barPrice').textContent = Utils.priceText(total, currentEvent.paymentType);
      $('barSub').textContent   = `${quantity} × ${selected.name}`;
      barBtn.textContent = 'Continue';
    } else {
      const min = Math.min(...types.map(t => Number(t.price) || 0));
      btn.disabled = true; btn.textContent = 'Choose a ticket';
      $('barPrice').textContent = min > 0 ? 'From ' + Utils.formatCurrency(min) : Utils.priceText(0, currentEvent.paymentType);
      $('barSub').textContent   = currentEvent.date ? Utils.formatDate(currentEvent.date) : 'Tickets';
      barBtn.textContent = 'Get tickets';
    }
  }

  // Phones: the bar either jumps to the tickets, or continues once one is picked.
  $('barBtn').addEventListener('click', () => {
    if (selected) return goCheckout();
    const list = $('ticketTypes');
    list.scrollIntoView({ behavior: 'smooth', block: 'center' });
    list.classList.add('pulse'); setTimeout(() => list.classList.remove('pulse'), 900);
  });
  $('buyTicketBtn').addEventListener('click', goCheckout);

  // Arriving from a "Buy tickets" button (#tickets): go straight to the ticket list.
  if (location.hash === '#tickets') setTimeout(() => $('ticketTypes').scrollIntoView({ block: 'center' }), 50);

  function goCheckout() {
    if (!selected || !currentEvent) return;
    const ev = currentEvent;
    Utils.setStorage('mt_selection', {
      eventId: ev.id, eventTitle: ev.title, eventDate: ev.date, eventTime: ev.time,
      eventLocation: ev.location, eventCity: ev.city, eventImage: ev.image, eventLink: window.__eventLink,
      organiser: ev.organiser || '',
      ticketTypeId: selected.id, ticketTypeName: selected.name, ticketPrice: selected.price,
      quantity, total: selected.price * quantity,
      paymentType: ev.paymentType || 'free', paymentLink: ev.paymentLink || null,
      bankName: ev.bankName || null, accountHolder: ev.accountHolder || null,
      accountNumber: ev.accountNumber || null, branchCode: ev.branchCode || null,
    });
    Utils.navigateTo('checkout.html');
  }

  function showError(message) {
    const main = document.querySelector('main');
    document.getElementById('buybar')?.remove();
    if (!main) return;
    main.style.display = 'block';
    main.innerHTML = `
      <div style="text-align:center;padding:80px 16px;max-width:460px;margin:0 auto">
        <div style="font-size:3rem;margin-bottom:12px">🎟</div>
        <h2 style="margin-bottom:10px">Event not found</h2>
        <p style="margin-bottom:24px;color:var(--text-2)">${esc(message)}</p>
        <a href="browse.html" class="btn btn-primary">See what's on</a>
      </div>`;
  }
});
