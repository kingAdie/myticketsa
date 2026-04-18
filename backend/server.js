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
  origin:         config.cors.origin,
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

app.get('/api/health', (_req, res) => res.json({
  status:    'ok',
  version:   '6.0.0',
  env:       config.env,
  uptime:    Math.round(process.uptime()),
  timestamp: new Date().toISOString(),
}));

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
  try {
    // 1. Verify MySQL connection
    const db = require('./services/db');
    const conn = await db.getConnection();
    console.log('[DB] ✅ Connected to MySQL —', config.db.name);
    conn.release();

    // 2. Warn if JWT secret is the dev placeholder
    if (config.jwt.secret.includes('change_this') || config.jwt.secret === 'dev_secret_change_in_prod') {
      console.warn('[WARN] ⚠️  JWT_SECRET is a placeholder. Change it in .env before going live.');
    }

    // 3. Seed admin if users table is empty
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

    // 4. Seed events if empty
    await dataStore.seedEventsIfEmpty();

    // 5. Start listening
    app.listen(PORT, () => {
      console.log('');
      console.log('  ╔══════════════════════════════════════════╗');
      console.log('  ║   🎟  MyTicketSA v6.0  —  Ready          ║');
      console.log(`  ║   🌐  http://localhost:${PORT}               ║`);
      console.log(`  ║   🔐  http://localhost:${PORT}/admin/         ║`);
      console.log(`  ║   🗄️   MySQL: ${config.db.name.padEnd(26)}║`);
      console.log('  ╚══════════════════════════════════════════╝');
      console.log('');
    });

  } catch (err) {
    // Friendly MySQL error messages
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n  ❌ MySQL: Access denied — check DB_USER and DB_PASSWORD in .env\n');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('\n  ❌ MySQL: Cannot connect — is MySQL running?\n');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error(`\n  ❌ MySQL: Database "${config.db.name}" not found — run database/schema.sql first\n`);
    } else {
      console.error('\n  ❌ Fatal startup error:', err.message, '\n');
    }
    process.exit(1);
  }
}

start();
module.exports = app;
