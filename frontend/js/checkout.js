
/* ================================================
   TicketsSA Checkout

   Most events: TicketsSA doesn't process payment the
   organiser collects it directly (their own payment link or
   bank details, shown here and on the confirmation page), and
   the ticket is booked (client → Supabase) and confirmed
   immediately.

   'paystack' events are the exception: TicketsSA collects
   payment itself. The buyer is handed off to Paystack's hosted
   checkout, and the ticket is only created server-side, by
   paystack-verify.js, once the payment is confirmed see
   handlePaystackSubmit() below.
   ================================================ */

/* global Utils, Auth, SupabaseAPI */

document.addEventListener('DOMContentLoaded', () => {

  Utils.initMobileNav();

  const selection = Utils.getStorage('mt_selection');
  if (!selection) {
    showPageError('No booking found. Please go back and select tickets.');
    return;
  }

  renderSummary(selection);
  renderPaymentMethodBox(selection);
  setupBackLink(selection);
  initForm(selection);
  reportPaystackReturn();

  // ── Paystack bounced the buyer back here after a failed/cancelled payment ──
  function reportPaystackReturn() {
    const status = new URLSearchParams(window.location.search).get('payment');
    if (!status) return;
    const msg = status === 'failed'
      ? 'Your payment was not completed. Please try again.'
      : 'Something went wrong starting your payment. Please try again or contact support.';
    Utils.showToast(msg, 'error', 7000);
    history.replaceState(null, '', window.location.pathname);
  }

  // ── Order summary ─────────────────────────────────────────────────────
  function renderSummary(sel) {
    Utils.setText('#summaryEventTitle', sel.eventTitle);

    const img = document.getElementById('summaryImage');
    if (img) { img.src = sel.eventImage || ''; img.alt = sel.eventTitle; }

    Utils.setText('#summaryDate',       Utils.formatDate(sel.eventDate));
    Utils.setText('#summaryLocation',   `${sel.eventLocation}, ${sel.eventCity}`);
    Utils.setText('#summaryTicketType', sel.ticketTypeName);
    Utils.setText('#summaryQty',        `${sel.quantity} × ticket${sel.quantity !== 1 ? 's' : ''}`);
    Utils.setText('#summaryUnitPrice',  Utils.formatCurrency(sel.ticketPrice));

    const fee   = Math.round(sel.ticketPrice * sel.quantity * 0.05 * 100) / 100;
    const total = Math.round((sel.total + fee) * 100) / 100;
    Utils.setText('#summaryFee',   Utils.formatCurrency(fee));
    Utils.setText('#summaryTotal', Utils.formatCurrency(total));

    sel.fee        = fee;
    sel.grandTotal = total;
    Utils.setStorage('mt_selection', sel);
  }

  function setupBackLink(sel) {
    const link = document.getElementById('backToEventLink');
    if (link) link.href = `event.html?id=${sel.eventId}`;
  }

  // ── Payment method (organiser-provided; TicketsSA doesn't process payment) ──
  function renderPaymentMethodBox(sel) {
    const box = document.getElementById('paymentMethodBox');
    const btn = document.getElementById('confirmBtn');
    if (!box) return;

    const isSafeUrl = (url) => /^https?:\/\//i.test(String(url || '').trim());

    if (sel.paymentType === 'link' && sel.paymentLink && isSafeUrl(sel.paymentLink)) {
      box.innerHTML = `
        <div class="pay-method-box pay-method-box--link">
          <div class="pay-method-box__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M10 13a5 5 0 007.07 0l1.93-1.93a5 5 0 00-7.07-7.07L10.5 5.5"/><path d="M14 11a5 5 0 00-7.07 0L5 12.93a5 5 0 007.07 7.07L13.5 18.5"/></svg>
          </div>
          <div>
            <p class="pay-method-box__title">Pay the Organiser Directly</p>
            <p class="pay-method-box__sub">This event's organiser collects payment themselves. Reserve your ticket below, then complete payment via their secure link.</p>
            <a href="${escHtml(sel.paymentLink)}" target="_blank" rel="noopener" class="pay-link-btn">
              Open Payment Link
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M7 17L17 7M7 7h10v10"/></svg>
            </a>
          </div>
        </div>`;
      if (btn) btn.textContent = 'Reserve My Ticket';

    } else if (sel.paymentType === 'paystack') {
      box.innerHTML = `
        <div class="pay-method-box">
          <div class="pay-method-box__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          </div>
          <div>
            <p class="pay-method-box__title">Pay Securely with Paystack</p>
            <p class="pay-method-box__sub">Card, Instant EFT and more. You'll be taken to Paystack's secure checkout, then straight back here with your eTicket.</p>
          </div>
        </div>`;
      if (btn) btn.textContent = `Pay ${Utils.formatCurrency(sel.grandTotal || sel.total)}`;

    } else if (sel.paymentType === 'bank' && sel.bankName) {
      box.innerHTML = `
        <div class="pay-method-box pay-method-box--bank">
          <div class="pay-method-box__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="11" width="18" height="10" rx="1"/><path d="M3 11l9-7 9 7M7 11v10M11 11v10M13 11v10M17 11v10"/></svg>
          </div>
          <div>
            <p class="pay-method-box__title">Pay the Organiser via EFT</p>
            <p class="pay-method-box__sub">This event's organiser collects payment directly. Reserve your ticket below, then pay using these bank details.</p>
            <div class="pay-bank-table">
              <div class="pay-bank-row"><span class="pay-bank-row__label">Bank</span><span class="pay-bank-row__value">${escHtml(sel.bankName)}</span></div>
              <div class="pay-bank-row"><span class="pay-bank-row__label">Account Holder</span><span class="pay-bank-row__value">${escHtml(sel.accountHolder || '—')}</span></div>
              <div class="pay-bank-row"><span class="pay-bank-row__label">Account Number</span><span class="pay-bank-row__value">${escHtml(sel.accountNumber || '—')}</span></div>
              <div class="pay-bank-row"><span class="pay-bank-row__label">Branch Code</span><span class="pay-bank-row__value">${escHtml(sel.branchCode || '—')}</span></div>
            </div>
          </div>
        </div>`;
      if (btn) btn.textContent = 'Reserve My Ticket';

    } else {
      box.innerHTML = `
        <div class="pay-method-box">
          <div class="pay-method-box__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div>
            <p class="pay-method-box__title">Free Event</p>
            <p class="pay-method-box__sub">No payment is required for this event. Just confirm your details below to get your eTicket.</p>
          </div>
        </div>`;
      if (btn) btn.textContent = 'Get My Free Ticket';
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

    const terms      = document.getElementById('termsCheck');
    const termsError = document.getElementById('termsError');
    if (!terms?.checked) {
      valid = false;
      if (termsError) {
        termsError.textContent = 'You must agree to the Terms of Service.';
        termsError.classList.add('visible');
      }
    } else {
      termsError?.classList.remove('visible');
    }

    if (!valid) {
      Utils.showToast('Please fill in all required fields.', 'error');
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
    const idleLabel = btn?.textContent || 'Confirm Purchase';
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
    };

    if (sel.paymentType === 'paystack') {
      handlePaystackSubmit(payload, btn, idleLabel);
      return;
    }

    try {
      // Ticket is booked directly against Supabase and confirmed immediately.
      // TicketsSA doesn't process payment the organiser collects it directly
      // via their own payment link / bank details, shown above and on the receipt.
      const result = await SupabaseAPI.submitTicket(payload);

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
      window.location.href = `success.html?ticket=${encodeURIComponent(result.id)}`;

    } catch (err) {
      console.error('[Checkout] Booking error:', err?.message || err);
      Utils.showToast('Could not complete your booking. Please try again.', 'error', 6000);
      if (btn) { btn.disabled = false; btn.textContent = idleLabel; }
    }
  }

  // ── Paystack: hand off to the hosted checkout ───────────────────────────
  // No ticket is booked here paystack-verify.js only creates it once
  // Paystack confirms the payment actually succeeded.
  async function handlePaystackSubmit(payload, btn, idleLabel) {
    try {
      const res = await fetch('/.netlify/functions/paystack-initialize', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (!data.authorizationUrl) throw new Error('No checkout URL returned');

      window.location.href = data.authorizationUrl;
    } catch (err) {
      console.error('[Checkout] Paystack init error:', err?.message || err);
      Utils.showToast('Could not start payment. Please try again.', 'error', 6000);
      if (btn) { btn.disabled = false; btn.textContent = idleLabel; }
    }
  }

  // ── Error state ───────────────────────────────────────────────────────
  function showPageError(msg) {
    const main = document.querySelector('main');
    if (!main) return;
    main.innerHTML = `
      <div class="container" style="text-align:center;padding:80px 0;">
        <div style="font-size:3rem;margin-bottom:1.5rem;">🛒</div>
        <h2 style="margin-bottom:1rem;">Nothing to check out</h2>
        <p style="margin-bottom:2rem;color:var(--text-2);">${msg}</p>
        <a href="index.html" class="btn btn-primary btn-lg">Browse Events</a>
      </div>`;
  }

});
