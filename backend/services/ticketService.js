'use strict';

const QRCode        = require('qrcode');
const { supabaseAdmin } = require('./supabase');
const storage       = require('./storage');

// ── Create ticket ─────────────────────────────────────────────────────────────

async function createTicket(params) {
  const { buyer, event, ticket, pricing, payment } = params;

  const ticketId   = generateTicketId();
  const qrFileName = `${ticketId}.qr.png`;

  // ── Generate QR code as an in-memory Buffer ───────────────────────────────
  const qrPayload = JSON.stringify({
    id:    ticketId,
    event: event.title,
    name:  `${buyer.firstName} ${buyer.lastName}`,
    qty:   ticket.quantity,
    type:  ticket.typeName,
  });

  let qrBuffer   = null;
  let qrCodeUrl  = null;

  try {
    qrBuffer = await QRCode.toBuffer(qrPayload, {
      type: 'png', width: 300, margin: 2, errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#FFFFFF' },
    });
    qrCodeUrl = await storage.uploadBuffer(qrBuffer, { folder: 'TicketsSA/tickets', public_id: ticketId });
  } catch (err) {
    console.error('[TICKET] QR generation/upload failed:', err.message);
  }

  // ── Insert into Supabase ──────────────────────────────────────────────────
  const { error } = await supabaseAdmin.from('tickets').insert({
    id:                ticketId,
    status:            'confirmed',
    buyer_first_name:  buyer.firstName.trim(),
    buyer_last_name:   buyer.lastName.trim(),
    buyer_email:       buyer.email.trim().toLowerCase(),
    buyer_phone:       buyer.phone       || null,
    buyer_user_id:     null,
    event_id:          event.id,
    event_title:       event.title,
    event_date:        event.date,
    event_time:        event.time,
    event_location:    event.location,
    event_city:        event.city,
    event_image:       event.image       || null,
    ticket_type_id:    ticket.typeId,
    ticket_type_name:  ticket.typeName,
    ticket_price:      ticket.price,
    quantity:          ticket.quantity,
    subtotal:          pricing.subtotal,
    service_fee:       pricing.serviceFee,
    total:             pricing.total,
    payment_reference: payment.reference || null,
    payment_method:    payment.method    || 'simulated',
    paid_at:           payment.paidAt ? new Date(payment.paidAt).toISOString() : new Date().toISOString(),
    qr_code_url:       qrCodeUrl,
  });
  if (error) throw error;

  console.log(`[TICKET] Created: ${ticketId} for ${buyer.email}`);

  return {
    id:      ticketId,
    status:  'confirmed',
    buyer:   { firstName: buyer.firstName, lastName: buyer.lastName, email: buyer.email, phone: buyer.phone || null },
    event:   { id: event.id, title: event.title, date: event.date, time: event.time, location: event.location, city: event.city, image: event.image || null },
    ticket:  { typeId: ticket.typeId, typeName: ticket.typeName, price: ticket.price, quantity: ticket.quantity },
    pricing: { subtotal: pricing.subtotal, serviceFee: pricing.serviceFee, total: pricing.total },
    payment: { reference: payment.reference, method: payment.method || 'simulated', paidAt: payment.paidAt },
    qrCodeUrl,
    qrCodeBuffer: qrBuffer, // Buffer passed to emailService for attachment no disk I/O needed
    bookedAt: new Date().toISOString(),
  };
}

// ── Find ticket by ID ─────────────────────────────────────────────────────────

async function findTicketById(id) {
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toTicketObject(data) : null;
}

// ── Find tickets by buyer email ───────────────────────────────────────────────

async function findTicketsByEmail(email) {
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .eq('buyer_email', email.trim().toLowerCase())
    .order('booked_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(toTicketObject);
}

// ── Find ticket by payment reference ─────────────────────────────────────────

async function findTicketByPaymentRef(ref) {
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .eq('payment_reference', ref)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toTicketObject(data) : null;
}

// ── Update ticket status ──────────────────────────────────────────────────────

async function updateTicketStatus(id, status) {
  const { error } = await supabaseAdmin
    .from('tickets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  return findTicketById(id);
}

// ── Map DB row → object ───────────────────────────────────────────────────────

function toTicketObject(row) {
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

// ── Ticket ID ─────────────────────────────────────────────────────────────────

function generateTicketId() {
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const ts     = Date.now().toString(36).toUpperCase().slice(-4);
  let   random = '';
  for (let i = 0; i < 6; i++) random += chars[Math.floor(Math.random() * chars.length)];
  return `MTS-${random}-${ts}`;
}

module.exports = { createTicket, findTicketById, findTicketsByEmail, findTicketByPaymentRef, updateTicketStatus, generateTicketId };
