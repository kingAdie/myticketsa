
/* ================================================
   MyTicketSA — Checkout v4.1 (checkout.js)
   Sends booking to POST /api/checkout
   Falls back to offline mode if server unreachable
   ================================================ */

/* global Utils, Auth */

document.addEventListener('DOMContentLoaded', () => {

  Utils.initMobileNav();

  // ── Load selection set by event.js ──────────────────────────────────
  const selection = Utils.getStorage('mt_selection');
  if (!selection) {
    showPageError('No booking found. Please go back and select tickets.');
    return;
  }

  renderSummary(selection);
  setupBackLink(selection);
  initForm(selection);

  // ── Order summary sidebar ─────────────────────────────────────────────
  function renderSummary(sel) {
    Utils.setText('#summaryEventTitle', sel.eventTitle);

    const img = document.getElementById('summaryImage');
    if (img) { img.src = sel.eventImage || ''; img.alt = sel.eventTitle; }

    Utils.setText('#summaryDate',       Utils.formatDate(sel.eventDate));
    Utils.setText('#summaryLocation',   `${sel.eventLocation}, ${sel.eventCity}`);
    Utils.setText('#summaryTicketType', sel.ticketTypeName);
    Utils.setText('#summaryQty',        `${sel.quantity} × ticket${sel.quantity !== 1 ? 's' : ''}`);
    Utils.setText('#summaryUnitPrice',  Utils.formatCurrency(sel.ticketPrice));

    const fee      = Math.round(sel.ticketPrice * sel.quantity * 0.05 * 100) / 100;
    const total    = Math.round((sel.total + fee) * 100) / 100;
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

  // ── Form wiring ───────────────────────────────────────────────────────
  function initForm(sel) {
    const form = document.getElementById('checkoutForm');
    if (!form) return;

    // Inline field validation on blur
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

  // ── Submit handler ────────────────────────────────────────────────────
  async function handleSubmit(form, sel) {
    const btn = document.getElementById('confirmBtn');

    // Validate all required inputs
    let valid = true;
    form.querySelectorAll('input[required]').forEach(input => {
      if (!Utils.validateField(input)) valid = false;
    });

    // Terms checkbox
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
      form.querySelector('.form-input.error')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const buyer = {
      firstName: document.getElementById('firstName')?.value.trim(),
      lastName:  document.getElementById('lastName')?.value.trim(),
      email:     document.getElementById('email')?.value.trim(),
      phone:     document.getElementById('phone')?.value.trim() || null,
    };

    // Loading state
    if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

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

    try {
      const res  = await fetch(_API_BASE + '/api/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const msg = (data.errors || [data.error]).join(' ') || 'Payment failed. Please try again.';
        Utils.showToast(msg, 'error', 6000);
        if (btn) { btn.disabled = false; btn.textContent = 'Confirm Purchase'; }
        return;
      }

      // Persist booking data for success page
      Utils.setStorage('mt_booking', {
        ticketId: data.ticket.id,
        event: {
          title:    data.ticket.eventTitle,
          date:     data.ticket.eventDate,
          time:     data.ticket.eventTime,
          location: data.ticket.eventLocation,
          city:     data.ticket.eventCity,
          image:    data.ticket.eventImage,
        },
        ticket: {
          typeName: data.ticket.ticketTypeName,
          price:    data.ticket.ticketPrice,
          quantity: data.ticket.quantity,
        },
        pricing: {
          subtotal: data.ticket.ticketPrice * data.ticket.quantity,
          fee:      sel.fee,
          total:    data.ticket.total,
        },
        buyer,
        qrCodeUrl: data.ticket.qrCodeUrl,
        bookedAt:  data.ticket.bookedAt,
      });

      Utils.removeStorage('mt_selection');
      setTimeout(() => Utils.navigateTo('success.html'), 400);

    } catch {
      // Server unreachable — use client-side fallback so the user isn't stranded
      Utils.showToast('Server unavailable — processing offline.', 'info', 5500);
      clientFallback(buyer, sel);
    }
  }

  // ── Offline fallback (generates a local ticket ID, no QR) ─────────────
  function clientFallback(buyer, sel) {
    Utils.setStorage('mt_booking', {
      ticketId:  Utils.generateTicketId(),
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
      pricing: {
        subtotal: sel.total,
        fee:      sel.fee,
        total:    sel.grandTotal,
      },
      buyer,
      qrCodeUrl: null,
      bookedAt:  new Date().toISOString(),
    });
    Utils.removeStorage('mt_selection');
    setTimeout(() => Utils.navigateTo('success.html'), 400);
  }

  // ── Error state ───────────────────────────────────────────────────────
  function showPageError(msg) {
    const main = document.querySelector('main');
    if (!main) return;
    main.innerHTML = `
      <div class="container" style="text-align:center;padding:80px 0;">
        <div style="font-size:3rem;margin-bottom:1.5rem;">🛒</div>
        <h2 style="margin-bottom:1rem;">Nothing to check out</h2>
        <p style="margin-bottom:2rem;color:var(--text-secondary);">${msg}</p>
        <a href="index.html" class="btn btn-primary btn-lg">Browse Events</a>
      </div>`;
  }

});
