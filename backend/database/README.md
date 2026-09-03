# TicketsSA MySQL Database Setup Guide

## What's in this folder

| File | Purpose |
|------|---------|
| `schema.sql` | Creates all tables, views, indexes and seed data |

---

## Step 1 Run schema.sql in MySQL Workbench

1. Open **MySQL Workbench**
2. Connect to your local MySQL server (usually `localhost:3306`)
3. Go to **File → Open SQL Script** and select `database/schema.sql`
4. Click the **lightning bolt ⚡** button (*Execute All*)
5. You should see in the output:
   ```
   ✅ TicketsSA database created successfully!
   Tables: users, events, ticket_types, event_tags, tickets, equipment_requests
   ```

---

## Step 2 Update your .env file

Open `backend/.env` and fill in your MySQL password:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_root_password_here
DB_NAME=TicketsSA
```

> If you use a different MySQL user, set `DB_USER` to that user.
> Make sure that user has full access to the `TicketsSA` database.

---

## Step 3 Start the server

```bash
cd backend
npm install
npm run dev
```

You should see:
```
[DB] Connected to MySQL database: TicketsSA
[SEED] Admin → admin@TicketsSA.co.za / admin123
🎟  TicketsSA v5   Ready
🌐  http://localhost:5500
```

---

## Database Tables

### `users`
Stores all accounts (attendees, organisers, admins).

### `events`
All event listings with status (pending/published/rejected/cancelled).

### `ticket_types`
Ticket tiers per event (GA, VIP, Early Bird, etc.) with prices and availability.

### `event_tags`
Tag strings linked to events for filtering.

### `tickets`
Every confirmed booking. Stores a snapshot of buyer + event info so records survive edits.

### `equipment_requests`
Service rental requests submitted through the dashboard.

---

## Useful Views (query these in MySQL Workbench)

```sql
-- See all published events with sales stats
SELECT * FROM v_published_events;

-- Admin dashboard numbers
SELECT * FROM v_dashboard_stats;

-- All recent bookings
SELECT * FROM v_recent_bookings LIMIT 20;
```

---

## Reset the database

If you need a clean slate, just re-run `schema.sql` in MySQL Workbench.
It drops and recreates the entire database.

---

## Default admin credentials

| Field | Value |
|-------|-------|
| Email | `admin@TicketsSA.co.za` |
| Password | `admin123` |

Change the password after your first login.
