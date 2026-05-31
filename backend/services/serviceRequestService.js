'use strict';

const { supabaseAdmin } = require('./supabase');

async function createRequest(data) {
  const {
    userId, serviceId, serviceName,
    eventDate, duration, location, quantity,
    details, contactPhone, budgetRange,
  } = data;

  const { data: result, error } = await supabaseAdmin
    .from('equipment_requests')
    .insert({
      user_id:       userId,
      service_id:    serviceId,
      service_name:  serviceName,
      event_date:    eventDate,
      duration:      duration      || null,
      location,
      quantity:      parseInt(quantity) || 1,
      details:       details       || null,
      contact_phone: contactPhone,
      budget_range:  budgetRange   || null,
      status:        'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function getRequestById(id) {
  const { data, error } = await supabaseAdmin
    .from('equipment_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getRequestsByUser(userId) {
  const { data, error } = await supabaseAdmin
    .from('equipment_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getAllRequests({ status } = {}) {
  let query = supabaseAdmin
    .from('equipment_requests')
    .select('*, profiles(first_name, last_name, email)')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(row => {
    const { profiles: p, ...rest } = row;
    return { ...rest, first_name: p?.first_name, last_name: p?.last_name, email: p?.email };
  });
}

async function updateRequestStatus(id, status) {
  const allowed = ['pending', 'quoted', 'confirmed', 'cancelled'];
  if (!allowed.includes(status)) throw new Error(`Invalid status: ${status}`);
  const { error } = await supabaseAdmin
    .from('equipment_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  return getRequestById(id);
}

module.exports = { createRequest, getRequestById, getRequestsByUser, getAllRequests, updateRequestStatus };
