/* ================================================
   MyTicketSA — Supabase Data Layer (api.js)
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

  return {
    getEvents, getEvent,
    createEvent, updateEvent, deleteEvent,
    submitServiceRequest, getMyServiceRequests,
    getMyTickets,
    getMyProfile,
  };

})();
