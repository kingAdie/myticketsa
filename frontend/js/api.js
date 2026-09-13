/* ================================================
   TicketsSA Supabase Data Layer (api.js)
   All data operations go directly to Supabase.
   No backend server needed for reads or organiser writes.
   Backend is only called for: checkout, admin operations.
   ================================================ */

const SupabaseAPI = (() => {

  const SUPABASE_URL      = 'https://xaooupqqtbqwjddsqnwi.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhb291cHFxdGJxd2pkZHNxbndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY1MDUsImV4cCI6MjA5NTgxMjUwNX0.ahG6OtWIfLnjqV0DLI_hRD0bh-IcbV14ok7SxIKH-qE';

  // Firebase (Firestore) keep in sync with frontend/js/auth.js's
  // firebaseConfig. Added during the Firebase Auth migration only the
  // `users` collection so far the rest of the data layer is still
  // Supabase, untouched, until later migration phases.
  const FIREBASE_CONFIG = {
    apiKey:            'YOUR_FIREBASE_API_KEY',
    authDomain:        'tickets-sa.firebaseapp.com',
    projectId:         'tickets-sa',
    storageBucket:     'tickets-sa.appspot.com',
    messagingSenderId: 'YOUR_FIREBASE_SENDER_ID',
    appId:             'YOUR_FIREBASE_APP_ID',
  };
  const FIREBASE_SDK_VERSION = '10.13.2';

  let _firestore = null;
  async function firestoreClient() {
    if (_firestore) return _firestore;
    if (!window.firebase) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js`;
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore-compat.js`;
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    if (!window.firebase.apps.length) window.firebase.initializeApp(FIREBASE_CONFIG);
    _firestore = window.firebase.firestore();
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

  let _client = null;

  async function client() {
    if (_client) return _client;
    if (!window.supabase) {
      await new Promise((resolve, reject) => {
        const s   = document.createElement('script');
        s.src     = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        s.onload  = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _client;
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
    const user = window.Auth?.getUser();
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
    const user = window.Auth?.getUser();
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

  async function submitServiceRequest(data) {
    const sb   = await client();
    const user = window.Auth?.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: result, error } = await sb.from('equipment_requests').insert({
      user_id:       user.id,
      service_id:    data.serviceId,
      service_name:  data.serviceName,
      event_date:    data.eventDate,
      duration:      data.duration      || null,
      location:      data.location,
      quantity:      parseInt(data.quantity) || 1,
      details:       data.details        || null,
      contact_phone: data.contactPhone,
      budget_range:  data.budgetRange    || null,
      status:        'pending',
    }).select().single();
    if (error) throw error;
    return result;
  }

  async function getMyServiceRequests() {
    const sb   = await client();
    const user = window.Auth?.getUser();
    if (!user) return [];
    const { data, error } = await sb
      .from('equipment_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  // ════════════════════════════════════════
  //  TICKETS
  // ════════════════════════════════════════

  async function getMyAccommodationBookings() {
    const sb   = await client();
    const user = window.Auth?.getUser();
    if (!user) return [];
    const { data, error } = await sb
      .from('accommodation_bookings')
      .select('*')
      .eq('customer_email', user.email.toLowerCase())
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
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
    const user = window.Auth?.getUser();
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
    const user = window.Auth?.getUser();
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
    const user = window.Auth?.getUser();
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
      headers: window.Auth?.headers ? window.Auth.headers() : { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId, role }),
    });
    if (!res.ok) throw new Error(await res.text());
  }

  async function getMyProfile() {
    const sb   = await client();
    const user = window.Auth?.getUser();
    if (!user) return null;
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (error || !data) return user;
    return {
      id:               data.id,
      email:            data.email,
      firstName:        data.first_name,
      lastName:         data.last_name,
      role:             data.role,
      organisationName: data.organisation_name,
      createdAt:        data.created_at,
    };
  }

  // ════════════════════════════════════════
  //  ADMIN Supabase-direct (no Railway)
  // ════════════════════════════════════════

  /**
   * events/tickets/users counts moved to Firestore (see Firebase migration
   * Phase 2) — profiles is stale for user counts since new signups no longer
   * create a Supabase profiles row at all. equipment_requests stays Supabase
   * (not migrated yet).
   */
  async function adminGetStats() {
    const sb = await client();
    const db = await firestoreClient();

    const [reqRes, totalEvents, published, pending, tickets, users, organisers] = await Promise.all([
      sb.from('equipment_requests').select('id, status'),
      db.collection('events').count().get(),
      db.collection('events').where('status', '==', 'published').count().get(),
      db.collection('events').where('status', '==', 'pending').count().get(),
      db.collection('tickets').count().get(),
      db.collection('users').count().get(),
      db.collection('users').where('role', '==', 'organiser').count().get(),
    ]);
    const requests = reqRes.data || [];
    return {
      totalEvents:     totalEvents.data().count,
      publishedEvents: published.data().count,
      pendingEvents:   pending.data().count,
      ticketsSold:     tickets.data().count,
      totalUsers:      users.data().count,
      organisers:      organisers.data().count,
      pendingRequests: requests.filter(r => r.status === 'pending').length,
    };
  }

  async function adminGetUsers() {
    const sb = await client();
    const { data, error } = await sb
      .from('profiles')
      .select('id, first_name, last_name, email, role, organisation_name, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(p => ({
      id:               p.id,
      firstName:        p.first_name  || '',
      lastName:         p.last_name   || '',
      email:            p.email       || '',
      role:             p.role        || 'attendee',
      organisationName: p.organisation_name || null,
      createdAt:        p.created_at,
    }));
  }

  async function adminUpdateUserRole(userId, role) {
    const sb = await client();
    const { error } = await sb.from('profiles').update({ role }).eq('id', userId);
    if (error) throw error;
  }

  async function adminGetServiceRequests() {
    const sb = await client();
    const { data: requests, error } = await sb
      .from('equipment_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!requests?.length) return [];

    // Join user profiles
    const userIds = [...new Set(requests.map(r => r.user_id).filter(Boolean))];
    let profileMap = {};
    if (userIds.length) {
      const { data: profiles } = await sb
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', userIds);
      (profiles || []).forEach(p => { profileMap[p.id] = p; });
    }

    return requests.map(r => ({
      ...r,
      first_name: profileMap[r.user_id]?.first_name || '',
      last_name:  profileMap[r.user_id]?.last_name  || '',
      email:      profileMap[r.user_id]?.email       || '',
    }));
  }

  async function adminUpdateServiceRequestStatus(id, status) {
    const sb = await client();
    const { error } = await sb
      .from('equipment_requests')
      .update({ status })
      .eq('id', id);
    if (error) throw error;
  }

  // ════════════════════════════════════════
  //  ACCOMMODATIONS (public)
  // ════════════════════════════════════════

  function normaliseAccommodation(row) {
    return {
      id:           row.id,
      name:         row.name,
      description:  row.description   || '',
      province:     row.province,
      city:         row.city,
      address:      row.address        || null,
      checkInTime:  row.check_in_time  || '14:00',
      checkOutTime: row.check_out_time || '10:00',
      priceFrom:    parseFloat(row.price_from) || 0,
      starRating:   row.star_rating    || 0,
      amenities:    row.amenities      || [],
      spaceTypes:   row.space_types    || [],
      images:       row.images         || [],
      contactEmail: row.contact_email  || null,
      contactPhone: row.contact_phone  || null,
      website:      row.website        || null,
      bookingUrl:   row.booking_url    || null,
      featured:     !!row.featured,
      status:       row.status,
      createdAt:    row.created_at,
    };
  }

  async function getAccommodations(filters = {}) {
    const sb = await client();
    let q = sb.from('accommodations').select('*');
    if (filters.province) q = q.eq('province', filters.province);
    if (filters.adminAll) { /* no status filter */ }
    else q = q.eq('status', 'published');
    q = q.order('featured', { ascending: false }).order('name', { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(normaliseAccommodation);
  }

  async function getAccommodation(id) {
    const sb = await client();
    const { data, error } = await sb.from('accommodations').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? normaliseAccommodation(data) : null;
  }

  async function getTouristDestinations(filters = {}) {
    const sb = await client();
    let q = sb.from('tourist_destinations').select('*');
    if (filters.province) q = q.eq('province', filters.province);
    if (filters.adminAll) { /* no status filter */ }
    else q = q.eq('status', 'published');
    q = q.order('featured', { ascending: false }).order('name', { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function submitAccommodationBooking(b) {
    const sb = await client();
    const nights = Math.max(1, Math.round((new Date(b.checkOutDate) - new Date(b.checkInDate)) / 86400000));
    const id     = `BK-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
    const { data, error } = await sb.from('accommodation_bookings').insert({
      id,
      accommodation_id:   b.accommodationId,
      accommodation_name: b.accommodationName,
      space_type_name:    b.spaceTypeName,
      price_per_night:    b.pricePerNight || 0,
      check_in_date:      b.checkInDate,
      check_out_date:     b.checkOutDate,
      nights,
      guests:             b.guests        || 1,
      total_price:        (b.pricePerNight || 0) * nights,
      customer_name:      b.customerName,
      customer_email:     b.customerEmail,
      customer_phone:     b.customerPhone || null,
      special_requests:   b.specialRequests || null,
      status:             'pending',
    }).select().single();
    if (error) throw error;
    return data;
  }

  /**
   * Seller-submitted accommodation listing. Always lands as `pending` so it
   * goes through the same admin review queue as an admin-created one.
   *
   * NOTE: `accommodations` may not have an `owner_id` column yet (it was an
   * admin-only table historically). We try the insert with owner_id and, if
   * the column is missing, retry without it so submissions still succeed the
   * listing is then only visible/manageable from the admin panel until the
   * column is added.
   */
  async function createAccommodation(data) {
    const sb   = await client();
    const user = window.Auth?.getUser();
    if (!user) throw new Error('Please sign in to list accommodation.');

    const newId = `ACC-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
    const row = {
      id:             newId,
      name:           data.name,
      description:    data.description   || null,
      province:       data.province,
      city:           data.city,
      address:        data.address       || null,
      check_in_time:  data.checkInTime   || '14:00',
      check_out_time: data.checkOutTime  || '10:00',
      price_from:     parseFloat(data.priceFrom) || 0,
      amenities:      Array.isArray(data.amenities) ? data.amenities : [],
      space_types:    Array.isArray(data.spaceTypes) ? data.spaceTypes : [],
      images:         Array.isArray(data.images) ? data.images : [],
      contact_email:  data.contactEmail  || user.email || null,
      contact_phone:  data.contactPhone  || null,
      website:        data.website       || null,
      star_rating:    parseInt(data.starRating) || 0,
      featured:       false,
      status:         'pending',
    };

    let { error } = await sb.from('accommodations').insert({ ...row, owner_id: user.id });

    if (error && /owner_id/i.test(error.message || '')) {
      // Column not present on this database retry without it.
      ({ error } = await sb.from('accommodations').insert(row));
    }
    if (error) throw error;

    return { id: newId, ...data, status: 'pending' };
  }

  /** Accommodation listings owned by the signed-in seller (empty if no owner_id column). */
  async function getMyAccommodations() {
    const sb   = await client();
    const user = window.Auth?.getUser();
    if (!user) return [];
    const { data, error } = await sb
      .from('accommodations')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });
    if (error) return [];            // column missing → caller shows the explanatory note
    return (data || []).map(normaliseAccommodation);
  }

  // ════════════════════════════════════════
  //  ACCOMMODATIONS (admin)
  // ════════════════════════════════════════

  async function adminSaveAccommodation(id, data) {
    const sb  = await client();
    const row = {
      name:           data.name,
      description:    data.description   || null,
      province:       data.province,
      city:           data.city,
      address:        data.address       || null,
      check_in_time:  data.checkInTime   || '14:00',
      check_out_time: data.checkOutTime  || '10:00',
      price_from:     parseFloat(data.priceFrom) || 0,
      amenities:      Array.isArray(data.amenities) ? data.amenities : (data.amenities || '').split(',').map(a => a.trim()).filter(Boolean),
      space_types:    data.spaceTypes    || [],
      images:         Array.isArray(data.images) ? data.images : (data.images || '').split(',').map(i => i.trim()).filter(Boolean),
      contact_email:  data.contactEmail  || null,
      contact_phone:  data.contactPhone  || null,
      website:        data.website       || null,
      star_rating:    parseInt(data.starRating) || 0,
      booking_url:    data.bookingUrl    || null,
      featured:       !!data.featured,
      status:         data.status        || 'published',
      updated_at:     new Date().toISOString(),
    };
    if (id) {
      const { error } = await sb.from('accommodations').update(row).eq('id', id);
      if (error) throw error;
    } else {
      const newId = `ACC-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const { error } = await sb.from('accommodations').insert({ id: newId, ...row });
      if (error) throw error;
    }
  }

  async function adminDeleteAccommodation(id) {
    const sb = await client();
    const { error } = await sb.from('accommodations').delete().eq('id', id);
    if (error) throw error;
  }

  async function adminGetAccommodationBookings(filters = {}) {
    const sb = await client();
    let q = sb.from('accommodation_bookings').select('*');
    if (filters.status) q = q.eq('status', filters.status);
    q = q.order('created_at', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function adminUpdateBookingStatus(id, status) {
    const sb = await client();
    const { error } = await sb.from('accommodation_bookings').update({ status }).eq('id', id);
    if (error) throw error;
  }

  // ════════════════════════════════════════
  //  TOURIST DESTINATIONS (admin)
  // ════════════════════════════════════════

  async function adminSaveTouristDestination(id, data) {
    const sb  = await client();
    const row = {
      name:      data.name,
      description: data.description || null,
      province:  data.province,
      city:      data.city       || null,
      image:     data.image      || null,
      category:  data.category   || 'Nature',
      entry_fee: parseFloat(data.entryFee) || 0,
      website:   data.website    || null,
      featured:  !!data.featured,
      status:    data.status     || 'published',
    };
    if (id) {
      const { error } = await sb.from('tourist_destinations').update(row).eq('id', id);
      if (error) throw error;
    } else {
      const newId = `TD-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const { error } = await sb.from('tourist_destinations').insert({ id: newId, ...row });
      if (error) throw error;
    }
  }

  async function adminDeleteTouristDestination(id) {
    const sb = await client();
    const { error } = await sb.from('tourist_destinations').delete().eq('id', id);
    if (error) throw error;
  }

  return {
    getEvents, getEvent,
    createEvent, updateEvent, deleteEvent,
    adminCreateEvent, adminUpdateEvent,
    adminGetStats, adminGetUsers, adminUpdateUserRole,
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
    getMyProfile,
  };

})();
