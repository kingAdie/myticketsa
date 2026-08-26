/* ================================================
   TicketsSA Supabase Data Layer (api.js)
   All data operations go directly to Supabase.
   No backend server needed for reads or organiser writes.
   Backend is only called for: checkout, admin operations.
   ================================================ */

const SupabaseAPI = (() => {

  const SUPABASE_URL      = 'https://xaooupqqtbqwjddsqnwi.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhb291cHFxdGJxd2pkZHNxbndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY1MDUsImV4cCI6MjA5NTgxMjUwNX0.ahG6OtWIfLnjqV0DLI_hRD0bh-IcbV14ok7SxIKH-qE';

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

  function normaliseEvent(row) {
    return {
      id:             row.id,
      status:         row.status,
      title:          row.title,
      category:       row.category,
      date:           row.event_date,
      time:           row.event_time ? String(row.event_time).slice(0, 5) : null,
      endTime:        row.end_time   ? String(row.end_time).slice(0, 5)   : null,
      location:       row.location,
      city:           row.city,
      province:       row.province   || null,
      description:    row.description,
      image:          row.image      || null,
      price:          parseFloat(row.price) || 0,
      featured:       !!row.featured,
      sold_out:       !!row.sold_out,
      organiser:      row.organiser_name,
      organiserId:    row.organiser_id,
      createdAt:      row.created_at,
      updatedAt:      row.updated_at,
      address:        row.address        || null,
      paymentType:    row.payment_type   || null,
      paymentLink:    row.payment_link   || null,
      bankName:       row.bank_name      || null,
      accountHolder:  row.account_holder || null,
      accountNumber:  row.account_number || null,
      branchCode:     row.branch_code    || null,
      ticketTypes: (row.ticket_types || []).map(tt => ({
        id:          tt.id,
        name:        tt.name,
        description: tt.description,
        price:       parseFloat(tt.price) || 0,
        available:   tt.available,
        sold:        tt.sold || 0,
      })),
      tags: (row.event_tags || []).map(t => t.tag),
    };
  }

  function normaliseTicket(row) {
    return {
      id:      row.id,
      status:  row.status,
      buyer:   { firstName: row.buyer_first_name, lastName: row.buyer_last_name, email: row.buyer_email, phone: row.buyer_phone },
      event:   { id: row.event_id, title: row.event_title, date: row.event_date, time: row.event_time, location: row.event_location, city: row.event_city, image: row.event_image },
      ticket:  { typeId: row.ticket_type_id, typeName: row.ticket_type_name, price: parseFloat(row.ticket_price), quantity: row.quantity },
      pricing: { subtotal: parseFloat(row.subtotal), serviceFee: parseFloat(row.service_fee), total: parseFloat(row.total) },
      payment: { reference: row.payment_reference, method: row.payment_method, paidAt: row.paid_at },
      qrCodeUrl: row.qr_code_url,
      bookedAt:  row.booked_at,
    };
  }

  // ════════════════════════════════════════
  //  EVENTS
  // ════════════════════════════════════════

  async function getEvents(filters = {}) {
    const sb = await client();
    let q = sb.from('events').select('*, ticket_types(*), event_tags(*)');

    if (filters.organiserId) {
      // Organiser sees all their own events (any status)
      q = q.eq('organiser_id', filters.organiserId);
      if (filters.status) q = q.eq('status', filters.status);
    } else if (filters.adminAll) {
      // Admin sees all events regardless of status
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.category) q = q.eq('category', filters.category);
    } else {
      // Public sees only published events
      q = q.eq('status', 'published');
      if (filters.category) q = q.eq('category', filters.category);
      if (filters.featured)  q = q.eq('featured', true);
    }

    q = q.order('featured', { ascending: false }).order('event_date', { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(normaliseEvent);
  }

  async function getEvent(id) {
    const sb = await client();
    const { data, error } = await sb
      .from('events')
      .select('*, ticket_types(*), event_tags(*)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? normaliseEvent(data) : null;
  }

  async function createEvent(eventData) {
    const sb   = await client();
    const user = window.Auth?.getUser();
    if (!user) throw new Error('Not authenticated');

    const eventId = makeId('EVT');

    const { error: evtErr } = await sb.from('events').insert({
      id:             eventId,
      status:         'pending',
      title:          eventData.title,
      category:       eventData.category,
      event_date:     eventData.date,
      event_time:     eventData.time,
      end_time:       eventData.endTime || eventData.time,
      location:       eventData.location,
      city:           eventData.city,
      province:       eventData.province  || null,
      description:    eventData.description,
      price:          parseFloat(eventData.price) || 0,
      featured:       false,
      sold_out:       false,
      organiser_name: user.organisationName || `${user.firstName} ${user.lastName}`,
      organiser_id:   user.id,
      address:        eventData.address        || null,
      payment_type:   eventData.paymentType    || null,
      payment_link:   eventData.paymentLink    || null,
      bank_name:      eventData.bankName       || null,
      account_holder: eventData.accountHolder  || null,
      account_number: eventData.accountNumber  || null,
      branch_code:    eventData.branchCode     || null,
    });
    if (evtErr) throw evtErr;

    if (Array.isArray(eventData.ticketTypes) && eventData.ticketTypes.length > 0) {
      const { error: ttErr } = await sb.from('ticket_types').insert(
        eventData.ticketTypes.map((tt, i) => ({
          id:          tt.id || `TT-${eventId}-${i + 1}`,
          event_id:    eventId,
          name:        tt.name,
          description: tt.description || tt.name,
          price:       parseFloat(tt.price) || 0,
          available:   parseInt(tt.available) || 100,
          sort_order:  i + 1,
        }))
      );
      if (ttErr) throw ttErr;
    }

    if (Array.isArray(eventData.tags) && eventData.tags.length > 0) {
      const tagRows = eventData.tags.filter(t => t?.trim()).map(t => ({ event_id: eventId, tag: t.trim() }));
      if (tagRows.length) {
        const { error: tagErr } = await sb.from('event_tags').insert(tagRows);
        if (tagErr) throw tagErr;
      }
    }

    return { id: eventId, status: 'pending', ...eventData };
  }

  async function updateEvent(id, eventData) {
    const sb = await client();

    const { error: evtErr } = await sb.from('events').update({
      title:          eventData.title,
      category:       eventData.category,
      event_date:     eventData.date,
      event_time:     eventData.time,
      end_time:       eventData.endTime || eventData.time,
      location:       eventData.location,
      city:           eventData.city,
      province:       eventData.province  || null,
      description:    eventData.description,
      price:          parseFloat(eventData.price) || 0,
      address:        eventData.address        || null,
      payment_type:   eventData.paymentType    || null,
      payment_link:   eventData.paymentLink    || null,
      bank_name:      eventData.bankName       || null,
      account_holder: eventData.accountHolder  || null,
      account_number: eventData.accountNumber  || null,
      branch_code:    eventData.branchCode     || null,
      updated_at:     new Date().toISOString(),
    }).eq('id', id);
    if (evtErr) throw evtErr;

    if (Array.isArray(eventData.ticketTypes)) {
      await sb.from('ticket_types').delete().eq('event_id', id);
      if (eventData.ticketTypes.length > 0) {
        const { error: ttErr } = await sb.from('ticket_types').insert(
          eventData.ticketTypes.map((tt, i) => ({
            id:          tt.id || `TT-${id}-${i + 1}`,
            event_id:    id,
            name:        tt.name,
            description: tt.description || tt.name,
            price:       parseFloat(tt.price) || 0,
            available:   parseInt(tt.available) || 100,
            sort_order:  i + 1,
          }))
        );
        if (ttErr) throw ttErr;
      }
    }

    if (Array.isArray(eventData.tags)) {
      await sb.from('event_tags').delete().eq('event_id', id);
      const tagRows = eventData.tags.filter(t => t?.trim()).map(t => ({ event_id: id, tag: t.trim() }));
      if (tagRows.length) {
        const { error: tagErr } = await sb.from('event_tags').insert(tagRows);
        if (tagErr) throw tagErr;
      }
    }

    return eventData;
  }

  async function deleteEvent(id) {
    const sb = await client();
    const { error } = await sb.from('events').delete().eq('id', id);
    if (error) throw error;
  }

  async function adminCreateEvent(eventData, options = {}) {
    const sb   = await client();
    const user = window.Auth?.getUser();
    if (!user) throw new Error('Not authenticated');

    const eventId = makeId('EVT');

    const { error: evtErr } = await sb.from('events').insert({
      id:             eventId,
      status:         options.status   ?? 'published',
      featured:       options.featured ?? false,
      sold_out:       false,
      title:          eventData.title,
      category:       eventData.category,
      event_date:     eventData.date,
      event_time:     eventData.time,
      end_time:       eventData.endTime || eventData.time,
      location:       eventData.location,
      city:           eventData.city,
      province:       eventData.province  || null,
      description:    eventData.description,
      image:          eventData.image     || null,
      price:          parseFloat(eventData.price) || 0,
      organiser_name: options.organiserName || user.organisationName || `${user.firstName} ${user.lastName}`,
      organiser_id:   user.id,
      address:        eventData.address        || null,
      payment_type:   eventData.paymentType    || null,
      payment_link:   eventData.paymentLink    || null,
      bank_name:      eventData.bankName       || null,
      account_holder: eventData.accountHolder  || null,
      account_number: eventData.accountNumber  || null,
      branch_code:    eventData.branchCode     || null,
    });
    if (evtErr) throw evtErr;

    if (Array.isArray(eventData.ticketTypes) && eventData.ticketTypes.length > 0) {
      const { error: ttErr } = await sb.from('ticket_types').insert(
        eventData.ticketTypes.map((tt, i) => ({
          id:          tt.id || `TT-${eventId}-${i + 1}`,
          event_id:    eventId,
          name:        tt.name,
          description: tt.description || tt.name,
          price:       parseFloat(tt.price) || 0,
          available:   parseInt(tt.available) || 100,
          sort_order:  i + 1,
        }))
      );
      if (ttErr) throw ttErr;
    }

    if (Array.isArray(eventData.tags) && eventData.tags.length > 0) {
      const tagRows = eventData.tags.filter(t => t?.trim()).map(t => ({ event_id: eventId, tag: t.trim() }));
      if (tagRows.length) {
        const { error: tagErr } = await sb.from('event_tags').insert(tagRows);
        if (tagErr) throw tagErr;
      }
    }

    return { id: eventId, ...eventData };
  }

  async function adminUpdateEvent(id, eventData, options = {}) {
    const sb = await client();

    const fields = {
      title:          eventData.title,
      category:       eventData.category,
      event_date:     eventData.date,
      event_time:     eventData.time,
      end_time:       eventData.endTime || eventData.time,
      location:       eventData.location,
      city:           eventData.city,
      province:       eventData.province  || null,
      description:    eventData.description,
      price:          parseFloat(eventData.price) || 0,
      address:        eventData.address        || null,
      payment_type:   eventData.paymentType    || null,
      payment_link:   eventData.paymentLink    || null,
      bank_name:      eventData.bankName       || null,
      account_holder: eventData.accountHolder  || null,
      account_number: eventData.accountNumber  || null,
      branch_code:    eventData.branchCode     || null,
      updated_at:     new Date().toISOString(),
    };
    if (eventData.image)          fields.image          = eventData.image;
    if (options.organiserName)    fields.organiser_name = options.organiserName;
    if (options.status !== undefined) fields.status     = options.status;
    if (options.featured !== undefined) fields.featured = options.featured;

    const { error: evtErr } = await sb.from('events').update(fields).eq('id', id);
    if (evtErr) throw evtErr;

    if (Array.isArray(eventData.ticketTypes)) {
      await sb.from('ticket_types').delete().eq('event_id', id);
      if (eventData.ticketTypes.length > 0) {
        const { error: ttErr } = await sb.from('ticket_types').insert(
          eventData.ticketTypes.map((tt, i) => ({
            id:          tt.id || `TT-${id}-${i + 1}`,
            event_id:    id,
            name:        tt.name,
            description: tt.description || tt.name,
            price:       parseFloat(tt.price) || 0,
            available:   parseInt(tt.available) || 100,
            sort_order:  i + 1,
          }))
        );
        if (ttErr) throw ttErr;
      }
    }

    if (Array.isArray(eventData.tags)) {
      await sb.from('event_tags').delete().eq('event_id', id);
      const tagRows = eventData.tags.filter(t => t?.trim()).map(t => ({ event_id: id, tag: t.trim() }));
      if (tagRows.length) {
        const { error: tagErr } = await sb.from('event_tags').insert(tagRows);
        if (tagErr) throw tagErr;
      }
    }

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

  async function getMyTickets() {
    const sb   = await client();
    const user = window.Auth?.getUser();
    if (!user) return [];
    const { data, error } = await sb
      .from('tickets')
      .select('*')
      .eq('buyer_email', user.email.toLowerCase())
      .order('booked_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(normaliseTicket);
  }

  async function submitTicket(payload) {
    const sb = await client();

    const ticketId  = `TKT-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const subtotal  = payload.ticketPrice * payload.quantity;
    const serviceFee = Math.round(subtotal * 0.05 * 100) / 100;
    const total      = Math.round((subtotal + serviceFee) * 100) / 100;
    const now        = new Date().toISOString();

    const { data, error } = await sb.from('tickets').insert({
      id:                 ticketId,
      status:             'confirmed',
      buyer_first_name:   payload.firstName,
      buyer_last_name:    payload.lastName,
      buyer_email:        payload.email.toLowerCase(),
      buyer_phone:        payload.phone        || null,
      event_id:           payload.eventId,
      event_title:        payload.eventTitle,
      event_date:         payload.eventDate,
      event_time:         payload.eventTime    || null,
      event_location:     payload.eventLocation,
      event_city:         payload.eventCity,
      event_image:        payload.eventImage   || null,
      ticket_type_id:     payload.ticketTypeId,
      ticket_type_name:   payload.ticketTypeName,
      ticket_price:       payload.ticketPrice,
      quantity:           payload.quantity,
      subtotal,
      service_fee:        serviceFee,
      total,
      payment_method:     'pending',
      payment_reference:  null,
      paid_at:            null,
      qr_code_url:        null,
      booked_at:          now,
    }).select().single();

    if (error) throw error;
    return { ...normaliseTicket(data), pricing: { subtotal, serviceFee, total } };
  }

  // ════════════════════════════════════════
  //  PROFILE
  // ════════════════════════════════════════

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

  async function adminGetStats() {
    const sb = await client();
    const [evRes, profRes, tickRes, reqRes] = await Promise.all([
      sb.from('events').select('id, status'),
      sb.from('profiles').select('id, role'),
      sb.from('tickets').select('id', { count: 'exact', head: true }),
      sb.from('equipment_requests').select('id, status'),
    ]);
    const events   = evRes.data   || [];
    const profiles = profRes.data || [];
    const requests = reqRes.data  || [];
    return {
      totalEvents:     events.length,
      publishedEvents: events.filter(e => e.status === 'published').length,
      pendingEvents:   events.filter(e => e.status === 'pending').length,
      ticketsSold:     tickRes.count || 0,
      totalUsers:      profiles.length,
      organisers:      profiles.filter(p => p.role === 'organiser').length,
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
    adminGetServiceRequests, adminUpdateServiceRequestStatus,
    getAccommodations, getAccommodation,
    getMyAccommodationBookings,
    getTouristDestinations, submitAccommodationBooking,
    adminSaveAccommodation, adminDeleteAccommodation,
    adminGetAccommodationBookings, adminUpdateBookingStatus,
    adminSaveTouristDestination, adminDeleteTouristDestination,
    submitServiceRequest, getMyServiceRequests,
    getMyTickets, submitTicket,
    getMyProfile,
  };

})();
