/* ================================================
   A service booking (booking.html?id=SRV-…)
   requested → accepted (pay + proof) → paid
   with declined / cancelled as endings.
   ================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  Auth.updateNavbar(); Utils.initMobileNav();
  const root = document.getElementById('tkRoot');
  const id = (Utils.getParam('id') || '').trim();
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const money = n => Utils.formatCurrency(n);
  const longDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let b = null, s = null, timer = null;

  if (!id) return msg('🧑‍🍳', 'No booking selected', 'Open the link in your booking email.');

  async function load() {
    try { const r = await SupabaseAPI.getServiceBooking(id); b = r.booking; s = r.service || {}; }
    catch (e) { return msg('🔎', 'Booking not found', 'Check the link in your email. If you just booked, wait a moment and refresh.'); }
    render();
  }

  function msg(icon, title, body) {
    root.innerHTML = `<div class="tk-msg"><div class="tk-msg__icon">${icon}</div><h1>${esc(title)}</h1><p>${esc(body)}</p><a class="btn btn-primary" href="book.html">See services</a></div>`;
  }

  const STATES = {
    requested: { cls: 'amber', label: 'Waiting for the provider' },
    accepted:  { cls: 'amber', label: 'Accepted · pay to confirm' },
    paid:      { cls: 'green', label: 'Booking confirmed' },
    declined:  { cls: 'red',   label: 'Not available' },
    cancelled: { cls: 'red',   label: 'Cancelled' },
  };

  function render() {
    const st = (b.status === 'accepted' && b.proofUrl) ? { cls: 'amber', label: 'Waiting for the provider' } : (STATES[b.status] || STATES.requested);
    const who = esc(b.ownerName || s.ownerName || 'The provider');
    const priceTxt = b.amount ? money(b.amount) : b.estimate ? `About ${money(b.estimate)}` : 'On quote';
    root.innerHTML = `
      <article class="tk-card tk-card--${st.cls}">
        <header class="tk-top">
          <div class="tk-top__img">${b.serviceImage ? `<img src="${esc(Utils.imgUrl(b.serviceImage, 240))}" alt="" onerror="this.remove()"/>` : '🧑‍🍳'}</div>
          <div class="tk-top__text">
            <span class="tk-pill tk-pill--${st.cls}"><i></i>${esc(st.label)}</span>
            <h1>${esc(b.serviceTitle)}</h1>
            <p>${esc(longDate(b.date))}</p>
            <p>${esc(b.packageName)} · ${esc(b.guests)} guest${b.guests > 1 ? 's' : ''}</p>
          </div>
        </header>
        <div class="tk-body" id="bkBody"></div>
      </article>
      <p class="tk-note">Reference ${esc(id)}. Questions? Contact ${who} or <a href="mailto:support@ticketssa.co.za">support@ticketssa.co.za</a>.${s.refundPolicy ? ` Refunds: ${esc(s.refundPolicy)}` : ''}</p>`;
    const body = document.getElementById('bkBody');

    if (b.status === 'requested') {
      body.innerHTML = done('Request sent', `${who} will accept or decline it. You get an email either way.`, [
        ['done', 'Request sent', `${esc(b.packageName)} · ${esc(b.guests)} guests · ${esc(priceTxt)}`],
        ['now', `${who} accepts and confirms the price`, 'Usually within a day.'],
        ['', 'You pay to confirm', 'You get the payment details by email.'],
        ['', 'Booking confirmed', 'You get a confirmation email.'],
      ]);
    } else if (b.status === 'accepted' && b.proofUrl) {
      body.innerHTML = done('Proof of payment sent', `You're done for now. ${who} will check that your payment arrived.`, [
        ['done', 'Request accepted', `${esc(money(b.amount))}`],
        ['done', 'Proof of payment sent', `Reference ${esc(id)}`],
        ['now', `${who} confirms your payment`, 'Done by hand, usually within a day.'],
        ['', 'Booking confirmed', 'You get a confirmation email.'],
      ]) + upload(true);
      bindUpload();
    } else if (b.status === 'accepted') {
      const isLink = s.paymentType === 'link' && /^https?:\/\//i.test(s.paymentLink || '');
      const row = (label, value, copy) => `<div class="pay-row${copy ? ' pay-row--copy' : ''}"${copy ? ` data-copy="${esc(value)}" role="button" tabindex="0"` : ''}><span>${label}</span><b class="${copy ? 'tk-mono' : ''}">${esc(value)}</b>${copy ? '<i>Copy</i>' : ''}</div>`;
      body.innerHTML = `
        <div class="pay-total"><span>Accepted! Amount to pay</span><b>${esc(money(b.amount))}</b><small>Pay to confirm your booking</small></div>
        <section class="pay-step"><h2><i>1</i>${isLink ? 'Pay by card' : 'Pay by bank transfer'}</h2>
          ${isLink ? `<a class="pay-btn" href="${esc(s.paymentLink)}" rel="noopener noreferrer">Pay ${esc(money(b.amount))} now</a>${row('Reference', id, true)}`
            : `<div class="pay-rows">${row('Bank', s.bankName || '')}${row('Account name', s.accountHolder || '')}${row('Account number', s.accountNumber || '', true)}${s.branchCode ? row('Branch code', s.branchCode, true) : ''}${row('Reference', id, true)}</div>`}
        </section>
        ${isLink ? `<p class="pay-next">✓ After you pay, ${who} confirms it and you get a confirmation email (${esc(b.customerEmail)}).</p>` : `
        <section class="pay-step"><h2><i>2</i>Upload your proof of payment</h2>${upload(false)}</section>
        <p class="pay-next">✓ ${who} checks your payment and confirms your booking by email.</p>`}`;
      body.querySelectorAll('[data-copy]').forEach(el => el.addEventListener('click', () => navigator.clipboard?.writeText(el.dataset.copy).then(() => { const i = el.querySelector('i'); i.textContent = 'Copied'; setTimeout(() => { i.textContent = 'Copy'; }, 1500); }).catch(() => {})));
      bindUpload();
    } else if (b.status === 'paid') {
      body.innerHTML = `<div class="done"><div class="done__check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        <h2>You're booked ✅</h2><p>${who} confirmed your payment. Your booking for <b>${esc(longDate(b.date))}</b> is confirmed. They will contact you about the details.</p></div>
        <dl class="tk-facts">
          <div><dt>Package</dt><dd>${esc(b.packageName)}</dd></div><div><dt>Guests</dt><dd>${esc(b.guests)}</dd></div>
          <div><dt>Paid</dt><dd>${esc(money(b.amount))}</dd></div><div><dt>Reference</dt><dd class="tk-mono">${esc(id)}</dd></div>
        </dl>`;
    } else if (b.status === 'declined') {
      body.innerHTML = `<div class="tk-end"><h2>${who} can't take this booking</h2><p>${b.declineReason ? `Their note: “${esc(b.declineReason)}”. ` : ''}Nothing was paid. You can pick another date or package.</p>
        ${s.slug ? `<a class="btn btn-primary" href="b/${encodeURIComponent(s.slug)}">Choose another date</a>` : ''}</div>`;
    } else {
      body.innerHTML = `<div class="tk-end"><h2>This booking was cancelled</h2><p>Contact ${who} if you think this is a mistake, quoting <strong>${esc(id)}</strong>.</p></div>`;
    }

    clearInterval(timer);
    if (b.status === 'requested' || b.status === 'accepted') timer = setInterval(async () => {
      if (document.hidden) return;
      try { const r = await SupabaseAPI.getServiceBooking(id); if (r.booking.status !== b.status) { b = r.booking; s = r.service || s; render(); } } catch (_) {}
    }, 30000);
  }

  function done(title, text, steps) {
    return `<div class="done"><div class="done__check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        <h2>${esc(title)}</h2><p>${text}</p></div>
      <ol class="done-steps">${steps.map(([cls, t, sub], i) => `<li class="${cls === 'done' ? 'is-done' : cls === 'now' ? 'is-now' : ''}"><i>${cls === 'done' ? '✓' : i + 1}</i><div><b>${t}</b><span>${sub}</span></div></li>`).join('')}</ol>
      <div class="done-mail"><span aria-hidden="true">✉️</span><div><b>Watch your email</b><span>${esc(b.customerEmail)}</span><small>Not there? Check your spam or promotions folder.</small></div></div>`;
  }

  function upload(sent) {
    return `${sent ? '<div class="done-acts"><label class="tk-linkbtn" for="bkProof">Change the proof</label>' : '<label class="pay-upload" for="bkProof"><span>⬆</span>Upload screenshot or slip</label><div>'}
      <input type="file" id="bkProof" accept="image/jpeg,image/png,image/webp" hidden/><div class="tk-progress" id="bkProg" hidden><i></i></div></div>`;
  }
  function bindUpload() {
    const input = document.getElementById('bkProof');
    if (!input) return;
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      document.getElementById('bkProg').hidden = false;
      try { b.proofUrl = await SupabaseAPI.uploadServiceProof(id, f); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      catch (e) { document.getElementById('bkProg').hidden = true; Utils.showToast(e.message || 'Upload failed. Please try again.', 'error', 6000); }
    });
  }

  load();
});
