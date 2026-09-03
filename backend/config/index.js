'use strict';
require('dotenv').config();

const config = {
  env:    process.env.NODE_ENV || 'development',
  port:   parseInt(process.env.PORT || '5500', 10),
  isProd: process.env.NODE_ENV === 'production',

  supabase: {
    url:            process.env.SUPABASE_URL            || '',
    anonKey:        process.env.SUPABASE_ANON_KEY       || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    jwtSecret:      process.env.SUPABASE_JWT_SECRET     || '',
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME  || '',
    apiKey:    process.env.CLOUDINARY_API_KEY      || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET   || '',
  },

  cors: {
    origin: process.env.FRONTEND_URL || '*',
  },

  email: {
    host:    process.env.EMAIL_HOST    || 'smtp.gmail.com',
    port:    parseInt(process.env.EMAIL_PORT || '587', 10),
    secure:  process.env.EMAIL_SECURE  === 'true',
    user:    process.env.EMAIL_USER    || '',
    pass:    process.env.EMAIL_PASS    || '',
    from:    process.env.EMAIL_FROM    || 'TicketsSA <noreply@TicketsSA.co.za>',
    preview: process.env.EMAIL_PREVIEW !== 'false',
  },

  ticketsDir: process.env.TICKETS_DIR || './tickets',
};

module.exports = config;
