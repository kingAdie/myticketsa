'use strict';

const { supabaseAdmin } = require('./supabase');

// ════════════════════════════════════════════
//  USERS  (via public.profiles table)
// ════════════════════════════════════════════

async function getUsers() {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(toUser);
}

async function getUserById(id) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toUser(data) : null;
}

async function getUserByEmail(email) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data ? toUser(data) : null;
}

async function saveUser(user) {
  // Update the profiles table (source of truth for profile data)
  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id:                user.id,
      email:             (user.email || '').toLowerCase(),
      first_name:        user.firstName        || '',
      last_name:         user.lastName         || '',
      role:              user.role             || 'attendee',
      organisation_name: user.organisationName || null,
      updated_at:        new Date().toISOString(),
    }, { onConflict: 'id' });
  if (profileErr) throw profileErr;

  // Mirror role into auth metadata so the next JWT reflects the change
  if (user.role) {
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: { role: user.role },
    });
  }

  return user;
}

function toUser(row) {
  return {
    id:               row.id,
    firstName:        row.first_name        || '',
    lastName:         row.last_name         || '',
    email:            row.email,
    role:             row.role              || 'attendee',
    organisationName: row.organisation_name || null,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };
}

// ════════════════════════════════════════════
//  EVENTS
// ════════════════════════════════════════════

async function getEvents() {
  const { data, error } = await supabaseAdmin
    .from('events')
    .select('*, ticket_types(*), event_tags(*)')
    .order('featured',    { ascending: false })
    .order('event_date',  { ascending: true  });
  if (error) throw error;
  return (data || []).map(row => toEvent(row, row.ticket_types, row.event_tags));
}

async function getEventById(id) {
  const { data, error } = await supabaseAdmin
    .from('events')
    .select('*, ticket_types(*), event_tags(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toEvent(data, data.ticket_types, data.event_tags) : null;
}

async function saveEvent(event) {
  const { error: evtErr } = await supabaseAdmin
    .from('events')
    .upsert({
      id:             event.id,
      status:         event.status       || 'pending',
      title:          event.title,
      category:       event.category,
      event_date:     event.date,
      event_time:     event.time,
      end_time:       event.endTime      || event.time,
      location:       event.location,
      city:           event.city,
      province:       event.province     || null,
      description:    event.description,
      image:          event.image        || null,
      price:          parseFloat(event.price) || 0,
      featured:       !!event.featured,
      sold_out:       !!event.sold_out,
      organiser_name: event.organiser    || null,
      organiser_id:   event.organiserId,
      address:        event.address      || null,
      payment_type:   event.paymentType  || null,
      payment_link:   event.paymentLink  || null,
      bank_name:      event.bankName     || null,
      account_holder: event.accountHolder || null,
      account_number: event.accountNumber || null,
      branch_code:    event.branchCode   || null,
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'id' });
  if (evtErr) throw evtErr;

  if (Array.isArray(event.ticketTypes)) {
    await supabaseAdmin.from('ticket_types').delete().eq('event_id', event.id);
    if (event.ticketTypes.length > 0) {
      const { error: ttErr } = await supabaseAdmin.from('ticket_types').insert(
        event.ticketTypes.map((tt, i) => ({
          id:          tt.id  || `TT-${event.id}-${i + 1}`,
          event_id:    event.id,
          name:        tt.name,
          description: tt.description || tt.name,
          price:       parseFloat(tt.price)     || 0,
          available:   parseInt(tt.available)   || 100,
          sort_order:  i + 1,
        }))
      );
      if (ttErr) throw ttErr;
    }
  }

  if (Array.isArray(event.tags)) {
    await supabaseAdmin.from('event_tags').delete().eq('event_id', event.id);
    const tagRows = event.tags
      .filter(t => t?.trim())
      .map(t => ({ event_id: event.id, tag: t.trim() }));
    if (tagRows.length > 0) {
      const { error: tagErr } = await supabaseAdmin.from('event_tags').insert(tagRows);
      if (tagErr) throw tagErr;
    }
  }

  return event;
}

async function deleteEvent(id) {
  const { error } = await supabaseAdmin.from('events').delete().eq('id', id);
  if (error) throw error;
}

function toEvent(row, allTTs, allTags) {
  return {
    id:             row.id,
    status:         row.status,
    title:          row.title,
    category:       row.category,
    date:           row.event_date,
    time:           row.event_time  ? String(row.event_time).slice(0, 5)  : null,
    endTime:        row.end_time    ? String(row.end_time).slice(0, 5)    : null,
    location:       row.location,
    city:           row.city,
    province:       row.province,
    description:    row.description,
    image:          row.image,
    price:          parseFloat(row.price),
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
    ticketTypes:    (allTTs || []).map(tt => ({
      id:          tt.id,
      name:        tt.name,
      description: tt.description,
      price:       parseFloat(tt.price),
      available:   tt.available,
      sold:        tt.sold || 0,
    })),
    tags: (allTags || []).map(t => t.tag),
  };
}

// ════════════════════════════════════════════
//  SEED HELPERS
// ════════════════════════════════════════════

async function seedEventsIfEmpty() {
  const { count, error } = await supabaseAdmin
    .from('events')
    .select('*', { count: 'exact', head: true });
  if (error || count > 0) return;

  // Get the admin user ID to assign as organiser of seed events
  const { data: adminProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();

  if (!adminProfile) {
    console.log('[SEED] No admin profile yet — skipping event seed.');
    return;
  }

  const adminId = adminProfile.id;

  const events = [
    { id:'EVT001', status:'published', title:'Cape Town Jazz Festival 2025', category:'Music', event_date:'2025-03-28', event_time:'18:00', end_time:'23:30', location:'Cape Town International Convention Centre', city:'Cape Town', province:'Western Cape', description:"South Africa's premier jazz event returns for another unforgettable night of world-class music. The Cape Town International Jazz Festival is Africa's largest jazz festival, featuring over 40 performances across multiple stages.", image:'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80', price:850.00, featured:true, sold_out:false, organiser_name:'Cape Town Jazz Events', organiser_id:adminId },
    { id:'EVT002', status:'published', title:'Joburg Tech Summit 2025', category:'Technology', event_date:'2025-04-15', event_time:'08:30', end_time:'17:00', location:'Sandton Convention Centre', city:'Johannesburg', province:'Gauteng', description:"Join South Africa's leading technology conference, bringing together innovators, entrepreneurs, and industry leaders from across the continent.", image:'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80', price:1200.00, featured:true, sold_out:false, organiser_name:'TechSA Events', organiser_id:adminId },
    { id:'EVT003', status:'published', title:'Durban Food & Wine Festival', category:'Food & Drink', event_date:'2025-05-02', event_time:'11:00', end_time:'20:00', location:'Moses Mabhida Stadium Precinct', city:'Durban', province:'KwaZulu-Natal', description:'Celebrate the best of South African cuisine and wine at the Durban Food & Wine Festival. With over 60 exhibitors, chef demonstrations, wine pairings and live entertainment.', image:'https://images.unsplash.com/photo-1567521464027-f127ff144326?w=800&q=80', price:320.00, featured:false, sold_out:false, organiser_name:'Durban Taste Events', organiser_id:adminId },
    { id:'EVT004', status:'published', title:'Soweto Marathon 2025', category:'Sport', event_date:'2025-11-02', event_time:'06:00', end_time:'13:00', location:'FNB Stadium, Nasrec', city:'Johannesburg', province:'Gauteng', description:"One of South Africa's most beloved road races returns! Run through the vibrant streets of Soweto in this iconic marathon experience.", image:'https://images.unsplash.com/photo-1561897853-28a06f19df2f?w=800&q=80', price:280.00, featured:false, sold_out:false, organiser_name:'Athletics SA', organiser_id:adminId },
    { id:'EVT005', status:'published', title:'Afrikaans is Groot 2025', category:'Music', event_date:'2025-09-05', event_time:'17:00', end_time:'23:00', location:'Loftus Versfeld Stadium', city:'Pretoria', province:'Gauteng', description:'Die grootste Afrikaanse musiekgeleentheid van die jaar is terug! Featuring the biggest names in Afrikaans music across multiple stages.', image:'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&q=80', price:420.00, featured:true, sold_out:false, organiser_name:'Showtime Events', organiser_id:adminId },
    { id:'EVT006', status:'published', title:'Cape Winelands Harvest Festival', category:'Food & Drink', event_date:'2025-03-15', event_time:'10:00', end_time:'18:00', location:'Franschhoek Wine Valley', city:'Franschhoek', province:'Western Cape', description:'Celebrate the grape harvest season in the beautiful Franschhoek Wine Valley. Join award-winning wine estates for a day of barrel tastings, harvest activities and live music.', image:'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=80', price:550.00, featured:false, sold_out:false, organiser_name:'Franschhoek Wine Valley', organiser_id:adminId },
  ];

  const { error: evtErr } = await supabaseAdmin.from('events').insert(events);
  if (evtErr) { console.error('[SEED] Event insert failed:', evtErr.message); return; }

  const ticketTypes = [
    { id:'TT-EVT001-GA',   event_id:'EVT001', name:'General Admission', description:'Access to all general stages',            price:850.00,  available:200, sort_order:1 },
    { id:'TT-EVT001-VIP',  event_id:'EVT001', name:'VIP Experience',    description:'Dedicated VIP lounge & front-stage',     price:1850.00, available:50,  sort_order:2 },
    { id:'TT-EVT002-CONF', event_id:'EVT002', name:'Conference Pass',   description:'Full day access + meals + workshops',    price:1200.00, available:300, sort_order:1 },
    { id:'TT-EVT002-WORK', event_id:'EVT002', name:'Workshop Only',     description:'Afternoon workshop sessions only',       price:450.00,  available:80,  sort_order:2 },
    { id:'TT-EVT003-GA',   event_id:'EVT003', name:'General Admission', description:'Entry + tasting glass included',         price:320.00,  available:500, sort_order:1 },
    { id:'TT-EVT003-PREM', event_id:'EVT003', name:'Premium Tasting',   description:'10 tasting tokens + priority entry',     price:680.00,  available:100, sort_order:2 },
    { id:'TT-EVT004-FULL', event_id:'EVT004', name:'Full Marathon',     description:'Chip-timed full marathon 42.2km',        price:280.00,  available:1000, sort_order:1 },
    { id:'TT-EVT004-HALF', event_id:'EVT004', name:'Half Marathon',     description:'Chip-timed half marathon 21.1km',        price:220.00,  available:2000, sort_order:2 },
    { id:'TT-EVT004-FUN',  event_id:'EVT004', name:'Fun Run',           description:'Non-competitive fun run 10km',           price:160.00,  available:5500, sort_order:3 },
    { id:'TT-EVT005-GA',   event_id:'EVT005', name:'General Admission', description:'Standing general admission',             price:420.00,  available:5000, sort_order:1 },
    { id:'TT-EVT005-SEAT', event_id:'EVT005', name:'Seated Grandstand', description:'Reserved grandstand seating',            price:680.00,  available:800, sort_order:2 },
    { id:'TT-EVT006-PASS', event_id:'EVT006', name:'Full Day Pass',     description:'All-inclusive shuttle + 6 tastings',     price:550.00,  available:250, sort_order:1 },
    { id:'TT-EVT006-PREM', event_id:'EVT006', name:'Premium Pass',      description:'Private cellar tours + chef lunch',      price:950.00,  available:60,  sort_order:2 },
  ];
  await supabaseAdmin.from('ticket_types').insert(ticketTypes);

  const tags = [
    { event_id:'EVT001', tag:'Jazz' },       { event_id:'EVT001', tag:'Live Music' },  { event_id:'EVT001', tag:'Adults' },
    { event_id:'EVT002', tag:'Technology' }, { event_id:'EVT002', tag:'Networking' },  { event_id:'EVT002', tag:'Business' },
    { event_id:'EVT003', tag:'Food' },       { event_id:'EVT003', tag:'Wine' },        { event_id:'EVT003', tag:'Family' },
    { event_id:'EVT004', tag:'Running' },    { event_id:'EVT004', tag:'Sport' },       { event_id:'EVT004', tag:'Community' },
    { event_id:'EVT005', tag:'Afrikaans' },  { event_id:'EVT005', tag:'Live Music' },  { event_id:'EVT005', tag:'Family' },
    { event_id:'EVT006', tag:'Wine' },       { event_id:'EVT006', tag:'Harvest' },     { event_id:'EVT006', tag:'Luxury' },
  ];
  await supabaseAdmin.from('event_tags').insert(tags);

  console.log('[SEED] Demo events seeded.');
}

async function seedAdminIfEmpty() {
  const { count } = await supabaseAdmin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin');
  return count === 0;
}

module.exports = {
  getUsers, getUserById, getUserByEmail, saveUser,
  getEvents, getEventById, saveEvent, deleteEvent,
  seedEventsIfEmpty, seedAdminIfEmpty,
};
