/* ================================================
   Merchandise listing flow (wizard-merchandise.js)

   There is no products table in Supabase yet, so this
   collects the full product listing and hands it to the
   team via submit-seller-application. The first step
   states that plainly the seller is never told their
   product is live when it isn't.
   ================================================ */

(function () {

  if (!Auth.isLoggedIn()) { window.location.replace('sell.html?type=merchandise&signup=1'); return; }

  const user = Auth.getUser() || {};

  const CATEGORIES = [
    { value: 'Apparel',      icon: '👕', label: 'Apparel',        sub: 'T-shirts, hoodies, caps, jerseys.' },
    { value: 'Drinkware',    icon: '🥤', label: 'Drinkware',      sub: 'Cups, bottles, flasks, glasses.' },
    { value: 'Accessories',  icon: '🎒', label: 'Accessories',    sub: 'Bags, lanyards, wristbands, keyrings.' },
    { value: 'Event branding', icon: '🏷️', label: 'Event branding', sub: 'Tags, banners, printed signage.' },
    { value: 'Music & media', icon: '💿', label: 'Music & media', sub: 'Vinyl, CDs, prints, posters.' },
    { value: 'Other',        icon: '🛍️', label: 'Something else', sub: 'Any other product you sell.' },
  ];

  const DELIVERY = [
    { value: 'Nationwide courier',   icon: '📦', label: 'Nationwide courier', sub: 'You ship anywhere in South Africa.' },
    { value: 'Local delivery',       icon: '🛵', label: 'Local delivery',     sub: 'You deliver in your own area only.' },
    { value: 'Collection only',      icon: '🏠', label: 'Collection only',    sub: 'Buyers collect from you.' },
    { value: 'Delivery at events',   icon: '🎪', label: 'At the event',       sub: 'Buyers collect at the event itself.' },
  ];

  const steps = [
    {
      id: 'category',
      title: 'What are you selling?',
      hint: 'Start with one product. You can add more once you are set up.',
      fields: [
        { name: '_note', type: 'info',
          html: '<strong>Merchandise is in early access.</strong> Fill this in and our team sets your product up and handles the first orders with you. Self-serve product listings, with stock and variants you manage yourself, are next on the roadmap.' },
        { name: 'category', label: 'Product category', type: 'cards', required: true,
          requiredMsg: 'Choose a product category.', options: CATEGORIES },
      ],
    },

    {
      id: 'product',
      title: 'About the product',
      hint: 'Write it the way you would describe it to a customer at a stall.',
      fields: [
        { name: 'title', label: 'Product name', type: 'text', required: true,
          placeholder: 'e.g. Festival Logo T-Shirt 2026' },
        { name: 'description', label: 'Description', type: 'textarea', required: true, rows: 6,
          placeholder: 'Material, fit, print quality, what makes it worth buying.',
          validate: v => v.trim().length < 30 ? 'Add a bit more detail at least 30 characters.' : null },
        { name: 'images', label: 'Product photos', type: 'images', max: 6,
          help: 'Photos of the actual product sell far better than mockups.' },
      ],
    },

    {
      id: 'pricing',
      title: 'Price & stock',
      hint: 'What you charge per unit, and how many you have ready.',
      fields: [
        { name: 'price', label: 'Price per item', type: 'money', required: true, placeholder: '0.00' },
        { name: 'stock', label: 'Stock on hand',  type: 'number', required: true, min: 0,
          placeholder: 'e.g. 50', help: 'Enter 0 if you make each item to order.' },
        { name: 'madeToOrder', label: 'Lead time (optional)', type: 'text',
          placeholder: 'e.g. 5 working days for new print runs' },
      ],
    },

    {
      id: 'variants',
      title: 'Sizes, colours & variants',
      hint: 'Skip anything that does not apply to your product.',
      fields: [
        { name: 'sizes', label: 'Sizes available', type: 'chips',
          options: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'One size', 'Kids'] },
        { name: 'colours', label: 'Colours available', type: 'text',
          placeholder: 'e.g. Black, White, Forest Green',
          help: 'Separate with commas.' },
        { name: 'variants', label: 'Other variants (optional)', type: 'text',
          placeholder: 'e.g. Mens and ladies cut, 500ml and 750ml' },
      ],
    },

    {
      id: 'fulfilment',
      title: 'Getting it to buyers',
      hint: 'How the customer receives their order.',
      fields: [
        { name: 'delivery', label: 'Delivery method', type: 'cards', required: true,
          requiredMsg: 'Choose how buyers receive their order.', options: DELIVERY },
        { name: 'deliveryFee', label: 'Delivery fee (optional)', type: 'money', placeholder: '0.00',
          showIf: s => s.delivery === 'Nationwide courier' || s.delivery === 'Local delivery',
          help: 'Leave blank if delivery is free or quoted per order.' },
      ],
    },

    {
      id: 'seller',
      title: 'Seller details',
      hint: 'Buyers see your seller name; we use the rest to reach you.',
      fields: [
        { name: 'business',     label: 'Seller / brand name', type: 'text', required: true,
          placeholder: 'The name buyers will see' },
        { name: 'contactName',  label: 'Contact name',  type: 'text',  required: true },
        { name: 'contactPhone', label: 'Contact number', type: 'tel',  required: true, placeholder: 'e.g. 082 123 4567' },
        { name: 'contactEmail', label: 'Contact email',  type: 'email', required: true,
          placeholder: 'you@example.co.za',
          validate: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : 'Enter a valid email address.' },
      ],
    },
  ];

  const wizard = WizardCore.create({
    category:    'merchandise',
    title:       'Sell merchandise',
    steps,
    draftTitleField: 'title',
    submitLabel: 'Submit product',
    exitHref:    'dashboard.html?tab=listings',
    previewLabel: 'How your product will read',

    initialState: {
      contactName:  [user.firstName, user.lastName].filter(Boolean).join(' '),
      contactEmail: user.email || '',
    },

    buildPreview(s) {
      const meta = [];
      if (s.stock)    meta.push({ icon: 'users', text: `${s.stock} in stock` });
      if ((s.sizes || []).length) meta.push({ icon: 'clock', text: `Sizes: ${s.sizes.join(', ')}` });
      if (s.delivery) meta.push({ icon: 'pin', text: s.delivery });
      return {
        image: (s.images || [])[0],
        category: s.category, title: s.title, description: s.description, meta,
        price: s.price, priceNote: 'each',
      };
    },

    async onSubmit(s) {
      return await SellerApply.submit('merchandise', {
        title:        String(s.title || '').trim(),
        contactName:  String(s.contactName || '').trim(),
        contactEmail: String(s.contactEmail || '').trim(),
        contactPhone: String(s.contactPhone || '').trim(),
        details: SellerApply.detailsFrom([
          ['Seller / brand',  s.business],
          ['Category',        s.category],
          ['Description',     s.description],
          ['Price',           s.price ? `R${s.price}` : ''],
          ['Stock on hand',   s.stock],
          ['Lead time',       s.madeToOrder],
          ['Sizes',           s.sizes],
          ['Colours',         s.colours],
          ['Other variants',  s.variants],
          ['Delivery',        s.delivery],
          ['Delivery fee',    s.deliveryFee ? `R${s.deliveryFee}` : ''],
          ['Photos supplied', (s.images || []).length ? `${s.images.length} attached in the seller's browser — request from seller` : 'None'],
        ]),
      });
    },

    successTitle: 'Product submitted',
    successBodyHtml: 'Thanks — we have your product details. Our team will be in touch within one working day to get it listed and sort out how orders reach you. A confirmation is on its way to your inbox.',
    successActions: [
      { label: 'Back to Seller Hub', href: 'dashboard.html' },
      { label: 'List something else', href: 'create-listing.html' },
    ],
  });

  wizard.start();

})();
