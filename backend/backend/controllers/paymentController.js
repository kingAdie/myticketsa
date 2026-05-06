/**
 * controllers/paymentController.js
 *
 * Handles PayFast Instant Transaction Notifications (ITN) and
 * the sandbox simulate endpoint for local development.
 *
 * PayFast ITN Flow:
 *   1. User completes payment on PayFast's hosted page
 *   2. PayFast POSTs to /api/payment/notify with payment details
 *   3. We verify the signature, update ticket status, and confirm to PayFast
 *
 * Reference: https://developers.payfast.co.za/docs#notifications
 */

'use strict';

const crypto        = require('crypto');
const ticketService = require('../services/ticketService');
const emailService  = require('../services/emailService');

// In-memory payment status store (replace with DB in V2)
const paymentStore = new Map();

/**
 * POST /api/payment/notify
 * PayFast sends this after every transaction.
 * We must respond with HTTP 200 within 10 seconds.
 */
async function handleNotify(req, res, next) {
  try {
    const data = req.body;

    // ── 1. Acknowledge PayFast immediately ──────────────────────────────────
    res.status(200).send('');

    // ── 2. Verify signature ─────────────────────────────────────────────────
    const isValid = verifyPayFastSignature(data, process.env.PAYFAST_PASSPHRASE);
    if (!isValid) {
      console.warn('[PAYMENT] ITN signature verification failed:', data.m_payment_id);
      return;
    }

    const ref      = data.m_payment_id;
    const status   = data.payment_status; // COMPLETE | CANCELLED | FAILED

    // ── 3. Update payment record ────────────────────────────────────────────
    paymentStore.set(ref, {
      ref,
      status,
      amount:      parseFloat(data.amount_gross),
      payfastId:   data.pf_payment_id,
      email:       data.email_address,
      updatedAt:   new Date().toISOString(),
    });

    console.log(`[PAYMENT] ITN received: ref=${ref}, status=${status}`);

    // ── 4. If complete, mark ticket as paid ─────────────────────────────────
    if (status === 'COMPLETE') {
      const ticket = await ticketService.findTicketByPaymentRef(ref);
      if (ticket) {
        await ticketService.updateTicketStatus(ticket.id, 'confirmed');
        emailService.sendConfirmation(ticket).catch(console.error);
        console.log(`[PAYMENT] Ticket ${ticket.id} confirmed.`);
      }
    }
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payment/simulate
 * Dev/sandbox only: simulate a payment success without hitting PayFast.
 * Body: { reference, amount }
 */
async function simulatePayment(req, res, next) {
  try {
    const { reference, amount } = req.body;

    if (!reference) {
      return res.status(400).json({ success: false, error: 'reference is required' });
    }

    // Store as completed
    paymentStore.set(reference, {
      ref:       reference,
      status:    'COMPLETE',
      amount:    parseFloat(amount || 0),
      payfastId: `SIM-${Date.now()}`,
      updatedAt: new Date().toISOString(),
    });

    console.log(`[PAYMENT] Simulated payment: ref=${reference}, amount=${amount}`);
    return res.json({ success: true, reference, status: 'COMPLETE' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/payment/status/:ref
 */
async function getPaymentStatus(req, res) {
  const record = paymentStore.get(req.params.ref);
  if (!record) {
    return res.json({ success: true, status: 'pending' });
  }
  return res.json({ success: true, ...record });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Verify a PayFast ITN signature.
 * See: https://developers.payfast.co.za/docs#security
 */
function verifyPayFastSignature(data, passphrase) {
  // In sandbox mode we skip strict verification
  if (process.env.PAYFAST_SANDBOX === 'true') return true;

  const params = { ...data };
  delete params.signature;

  // Sort keys alphabetically and build query string
  const queryString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${encodeURIComponent(String(params[key]).trim())}`)
    .join('&');

  const stringToHash = passphrase
    ? `${queryString}&passphrase=${encodeURIComponent(passphrase.trim())}`
    : queryString;

  const hash = crypto.createHash('md5').update(stringToHash).digest('hex');
  return hash === data.signature;
}

module.exports = { handleNotify, simulatePayment, getPaymentStatus };
