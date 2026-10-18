/* ================================================
   TicketsSA: the buyer's ticket (ticket.html?id=TKT-…)

   One page for the whole life of a booking:
     reserved   → how to pay the organiser + upload proof of payment
     confirmed  → the QR ticket to show at the entrance
     checked_in → used
     expired / cancelled → what to do next
   TicketsSA never handles the money; the organiser confirms payment.
   ================================================ */

/* global Utils, Auth, SupabaseAPI, qrcode */

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof Auth !== 'undefined') Auth.updateNavbar();
  Utils.initMobileNav();

  const root = document.getElementById('tkRoot');
  const params = new URLSearchParams(location.search);
  const id = (params.get('id') || params.get('ticket') || '').trim();
  if (!id) return showMessage('🎟', 'No ticket selected', 'Open the link from your booking email, or find your bookings under My Tickets.');

  let ticket = null, event = null, pollTimer = null;

  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const money = v => 'R ' + Number(v || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const when = iso => new Date(iso).toLocaleString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const ticketUrl = () => `${location.origin}/ticket.html?id=${encodeURIComponent(ticket.id)}`;

  async function load() {
    try {
      ticket = await SupabaseAPI.getTicket(id);
    } catch (_) { ticket = null; }
    if (!ticket) return showMessage('🔎', 'Ticket not found', 'Check the link in your email. If you just booked, wait a moment and refresh.');
    if (!event) { try { event = await SupabaseAPI.getEvent(ticket.event.id); } catch (_) { event = null; } }
    render();
  }

  function showMessage(icon, title, body) {
    root.innerHTML = `<div class="tk-msg"><div class="tk-msg__icon">${icon}</div><h1>${esc(title)}</h1><p>${esc(body)}</p>
      <a class="btn btn-primary" href="my-tickets.html">My tickets</a></div>`;
  }

  /* ── Status banner per state ─────────────────────────────── */
  const STATES = {
    reserved:   { cls: 'amber', label: 'Reserved, waiting for payment' },
    confirmed:  { cls: 'green', label: 'Valid ticket' },
    checked_in: { cls: 'grey',  label: 'Used, checked in' },
    expired:    { cls: 'red',   label: 'Reservation expired' },
    cancelled:  { cls: 'red',   label: 'Cancelled' },
  };

  function render() {
    const t = ticket, st = STATES[t.state] || STATES.reserved;
    const dateLine = [t.event.date ? Utils.formatDate(t.event.date) : '', t.event.time ? Utils.formatTime(t.event.time) : ''].filter(Boolean).join(' · ');
    const place = [t.event.location, t.event.city].filter(Boolean).join(', ');

    root.innerHTML = `
      <article class="tk-card tk-card--${st.cls}">
        <header class="tk-head">
          ${t.event.image ? `<img class="tk-head__img" src="${esc(Utils.imgUrl(t.event.image, 900))}" alt="" onerror="this.remove()"/>` : ''}
          <div class="tk-head__shade"></div>
          <div class="tk-head__text">
            <span class="tk-pill tk-pill--${st.cls}"><i></i>${esc(st.label)}</span>
            <h1>${esc(t.event.title)}</h1>
            <p>${esc(dateLine)}${place ? ' · ' + esc(place) : ''}</p>
          </div>
        </header>

        <div class="tk-body" id="tkBody"></div>

        <div class="tk-perf" aria-hidden="true"><span></span><span></span></div>

        <dl class="tk-facts">
          <div><dt>Ticket</dt><dd>${esc(t.ticket.typeName)} × ${esc(t.ticket.quantity)}</dd></div>
          <div><dt>Total</dt><dd>${t.pricing.total > 0 ? money(t.pricing.total) : 'Free'}</dd></div>
          <div><dt>Reference</dt><dd class="tk-mono">${esc(t.id)}</dd></div>
          <div><dt>Name</dt><dd>${esc([t.buyer.firstName, t.buyer.lastName].filter(Boolean).join(' '))}</dd></div>
        </dl>
      </article>
      ${event && event.refundPolicy ? `<p class="tk-note"><strong>Cancellations &amp; refunds:</strong> ${esc(event.refundPolicy)} Set by the organiser. <a href="refunds.html">How refunds work</a></p>` : ''}
      ${(typeof Auth !== 'undefined' && !Auth.isLoggedIn()) ? `
      <div class="tk-acct">
        <div><strong>Keep all your tickets in one place</strong>
          <p>Create a free account with <b>${esc(t.buyer.email)}</b>. This booking and future ones appear under My Tickets, and you get updates about your events.</p></div>
        <button class="btn btn-primary btn-sm" type="button" id="tkSignup">Create free account</button>
      </div>` : ''}
      <p class="tk-note">TicketsSA does not take payment. Questions about this booking? Contact the organiser${event && event.organiser ? ' (' + esc(event.organiser) + ')' : ''}, or email <a href="mailto:support@ticketssa.co.za">support@ticketssa.co.za</a>.</p>`;

    document.getElementById('tkSignup')?.addEventListener('click', () => {
      Auth.openModal('signup', 'Create your free account to keep your tickets');
      setTimeout(() => {
        const f = (id, v) => { const el = document.getElementById(id); if (el && !el.value) el.value = v || ''; };
        f('signupFirst', t.buyer.firstName); f('signupLast', t.buyer.lastName); f('signupEmail', t.buyer.email);
      }, 60);
    });

    const body = document.getElementById('tkBody');
    if (t.state === 'reserved')        renderReserved(body);
    else if (t.state === 'confirmed')  renderQR(body, false);
    else if (t.state === 'checked_in') renderQR(body, true);
    else if (t.state === 'expired')    body.innerHTML = `<div class="tk-end"><h2>This reservation has expired</h2><p>It was not paid in time, so the seat was released. If you already paid, contact the organiser with your reference <strong>${esc(t.id)}</strong>.</p><a class="btn btn-secondary" href="event.html?id=${encodeURIComponent(t.event.id)}">Book again</a></div>`;
    else                               body.innerHTML = `<div class="tk-end"><h2>This booking was cancelled</h2><p>Contact the organiser if you think this is a mistake, quoting <strong>${esc(t.id)}</strong>.</p></div>`;

    // While waiting on the organiser, check every 30 seconds so the QR appears by itself.
    clearInterval(pollTimer);
    if (t.state === 'reserved') pollTimer = setInterval(async () => {
      if (document.hidden) return;
      try { const fresh = await SupabaseAPI.getTicket(id); if (fresh && fresh.state !== ticket.state) { ticket = fresh; render(); } } catch (_) {}
    }, 30000);
  }

  /* ── Reserved: pay, then upload proof ────────────────────── */
  function payBox() {
    const ev = event || {};
    if (ev.paymentType === 'link' && /^https?:\/\//i.test(ev.paymentLink || '')) {
      return `<a class="tk-paylink" href="${esc(ev.paymentLink)}" target="_blank" rel="noopener noreferrer">Pay ${ticket.pricing && ticket.pricing.total ? Utils.formatCurrency(ticket.pricing.total) : ''} by card →</a>
        <p class="tk-small">Use <strong class="tk-mono">${esc(ticket.id)}</strong> as the payment reference.</p>`;
    }
    if (ev.paymentType === 'bank' && ev.bankName) {
      return `<dl class="tk-bank">
          <dt>Bank</dt><dd>${esc(ev.bankName)}</dd>
          <dt>Account holder</dt><dd>${esc(ev.accountHolder || '')}</dd>
          <dt>Account number</dt><dd class="tk-mono">${esc(ev.accountNumber || '')} <button type="button" class="tk-copy" data-copy="${esc(ev.accountNumber || '')}">Copy</button></dd>
          ${ev.branchCode ? `<dt>Branch code</dt><dd class="tk-mono">${esc(ev.branchCode)}</dd>` : ''}
          <dt>Reference</dt><dd class="tk-mono">${esc(ticket.id)} <button type="button" class="tk-copy" data-copy="${esc(ticket.id)}">Copy</button></dd>
        </dl>`;
    }
    return `<p class="tk-small">The organiser will contact you at <strong>${esc(ticket.buyer.email)}</strong> about payment. Quote <strong class="tk-mono">${esc(ticket.id)}</strong>.</p>`;
  }

  function renderReserved(body) {
    const t = ticket;
    const left = t.expiresAt ? new Date(t.expiresAt).getTime() - Date.now() : null;
    const hrs = left != null ? Math.max(0, Math.floor(left / 3600000)) : null;
    const hold = t.expiresAt
      ? `<div class="tk-hold"><span>Seat held until</span><strong>${esc(when(t.expiresAt))}</strong><em>${hrs >= 1 ? `about ${hrs} hour${hrs === 1 ? '' : 's'} left` : 'less than an hour left'}</em></div>`
      : '';
    const proof = t.proofUrl
      ? `<div class="tk-proof tk-proof--done"><img src="${esc(Utils.imgUrl(t.proofUrl, 200))}" alt="Your proof of payment"/><div><strong>Proof of payment sent</strong><p>The organiser has been notified. Your QR ticket appears here as soon as they confirm. <button type="button" class="tk-linkbtn" id="tkReproof">Replace</button></p></div></div>`
      : `<label class="tk-proof" for="tkProofFile">
           <span class="tk-proof__icon">⬆</span>
           <span><strong>Upload proof of payment</strong><small>Optional. A photo or screenshot of your payment slip helps the organiser confirm faster.</small></span>
         </label>`;

    body.innerHTML = `
      ${hold}
      <ol class="tk-steps">
        <li class="is-on"><span>1</span><div><strong>Pay the organiser</strong>${payBox()}</div></li>
        <li class="${t.proofUrl ? 'is-on' : ''}"><span>2</span><div><strong>Send proof (optional)</strong>${proof}
          <input type="file" id="tkProofFile" accept="image/jpeg,image/png,image/webp" hidden/>
          <div class="tk-progress" id="tkProg" hidden><i></i></div></div></li>
        <li><span>3</span><div><strong>Get your QR ticket</strong><p class="tk-small">When the organiser confirms your payment, your ticket appears on this page and in your email.</p></div></li>
      </ol>`;

    body.querySelectorAll('.tk-copy').forEach(b => b.addEventListener('click', () => {
      navigator.clipboard?.writeText(b.dataset.copy).then(() => Utils.showToast('Copied', 'success', 1800)).catch(() => {});
    }));
    const input = document.getElementById('tkProofFile');
    document.getElementById('tkReproof')?.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const prog = document.getElementById('tkProg');
      prog.hidden = false;
      try {
        const url = await SupabaseAPI.uploadTicketProof(ticket.id, file);
        ticket.proofUrl = url; ticket.proofUploadedAt = new Date().toISOString();
        Utils.showToast('Proof of payment sent to the organiser.', 'success');
        render();
      } catch (err) {
        prog.hidden = true;
        Utils.showToast(err.message || 'Upload failed. Please try again.', 'error', 6000);
      }
    });
  }

  /* ── Confirmed / used: the QR ticket ─────────────────────── */
  function renderQR(body, used) {
    let svg = '';
    try {
      const qr = qrcode(0, 'M');
      qr.addData(ticketUrl());
      qr.make();
      svg = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    } catch (_) {
      svg = `<div class="tk-qr__fallback">${esc(ticket.id)}</div>`;
    }
    body.innerHTML = `
      <div class="tk-qr ${used ? 'is-used' : ''}">
        <div class="tk-qr__code" role="img" aria-label="Ticket QR code">${svg}</div>
        <div class="tk-qr__id tk-mono">${esc(ticket.id)}</div>
        <p>${used
          ? `Checked in ${ticket.checkedInAt ? esc(when(ticket.checkedInAt)) : ''}. This ticket cannot be used again.`
          : `Show this QR code at the entrance. Admits <strong>${esc(ticket.ticket.quantity)}</strong>. Keep it private: whoever scans it first gets in.`}</p>
        ${used ? '' : `<div class="tk-actions"><button type="button" class="btn btn-secondary btn-sm" onclick="window.print()">Save / print</button></div>`}
      </div>`;
  }

  load();
});
