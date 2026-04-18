/**
 * utils/db.js
 *
 * MySQL connection pool using mysql2/promise.
 *
 * IMPORTANT: dotenv must be loaded in server.js BEFORE this module
 * is required. We use a lazy-initialised pool so the connection is
 * only created the first time a query is made (after dotenv is ready).
 */

'use strict';

// Load .env here as a safety net in case this file is required before server.js
// does it — calling config() multiple times is harmless.
// dotenv loaded by server.js before this module is used

const mysql = require('mysql2/promise');

let pool = null;

function getPool() {
  if (pool) return pool;

  const config = {
    host:               process.env.DB_HOST     || 'localhost',
    port:               parseInt(process.env.DB_PORT || '3306', 10),
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASSWORD || '',
    database:           process.env.DB_NAME     || 'myticketsa',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    charset:            'utf8mb4',
    timezone:           '+00:00',
    typeCast(field, next) {
      // Keep DATE as 'YYYY-MM-DD' string — matches JSON store format
      if (field.type === 'DATE') return field.string();
      // Keep TIME as 'HH:MM' string
      if (field.type === 'TIME') {
        const raw = field.string();
        return raw ? raw.slice(0, 5) : null;
      }
      return next();
    },
  };

  pool = mysql.createPool(config);
  return pool;
}

// Proxy object — every method call goes to the real pool.
// This means `require('./db').query(...)` works immediately even
// though the pool is created lazily after dotenv is loaded.
module.exports = new Proxy({}, {
  get(_, prop) {
    return (...args) => getPool()[prop](...args);
  },
});
