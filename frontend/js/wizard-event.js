/* ================================================
   Event listing flow (wizard-event.js)
   Step config for WizardCore. Writes through the
   existing SupabaseAPI.createEvent / updateEvent
   no new tables, no new data model.

   This flow replaces two older, divergent forms:
   dashboard.html's #eventForm and organiser.html's
   #eventModal. Its field set is the union of both,
   so nothing an organiser could previously enter is
   lost (payment details came from organiser.html).
   ================================================ */

(function () {

  /* ── Guard: sellers only ─────────────────────── */
  if (!Auth.isLoggedIn()) { window.location.replace('sell.html?type=event&signup=1'); return; }

  const CATEGORIES = ['Music', 'Sport', 'Food & Drink', 'Comedy', 'Arts & Culture', 'Business', 'Technology', 'Fashion', 'Other'];
  const PROVINCES  = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];

  const editId = Utils.getParam('edit');

  /* ── Steps ───────────────────────────────────── */
  const steps = [
    {
      id: 'basics',
      title: 'Event basics',
      hint: 'Start with what the event is and who it is for. You can change any of this before you publish.',
      fields: [
        { name: 'title', label: 'Event name', type: 'text', required: true,
          placeholder: 'e.g. Soweto Summer Festival 2026',
          help: 'This is the headline people see first. Keep it short and specific.' },
        { name: 'category', label: 'Category', type: 'select', required: true,
          options: CATEGORIES, placeholder: 'Choose a category…',
          help: 'Helps people find your event when they browse.' },
        { name: 'description', label: 'Description', type: 'textarea', required: true, rows: 7,
          placeholder: 'What can people expect? Line-up, what is included, age restrictions, parking, anything they should know before buying.',
          validate: v => v.trim().length < 40 ? 'Add a bit more detail at least 40 characters so buyers know what they are getting.' : null },
        { name: 'image', label: 'Event poster or photo', type: 'image',
          help: 'Optional, but events with artwork sell noticeably better. Our team reviews images before your event goes live.' },
      ],
    },

    {
      id: 'when-where',
      title: 'Date & location',
      hint: 'Tell people when it starts and where to go.',
      fields: [
        { name: 'date',    label: 'Event date',  type: 'date', required: true },
        { name: 'time',    label: 'Start time',  type: 'time', required: true },
        { name: 'endTime', label: 'End time',    type: 'time',
          help: 'Leave blank if it runs open-ended.' },
        { name: 'location', label: 'Venue name', type: 'text', required: true,
          placeholder: 'e.g. Mbombela Stadium' },
        { name: 'address', label: 'Street address', type: 'text',
          placeholder: 'e.g. 1 Samora Machel Dr, Mbombela',
          help: 'Shown to ticket holders so they can find the entrance.' },
        { name: 'city',     label: 'City / town', type: 'text', required: true, placeholder: 'e.g. Mbombela' },
        { name: 'province', label: 'Province',    type: 'select', required: true, options: PROVINCES, placeholder: 'Choose a province…' },
      ],
    },

    {
      id: 'tickets',
      title: 'Tickets',
      hint: 'Add every ticket type you want to sell. Most organisers start with General Admission and add VIP on top.',
      fields: [
        { name: 'ticketTypes', label: 'Ticket types', type: 'repeater', required: true,
          itemLabel: 'Ticket type', addLabel: 'Add another ticket type',
          blank: { name: '', price: '', available: '', description: '' },
          fields: [
            { name: 'name',        label: 'Ticket name', type: 'text', required: true, placeholder: 'e.g. General Admission, VIP, Early Bird' },
            { name: 'price',       label: 'Price',       type: 'money', required: true, placeholder: '0.00', help: 'Enter 0 for a free ticket.' },
            { name: 'available',   label: 'Quantity available', type: 'number', required: true, min: 1, placeholder: 'e.g. 200' },
            { name: 'description', label: 'What this ticket includes (optional)', type: 'text', placeholder: 'e.g. Includes welcome drink and reserved seating' },
          ],
        },
        { name: '_ticketNote', type: 'info',
          html: 'Buyers pay you directly using the payment details you add on the next step. TicketsSA issues the ticket and QR code once they book.' },
      ],
      validate(state) {
        const rows = Array.isArray(state.ticketTypes) ? state.ticketTypes : [];
        const errs = {};
        rows.forEach((r, i) => {
          if (r.price !== '' && parseFloat(r.price) < 0) errs[`ticketTypes.${i}.price`] = 'Price cannot be negative.';
          if (r.available !== '' && parseInt(r.available) < 1) errs[`ticketTypes.${i}.available`] = 'Must be at least 1.';
        });
        return errs;
      },
    },

    {
      id: 'payment',
      title: 'How buyers pay you',
      hint: 'TicketsSA does not hold your money. Buyers pay you directly, so we show them exactly how you want to be paid.',
      fields: [
        { name: 'paymentType', label: 'Payment method', type: 'cards', required: true,
          requiredMsg: 'Choose how buyers should pay you.',
          options: [
            { value: 'link', icon: '🔗', label: 'Payment link',  sub: 'You have a Yoco, PayFast, SnapScan or similar link buyers can pay on.' },
            { value: 'bank', icon: '🏦', label: 'Bank transfer', sub: 'Buyers get your account details and make an EFT.' },
            { value: 'free', icon: '🎟️', label: 'Free event',    sub: 'No payment needed people just claim a ticket.' },
          ] },

        { name: 'paymentLink', label: 'Payment link', type: 'url',
          required: true, showIf: s => s.paymentType === 'link',
          placeholder: 'https://pay.yoco.com/…',
          validate: v => /^https?:\/\//i.test(v.trim()) ? null : 'Enter the full link, starting with https://' },

        { name: 'bankName',      label: 'Bank',            type: 'text', required: true, showIf: s => s.paymentType === 'bank', placeholder: 'e.g. FNB' },
        { name: 'accountHolder', label: 'Account holder',  type: 'text', required: true, showIf: s => s.paymentType === 'bank', placeholder: 'Name on the account' },
        { name: 'accountNumber', label: 'Account number',  type: 'text', required: true, showIf: s => s.paymentType === 'bank', placeholder: 'e.g. 62012345678' },
        { name: 'branchCode',    label: 'Branch code',     type: 'text', showIf: s => s.paymentType === 'bank', placeholder: 'e.g. 250655' },

        { name: '_freeNote', type: 'info', showIf: s => s.paymentType === 'free',
          html: 'Buyers will be able to claim a ticket without paying. You can still limit how many are available on the tickets step.' },

        ...Utils.refundFields(),

        { name: 'tags', label: 'Search tags (optional)', type: 'text',
          placeholder: 'e.g. live music, outdoor, family friendly',
          help: 'Separate with commas. These help people find your event in search.' },
      ],
    },
  ];

  /* ── Payload mapping (existing API shape) ────── */
  function toPayload(s) {
    const ticketTypes = (s.ticketTypes || [])
      .filter(t => t && String(t.name || '').trim())
      .map(t => ({
        name:        String(t.name).trim(),
        description: String(t.description || '').trim() || String(t.name).trim(),
        price:       parseFloat(t.price) || 0,
        available:   parseInt(t.available) || 0,
      }));

    return {
      title:       String(s.title || '').trim(),
      category:    s.category,
      date:        s.date,
      time:        s.time,
      endTime:     s.endTime || s.time,
      location:    String(s.location || '').trim(),
      address:     String(s.address || '').trim() || null,
      city:        String(s.city || '').trim(),
      province:    s.province || null,
      description: String(s.description || '').trim(),
      image:       s.image || null,
      price:       ticketTypes.length ? Math.min(...ticketTypes.map(t => t.price)) : 0,
      ticketTypes,
      tags: String(s.tags || '').split(',').map(t => t.trim()).filter(Boolean),
      refundPolicy:  Utils.refundPolicyText(s.refundPolicy, s.refundNote),
      paymentType:   s.paymentType || null,
      paymentLink:   s.paymentType === 'link' ? (s.paymentLink || null) : null,
      bankName:      s.paymentType === 'bank' ? (s.bankName || null) : null,
      accountHolder: s.paymentType === 'bank' ? (s.accountHolder || null) : null,
      accountNumber: s.paymentType === 'bank' ? (s.accountNumber || null) : null,
      branchCode:    s.paymentType === 'bank' ? (s.branchCode || null) : null,
    };
  }

  /* ── Wizard ──────────────────────────────────── */
  const wizard = WizardCore.create({
    category:    'event',
    title:       editId ? 'Edit event' : 'List an event',
    steps,
    draftTitleField: 'title',
    notifyKind:  editId ? null : 'event',
    submitLabel: editId ? 'Save changes' : 'Submit for review',
    exitHref:    'dashboard.html?tab=listings',

    buildPreview(s) {
      const prices = (s.ticketTypes || []).map(t => parseFloat(t.price)).filter(n => !isNaN(n));
      const meta = [];
      if (s.date)     meta.push({ icon: 'cal',   text: [s.date, s.time].filter(Boolean).join(' · ') });
      if (s.location) meta.push({ icon: 'pin',   text: [s.location, s.city].filter(Boolean).join(', ') });
      const seats = (s.ticketTypes || []).reduce((n, t) => n + (parseInt(t.available) || 0), 0);
      if (seats)      meta.push({ icon: 'users', text: `${seats} tickets available` });
      return {
        image: s.image, category: s.category, title: s.title,
        description: s.description, meta,
        price: prices.length ? Math.min(...prices) : '',
        priceNote: prices.length ? 'from' : '',
      };
    },

    async onSubmit(s) {
      const payload = toPayload(s);
      if (editId) { await SupabaseAPI.updateEvent(editId, payload); return { id: editId }; }
      return await SupabaseAPI.createEvent(payload);
    },

    successTitle: editId ? 'Changes saved' : 'Event submitted for review',
    successBodyHtml: editId
      ? 'Your event has been updated. If it was already published, the changes are live now.'
      : 'Our team reviews new events within 24 hours. You will get an email as soon as it is approved, and it will then appear publicly on TicketsSA.',
    successActions: [
      { label: 'Go to my listings', href: 'dashboard.html?tab=listings' },
      { label: 'List something else', href: 'create-listing.html' },
    ],
  });

  /* ── Boot: load existing event when editing ──── */
  (async () => {
    if (!editId) { wizard.start(); return; }
    try {
      const ev = await SupabaseAPI.getEvent(editId);
      if (!ev) { Utils.showToast('That event could not be found.', 'error'); wizard.start(); return; }
      wizard.start({
        title: ev.title, category: ev.category, description: ev.description, image: ev.image || '',
        date: ev.date, time: ev.time, endTime: ev.endTime,
        location: ev.location, address: ev.address || '', city: ev.city, province: ev.province || '',
        ticketTypes: (ev.ticketTypes || []).map(t => ({
          name: t.name, price: t.price, available: t.available, description: t.description,
        })),
        refundPolicy: ev.refundPolicy ? 'custom' : '', refundNote: ev.refundPolicy || '',
        paymentType: ev.paymentType || '', paymentLink: ev.paymentLink || '',
        bankName: ev.bankName || '', accountHolder: ev.accountHolder || '',
        accountNumber: ev.accountNumber || '', branchCode: ev.branchCode || '',
        tags: (ev.tags || []).join(', '),
      });
    } catch (e) {
      console.error(e);
      Utils.showToast('Could not load that event. Starting a new listing instead.', 'error');
      wizard.start();
    }
  })();

})();
