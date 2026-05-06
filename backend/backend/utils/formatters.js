/**
 * utils/formatters.js
 *
 * Shared formatting helpers used by email templates, ticket data, etc.
 */

'use strict';

/**
 * Format a date string to "Saturday, 28 March 2025" (South African locale)
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr + 'T00:00:00'); // avoid timezone shift
  return date.toLocaleDateString('en-ZA', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  });
}

/**
 * Format a 24h time string "18:30" → "6:30 PM"
 */
function formatTime(timeStr) {
  if (!timeStr) return '—';
  const [hours, minutes] = timeStr.split(':').map(Number);
  const ampm        = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${ampm}`;
}

/**
 * Format a number as South African Rand (e.g. R 850.00)
 */
function formatCurrency(amount) {
  if (amount === 0) return 'Free';
  return new Intl.NumberFormat('en-ZA', {
    style:    'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
  }).format(amount);
}

module.exports = { formatDate, formatTime, formatCurrency };
