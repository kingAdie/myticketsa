# TicketsSA: run it locally, then deploy

The live site is **static HTML + Supabase + Netlify Functions**. The old `backend/` (MySQL/Express)
folder is not used any more.

## 1. One-time Supabase setup (required for listings to work)

Supabase Dashboard -> **SQL Editor** -> New query -> paste all of `supabase/setup.sql` -> **Run**.
It is safe to run twice. It lets any signed-in user submit a listing (always as `pending`) and lets
admins see and approve everything.

Make yourself admin: Authentication -> Users -> your user -> **Raw app meta data** -> `{"role": "admin"}`
(log out and in again afterwards).

## 2. Run on your MacBook

```bash
git fetch origin claude/great-goldberg-k6omkg
git checkout claude/great-goldberg-k6omkg
cp .env.example .env        # then put your real RESEND_API_KEY in .env
npm run dev                 # site + Netlify Functions at http://localhost:8888
```

`npm run dev` needs Node 18+ (`brew install node`). First run downloads the Netlify CLI.
If you only want to look at pages (no emails): `npm run serve`.

## 3. What to test, in order

1. **Sign up**: Sign Up, new email. You get a confirmation email; click it, you land signed-in and
   get a welcome email, and support@ticketssa.co.za gets a "new user" email.
2. **List an event**: homepage -> *List Your Event* (it opens Sign Up if you are signed out) -> fill
   the wizard -> Submit. Check: support inbox gets "New event listing", you get a receipt, and it
   shows in **Admin -> Events** as `pending`.
3. **List a lodge** (hero card), **equipment** (card under Event Equipment), plus experience and
   merchandise from `create-listing.html`. Stays appear in **Admin -> Accommodations**;
   equipment/merch in **Admin -> Equipment & Merch**. Set status to *published* to approve.
4. Approved listings appear on the public pages.

## 4. Deploy to Netlify

Set these in Netlify -> Site configuration -> Environment variables:
`RESEND_API_KEY`, `SEND_EMAIL_HOOK_SECRET`, optionally `SUPPORT_EMAIL`, `ADMIN_EXTRA_EMAILS`.

Emails are sent by Netlify Functions in `netlify/functions/`. Drag-and-drop of just the `frontend/`
folder will deploy the pages but **not** the functions (no emails). Either connect the GitHub repo to
Netlify (recommended, builds from `netlify.toml`) or use `npx netlify-cli deploy --prod`.
