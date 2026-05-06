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

const mysql = require('mysql2/promise');

let pool = null;

// Parse a mysql:// or mysql2:// connection URL into individual fields
function parseDbUrl(url) {
  try {
    const u = new URL(url);
    return {
      host:     u.hostname,
      port:     parseInt(u.port || '3306', 10),
      user:     decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ''),
    };
  } catch {
    return null;
  }
}

function getPool() {
  if (pool) return pool;

  // Railway always provides DATABASE_URL or MYSQL_URL as a full connection string.
  // Individual MYSQL* vars require explicit variable references in Railway settings.
  // We try the connection string first, then fall back to individual vars.
  const rawUrl = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.MYSQL_PRIVATE_URL;
  const fromUrl = rawUrl ? parseDbUrl(rawUrl) : null;

  if (fromUrl) {
    console.log('[DB] Using DATABASE_URL connection string');
  }

  const config = {
    host:     fromUrl?.host     || process.env.MYSQLHOST     || process.env.MYSQL_HOST     || process.env.DB_HOST     || 'localhost',
    port:     fromUrl?.port     || parseInt(process.env.MYSQLPORT    || process.env.MYSQL_PORT    || process.env.DB_PORT     || '3306', 10),
    user:     fromUrl?.user     || process.env.MYSQLUSER     || process.env.MYSQL_USER     || process.env.DB_USER     || 'root',
    password: fromUrl?.password || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: fromUrl?.database || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || process.env.DB_NAME     || 'myticketsa',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    charset:            'utf8mb4',
    timezone:           '+00:00',
    typeCast(field, next) {
      if (field.type === 'DATE') return field.string();
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
