-- ============================================================
--  MyTicketSA Supabase / PostgreSQL Schema v7.0
--
--  HOW TO USE:
--  1. Open your Supabase project → SQL Editor
--  2. Paste this entire file and click Run
--  3. Add SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
--     and SUPABASE_JWT_SECRET to your .env / Railway Variables
--  4. Start the backend the admin seed user is created automatically
-- ============================================================

-- ── Trigger: auto-create a profile row when a new auth user is created ─────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role, organisation_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'firstName',      ''),
    COALESCE(NEW.raw_user_meta_data->>'lastName',       ''),
    COALESCE(NEW.raw_app_meta_data->>'role', 'attendee'),
    NEW.raw_user_meta_data->>'organisationName'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── TABLE: profiles ────────────────────────────────────────────────────────────
-- Mirrors subset of auth.users for JOIN-able queries in the public schema.
-- Kept in sync via the trigger above (insert) and explicit saveUser calls (update).
CREATE TABLE IF NOT EXISTS public.profiles (
  id                UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT        NOT NULL,
  first_name        TEXT        NOT NULL DEFAULT '',
  last_name         TEXT        NOT NULL DEFAULT '',
  role              TEXT        NOT NULL DEFAULT 'attendee'
                    CHECK (role IN ('attendee', 'organiser', 'admin')),
  organisation_name TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Install trigger AFTER the table exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── TABLE: events ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id             TEXT           NOT NULL PRIMARY KEY,
  status         TEXT           NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','published','rejected','cancelled')),
  title          TEXT           NOT NULL,
  category       TEXT           NOT NULL,
  event_date     DATE           NOT NULL,
  event_time     TIME           NOT NULL,
  end_time       TIME,
  location       TEXT           NOT NULL,
  city           TEXT           NOT NULL,
  province       TEXT,
  description    TEXT           NOT NULL,
  image          TEXT,
  price          NUMERIC(10,2)  NOT NULL DEFAULT 0.00,
  featured       BOOLEAN        NOT NULL DEFAULT FALSE,
  sold_out       BOOLEAN        NOT NULL DEFAULT FALSE,
  organiser_name TEXT,
  organiser_id   UUID           NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  address        TEXT,
  payment_type   TEXT           CHECK (payment_type IN ('link','bank','free')),
  payment_link   TEXT,
  bank_name      TEXT,
  account_holder TEXT,
  account_number TEXT,
  branch_code    TEXT
);

-- ── TABLE: ticket_types ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ticket_types (
  id          TEXT           NOT NULL PRIMARY KEY,
  event_id    TEXT           NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT           NOT NULL,
  description TEXT,
  price       NUMERIC(10,2)  NOT NULL DEFAULT 0.00,
  available   INTEGER        NOT NULL DEFAULT 100,
  sold        INTEGER        NOT NULL DEFAULT 0,
  sort_order  INTEGER        NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ── TABLE: event_tags ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_tags (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tag      TEXT NOT NULL,
  PRIMARY KEY (event_id, tag)
);

-- ── TABLE: tickets ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tickets (
  id                 TEXT           NOT NULL PRIMARY KEY,
  status             TEXT           NOT NULL DEFAULT 'confirmed'
                     CHECK (status IN ('pending','confirmed','used','cancelled')),

  -- Buyer snapshot (survives account deletion)
  buyer_first_name   TEXT           NOT NULL,
  buyer_last_name    TEXT           NOT NULL,
  buyer_email        TEXT           NOT NULL,
  buyer_phone        TEXT,
  buyer_user_id      UUID,

  -- Event snapshot
  event_id           TEXT           NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  event_title        TEXT           NOT NULL,
  event_date         DATE           NOT NULL,
  event_time         TIME           NOT NULL,
  event_location     TEXT           NOT NULL,
  event_city         TEXT           NOT NULL,
  event_image        TEXT,

  -- Ticket tier
  ticket_type_id     TEXT           NOT NULL,
  ticket_type_name   TEXT           NOT NULL,
  ticket_price       NUMERIC(10,2)  NOT NULL,
  quantity           INTEGER        NOT NULL DEFAULT 1,

  -- Pricing breakdown
  subtotal           NUMERIC(10,2)  NOT NULL,
  service_fee        NUMERIC(10,2)  NOT NULL DEFAULT 0.00,
  total              NUMERIC(10,2)  NOT NULL,

  -- Payment
  payment_reference  TEXT,
  payment_method     TEXT           DEFAULT 'simulated',
  paid_at            TIMESTAMPTZ,

  -- QR code
  qr_code_url        TEXT,

  booked_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ── TABLE: equipment_requests ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.equipment_requests (
  id            BIGINT      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_id    TEXT        NOT NULL,
  service_name  TEXT        NOT NULL,
  event_date    DATE        NOT NULL,
  duration      TEXT,
  location      TEXT        NOT NULL,
  quantity      INTEGER     NOT NULL DEFAULT 1,
  details       TEXT,
  contact_phone TEXT        NOT NULL,
  budget_range  TEXT,
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','quoted','confirmed','cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_events_status    ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_city      ON events(city);
CREATE INDEX IF NOT EXISTS idx_events_category  ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_date      ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_organiser ON events(organiser_id);
CREATE INDEX IF NOT EXISTS idx_events_featured  ON events(featured);
CREATE INDEX IF NOT EXISTS idx_tt_event         ON ticket_types(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_email    ON tickets(buyer_email);
CREATE INDEX IF NOT EXISTS idx_tickets_event    ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_payref   ON tickets(payment_reference);
CREATE INDEX IF NOT EXISTS idx_tickets_status   ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_eq_req_user      ON equipment_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_eq_req_status    ON equipment_requests(status);

-- Full-text search index on events
CREATE INDEX IF NOT EXISTS idx_events_fts ON events
  USING gin(
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(city, '')  || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(description, '')
    )
  );

-- ── Views ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_published_events AS
SELECT
  e.*,
  COUNT(DISTINCT t.id)         AS bookings,
  COALESCE(SUM(t.quantity), 0) AS units_sold,
  COALESCE(SUM(t.total), 0)    AS revenue
FROM events e
LEFT JOIN tickets t ON t.event_id = e.id AND t.status IN ('confirmed', 'used')
WHERE e.status = 'published'
GROUP BY e.id;

CREATE OR REPLACE VIEW v_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM events)                                                            AS total_events,
  (SELECT COUNT(*) FROM events   WHERE status   = 'published')                             AS published_events,
  (SELECT COUNT(*) FROM events   WHERE status   = 'pending')                               AS pending_events,
  (SELECT COUNT(*) FROM events   WHERE featured = TRUE)                                    AS featured_events,
  (SELECT COUNT(*) FROM profiles)                                                          AS total_users,
  (SELECT COUNT(*) FROM profiles WHERE role     = 'organiser')                             AS total_organisers,
  (SELECT COALESCE(SUM(quantity), 0) FROM tickets WHERE status IN ('confirmed','used'))    AS tickets_sold,
  (SELECT COALESCE(SUM(total),    0) FROM tickets WHERE status IN ('confirmed','used'))    AS total_revenue;

CREATE OR REPLACE VIEW v_recent_bookings AS
SELECT
  t.id, t.booked_at, t.status,
  t.buyer_first_name, t.buyer_last_name, t.buyer_email,
  t.event_title, t.event_date,
  t.ticket_type_name, t.quantity, t.total,
  t.payment_reference, t.payment_method
FROM tickets t
ORDER BY t.booked_at DESC;

-- ── Seed da
ta ──────────────────────────────────────────────────────────────────
-- NOTE: The admin user (admin@myticketsa.co.za / admin123) is seeded automatically
-- by server.js on first startup. Demo events are also seeded programmatically.
-- You do NOT need to insert users or events manually after running this schema.
