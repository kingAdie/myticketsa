# TicketsSA: run it locally, test it, then deploy

Static HTML + Supabase + Netlify Functions. Nothing else is needed (the old MySQL/Express
`backend/` folder has been removed).

## 1. One-time Supabase setup

Supabase Dashboard -> **SQL Editor** -> New query -> paste all of `supabase/setup.sql` -> **Run**
(safe to run twice). It creates the `seller_listings` table, the `listing-images` photo bucket,
and the policies that let any signed-in user submit listings (always as `pending`) while only
admins can see and approve everything.

Make yourself admin: Authentication -> Users -> your user -> **Raw app meta data** ->
`{"role": "admin"}`, then log out and in.

## 2. Run it on your Mac

```bash
git fetch origin claude/great-goldberg-k6omkg
git checkout claude/great-goldberg-k6omkg
cp .env.example .env     # open .env and fill in the values below
npm run dev              # site + email functions at http://localhost:8888  (Ctrl+C to stop)
```

Needs Node 18+ (`brew install node`). `.env` values for local testing:

| Variable | Where to get it |
|---|---|
| `RESEND_API_KEY` | resend.com -> API Keys |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase -> Settings -> API -> service_role (keep secret) |
| `SUPPORT_EMAIL` | optional, defaults to support@ticketssa.co.za |

`npm run dev` is a small built-in server (`dev-server.js`) that serves the site and runs the email functions. If you prefer Netlify's own tool: `npm run dev:netlify`.

### Local-testing caveats (these come from Supabase/Cloudflare, not the code)
- **Sign-up confirmation email** is sent by Supabase's *Send Email Hook*, which points at your
  **live** Netlify URL, and the link inside it goes to `www.ticketssa.co.za`. So when you test
  sign-up locally: submit the form on localhost, click the link in the email (it opens the live
  site, which confirms the account and sends the welcome email), then come back to localhost and log in.
- **Captcha:** Cloudflare Turnstile must have `localhost` in its allowed domains, otherwise
  sign-up on localhost shows a captcha error.
- Every other email (listings, equipment requests, bookings) is sent by your **local** functions.

## 3. Test checklist

1. **Sign up** with a new email -> confirmation email arrives -> confirm -> log in at localhost.
2. **List an event, a lodge, equipment** (homepage buttons, or Seller Hub -> Create Listing).
   Each should: show "submitted for review", email support@ticketssa.co.za, email you a receipt,
   and appear in **Admin** (Events / Accommodations / Equipment & Merch) as `pending`.
3. **Approve** it in Admin; it then appears on the public pages.
4. **Book it** from a second account: ticket checkout, or "enquire" on a stay. The owner, the
   customer and support each get an email.
5. **Request equipment**: Services -> Get a Quote -> submit. Support and the customer get an email.

## 4. Deploy to Netlify

Netlify -> Site configuration -> Environment variables: `RESEND_API_KEY`,
`SEND_EMAIL_HOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (and optionally `SUPPORT_EMAIL`,
`ADMIN_EXTRA_EMAILS`).

Emails are sent by Netlify Functions in `netlify/functions/`. Deploy from the **project root**
(the folder containing `netlify.toml`), not just `frontend/`, or the functions are skipped and no
emails send. After deploying, check Netlify -> Functions lists all four: `notify-booking`,
`notify-signin`, `send-auth-email`, `submit-seller-application`.

## Still needed before a public launch
Terms of Service, Privacy Policy and Refund Policy pages. The old footer links pointed nowhere, so
they were removed; checkout still asks buyers to agree to them.
