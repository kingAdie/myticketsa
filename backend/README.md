# TicketsSA v6 Platform Documentation

South Africa's event ticketing platform. Three-section architecture:
**Public** → **Organiser Dashboard** → **Admin Portal**

---

## Quick Start

```bash
# 1. Set up the database (MySQL Workbench)
#    File → Open SQL Script → database/schema.sql → ⚡ Execute All

# 2. Configure environment
cd backend
cp .env.example .env
# Edit .env: set DB_PASSWORD and JWT_SECRET

# 3. Install and run
npm install
npm run dev
# → http://localhost:5500
```

**Default admin login:** `admin@TicketsSA.co.za` / `admin123`

---

## Architecture

```
TicketsSA-v6/
├── backend/
│   ├── config/
│   │   └── index.js              ← Centralised env config (single source of truth)
│   ├── middleware/
│   │   ├── auth.js               ← JWT verification + role guards
│   │   ├── rateLimiter.js        ← Brute-force protection on auth routes
│   │   └── errorHandler.js       ← Centralised error response
│   ├── routes/
│   │   ├── auth.js               ← /api/auth/* (register, login, me)
│   │   ├── public.js             ← /api/events/* (no auth needed)
│   │   ├── organiser.js          ← /api/organiser/* (requireAuth)
│   │   ├── admin.js              ← /api/admin/* (requireAuth + requireAdmin)
│   │   ├── checkout.js           ← /api/checkout
│   │   ├── tickets.js            ← /api/ticket/:id
│   │   └── payment.js            ← /api/payment/*
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── eventsController.js
│   │   ├── checkoutController.js
│   │   ├── paymentController.js
│   │   ├── ticketController.js
│   │   └── serviceRequestController.js ← NEW
│   ├── services/
│   │   ├── db.js                 ← MySQL pool (lazy, dotenv-safe)
│   │   ├── dataStore.js          ← User + event CRUD (MySQL)
│   │   ├── ticketService.js      ← Ticket creation + QR codes (MySQL)
│   │   ├── serviceRequestService.js ← Equipment request CRUD (NEW)
│   │   ├── emailService.js       ← Transactional emails
│   │   ├── paymentService.js     ← PayFast integration
│   │   ├── validation.js         ← Input validation helpers
│   │   └── formatters.js         ← Date / currency formatters
│   └── server.js                 ← Express app entry point
│
├── frontend/
│   ├── js/
│   │   ├── config.js             ← NEW: single _API_BASE declaration
│   │   ├── auth.js               ← Auth module (login, register, guards)
│   │   ├── utils.js              ← Shared UI helpers
│   │   ├── events.js             ← Public events data fetcher
│   │   ├── home.js               ← Homepage logic
│   │   ├── event.js              ← Event detail page
│   │   ├── checkout.js           ← Purchase flow
│   │   ├── organiser.js          ← Organiser dashboard
│   │   └── success.js            ← Post-purchase page
│   ├── admin/
│   │   ├── index.html            ← Admin portal (events, tickets, users, requests)
│   │   ├── login.html            ← Admin login page
│   │   ├── admin.js              ← Admin portal logic
│   │   └── admin.css
│   ├── css/                      ← Stylesheets
│   ├── index.html                ← Public homepage
│   ├── dashboard.html            ← Organiser dashboard
│   └── ...
│
└── database/
    ├── schema.sql                ← Full MySQL schema + seed data
    ├── test-connection.js        ← Connection diagnostic tool
    └── README.md
```

---

## API Reference

### Public (no auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | List published events (supports `?category=`, `?search=`, `?featured=true`) |
| GET | `/api/events/:id` | Get single event with ticket types |
| GET | `/api/health` | Server health check |

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get JWT token |
| GET | `/api/auth/me` | Validate token + get current user |

### Organiser (Bearer token required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/organiser/events` | Submit event for review → `status: pending` |
| PUT | `/api/organiser/events/:id` | Update own event |
| DELETE | `/api/organiser/events/:id` | Delete own event |
| POST | `/api/organiser/requests` | Submit equipment request |
| GET | `/api/organiser/requests` | List my requests |
| GET | `/api/organiser/requests/:id` | Get one request |

### Admin (Bearer token + admin role)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Dashboard statistics |
| GET | `/api/admin/events` | All events (any status) |
| PUT | `/api/admin/events/:id/status` | Approve / reject / feature event |
| GET | `/api/admin/users` | All users |
| PUT | `/api/admin/users/:id/role` | Change user role |
| GET | `/api/admin/tickets` | All sold tickets |
| GET | `/api/admin/requests` | All equipment requests |
| PUT | `/api/admin/requests/:id/status` | Update request status |

### Checkout & Tickets
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/checkout` | Purchase tickets (validates → charges → generates QR) |
| GET | `/api/ticket/:id` | Retrieve ticket by ID |
| GET | `/api/ticket/:id/qr` | Get QR code URL |

---

## User Roles

| Role | Can do |
|------|--------|
| `attendee` | Browse events, purchase tickets, submit events (pending), request equipment |
| `organiser` | Same as attendee + update/delete own events |
| `admin` | Everything + approve/reject events, manage users, view all data |

---

## Bugs Fixed in v6

| # | Bug | Impact | Fix |
|---|-----|--------|-----|
| 1 | `sanitiseUser` was `async` | Login/register returned `user: {}` auth completely broken | Removed `async` keyword |
| 2 | `isLoggedIn()` didn't check JWT expiry | Users stayed "logged in" after 7-day token expired | Added client-side JWT decode + expiry check |
| 3 | `_API_BASE` declared in 6 files | `SyntaxError` on pages that loaded two JS files | Centralised to `js/config.js` |
| 4 | Equipment requests had no backend | Dashboard form did `setTimeout` simulation, saved nothing | Full route + controller + service + DB table |
| 5 | JWT secret was a weak placeholder | Tokens could be forged by anyone reading the code | Config warns + `.env.example` shows how to generate |
| 6 | No rate limiting on auth | Brute-force password attacks possible | `express-rate-limit` on login/register (10 req/15 min) |
| 7 | `optionalAuth` duplicated in routes | Inconsistent behaviour, imported JWT inline | Moved to shared `middleware/auth.js` |
| 8 | Admin login redirect after login | Admin users redirected to `admin/login.html` instead of dashboard | Fixed to `dashboard.html` |
| 9 | No server-side token validation on page load | Revoked/deleted user still appeared logged in | `GET /api/auth/me` called on dashboard/organiser load |
| 10 | `utils/` folder mixed concerns | Hard to navigate: services, helpers, and middleware all in one folder | Renamed to `services/`, created `middleware/`, `config/` |

---

## Generating a Strong JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy the output into `JWT_SECRET=` in your `.env`.

---

## Default Credentials

| Field | Value |
|-------|-------|
| Email | `admin@TicketsSA.co.za` |
| Password | `admin123` |

**Change immediately after first login.**
