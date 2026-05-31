'use strict';

const path   = require('path');
const fs     = require('fs');
const config = require('./config');

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');

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
const storage      = require('./services/storage');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const app         = express();
const PORT        = config.port;
const PROD        = config.isProd;
const frontendDir = path.resolve(__dirname, '../frontend');

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy:     false,
  crossOriginOpenerPolicy:   false,
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
  originAgentCluster:        false,
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || '*')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin)                          return cb(null, true);
    if (ALLOWED_ORIGINS.includes('*'))    return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    console.warn('[CORS] Blocked origin:', origin);
    cb(new Error('CORS policy: origin not allowed'));
  },
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:    false,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true, limit: '6mb' }));

// ── Logging ───────────────────────────────────────────────────────────────────
app.use(morgan(PROD ? 'combined' : 'dev'));

// ── Static: frontend files (local dev only — Netlify serves these separately) ─
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

// ── API rate limiter ──────────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ── Upload route (images → Cloudinary) ───────────────────────────────────────
app.post('/api/upload', async (req, res) => {
  try {
    const { data, filename, mimeType } = req.body;
    if (!data || !filename) return res.status(400).json({ success: false, error: 'data and filename required' });
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (mimeType && !allowed.includes(mimeType)) {
      return res.status(400).json({ success: false, error: 'Only JPG, PNG, WebP images allowed.' });
    }
    const base64Data = data.replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(base64Data, 'base64');
    if (buf.length > 5 * 1024 * 1024) return res.status(400).json({ success: false, error: 'Image must be under 5MB.' });
    const publicId = `myticketsa/uploads/evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const url      = await storage.uploadBuffer(buf, { folder: 'myticketsa/uploads', public_id: publicId, resource_type: 'image' });
    return res.json({ success: true, url });
  } catch (err) {
    console.error('[UPLOAD]', err.message);
    return res.status(500).json({ success: false, error: 'Upload failed.' });
  }
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/events',    publicRoutes);
app.use('/api/organiser', organiserRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/checkout',  checkoutRoutes);
app.use('/api/ticket',    ticketRoutes);
app.use('/api/payment',   paymentRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  let dbStatus = 'unknown';
  try {
    const { supabaseAdmin } = require('./services/supabase');
    const { error } = await supabaseAdmin.from('events').select('id').limit(1);
    dbStatus = error ? `error: ${error.message}` : 'connected';
  } catch (e) {
    dbStatus = `error: ${e.message}`;
  }
  res.json({
    status:    'ok',
    version:   '7.0.0',
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

// ── Centralised error handler ─────────────────────────────────────────────────
app.use(errorHandler);

// ── DB init (Supabase connection check + seed on first boot) ──────────────────
async function initDb() {
  if (!config.supabase.jwtSecret) {
    console.warn('[WARN] SUPABASE_JWT_SECRET not set — auth will reject all tokens.');
  }

  try {
    const { supabaseAdmin } = require('./services/supabase');
    const { error } = await supabaseAdmin.from('events').select('id').limit(1);
    if (error) throw error;
    console.log('[DB] Connected to Supabase');

    const needsAdmin = await dataStore.seedAdminIfEmpty();
    if (needsAdmin) {
      let adminId = null;

      const { data: adminData, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
        email:         'admin@myticketsa.co.za',
        password:      'admin123',
        email_confirm: true,
        app_metadata:  { role: 'admin' },
        user_metadata: { firstName: 'Admin', lastName: 'User', organisationName: 'MyTicketSA' },
      });

      if (!adminErr && adminData?.user) {
        adminId = adminData.user.id;
      } else {
        // User may already exist in Auth but profile row was never written — look them up
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const existing = (listData?.users || []).find(u => u.email === 'admin@myticketsa.co.za');
        if (existing) adminId = existing.id;
      }

      if (adminId) {
        // Upsert the full profile row first
        await supabaseAdmin.from('profiles').upsert({
          id:                adminId,
          email:             'admin@myticketsa.co.za',
          first_name:        'Admin',
          last_name:         'User',
          role:              'admin',
          organisation_name: 'MyTicketSA',
        }, { onConflict: 'id' });
        // Then explicitly force the role — the trigger may have written 'attendee'
        // before Supabase merged app_metadata, so we overwrite it here
        await supabaseAdmin.from('profiles').update({ role: 'admin' }).eq('id', adminId);
        console.log('[SEED] Admin ready → admin@myticketsa.co.za / admin123');
      }
    }

    await dataStore.seedEventsIfEmpty();
  } catch (err) {
    console.error('[DB] Init error:', err.message);
    console.warn('[DB] Server running WITHOUT database.');
  }
}

// ── HTTP server start (local dev only) ───────────────────────────────────────
async function start() {
  await new Promise(resolve => {
    app.listen(PORT, () => {
      console.log('');
      console.log('  ╔══════════════════════════════════════════╗');
      console.log('  ║   MyTicketSA v7.0  —  Supabase  Ready    ║');
      console.log(`  ║   PORT ${PORT}                               ║`);
      console.log('  ╚══════════════════════════════════════════╝');
      console.log('');
      resolve();
    });
  });
  await initDb();
}

// Only bind a port when run directly (e.g. `node server.js` or `nodemon`).
// When imported by the Netlify function, just export app + initDb.
if (require.main === module) {
  start();
}

module.exports = { app, initDb };
