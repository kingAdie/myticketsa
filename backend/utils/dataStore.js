/**
 * utils/dataStore.js  (MySQL version)
 *
 * Same public API as the original JSON file store no controller changes needed.
 * All functions are now async (they were sync before, but controllers already
 * use async/await so this is compatible).
 */
'use strict';

const db = require('./db');

// ════════════════════════════════════════════
//  USERS
// ════════════════════════════════════════════

async function getUsers() {
  const [rows] = await db.query('SELECT * FROM users ORDER BY created_at DESC');
  return rows.map(toUser);
}

async function getUserById(id) {
  const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows.length ? toUser(rows[0]) : null;
}

async function getUserByEmail(email) {
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
  return rows.length ? toUser(rows[0]) : null;
}

async function saveUser(user) {
  await db.query(`
    INSERT INTO users
      (id, first_name, last_name, email, password_hash, role, organisation_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      first_name        = VALUES(first_name),
      last_name         = VALUES(last_name),
      email             = VALUES(email),
      password_hash     = VALUES(password_hash),
      role              = VALUES(role),
      organisation_name = VALUES(organisation_name)
  `, [
    user.id,
    user.firstName,
    user.lastName,
    user.email.toLowerCase(),
    user.passwordHash,
    user.role || 'attendee',
    user.organisationName || null,
    user.createdAt ? new Date(user.createdAt) : new Date(),
  ]);
  return user;
}

function toUser(row) {
  return {
    id:               row.id,
    firstName:        row.first_name,
    lastName:         row.last_name,
    email:            row.email,
    passwordHash:     row.password_hash,
    role:             row.role,
    organisationName: row.organisation_name || null,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };
}

// ════════════════════════════════════════════
//  EVENTS
// ════════════════════════════════════════════

async function getEvents() {
  const [events]  = await db.query('SELECT * FROM events ORDER BY featured DESC, event_date ASC');
  const [tts]     = await db.query('SELECT * FROM ticket_types ORDER BY event_id, sort_order');
  const [tags]    = await db.query('SELECT * FROM event_tags');
  return events.map(row => toEvent(row, tts, tags));
}

async function getEventById(id) {
  const [events] = await db.query('SELECT * FROM events WHERE id = ?', [id]);
  if (!events.length) return null;
  const [tts]  = await db.query('SELECT * FROM ticket_types WHERE event_id = ? ORDER BY sort_order', [id]);
  const [tags] = await db.query('SELECT tag FROM event_tags WHERE event_id = ?', [id]);
  return toEvent(events[0], tts, tags);
}

async function saveEvent(event) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(`
      INSERT INTO events
        (id, status, title, category, event_date, event_time, end_time,
         location, city, province, description, image, price,
         featured, sold_out, organiser_name, organiser_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        status         = VALUES(status),
        title          = VALUES(title),
        category       = VALUES(category),
        event_date     = VALUES(event_date),
        event_time     = VALUES(event_time),
        end_time       = VALUES(end_time),
        location       = VALUES(location),
        city           = VALUES(city),
        province       = VALUES(province),
        description    = VALUES(description),
        image          = VALUES(image),
        price          = VALUES(price),
        featured       = VALUES(featured),
        sold_out       = VALUES(sold_out),
        organiser_name = VALUES(organiser_name),
        organiser_id   = VALUES(organiser_id)
    `, [
      event.id,
      event.status    || 'pending',
      event.title,
      event.category,
      event.date,
      event.time,
      event.endTime   || event.time,
      event.location,
      event.city,
      event.province  || null,
      event.description,
      event.image     || null,
      parseFloat(event.price) || 0,
      event.featured  ? 1 : 0,
      event.sold_out  ? 1 : 0,
      event.organiser || null,
      event.organiserId,
      event.createdAt ? new Date(event.createdAt) : new Date(),
    ]);

    if (Array.isArray(event.ticketTypes) && event.ticketTypes.length > 0) {
      await conn.query('DELETE FROM ticket_types WHERE event_id = ?', [event.id]);
      for (let i = 0; i < event.ticketTypes.length; i++) {
        const tt = event.ticketTypes[i];
        await conn.query(
          'INSERT INTO ticket_types (id, event_id, name, description, price, available, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [tt.id || `TT-${event.id}-${i+1}`, event.id, tt.name, tt.description || tt.name,
           parseFloat(tt.price) || 0, parseInt(tt.available) || 100, i + 1]
        );
      }
    }

    if (Array.isArray(event.tags)) {
      await conn.query('DELETE FROM event_tags WHERE event_id = ?', [event.id]);
      for (const tag of event.tags) {
        if (tag && tag.trim()) {
          await conn.query(
            'INSERT IGNORE INTO event_tags (event_id, tag) VALUES (?, ?)',
            [event.id, tag.trim()]
          );
        }
      }
    }

    await conn.commit();
    return event;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function deleteEvent(id) {
  await db.query('DELETE FROM events WHERE id = ?', [id]);
}

function toEvent(row, allTTs, allTags) {
  const id   = row.id;
  const myTT = (allTTs  || []).filter(t => t.event_id === id);
  const tags = (allTags || []).filter(t => t.event_id === id).map(t => t.tag);
  return {
    id, status: row.status, title: row.title, category: row.category,
    date: row.event_date, time: row.event_time, endTime: row.end_time,
    location: row.location, city: row.city, province: row.province,
    description: row.description, image: row.image,
    price: parseFloat(row.price), featured: !!row.featured, sold_out: !!row.sold_out,
    organiser: row.organiser_name, organiserId: row.organiser_id,
    createdAt: row.created_at, updatedAt: row.updated_at,
    ticketTypes: myTT.map(tt => ({
      id: tt.id, name: tt.name, description: tt.description,
      price: parseFloat(tt.price), available: tt.available, sold: tt.sold || 0,
    })),
    tags,
  };
}

// ════════════════════════════════════════════
//  SEED HELPERS
// ════════════════════════════════════════════

async function seedEventsIfEmpty() {
  const [rows] = await db.query('SELECT COUNT(*) AS cnt FROM events');
  if (rows[0].cnt > 0) return;
  console.log('[SEED] Events table empty run database/schema.sql in MySQL Workbench to seed events.');
}

async function seedAdminIfEmpty() {
  const [rows] = await db.query('SELECT COUNT(*) AS cnt FROM users');
  return rows[0].cnt === 0; // returns true if seeding is needed
}

module.exports = {
  getUsers, getUserById, getUserByEmail, saveUser,
  getEvents, getEventById, saveEvent, deleteEvent,
  seedEventsIfEmpty, seedAdminIfEmpty,
};
