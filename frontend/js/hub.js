/* ================================================
   TicketsSA Seller Hub (dashboard.html)

   Four simple jobs, one tab each:
     Share     → send your listing link to people
     Bookings  → who booked, their proof of payment, mark as paid
     Scan      → check people in at the door
     Listings  → everything you listed, with edit / delete
   ================================================ */

/* global Utils, Auth, SupabaseAPI, WizardCore */

document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.isLoggedIn()) { window.location.replace('index.html'); return; }
  Auth.updateNavbar();
  Utils.initMobileNav();

  const user = Auth.getUser() || {};
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const money = n => 'R' + Number(n || 0).toLocaleString('en-ZA', { maximumFractionDigits: 0 });
  const ago = iso => {
    if (!iso) return '';
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return Math.max(1, m) + ' min ago';
    if (m < 1440) return Math.round(m / 60) + ' hr ago';
    const d = Math.round(m / 1440);
    return d < 31 ? d + ' day' + (d > 1 ? 's' : '') + ' ago' : new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  };
  const thumb = img => img
    ? `<div class="hub-thumb"><img src="${esc(Utils.imgUrl(img, 200))}" alt="" loading="lazy" onerror="this.remove()"/></div>`
    : '<div class="hub-thumb hub-thumb--empty">🎟</div>';
  const STATUS = { pending: 'In review', published: 'Live', rejected: 'Needs changes' };

  const hr = new Date().getHours();
  $('hubHello').textContent = (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + (user.firstName ? ', ' + user.firstName : '');
  $('hubEmail').textContent = user.email || '';

  const HUB = { events: [], accs: [], others: [], sales: [], enquiries: [], drafts: [] };
  const isPaid = t => t.state === 'confirmed' || t.state === 'checked_in';

  /* ── Tabs ─────────────────────────────────────────────── */
  const ALIAS = { overview: 'share', listings: 'listings', orders: 'orders', earnings: 'orders', scan: 'scan', share: 'share' };
  function showTab(name) {
    name = ALIAS[name] || 'share';
    document.querySelectorAll('.hub-tab').forEach(b => { const on = b.dataset.tab === name; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); });
    document.querySelectorAll('.hub-panel').forEach(p => { p.hidden = p.id !== 'tab-' + name; });
    const u = new URL(location.href); u.searchParams.set('tab', name); history.replaceState(null, '', u);
  }
  document.querySelectorAll('.hub-tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  showTab(new URLSearchParams(location.search).get('tab') || 'share');

  /* ── Load once ────────────────────────────────────────── */
  (async function load() {
    const r = await Promise.allSettled([
      SupabaseAPI.getEvents({ organiserId: user.id }),
      SupabaseAPI.getMyAccommodations(),
      SupabaseAPI.getSalesForMyEvents(),
      SupabaseAPI.getMySellerListings(),
    ]);
    HUB.events = r[0].status === 'fulfilled' ? r[0].value || [] : [];
    HUB.accs   = r[1].status === 'fulfilled' ? r[1].value || [] : [];
    HUB.sales  = r[2].status === 'fulfilled' ? r[2].value || [] : [];
    HUB.others = r[3].status === 'fulfilled' ? r[3].value || [] : [];
    try { HUB.enquiries = await SupabaseAPI.getEnquiriesForMyStays(HUB.accs.map(a => a.id)); } catch (_) { HUB.enquiries = []; }
    try { HUB.drafts = typeof WizardCore !== 'undefined' ? WizardCore.listDrafts() : []; } catch (_) { HUB.drafts = []; }
    renderAll();
  })();

  function renderAll() {
    renderShare(); renderOrders(); renderScan(); renderListings();
    const waiting = HUB.sales.filter(t => t.state === 'reserved').length;
    const c = $('cntOrders'); c.textContent = waiting; c.hidden = !waiting;
  }

  const emptyState = (icon, title, body, action) => `
    <div class="hub-empty"><div class="hub-empty__icon">${icon}</div><h3>${title}</h3><p>${body}</p>${action || ''}</div>`;

  /* ══ SHARE ═══════════════════════════════════════════════ */
  function renderShare() {
    const live = [
      ...HUB.events.filter(e => e.status === 'published').map(e => ({ title: e.title, img: e.image, url: Utils.eventLink(e), meta: [e.date ? Utils.formatDate(e.date) : '', e.city].filter(Boolean).join(' · '), sold: soldFor(e.id) })),
      ...HUB.accs.filter(a => a.status === 'published').map(a => ({ title: a.name, img: (a.images || [])[0], url: Utils.stayLink(a), meta: [a.city, a.province].filter(Boolean).join(', ') })),
    ];
    const waiting = [...HUB.events, ...HUB.accs].filter(x => x.status !== 'published');

    if (!live.length && !waiting.length) {
      $('shareBody').innerHTML = emptyState('🚀', 'Nothing to share yet', 'List your event or place. Once our team approves it, your link appears here, ready to send.',
        '<a class="btn btn-primary" href="sell.html">+ List something</a>');
      return;
    }
    $('shareBody').innerHTML =
      (live.length ? live.map(x => `
        <article class="hub-card share">
          ${thumb(x.img)}
          <div class="share__main">
            <h3>${esc(x.title)}</h3>
            <p class="hub-meta">${esc(x.meta)}${x.sold ? ` · <b>${x.sold}</b> paid ticket${x.sold > 1 ? 's' : ''}` : ''}</p>
            <div class="share__link"><input value="${esc(x.url)}" readonly aria-label="Link to share"/></div>
            <div class="share__acts">
              <button class="btn btn-primary btn-sm" data-copy="${esc(x.url)}">Copy link</button>
              <a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(x.title + ' – get your tickets here: ' + x.url)}">WhatsApp</a>
              <button class="btn btn-ghost btn-sm" data-share="${esc(x.url)}" data-share-title="${esc(x.title)}">More…</button>
            </div>
          </div>
        </article>`).join('') : emptyState('⏳', 'Your listing is in review', 'Our team checks new listings within 24 hours. Your share link appears here as soon as it is live.'))
      + (waiting.length ? `<div class="hub-sub">Not live yet</div>` + waiting.map(x => `
        <div class="hub-row hub-row--quiet">${thumb(x.image || (x.images || [])[0])}
          <div class="hub-row__main"><b>${esc(x.title || x.name)}</b><span class="hub-meta">${x.status === 'rejected' ? 'Needs changes: ' + esc(x.reviewNote || 'see your email') : 'In review. Usually within 24 hours.'}</span></div>
          <span class="hub-pill hub-pill--${x.status === 'rejected' ? 'red' : 'amber'}">${STATUS[x.status] || 'In review'}</span></div>`).join('') : '');
  }
  const soldFor = id => HUB.sales.filter(t => t.event.id === id && isPaid(t)).reduce((n, t) => n + (Number(t.ticket.quantity) || 0), 0);

  document.addEventListener('click', async ev => {
    const c = ev.target.closest && ev.target.closest('[data-copy]');
    if (c) {
      try { await navigator.clipboard.writeText(c.dataset.copy); c.textContent = 'Copied ✓'; setTimeout(() => { c.textContent = 'Copy link'; }, 1600); }
      catch (_) { const inp = c.closest('.share__main')?.querySelector('input'); inp?.select(); Utils.showToast('Press Ctrl+C (or Cmd+C) to copy.', 'info'); }
      return;
    }
    const s = ev.target.closest && ev.target.closest('[data-share]');
    if (s) Utils.shareLink(s.dataset.share, s.dataset.shareTitle);
  });
  document.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('.share__link input')) e.target.select(); });

  /* ══ BOOKINGS ════════════════════════════════════════════ */
  let ordFilter = 'reserved', ordEvent = 'all';
  const LABEL = { reserved: 'Awaiting payment', confirmed: 'Paid', checked_in: 'Checked in', expired: 'Expired', cancelled: 'Cancelled' };

  function renderOrders() {
    const host = $('ordersBody');
    if (!HUB.sales.length && !HUB.enquiries.length) {
      host.innerHTML = emptyState('🎟', 'No bookings yet', 'When someone reserves a ticket or sends a booking enquiry, they show up here with their proof of payment.',
        '<button class="btn btn-secondary" data-goto="share">Share your link</button>');
      return;
    }
    const pool = HUB.sales.filter(t => ordEvent === 'all' || t.event.id === ordEvent);
    const n = st => pool.filter(t => st === 'all' || t.state === st || (st === 'ended' && (t.state === 'expired' || t.state === 'cancelled'))).length;
    const list = pool.filter(t => ordFilter === 'all' || t.state === ordFilter || (ordFilter === 'ended' && (t.state === 'expired' || t.state === 'cancelled')));
    const evs = HUB.events.filter(e => HUB.sales.some(t => t.event.id === e.id));

    host.innerHTML = (HUB.sales.length ? `
      <div class="hub-bar">
        <div class="hub-chips">${[['reserved', 'Awaiting payment'], ['confirmed', 'Paid'], ['checked_in', 'Checked in'], ['ended', 'Expired / cancelled'], ['all', 'All']].map(c =>
          `<button class="hub-chip${ordFilter === c[0] ? ' is-on' : ''}" data-f="${c[0]}">${c[1]} <span>${n(c[0])}</span></button>`).join('')}</div>
        ${evs.length > 1 ? `<select class="hub-select" id="ordEvent" aria-label="Event"><option value="all">All events</option>${evs.map(e => `<option value="${esc(e.id)}"${ordEvent === e.id ? ' selected' : ''}>${esc(e.title)}</option>`).join('')}</select>` : ''}
      </div>
      ${list.length ? list.map(orderRow).join('') : '<p class="hub-none">Nothing in this group right now.</p>'}` : '')
      + (HUB.enquiries.length ? `<div class="hub-sub">Stay enquiries</div>` + HUB.enquiries.map(b => `
        <div class="hub-row">
          <div class="hub-row__main"><b>${esc(b.customer_name)}</b>
            <span class="hub-meta">${esc([b.accommodation_name, b.space_type_name].filter(Boolean).join(' · '))} · ${esc(b.check_in_date)} → ${esc(b.check_out_date)} · ${esc(b.guests)} guest${b.guests > 1 ? 's' : ''} · <b>${money(b.total_price)}</b></span>
            <span class="hub-meta"><a href="mailto:${esc(b.customer_email)}">${esc(b.customer_email)}</a>${b.customer_phone ? ' · <a href="tel:' + esc(b.customer_phone) + '">' + esc(b.customer_phone) + '</a>' : ''} · ${ago(b.created_at)}</span></div>
          <a class="btn btn-secondary btn-sm" href="mailto:${esc(b.customer_email)}?subject=${encodeURIComponent('Your booking at ' + (b.accommodation_name || ''))}">Reply</a>
        </div>`).join('') : '');

    host.querySelectorAll('.hub-chip').forEach(b => b.addEventListener('click', () => { ordFilter = b.dataset.f; renderOrders(); }));
    $('ordEvent')?.addEventListener('change', e => { ordEvent = e.target.value; renderOrders(); });
    host.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => orderAction(b, b.dataset.id, b.dataset.act)));
  }

  function orderRow(t) {
    const st = t.state, acts = [];
    if (st === 'reserved' || st === 'expired') acts.push(`<button class="btn btn-primary btn-sm" data-act="confirmed" data-id="${esc(t.id)}">✓ Mark as paid</button>`);
    if (st === 'reserved' || st === 'expired' || st === 'confirmed') acts.push(`<button class="btn btn-ghost btn-sm hub-danger" data-act="cancelled" data-id="${esc(t.id)}">Cancel</button>`);
    if (st === 'checked_in') acts.push(`<button class="btn btn-ghost btn-sm" data-act="confirmed" data-id="${esc(t.id)}">Undo check-in</button>`);
    return `<div class="hub-row bk--${st}">
      <div class="hub-row__main">
        <div class="hub-row__top"><b>${esc([t.buyer.firstName, t.buyer.lastName].filter(Boolean).join(' '))}</b><span class="hub-pill hub-pill--${st}">${LABEL[st] || st}</span></div>
        <span class="hub-meta">${esc(t.event.title)} · ${esc(t.ticket.quantity)} × ${esc(t.ticket.typeName)} · <b>${money(t.pricing.total)}</b></span>
        <span class="hub-meta">Ref <code>${esc(t.id)}</code> · ${ago(t.bookedAt)}${st === 'reserved' && t.expiresAt ? ' · held until ' + esc(new Date(t.expiresAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : ''}</span>
        <span class="hub-meta"><a href="mailto:${esc(t.buyer.email)}">${esc(t.buyer.email)}</a>${t.buyer.phone ? ' · <a href="tel:' + esc(t.buyer.phone) + '">' + esc(t.buyer.phone) + '</a>' : ''}</span>
      </div>
      <div class="hub-row__side">
        ${t.proofUrl ? `<a class="hub-proof" href="${esc(t.proofUrl)}" target="_blank" rel="noopener"><img src="${esc(Utils.imgUrl(t.proofUrl, 160))}" alt=""/>Proof of payment</a>` : (st === 'reserved' ? '<span class="hub-meta">No proof yet</span>' : '')}
        <div class="hub-acts">${acts.join('')}</div>
      </div>
    </div>`;
  }

  async function orderAction(btn, id, to) {
    const t = HUB.sales.find(x => x.id === id);
    if (!t) return;
    const undo = to === 'confirmed' && t.state === 'checked_in';
    const ask = undo ? `Undo the check-in for ${id}?`
      : to === 'confirmed' ? `Mark ${id} as paid?\n\nOnly do this once the money is in your account. The buyer gets their QR ticket by email.`
      : `Cancel booking ${id}? The ticket stops working.`;
    if (!confirm(ask)) return;
    btn.disabled = true;
    try {
      await SupabaseAPI.setTicketStatus(id, to);
      const fresh = await SupabaseAPI.getTicket(id);
      HUB.sales = HUB.sales.map(x => x.id === id ? fresh : x);
      Utils.showToast(undo ? 'Check-in undone.' : to === 'confirmed' ? 'Marked as paid. The ticket was sent to the buyer.' : 'Booking cancelled.', 'success');
      renderAll();
    } catch (err) {
      btn.disabled = false;
      Utils.showToast((err && err.message) || 'Could not update this booking.', 'error');
    }
  }

  /* ══ SCAN ════════════════════════════════════════════════ */
  function renderScan() {
    const today = new Date().toISOString().slice(0, 10);
    const evs = HUB.events.filter(e => e.status === 'published')
      .sort((a, b) => ((a.date || '') < today) - ((b.date || '') < today) || String(a.date || '').localeCompare(String(b.date || '')));
    if (!evs.length) {
      $('scanBody').innerHTML = emptyState('📷', 'No live events', 'Once you have a live event, you can scan its tickets at the door from here.');
      return;
    }
    $('scanBody').innerHTML = evs.map(e => {
      const mine = HUB.sales.filter(t => t.event.id === e.id);
      const q = l => l.reduce((n, t) => n + (Number(t.ticket.quantity) || 0), 0);
      const inside = q(mine.filter(t => t.state === 'checked_in')), paid = q(mine.filter(isPaid));
      const past = (e.date || '') < today;
      return `<article class="hub-card scanc${past ? ' is-past' : ''}">
        ${thumb(e.image)}
        <div class="scanc__main"><h3>${esc(e.title)}</h3><p class="hub-meta">${esc([e.date ? Utils.formatDate(e.date) : '', e.city].filter(Boolean).join(' · '))}${past ? ' · past event' : ''}</p>
          <div class="scanc__bar" aria-label="${inside} of ${paid} checked in"><i style="width:${paid ? Math.round(inside / paid * 100) : 0}%"></i></div>
          <p class="hub-meta"><b>${inside}</b> of <b>${paid}</b> paid tickets checked in</p></div>
        <a class="btn btn-primary" href="scan.html?event=${encodeURIComponent(e.id)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
          Start scanning</a>
      </article>`;
    }).join('');
  }

  /* ══ LISTINGS ════════════════════════════════════════════ */
  let lstFilter = 'all';
  const META = {
    event: { name: 'Events', edit: id => `sell-event.html?edit=${encodeURIComponent(id)}` },
    accommodation: { name: 'Stays' }, experience: { name: 'Experiences' },
    equipment: { name: 'Equipment' }, merchandise: { name: 'Merch' }, draft: { name: 'Drafts' },
  };
  const DRAFT_HREF = { event: 'sell-event.html', accommodation: 'sell-accommodation.html', experience: 'sell-experience.html', equipment: 'sell-equipment.html', merchandise: 'sell-merchandise.html' };

  function renderListings() {
    const rows = [];
    HUB.drafts.forEach(d => rows.push({ kind: 'draft', title: d.titleGuess || 'Untitled draft', meta: `${d.percent || 0}% done · saved ${ago(d.savedAt)}`, status: 'Draft', pill: 'grey',
      acts: `<a class="btn btn-primary btn-sm" href="${DRAFT_HREF[d.category] || 'sell.html'}">Continue</a>` }));
    HUB.events.forEach(e => {
      const exp = e.category === 'Travel & Tours';
      rows.push({ kind: exp ? 'experience' : 'event', id: e.id, img: e.image, title: e.title, note: e.status === 'rejected' ? e.reviewNote : '',
        meta: [e.date ? Utils.formatDate(e.date) : '', [e.location, e.city].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
        status: STATUS[e.status] || 'In review', pill: e.status === 'published' ? 'green' : e.status === 'rejected' ? 'red' : 'amber',
        acts: `<a class="btn btn-secondary btn-sm" href="event.html?id=${encodeURIComponent(e.id)}">View</a>
               <a class="btn btn-secondary btn-sm" href="${exp ? 'sell-experience.html' : 'sell-event.html'}?edit=${encodeURIComponent(e.id)}">Edit</a>
               <button class="btn btn-ghost btn-sm hub-danger" data-del="event" data-id="${esc(e.id)}" data-title="${esc(e.title)}">Delete</button>` });
    });
    HUB.accs.forEach(a => rows.push({ kind: 'accommodation', img: (a.images || [])[0], title: a.name, note: a.status === 'rejected' ? a.reviewNote : '',
      meta: [a.city, a.province].filter(Boolean).join(', ') + (a.priceFrom ? ' · from ' + money(a.priceFrom) + ' a night' : ''),
      status: STATUS[a.status] || 'In review', pill: a.status === 'published' ? 'green' : a.status === 'rejected' ? 'red' : 'amber',
      acts: `<a class="btn btn-secondary btn-sm" href="accommodation.html?id=${encodeURIComponent(a.id)}">View</a>
             <button class="btn btn-ghost btn-sm hub-danger" data-del="stay" data-id="${esc(a.id)}" data-title="${esc(a.name)}">Delete</button>` }));
    HUB.others.forEach(l => rows.push({ kind: l.category === 'merchandise' ? 'merchandise' : 'equipment', img: (l.images || [])[0], title: l.title, note: l.status === 'rejected' ? l.reviewNote : '',
      meta: 'Submitted ' + ago(l.createdAt), status: STATUS[l.status] || 'In review', pill: l.status === 'published' ? 'green' : l.status === 'rejected' ? 'red' : 'amber', acts: '' }));

    if (!rows.length) {
      $('listingsBody').innerHTML = emptyState('📋', 'You have not listed anything yet', 'Events, places to stay, experiences, equipment or merch. Pick one and follow the steps.',
        '<a class="btn btn-primary" href="sell.html">+ List something</a>');
      return;
    }
    const kinds = ['draft', 'event', 'accommodation', 'experience', 'equipment', 'merchandise'].filter(k => rows.some(r => r.kind === k));
    const list = lstFilter === 'all' ? rows : rows.filter(r => r.kind === lstFilter);
    $('listingsBody').innerHTML = (kinds.length > 1 ? `<div class="hub-chips hub-chips--top">${[['all', 'All']].concat(kinds.map(k => [k, META[k].name])).map(c =>
        `<button class="hub-chip${lstFilter === c[0] ? ' is-on' : ''}" data-lf="${c[0]}">${c[1]} <span>${c[0] === 'all' ? rows.length : rows.filter(r => r.kind === c[0]).length}</span></button>`).join('')}</div>` : '')
      + list.map(r => `
      <div class="hub-row">${thumb(r.img)}
        <div class="hub-row__main">
          <div class="hub-row__top"><b>${esc(r.title)}</b><span class="hub-pill hub-pill--${r.pill}">${esc(r.status)}</span></div>
          <span class="hub-meta">${esc(r.meta)}</span>
          ${r.note ? `<span class="hub-meta hub-warn">Our team says: ${esc(r.note)}</span>` : ''}
        </div>
        ${r.acts ? `<div class="hub-acts">${r.acts}</div>` : ''}
      </div>`).join('');

    $('listingsBody').querySelectorAll('[data-lf]').forEach(b => b.addEventListener('click', () => { lstFilter = b.dataset.lf; renderListings(); }));
    $('listingsBody').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm(`Delete “${b.dataset.title}”?\n\nThis removes it from TicketsSA for good.`)) return;
      b.disabled = true;
      try {
        if (b.dataset.del === 'event') { await SupabaseAPI.deleteEvent(b.dataset.id); HUB.events = HUB.events.filter(e => e.id !== b.dataset.id); }
        else { await SupabaseAPI.adminDeleteAccommodation(b.dataset.id); HUB.accs = HUB.accs.filter(a => a.id !== b.dataset.id); }
        Utils.showToast('Deleted.', 'success'); renderAll();
      } catch (err) { b.disabled = false; Utils.showToast('Could not delete. Please try again.', 'error'); }
    }));
  }

  document.addEventListener('click', e => { const g = e.target.closest && e.target.closest('[data-goto]'); if (g) showTab(g.dataset.goto); });
});
