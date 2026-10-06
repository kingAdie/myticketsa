/* ================================================
   Seller application submit helper (seller-apply.js)

   Used by the listing categories that do not have a
   Supabase table yet (equipment hire, merchandise).
   Posts to the submit-seller-application Netlify
   Function, which emails the seller and the team.
   ================================================ */

const SellerApply = (() => {

  const ENDPOINT = '/.netlify/functions/submit-seller-application';

  /* Categories with no table of their own are also recorded in `seller_listings`
     so the admin portal can list them. Best effort: if the table has not been
     created yet the email below is still the delivery path. */
  const RECORDED = ['equipment', 'merchandise'];

  async function record(kind, data) {
    if (!RECORDED.includes(kind) || typeof SupabaseAPI === 'undefined' || !SupabaseAPI.createSellerListing) return false;
    try {
      await SupabaseAPI.createSellerListing({
        category:     kind,
        title:        data.title,
        contactName:  data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        details:      data.details || [],
      });
      return true;
    } catch (e) {
      console.warn('Could not record listing in seller_listings:', e && e.message);
      return false;
    }
  }

  /**
   * @param {string} kind            'equipment' | 'merchandise' | 'event' | 'accommodation' | 'experience'
   * @param {Object} data
   * @param {string} data.title      Listing name (email subject)
   * @param {string} data.contactName
   * @param {string} data.contactEmail
   * @param {string} data.contactPhone
   * @param {Array<{label:string,value:string}>} data.details
   * @returns {Promise<{success:boolean, reference:string}>}
   *
   * Emails the seller a confirmation and notifies the TicketsSA support inbox.
   * For equipment / merchandise it also saves the listing for the admin portal,
   * and only fails if BOTH the save and the email failed.
   */
  async function submit(kind, data) {
    const saved = record(kind, data);
    let result = null, failure = null;

    try {
      const res = await fetch(ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ kind, ...data }),
      });
      if (res.status === 404) {
        // Running from a plain static server (local dev) rather than Netlify.
        failure = 'Emails only send on the live site or under `netlify dev`.';
      } else if (!res.ok) {
        failure = 'We could not send that through. Please try again, or email support@ticketssa.co.za.';
      } else {
        result = await res.json().catch(() => ({ success: true }));
      }
    } catch (e) {
      failure = 'No connection. Check your internet and try again.';
    }

    const dbOk = await saved;
    if (result || dbOk) return result || { success: true };
    throw new Error(failure || 'Could not submit right now. Please try again.');
  }

  /** Turn wizard state into the {label,value} rows the email renders. */
  function detailsFrom(pairs) {
    return pairs
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
      .map(([label, value]) => ({ label, value: Array.isArray(value) ? value.join(', ') : String(value) }));
  }

  return { submit, detailsFrom };

})();
