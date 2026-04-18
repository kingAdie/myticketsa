/**
 * controllers/checkoutController.js
 *
 * Orchestrates the full purchase flow:
 *   1. Validate input
 *   2. Simulate payment (or trigger PayFast redirect data)
 *   3. Generate ticket (JSON + QR code)
 *   4. Send confirmation email
 *   5. Return ticket data to frontend
 */

'use strict';

const { validateCheckoutInput } = require('../services/validation');
const ticketService             = require('../services/ticketService');
const emailService              = require('../services/emailService');
const paymentService            = require('../services/paymentService');

/**
 * POST /api/checkout
 */
async function processCheckout(req, res, next) {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      eventId,
      eventTitle,
      eventDate,
      eventTime,
      eventLocation,
      eventCity,
      eventImage,
      ticketTypeId,
      ticketTypeName,
      ticketPrice,
      quantity,
    } = req.body;

    // ── Step 1: Validate ────────────────────────────────────────────────────
    const validationErrors = validateCheckoutInput({
      firstName, lastName, email, ticketTypeName, ticketPrice, quantity,
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors:  validationErrors,
      });
    }

    const unitPrice   = parseFloat(ticketPrice);
    const qty         = parseInt(quantity, 10);
    const serviceFee  = Math.round(unitPrice * qty * 0.05 * 100) / 100;
    const grandTotal  = Math.round((unitPrice * qty + serviceFee) * 100) / 100;

    // ── Step 2: Process payment (simulated for MVP) ─────────────────────────
    const paymentRef = await paymentService.createPayment({
      amount:      grandTotal,
      firstName,
      lastName,
      email,
      itemName:    `${ticketTypeName} – ${eventTitle}`,
    });

    // In sandbox/simulate mode this resolves immediately as "COMPLETE"
    if (!paymentRef.success) {
      return res.status(402).json({
        success: false,
        error:   'Payment could not be processed. Please try again.',
      });
    }

    // ── Step 3: Generate ticket ─────────────────────────────────────────────
    const ticket = await ticketService.createTicket({
      buyer: { firstName, lastName, email, phone: phone || null },
      event: {
        id:       eventId,
        title:    eventTitle,
        date:     eventDate,
        time:     eventTime,
        location: eventLocation,
        city:     eventCity,
        image:    eventImage,
      },
      ticket: {
        typeId:   ticketTypeId,
        typeName: ticketTypeName,
        price:    unitPrice,
        quantity: qty,
      },
      pricing: {
        subtotal:   unitPrice * qty,
        serviceFee,
        total:      grandTotal,
      },
      payment: {
        reference:  paymentRef.reference,
        method:     paymentRef.method,
        paidAt:     new Date().toISOString(),
      },
    });

    // ── Step 4: Send confirmation email ─────────────────────────────────────
    // We fire-and-forget the email – don't let a mail failure break the ticket response
    emailService.sendConfirmation(ticket).catch((err) => {
      console.error('[EMAIL] Failed to send confirmation:', err.message);
    });

    // ── Step 5: Respond to frontend ─────────────────────────────────────────
    return res.status(201).json({
      success: true,
      ticket: {
        id:            ticket.id,
        eventTitle:    ticket.event.title,
        eventDate:     ticket.event.date,
        eventTime:     ticket.event.time,
        eventLocation: ticket.event.location,
        eventCity:     ticket.event.city,
        eventImage:    ticket.event.image,
        ticketTypeName:ticket.ticket.typeName,
        ticketPrice:   ticket.ticket.price,
        quantity:      ticket.ticket.quantity,
        total:         ticket.pricing.total,
        buyer:         ticket.buyer,
        qrCodeUrl:     ticket.qrCodeUrl,
        bookedAt:      ticket.bookedAt,
      },
    });

  } catch (err) {
    next(err);
  }
}

module.exports = { processCheckout };
