/**
 * utils/ticketService.js  (MySQL version)
 *
 * Creates tickets in the MySQL tickets table.
 * QR code PNG files are still written to /backend/tickets/ for serving.
 */
'use strict';

const path = require('path');
const fs   = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const db   = require('./db');

const TICKETS_DIR = path.resolve(__dirname, '../tickets');

// ── Create ticket ─────────────────────────────────────────────────────────────

async function createTicket(params) {
  const { buyer, event, ticket, pricing, payment } = params;

  const ticketId = generateTicketId();

  // ── Generate QR code PNG ──────────────────────────────────────────────────
  const qrPayload = JSON.stringify({
    id:    ticketId,
    event: event.title,
    name:  `${buyer.firstName} ${buyer.lastName}`,
    qty:   ticket.quantity,
    type:  ticket.typeName,
  });

  const qrFileName = `${ticketId}.qr.png`;
  const qrFilePath = path.join(TICKETS_DIR, qrFileName);

  try {
    await fs.mkdir(TICKETS_DIR, { recursive: true });
    await QRCode.toFile(qrFilePath, qrPayload, {
      type: 'png', width: 300, margin: 2, errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  } catch (err) {
    console.error('[TICKET] QR generation failed:', err.message);
  }

  const qrCodeUrl = `/tickets/${qrFileName}`;

  // ── Insert into MySQL ─────────────────────────────────────────────────────
  await db.query(`
    INSERT INTO tickets (
      id, status,
      buyer_first_name, buyer_last_name, buyer_email, buyer_phone, buyer_user_id,
      event_id, event_title, event_date, event_time, event_location, event_city, event_image,
      ticket_type_id, ticket_type_name, ticket_price, quantity,
      subtotal, service_fee, total,
      payment_reference, payment_method, paid_at,
      qr_code_url, booked_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    ticketId, 'confirmed',
    buyer.firstName.trim(), buyer.lastName.trim(),
    buyer.email.trim().toLowerCase(), buyer.phone || null, null,
    event.id, event.title, event.date, event.time, event.location, event.city, event.image || null,
    ticket.typeId, ticket.typeName, ticket.price, ticket.quantity,
    pricing.subtotal, pricing.serviceFee, pricing.total,
    payment.reference || null, payment.method || 'simulated',
    payment.paidAt ? new Date(payment.paidAt) : new Date(),
    qrCodeUrl, new Date(),
  ]);

  console.log(`[TICKET] Created: ${ticketId} for ${buyer.email}`);

  return {
    id: ticketId,
    status: 'confirmed',
    buyer: { firstName: buyer.firstName, lastName: buyer.lastName, email: buyer.email, phone: buyer.phone || null },
    event: { id: event.id, title: event.title, date: event.date, time: event.time, location: event.location, city: event.city, image: event.image || null },
    ticket: { typeId: ticket.typeId, typeName: ticket.typeName, price: ticket.price, quantity: ticket.quantity },
    pricing: { subtotal: pricing.subtotal, serviceFee: pricing.serviceFee, total: pricing.total },
    payment: { reference: payment.reference, method: payment.method || 'simulated', paidAt: payment.paidAt },
    qrCodeUrl,
    qrCodeAbsPath: qrFilePath,
    bookedAt: new Date().toISOString(),
  };
}

// ── Find ticket by ID ─────────────────────────────────────────────────────────

async function findTicketById(id) {
  const [rows] = await db.query('SELECT * FROM tickets WHERE id = ?', [id]);
  return rows.length ? toTicketObject(rows[0]) : null;
}

// ── Find tickets by buyer email ───────────────────────────────────────────────

async function findTicketsByEmail(email) {
  const [rows] = await db.query(
    'SELECT * FROM tickets WHERE buyer_email = ? ORDER BY booked_at DESC',
    [email.trim().toLowerCase()]
  );
  return rows.map(toTicketObject);
}

// ── Find ticket by payment reference ─────────────────────────────────────────

async function findTicketByPaymentRef(ref) {
  const [rows] = await db.query('SELECT * FROM tickets WHERE payment_reference = ? LIMIT 1', [ref]);
  return rows.length ? toTicketObject(rows[0]) : null;
}

// ── Update ticket status ──────────────────────────────────────────────────────

async function updateTicketStatus(id, status) {
  await db.query('UPDATE tickets SET status = ? WHERE id = ?', [status, id]);
  return findTicketById(id);
}

// ── Map DB row to object ──────────────────────────────────────────────────────

function toTicketObject(row) {
  return {
    id: row.id, status: row.status,
    buyer: { firstName: row.buyer_first_name, lastName: row.buyer_last_name, email: row.buyer_email, phone: row.buyer_phone },
    event: { id: row.event_id, title: row.event_title, date: row.event_date, time: row.event_time, location: row.event_location, city: row.event_city, image: row.event_image },
    ticket: { typeId: row.ticket_type_id, typeName: row.ticket_type_name, price: parseFloat(row.ticket_price), quantity: row.quantity },
    pricing: { subtotal: parseFloat(row.subtotal), serviceFee: parseFloat(row.service_fee), total: parseFloat(row.total) },
    payment: { reference: row.payment_reference, method: row.payment_method, paidAt: row.paid_at },
    qrCodeUrl: row.qr_code_url,
    bookedAt: row.booked_at,
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
