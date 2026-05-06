/**
 * MyTicketSA — Success Page v3 (success.js)
 *
 * Reads the booking from localStorage (set by checkout.js),
 * renders the full ticket receipt, and displays the QR code
 * from the backend URL (or falls back to a generated visual barcode).
 */

/* global Utils */

/* global _API_BASE */
// Use the same API base as the rest of the app (defined in config.js)
const API_BASE = typeof _API_BASE !== 'undefined' ? _API_BASE : '';

document.addEventListener('DOMContentLoaded', () => {

  Utils.initMobileNav();

  const booking = Utils.getStorage('mt_booking');

  if (!booking) { showError(); return; }

  renderTicket(booking);
  renderQR(booking);

  /* ---- Render ticket receipt ---- */
  function renderTicket(b) {
    document.title = `Booking Confirmed — ${b.event.title} — MyTicketSA`;

    // Personalised subtitle
    Utils.setText('#successSubtitle',
      `Your eTicket has been sent to ${b.buyer.email}. See you there!`);

    // Ticket ID
    Utils.setText('#ticketId',        b.ticketId);
    Utils.setText('#ticketBarcodeId', b.ticketId);

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

  /* ---- QR code ---- */
  function renderQR(b) {
    const container = document.getElementById('ticketBarcode');
    if (!container) return;

    // If backend returned a real QR image URL, show that
    if (b.qrCodeUrl) {
      const img = document.createElement('img');
      img.src   = `${API_BASE}${b.qrCodeUrl}`;
      img.alt   = 'QR Code';
      img.style.cssText = [
        'width:160px', 'height:160px', 'border-radius:12px',
        'background:#fff', 'padding:8px', 'display:block', 'margin:0 auto',
      ].join(';');

      img.onerror = () => {
        // QR image failed to load — render the fallback barcode visual
        img.remove();
        renderFallbackBarcode(container, b.ticketId);
      };

      container.innerHTML = '';
      container.style.cssText = 'display:flex;justify-content:center;align-items:center;height:auto;';
      container.appendChild(img);
      return;
    }

    // No backend QR — use the client-side visual barcode
    renderFallbackBarcode(container, b.ticketId);
  }

  /* ---- Deterministic visual barcode (client-side fallback) ---- */
  function renderFallbackBarcode(container, ticketId) {
    const seed    = ticketId.replace(/[^A-Z0-9]/g, '');
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
