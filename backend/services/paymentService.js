/**
 * utils/paymentService.js
 *
 * Abstracts payment processing.
 *
 * In SANDBOX mode (PAYFAST_SANDBOX=true):
 *   - Instantly resolves as "success" without contacting any external API.
 *   - Returns a reference you can use to build PayFast's hosted page URL.
 *
 * In LIVE mode:
 *   - Builds the correct PayFast checkout payload.
 *   - The frontend would redirect the user to PayFast's hosted page.
 *   - PayFast calls /api/payment/notify (ITN) on completion.
 *
 * To switch to Ozow or any other SA gateway in V2, replace this file only.
 */

'use strict';

const crypto = require('crypto');

// PayFast sandbox URL
const PAYFAST_SANDBOX_URL = 'https://sandbox.payfast.co.za/eng/process';
const PAYFAST_LIVE_URL    = 'https://www.payfast.co.za/eng/process';

/**
 * Create a payment request.
 *
 * @param {Object} params - { amount, firstName, lastName, email, itemName }
 * @returns {{ success: boolean, reference: string, method: string, checkoutUrl?: string }}
 */
async function createPayment({ amount, firstName, lastName, email, itemName }) {
  const reference = generatePaymentRef();
  const isSandbox = process.env.PAYFAST_SANDBOX === 'true';

  // ── Sandbox / Simulate: return success immediately ────────────────────────
  if (isSandbox) {
    console.log(`[PAYMENT] Sandbox: simulating payment for ${email}, R${amount}, ref=${reference}`);
    return {
      success:      true,
      reference,
      method:       'payfast_sandbox',
      checkoutUrl:  null, // no redirect in sandbox simulate mode
      amount,
    };
  }

  // ── Live: build PayFast hosted checkout payload ───────────────────────────
  const payload = buildPayFastPayload({
    merchantId:  process.env.PAYFAST_MERCHANT_ID,
    merchantKey: process.env.PAYFAST_MERCHANT_KEY,
    passphrase:  process.env.PAYFAST_PASSPHRASE,
    returnUrl:   process.env.PAYFAST_RETURN_URL,
    cancelUrl:   process.env.PAYFAST_CANCEL_URL,
    notifyUrl:   process.env.PAYFAST_NOTIFY_URL,
    reference,
    firstName,
    lastName,
    email,
    amount,
    itemName,
  });

  // The frontend will use checkoutUrl + payload to POST the user to PayFast
  return {
    success:      true,
    reference,
    method:       'payfast',
    checkoutUrl:  PAYFAST_LIVE_URL,
    payload,      // send these hidden form fields to PayFast
    amount,
  };
}

/**
 * Build the PayFast payment payload with correct MD5 signature.
 * Reference: https://developers.payfast.co.za/docs#checkout_page
 */
function buildPayFastPayload({
  merchantId, merchantKey, passphrase,
  returnUrl, cancelUrl, notifyUrl,
  reference, firstName, lastName, email,
  amount, itemName,
}) {
  // Format amount to 2 decimal places (PayFast requirement)
  const formattedAmount = parseFloat(amount).toFixed(2);

  const params = {
    merchant_id:   merchantId,
    merchant_key:  merchantKey,
    return_url:    returnUrl,
    cancel_url:    cancelUrl,
    notify_url:    notifyUrl,
    name_first:    firstName,
    name_last:     lastName,
    email_address: email,
    m_payment_id:  reference,
    amount:        formattedAmount,
    item_name:     itemName,
  };

  // Generate signature
  const signature = generateSignature(params, passphrase);
  return { ...params, signature };
}

/**
 * Generate MD5 signature for PayFast payload.
 */
function generateSignature(params, passphrase) {
  const queryString = Object.keys(params)
    .map((key) => `${key}=${encodeURIComponent(String(params[key]).trim())}`)
    .join('&');

  const stringToHash = passphrase
    ? `${queryString}&passphrase=${encodeURIComponent(passphrase.trim())}`
    : queryString;

  return crypto.createHash('md5').update(stringToHash).digest('hex');
}

/**
 * Generate a unique payment reference: PAY-XXXXXXXXXX
 */
function generatePaymentRef() {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PAY-${ts}${rnd}`;
}

module.exports = { createPayment, buildPayFastPayload, generateSignature };
