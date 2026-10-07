# TicketsSA: setup, testing and deploying

**What this site runs on:** Firebase (project `tickets-sa`: sign-in, database, photos) + Netlify (hosting and
the email/login functions) + Resend (email) + Cloudflare Turnstile (captcha).
TicketsSA takes **no payments**. Owners and customers arrange payment directly.

---

## Part 1: Publish the new security rules (required, 5 minutes)

The database rules decide who may read and write what. They changed in this version (anyone can now submit a
listing, but only as `pending`, and equipment/merchandise submissions have a new home). **Until you publish
them, equipment/merchandise listings can't be saved in the admin portal, and the old rules let a signed-in user
publish their own listing without review.**

1. Firebase Console -> **Firestore Database** -> **Rules** tab.
2. Delete what's there, paste the whole contents of `firestore.rules` from this repo, click **Publish**.
3. (Storage rules did not change.)

## Part 2: Netlify setup (this is what fixes "CAPTCHA check failed")

Logging in calls the Netlify function `verify-turnstile`. If the site was deployed by dragging only the
`frontend` folder, the functions were never uploaded, so every login failed. To fix it properly:

1. Netlify -> your site -> **Site configuration -> Build & deploy -> Continuous deployment -> Link repository**.
   Pick `kingAdie/myticketsa` and the branch you deploy from.
2. **Deploys -> Stop auto publishing.** Each production deploy costs 15 credits, so this lets you publish
   only when you choose (open a finished deploy and click *Publish deploy*).
3. **Site configuration -> Environment variables.** Add (the full list with explanations is in `.env.example`):

   | Variable | Where to get it |
   |---|---|
   | `TURNSTILE_SECRET_KEY` | Cloudflare -> Turnstile -> your site -> Secret key |
   | `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase Console -> Project settings -> Service accounts -> Generate new private key (paste the whole JSON on one line) |
   | `RESEND_API_KEY` | resend.com -> API Keys |
   | `SUPPORT_EMAIL` | optional, defaults to support@ticketssa.co.za |

4. Deploy, then open **Functions** in Netlify. You should see all six: `firebase-send-auth-email`,
   `firebase-set-role`, `notify-booking`, `notify-decision`, `submit-seller-application`, `verify-turnstile`.
5. Check two allow-lists include your real domain: Cloudflare Turnstile (hostnames) and
   Firebase Console -> Authentication -> Settings -> **Authorized domains**.

Now login works, and the site tells people the truth if the captcha service is ever down ("temporarily
unavailable") instead of a misleading "try again".

**Why not drag-and-drop?** Four functions use the `firebase-admin` library. Netlify only installs libraries
for you when it builds from your repository (or via the Netlify CLI), not for a dragged folder.

## Part 3: Test it on your Mac before publishing

```bash
git clone https://github.com/kingAdie/myticketsa.git
cd myticketsa
git checkout <the branch you are deploying>
npm install
cp .env.example .env        # fill in the same values as Netlify
npm run dev                 # http://localhost:8888
```
Needs Node 18+ (nodejs.org). **Heads up:** local testing talks to your **real** Firebase project and sends
**real** emails, so use a throwaway email address, and expect your test listings to show up as `pending` in the
live admin portal (decline or delete them afterwards). Turnstile must list `localhost` as an allowed hostname.

## Part 4: Test checklist

1. **Sign up** with a new email. You get a confirmation email. Click it and log in.
2. **List an event, a lodge and equipment** (homepage buttons, or Seller Hub -> Create Listing). Upload
   photos and pick a cancellation/refund policy. Each shows "submitted for review", emails
   support@ticketssa.co.za, emails you a receipt, and appears in **Admin** as pending.
3. In Admin click **Review**: photos, contact details, everything the seller entered, and the refund policy.
   **Approve** (seller emailed, goes public) or **Decline with reason** (seller emailed, reason shown in
   their Seller Hub).
4. From a second account, **book** the event or send a stay enquiry. The owner, the customer and support each get an email.
5. **Request equipment** (Services -> Get a Quote). Support and the customer get an email.

## Making someone an admin
Admin portal -> **Users**, change a person's role. The very first admin is made with
`FIREBASE_SERVICE_ACCOUNT_KEY='<json>' node scripts/bootstrap-admin.js you@example.com`.

## Keeping Netlify credits low
- A production deploy is a flat 15 credits whatever the size; bandwidth is 10 credits per GB. Publish rarely.
- Photos were compressed (4.4 MB -> 0.6 MB) and are cached for a year; CSS/JS/HTML use `no-cache`
  (the browser asks "changed?" and gets a tiny "no" instead of re-downloading everything).

## Before a public launch
- Have an attorney review `terms.html`, `privacy.html` and `refunds.html` (written for South African law: CPA, ECTA, POPIA),
  and fill in the company details / Information Officer where the TODO comments say.
- `top32-venda.html` is an old event page that nothing links to; delete it if you don't need it.
