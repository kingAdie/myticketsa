/* ================================================
   Equipment hire listing flow (wizard-equipment.js)

   IMPORTANT distinction:
   This is the SUPPLIER side "I own gear and want to
   rent it out". It is NOT the same as the customer-side
   "Request equipment for my event" flow, which writes to
   the `equipment_requests` table and stays exactly as it
   was. Writing supplier offers into that table would put
   them in the admin's incoming-request queue as if a
   customer were asking to hire something.

   There is no equipment-inventory table yet, so this
   collects the full listing and hands it to the team via
   the submit-seller-application function. The UI says so
   plainly rather than implying an instant live listing.
   ================================================ */

(function () {

  if (!Auth.isLoggedIn()) { window.location.replace('sell.html'); return; }
  const role = Auth.getUser()?.role;
  if (role !== 'organiser' && role !== 'admin') { window.location.replace('sell.html'); return; }

  const user = Auth.getUser() || {};

  const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];

  const CATEGORIES = [
    { value: 'Sound & Audio', icon: '🔊', label: 'Sound & Audio', sub: 'PA systems, speakers, mixers, microphones.' },
    { value: 'Power',         icon: '⚡', label: 'Power',         sub: 'Generators, distribution boards, cabling.' },
    { value: 'Lighting',      icon: '💡', label: 'Lighting',      sub: 'Stage lighting, uplighters, festoon.' },
    { value: 'Furniture',     icon: '🪑', label: 'Furniture',     sub: 'Tables, chairs, couches, decor.' },
    { value: 'Tents',         icon: '⛺', label: 'Tents & Marquees', sub: 'Stretch tents, marquees, gazebos.' },
    { value: 'Toilets',       icon: '🚻', label: 'Mobile Toilets', sub: 'Portable and luxury ablution units.' },
    { value: 'Cooling',       icon: '🧊', label: 'Cooling',       sub: 'Mobile freezers, fridges, cold rooms.' },
    { value: 'Stages',        icon: '🎪', label: 'Stages & Rigging', sub: 'Stage decks, trussing, barriers.' },
    { value: 'Other',         icon: '📦', label: 'Something else', sub: 'Anything else you hire out for events.' },
  ];

  const steps = [
    {
      id: 'category',
      title: 'What are you renting out?',
      hint: 'Pick the category that fits best. You can list more items after this one.',
      fields: [
        { name: '_supplierNote', type: 'info',
          html: '<strong>How equipment listings work right now:</strong> you fill this in once, and our team sets the listing up and handles enquiries with you. Self-serve equipment listings, with your own live availability and instant booking, are being built next.' },
        { name: 'category', label: 'Equipment category', type: 'cards', required: true,
          requiredMsg: 'Choose the category your equipment falls under.', options: CATEGORIES },
      ],
    },

    {
      id: 'item',
      title: 'Tell us about the equipment',
      hint: 'Be specific customers compare on spec, not just price.',
      fields: [
        { name: 'title', label: 'Equipment name', type: 'text', required: true,
          placeholder: 'e.g. 6.5kVA Silent Diesel Generator',
          help: 'Include size, model or capacity where it matters.' },
        { name: 'description', label: 'Description', type: 'textarea', required: true, rows: 6,
          placeholder: 'What is included, what it powers or seats, condition, whether an operator is provided, anything the customer should know.',
          validate: v => v.trim().length < 40 ? 'Add a bit more detail at least 40 characters.' : null },
        { name: 'quantity', label: 'Quantity available', type: 'number', required: true, min: 1,
          placeholder: 'e.g. 4', help: 'How many of this item can you hire out at once?' },
        { name: 'images', label: 'Photos', type: 'images', max: 6,
          help: 'Real photos of your actual equipment build far more trust than stock images.' },
      ],
    },

    {
      id: 'pricing',
      title: 'Pricing & deposit',
      hint: 'Give your standard rate. You can still quote differently for big jobs.',
      fields: [
        { name: 'price', label: 'Rental price', type: 'money', required: true, placeholder: '0.00' },
        { name: 'period', label: 'Rental period', type: 'cards', required: true,
          requiredMsg: 'Choose what that price covers.',
          options: [
            { value: 'per day',     icon: '📅', label: 'Per day',     sub: 'Charged for each day of hire.' },
            { value: 'per weekend', icon: '🗓️', label: 'Per weekend', sub: 'Friday to Sunday.' },
            { value: 'per week',    icon: '📆', label: 'Per week',    sub: 'Seven days.' },
            { value: 'per event',   icon: '🎪', label: 'Per event',   sub: 'Flat rate for the whole event.' },
          ] },
        { name: 'deposit', label: 'Refundable deposit (optional)', type: 'money', placeholder: '0.00',
          help: 'Leave blank if you do not take a deposit.' },
      ],
    },

    {
      id: 'service',
      title: 'Delivery & setup',
      hint: 'Customers filter on this it is often the deciding factor.',
      fields: [
        { name: 'delivery', label: 'Do you deliver?', type: 'cards', required: true,
          requiredMsg: 'Let customers know whether you deliver.',
          options: [
            { value: 'Delivery included',   icon: '🚚', label: 'Yes, included',      sub: 'Delivery and collection are part of the price.' },
            { value: 'Delivery at a fee',   icon: '💸', label: 'Yes, for a fee',     sub: 'Charged based on distance.' },
            { value: 'Collection only',     icon: '🏠', label: 'Collection only',    sub: 'The customer fetches it from you.' },
          ] },
        { name: 'setup', label: 'Do you set up on site?', type: 'cards', required: true,
          requiredMsg: 'Let customers know whether you set up.',
          options: [
            { value: 'Setup included', icon: '🔧', label: 'Yes, included',  sub: 'Your team sets up and breaks down.' },
            { value: 'Setup at a fee', icon: '🛠️', label: 'Yes, for a fee', sub: 'Setup available as an extra.' },
            { value: 'No setup',       icon: '📦', label: 'No',             sub: 'The customer handles setup.' },
          ] },
        { name: 'serviceArea', label: 'Areas you serve', type: 'text',
          placeholder: 'e.g. Mbombela, White River and surrounds up to 80km',
          help: 'Helps us match you to the right enquiries.' },
      ],
    },

    {
      id: 'where',
      title: 'Where are you based?',
      hint: 'We show customers the closest suppliers first.',
      fields: [
        { name: 'province', label: 'Province', type: 'select', required: true, options: PROVINCES, placeholder: 'Choose a province…' },
        { name: 'city',     label: 'City / town', type: 'text', required: true, placeholder: 'e.g. Mbombela' },
        { name: 'availability', label: 'Availability notes (optional)', type: 'textarea', rows: 3,
          placeholder: 'e.g. Booked most December weekends, need 48 hours notice, not available over Easter.' },
      ],
    },

    {
      id: 'contact',
      title: 'How we reach you',
      hint: 'We use this to confirm the listing and pass enquiries to you.',
      fields: [
        { name: 'contactName',  label: 'Contact name',  type: 'text',  required: true,
          placeholder: 'Who should we speak to?' },
        { name: 'contactPhone', label: 'Contact number', type: 'tel',  required: true, placeholder: 'e.g. 082 123 4567' },
        { name: 'contactEmail', label: 'Contact email',  type: 'email', required: true,
          placeholder: 'you@example.co.za',
          validate: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : 'Enter a valid email address.' },
        { name: 'business', label: 'Business name (optional)', type: 'text', placeholder: 'Registered or trading name' },
      ],
    },
  ];

  const wizard = WizardCore.create({
    category:    'equipment',
    title:       'List equipment for hire',
    steps,
    draftTitleField: 'title',
    submitLabel: 'Submit listing',
    exitHref:    'dashboard.html?tab=listings',
    previewLabel: 'How your hire listing will read',

    initialState: {
      contactName:  [user.firstName, user.lastName].filter(Boolean).join(' '),
      contactEmail: user.email || '',
    },

    buildPreview(s) {
      const meta = [];
      if (s.city || s.province) meta.push({ icon: 'pin', text: [s.city, s.province].filter(Boolean).join(', ') });
      if (s.quantity) meta.push({ icon: 'users', text: `${s.quantity} available` });
      if (s.delivery) meta.push({ icon: 'clock', text: s.delivery });
      return {
        image: (s.images || [])[0],
        category: s.category, title: s.title, description: s.description, meta,
        price: s.price, priceNote: s.period || '',
      };
    },

    async onSubmit(s) {
      return await SellerApply.submit('equipment', {
        title:        String(s.title || '').trim(),
        contactName:  String(s.contactName || '').trim(),
        contactEmail: String(s.contactEmail || '').trim(),
        contactPhone: String(s.contactPhone || '').trim(),
        details: SellerApply.detailsFrom([
          ['Category',          s.category],
          ['Description',       s.description],
          ['Quantity available', s.quantity],
          ['Rental price',      s.price ? `R${s.price} ${s.period || ''}`.trim() : ''],
          ['Deposit',           s.deposit ? `R${s.deposit}` : ''],
          ['Delivery',          s.delivery],
          ['Setup',             s.setup],
          ['Service area',      s.serviceArea],
          ['Based in',          [s.city, s.province].filter(Boolean).join(', ')],
          ['Availability notes', s.availability],
          ['Business name',     s.business],
          ['Photos supplied',   (s.images || []).length ? `${s.images.length} attached in the seller's browser — request from supplier` : 'None'],
        ]),
      });
    },

    successTitle: 'Equipment listing submitted',
    successBodyHtml: 'Thanks — we have everything we need. Our team will call or email you within one working day to confirm the details and get your equipment listed. Keep an eye on your inbox for the confirmation we just sent.',
    successActions: [
      { label: 'Back to Seller Hub', href: 'dashboard.html' },
      { label: 'List something else', href: 'create-listing.html' },
    ],
  });

  wizard.start();

})();
