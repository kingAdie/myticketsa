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
    reserved:   { cls: 'amber', label: 'Seat reserved' },
    sent:       { cls: 'amber', label: 'Waiting for the organiser' },
    confirmed:  { cls: 'green', label: 'Valid ticket' },
    checked_in: { cls: 'grey',  label: 'Used, checked in' },
    expired:    { cls: 'red',   label: 'Reservation expired' },
    cancelled:  { cls: 'red',   label: 'Cancelled' },
  };

  function render() {
    const t = ticket, st = (t.state === 'reserved' && t.proofUrl) ? STATES.sent : (STATES[t.state] || STATES.reserved);
    const dateLine = [t.event.date ? Utils.formatDate(t.event.date) : '', t.event.time ? Utils.formatTime(t.event.time) : ''].filter(Boolean).join(' · ');
    const place = [t.event.location, t.event.city].filter(Boolean).join(', ');

    root.innerHTML = `
      <article class="tk-card tk-card--${st.cls}">
        <header class="tk-top">
          <div class="tk-top__img">${t.event.image ? `<img src="${esc(Utils.imgUrl(t.event.image, 240))}" alt="" onerror="this.remove()"/>` : '🎟'}</div>
          <div class="tk-top__text">
            <span class="tk-pill tk-pill--${st.cls}"><i></i>${esc(st.label)}</span>
            <h1>${esc(t.event.title)}</h1>
            <p>${esc(dateLine)}</p>
            ${place ? `<p>${esc(place)}</p>` : ''}
          </div>
        </header>

        <div class="tk-body" id="tkBody"></div>

        ${t.state === 'reserved' ? '' : `<div class="tk-perf" aria-hidden="true"><span></span><span></span></div>

        <dl class="tk-facts">
          <div><dt>Ticket</dt><dd>${esc(t.ticket.typeName)} × ${esc(t.ticket.quantity)}</dd></div>
          <div><dt>Total</dt><dd>${t.pricing.total > 0 ? money(t.pricing.total) : 'Free'}</dd></div>
          <div><dt>Reference</dt><dd class="tk-mono">${esc(t.id)}</dd></div>
          <div><dt>Name</dt><dd>${esc([t.buyer.firstName, t.buyer.lastName].filter(Boolean).join(' '))}</dd></div>
        </dl>`}
      </article>
      ${(typeof Auth !== 'undefined' && !Auth.isLoggedIn()) ? `
      <div class="tk-acct">
        <div><strong>Keep your tickets in one place</strong><p>Free account with ${esc(t.buyer.email)}</p></div>
        <button class="btn btn-secondary btn-sm" type="button" id="tkSignup">Create account</button>
      </div>` : ''}
      <p class="tk-note">Questions? Contact ${event && event.organiser ? esc(event.organiser) : 'the organiser'} or <a href="mailto:support@ticketssa.co.za">support@ticketssa.co.za</a>.${event && event.refundPolicy ? ` Refunds: ${esc(event.refundPolicy)}` : ''}</p>`;

    document.getElementById('tkSignup')?.addEventListener('click', () => {
      Auth.openModal('signup', 'Create your free account to keep your tickets');
      setTimeout(() => {
        const f = (id, v) => { const el = document.getElementById(id); if (el && !el.value) el.value = v || ''; };
        f('signupFirst', t.buyer.firstName); f('signupLast', t.buyer.lastName); f('signupEmail', t.buyer.email);
      }, 60);
    });

    const body = document.getElementById('tkBody');
    if (t.state === 'reserved')        (t.proofUrl ? renderSent(body) : renderReserved(body));
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
  const row = (label, value, copy) => `
    <div class="pay-row${copy ? ' pay-row--copy' : ''}"${copy ? ` data-copy="${esc(value)}" role="button" tabindex="0"` : ''}>
      <span>${label}</span><b class="${copy ? 'tk-mono' : ''}">${esc(value)}</b>${copy ? '<i>Copy</i>' : ''}
    </div>`;

  function payDetails() {
    const ev = event || {}, t = ticket;
    if (ev.paymentType === 'link' && /^https?:\/\//i.test(ev.paymentLink || '')) {
      return `<a class="pay-btn" href="${esc(ev.paymentLink)}" rel="noopener noreferrer">Pay ${money(t.pricing.total)} now</a>
        ${row('Reference', t.id, true)}`;
    }
    if (ev.paymentType === 'bank' && ev.bankName) {
      return `<div class="pay-rows">
          ${row('Bank', ev.bankName)}
          ${row('Account name', ev.accountHolder || '')}
          ${row('Account number', ev.accountNumber || '', true)}
          ${ev.branchCode ? row('Branch code', ev.branchCode, true) : ''}
          ${row('Reference', t.id, true)}
        </div>`;
    }
    return `<p class="pay-say">${esc(ev.organiser || 'The organiser')} will contact you at ${esc(t.buyer.email)} about payment.</p>`;
  }

  function renderReserved(body) {
    const t = ticket;
    const isLink = event && event.paymentType === 'link';
    const by = t.expiresAt ? `Pay by ${esc(when(t.expiresAt))} to keep your seat` : 'Pay to get your ticket';

    body.innerHTML = `
      <div class="pay-total">
        <span>Amount to pay</span>
        <b>${money(t.pricing.total)}</b>
        <small>${by}</small>
      </div>

      <section class="pay-step">
        <h2><i>1</i>${isLink ? 'Pay by card' : 'Pay by bank transfer'}</h2>
        ${payDetails()}
      </section>

      ${isLink ? `<p class="pay-next">✓ After you pay, ${esc((event && event.organiser) || 'the organiser')} confirms it and your QR ticket arrives by email (${esc(t.buyer.email)}).</p>` : `
      <section class="pay-step">
        <h2><i>2</i>Upload your proof of payment</h2>
        ${t.proofUrl
          ? `<div class="pay-done"><img src="${esc(Utils.imgUrl(t.proofUrl, 160))}" alt=""/><div><b>Proof sent ✓</b><span>The organiser has it.</span></div><button type="button" class="tk-linkbtn" id="tkReproof">Change</button></div>`
          : `<label class="pay-upload" for="tkProofFile"><span>⬆</span>Upload screenshot or slip</label>`}
        <input type="file" id="tkProofFile" accept="image/jpeg,image/png,image/webp" hidden/>
        <div class="tk-progress" id="tkProg" hidden><i></i></div>
      </section>

      <p class="pay-next">✓ Your QR ticket appears here and in your email once the organiser confirms your payment.</p>`}`;

    body.querySelectorAll('[data-copy]').forEach(b => {
      const go = () => navigator.clipboard?.writeText(b.dataset.copy).then(() => {
        const i = b.querySelector('i'); if (i) { i.textContent = 'Copied'; setTimeout(() => { i.textContent = 'Copy'; }, 1500); }
      }).catch(() => {});
      b.addEventListener('click', go);
      b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
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
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        prog.hidden = true;
        Utils.showToast(err.message || 'Upload failed. Please try again.', 'error', 6000);
      }
    });
  }

  /* ── Proof sent (or "I've paid"): you're done, here's what happens next ── */
  function renderSent(body) {
    const t = ticket, slip = !!t.proofUrl;
    const who = esc((event && event.organiser) || 'The organiser');
    body.innerHTML = `
      <div class="done">
        <div class="done__check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        <h2>${slip ? 'Proof of payment sent' : 'Payment noted'}</h2>
        <p>You're done for now. ${who} will check that your payment arrived.</p>
      </div>

      <ol class="done-steps">
        <li class="is-done"><i>✓</i><div><b>Seat reserved</b><span>${esc(t.ticket.typeName)} × ${esc(t.ticket.quantity)} · ${money(t.pricing.total)}</span></div></li>
        <li class="is-done"><i>✓</i><div><b>${slip ? 'Proof of payment sent' : 'You told the organiser you paid'}</b><span>Reference ${esc(t.id)}</span></div></li>
        <li class="is-now"><i>3</i><div><b>The organiser confirms your payment</b><span>This is done by hand, usually within a day.</span></div></li>
        <li><i>4</i><div><b>Your QR ticket arrives by email</b><span>It also appears on this page. Show it at the entrance.</span></div></li>
      </ol>

      <div class="done-mail">
        <span aria-hidden="true">✉️</span>
        <div><b>Watch your email</b><span>${esc(t.buyer.email)}</span><small>Not there? Check your spam or promotions folder.</small></div>
      </div>

      <div class="done-acts">
        ${slip ? `<button type="button" class="tk-linkbtn" id="tkReproof">Change the proof</button>` : `<label class="tk-linkbtn" for="tkProofFile">Add a proof of payment</label>`}
        <input type="file" id="tkProofFile" accept="image/jpeg,image/png,image/webp" hidden/>
        <div class="tk-progress" id="tkProg" hidden><i></i></div>
      </div>`;

    const input = document.getElementById('tkProofFile');
    document.getElementById('tkReproof')?.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      document.getElementById('tkProg').hidden = false;
      try { ticket.proofUrl = await SupabaseAPI.uploadTicketProof(ticket.id, file); ticket.proofUploadedAt = new Date().toISOString(); render(); }
      catch (err) { document.getElementById('tkProg').hidden = true; Utils.showToast(err.message || 'Upload failed. Please try again.', 'error', 6000); }
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
      ${used ? '' : `<div class="done done--in"><h2>You're in 🎉</h2><p>This is your ticket. Show the QR code at the entrance. A copy is in your email (${esc(ticket.buyer.email)}).</p></div>`}
      <div class="tk-qr ${used ? 'is-used' : ''}">
        <div class="tk-qr__code" role="img" aria-label="Ticket QR code">${svg}</div>
        <div class="tk-qr__id tk-mono">${esc(ticket.id)}</div>
        <p>${used
          ? `Checked in ${ticket.checkedInAt ? esc(when(ticket.checkedInAt)) : ''}. This ticket cannot be used again.`
          : `Admits <strong>${esc(ticket.ticket.quantity)} ${Number(ticket.ticket.quantity) === 1 ? 'person' : 'people'}</strong>. Don't share it: it works once.`}</p>
        ${used ? '' : `<div class="tk-actions"><button type="button" class="btn btn-secondary btn-sm" onclick="window.print()">Save / print</button></div>`}
      </div>`;
  }

  load();
});
