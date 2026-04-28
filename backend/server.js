/**
 * server.js — MyTicketSA API + Static Server
 *
 * Route layout:
 *   /api/auth/*        → authentication (register, login, token check)
 *   /api/events/*      → public event listing + detail (optionalAuth)
 *   /api/organiser/*   → authenticated organiser actions (events CRUD, requests)
 *   /api/admin/*       → admin-only management
 *   /api/checkout      → ticket purchase flow
 *   /api/ticket/*      → ticket retrieval
 *   /api/payment/*     → PayFast ITN + simulate
 *   /api/health        → server health check
 */
'use strict';

const path    = require('path');
const fs      = require('fs');
const config  = require('./config');

// dotenv is loaded by config — no need to call it again
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const bcrypt  = require('bcryptjs');

// ── Routes ────────────────────────────────────────────────────────────────────
const authRoutes      = require('./routes/auth');
const publicRoutes    = require('./routes/public');
const organiserRoutes = require('./routes/organiser');
const adminRoutes     = require('./routes/admin');
const checkoutRoutes  = require('./routes/checkout');
const ticketRoutes    = require('./routes/tickets');
const paymentRoutes   = require('./routes/payment');

// ── Services ──────────────────────────────────────────────────────────────────
const dataStore    = require('./services/dataStore');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const app         = express();
const PORT        = config.port;
const PROD        = config.isProd;
const frontendDir = path.resolve(__dirname, '../frontend');
const ticketsDir  = path.resolve(__dirname, config.ticketsDir);

if (!fs.existsSync(ticketsDir)) fs.mkdirSync(ticketsDir, { recursive: true });

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy:     false, // managed per-env
  crossOriginOpenerPolicy:   false,
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
  originAgentCluster:        false,
}));

app.use(cors({
  origin: (origin, cb) => {
    const allowed = config.cors.origin;
    // Allow all, or match explicit origin list
    if (!origin || allowed === '*' || (Array.isArray(allowed) ? allowed.includes(origin) : origin === allowed)) {
      cb(null, true);
    } else {
      cb(null, true); // still allow — tighten in production if needed
    }
  },
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:    false,
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));       // 5mb for base64 image uploads
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ── Logging ───────────────────────────────────────────────────────────────────
app.use(morgan(PROD ? 'combined' : 'dev'));

// ── Static: frontend files ────────────────────────────────────────────────────
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir, {
    etag: false, maxAge: 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    },
  }));
}
app.use('/tickets', express.static(ticketsDir));

// ── API rate limiter (after static — only hits API routes) ────────────────────
app.use('/api', apiLimiter);

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/events',     publicRoutes);        // GET /api/events, GET /api/events/:id
app.use('/api/organiser',  organiserRoutes);     // POST /api/organiser/events, /api/organiser/requests
app.use('/api/admin',      adminRoutes);
app.use('/api/checkout',   checkoutRoutes);
app.use('/api/ticket',     ticketRoutes);
app.use('/api/payment',    paymentRoutes);

app.get('/api/health', async (_req, res) => {
  let dbStatus = 'unknown';
  try {
    const db   = require('./services/db');
    const conn = await db.getConnection();
    conn.release();
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = `error: ${e.message}`;
  }
  res.json({
    status:    'ok',
    version:   '6.0.0',
    env:       config.env,
    uptime:    Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    db:        dbStatus,
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: `No route: ${req.method} ${req.path}` });
  }
  const notFound = path.join(frontendDir, '404.html');
  if (fs.existsSync(notFound)) return res.status(404).sendFile(notFound);
  res.status(404).send('Not found.');
});

// ── Centralised error handler (must be last) ──────────────────────────────────
app.use(errorHandler);

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  // 1. Bind the port FIRST so Railway sees a live process immediately
  await new Promise(resolve => {
    app.listen(PORT, () => {
      console.log('');
      console.log('  ╔══════════════════════════════════════════╗');
      console.log('  ║   🎟  MyTicketSA v6.0  —  Ready          ║');
      console.log(`  ║   🌐  PORT ${PORT}                           ║`);
      console.log(`  ║   🗄️   MySQL: ${config.db.name.padEnd(26)}║`);
      console.log('  ╚══════════════════════════════════════════╝');
      console.log('');
      resolve();
    });
  });

  // 2. Warn about weak JWT secret
  if (config.jwt.secret === 'dev_secret_change_in_prod' || config.jwt.secret.includes('change_this')) {
    console.warn('[WARN] ⚠️  JWT_SECRET is a placeholder — set a strong secret in Railway Variables.');
  }

  // 3. Attempt DB connection — log errors but never crash the server
  try {
    const db = require('./services/db');
    const conn = await db.getConnection();
    console.log('[DB] ✅ Connected to MySQL —', config.db.name);
    conn.release();

    // 4. Seed admin account if the users table is empty
    const needsAdmin = await dataStore.seedAdminIfEmpty();
    if (needsAdmin) {
      const hash = await bcrypt.hash('admin123', 10);
      await dataStore.saveUser({
        id: 'USR-ADMIN-001',
        firstName: 'Admin', lastName: 'User',
        email: 'admin@myticketsa.co.za',
        passwordHash: hash, role: 'admin',
        organisationName: 'MyTicketSA',
        createdAt: new Date().toISOString(),
      });
      console.log('[SEED] Admin created → admin@myticketsa.co.za / admin123');
    }

    // 5. Seed demo events if empty
    await dataStore.seedEventsIfEmpty();

  } catch (err) {
    // Log a clear message but keep the server running
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('[DB] ❌ Access denied — check MYSQLUSER / MYSQLPASSWORD in Railway Variables.');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('[DB] ❌ Cannot connect to MySQL — verify MYSQLHOST / MYSQLPORT in Railway Variables.');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error(`[DB] ❌ Database "${config.db.name}" not found — check MYSQLDATABASE in Railway Variables.`);
    } else {
      console.error('[DB] ❌ DB init error:', err.message);
    }
    console.warn('[DB] ⚠️  Server is running WITHOUT a database. API calls that need DB will return 503.');
  }
}

start();
module.exports = app;
