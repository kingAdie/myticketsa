/* ================================================
   TicketsSA Data Layer (api.js)
   All data operations go directly to Firestore no backend server
   needed for reads or organiser writes. Migrated off Supabase in
   three phases (auth, events/tickets, then everything else — see
   project memory for the full history); no Supabase dependency
   remains in this file.
   ================================================ */

const SupabaseAPI = (() => {

  // Firebase config + SDK loading lives in one place now: frontend/js/auth.js
  // (loaded on every page this file is), reused here instead of duplicating
  // it (see Firebase migration Phase 4). auth.js is always present alongside
  // this file — confirmed across every consuming page.
  let _firestore = null;
  async function firestoreClient() {
    if (_firestore) return _firestore;
    const fb = await Auth.getFirebaseApp();
    _firestore = fb.firestore();
    // Supabase/JSON.stringify silently dropped `undefined` fields (relied on
    // by admin.js's partial-update quick actions, e.g. adminUpdateEvent(id,
    // {}, {status})) — Firestore throws on them by default. This restores
    // the old silent-drop behaviour globally instead of auditing every call
    // site individually.
    _firestore.settings({ ignoreUndefinedProperties: true });
    return _firestore;
  }

  function normaliseFirestoreUser(id, data) {
    return {
      id,
      firstName:        data.firstName || '',
      lastName:         data.lastName  || '',
      email:            data.email     || '',
      role:             data.role      || 'attendee',
      organisationName: data.organisationName || null,
      createdAt:        data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || null),
    };
  }

  // ── ID generator ────────────────────────────────────────────────────────
  function makeId(prefix) {
    return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  }

  // ── Normalise helpers ─────────────────────────────────────────────────────

  /** '00:00' is the "no time published" marker — see normaliseEvent. */
  function normaliseTime(value) {
    if (!value) return null;
    const hhmm = String(value).slice(0, 5);
    return hhmm === '00:00' ? null : hhmm;
  }

  function normaliseEvent(id, doc) {
    return {
      id,
      status:         doc.status,
      title:          doc.title,
      category:       doc.category,
      date:           doc.eventDate,
      // Stored as null directly for Firestore-native events. Migrated rows may
      // still carry Postgres's old "00:00 means no time published" sentinel
      // (that column was NOT NULL) — normaliseTime bridges both.
      time:           normaliseTime(doc.eventTime),
      endTime:        normaliseTime(doc.endTime),
      location:       doc.location,
      city:           doc.city,
      province:       doc.province   || null,
      description:    doc.description,
      image:          doc.image      || null,
      price:          parseFloat(doc.price) || 0,
      featured:       !!doc.featured,
      sold_out:       !!doc.soldOut,
      organiser:      doc.organiserName,
      organiserId:    doc.organiserId,
      createdAt:      doc.createdAt,
      updatedAt:      doc.updatedAt || null,
      address:        doc.address        || null,
      paymentType:    doc.paymentType    || null,
      paymentLink:    doc.paymentLink    || null,
      bankName:       doc.bankName       || null,
      accountHolder:  doc.accountHolder  || null,
      accountNumber:  doc.accountNumber  || null,
      branchCode:     doc.branchCode     || null,
      ticketTypes: (doc.ticketTypes || []).map(tt => ({
        id:          tt.id,
        name:        tt.name,
        description: tt.description,
        price:       parseFloat(tt.price) || 0,
        available:   tt.available,
        sold:        tt.sold || 0,
      })),
      tags: doc.tags || [],
    };
  }

  function normaliseTicket(id, doc) {
    return {
      id,
      status:  doc.status,
      buyer:   { firstName: doc.buyerFirstName, lastName: doc.buyerLastName, email: doc.buyerEmail, phone: doc.buyerPhone },
      event:   { id: doc.eventId, title: doc.eventTitle, date: doc.eventDate, time: doc.eventTime, location: doc.eventLocation, city: doc.eventCity, image: doc.eventImage },
      ticket:  { typeId: doc.ticketTypeId, typeName: doc.ticketTypeName, price: parseFloat(doc.ticketPrice), quantity: doc.quantity },
      pricing: { subtotal: parseFloat(doc.subtotal), serviceFee: parseFloat(doc.serviceFee), total: parseFloat(doc.total) },
      payment: { reference: doc.paymentReference, method: doc.paymentMethod, paidAt: doc.paidAt },
      qrCodeUrl: doc.qrCodeUrl || null,
      bookedAt:  doc.bookedAt,
    };
  }

  // ════════════════════════════════════════
  //  EVENTS (Firestore — see Firebase migration Phase 2)
  // ════════════════════════════════════════

  async function getEvents(filters = {}) {
    const db = await firestoreClient();
    let q = db.collection('events');

    if (filters.organiserId) {
      // Organiser sees all their own events (any status)
      q = q.where('organiserId', '==', filters.organiserId);
      if (filters.status) q = q.where('status', '==', filters.status);
    } else if (filters.adminAll) {
      // Admin sees all events regardless of status
      if (filters.status) q = q.where('status', '==', filters.status);
      if (filters.category) q = q.where('category', '==', filters.category);
    } else {
      // Public sees only published events
      q = q.where('status', '==', 'published');
      if (filters.category) q = q.where('category', '==', filters.category);
      if (filters.featured)  q = q.where('featured', '==', true);
    }

    q = q.orderBy('featured', 'desc').orderBy('eventDate', 'asc');
    const snap = await q.get();
    return snap.docs.map(d => normaliseEvent(d.id, d.data()));
  }

  async function getEvent(id) {
    const db  = await firestoreClient();
    const doc = await db.collection('events').doc(id).get();
    return doc.exists ? normaliseEvent(doc.id, doc.data()) : null;
  }

  function buildTicketTypes(ticketTypes, eventId, { resetSold } = {}) {
    return (Array.isArray(ticketTypes) ? ticketTypes : []).map((tt, i) => ({
      id:          tt.id || `TT-${eventId}-${i + 1}`,
      name:        tt.name,
      description: tt.description || tt.name,
      price:       parseFloat(tt.price) || 0,
      available:   parseInt(tt.available) || 100,
      sold:        resetSold ? 0 : (tt.sold || 0),
    }));
  }

  function buildTags(tags) {
    return (Array.isArray(tags) ? tags : []).filter(t => t?.trim()).map(t => t.trim());
  }

  async function createEvent(eventData) {
    const db   = await firestoreClient();
    const user = Auth?.getUser();
    if (!user) throw new Error('Not authenticated');

    const eventId = makeId('EVT');
    const now = new Date().toISOString();

    await db.collection('events').doc(eventId).create({
      status:         'pending',
      // Organiser-supplied artwork. Events land as `pending`, so an admin still
      // reviews (and can replace) the image before anything is published.
      image:          eventData.image || null,
      title:          eventData.title,
      category:       eventData.category,
      eventDate:      eventData.date,
      eventTime:      eventData.time     || null,
      endTime:        eventData.endTime || eventData.time || null,
      location:       eventData.location,
      city:           eventData.city,
      province:       eventData.province  || null,
      description:    eventData.description,
      price:          parseFloat(eventData.price) || 0,
      featured:       false,
      soldOut:        false,
      organiserName:  user.organisationName || `${user.firstName} ${user.lastName}`,
      organiserId:    user.id,
      address:        eventData.address        || null,
      paymentType:    eventData.paymentType    || null,
      paymentLink:    eventData.paymentLink    || null,
      bankName:       eventData.bankName       || null,
      accountHolder:  eventData.accountHolder  || null,
      accountNumber:  eventData.accountNumber  || null,
      branchCode:     eventData.branchCode     || null,
      ticketTypes:    buildTicketTypes(eventData.ticketTypes, eventId, { resetSold: true }),
      tags:           buildTags(eventData.tags),
      createdAt:      now,
      updatedAt:      now,
    });

    return { id: eventId, status: 'pending', ...eventData };
  }

  async function updateEvent(id, eventData) {
    const db = await firestoreClient();

    // Only overwrite the image when the organiser actually supplied a new one,
    // so an admin-curated image is never wiped by an edit that left it alone.
    const imagePatch = eventData.image ? { image: eventData.image } : {};

    const fields = {
      ...imagePatch,
      title:          eventData.title,
      category:       eventData.category,
      eventDate:      eventData.date,
      eventTime:      eventData.time     || null,
      endTime:        eventData.endTime || eventData.time || null,
      location:       eventData.location,
      city:           eventData.city,
      province:       eventData.province  || null,
      description:    eventData.description,
      price:          parseFloat(eventData.price) || 0,
      address:        eventData.address        || null,
      paymentType:    eventData.paymentType    || null,
      paymentLink:    eventData.paymentLink    || null,
      bankName:       eventData.bankName       || null,
      accountHolder:  eventData.accountHolder  || null,
      accountNumber:  eventData.accountNumber  || null,
      branchCode:     eventData.branchCode     || null,
      updatedAt:      new Date().toISOString(),
    };
    if (Array.isArray(eventData.ticketTypes)) fields.ticketTypes = buildTicketTypes(eventData.ticketTypes, id);
    if (Array.isArray(eventData.tags))        fields.tags        = buildTags(eventData.tags);

    await db.collection('events').doc(id).update(fields);
    return eventData;
  }

  async function deleteEvent(id) {
    const db = await firestoreClient();
    await db.collection('events').doc(id).delete();
  }

  async function adminCreateEvent(eventData, options = {}) {
    const db   = await firestoreClient();
    const user = Auth?.getUser();
    if (!user) throw new Error('Not authenticated');

    const eventId = makeId('EVT');
    const now = new Date().toISOString();

    await db.collection('events').doc(eventId).create({
      status:        options.status   ?? 'published',
      featured:      options.featured ?? false,
      soldOut:       false,
      title:         eventData.title,
      category:      eventData.category,
      eventDate:     eventData.date,
      eventTime:     eventData.time     || null,
      endTime:       eventData.endTime || eventData.time || null,
      location:      eventData.location,
      city:          eventData.city,
      province:      eventData.province  || null,
      description:   eventData.description,
      image:         eventData.image     || null,
      price:         parseFloat(eventData.price) || 0,
      organiserName: options.organiserName || user.organisationName || `${user.firstName} ${user.lastName}`,
      organiserId:   user.id,
      address:       eventData.address        || null,
      paymentType:   eventData.paymentType    || null,
      paymentLink:   eventData.paymentLink    || null,
      bankName:      eventData.bankName       || null,
      accountHolder: eventData.accountHolder  || null,
      accountNumber: eventData.accountNumber  || null,
      branchCode:    eventData.branchCode     || null,
      ticketTypes:   buildTicketTypes(eventData.ticketTypes, eventId, { resetSold: true }),
      tags:          buildTags(eventData.tags),
      createdAt:     now,
      updatedAt:     now,
    });

    return { id: eventId, ...eventData };
  }

  async function adminUpdateEvent(id, eventData, options = {}) {
    const db = await firestoreClient();

    const fields = {
      title:         eventData.title,
      category:      eventData.category,
      eventDate:     eventData.date,
      eventTime:     eventData.time     || null,
      endTime:       eventData.endTime || eventData.time || null,
      location:      eventData.location,
      city:          eventData.city,
      province:      eventData.province  || null,
      description:   eventData.description,
      price:         parseFloat(eventData.price) || 0,
      address:       eventData.address        || null,
      paymentType:   eventData.paymentType    || null,
      paymentLink:   eventData.paymentLink    || null,
      bankName:      eventData.bankName       || null,
      accountHolder: eventData.accountHolder  || null,
      accountNumber: eventData.accountNumber  || null,
      branchCode:    eventData.branchCode     || null,
      updatedAt:     new Date().toISOString(),
    };
    if (eventData.image)                fields.image         = eventData.image;
    if (options.organiserName)          fields.organiserName = options.organiserName;
    if (options.status !== undefined)   fields.status        = options.status;
    if (options.featured !== undefined) fields.featured      = options.featured;
    if (Array.isArray(eventData.ticketTypes)) fields.ticketTypes = buildTicketTypes(eventData.ticketTypes, id);
    if (Array.isArray(eventData.tags))        fields.tags        = buildTags(eventData.tags);

    // Firestore silently drops `undefined` values here (ignoreUndefinedProperties,
    // set in firestoreClient()) — this is what lets admin.js's quick actions keep
    // calling this with an empty eventData ({}) to patch only status/featured.
    await db.collection('events').doc(id).update(fields);
    return eventData;
  }

  // ════════════════════════════════════════
  //  SERVICE REQUESTS
  // ════════════════════════════════════════

  // Equipment requests have no normalise*() mapper in the Supabase version
  // either — consumers (dashboard.html, my-tickets.html, admin.js) read raw
  // snake_case fields directly. Keeping that exact shape here is what lets
  // those files stay unchanged; storage internally is still camelCase for
  // consistency with every other Firestore collection.
  function toRawServiceRequest(id, doc) {
    return {
      id,
      user_id:       doc.userId,
      service_id:    doc.serviceId,
      service_name:  doc.serviceName,
      event_date:    doc.eventDate,
      duration:      doc.duration      || null,
      location:      doc.location,
      quantity:      doc.quantity,
      details:       doc.details        || null,
      contact_phone: doc.contactPhone,
      budget_range:  doc.budgetRange    || null,
      status:        doc.status,
      created_at:    doc.createdAt,
    };
  }

  async function submitServiceRequest(data) {
    const db   = await firestoreClient();
    const user = Auth?.getUser();
    if (!user) throw new Error('Not authenticated');

    const id  = makeId('REQ');
    const row = {
      userId:       user.id,
      serviceId:    data.serviceId,
      serviceName:  data.serviceName,
      eventDate:    data.eventDate,
      duration:     data.duration      || null,
      location:     data.location,
      quantity:     parseInt(data.quantity) || 1,
      details:      data.details        || null,
      contactPhone: data.contactPhone,
      budgetRange:  data.budgetRange    || null,
      status:       'pending',
      createdAt:    new Date().toISOString(),
    };
    await db.collection('equipmentRequests').doc(id).create(row);
    return toRawServiceRequest(id, row);
  }

  async function getMyServiceRequests() {
    const db   = await firestoreClient();
    const user = Auth?.getUser();
    if (!user) return [];
    const snap = await db.collection('equipmentRequests')
      .where('userId', '==', user.id)
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map(d => toRawServiceRequest(d.id, d.data()));
  }

  // ════════════════════════════════════════
  //  TICKETS
  // ════════════════════════════════════════

  // accommodation_bookings also has no normalise*() mapper in the Supabase
  // version — my-tickets.html and admin.js both read raw snake_case fields.
  function toRawBooking(id, doc) {
    return {
      id,
      accommodation_id:   doc.accommodationId,
      accommodation_name: doc.accommodationName,
      space_type_name:    doc.spaceTypeName,
      price_per_night:    doc.pricePerNight,
      check_in_date:      doc.checkInDate,
      check_out_date:     doc.checkOutDate,
      nights:             doc.nights,
      guests:             doc.guests,
      total_price:        doc.totalPrice,
      customer_name:      doc.customerName,
      customer_email:     doc.customerEmail,
      customer_phone:     doc.customerPhone || null,
      special_requests:   doc.specialRequests || null,
      status:             doc.status,
      created_at:         doc.createdAt,
    };
  }

  async function getMyAccommodationBookings() {
    const db   = await firestoreClient();
    const user = Auth?.getUser();
    if (!user) return [];
    const snap = await db.collection('accommodationBookings')
      .where('customerEmail', '==', user.email.toLowerCase())
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map(d => toRawBooking(d.id, d.data()));
  }

  /** Single ticket by id, for success.html when it lands here with no local
   *  booking state (e.g. returning from Paystack's hosted checkout). */
  async function getTicket(id) {
    const db  = await firestoreClient();
    const doc = await db.collection('tickets').doc(id).get();
    return doc.exists ? normaliseTicket(doc.id, doc.data()) : null;
  }

  async function getMyTickets() {
    const db   = await firestoreClient();
    const user = Auth?.getUser();
    if (!user) return [];
    const snap = await db.collection('tickets')
      .where('buyerEmail', '==', user.email.toLowerCase())
      .orderBy('bookedAt', 'desc')
      .get();
    return snap.docs.map(d => normaliseTicket(d.id, d.data()));
  }

  /**
   * Tickets people have booked on the signed-in seller's own events.
   * Two hops: fetch my event ids, then the tickets against them. Returns []
   * rather than throwing if a Security Rule blocks the read, so the Seller
   * Hub can show an explanatory empty state instead of an error.
   */
  async function getSalesForMyEvents() {
    const db   = await firestoreClient();
    const user = Auth?.getUser();
    if (!user) return [];

    try {
      const eventsSnap = await db.collection('events').where('organiserId', '==', user.id).get();
      if (eventsSnap.empty) return [];
      const ids = eventsSnap.docs.map(d => d.id);

      // Firestore's client-SDK 'in' operator caps at 30 values per query.
      const chunks = [];
      for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));

      const results = await Promise.all(chunks.map(chunk =>
        db.collection('tickets').where('eventId', 'in', chunk).orderBy('bookedAt', 'desc').get()
      ));
      const docs = results.flatMap(snap => snap.docs);
      docs.sort((a, b) => (b.data().bookedAt || '').localeCompare(a.data().bookedAt || ''));
      return docs.map(d => normaliseTicket(d.id, d.data()));
    } catch (_) {
      return [];
    }
  }

  async function submitTicket(payload) {
    const db = await firestoreClient();

    const ticketId   = `TKT-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const subtotal   = payload.ticketPrice * payload.quantity;
    const serviceFee = Math.round(subtotal * 0.05 * 100) / 100;
    const total       = Math.round((subtotal + serviceFee) * 100) / 100;
    const now         = new Date().toISOString();

    const row = {
      status:            'confirmed',
      buyerFirstName:    payload.firstName,
      buyerLastName:     payload.lastName,
      buyerEmail:        payload.email.toLowerCase(),
      buyerPhone:        payload.phone        || null,
      eventId:           payload.eventId,
      eventTitle:        payload.eventTitle,
      eventDate:         payload.eventDate,
      eventTime:         payload.eventTime    || null,
      eventLocation:     payload.eventLocation,
      eventCity:         payload.eventCity,
      eventImage:        payload.eventImage   || null,
      ticketTypeId:      payload.ticketTypeId,
      ticketTypeName:    payload.ticketTypeName,
      ticketPrice:       payload.ticketPrice,
      quantity:          payload.quantity,
      subtotal,
      serviceFee,
      total,
      paymentMethod:     'pending',
      paymentReference:  null,
      paidAt:            null,
      qrCodeUrl:         null,
      bookedAt:          now,
    };

    await db.collection('tickets').doc(ticketId).create(row);
    return { ...normaliseTicket(ticketId, row), pricing: { subtotal, serviceFee, total } };
  }

  // ════════════════════════════════════════
  //  PROFILE
  // ════════════════════════════════════════

  // ════════════════════════════════════════
  //  USERS (Firestore — see Firebase Auth migration)
  // ════════════════════════════════════════

  /** Current user's Firestore profile doc — the source of truth for display
   *  data (firstName/lastName/organisationName) now that signup no longer
   *  touches Supabase. `role` here is for display only; Auth.isAdmin()/
   *  isOrganiser() read the verified custom claim, never this. */
  async function getMyFirestoreProfile() {
    const user = Auth?.getUser();
    if (!user) return null;
    const db   = await firestoreClient();
    const snap = await db.collection('users').doc(user.id).get();
    if (!snap.exists) return user;
    return normaliseFirestoreUser(user.id, snap.data());
  }

  /** All Firestore-backed users, for the admin Users tab. */
  async function adminGetFirestoreUsers() {
    const db   = await firestoreClient();
    const snap = await db.collection('users').orderBy('createdAt', 'desc').get();
    return snap.docs.map(d => normaliseFirestoreUser(d.id, d.data()));
  }

  /**
   * The real fix for role promotion: calls firebase-set-role.js, which
   * verifies (server-side, via the caller's Firebase ID token) that the
   * requester is actually an admin, then sets the target user's custom
   * claim — the thing Auth.isAdmin()/isOrganiser() actually read. Replaces
   * the old adminUpdateUserRole, which only ever wrote a Supabase display
   * field and never changed what the promoted user could do.
   */
  async function adminSetUserRole(userId, role) {
    const res = await fetch('/.netlify/functions/firebase-set-role', {
      method:  'POST',
      headers: Auth?.headers ? Auth.headers() : { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId, role }),
    });
    if (!res.ok) throw new Error(await res.text());
  }

  // ════════════════════════════════════════
  //  ADMIN
  // ════════════════════════════════════════

  /**
   * Fully Firestore as of the Firebase migration's Phase 3 — no Supabase
   * dependency left in this function at all. profiles/equipment_requests
   * counts moved off Supabase since profiles stopped getting new rows the
   * moment Phase 1 shipped (signups no longer touch Supabase Auth).
   */
  async function adminGetStats() {
    const db = await firestoreClient();

    const [totalEvents, published, pending, tickets, users, organisers, pendingRequests] = await Promise.all([
      db.collection('events').count().get(),
      db.collection('events').where('status', '==', 'published').count().get(),
      db.collection('events').where('status', '==', 'pending').count().get(),
      db.collection('tickets').count().get(),
      db.collection('users').count().get(),
      db.collection('users').where('role', '==', 'organiser').count().get(),
      db.collection('equipmentRequests').where('status', '==', 'pending').count().get(),
    ]);
    return {
      totalEvents:     totalEvents.data().count,
      publishedEvents: published.data().count,
      pendingEvents:   pending.data().count,
      ticketsSold:     tickets.data().count,
      totalUsers:      users.data().count,
      organisers:      organisers.data().count,
      pendingRequests: pendingRequests.data().count,
    };
  }


  /** Joined against Firestore's `users` collection, not Supabase `profiles`
   *  it stopped getting new rows the moment signup stopped touching Supabase
   *  Auth at all (see Firebase Auth migration). */
  async function adminGetServiceRequests() {
    const db   = await firestoreClient();
    const snap = await db.collection('equipmentRequests').orderBy('createdAt', 'desc').get();
    if (snap.empty) return [];

    const requests = snap.docs.map(d => toRawServiceRequest(d.id, d.data()));
    const userIds  = [...new Set(requests.map(r => r.user_id).filter(Boolean))];
    const entries  = await Promise.all(userIds.map(async uid => {
      const doc = await db.collection('users').doc(uid).get();
      return [uid, doc.exists ? doc.data() : null];
    }));
    const profileMap = Object.fromEntries(entries.filter(([, v]) => v));

    return requests.map(r => ({
      ...r,
      first_name: profileMap[r.user_id]?.firstName || '',
      last_name:  profileMap[r.user_id]?.lastName  || '',
      email:      profileMap[r.user_id]?.email      || '',
    }));
  }

  async function adminUpdateServiceRequestStatus(id, status) {
    const db = await firestoreClient();
    await db.collection('equipmentRequests').doc(id).update({ status });
  }

  // ════════════════════════════════════════
  //  ACCOMMODATIONS (public)
  // ════════════════════════════════════════

  function normaliseAccommodation(id, doc) {
    return {
      id,
      name:         doc.name,
      description:  doc.description   || '',
      province:     doc.province,
      city:         doc.city,
      address:      doc.address        || null,
      checkInTime:  doc.checkInTime  || '14:00',
      checkOutTime: doc.checkOutTime || '10:00',
      priceFrom:    parseFloat(doc.priceFrom) || 0,
      starRating:   doc.starRating    || 0,
      amenities:    doc.amenities      || [],
      spaceTypes:   doc.spaceTypes    || [],
      images:       doc.images         || [],
      contactEmail: doc.contactEmail  || null,
      contactPhone: doc.contactPhone  || null,
      website:      doc.website        || null,
      bookingUrl:   doc.bookingUrl    || null,
      featured:     !!doc.featured,
      status:       doc.status,
      createdAt:    doc.createdAt,
    };
  }

  // tourist_destinations has no normalise*() mapper in the Supabase version
  // either — accommodations.html and admin.js both read raw fields (e.g.
  // `entry_fee`, not `entryFee`) directly.
  function toRawDestination(id, doc) {
    return {
      id,
      name:        doc.name,
      description: doc.description || null,
      province:    doc.province,
      city:        doc.city    || null,
      image:       doc.image   || null,
      category:    doc.category || 'Nature',
      entry_fee:   doc.entryFee || 0,
      website:     doc.website  || null,
      featured:    !!doc.featured,
      status:      doc.status,
      created_at:  doc.createdAt,
    };
  }

  /** Space types are stored as {name, price, capacity} only — the wizard used
   *  to also write placeType/bedrooms/beds/bathrooms, but nothing anywhere
   *  ever reads those back, so they're dropped here rather than carried
   *  forward as dead data with no schema to catch the drift. */
  function buildSpaceTypes(spaceTypes) {
    return (Array.isArray(spaceTypes) ? spaceTypes : []).map(st => ({
      name:     st.name,
      price:    parseFloat(st.price) || 0,
      capacity: st.capacity != null ? parseInt(st.capacity) : null,
    }));
  }

  async function getAccommodations(filters = {}) {
    const db = await firestoreClient();
    let q = db.collection('accommodations');
    if (filters.province) q = q.where('province', '==', filters.province);
    if (!filters.adminAll) q = q.where('status', '==', 'published');
    q = q.orderBy('featured', 'desc').orderBy('name', 'asc');
    const snap = await q.get();
    return snap.docs.map(d => normaliseAccommodation(d.id, d.data()));
  }

  async function getAccommodation(id) {
    const db  = await firestoreClient();
    const doc = await db.collection('accommodations').doc(id).get();
    return doc.exists ? normaliseAccommodation(doc.id, doc.data()) : null;
  }

  async function getTouristDestinations(filters = {}) {
    const db = await firestoreClient();
    let q = db.collection('touristDestinations');
    if (filters.province) q = q.where('province', '==', filters.province);
    if (!filters.adminAll) q = q.where('status', '==', 'published');
    q = q.orderBy('featured', 'desc').orderBy('name', 'asc');
    const snap = await q.get();
    return snap.docs.map(d => toRawDestination(d.id, d.data()));
  }

  async function submitAccommodationBooking(b) {
    const db     = await firestoreClient();
    const nights = Math.max(1, Math.round((new Date(b.checkOutDate) - new Date(b.checkInDate)) / 86400000));
    const id     = makeId('BK');
    const row = {
      accommodationId:   b.accommodationId,
      accommodationName: b.accommodationName,
      spaceTypeName:     b.spaceTypeName,
      pricePerNight:     b.pricePerNight || 0,
      checkInDate:       b.checkInDate,
      checkOutDate:      b.checkOutDate,
      nights,
      guests:            b.guests        || 1,
      totalPrice:        (b.pricePerNight || 0) * nights,
      customerName:      b.customerName,
      customerEmail:     b.customerEmail,
      customerPhone:     b.customerPhone || null,
      specialRequests:   b.specialRequests || null,
      status:            'pending',
      createdAt:         new Date().toISOString(),
    };
    await db.collection('accommodationBookings').doc(id).create(row);
    return toRawBooking(id, row);
  }

  /**
   * Seller-submitted accommodation listing. Always lands as `pending` so it
   * goes through the same admin review queue as an admin-created one.
   * `ownerId` is always set here — the Supabase version had to defensively
   * retry without it since the column's existence was uncertain; Firestore
   * has no such ambiguity, and the Security Rule requires it on create.
   */
  async function createAccommodation(data) {
    const db   = await firestoreClient();
    const user = Auth?.getUser();
    if (!user) throw new Error('Please sign in to list accommodation.');

    const newId = makeId('ACC');
    const now   = new Date().toISOString();
    const row = {
      name:          data.name,
      description:   data.description   || null,
      province:      data.province,
      city:          data.city,
      address:       data.address       || null,
      checkInTime:   data.checkInTime   || '14:00',
      checkOutTime:  data.checkOutTime  || '10:00',
      priceFrom:     parseFloat(data.priceFrom) || 0,
      amenities:     Array.isArray(data.amenities) ? data.amenities : [],
      spaceTypes:    buildSpaceTypes(data.spaceTypes),
      images:        Array.isArray(data.images) ? data.images : [],
      contactEmail:  data.contactEmail  || user.email || null,
      contactPhone:  data.contactPhone  || null,
      website:       data.website       || null,
      starRating:    parseInt(data.starRating) || 0,
      featured:      false,
      status:        'pending',
      ownerId:       user.id,
      createdAt:     now,
      updatedAt:     now,
    };

    await db.collection('accommodations').doc(newId).create(row);
    return { id: newId, ...data, status: 'pending' };
  }

  /** Accommodation listings owned by the signed-in seller. */
  async function getMyAccommodations() {
    const db   = await firestoreClient();
    const user = Auth?.getUser();
    if (!user) return [];
    try {
      const snap = await db.collection('accommodations')
        .where('ownerId', '==', user.id)
        .orderBy('createdAt', 'desc')
        .get();
      return snap.docs.map(d => normaliseAccommodation(d.id, d.data()));
    } catch (_) {
      return [];
    }
  }

  // ════════════════════════════════════════
  //  ACCOMMODATIONS (admin)
  // ════════════════════════════════════════

  async function adminSaveAccommodation(id, data) {
    const db  = await firestoreClient();
    const row = {
      name:          data.name,
      description:   data.description   || null,
      province:      data.province,
      city:          data.city,
      address:       data.address       || null,
      checkInTime:   data.checkInTime   || '14:00',
      checkOutTime:  data.checkOutTime  || '10:00',
      priceFrom:     parseFloat(data.priceFrom) || 0,
      amenities:     Array.isArray(data.amenities) ? data.amenities : (data.amenities || '').split(',').map(a => a.trim()).filter(Boolean),
      spaceTypes:    buildSpaceTypes(data.spaceTypes),
      images:        Array.isArray(data.images) ? data.images : (data.images || '').split(',').map(i => i.trim()).filter(Boolean),
      contactEmail:  data.contactEmail  || null,
      contactPhone:  data.contactPhone  || null,
      website:       data.website       || null,
      starRating:    parseInt(data.starRating) || 0,
      bookingUrl:    data.bookingUrl    || null,
      featured:      !!data.featured,
      status:        data.status        || 'published',
      updatedAt:     new Date().toISOString(),
    };
    if (id) {
      await db.collection('accommodations').doc(id).update(row);
    } else {
      const newId = makeId('ACC');
      await db.collection('accommodations').doc(newId).create({ ...row, ownerId: null, createdAt: row.updatedAt });
    }
  }

  async function adminDeleteAccommodation(id) {
    const db = await firestoreClient();
    await db.collection('accommodations').doc(id).delete();
  }

  async function adminGetAccommodationBookings(filters = {}) {
    const db = await firestoreClient();
    let q = db.collection('accommodationBookings');
    if (filters.status) q = q.where('status', '==', filters.status);
    q = q.orderBy('createdAt', 'desc');
    const snap = await q.get();
    return snap.docs.map(d => toRawBooking(d.id, d.data()));
  }

  async function adminUpdateBookingStatus(id, status) {
    const db = await firestoreClient();
    await db.collection('accommodationBookings').doc(id).update({ status });
  }

  // ════════════════════════════════════════
  //  TOURIST DESTINATIONS (admin)
  // ════════════════════════════════════════

  async function adminSaveTouristDestination(id, data) {
    const db  = await firestoreClient();
    const row = {
      name:        data.name,
      description: data.description || null,
      province:    data.province,
      city:        data.city       || null,
      image:       data.image      || null,
      category:    data.category   || 'Nature',
      entryFee:    parseFloat(data.entryFee) || 0,
      website:     data.website    || null,
      featured:    !!data.featured,
      status:      data.status     || 'published',
    };
    if (id) {
      await db.collection('touristDestinations').doc(id).update(row);
    } else {
      const newId = makeId('TD');
      await db.collection('touristDestinations').doc(newId).create({ ...row, createdAt: new Date().toISOString() });
    }
  }

  async function adminDeleteTouristDestination(id) {
    const db = await firestoreClient();
    await db.collection('touristDestinations').doc(id).delete();
  }

  return {
    getEvents, getEvent,
    createEvent, updateEvent, deleteEvent,
    adminCreateEvent, adminUpdateEvent,
    adminGetStats,
    getMyFirestoreProfile, adminGetFirestoreUsers, adminSetUserRole,
    adminGetServiceRequests, adminUpdateServiceRequestStatus,
    getAccommodations, getAccommodation,
    createAccommodation, getMyAccommodations,
    getMyAccommodationBookings,
    getTouristDestinations, submitAccommodationBooking,
    adminSaveAccommodation, adminDeleteAccommodation,
    adminGetAccommodationBookings, adminUpdateBookingStatus,
    adminSaveTouristDestination, adminDeleteTouristDestination,
    submitServiceRequest, getMyServiceRequests,
    getMyTickets, getTicket, submitTicket, getSalesForMyEvents,
  };

})();
