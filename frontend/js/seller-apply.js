/* ================================================
   Seller application submit helper (seller-apply.js)

   Used by the listing categories that do not have a
   Supabase table yet (equipment hire, merchandise).
   Posts to the submit-seller-application Netlify
   Function, which emails the seller and the team.
   ================================================ */

const SellerApply = (() => {

  const ENDPOINT = '/.netlify/functions/submit-seller-application';

  /**
   * @param {string} kind            'equipment' | 'merchandise'
   * @param {Object} data
   * @param {string} data.title      Listing name (email subject)
   * @param {string} data.contactName
   * @param {string} data.contactEmail
   * @param {string} data.contactPhone
   * @param {Array<{label:string,value:string}>} data.details
   * @returns {Promise<{success:boolean, reference:string}>}
   */
  async function submit(kind, data) {
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ kind, ...data }),
      });
    } catch (e) {
      throw new Error('No connection. Check your internet and try again.');
    }

    if (res.status === 404) {
      // Running from a plain static server (local dev) rather than Netlify.
      throw new Error('Submissions only work on the live site. Please try again at ticketssa.co.za.');
    }
    if (!res.ok) {
      throw new Error('We could not send that through. Please try again, or email support@ticketssa.co.za.');
    }
    return res.json().catch(() => ({ success: true }));
  }

  /** Turn wizard state into the {label,value} rows the email renders. */
  function detailsFrom(pairs) {
    return pairs
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
      .map(([label, value]) => ({ label, value: Array.isArray(value) ? value.join(', ') : String(value) }));
  }

  return { submit, detailsFrom };

})();
