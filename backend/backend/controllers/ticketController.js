/**
 * controllers/ticketController.js
 *
 * Handles reading ticket data from the file-based store.
 */

'use strict';

const ticketService = require('../services/ticketService');

/**
 * GET /api/ticket/:id
 * Returns full ticket JSON.
 */
async function getTicket(req, res, next) {
  try {
    const ticket = await ticketService.findTicketById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error:   `Ticket ${req.params.id} not found.`,
      });
    }

    return res.json({ success: true, ticket });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/ticket/:id/qr
 * Returns the QR code image URL for the ticket.
 */
async function getTicketQR(req, res, next) {
  try {
    const ticket = await ticketService.findTicketById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found.' });
    }

    return res.json({ success: true, qrCodeUrl: ticket.qrCodeUrl });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/ticket/mine
 * Returns all tickets for the currently authenticated user (matched by email).
 */
async function getMyTickets(req, res, next) {
  try {
    const tickets = await ticketService.findTicketsByEmail(req.user.email);
    return res.json({ success: true, tickets });
  } catch (err) {
    next(err);
  }
}

module.exports = { getTicket, getTicketQR, getMyTickets };
