
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
    if (typeof Auth !== 'undefined' && !Auth.isLoggedIn()) {
      const hint = document.getElementById('loginHint');
      if (hint) hint.hidden = false;
      document.getElementById('loginHintBtn')?.addEventListener('click', () => Auth.requireAuth(() => location.reload(), 'Log in to save this ticket to your account', 'login'));
    }
    const u = typeof Auth !== 'undefined' && Auth.getUser && Auth.getUser();
    if (u) {
      const f = (id, v) => { const el = document.getElementById(id); if (el && !el.value && v) el.value = v; };
      f('firstName', u.firstName); f('lastName', u.lastName); f('email', u.email);
    }
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
  function renderPaymentMethodBox(sel) {
    const box = document.getElementById('paymentMethodBox');
    const btn = document.getElementById('confirmBtn');
    if (!box) return;
    const total = Utils.formatCurrency(sel.total);
    const who = escHtml(sel.organiser || sel.accountHolder || 'the organiser');
    const row = (icon, title, text) => `<span class="co-pay__icon">${icon}</span><div><b>${title}</b><span>${text}</span></div>`;

    if (sel.paymentType === 'link' && /^https?:\/\//i.test(String(sel.paymentLink || '').trim())) {
      box.innerHTML = row('💳', 'Pay by card', `Next you pay ${who} on their secure payment page. Your seat is held while you pay.`);
      if (btn) btn.textContent = `Reserve & pay · ${total}`;
    } else if (sel.paymentType === 'bank' && sel.bankName) {
      box.innerHTML = row('🏦', 'Pay by bank transfer (EFT)', `Next you get ${who}'s bank details and your reference. Upload your proof of payment there too.`);
      if (btn) btn.textContent = `Reserve & pay · ${total}`;
    } else {
      box.innerHTML = row('🎉', 'Free event', 'Nothing to pay. Your ticket is ready straight away.');
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
      Utils.showToast('Could not complete your booking. Please try again.', 'error', 6000);
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
