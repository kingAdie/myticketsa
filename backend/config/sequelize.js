'use strict';
require('dotenv').config();

const base = {
  dialect: 'mysql',
  dialectOptions: {
    ssl: process.env.MYSQLHOST
      ? { rejectUnauthorized: false }
      : undefined,
    charset: 'utf8mb4',
  },
  define: { underscored: true, timestamps: false },
  logging: false,
};

module.exports = {
  development: {
    ...base,
    username: process.env.MYSQLUSER     || process.env.DB_USER     || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQLDATABASE || process.env.DB_NAME     || 'myticketsa',
    host:     process.env.MYSQLHOST     || process.env.DB_HOST     || 'localhost',
    port: parseInt(process.env.MYSQLPORT || process.env.DB_PORT    || '3306', 10),
  },
  production: {
    ...base,
    username: process.env.MYSQLUSER     || process.env.DB_USER,
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD,
    database: process.env.MYSQLDATABASE || process.env.DB_NAME,
    host:     process.env.MYSQLHOST     || process.env.DB_HOST,
    port: parseInt(process.env.MYSQLPORT || process.env.DB_PORT    || '3306', 10),
  },
};
