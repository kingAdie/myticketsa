/**
 * services/serviceRequestService.js
 * CRUD for equipment / service rental requests.
 */
'use strict';

const db = require('./db');

async function createRequest(data) {
  const {
    userId, serviceId, serviceName,
    eventDate, duration, location, quantity,
    details, contactPhone, budgetRange,
  } = data;

  const [result] = await db.query(`
    INSERT INTO equipment_requests
      (user_id, service_id, service_name, event_date, duration,
       location, quantity, details, contact_phone, budget_range, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `, [
    userId, serviceId, serviceName,
    eventDate, duration || null,
    location, parseInt(quantity) || 1,
    details || null, contactPhone, budgetRange || null,
  ]);

  return getRequestById(result.insertId);
}

async function getRequestById(id) {
  const [rows] = await db.query(
    'SELECT * FROM equipment_requests WHERE id = ?', [id]
  );
  return rows[0] || null;
}

async function getRequestsByUser(userId) {
  const [rows] = await db.query(
    'SELECT * FROM equipment_requests WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return rows;
}

async function getAllRequests({ status } = {}) {
  const where  = status ? 'WHERE status = ?' : '';
  const params = status ? [status] : [];
  const [rows] = await db.query(
    `SELECT r.*, u.first_name, u.last_name, u.email
     FROM equipment_requests r
     JOIN users u ON r.user_id = u.id
     ${where}
     ORDER BY r.created_at DESC`,
    params
  );
  return rows;
}

async function updateRequestStatus(id, status) {
  const allowed = ['pending', 'quoted', 'confirmed', 'cancelled'];
  if (!allowed.includes(status)) throw new Error(`Invalid status: ${status}`);
  await db.query(
    'UPDATE equipment_requests SET status = ? WHERE id = ?', [status, id]
  );
  return getRequestById(id);
}

module.exports = {
  createRequest,
  getRequestById,
  getRequestsByUser,
  getAllRequests,
  updateRequestStatus,
};
