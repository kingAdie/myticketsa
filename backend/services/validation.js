/**
 * utils/validation.js
 *
 * Input validation helpers. Returns an array of error strings.
 * Empty array = all valid.
 */

'use strict';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate the checkout form payload.
 * @param {Object} data
 * @returns {string[]} Array of error messages (empty if valid)
 */
function validateCheckoutInput(data) {
  const errors = [];
  const { firstName, lastName, email, ticketTypeName, ticketPrice, quantity } = data;

  // ── Name ──────────────────────────────────────────────────────────────────
  if (!firstName || firstName.trim().length < 2) {
    errors.push('First name must be at least 2 characters.');
  }
  if (!lastName || lastName.trim().length < 2) {
    errors.push('Last name must be at least 2 characters.');
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  if (!email || !EMAIL_REGEX.test(email.trim())) {
    errors.push('A valid email address is required.');
  }

  // ── Ticket ────────────────────────────────────────────────────────────────
  if (!ticketTypeName || ticketTypeName.trim().length === 0) {
    errors.push('Ticket type is required.');
  }

  const price = parseFloat(ticketPrice);
  if (isNaN(price) || price < 0) {
    errors.push('Ticket price must be a valid non-negative number.');
  }

  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty < 1 || qty > 10) {
    errors.push('Quantity must be between 1 and 10.');
  }

  return errors;
}

/**
 * Sanitise a string – trim and strip anything other than safe chars.
 * Use for display names, event titles, etc.
 */
function sanitiseString(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '').slice(0, maxLen);
}

/**
 * Check whether a string is a valid South African mobile number.
 * Accepts formats: 082 123 4567 / 0821234567 / +27821234567
 */
function isValidSAPhone(phone) {
  if (!phone) return true; // optional field
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return /^(\+27|0)[6-8][0-9]{8}$/.test(cleaned);
}

module.exports = { validateCheckoutInput, sanitiseString, isValidSAPhone };
