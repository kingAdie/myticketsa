'use strict';
require('dotenv').config();

const config = {
  env:  process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5500', 10),
  isProd: process.env.NODE_ENV === 'production',

  db: {
    // Prefer individual vars; DB_* kept for local .env
    // Actual pool creation in services/db.js also parses DATABASE_URL
    host:     process.env.MYSQLHOST     || process.env.MYSQL_HOST     || process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.MYSQLPORT    || process.env.MYSQL_PORT    || process.env.DB_PORT     || '3306', 10),
    user:     process.env.MYSQLUSER     || process.env.MYSQL_USER     || process.env.DB_USER     || 'root',
    password: process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    name:     process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || process.env.DB_NAME     || 'myticketsa',
  },

  jwt: {
    // Use a strong secret — never the placeholder in production
    secret:    process.env.JWT_SECRET || 'dev_secret_change_in_prod',
    expiresIn: '7d',
  },

  cors: {
    origin: process.env.FRONTEND_URL || '*',
  },

  email: {
    host:     process.env.EMAIL_HOST    || 'smtp.gmail.com',
    port:     parseInt(process.env.EMAIL_PORT || '587', 10),
    secure:   process.env.EMAIL_SECURE  === 'true',
    user:     process.env.EMAIL_USER    || '',
    pass:     process.env.EMAIL_PASS    || '',
    from:     process.env.EMAIL_FROM    || 'MyTicketSA <noreply@myticketsa.co.za>',
    preview:  process.env.EMAIL_PREVIEW !== 'false',
  },

  payfast: {
    merchantId:  process.env.PAYFAST_MERCHANT_ID  || '10000100',
    merchantKey: process.env.PAYFAST_MERCHANT_KEY || '46f0cd694581a',
    passphrase:  process.env.PAYFAST_PASSPHRASE   || '',
    sandbox:     process.env.PAYFAST_SANDBOX       !== 'false',
    returnUrl:   process.env.PAYFAST_RETURN_URL   || `http://localhost:${process.env.PORT || 5500}/success.html`,
    cancelUrl:   process.env.PAYFAST_CANCEL_URL   || `http://localhost:${process.env.PORT || 5500}/checkout.html`,
    notifyUrl:   process.env.PAYFAST_NOTIFY_URL   || `http://localhost:${process.env.PORT || 5500}/api/payment/notify`,
  },

  ticketsDir: process.env.TICKETS_DIR || './tickets',
};

module.exports = config;
