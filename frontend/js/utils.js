/* ================================================
   TicketsSA - Utility Module (utils.js)
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
      console.warn('TicketsSA: localStorage write failed', e);
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
      console.warn('TicketsSA: localStorage read failed', e);
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
      console.warn('TicketsSA: localStorage remove failed', e);
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
    if (!timeStr) return 'TBC';
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return 'TBC';
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

    const iconMenu  = toggle.querySelector('.icon-menu');
    const iconClose = toggle.querySelector('.icon-close');

    function setOpen(open) {
      navbar.classList.toggle('navbar--open', open);
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (iconMenu)  iconMenu.style.display  = open ? 'none'  : 'block';
      if (iconClose) iconClose.style.display = open ? 'block' : 'none';
    }

    toggle.addEventListener('click', () => setOpen(!navbar.classList.contains('navbar--open')));

    // Close nav when a category link or button is clicked
    document.querySelectorAll('.navbar__cats a, .navbar__cat').forEach(link => {
      link.addEventListener('click', () => setOpen(false));
    });
    // Close nav when clicking outside
    document.addEventListener('click', (e) => {
      if (navbar.classList.contains('navbar--open') && !navbar.contains(e.target)) {
        setOpen(false);
      }
    });
  }

  /* ---------- Image URL optimisation (Cloudinary) ---------- */

  /**
   * Add Cloudinary delivery transformations to a URL.
   * Non-Cloudinary URLs are returned unchanged.
   * @param {string} src   - Original image URL
   * @param {number} width - Target width in pixels (default 800)
   * @returns {string}
   */
  function imgUrl(src, width = 800) {
    if (!src || typeof src !== 'string') return src || '';
    if (!src.includes('res.cloudinary.com')) return src;
    const t = `q_auto,f_auto,w_${width},c_limit`;
    return src.replace('/upload/', `/upload/${t}/`);
  }

  /* ---------- Client-side image compression ---------- */

  /**
   * Compress an image File using Canvas before upload.
   * Returns a new File (png) that is smaller or the original if compression
   * did not reduce the size.
   * @param {File}   file
   * @param {Object} [opts]
   * @param {number} [opts.maxWidth=1920]
   * @param {number} [opts.maxHeight=1920]
   * @param {number} [opts.quality=0.82]  - png quality 0–1
   * @returns {Promise<File>}
   */
  async function compressImage(file, { maxWidth = 1920, maxHeight = 1920, quality = 0.82 } = {}) {
    if (!file || !file.type.startsWith('image/')) return file;
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve(file);
      reader.onload = (ev) => {
        const img = new Image();
        img.onerror = () => resolve(file);
        img.onload = () => {
          let w = img.naturalWidth;
          let h = img.naturalHeight;

          // Scale down proportionally
          if (w > maxWidth)  { h = Math.round(h * maxWidth  / w); w = maxWidth;  }
          if (h > maxHeight) { w = Math.round(w * maxHeight / h); h = maxHeight; }

          const canvas = document.createElement('canvas');
          canvas.width  = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);

          const outType = file.type === 'image/png' ? 'image/png' : 'image/png';
          const outQuality = outType === 'image/png' ? quality : undefined;

          canvas.toBlob((blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file); // compression didn't help keep original
            } else {
              const ext  = outType === 'image/png' ? '.png' : '.jpg';
              const name = file.name.replace(/\.[^.]+$/, ext);
              resolve(new File([blob], name, { type: outType }));
            }
          }, outType, outQuality);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- Upload to Firebase Storage ---------- */

  const UPLOAD_ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const UPLOAD_MAX_MB  = 5;

  /**
   * Compress then upload a File to Firebase Storage, returning its download
   * URL. Used by both the listing wizards (wizard-core.js) and the admin
   * panel's photo-upload widgets (admin.js) — previously wizard-core.js
   * avoided this function entirely (it POSTed to a since-retired backend
   * endpoint and stored base64 data URLs directly on the record instead);
   * now that this actually uploads somewhere real, both paths share it.
   * @param {File}   file
   * @param {string} [folder='uploads']
   * @returns {Promise<string>}  Firebase Storage download URL
   */
  async function uploadImage(file, folder = 'uploads') {
    if (!UPLOAD_ALLOWED.includes(file.type)) {
      throw new Error('Only JPG, PNG, WebP images are allowed.');
    }
    if (file.size > UPLOAD_MAX_MB * 1024 * 1024) {
      throw new Error(`Image must be under ${UPLOAD_MAX_MB} MB. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
    }
    if (typeof Auth === 'undefined' || !Auth.getFirebaseApp) {
      throw new Error('Not ready to upload yet. Please try again.');
    }
    const user = Auth.getUser();
    if (!user) throw new Error('Please sign in first.');

    const compressed = await compressImage(file);

    const fb   = await Auth.getFirebaseApp();
    const path = `uploads/${folder}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${compressed.name}`;
    const ref  = fb.storage().ref(path);
    await ref.put(compressed, { contentType: compressed.type });
    return await ref.getDownloadURL();
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
    imgUrl,
    compressImage,
    uploadImage,
  };

})();
