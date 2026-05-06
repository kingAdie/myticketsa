/* ================================================
   MyTicketSA - Utility Module (utils.js)
   Shared helpers used across all pages
   ================================================ */

const Utils = (() => {

  /* ---------- LocalStorage Helpers ---------- */

  /**
   * Save data to localStorage under a given key
   * @param {string} key
   * @param {*} value - will be JSON.stringified
   */
  function setStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('MyTicketSA: localStorage write failed', e);
    }
  }

  /**
   * Read and parse JSON data from localStorage
   * @param {string} key
   * @returns {*|null}
   */
  function getStorage(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('MyTicketSA: localStorage read failed', e);
      return null;
    }
  }

  /**
   * Remove an item from localStorage
   * @param {string} key
   */
  function removeStorage(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('MyTicketSA: localStorage remove failed', e);
    }
  }

  /* ---------- Ticket ID Generator ---------- */

  /**
   * Generate a unique ticket ID in format: MTS-XXXXXX-YYYY
   * @returns {string}
   */
  function generateTicketId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let part1 = '';
    let part2 = '';
    for (let i = 0; i < 6; i++) part1 += chars[Math.floor(Math.random() * chars.length)];
    for (let i = 0; i < 4; i++) part2 += chars[Math.floor(Math.random() * chars.length)];
    return `MTS-${part1}-${part2}`;
  }

  /* ---------- Formatting Helpers ---------- */

  /**
   * Format a number as South African Rand currency
   * @param {number} amount
   * @returns {string} e.g. "R 250.00"
   */
  function formatCurrency(amount) {
    if (amount === 0) return 'Free';
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 0,
    }).format(amount);
  }

  /**
   * Format a date string into a human-readable South African date
   * @param {string} dateStr - ISO date string or parseable date
   * @returns {string} e.g. "Saturday, 12 July 2025"
   */
  function formatDate(dateStr) {
    // Append T00:00:00 to force local-time parsing instead of UTC midnight
    // Without this, '2025-03-28' parses as UTC → shows March 27 in UTC+2 (SA)
    const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-ZA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Format time from 24h to 12h AM/PM
   * @param {string} timeStr - "18:30"
   * @returns {string} - "6:30 PM"
   */
  function formatTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${String(minutes).padStart(2, '0')} ${ampm}`;
  }

  /* ---------- Form Validation ---------- */

  /**
   * Validate a single form field
   * @param {HTMLElement} input
   * @returns {boolean} isValid
   */
  function validateField(input) {
    const formGroup = input.closest('.form-group');
    const errorEl = formGroup ? formGroup.querySelector('.form-error') : null;
    let isValid = true;
    let message = '';

    // Required check
    if (input.hasAttribute('required') && !input.value.trim()) {
      isValid = false;
      message = 'This field is required.';
    }

    // Email format check
    if (input.type === 'email' && input.value.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(input.value.trim())) {
        isValid = false;
        message = 'Please enter a valid email address.';
      }
    }

    // Name minimum length
    if (input.dataset.minLength && input.value.trim().length < parseInt(input.dataset.minLength)) {
      isValid = false;
      message = `Please enter at least ${input.dataset.minLength} characters.`;
    }

    // Toggle error state
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.toggle('visible', !isValid);
    }
    input.classList.toggle('error', !isValid);

    return isValid;
  }

  /**
   * Validate all inputs in a form
   * @param {HTMLFormElement} form
   * @returns {boolean} allValid
   */
  function validateForm(form) {
    const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
    let allValid = true;
    inputs.forEach(input => {
      if (!validateField(input)) allValid = false;
    });
    return allValid;
  }

  /* ---------- Toast Notification ---------- */

  let toastTimer = null;

  /**
   * Show a toast notification
   * @param {string} message
   * @param {'success'|'error'|'info'} type
   * @param {number} duration - ms to show (default 5500)
   */
  function showToast(message, type = 'info', duration = 5500) {
    // Create or reuse toast element
    let toast = document.getElementById('mt-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mt-toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }

    // Reset classes and set new type
    toast.className = `toast ${type}`;
    toast.textContent = message;

    // Show
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { toast.classList.add('show'); });
    });

    // Auto-hide
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  /* ---------- Navigation Helpers ---------- */

  /**
   * Navigate to a page with optional params
   * @param {string} page - path e.g. 'event.html'
   * @param {Object} [params] - query params key/value
   */
  function navigateTo(page, params = {}) {
    const url = new URL(page, window.location.origin + window.location.pathname.replace(/[^/]*$/, ''));
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    window.location.href = url.toString();
  }

  /**
   * Get a URL query parameter by name
   * @param {string} name
   * @returns {string|null}
   */
  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  /* ---------- DOM Helpers ---------- */

  /**
   * Safely set innerText of an element by selector
   * @param {string} selector
   * @param {string} text
   */
  function setText(selector, text) {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  }

  /**
   * Safely set innerHTML of an element by selector
   * @param {string} selector
   * @param {string} html
   */
  function setHTML(selector, html) {
    const el = document.querySelector(selector);
    if (el) el.innerHTML = html;
  }

  /* ---------- Mobile Nav ---------- */

  /**
   * Initialise the mobile navbar toggle
   */
  function initMobileNav() {
    const toggle = document.querySelector('.navbar__toggle');
    const navbar = document.querySelector('.navbar');
    if (!toggle || !navbar) return;
    toggle.addEventListener('click', () => {
      navbar.classList.toggle('navbar--open');
    });
    // Close nav when a link is clicked
    document.querySelectorAll('.navbar__links a').forEach(link => {
      link.addEventListener('click', () => navbar.classList.remove('navbar--open'));
    });
  }

  /* ---------- Public API ---------- */
  return {
    setStorage,
    getStorage,
    removeStorage,
    generateTicketId,
    formatCurrency,
    formatDate,
    formatTime,
    validateField,
    validateForm,
    showToast,
    navigateTo,
    getParam,
    setText,
    setHTML,
    initMobileNav,
  };

})();
