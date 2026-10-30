/* ================================================
   Service listing flow (wizard-service.js)
   For providers people book for a date: caterers,
   photographers, DJs, decor... Packages with a price
   (or "on quote") and open dates on a calendar.
   Saved as an `events` document with kind: 'service'.
   ================================================ */

(function () {

  if (!Auth.isLoggedIn()) { window.location.replace('sell.html?type=service&signup=1'); return; }

  const CATEGORIES = ['Catering & Chefs', 'Photography & Video', 'DJs & Music', 'Decor & Hiring', 'Hair & Makeup', 'MCs & Entertainment', 'Transport', 'Cleaning', 'Other'];
  const PROVINCES  = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];
  const editId = Utils.getParam('edit');

  const steps = [
    {
      id: 'basics',
      title: 'Your service',
      hint: 'What do you offer? Customers book you for a date that suits them.',
      fields: [
        { name: 'title', label: 'Service name', type: 'text', required: true,
          placeholder: 'e.g. Chef Ramarumo – Festive Catering',
          help: 'Your business name and what you do.' },
        { name: 'category', label: 'Category', type: 'select', required: true, options: CATEGORIES, placeholder: 'Choose a category…' },
        { name: 'description', label: 'Description', type: 'textarea', required: true, rows: 7,
          placeholder: 'What you offer, what is included, what customers must provide (venue, power, water), and anything else they should know.',
          validate: v => v.trim().length < 40 ? 'Add a bit more detail (at least 40 characters) so customers know what they are booking.' : null },
        { name: 'image', label: 'Photo of your work', type: 'image',
          help: 'A good photo of your food, setup or past work gets far more bookings.' },
      ],
    },
    {
      id: 'area',
      title: 'Where you work',
      hint: 'Customers see this so they know you can come to them.',
      fields: [
        { name: 'city',     label: 'Based in (city or town)', type: 'text', required: true, placeholder: 'e.g. Thohoyandou' },
        { name: 'province', label: 'Province', type: 'select', required: true, options: PROVINCES, placeholder: 'Choose a province…' },
        { name: 'serviceArea', label: 'Areas you travel to', type: 'text',
          placeholder: 'e.g. All of Vhembe, or within 100 km of Thohoyandou',
          help: 'Optional. Leave blank if you only work in your town.' },
      ],
    },
    {
      id: 'packages',
      title: 'Packages',
      hint: 'Add what customers can book. Leave the price empty if you give a quote for each booking.',
      fields: [
        { name: 'packages', label: 'Packages', type: 'repeater', required: true,
          itemLabel: 'Package', addLabel: 'Add another package',
          blank: { name: '', description: '', price: '', unit: 'guest', minGuests: '', maxGuests: '' },
          fields: [
            { name: 'name', label: 'Package name', type: 'text', required: true, placeholder: 'e.g. Breakfast Buffet' },
            { name: 'description', label: 'What is included (optional)', type: 'text', placeholder: 'e.g. Hot breakfast, pastries, juice and coffee' },
            { name: 'price', label: 'Price (leave empty for a quote)', type: 'money', placeholder: 'e.g. 250' },
            { name: 'unit', label: 'Price is', type: 'select', options: [{ value: 'guest', label: 'Per guest' }, { value: 'booking', label: 'Per booking' }] },
            { name: 'minGuests', label: 'Fewest guests', type: 'number', min: 1, placeholder: 'e.g. 10' },
            { name: 'maxGuests', label: 'Most guests', type: 'number', min: 1, placeholder: 'e.g. 50' },
          ],
        },
      ],
      validate(s) {
        const errs = {};
        (s.packages || []).forEach((p, i) => {
          if (p.price !== '' && parseFloat(p.price) < 0) errs[`packages.${i}.price`] = 'Price cannot be negative.';
          if (p.minGuests && p.maxGuests && parseInt(p.maxGuests) < parseInt(p.minGuests)) errs[`packages.${i}.maxGuests`] = 'Must be more than the fewest guests.';
        });
        return errs;
      },
    },
    {
      id: 'dates',
      title: 'Open dates',
      hint: 'Tap the days you are available. Customers can only book those days.',
      fields: [
        { name: 'openDates', label: 'Days you can work', type: 'dates', required: true,
          requiredMsg: 'Pick at least one date customers can book.' },
        { name: 'slotsPerDay', label: 'Bookings you can take per day', type: 'number', required: true, min: 1, max: 20, placeholder: 'e.g. 1',
          help: 'When a day is full, it closes for new requests by itself.' },
      ],
    },
    {
      id: 'payment',
      title: 'How customers pay you',
      hint: 'You accept each request first and confirm the price. Then the customer pays you directly. TicketsSA never holds the money.',
      fields: [
        { name: 'paymentType', label: 'Payment method', type: 'cards', required: true, requiredMsg: 'Choose how customers should pay you.',
          options: [
            { value: 'link', icon: '🔗', label: 'Payment link', sub: 'A Yoco, SnapScan or similar link customers can pay on.' },
            { value: 'bank', icon: '🏦', label: 'Bank transfer', sub: 'Customers get your account details and upload proof of payment.' },
          ] },
        { name: 'paymentLink', label: 'Payment link', type: 'url', required: true, showIf: s => s.paymentType === 'link', placeholder: 'https://pay.yoco.com/…',
          validate: v => /^https?:\/\//i.test(v.trim()) ? null : 'Enter the full link, starting with https://' },
        { name: 'bankName',      label: 'Bank',           type: 'text', required: true, showIf: s => s.paymentType === 'bank', placeholder: 'e.g. Capitec' },
        { name: 'accountHolder', label: 'Account holder', type: 'text', required: true, showIf: s => s.paymentType === 'bank', placeholder: 'Name on the account' },
        { name: 'accountNumber', label: 'Account number', type: 'text', required: true, showIf: s => s.paymentType === 'bank', placeholder: 'e.g. 1234567890' },
        { name: 'branchCode',    label: 'Branch code',    type: 'text', showIf: s => s.paymentType === 'bank', placeholder: 'e.g. 470010' },
        ...Utils.refundFields(),
      ],
    },
  ];

  function toPayload(s) {
    return {
      title: String(s.title || '').trim(), category: s.category, description: String(s.description || '').trim(), image: s.image || null,
      city: String(s.city || '').trim(), province: s.province || null, serviceArea: String(s.serviceArea || '').trim() || null,
      packages: (s.packages || []).map(p => ({ ...p, price: String(p.price ?? '').trim() === '' ? null : p.price })),
      openDates: s.openDates || [], slotsPerDay: s.slotsPerDay,
      paymentType: s.paymentType, paymentLink: s.paymentLink, bankName: s.bankName, accountHolder: s.accountHolder,
      accountNumber: s.accountNumber, branchCode: s.branchCode,
      refundPolicy: Utils.refundPolicyText(s.refundPolicy, s.refundNote),
    };
  }

  const wizard = WizardCore.create({
    category: 'service',
    title: editId ? 'Edit service' : 'List a service',
    steps,
    draftTitleField: 'title',
    notifyKind: editId ? null : 'service',
    submitLabel: editId ? 'Save changes' : 'Submit for review',
    exitHref: 'dashboard.html?tab=listings',
    initialState: { slotsPerDay: '1' },

    buildPreview(s) {
      const prices = (s.packages || []).map(p => parseFloat(p.price)).filter(n => !isNaN(n));
      const meta = [];
      if (s.city) meta.push({ icon: 'pin', text: [s.city, s.province].filter(Boolean).join(', ') });
      if ((s.openDates || []).length) meta.push({ icon: 'cal', text: `${s.openDates.length} open dates` });
      return { image: s.image, category: s.category, title: s.title, description: s.description, meta,
        price: prices.length ? Math.min(...prices) : '', priceNote: prices.length ? 'from' : 'on quote' };
    },

    async onSubmit(s) {
      const payload = toPayload(s);
      if (editId) return await SupabaseAPI.updateService(editId, payload);
      return await SupabaseAPI.createService(payload);
    },

    successTitle: editId ? 'Changes saved' : 'Service submitted for review',
    successBodyHtml: editId
      ? 'Your service has been updated. If it was already live, the changes show now.'
      : 'Our team checks new listings within 24 hours. You will get an email with your link to share once it is live.',
    successActions: [
      { label: 'Go to my listings', href: 'dashboard.html?tab=listings' },
      { label: 'List something else', href: 'sell.html' },
    ],
  });

  (async () => {
    if (!editId) { wizard.start(); return; }
    try {
      const sv = await SupabaseAPI.getEvent(editId);
      if (!sv || sv.kind !== 'service') { Utils.showToast('That service could not be found.', 'error'); wizard.start(); return; }
      wizard.start({
        title: sv.title, category: sv.category, description: sv.description, image: sv.image || '',
        city: sv.city || '', province: sv.province || '', serviceArea: sv.serviceArea || '',
        packages: sv.packages.map(p => ({ id: p.id, name: p.name, description: p.description, price: p.price === null ? '' : p.price, unit: p.unit, minGuests: p.minGuests || '', maxGuests: p.maxGuests || '' })),
        openDates: sv.openDates, slotsPerDay: String(sv.slotsPerDay || 1),
        paymentType: sv.paymentType || '', paymentLink: sv.paymentLink || '', bankName: sv.bankName || '', accountHolder: sv.accountHolder || '',
        accountNumber: sv.accountNumber || '', branchCode: sv.branchCode || '',
        refundPolicy: sv.refundPolicy ? 'custom' : '', refundNote: sv.refundPolicy || '',
      });
    } catch (e) {
      console.error(e);
      Utils.showToast('Could not load that service. Starting a new listing instead.', 'error');
      wizard.start();
    }
  })();
})();
