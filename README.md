# TicketsSA

Marketplace for events, stays, experiences, equipment and merchandise in South Africa.

- **Frontend:** static HTML/CSS/JS in `frontend/`
- **Accounts, data, photos:** Firebase (Auth, Firestore, Storage); rules in `firestore.rules` / `storage.rules`
- **Emails and login checks:** Netlify Functions in `netlify/functions/` (email via Resend, captcha via Cloudflare Turnstile)
- **Payments:** none. Owners and customers arrange payment directly.

See **RUNNING-LOCALLY.md** for setup, testing and deploying.
