/**
 * database/test-connection.js
 *
 * Run this FIRST to check your MySQL credentials are correct:
 *
 *   cd backend
 *   node ../database/test-connection.js
 *
 * It will tell you exactly what is wrong and how to fix it.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });

const mysql = require('mysql2/promise');

const cfg = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3306', 10),
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'TicketsSA',
};

console.log('\n🔍 Testing MySQL connection with these settings:');
console.log(`   Host:     ${cfg.host}:${cfg.port}`);
console.log(`   User:     ${cfg.user}`);
console.log(`   Password: ${cfg.password ? '(set ' + cfg.password.length + ' chars)' : '(empty!)'}`);
console.log(`   Database: ${cfg.database}`);
console.log('');

(async () => {
  let conn;
  try {
    // Step 1: test connection WITHOUT database (in case DB doesn't exist yet)
    conn = await mysql.createConnection({
      host: cfg.host, port: cfg.port,
      user: cfg.user, password: cfg.password,
    });
    console.log('✅ Step 1/3 Login to MySQL OK');

    // Step 2: check database exists
    const [dbs] = await conn.query('SHOW DATABASES LIKE ?', [cfg.database]);
    if (dbs.length === 0) {
      console.log(`❌ Step 2/3 Database "${cfg.database}" does NOT exist`);
      console.log(`\n   👉 Fix: Open MySQL Workbench → File → Open SQL Script`);
      console.log(`           → select database/schema.sql → click ⚡ Execute All\n`);
      process.exit(1);
    }
    console.log(`✅ Step 2/3 Database "${cfg.database}" exists`);

    // Step 3: check tables exist
    await conn.query(`USE ${cfg.database}`);
    const [tables] = await conn.query('SHOW TABLES');
    console.log(`✅ Step 3/3 ${tables.length} table(s) found: ${tables.map(t => Object.values(t)[0]).join(', ')}`);

    if (tables.length < 6) {
      console.log(`\n   ⚠️  Expected 6 tables but found ${tables.length}.`);
      console.log(`   👉 Re-run database/schema.sql in MySQL Workbench.\n`);
    } else {
      console.log('\n🎉 Everything looks good! You can now run: npm run dev\n');
    }

  } catch (err) {
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log(`❌ Access denied wrong username or password`);
      console.log(`\n   Your current settings:`);
      console.log(`     DB_USER=${cfg.user}`);
      console.log(`     DB_PASSWORD=${cfg.password || '(empty)'}`);
      console.log(`\n   👉 Fix in backend/.env:`);
      console.log(`      1. Open MySQL Workbench`);
      console.log(`      2. Look at your connection note the Username`);
      console.log(`      3. Use the password you set when you installed MySQL`);
      console.log(`      4. Update DB_USER and DB_PASSWORD in backend/.env\n`);
    } else if (err.code === 'ECONNREFUSED') {
      console.log(`❌ Cannot connect to MySQL server at ${cfg.host}:${cfg.port}`);
      console.log(`\n   👉 Make sure MySQL is running:`);
      console.log(`      Windows: Open Services → find "MySQL80" → Start it\n`);
    } else {
      console.log(`❌ Connection error: ${err.message}`);
    }
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
})();
