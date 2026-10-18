
/* ================================================
   TicketsSA Checkout

   TicketsSA doesn't process payment. The organiser collects
   it directly (their own payment link or bank details, shown
   here and on the ticket page). A paid booking is saved as a
   RESERVATION; the organiser confirms payment from their Seller
   Hub, and only then does the QR ticket appear. Free events are
   valid straight away. Everyone is emailed (notify-booking.js).
   ================================================ */

/* global Utils, Auth, SupabaseAPI */

document.addEventListener('DOMContentLoaded', () => {

  Utils.initMobileNav();

  const ICON = {
    bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18L12 4 3 10z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>',
    free: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v9H4v-9"/><path d="M2 7h20v5H2z"/><path d="M12 21V7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>',
  };

  const selection = Utils.getStorage('mt_selection');
  if (!selection) {
    showPageError('Choose an event and a ticket, then come back here.');
    return;
  }

  renderSummary(selection);
  renderPaymentMethodBox(selection);
  setupBackLink(selection);
  initForm(selection);
  initExtras();

  // ── Log-in hint, and prefill for signed-in buyers ─────────────────────
  function initExtras() {
    const fill = (u, force) => {
      const f = (id, v) => { const el = document.getElementById(id); if (el && v && (force || !el.value)) { el.value = v; el.classList.remove('error'); } };
      f('firstName', u.firstName); f('lastName', u.lastName); f('email', u.email);
    };
    const showMe = u => {
      const me = document.getElementById('signedInAs');
      me.innerHTML = `<span class="co-me__dot">${escHtml((u.firstName || u.email || '?').charAt(0).toUpperCase())}</span><span>Signed in as <b>${escHtml(u.email || '')}</b>. Your ticket is saved to your account.</span>`;
      me.hidden = false;
      document.getElementById('googleBox').hidden = true;
      document.getElementById('loginHint').hidden = true;
    };
    const u = typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser();
    if (u && Auth.isLoggedIn()) { fill(u); showMe(u); return; }

    // Guests: one tap with Google fills everything in (and saves the ticket to an account).
    document.getElementById('googleBox').hidden = false;
    document.getElementById('googleBtn').addEventListener('click', async () => {
      const btn = document.getElementById('googleBtn');
      btn.disabled = true;
      try {
        const me = await Auth.googleSignIn();
        fill(me, true); showMe(me);
        Utils.showToast(`Hi ${me.firstName || ''}! Your details are filled in.`, 'success');
      } catch (err) {
        btn.disabled = false;
        if (!err || err.code !== 'auth/popup-closed-by-user') Utils.showToast('Google sign-in did not work. Please fill in your details instead.', 'error');
      }
    });
    const hint = document.getElementById('loginHint');
    if (hint) hint.hidden = false;
    document.getElementById('loginHintBtn')?.addEventListener('click', () => Auth.requireAuth(() => location.reload(), 'Log in to save this ticket to your account', 'login'));
  }

  // ── Order summary ─────────────────────────────────────────────────────
  function renderSummary(sel) {
    Utils.setText('#summaryEventTitle', sel.eventTitle);
    const img = document.getElementById('summaryImage');
    if (img) { if (sel.eventImage) { img.src = Utils.imgUrl(sel.eventImage, 200); img.alt = sel.eventTitle; } else img.remove(); }
    Utils.setText('#summaryDate',       sel.eventDate ? Utils.formatDate(sel.eventDate) : '');
    Utils.setText('#summaryLocation',   [sel.eventLocation, sel.eventCity].filter(Boolean).join(', '));
    Utils.setText('#summaryTicketType', `${sel.quantity} × ${sel.ticketTypeName}`);

    // TicketsSA adds no fee: the buyer pays the organiser exactly the ticket price.
    const total = Math.round(sel.total * 100) / 100;
    Utils.setText('#summaryTotal', total > 0 ? Utils.formatCurrency(total) : 'Free');
    sel.fee = 0; sel.grandTotal = total;
    Utils.setStorage('mt_selection', sel);
  }

  function setupBackLink(sel) {
    const link = document.getElementById('backToEventLink');
    if (link) link.href = sel.eventLink || `event.html?id=${encodeURIComponent(sel.eventId)}`;
  }

  // ── Payment method (organiser-provided; TicketsSA doesn't process payment) ──

  // One payment option, shown as already chosen. Bank transfer can be opened to preview the details.
  function renderPaymentMethodBox(sel) {
    const box = document.getElementById('paymentMethodBox');
    const btn = document.getElementById('confirmBtn');
    if (!box) return;
    const total = Utils.formatCurrency(sel.total);
    const who = escHtml(sel.organiser || sel.accountHolder || 'the organiser');
    const opt = (icon, title, text, extra = '') => `
      <div class="co-opt is-on">
        <div class="co-opt__row">
          <span class="co-opt__icon">${icon}</span>
          <span class="co-opt__main"><b>${title}</b><small>${text}</small></span>
          <span class="co-opt__tick" aria-hidden="true">✓</span>
        </div>${extra}
      </div>`;

    if (sel.paymentType === 'link' && /^https?:\/\//i.test(String(sel.paymentLink || '').trim())) {
      box.innerHTML = opt(ICON.card, 'Card payment', `After you reserve, you pay ${who} on their secure payment page.`);
      if (btn) btn.textContent = `Reserve & pay · ${total}`;
    } else if (sel.paymentType === 'bank' && sel.bankName) {
      box.innerHTML = opt(ICON.bank, 'Bank transfer (EFT)', `Pay ${who} from your banking app. Then upload your proof of payment.`, `
        <button type="button" class="co-opt__more" id="bankToggle" aria-expanded="false">See bank details</button>
        <dl class="co-bank" id="bankDetails" hidden>
          <dt>Bank</dt><dd>${escHtml(sel.bankName)}</dd>
          <dt>Account holder</dt><dd>${escHtml(sel.accountHolder || '')}</dd>
          <dt>Account number</dt><dd>${escHtml(sel.accountNumber || '')}</dd>
          ${sel.branchCode ? `<dt>Branch code</dt><dd>${escHtml(sel.branchCode)}</dd>` : ''}
          <dt>Reference</dt><dd>Given on the next screen</dd>
        </dl>`);
      const t = document.getElementById('bankToggle');
      t.addEventListener('click', () => {
        const d = document.getElementById('bankDetails'); d.hidden = !d.hidden;
        t.setAttribute('aria-expanded', String(!d.hidden)); t.textContent = d.hidden ? 'See bank details' : 'Hide bank details';
      });
      if (btn) btn.textContent = `Reserve & pay · ${total}`;
    } else {
      box.innerHTML = opt(ICON.free, 'Free event', 'Nothing to pay. Your ticket is ready straight away.');
      if (btn) btn.textContent = 'Get my free ticket';
    }
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Form wiring ───────────────────────────────────────────────────────
  function initForm(sel) {
    const form = document.getElementById('checkoutForm');
    if (!form) return;

    form.querySelectorAll('input[required]').forEach(input => {
      input.addEventListener('blur',  () => Utils.validateField(input));
      input.addEventListener('input', () => {
        if (input.classList.contains('error')) Utils.validateField(input);
      });
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      handleSubmit(form, sel);
    });
  }

  // ── Submit ────────────────────────────────────────────────────────────
  async function handleSubmit(form, sel) {
    const btn = document.getElementById('confirmBtn');

    let valid = true;
    form.querySelectorAll('input[required]').forEach(input => {
      if (!Utils.validateField(input)) valid = false;
    });

    if (!valid) {
      Utils.showToast('Please add your name and email.', 'error');
      form.querySelector('.form-input.error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const buyer = {
      firstName: document.getElementById('firstName')?.value.trim(),
      lastName:  document.getElementById('lastName')?.value.trim(),
      email:     document.getElementById('email')?.value.trim(),
      phone:     document.getElementById('phone')?.value.trim() || null,
    };

    const busyLabel = sel.paymentType && sel.paymentType !== 'free' ? 'Reserving…' : 'Booking…';
    const idleLabel = btn?.textContent || 'Reserve my ticket';
    if (btn) { btn.disabled = true; btn.textContent = busyLabel; }

    const payload = {
      ...buyer,
      eventId:        sel.eventId,
      eventTitle:     sel.eventTitle,
      eventDate:      sel.eventDate,
      eventTime:      sel.eventTime,
      eventLocation:  sel.eventLocation,
      eventCity:      sel.eventCity,
      eventImage:     sel.eventImage || '',
      ticketTypeId:   sel.ticketTypeId,
      ticketTypeName: sel.ticketTypeName,
      ticketPrice:    sel.ticketPrice,
      quantity:       sel.quantity,
      marketingOptIn: !!document.getElementById('optinCheck')?.checked,
    };

    try {
      // Saved to Firestore and confirmed immediately. TicketsSA doesn't process
      // payment: the organiser collects it directly via their own payment link /
      // bank details, shown above and on the receipt.
      const result = await SupabaseAPI.submitTicket(payload);
      SupabaseAPI.notifyBooking('ticket', result.id);   // emails the owner, the buyer and support

      Utils.setStorage('mt_booking', {
        ticketId: result.id,
        event: {
          title:    sel.eventTitle,
          date:     sel.eventDate,
          time:     sel.eventTime,
          location: sel.eventLocation,
          city:     sel.eventCity,
          image:    sel.eventImage,
        },
        ticket: {
          typeName: sel.ticketTypeName,
          price:    sel.ticketPrice,
          quantity: sel.quantity,
        },
        pricing:   result.pricing,
        payment: {
          type:          sel.paymentType   || 'free',
          link:          sel.paymentLink   || null,
          bankName:      sel.bankName      || null,
          accountHolder: sel.accountHolder || null,
          accountNumber: sel.accountNumber || null,
          branchCode:    sel.branchCode    || null,
        },
        buyer,
        qrCodeUrl: result.qrCodeUrl || null,
        bookedAt:  new Date().toISOString(),
      });

      Utils.removeStorage('mt_selection');
      window.location.href = `ticket.html?id=${encodeURIComponent(result.id)}`;

    } catch (err) {
      console.error('[Checkout] Booking error:', err?.message || err);
      Utils.showToast(err && err.friendly ? err.message : 'We could not save your booking just now. Please check your connection and try again.', 'error', 7000);
      if (btn) { btn.disabled = false; btn.textContent = idleLabel; }
    }
  }

  // ── Error state ───────────────────────────────────────────────────────
  function showPageError(msg) {
    const main = document.querySelector('main');
    if (!main) return;
    main.innerHTML = `
      <div class="container" style="text-align:center;padding:80px 0;">
        <div style="font-size:3rem;margin-bottom:1.5rem;">🎟</div>
        <h2 style="margin-bottom:1rem;">Pick your tickets first</h2>
        <p style="margin-bottom:2rem;color:var(--text-2);">${msg}</p>
        <a href="index.html" class="btn btn-primary btn-lg">Browse Events</a>
      </div>`;
  }

});
