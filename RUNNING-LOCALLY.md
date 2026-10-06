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
2. **List an event, a lodge, equipment** (homepage buttons, or Seller Hub -> Create Listing). Upload photos
   and pick a cancellation/refund policy. Each should: show "submitted for review", email
   support@ticketssa.co.za, email you a receipt, and appear in **Admin** as `pending`.
3. In Admin click **Review**: you see the photos, contact details, every detail and the refund policy.
   **Approve** (seller is emailed, listing goes public) or **Decline with reason** (seller is emailed
   and sees the reason in their Seller Hub).
4. **Book it** from a second account: ticket checkout, or "enquire" on a stay. The owner, the
   customer and support each get an email.
5. **Request equipment**: Services -> Get a Quote -> submit. Support and the customer get an email.

## 4. Deploy to Netlify (and keep the credits down)

Netlify's credit plans (see [how credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)):
each **production deploy costs a flat 15 credits** (file count and size do not change that), bandwidth is
10 credits per GB, and previews/rollbacks/failed deploys are free. So the savings come from deploying less often and sending visitors fewer bytes.
What this project already does:
- Photos are compressed (4.4 MB down to 0.6 MB) and cached for a year.
- CSS/JS/HTML use `no-cache`, so browsers re-check with a tiny "unchanged" reply instead of re-downloading everything.
- `npm run package` builds a clean `deploy/` folder (about 2 MB, 80 files) with only what the site needs.

**To deploy:** test locally first, then run `npm run package` and drag the **`deploy/`** folder onto Netlify.
Do all your testing locally so you only spend 15 credits when you are happy.

Set these under Netlify -> Site configuration -> Environment variables: `RESEND_API_KEY`,
`SEND_EMAIL_HOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (and optionally `SUPPORT_EMAIL`, `ADMIN_EXTRA_EMAILS`).
After deploying, Netlify -> Functions should list all five: `notify-booking`, `notify-decision`,
`notify-signin`, `send-auth-email`, `submit-seller-application`.

## Legal pages
`terms.html`, `privacy.html` and `refunds.html` are written for South African law (CPA, ECTA, POPIA) but
are a draft: **have an attorney review them**, then fill in the company details and Information Officer
(see the TODO comments at the top of `terms.html` and `privacy.html`).
