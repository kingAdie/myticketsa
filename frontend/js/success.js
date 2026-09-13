/**
 * TicketsSA Success Page (success.js)
 *
 * Normally reads the booking receipt from localStorage (set by checkout.js
 * right after it books the ticket directly against Supabase). Returning
 * from Paystack's hosted checkout is a full page navigation, so there is no
 * local state in that case instead we fetch the ticket paystack-verify.js
 * already created, by the `?ticket=` id in the URL. If the event's organiser
 * collects payment themselves via their own link or bank details, we
 * surface those instructions here too.
 */

/* global Utils, SupabaseAPI */

document.addEventListener('DOMContentLoaded', async () => {

  Utils.initMobileNav();

  const ticketId = new URLSearchParams(window.location.search).get('ticket');
  let booking = Utils.getStorage('mt_booking');

  // Paystack redirects back here with no local state (fresh page load after
  // a full navigation to Paystack's hosted checkout and back) fetch the
  // ticket that paystack-verify.js already created.
  if ((!booking || booking.ticketId !== ticketId) && ticketId && window.SupabaseAPI) {
    try {
      const row = await SupabaseAPI.getTicket(ticketId);
      if (row) {
        booking = {
          ticketId:  row.id,
          event:     row.event,
          ticket:    row.ticket,
          pricing:   row.pricing,
          payment:   { type: null }, // paid in full via Paystack no organiser instructions to show
          buyer:     row.buyer,
          qrCodeUrl: row.qrCodeUrl,
          bookedAt:  row.bookedAt,
        };
      }
    } catch (err) {
      console.error('[Success] ticket lookup failed:', err);
    }
  }

  if (!booking || !ticketId) { showError(); return; }

  renderTicket(booking);
  renderPaymentInstructions(booking);
  renderQR(booking);

  /* ---- Render ticket receipt ---- */
  function renderTicket(b) {
    document.title = `Booking Confirmed ${b.event.title} TicketsSA`;

    Utils.setText('#successSubtitle',
      `Your eTicket has been sent to ${b.buyer.email}. See you there!`);

    // Ticket ID (empire-travel uses paymentRef; regular checkout uses ticketId)
    const displayId = b.ticketId || b.paymentRef || '—';
    Utils.setText('#ticketId',        displayId);
    Utils.setText('#ticketBarcodeId', displayId);

    // Banner image
    const img = document.getElementById('receiptEventImage');
    if (img) { img.src = b.event.image || ''; img.alt = b.event.title; }

    Utils.setText('#receiptEventTitle', b.event.title);
    Utils.setText('#receiptEventMeta',  `${b.event.location} · ${b.event.city}`);

    Utils.setText('#receiptDate',
      `${Utils.formatDate(b.event.date)} at ${Utils.formatTime(b.event.time)}`);
    Utils.setText('#receiptLocation',   `${b.event.location}, ${b.event.city}`);
    Utils.setText('#receiptTicketType', `${b.ticket.typeName} × ${b.ticket.quantity}`);
    Utils.setText('#receiptGuestName',  `${b.buyer.firstName} ${b.buyer.lastName}`);
    Utils.setText('#receiptEmail',      b.buyer.email);
    Utils.setText('#receiptTotal',      Utils.formatCurrency(b.pricing.total));
  }

  /* ---- Payment instructions (organiser-provided; TicketsSA doesn't process payment) ---- */
  function renderPaymentInstructions(b) {
    const card = document.getElementById('paymentInstructions');
    if (!card) return;

    const payment = b.payment || {};
    const isSafeUrl = (url) => /^https?:\/\//i.test(String(url || '').trim());

    if (payment.type === 'link' && payment.link && isSafeUrl(payment.link)) {
      card.innerHTML = `
        <h3 class="payment-instructions__title">Complete Your Payment</h3>
        <p class="payment-instructions__sub">Your ticket is reserved. Pay the organiser directly via their secure link to finalise your booking.</p>
        <a href="${escHtml(payment.link)}" target="_blank" rel="noopener" class="pay-link-btn">
          Open Payment Link
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M7 17L17 7M7 7h10v10"/></svg>
        </a>`;
      card.hidden = false;

    } else if (payment.type === 'bank' && payment.bankName) {
      card.innerHTML = `
        <h3 class="payment-instructions__title">Complete Your Payment</h3>
        <p class="payment-instructions__sub">Your ticket is reserved. Pay the organiser via EFT using the details below, with your ticket ID as reference.</p>
        <div class="pay-bank-table">
          <div class="pay-bank-row"><span class="pay-bank-row__label">Bank</span><span class="pay-bank-row__value">${escHtml(payment.bankName)}</span></div>
          <div class="pay-bank-row"><span class="pay-bank-row__label">Account Holder</span><span class="pay-bank-row__value">${escHtml(payment.accountHolder || '—')}</span></div>
          <div class="pay-bank-row"><span class="pay-bank-row__label">Account Number</span><span class="pay-bank-row__value">${escHtml(payment.accountNumber || '—')}</span></div>
          <div class="pay-bank-row"><span class="pay-bank-row__label">Branch Code</span><span class="pay-bank-row__value">${escHtml(payment.branchCode || '—')}</span></div>
          <div class="pay-bank-row"><span class="pay-bank-row__label">Reference</span><span class="pay-bank-row__value">${escHtml(b.ticketId || '')}</span></div>
        </div>`;
      card.hidden = false;
    }
    // 'free' (or unset) → nothing to show, card stays hidden
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ---- QR code ---- */
  function renderQR(b) {
    const container = document.getElementById('ticketBarcode');
    if (!container) return;

    /* Prefer the unique ticket QR (set by empire-travel.html or future flows),
       then fall back to any backend-provided QR URL, then the visual barcode. */
    const qrUrl = b.ticketQrUrl || b.qrCodeUrl || null;

    if (qrUrl) {
      const img = document.createElement('img');
      img.src   = qrUrl;
      img.alt   = 'Ticket QR Code';
      img.style.cssText = [
        'width:180px', 'height:180px', 'border-radius:12px',
        'background:#fff', 'padding:8px', 'display:block', 'margin:0 auto',
      ].join(';');

      img.onerror = () => {
        img.remove();
        renderFallbackBarcode(container, b.ticketId || b.paymentRef || 'TICKET');
      };

      container.innerHTML = '';
      container.style.cssText = 'display:flex;justify-content:center;align-items:center;height:auto;';
      container.appendChild(img);
      return;
    }

    renderFallbackBarcode(container, b.ticketId || b.paymentRef || 'TICKET');
  }

  /* ---- Deterministic visual barcode (client-side fallback) ---- */
  function renderFallbackBarcode(container, ticketId) {
    const seed    = (ticketId || 'TICKET').replace(/[^A-Z0-9]/g, '');
    const heights = [48,32,56,24,40,64,32,48,24,56,40,32,64,48,24,40,56,32,48,64,24,40,32,56,48,24];
    const widths  = [2,3,2,4,2,3,2,2,4,3,2,3,2,2,3,4,2,3,2,4,3,2,2,3,2,2];

    let html = '';
    for (let i = 0; i < seed.length && i < 26; i++) {
      const charCode = seed.charCodeAt(i);
      const h = Math.max(20, heights[i % heights.length] + ((charCode % 5) - 2) * 4);
      const w = widths[i % widths.length];
      html += `<div style="width:${w}px;height:${h}px;background:var(--green);border-radius:1px;opacity:0.9;"></div>`;
      if ((i + 1) % 5 === 0 && i < seed.length - 1) {
        html += `<div style="width:4px;"></div>`;
      }
    }

    container.innerHTML = html;
    container.style.cssText = 'display:inline-flex;gap:2px;align-items:flex-end;height:64px;';
  }

  /* ---- Error state ---- */
  function showError() {
    const main = document.querySelector('main');
    if (!main) return;
    main.innerHTML = `
      <div class="container" style="text-align:center;padding:80px 0;">
        <div style="font-size:3rem;margin-bottom:1rem;">🎫</div>
        <h2 style="margin-bottom:1rem;">No booking found</h2>
        <p style="margin-bottom:2rem;">
          It looks like you haven't completed a booking yet.
          Browse our events and book your tickets!
        </p>
        <a href="index.html" class="btn btn-primary">Browse Events</a>
      </div>`;
  }

});
