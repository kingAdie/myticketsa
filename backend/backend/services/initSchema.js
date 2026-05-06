/**
 * services/initSchema.js
 *
 * Creates all required database tables if they don't already exist.
 * Uses CREATE TABLE IF NOT EXISTS so it is safe to run on every startup.
 *
 * Call: await initSchema(db)
 */
'use strict';

async function initSchema(db) {
  const tables = [
    // ── users ──────────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS users (
      id                VARCHAR(50)   NOT NULL,
      first_name        VARCHAR(100)  NOT NULL,
      last_name         VARCHAR(100)  NOT NULL,
      email             VARCHAR(255)  NOT NULL,
      password_hash     VARCHAR(255)  NOT NULL,
      role              ENUM('admin','organiser','attendee') NOT NULL DEFAULT 'attendee',
      organisation_name VARCHAR(255)  DEFAULT NULL,
      created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // ── events ─────────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS events (
      id               VARCHAR(50)    NOT NULL,
      status           ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
      title            VARCHAR(500)   NOT NULL,
      category         VARCHAR(100)   DEFAULT NULL,
      event_date       DATE           DEFAULT NULL,
      event_time       TIME           DEFAULT NULL,
      end_time         TIME           DEFAULT NULL,
      location         VARCHAR(500)   DEFAULT NULL,
      city             VARCHAR(100)   DEFAULT NULL,
      province         VARCHAR(100)   DEFAULT NULL,
      description      TEXT           DEFAULT NULL,
      image            TEXT           DEFAULT NULL,
      price            DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
      featured         TINYINT(1)     NOT NULL DEFAULT 0,
      sold_out         TINYINT(1)     NOT NULL DEFAULT 0,
      organiser_name   VARCHAR(255)   DEFAULT NULL,
      organiser_id     VARCHAR(50)    DEFAULT NULL,
      created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      address          VARCHAR(500)   DEFAULT NULL,
      payment_type     ENUM('link','bank','free') DEFAULT NULL,
      payment_link     VARCHAR(1000)  DEFAULT NULL,
      bank_name        VARCHAR(100)   DEFAULT NULL,
      account_holder   VARCHAR(200)   DEFAULT NULL,
      account_number   VARCHAR(50)    DEFAULT NULL,
      branch_code      VARCHAR(20)    DEFAULT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // ── ticket_types ───────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS ticket_types (
      id          VARCHAR(50)   NOT NULL,
      event_id    VARCHAR(50)   NOT NULL,
      name        VARCHAR(255)  NOT NULL,
      description VARCHAR(500)  DEFAULT NULL,
      price       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      available   INT           NOT NULL DEFAULT 100,
      sold        INT           NOT NULL DEFAULT 0,
      sort_order  INT           NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      KEY idx_ticket_types_event_id (event_id),
      CONSTRAINT fk_ticket_types_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // ── event_tags ─────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS event_tags (
      event_id  VARCHAR(50)  NOT NULL,
      tag       VARCHAR(100) NOT NULL,
      PRIMARY KEY (event_id, tag),
      CONSTRAINT fk_event_tags_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // ── orders ─────────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS orders (
      id             VARCHAR(50)   NOT NULL,
      user_id        VARCHAR(50)   DEFAULT NULL,
      event_id       VARCHAR(50)   NOT NULL,
      ticket_type_id VARCHAR(50)   DEFAULT NULL,
      quantity       INT           NOT NULL DEFAULT 1,
      total_price    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      status         ENUM('pending','paid','cancelled','refunded') NOT NULL DEFAULT 'pending',
      created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_orders_user_id (user_id),
      KEY idx_orders_event_id (event_id),
      KEY idx_orders_ticket_type_id (ticket_type_id),
      CONSTRAINT fk_orders_event        FOREIGN KEY (event_id)       REFERENCES events       (id) ON DELETE CASCADE,
      CONSTRAINT fk_orders_ticket_type  FOREIGN KEY (ticket_type_id) REFERENCES ticket_types (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // ── tickets ────────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS tickets (
      id             VARCHAR(50)  NOT NULL,
      order_id       VARCHAR(50)  NOT NULL,
      ticket_type_id VARCHAR(50)  DEFAULT NULL,
      ticket_number  VARCHAR(100) NOT NULL,
      qr_code        TEXT         DEFAULT NULL,
      redeemed       TINYINT(1)   NOT NULL DEFAULT 0,
      created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_tickets_order_id (order_id),
      KEY idx_tickets_ticket_type_id (ticket_type_id),
      CONSTRAINT fk_tickets_order       FOREIGN KEY (order_id)       REFERENCES orders       (id) ON DELETE CASCADE,
      CONSTRAINT fk_tickets_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_types (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];

  for (const sql of tables) {
    await db.query(sql);
  }

  console.log('[SCHEMA] ✅ All tables verified / created');
}

module.exports = { initSchema };
