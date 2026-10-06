/* ── API base ── */
/* ================================================
   TicketsSA Event Details Logic v4 (event.js)
   Loads event data from the live API via EventsData.init()
   ================================================ */

document.addEventListener('DOMContentLoaded', async () => {

  Utils.initMobileNav();

  /* ── State ────────────────────────────────────────────────────────── */
  let currentEvent       = null;
  let selectedTicketType = null;
  let quantity           = 1;
  const MAX_QTY          = 10;

  /* ── Resolve event ID ─────────────────────────────────────────────── */
  const eventId = Utils.getParam('id');
  if (!eventId) { showError('No event specified.'); return; }

  /* ── Fetch single event directly from Supabase ─────────────────────── */
  try {
    currentEvent = await SupabaseAPI.getEvent(eventId);
    if (!currentEvent) {
      showError('Event not found. It may have been removed or the link is incorrect.');
      return;
    }
  } catch (err) {
    showError('Could not load event. Please check your connection.');
    return;
  }

  renderEventPage(currentEvent);
  initQuantitySelector();

  /* ── Render page ─────────────────────────────────────────────────── */
  function renderEventPage(event) {
    document.title = `${event.title} TicketsSA`;

    // Banner image
    const bannerImg = document.getElementById('bannerImage');
    if (bannerImg) {
      bannerImg.src = event.image || '';
      bannerImg.alt = event.title;
    }

    Utils.setText('#eventCategory',   event.category);
    Utils.setText('#breadcrumbTitle', event.title);
    Utils.setText('#eventTitle',      event.title);
    Utils.setText('#eventDate',       Utils.formatDate(event.date));
    // Listings without a published start time show one clear line rather than "TBC – TBC".
    Utils.setText('#eventTime', event.time
      ? `${Utils.formatTime(event.time)} – ${Utils.formatTime(event.endTime || event.time)}`
      : 'Time to be confirmed');
    Utils.setText('#eventLocation',   event.location);
    Utils.setText('#eventCity',       [event.city, event.province].filter(Boolean).join(', '));
    Utils.setText('#eventOrganiser',  event.organiser || '—');

    // Description
    const descEl = document.getElementById('eventDescription');
    if (descEl) descEl.textContent = event.description || '';

    // Tags
    const tagsEl = document.getElementById('eventTags');
    if (tagsEl) {
      (event.tags || []).forEach(tag => {
        const span = document.createElement('span');
        span.className = 'event-tag';
        span.textContent = tag;
        tagsEl.appendChild(span);
      });
    }

    // Ticket types
    const types = event.ticketTypes || [];
    if (types.length === 0) {
      // No ticket types defined – create a single default one from the base price
      renderTicketTypes([{
        id: 'GA', name: 'General Admission',
        price: event.price, available: 100,
        description: 'Standard entry ticket',
      }]);
    } else {
      renderTicketTypes(types);
    }
  }

  function escText(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Ticket type rows ────────────────────────────────────────────── */
  function renderTicketTypes(ticketTypes) {
    const container = document.getElementById('ticketTypes');
    if (!container) return;
    container.innerHTML = '';

    ticketTypes.forEach(tt => {
      const row = document.createElement('div');
      row.className = 'ticket-type';
      row.setAttribute('role', 'radio');
      row.setAttribute('aria-checked', 'false');
      row.setAttribute('tabindex', '0');

      row.innerHTML = `
        <div class="ticket-type__info">
          <h4>${escText(tt.name)}</h4>
          <p>${escText(tt.description || '')}</p>
          ${tt.available <= 20
            ? `<p class="scarce" style="color:var(--green);font-size:.8125rem;font-weight:600;">Only ${tt.available} left!</p>`
            : ''}
        </div>
        <div class="ticket-type__price">${Utils.formatCurrency(tt.price)}</div>`;

      row.addEventListener('click',  () => selectTicketType(tt, row));
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTicketType(tt, row); }
      });

      container.appendChild(row);
    });
  }

  /* ── Select ticket type ──────────────────────────────────────────── */
  function selectTicketType(ticketType, rowEl) {
    selectedTicketType = ticketType;
    quantity = 1;

    document.querySelectorAll('.ticket-type').forEach(r => {
      r.classList.remove('selected');
      r.setAttribute('aria-checked', 'false');
    });
    rowEl.classList.add('selected');
    rowEl.setAttribute('aria-checked', 'true');

    document.getElementById('ticketQtySection')?.classList.remove('hidden');
    updateQtyDisplay();
    updateSubtotal();
    updateBuyButton();
  }

  /* ── Quantity selector ───────────────────────────────────────────── */
  function initQuantitySelector() {
    document.getElementById('qtyDecrease')?.addEventListener('click', () => {
      if (quantity > 1) { quantity--; updateQtyDisplay(); updateSubtotal(); }
    });
    document.getElementById('qtyIncrease')?.addEventListener('click', () => {
      const max = Math.min(MAX_QTY, selectedTicketType?.available || MAX_QTY);
      if (quantity < max) { quantity++; updateQtyDisplay(); updateSubtotal(); }
    });
  }

  function updateQtyDisplay() {
    const max = Math.min(MAX_QTY, selectedTicketType?.available || MAX_QTY);
    Utils.setText('#qtyValue', quantity);
    const dec = document.getElementById('qtyDecrease');
    const inc = document.getElementById('qtyIncrease');
    if (dec) dec.disabled = quantity <= 1;
    if (inc) inc.disabled = quantity >= max;
  }

  function updateSubtotal() {
    if (!selectedTicketType) return;
    Utils.setText('#subtotalValue', Utils.formatCurrency(selectedTicketType.price * quantity));
  }

  function updateBuyButton() {
    const btn = document.getElementById('buyTicketBtn');
    if (!btn) return;
    btn.textContent = selectedTicketType ? 'Buy Ticket' : 'Select a Ticket Type';
    btn.disabled    = !selectedTicketType;
  }

  /* ── Buy ticket → save to localStorage → go to checkout ─────────── */
  document.getElementById('buyTicketBtn')?.addEventListener('click', () => {
    if (!selectedTicketType || !currentEvent) return;

    Utils.setStorage('mt_selection', {
      eventId:        currentEvent.id,
      eventTitle:     currentEvent.title,
      eventDate:      currentEvent.date,
      eventTime:      currentEvent.time,
      eventLocation:  currentEvent.location,
      eventCity:      currentEvent.city,
      eventImage:     currentEvent.image,
      ticketTypeId:   selectedTicketType.id,
      ticketTypeName: selectedTicketType.name,
      ticketPrice:    selectedTicketType.price,
      quantity,
      total:          selectedTicketType.price * quantity,
      paymentType:    currentEvent.paymentType   || 'free',
      paymentLink:    currentEvent.paymentLink   || null,
      bankName:       currentEvent.bankName      || null,
      accountHolder:  currentEvent.accountHolder || null,
      accountNumber:  currentEvent.accountNumber || null,
      branchCode:     currentEvent.branchCode    || null,
    });

    Utils.navigateTo('checkout.html');
  });

  /* ── Error state ─────────────────────────────────────────────────── */
  function showError(message) {
    const main = document.querySelector('main');
    if (!main) return;
    main.innerHTML = `
      <div class="container" style="text-align:center;padding:80px 0;">
        <div style="font-size:3rem;margin-bottom:1rem;">😕</div>
        <h2 style="margin-bottom:1rem;">Oops!</h2>
        <p style="margin-bottom:2rem;">${escText(message)}</p>
        <a href="index.html" class="btn btn-primary">Back to Events</a>
      </div>`;
  }

});
