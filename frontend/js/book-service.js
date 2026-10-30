/* ================================================
   Book a service (book-service.html, /b/<slug>)
   Package → date (from the provider's open dates)
   → guests → details → request. Nothing is paid
   here: the provider accepts first.
   ================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  Utils.initMobileNav();
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const money = n => Utils.formatCurrency(n);
  const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  let sv = null, pkg = null, date = null, guests = 1, taken = {}, calMonth = null;


  function link() { return sv.slug ? `${location.origin}/b/${encodeURIComponent(sv.slug)}` : `${location.origin}/book-service.html?id=${encodeURIComponent(sv.id)}`; }

  function render() {
    document.title = `${sv.title} · TicketsSA`;
    const poster = $('epPoster'), img = $('posterImg'), bg = $('posterBg');
    if (sv.image) {
      const src = Utils.imgUrl(sv.image, 1200);
      img.onload = () => { const r = img.naturalWidth / img.naturalHeight; if (r) poster.style.aspectRatio = String(Math.min(16 / 9, Math.max(4 / 5, r))); poster.classList.add('is-ready'); };
      img.onerror = () => { poster.classList.add('is-ready'); img.remove(); bg.remove(); };
      img.src = src; bg.src = src; img.alt = sv.title;
    } else {
      poster.classList.add('is-ready'); img.remove(); bg.remove();
      poster.insertAdjacentHTML('beforeend', '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:4rem;background:linear-gradient(135deg,#14532d,#0b0b0b)">🧑‍🍳</div>');
    }
    $('svCat').textContent = sv.category || 'Service';
    $('svTitle').textContent = sv.title;
    $('svOwner').textContent = sv.organiser || 'The provider';
    $('svCity').textContent = [sv.city, sv.province].filter(Boolean).join(', ') || 'South Africa';
    $('svArea').textContent = sv.serviceArea ? 'Travels to: ' + sv.serviceArea : '';
    const d = $('svDesc'); d.textContent = sv.description || '';
    if ((sv.description || '').length > 420) {
      d.classList.add('is-clamped'); $('descMore').hidden = false;
      $('descMore').onclick = () => { const c = d.classList.toggle('is-clamped'); $('descMore').textContent = c ? 'Read more' : 'Show less'; };
    }
    if (sv.refundPolicy) { $('svRefund').textContent = sv.refundPolicy; $('refundSection').hidden = false; }

    renderPackages();
    if (sv.packages.length === 1) pick(sv.packages[0]);
    renderCal();
    const u = Auth.getUser && Auth.getUser();
    if (u) { if (u.firstName) $('rqFirst').value = u.firstName; if (u.lastName) $('rqLast').value = u.lastName; if (u.email) $('rqEmail').value = u.email; }
    update();
  }

  /* ── Packages ── */
  const priceLine = p => p.price === null ? 'On quote' : `${money(p.price)}${p.unit === 'guest' ? ' per guest' : ''}`;
  const range = p => `${p.minGuests || 1}${p.maxGuests ? '–' + p.maxGuests : '+'} guests`;
  function renderPackages() {
    $('pkgList').innerHTML = sv.packages.map((p, i) => `
      <div class="tt sv-pkg${pkg === p ? ' is-on' : ''}" role="radio" tabindex="0" aria-checked="${pkg === p}" data-i="${i}">
        <div class="tt__row">
          <span class="tt__radio" aria-hidden="true"></span>
          <span class="tt__main"><span class="tt__name">${esc(p.name)}</span>
            <span class="tt__desc">${[p.description ? esc(p.description) : '', range(p)].filter(Boolean).join(' · ')}</span></span>
          <span class="tt__price">${esc(priceLine(p))}</span>
        </div>
      </div>`).join('') || '<p class="ep-small">No packages yet.</p>';
    $('pkgList').querySelectorAll('.sv-pkg').forEach(el => {
      const go = () => pick(sv.packages[+el.dataset.i]);
      el.addEventListener('click', go);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }
  function pick(p) {
    pkg = p;
    guests = Math.max(guests, p.minGuests || 1);
    if (p.maxGuests) guests = Math.min(guests, p.maxGuests);
    renderPackages(); update();
  }

  /* ── Calendar: only the provider's open dates, full days greyed out ── */
  const todayIso = isoDay(new Date());
  const openDates = () => sv.openDates.filter(d => d >= todayIso);
  const left = d => Math.max(0, (sv.slotsPerDay || 1) - (taken[d] || 0));
  function renderCal() {
    const open = openDates();
    if (!open.length) { $('svCal').innerHTML = '<p class="ep-small">No open dates right now. Check back soon, or contact the provider.</p>'; return; }
    calMonth = calMonth || (date || open.find(d => left(d) > 0) || open[0]).slice(0, 7);
    const months = [...new Set(open.map(d => d.slice(0, 7)))];
    const [Y, M] = calMonth.split('-').map(Number);
    const first = new Date(Y, M - 1, 1), days = new Date(Y, M, 0).getDate(), lead = (first.getDay() + 6) % 7;
    const set = new Set(open);
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const iso = `${calMonth}-${String(d).padStart(2, '0')}`;
      const isOpen = set.has(iso), full = isOpen && left(iso) === 0;
      cells += `<button type="button" class="sv-day${isOpen ? (full ? ' is-full' : ' is-open') : ''}${date === iso ? ' is-on' : ''}" data-iso="${iso}" ${isOpen && !full ? '' : 'disabled'}
        aria-label="${iso}${full ? ', fully booked' : isOpen ? ', available' : ''}">${d}</button>`;
    }
    const ix = months.indexOf(calMonth);
    $('svCal').innerHTML = `
      <div class="sv-cal__head">
        <button type="button" class="sv-cal__nav" data-dir="-1" ${ix <= 0 ? 'disabled' : ''} aria-label="Earlier month">‹</button>
        <b>${first.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</b>
        <button type="button" class="sv-cal__nav" data-dir="1" ${ix < 0 || ix >= months.length - 1 ? 'disabled' : ''} aria-label="Later month">›</button>
      </div>
      <div class="sv-cal__week"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div>
      <div class="sv-cal__grid">${cells}</div>
      <div class="sv-cal__key"><span><i class="k-open"></i>Available</span><span><i class="k-full"></i>Fully booked</span></div>
      ${date ? `<p class="sv-cal__picked">✓ ${new Date(date + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}</p>` : ''}`;
    $('svCal').querySelectorAll('.sv-day.is-open').forEach(b => b.addEventListener('click', () => { date = b.dataset.iso; renderCal(); update(); }));
    $('svCal').querySelectorAll('.sv-cal__nav').forEach(b => b.addEventListener('click', () => {
      const ni = months.indexOf(calMonth) + Number(b.dataset.dir);
      if (months[ni]) { calMonth = months[ni]; renderCal(); }
    }));
  }

  /* ── Guests + estimate + phone bar ── */
  $('gMinus').onclick = () => { guests = Math.max((pkg && pkg.minGuests) || 1, guests - 1); update(); };
  $('gPlus').onclick  = () => { guests = Math.min((pkg && pkg.maxGuests) || 500, guests + 1); update(); };
  function estimate() {
    if (!pkg || pkg.price === null) return null;
    return pkg.unit === 'guest' ? pkg.price * guests : pkg.price;
  }
  function update() {
    $('gOut').textContent = guests;
    $('gMinus').disabled = !pkg || guests <= (pkg.minGuests || 1);
    $('gPlus').disabled  = !pkg || guests >= (pkg.maxGuests || 500);
    $('gHint').textContent = pkg ? `Guests (${range(pkg)})` : 'Guests';
    const est = estimate();
    $('svEstimate').hidden = !pkg;
    if (pkg) {
      $('svEstLine').textContent = pkg.price === null ? 'Price' : pkg.unit === 'guest' ? `${guests} × ${money(pkg.price)}` : 'Package price';
      $('svEstTotal').textContent = est === null ? 'On quote' : money(est);
    }
    const priced = sv.packages.filter(p => p.price !== null).map(p => p.price);
    if (pkg && date) { $('barPrice').textContent = est === null ? 'On quote' : money(est); $('barSub').textContent = `${pkg.name} · ${date}`; $('barBtn').textContent = 'Send request'; }
    else if (pkg) { $('barPrice').textContent = priceLine(pkg); $('barSub').textContent = pkg.name; $('barBtn').textContent = 'Pick a date'; }
    else { $('barPrice').textContent = priced.length ? 'From ' + money(Math.min(...priced)) : 'On quote'; $('barSub').textContent = 'Book by date'; $('barBtn').textContent = 'Choose a package'; }
  }
  $('barBtn').addEventListener('click', () => {
    if (!pkg) return $('pkgList').scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!date) return $('stepDate').scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!$('rqFirst').value.trim() || !$('rqEmail').value.trim()) { $('stepWho').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    $('reqForm').requestSubmit();
  });
  $('shareBtn').addEventListener('click', () => Utils.shareLink(link(), sv.title + ' | TicketsSA'));

  /* ── Send the request ── */
  $('reqForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = msg => { $('rqErr').textContent = msg; $('rqErr').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    $('rqErr').textContent = '';
    const first = $('rqFirst').value.trim(), email = $('rqEmail').value.trim();
    if (!pkg) return err('Choose a package first.');
    if (!date) return err('Pick a date.');
    if (!first) return err('Add your first name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('Add a valid email so the provider can reply.');
    const btn = $('rqBtn'); btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await SupabaseAPI.requestService({
        serviceId: sv.id, packageId: pkg.id, date, guests,
        name: `${first} ${$('rqLast').value.trim()}`.trim(), email, phone: $('rqPhone').value.trim(), note: $('rqNote').value.trim(),
      });
      SupabaseAPI.notifyBooking('service_request', r.id);
      window.location.href = `booking.html?id=${encodeURIComponent(r.id)}`;
    } catch (x) {
      btn.disabled = false; btn.textContent = 'Send booking request';
      if (/just booked|not available/i.test(x.message || '')) { taken = await SupabaseAPI.getServiceTaken(sv.id); date = null; renderCal(); update(); }
      err(x.message || 'Could not send your request. Please try again.');
    }
  });

  // Load last, once every helper above exists.
  async function boot() {
    const m = location.pathname.match(/^\/b\/([^/?#]+)/);
    const qid = Utils.getParam('id');
    const key = qid || (m ? decodeURIComponent(m[1]) : '');
    if (!key) return showError('This link is missing the service.');
    try { sv = qid ? await SupabaseAPI.getEvent(key) : await SupabaseAPI.getEventBySlug(key); } catch (_) { return showError('Could not load this service. Please check your connection.'); }
    if (!sv || sv.kind !== 'service') return showError('We could not find this service. It may have been removed.');
    taken = await SupabaseAPI.getServiceTaken(sv.id);
    render();
  }
  boot();

  function showError(msg) {
    $('buybar')?.remove();
    const main = $('epMain'); main.style.display = 'block';
    main.innerHTML = `<div style="text-align:center;padding:80px 16px;max-width:460px;margin:0 auto"><div style="font-size:3rem;margin-bottom:12px">🧑‍🍳</div><h2 style="margin-bottom:10px">Service not found</h2><p style="margin-bottom:24px;color:var(--text-2)">${esc(msg)}</p><a href="book.html" class="btn btn-primary">See all services</a></div>`;
  }
});
