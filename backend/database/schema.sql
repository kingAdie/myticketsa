-- ============================================================
--  MyTicketSA — MySQL Database Schema v1.0
--  Compatible with MySQL Workbench 8.0+
--
--  HOW TO USE IN MYSQL WORKBENCH:
--  1. Open MySQL Workbench and connect to your local server
--  2. File → Open SQL Script → select this file
--  3. Click the lightning bolt ⚡ (Execute All) button
--  4. You should see "6 Tables created" in the output panel
--  5. Then update your .env file with your MySQL credentials
-- ============================================================

-- ── Drop and recreate database (clean slate on each run) ────────────────────
DROP DATABASE IF EXISTS myticketsa;
CREATE DATABASE myticketsa
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE myticketsa;

-- ============================================================
--  TABLE: users
--  Stores all accounts: attendees, organisers, admins
-- ============================================================
CREATE TABLE users (
  id                VARCHAR(40)  NOT NULL,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  email             VARCHAR(255) NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  role              ENUM('attendee','organiser','admin') NOT NULL DEFAULT 'attendee',
  organisation_name VARCHAR(255) DEFAULT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  TABLE: events
--  All event listings regardless of status
-- ============================================================
CREATE TABLE events (
  id             VARCHAR(40)   NOT NULL,
  status         ENUM('pending','published','rejected','cancelled') NOT NULL DEFAULT 'pending',
  title          VARCHAR(255)  NOT NULL,
  category       VARCHAR(100)  NOT NULL,
  event_date     DATE          NOT NULL,
  event_time     TIME          NOT NULL,
  end_time       TIME          DEFAULT NULL,
  location       VARCHAR(255)  NOT NULL,
  city           VARCHAR(100)  NOT NULL,
  province       VARCHAR(100)  DEFAULT NULL,
  description    TEXT          NOT NULL,
  image          VARCHAR(1000) DEFAULT NULL,
  price          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  featured       TINYINT(1)    NOT NULL DEFAULT 0,
  sold_out       TINYINT(1)    NOT NULL DEFAULT 0,
  organiser_name VARCHAR(255)  DEFAULT NULL,
  organiser_id   VARCHAR(40)   NOT NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  address        VARCHAR(500)  DEFAULT NULL,
  payment_type   ENUM('link','bank','free') DEFAULT NULL,
  payment_link   VARCHAR(1000) DEFAULT NULL,
  bank_name      VARCHAR(100)  DEFAULT NULL,
  account_holder VARCHAR(200)  DEFAULT NULL,
  account_number VARCHAR(50)   DEFAULT NULL,
  branch_code    VARCHAR(20)   DEFAULT NULL,

  PRIMARY KEY (id),
  KEY idx_events_status    (status),
  KEY idx_events_city      (city),
  KEY idx_events_category  (category),
  KEY idx_events_date      (event_date),
  KEY idx_events_organiser (organiser_id),
  KEY idx_events_featured  (featured),
  FULLTEXT KEY ft_events_search (title, city, category, description),
  CONSTRAINT fk_events_organiser FOREIGN KEY (organiser_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  TABLE: ticket_types
--  Each event has 1–5 ticket tiers (GA, VIP, Early Bird…)
-- ============================================================
CREATE TABLE ticket_types (
  id          VARCHAR(40)   NOT NULL,
  event_id    VARCHAR(40)   NOT NULL,
  name        VARCHAR(100)  NOT NULL,
  description VARCHAR(500)  DEFAULT NULL,
  price       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  available   INT           NOT NULL DEFAULT 100,
  sold        INT           NOT NULL DEFAULT 0,
  sort_order  INT           NOT NULL DEFAULT 0,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_tt_event (event_id),
  CONSTRAINT fk_tt_event FOREIGN KEY (event_id)
    REFERENCES events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  TABLE: event_tags
--  Simple tag strings linked to an event
-- ============================================================
CREATE TABLE event_tags (
  event_id VARCHAR(40)  NOT NULL,
  tag      VARCHAR(100) NOT NULL,

  PRIMARY KEY (event_id, tag),
  CONSTRAINT fk_tags_event FOREIGN KEY (event_id)
    REFERENCES events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  TABLE: tickets
--  Confirmed bookings / sold tickets
-- ============================================================
CREATE TABLE tickets (
  id                 VARCHAR(40)   NOT NULL,
  status             ENUM('pending','confirmed','used','cancelled') NOT NULL DEFAULT 'confirmed',

  -- Buyer (snapshot — survives account deletion)
  buyer_first_name   VARCHAR(100)  NOT NULL,
  buyer_last_name    VARCHAR(100)  NOT NULL,
  buyer_email        VARCHAR(255)  NOT NULL,
  buyer_phone        VARCHAR(50)   DEFAULT NULL,
  buyer_user_id      VARCHAR(40)   DEFAULT NULL,

  -- Event snapshot
  event_id           VARCHAR(40)   NOT NULL,
  event_title        VARCHAR(255)  NOT NULL,
  event_date         DATE          NOT NULL,
  event_time         TIME          NOT NULL,
  event_location     VARCHAR(255)  NOT NULL,
  event_city         VARCHAR(100)  NOT NULL,
  event_image        VARCHAR(1000) DEFAULT NULL,

  -- Ticket tier
  ticket_type_id     VARCHAR(40)   NOT NULL,
  ticket_type_name   VARCHAR(100)  NOT NULL,
  ticket_price       DECIMAL(10,2) NOT NULL,
  quantity           INT           NOT NULL DEFAULT 1,

  -- Pricing breakdown
  subtotal           DECIMAL(10,2) NOT NULL,
  service_fee        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total              DECIMAL(10,2) NOT NULL,

  -- Payment
  payment_reference  VARCHAR(100)  DEFAULT NULL,
  payment_method     VARCHAR(50)   DEFAULT 'simulated',
  paid_at            DATETIME      DEFAULT NULL,

  -- QR code
  qr_code_url        VARCHAR(500)  DEFAULT NULL,

  booked_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_tickets_buyer_email  (buyer_email),
  KEY idx_tickets_buyer_user   (buyer_user_id),
  KEY idx_tickets_event        (event_id),
  KEY idx_tickets_payment_ref  (payment_reference),
  KEY idx_tickets_status       (status),
  KEY idx_tickets_booked_at    (booked_at),
  CONSTRAINT fk_tickets_event FOREIGN KEY (event_id)
    REFERENCES events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  TABLE: equipment_requests
--  Service rental requests submitted via the dashboard
-- ============================================================
CREATE TABLE equipment_requests (
  id            INT           NOT NULL AUTO_INCREMENT,
  user_id       VARCHAR(40)   NOT NULL,
  service_id    VARCHAR(100)  NOT NULL,
  service_name  VARCHAR(255)  NOT NULL,
  event_date    DATE          NOT NULL,
  duration      VARCHAR(50)   DEFAULT NULL,
  location      VARCHAR(255)  NOT NULL,
  quantity      INT           NOT NULL DEFAULT 1,
  details       TEXT          DEFAULT NULL,
  contact_phone VARCHAR(50)   NOT NULL,
  budget_range  VARCHAR(50)   DEFAULT NULL,
  status        ENUM('pending','quoted','confirmed','cancelled') NOT NULL DEFAULT 'pending',
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_eq_req_user   (user_id),
  KEY idx_eq_req_status (status),
  KEY idx_eq_req_date   (event_date),
  CONSTRAINT fk_eq_req_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
--  VIEWS
-- ============================================================

-- Published events with ticket sales totals
CREATE OR REPLACE VIEW v_published_events AS
SELECT
  e.id,
  e.title,
  e.category,
  e.event_date,
  e.event_time,
  e.end_time,
  e.location,
  e.city,
  e.province,
  e.description,
  e.image,
  e.price,
  e.featured,
  e.sold_out,
  e.organiser_name,
  e.organiser_id,
  e.created_at,
  COUNT(DISTINCT t.id)         AS bookings,
  COALESCE(SUM(t.quantity), 0) AS units_sold,
  COALESCE(SUM(t.total), 0)    AS revenue
FROM events e
LEFT JOIN tickets t ON t.event_id = e.id AND t.status IN ('confirmed', 'used')
WHERE e.status = 'published'
GROUP BY e.id;

-- Admin dashboard stats (matches the getStats controller response)
CREATE OR REPLACE VIEW v_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM events)                                                             AS total_events,
  (SELECT COUNT(*) FROM events WHERE status = 'published')                                  AS published_events,
  (SELECT COUNT(*) FROM events WHERE status = 'pending')                                    AS pending_events,
  (SELECT COUNT(*) FROM events WHERE featured = 1)                                          AS featured_events,
  (SELECT COUNT(*) FROM users)                                                              AS total_users,
  (SELECT COUNT(*) FROM users WHERE role = 'organiser')                                     AS total_organisers,
  (SELECT COALESCE(SUM(quantity), 0) FROM tickets WHERE status IN ('confirmed','used'))     AS tickets_sold,
  (SELECT COALESCE(SUM(total), 0)    FROM tickets WHERE status IN ('confirmed','used'))     AS total_revenue;

-- Recent bookings for admin review
CREATE OR REPLACE VIEW v_recent_bookings AS
SELECT
  t.id,
  t.booked_at,
  t.status,
  t.buyer_first_name,
  t.buyer_last_name,
  t.buyer_email,
  t.event_title,
  t.event_date,
  t.ticket_type_name,
  t.quantity,
  t.total,
  t.payment_reference,
  t.payment_method
FROM tickets t
ORDER BY t.booked_at DESC;


-- ============================================================
--  SEED DATA — same 6 events as the original JSON file
-- ============================================================

-- Admin user
-- Password: admin123
-- NOTE: The bcrypt hash below uses cost factor 10.
-- When server.js starts it will re-seed the hash fresh if users table is empty.
INSERT INTO users (id, first_name, last_name, email, password_hash, role, organisation_name) VALUES
('USR-ADMIN-001', 'Admin', 'User', 'admin@myticketsa.co.za',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh3y',
 'admin', 'MyTicketSA');

-- Events
INSERT INTO events (id, status, title, category, event_date, event_time, end_time, location, city, province, description, image, price, featured, sold_out, organiser_name, organiser_id) VALUES

('EVT001', 'published', 'Cape Town Jazz Festival 2025', 'Music',
 '2025-03-28', '18:00:00', '23:30:00',
 'Cape Town International Convention Centre', 'Cape Town', 'Western Cape',
 'South Africa''s premier jazz event returns for another unforgettable night of world-class music. The Cape Town International Jazz Festival is Africa''s largest jazz festival, featuring over 40 performances across multiple stages.',
 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80',
 850.00, 1, 0, 'Cape Town Jazz Events', 'USR-ADMIN-001'),

('EVT002', 'published', 'Joburg Tech Summit 2025', 'Technology',
 '2025-04-15', '08:30:00', '17:00:00',
 'Sandton Convention Centre', 'Johannesburg', 'Gauteng',
 'Join South Africa''s leading technology conference, bringing together innovators, entrepreneurs, and industry leaders from across the continent.',
 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80',
 1200.00, 1, 0, 'TechSA Events', 'USR-ADMIN-001'),

('EVT003', 'published', 'Durban Food & Wine Festival', 'Food & Drink',
 '2025-05-02', '11:00:00', '20:00:00',
 'Moses Mabhida Stadium Precinct', 'Durban', 'KwaZulu-Natal',
 'Celebrate the best of South African cuisine and wine at the Durban Food & Wine Festival. With over 60 exhibitors, chef demonstrations, wine pairings and live entertainment.',
 'https://images.unsplash.com/photo-1567521464027-f127ff144326?w=800&q=80',
 320.00, 0, 0, 'Durban Taste Events', 'USR-ADMIN-001'),

('EVT004', 'published', 'Soweto Marathon 2025', 'Sport',
 '2025-11-02', '06:00:00', '13:00:00',
 'FNB Stadium, Nasrec', 'Johannesburg', 'Gauteng',
 'One of South Africa''s most beloved road races returns! Run through the vibrant streets of Soweto in this iconic marathon experience.',
 'https://images.unsplash.com/photo-1561897853-28a06f19df2f?w=800&q=80',
 280.00, 0, 0, 'Athletics SA', 'USR-ADMIN-001'),

('EVT005', 'published', 'Afrikaans is Groot 2025', 'Music',
 '2025-09-05', '17:00:00', '23:00:00',
 'Loftus Versfeld Stadium', 'Pretoria', 'Gauteng',
 'Die grootste Afrikaanse musiekgeleentheid van die jaar is terug! Featuring the biggest names in Afrikaans music across multiple stages.',
 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&q=80',
 420.00, 1, 0, 'Showtime Events', 'USR-ADMIN-001'),

('EVT006', 'published', 'Cape Winelands Harvest Festival', 'Food & Drink',
 '2025-03-15', '10:00:00', '18:00:00',
 'Franschhoek Wine Valley', 'Franschhoek', 'Western Cape',
 'Celebrate the grape harvest season in the beautiful Franschhoek Wine Valley. Join award-winning wine estates for a day of barrel tastings, harvest activities and live music.',
 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=80',
 550.00, 0, 0, 'Franschhoek Wine Valley', 'USR-ADMIN-001');

-- Ticket types
INSERT INTO ticket_types (id, event_id, name, description, price, available, sort_order) VALUES
('TT-EVT001-GA',   'EVT001', 'General Admission', 'Access to all general stages',            850.00,  200, 1),
('TT-EVT001-VIP',  'EVT001', 'VIP Experience',    'Dedicated VIP lounge & front-stage',     1850.00,   50, 2),
('TT-EVT002-CONF', 'EVT002', 'Conference Pass',   'Full day access + meals + workshops',    1200.00,  300, 1),
('TT-EVT002-WORK', 'EVT002', 'Workshop Only',     'Afternoon workshop sessions only',        450.00,   80, 2),
('TT-EVT003-GA',   'EVT003', 'General Admission', 'Entry + tasting glass included',          320.00,  500, 1),
('TT-EVT003-PREM', 'EVT003', 'Premium Tasting',   '10 tasting tokens + priority entry',      680.00,  100, 2),
('TT-EVT004-FULL', 'EVT004', 'Full Marathon',     'Chip-timed full marathon 42.2km',         280.00, 1000, 1),
('TT-EVT004-HALF', 'EVT004', 'Half Marathon',     'Chip-timed half marathon 21.1km',         220.00, 2000, 2),
('TT-EVT004-FUN',  'EVT004', 'Fun Run',           'Non-competitive fun run 10km',            160.00, 5500, 3),
('TT-EVT005-GA',   'EVT005', 'General Admission', 'Standing general admission',              420.00, 5000, 1),
('TT-EVT005-SEAT', 'EVT005', 'Seated Grandstand', 'Reserved grandstand seating',             680.00,  800, 2),
('TT-EVT006-PASS', 'EVT006', 'Full Day Pass',     'All-inclusive shuttle + 6 tastings',      550.00,  250, 1),
('TT-EVT006-PREM', 'EVT006', 'Premium Pass',      'Private cellar tours + chef lunch',       950.00,   60, 2);

-- Event tags
INSERT INTO event_tags (event_id, tag) VALUES
('EVT001', 'Jazz'),       ('EVT001', 'Live Music'),   ('EVT001', 'Adults'),
('EVT002', 'Technology'), ('EVT002', 'Networking'),   ('EVT002', 'Business'),
('EVT003', 'Food'),       ('EVT003', 'Wine'),         ('EVT003', 'Family'),
('EVT004', 'Running'),    ('EVT004', 'Sport'),        ('EVT004', 'Community'),
('EVT005', 'Afrikaans'),  ('EVT005', 'Live Music'),   ('EVT005', 'Family'),
('EVT006', 'Wine'),       ('EVT006', 'Harvest'),      ('EVT006', 'Luxury');


-- ============================================================
--  Verification output (visible in MySQL Workbench output tab)
-- ============================================================
SELECT '✅ MyTicketSA database created successfully!' AS Status;
SELECT '' AS '';
SELECT 'Tables:' AS '';
SHOW TABLES;
SELECT '' AS '';
SELECT 'Row counts:' AS Info;
SELECT 'users'               AS `Table`, COUNT(*) AS `Rows` FROM users
UNION ALL SELECT 'events',                    COUNT(*) FROM events
UNION ALL SELECT 'ticket_types',              COUNT(*) FROM ticket_types
UNION ALL SELECT 'event_tags',                COUNT(*) FROM event_tags
UNION ALL SELECT 'tickets',                   COUNT(*) FROM tickets
UNION ALL SELECT 'equipment_requests',        COUNT(*) FROM equipment_requests;

SELECT '' AS '';
SELECT 'Dashboard stats preview:' AS '';
SELECT * FROM v_dashboard_stats;
