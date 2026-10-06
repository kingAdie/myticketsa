/* ================================================
   Experience / tour listing flow (wizard-experience.js)

   Experiences sell through the existing events +
   ticket_types tables (category "Travel & Tours"),
   which is how the current Travel & Tours form already
   works. There is no separate experiences table yet, so
   duration / inclusions / meeting point / requirements
   are composed into the published description the
   review step shows the exact text that will go live,
   so nothing is added behind the seller's back.
   ================================================ */

(function () {

  if (!Auth.isLoggedIn()) { window.location.replace('sell.html?type=experience&signup=1'); return; }

  const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];

  const TYPES = [
    { value: 'Guided tour',     icon: '🧭', label: 'Guided tour',      sub: 'City, township, heritage or walking tours.' },
    { value: 'Safari & nature', icon: '🦁', label: 'Safari & nature',  sub: 'Game drives, hikes, nature experiences.' },
    { value: 'Adventure',       icon: '🪂', label: 'Adventure',        sub: 'Zip lining, rafting, quad biking, diving.' },
    { value: 'Food & wine',     icon: '🍷', label: 'Food & wine',      sub: 'Tastings, food tours, cooking classes.' },
    { value: 'Day trip',        icon: '🚐', label: 'Day trip',         sub: 'A full day out, transport included.' },
    { value: 'Multi-day tour',  icon: '🧳', label: 'Multi-day package', sub: 'Two or more days, often with a stay.' },
    { value: 'Transport',       icon: '🚌', label: 'Transport / shuttle', sub: 'Buses and shuttles to an event or destination.' },
    { value: 'Other',           icon: '✨', label: 'Something else',   sub: 'Workshops, classes and other experiences.' },
  ];

  const INCLUSIONS = [
    'Transport', 'Entrance fees', 'Meals', 'Drinks', 'Guide', 'Equipment hire',
    'Accommodation', 'Photos', 'Insurance', 'Refreshments', 'Pickup from your hotel',
  ];

  const steps = [
    {
      id: 'type',
      title: 'What kind of experience is it?',
      hint: 'This helps travellers find you when they browse.',
      fields: [
        { name: 'expType', label: 'Experience type', type: 'cards', required: true,
          requiredMsg: 'Choose the type of experience.', options: TYPES },
      ],
    },

    {
      id: 'about',
      title: 'About the experience',
      hint: 'Sell the moment, not the itinerary. What will people remember?',
      fields: [
        { name: 'title', label: 'Experience name', type: 'text', required: true,
          placeholder: 'e.g. Panorama Route Full-Day Tour from Hazyview' },
        { name: 'description', label: 'Description', type: 'textarea', required: true, rows: 7,
          placeholder: 'What happens, where you go, what makes it special, who it suits best.',
          validate: v => v.trim().length < 50 ? 'Add a little more at least 50 characters.' : null },
        { name: 'image', label: 'Main photo', type: 'image',
          help: 'The photo travellers see first. Landscape shots work best.' },
      ],
    },

    {
      id: 'logistics',
      title: 'When & where',
      hint: 'Travellers need to know exactly where to be and for how long.',
      fields: [
        { name: 'date', label: 'Date',       type: 'date', required: true,
          help: 'Listing one departure for now? Add the next date you are running it.' },
        { name: 'time', label: 'Start time', type: 'time', required: true },
        { name: 'duration', label: 'Duration', type: 'text', required: true,
          placeholder: 'e.g. 8 hours, 2 days, half day' },
        { name: 'meetingPoint', label: 'Meeting point', type: 'text', required: true,
          placeholder: 'e.g. Hazyview Spar parking, R40',
          help: 'Exactly where guests should arrive.' },
        { name: 'city',     label: 'City / town', type: 'text', required: true, placeholder: 'e.g. Hazyview' },
        { name: 'province', label: 'Province', type: 'select', required: true, options: PROVINCES, placeholder: 'Choose a province…' },
      ],
    },

    {
      id: 'details',
      title: 'What is included',
      hint: 'Being clear here prevents most complaints and refund requests.',
      fields: [
        { name: 'inclusions', label: 'Included in the price', type: 'chips', options: INCLUSIONS },
        { name: 'requirements', label: 'What guests need to know', type: 'textarea', rows: 4,
          placeholder: 'e.g. Minimum age 12. Bring walking shoes, sunscreen and a jacket. Not suitable for people with back injuries.',
          help: 'Age limits, fitness level, what to bring, what to wear.' },
      ],
    },

    {
      id: 'pricing',
      title: 'Price & capacity',
      hint: 'Guests book and pay you directly using the details on the next step.',
      fields: [
        { name: 'price', label: 'Price per person', type: 'money', required: true, placeholder: '0.00' },
        { name: 'capacity', label: 'Maximum guests', type: 'number', required: true, min: 1,
          placeholder: 'e.g. 12', help: 'How many people can join one departure?' },
      ],
    },

    {
      id: 'payment',
      title: 'How guests pay you',
      hint: 'TicketsSA issues the booking confirmation. Payment goes straight to you.',
      fields: [
        { name: 'paymentType', label: 'Payment method', type: 'cards', required: true,
          requiredMsg: 'Choose how guests should pay you.',
          options: [
            { value: 'link', icon: '🔗', label: 'Payment link',  sub: 'Yoco, PayFast, SnapScan or similar.' },
            { value: 'bank', icon: '🏦', label: 'Bank transfer', sub: 'Guests EFT you directly.' },
            { value: 'free', icon: '🎁', label: 'Free',          sub: 'No payment needed to join.' },
          ] },
        { name: 'paymentLink', label: 'Payment link', type: 'url', required: true, showIf: s => s.paymentType === 'link',
          placeholder: 'https://pay.yoco.com/…',
          validate: v => /^https?:\/\//i.test(v.trim()) ? null : 'Enter the full link, starting with https://' },
        { name: 'bankName',      label: 'Bank',           type: 'text', required: true, showIf: s => s.paymentType === 'bank', placeholder: 'e.g. FNB' },
        { name: 'accountHolder', label: 'Account holder', type: 'text', required: true, showIf: s => s.paymentType === 'bank', placeholder: 'Name on the account' },
        { name: 'accountNumber', label: 'Account number', type: 'text', required: true, showIf: s => s.paymentType === 'bank', placeholder: 'e.g. 62012345678' },
        { name: 'branchCode',    label: 'Branch code',    type: 'text', showIf: s => s.paymentType === 'bank', placeholder: 'e.g. 250655' },
      ],
    },
  ];

  /** Compose the description that will actually be published. */
  function publishedDescription(s) {
    const parts = [String(s.description || '').trim()];
    if (s.duration)     parts.push(`Duration: ${s.duration}`);
    if ((s.inclusions || []).length) parts.push(`Included: ${s.inclusions.join(', ')}`);
    if (s.meetingPoint) parts.push(`Meeting point: ${s.meetingPoint}`);
    if (s.requirements) parts.push(`Good to know: ${String(s.requirements).trim()}`);
    return parts.filter(Boolean).join('\n\n');
  }

  const wizard = WizardCore.create({
    category:    'experience',
    title:       'List an experience',
    steps,
    draftTitleField: 'title',
    notifyKind:  'experience',
    submitLabel: 'Submit for review',
    exitHref:    'dashboard.html?tab=listings',
    previewLabel: 'Exactly how your experience will be published',

    buildPreview(s) {
      const meta = [];
      if (s.date) meta.push({ icon: 'cal', text: [s.date, s.time].filter(Boolean).join(' · ') });
      if (s.meetingPoint || s.city) meta.push({ icon: 'pin', text: [s.meetingPoint, s.city].filter(Boolean).join(', ') });
      if (s.duration) meta.push({ icon: 'clock', text: s.duration });
      if (s.capacity) meta.push({ icon: 'users', text: `Up to ${s.capacity} guests` });
      return {
        image: s.image, category: s.expType, title: s.title,
        description: publishedDescription(s), meta,
        price: s.price, priceNote: 'per person',
      };
    },

    async onSubmit(s) {
      return await SupabaseAPI.createEvent({
        title:       String(s.title || '').trim(),
        category:    'Travel & Tours',
        date:        s.date,
        time:        s.time,
        endTime:     s.time,
        location:    String(s.meetingPoint || '').trim(),
        address:     String(s.meetingPoint || '').trim(),
        city:        String(s.city || '').trim(),
        province:    s.province || null,
        description: publishedDescription(s),
        image:       s.image || null,
        price:       parseFloat(s.price) || 0,
        ticketTypes: [{
          name:        s.expType || 'Experience booking',
          description: s.duration ? `${s.expType || 'Experience'} · ${s.duration}` : (s.expType || 'Experience booking'),
          price:       parseFloat(s.price) || 0,
          available:   parseInt(s.capacity) || 1,
        }],
        tags: [s.expType, 'experience'].filter(Boolean),
        paymentType:   s.paymentType || null,
        paymentLink:   s.paymentType === 'link' ? (s.paymentLink || null) : null,
        bankName:      s.paymentType === 'bank' ? (s.bankName || null) : null,
        accountHolder: s.paymentType === 'bank' ? (s.accountHolder || null) : null,
        accountNumber: s.paymentType === 'bank' ? (s.accountNumber || null) : null,
        branchCode:    s.paymentType === 'bank' ? (s.branchCode || null) : null,
      });
    },

    successTitle: 'Experience submitted for review',
    successBodyHtml: 'We review new experiences within 24 hours. Once approved it appears under Experiences on TicketsSA and travellers can book it straight away.',
    successActions: [
      { label: 'Go to my listings', href: 'dashboard.html?tab=listings' },
      { label: 'List something else', href: 'create-listing.html' },
    ],
  });

  wizard.start();

})();
