/* ================================================
   Accommodation listing flow (wizard-accommodation.js)

   Deliberately shares NO fields with the event flow.
   Writes through SupabaseAPI.createAccommodation into
   the existing `accommodations` table.

   Mapping note: the table has no columns for place type
   or bedrooms/beds/bathrooms. `space_types` is JSONB, so
   those details are stored as extra keys on each room
   entry nothing is silently dropped. A dedicated column
   is part of the deferred schema work.
   ================================================ */

(function () {

  if (!Auth.isLoggedIn()) { window.location.replace('sell.html?type=accommodation&signup=1'); return; }

  const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];

  const PLACE_TYPES = [
    { value: 'Apartment',  icon: '🏢', label: 'Apartment',  sub: 'A self-contained flat in a block or complex.' },
    { value: 'House',      icon: '🏡', label: 'House',      sub: 'A whole house guests have to themselves.' },
    { value: 'Guesthouse', icon: '🏘️', label: 'Guesthouse', sub: 'Rooms in a guesthouse, usually with breakfast.' },
    { value: 'Lodge',      icon: '🌿', label: 'Lodge',      sub: 'A bush, river or game lodge.' },
    { value: 'Hotel',      icon: '🏨', label: 'Hotel',      sub: 'A hotel with a reception and multiple rooms.' },
    { value: 'B&B',        icon: '☕', label: 'B&B',        sub: 'Bed and breakfast, host usually on site.' },
    { value: 'Villa',      icon: '🏖️', label: 'Villa',      sub: 'A large private home, often with a pool.' },
    { value: 'Farm stay',  icon: '🚜', label: 'Farm stay',  sub: 'A stay on a working farm or smallholding.' },
    { value: 'Other',      icon: '🛏️', label: 'Something else', sub: 'Cabins, cottages, backpackers and more.' },
  ];

  const AMENITIES = [
    'WiFi', 'Free parking', 'Swimming pool', 'Kitchen', 'TV', 'Air conditioning',
    'Braai area', 'Breakfast included', 'Washing machine', 'Pet friendly',
    'Wheelchair accessible', 'Backup power', 'Security / gated', 'Garden',
    'Hot tub', 'Gym', 'Airport shuttle', 'Family friendly',
  ];

  const steps = [
    {
      id: 'type',
      title: 'What type of place are you listing?',
      hint: 'Pick the closest match. It helps guests know what to expect before they open your listing.',
      fields: [
        { name: 'placeType', label: 'Type of place', type: 'cards', required: true,
          requiredMsg: 'Choose the type of place you are listing.', options: PLACE_TYPES },
      ],
    },

    {
      id: 'location',
      title: 'Where is it?',
      hint: 'Guests search by town and province, so these matter most.',
      fields: [
        { name: 'province', label: 'Province', type: 'select', required: true, options: PROVINCES, placeholder: 'Choose a province…' },
        { name: 'city',     label: 'City / town', type: 'text', required: true, placeholder: 'e.g. Hazyview' },
        { name: 'address',  label: 'Street address', type: 'text',
          placeholder: 'e.g. 12 Sabie Road, Hazyview',
          help: 'Shared with guests once a booking is confirmed.' },
      ],
    },

    {
      id: 'space',
      title: 'What can guests book?',
      hint: 'Add each room or unit you rent out. If guests book the whole place, one entry is enough.',
      fields: [
        { name: 'spaceTypes', label: 'Rooms & units', type: 'repeater', required: true,
          itemLabel: 'Room / unit', addLabel: 'Add another room or unit',
          blank: { name: '', price: '', capacity: '', bedrooms: '', beds: '', bathrooms: '' },
          fields: [
            { name: 'name',      label: 'Name',  type: 'text',  required: true, placeholder: 'e.g. Entire apartment, Double room, Family unit' },
            { name: 'price',     label: 'Price per night', type: 'money', required: true, placeholder: '0.00' },
            { name: 'capacity',  label: 'Sleeps (guests)', type: 'number', required: true, min: 1, placeholder: 'e.g. 4' },
            { name: 'bedrooms',  label: 'Bedrooms',  type: 'number', min: 0, placeholder: 'e.g. 2' },
            { name: 'beds',      label: 'Beds',      type: 'number', min: 0, placeholder: 'e.g. 3' },
            { name: 'bathrooms', label: 'Bathrooms', type: 'number', min: 0, placeholder: 'e.g. 1' },
          ],
        },
      ],
    },

    {
      id: 'amenities',
      title: 'What does your place offer?',
      hint: 'Tap everything that applies. Guests filter on these, so be generous but accurate.',
      fields: [
        { name: 'amenities', label: 'Amenities', type: 'chips', options: AMENITIES },
      ],
    },

    {
      id: 'photos',
      title: 'Add photos',
      hint: 'Listings with real photos get far more enquiries. The first photo is the cover guests see in search.',
      fields: [
        { name: 'images', label: 'Photos', type: 'images', max: 8,
          help: 'Add up to 8. Drag order matters use the arrows to put your best photo first.' },
      ],
    },

    {
      id: 'describe',
      title: 'Describe your place',
      hint: 'This is what convinces someone to book. Write it like you are telling a friend.',
      fields: [
        { name: 'name', label: 'Listing title', type: 'text', required: true,
          placeholder: 'e.g. Riverside Cottage with Mountain Views',
          maxlength: 90,
          help: 'Short and appealing. Max 90 characters.' },
        { name: 'description', label: 'Description', type: 'textarea', required: true, rows: 8,
          placeholder: 'What makes the place special? Who is it best for? What is nearby restaurants, Kruger gates, town centre? Anything guests should know before booking.',
          validate: v => v.trim().length < 60 ? 'Add a little more at least 60 characters gives guests enough to go on.' : null },
      ],
    },

    {
      id: 'pricing',
      title: 'Pricing & check-in',
      hint: 'The nightly rate you show here is what guests see first in search results.',
      fields: [
        { name: 'priceFrom', label: 'Nightly rate from', type: 'money', required: true, placeholder: '0.00',
          help: 'Your lowest nightly price across the rooms above.',
          validate: v => parseFloat(v) <= 0 ? 'Enter the nightly rate guests would pay.' : null },
        { name: 'checkInTime',  label: 'Check-in from',  type: 'time', help: 'Defaults to 14:00 if left blank.' },
        { name: 'checkOutTime', label: 'Check-out by',   type: 'time', help: 'Defaults to 10:00 if left blank.' },
        { name: 'starRating',   label: 'Star grading (optional)', type: 'select',
          options: [
            { value: '0', label: 'Not graded' }, { value: '1', label: '1 star' }, { value: '2', label: '2 star' },
            { value: '3', label: '3 star' }, { value: '4', label: '4 star' }, { value: '5', label: '5 star' },
          ],
          placeholder: 'Not graded',
          help: 'Only select a grading if your property is officially graded.' },
        ...Utils.refundFields(),
        { name: '_availNote', type: 'info',
          html: '<strong>Availability:</strong> guests send you a booking enquiry with their dates, and you confirm the ones you can take. A self-serve availability calendar is coming later you do not need to block out dates here.' },
      ],
    },

    {
      id: 'contact',
      title: 'How guests reach you',
      hint: 'We pass these on when someone makes a booking enquiry.',
      fields: [
        { name: 'contactPhone', label: 'Contact number', type: 'tel', required: true, placeholder: 'e.g. 082 123 4567' },
        { name: 'contactEmail', label: 'Contact email', type: 'email',
          placeholder: 'you@example.co.za',
          help: 'Leave blank to use your account email.',
          validate: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : 'Enter a valid email address.' },
        { name: 'website', label: 'Website (optional)', type: 'url', placeholder: 'https://…',
          validate: v => /^https?:\/\//i.test(v.trim()) ? null : 'Start the address with https://' },
      ],
    },
  ];

  const wizard = WizardCore.create({
    category:    'accommodation',
    title:       'List accommodation',
    steps,
    draftTitleField: 'name',
    notifyKind:  'accommodation',
    submitLabel: 'Submit for review',
    exitHref:    'dashboard.html?tab=listings',

    buildPreview(s) {
      const meta = [];
      if (s.city || s.province) meta.push({ icon: 'pin', text: [s.city, s.province].filter(Boolean).join(', ') });
      const sleeps = (s.spaceTypes || []).reduce((n, r) => n + (parseInt(r.capacity) || 0), 0);
      if (sleeps) meta.push({ icon: 'users', text: `Sleeps up to ${sleeps}` });
      if (s.checkInTime) meta.push({ icon: 'clock', text: `Check-in from ${s.checkInTime}` });
      return {
        image: (s.images || [])[0],
        category: s.placeType,
        title: s.name,
        description: s.description,
        meta,
        price: s.priceFrom,
        priceNote: 'per night',
      };
    },

    async onSubmit(s) {
      const spaceTypes = (s.spaceTypes || [])
        .filter(r => r && String(r.name || '').trim())
        .map(r => ({
          name:      String(r.name).trim(),
          price:     parseFloat(r.price) || 0,
          capacity:  parseInt(r.capacity) || null,
          // extra JSONB keys existing readers ignore what they don't use
          placeType: s.placeType || null,
          bedrooms:  r.bedrooms  === '' ? null : parseInt(r.bedrooms),
          beds:      r.beds      === '' ? null : parseInt(r.beds),
          bathrooms: r.bathrooms === '' ? null : parseInt(r.bathrooms),
        }));

      return await SupabaseAPI.createAccommodation({
        name:         String(s.name || '').trim(),
        description:  String(s.description || '').trim(),
        province:     s.province,
        city:         String(s.city || '').trim(),
        address:      String(s.address || '').trim(),
        checkInTime:  s.checkInTime  || '14:00',
        checkOutTime: s.checkOutTime || '10:00',
        priceFrom:    parseFloat(s.priceFrom) || 0,
        starRating:   parseInt(s.starRating) || 0,
        amenities:    Array.isArray(s.amenities) ? s.amenities : [],
        spaceTypes,
        images:       Array.isArray(s.images) ? s.images : [],
        refundPolicy: Utils.refundPolicyText(s.refundPolicy, s.refundNote),
        contactEmail: String(s.contactEmail || '').trim(),
        contactPhone: String(s.contactPhone || '').trim(),
        website:      String(s.website || '').trim(),
      });
    },

    successTitle: 'Accommodation submitted for review',
    successBodyHtml: 'Our team checks new stays within 24 hours, mostly to make sure the photos and details are clear. You will get an email once it is live and guests can start sending booking enquiries.',
    successActions: [
      { label: 'Go to my listings', href: 'dashboard.html?tab=listings' },
      { label: 'List something else', href: 'create-listing.html' },
    ],
  });

  wizard.start();

})();
