
/* ================================================
   TicketsSA Auth Module v8
   - Login / Signup / Forgot Password via Firebase Auth
   - Google OAuth (+ extensible to other providers)
   - Cloudflare Turnstile CAPTCHA (verified server-side —
     Firebase Auth has no built-in captchaToken passthrough)
   - Password show/hide toggle

   Migrated from Supabase Auth. The public API this module
   returns is unchanged on purpose, so every other page/script
   that calls Auth.* keeps working without modification.
   ================================================ */

const Auth = (() => {

  const TOKEN_KEY = 'mt_token';
  const USER_KEY  = 'mt_user';

  // ── Firebase ──────────────────────────────────────────────────────────────
  // Firebase Console → Project settings → General → Your apps → Web app.
  // These values are public/safe to embed client-side (same trust model as
  // the old Supabase anon key) — fill them in from your `tickets-sa` project.
  const firebaseConfig = {
    apiKey:            'YOUR_FIREBASE_API_KEY',
    authDomain:        'tickets-sa.firebaseapp.com',
    projectId:         'tickets-sa',
    storageBucket:     'tickets-sa.appspot.com',
    messagingSenderId: 'YOUR_FIREBASE_SENDER_ID',
    appId:             'YOUR_FIREBASE_APP_ID',
  };
  const FIREBASE_SDK_VERSION = '10.13.2';

  // ── Cloudflare Turnstile CAPTCHA ─────────────────────────────────────────
  // TO ENABLE:
  //  1. Go to dash.cloudflare.com → Turnstile → Add Site
  //  2. Add your domains (ticketssa.co.za, your-site.netlify.app, localhost)
  //  3. Paste your SITE KEY below:
  const TURNSTILE_SITE_KEY = '0x4AAAAAADrXDvUXgmgxhbAx';
  //  4. Set the matching SECRET KEY as TURNSTILE_SECRET_KEY in Netlify env
  //     vars — netlify/functions/verify-turnstile.js checks tokens against it
  //     server-side (Firebase Auth, unlike Supabase, has no built-in captcha
  //     passthrough, so this project verifies the token itself before ever
  //     calling Firebase).
  //  Leave as 'YOUR_TURNSTILE_SITE_KEY' to skip CAPTCHA (forms still work).
  const RC_ENABLED = TURNSTILE_SITE_KEY && !TURNSTILE_SITE_KEY.startsWith('YOUR_');

  let _rcWidgetLogin  = null;
  let _rcWidgetSignup = null;

  function _initRecaptcha() {
    if (!RC_ENABLED) return;
    if (document.querySelector('script[src*="turnstile"]')) return;
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  }

  function _renderRecaptchaWidgets() {
    if (!RC_ENABLED || !window.turnstile) return;
    const loginDiv  = document.getElementById('rcLogin');
    const signupDiv = document.getElementById('rcSignup');
    if (loginDiv && _rcWidgetLogin === null) {
      try { _rcWidgetLogin  = window.turnstile.render('#rcLogin',  { sitekey: TURNSTILE_SITE_KEY, theme: 'dark' }); }
      catch (_) {}
    }
    if (signupDiv && _rcWidgetSignup === null) {
      try { _rcWidgetSignup = window.turnstile.render('#rcSignup', { sitekey: TURNSTILE_SITE_KEY, theme: 'dark' }); }
      catch (_) {}
    }
  }

  function _getRcToken(widgetId) {
    if (!RC_ENABLED || !window.turnstile || widgetId === null || widgetId === undefined) return null;
    return window.turnstile.getResponse(widgetId) || null;
  }

  function _resetRc(widgetId) {
    if (RC_ENABLED && window.turnstile && widgetId !== null && widgetId !== undefined) {
      try { window.turnstile.reset(widgetId); } catch (_) {}
    }
  }

  async function _verifyTurnstile(token) {
    try {
      const res = await fetch('/.netlify/functions/verify-turnstile', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.success;
    } catch (_) { return false; }
  }

  // ── Firebase lazy-loader ──────────────────────────────────────────────────
  function _loadScript(src) {
    return new Promise((resolve, reject) => {
      const s   = document.createElement('script');
      s.src     = src;
      s.onload  = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  let _fbReady = null;
  let _listenerAttached = false;

  async function getFirebase() {
    if (_fbReady) return _fbReady;
    _fbReady = (async () => {
      if (!window.firebase) {
        await _loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js`);
        await Promise.all([
          _loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth-compat.js`),
          _loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore-compat.js`),
        ]);
      }
      if (!window.firebase.apps.length) window.firebase.initializeApp(firebaseConfig);

      // Keep mt_token/mt_user fresh silently in the background (Firebase ID
      // tokens expire hourly, same as Supabase's did, but here we refresh
      // instead of forcing re-login). Only touches storage if a session this
      // module recognises is already active — never during the deliberate
      // sign-out-after-signup window, and never on a page nobody logged into.
      if (!_listenerAttached) {
        _listenerAttached = true;
        window.firebase.auth().onIdTokenChanged(async (firebaseUser) => {
          if (!firebaseUser) return;
          try {
            const idTokenResult = await firebaseUser.getIdTokenResult();
            const existing = getUser();
            if (existing && existing.id === firebaseUser.uid) {
              saveSession(idTokenResult.token, { ...existing, role: idTokenResult.claims.role || 'attendee' });
            }
          } catch (_) {}
        });
      }

      return window.firebase;
    })();
    return _fbReady;
  }

  /** Ensures a users/{uid} Firestore doc exists, always self-assigning
   *  role:'attendee' — Security Rules only allow a user to create their own
   *  doc with that exact role, so this can never be used to self-promote. */
  async function _ensureUserDoc(firebaseUser, extra = {}) {
    const fb  = await getFirebase();
    const ref = fb.firestore().collection('users').doc(firebaseUser.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      const fullName = firebaseUser.displayName || '';
      await ref.set({
        email:            firebaseUser.email || '',
        firstName:        extra.firstName || fullName.split(' ')[0] || '',
        lastName:         extra.lastName  || fullName.split(' ').slice(1).join(' ') || '',
        organisationName: null,
        role:             'attendee',
        createdAt:        fb.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  async function _buildUserRecord(firebaseUser, idTokenResult) {
    let profile = {};
    try {
      const fb   = await getFirebase();
      const snap = await fb.firestore().collection('users').doc(firebaseUser.uid).get();
      if (snap.exists) profile = snap.data() || {};
    } catch (_) { /* best-effort; fall back to Auth-provided name below */ }

    const fullName = firebaseUser.displayName || '';
    return {
      id:               firebaseUser.uid,
      email:            firebaseUser.email,
      role:             idTokenResult.claims.role || 'attendee',
      firstName:        profile.firstName || fullName.split(' ')[0] || '',
      lastName:         profile.lastName  || fullName.split(' ').slice(1).join(' ') || '',
      organisationName: profile.organisationName || null,
      createdAt:        firebaseUser.metadata?.creationTime || null,
    };
  }

  function _friendlyAuthError(err) {
    const map = {
      'auth/invalid-credential':     'Incorrect email or password.',
      'auth/user-not-found':         'Incorrect email or password.',
      'auth/wrong-password':         'Incorrect email or password.',
      'auth/email-already-in-use':   'An account with this email already exists.',
      'auth/weak-password':          'Password must be at least 6 characters.',
      'auth/invalid-email':          'Please enter a valid email address.',
      'auth/popup-closed-by-user':   'Sign-in was cancelled.',
      'auth/too-many-requests':      'Too many attempts. Please wait a moment and try again.',
      'auth/network-request-failed': 'Unable to reach authentication service. Please try again.',
    };
    return (err && map[err.code]) || (err && err.message) || 'Something went wrong. Please try again.';
  }

  // ── Session helpers ───────────────────────────────────────────────────────
  function getToken()  { return localStorage.getItem(TOKEN_KEY); }
  function getUser()   { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
  function isLoggedIn() {
    const token = getToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && Date.now() / 1000 > payload.exp) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        return false;
      }
      return true;
    } catch { return false; }
  }
  function isAdmin()     { return getUser()?.role === 'admin'; }
  function isOrganiser() { const r = getUser()?.role; return r === 'organiser' || r === 'admin'; }

  function saveSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function logout() {
    getFirebase().then(fb => fb.auth().signOut()).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // Signing out from services/ or admin/ used to land on a 404.
    const d = window.location.pathname.replace(/^\/|\/$/g, '').split('/').length - 1;
    window.location.href = (d > 0 ? '../'.repeat(d) : '') + 'index.html';
  }

  function headers() {
    const t = getToken();
    return t
      ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` }
      : { 'Content-Type': 'application/json' };
  }

  /* ── requireAuth ──────────────────────────────────────────────────────── */
  let _pendingCallback = null;

  function requireAuth(callback, message) {
    if (isLoggedIn()) {
      callback();
    } else {
      _pendingCallback = callback;
      openModal('login', message);
    }
  }

  function _runPending() {
    if (_pendingCallback) {
      const cb = _pendingCallback;
      _pendingCallback = null;
      cb();
    }
  }

  /** Shared by login/signup/Google sign-in: builds+saves the session, then
   *  either resumes whatever action triggered the auth modal, or redirects
   *  by role. */
  async function _completeSignIn(firebaseUser, opts = {}) {
    const idTokenResult = await firebaseUser.getIdTokenResult();
    const user = await _buildUserRecord(firebaseUser, idTokenResult);
    saveSession(idTokenResult.token, user);
    closeModal();
    updateNavbar();
    if (typeof Utils !== 'undefined') {
      Utils.showToast(opts.welcomeMsg || `Welcome back, ${user.firstName || user.email.split('@')[0]}!`, 'success');
    }

    if (_pendingCallback) {
      _runPending();
    } else {
      const d  = window.location.pathname.replace(/^\/|\/$/g, '').split('/').length - 1;
      const up = d > 0 ? '../'.repeat(d) : '';
      const dest = user.role === 'admin'     ? up + 'admin/index.html'
                 : user.role === 'organiser' ? up + 'dashboard.html'
                 :                             up + 'index.html';
      setTimeout(() => window.location.href = dest, 800);
    }
  }

  /* ── Navbar ───────────────────────────────────────────────────────────── */
  function updateNavbar() {
    const actions = document.querySelector('.navbar__actions');
    if (!actions) return;

    const user = getUser();

    /* These links are injected into pages at the site root AND into pages a
       directory down (services/, admin/). Bare relative hrefs resolved to
       services/dashboard.html on those pages and 404'd, so work out how far
       down we are and prefix accordingly. */
    const depth = window.location.pathname.replace(/^\/|\/$/g, '').split('/').length - 1;
    const up    = depth > 0 ? '../'.repeat(depth) : '';

    if (user) {
      const adm = isAdmin();
      const org = isOrganiser();
      actions.innerHTML = `
        <div class="nav-user" id="navUserMenu">
          <button class="btn btn-primary btn-sm nav-user__btn" id="navUserBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            My TicketsSA
          </button>
          <div class="nav-user__dropdown" id="navUserDropdown">
            <div class="nav-user__name">${escHtml(user.firstName)} ${escHtml(user.lastName)}</div>
            <div class="nav-user__email">${escHtml(user.email)}</div>
            <div class="nav-user__divider"></div>
            <div class="nav-user__choice-label">I want to&hellip;</div>
            <a href="${up}my-tickets.html" class="nav-user__link nav-user__link--choice nav-user__link--buy">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9a3 3 0 1 0 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 1 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/></svg>
              <span><strong>Buy</strong><br>My Tickets &amp; Bookings</span>
            </a>
            <a href="${up}dashboard.html" class="nav-user__link nav-user__link--choice nav-user__link--sell">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <span><strong>Sell</strong><br>Seller Hub</span>
            </a>
            <div class="nav-user__divider"></div>
            <a href="${up}create-listing.html" class="nav-user__link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Create Listing
            </a>
            ${org ? `<a href="${up}organiser.html" class="nav-user__link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19V6l12-3v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="15" r="3"/></svg>
              My Events
            </a>` : ''}
            ${adm ? `<a href="${up}admin/" class="nav-user__link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              Admin Portal
            </a>` : ''}
            <div class="nav-user__divider"></div>
            <button class="nav-user__link nav-user__logout" id="navLogoutBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sign Out
            </button>
          </div>
        </div>`;

      document.getElementById('navUserBtn')?.addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('navUserDropdown')?.classList.toggle('open');
      });
      document.getElementById('navLogoutBtn')?.addEventListener('click', logout);
      document.addEventListener('click', e => {
        if (!e.target.closest('#navUserMenu'))
          document.getElementById('navUserDropdown')?.classList.remove('open');
      });

    } else {
      actions.innerHTML = `
        <a href="${up}sell.html" class="navbar__sell">Sell on TicketsSA</a>
        <button class="btn btn-ghost btn-sm" id="navLoginBtn">Log In</button>
        <button class="btn btn-primary btn-sm" id="navSignupBtn">Sign Up</button>`;
      document.getElementById('navLoginBtn')?.addEventListener('click', () => openModal('login'));
      document.getElementById('navSignupBtn')?.addEventListener('click', () => openModal('signup'));
    }
  }

  /* ── Google SVG (reused in both panels) ──────────────────────────────── */
  const GOOGLE_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>`;

  const EYE_SHOW = `<svg class="pw-eye pw-eye--show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const EYE_HIDE = `<svg class="pw-eye pw-eye--hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

  /* ── Modal ────────────────────────────────────────────────────────────── */
  function buildModal() {
    if (document.getElementById('authModal')) return;

    const overlay = document.createElement('div');
    overlay.id        = 'authModal';
    overlay.className = 'auth-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Sign in or create account');

    overlay.innerHTML = `
      <div class="auth-modal">
        <button class="auth-modal__close" id="authModalClose" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <div class="auth-context-msg hidden" id="authContextMsg"></div>

        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">Log In</button>
          <button class="auth-tab"        data-tab="signup">Sign Up</button>
        </div>

        <div class="auth-error hidden" id="authError" role="alert"></div>

        <!-- ══ LOGIN ══ -->
        <form class="auth-form" id="loginForm" data-panel="login" novalidate>

          <div class="auth-social">
            <button type="button" class="auth-social-btn auth-google-btn" id="googleLoginBtn">
              ${GOOGLE_SVG}
              Continue with Google
            </button>
          </div>

          <div class="auth-divider"><span>or sign in with email</span></div>

          <div class="form-group">
            <label class="form-label" for="loginEmail">Email Address</label>
            <input type="email" id="loginEmail" class="form-input" placeholder="you@example.co.za" required autocomplete="email"/>
          </div>

          <div class="form-group">
            <label class="form-label" for="loginPassword">Password</label>
            <div class="form-input-wrap">
              <input type="password" id="loginPassword" class="form-input" placeholder="Your password" required autocomplete="current-password"/>
              <button type="button" class="form-pw-toggle" data-target="loginPassword" aria-label="Show password">${EYE_SHOW}${EYE_HIDE}</button>
            </div>
          </div>

          <div class="auth-row-between">
            <span></span>
            <button type="button" class="auth-switch-btn" id="forgotPasswordLink">Forgot password?</button>
          </div>

          <div class="auth-recaptcha-wrap${RC_ENABLED ? '' : ' hidden'}" id="rcLoginWrap">
            <div id="rcLogin"></div>
          </div>

          <button type="submit" class="btn btn-primary btn-full" id="loginSubmitBtn">Log In</button>

          <p class="auth-switch">No account? <button type="button" class="auth-switch-btn" data-switch="signup">Create one →</button></p>
        </form>

        <!-- ══ FORGOT PASSWORD ══ -->
        <div class="auth-form hidden" id="forgotForm" data-panel="forgot">
          <button type="button" class="auth-back-btn" id="backToLoginBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Back to login
          </button>
          <p class="auth-forgot-hint">Enter your email and we'll send you a reset link.</p>
          <div class="form-group">
            <label class="form-label" for="forgotEmail">Email Address</label>
            <input type="email" id="forgotEmail" class="form-input" placeholder="you@example.co.za" autocomplete="email"/>
          </div>
          <div class="auth-forgot-sent hidden" id="forgotSent">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" width="20" height="20" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Check your inbox a reset link has been sent.</span>
          </div>
          <button type="button" class="btn btn-primary btn-full" id="forgotSubmitBtn">Send Reset Link</button>
        </div>

        <!-- ══ SIGN UP ══ -->
        <form class="auth-form hidden" id="signupForm" data-panel="signup" novalidate>

          <div class="auth-social">
            <button type="button" class="auth-social-btn auth-google-btn" id="googleSignupBtn">
              ${GOOGLE_SVG}
              Sign up with Google
            </button>
          </div>

          <div class="auth-divider"><span>or create account with email</span></div>

          <div class="auth-form-row">
            <div class="form-group">
              <label class="form-label" for="signupFirst">First Name</label>
              <input type="text" id="signupFirst" class="form-input" placeholder="Thabo" required autocomplete="given-name"/>
            </div>
            <div class="form-group">
              <label class="form-label" for="signupLast">Last Name</label>
              <input type="text" id="signupLast" class="form-input" placeholder="Nkosi" required autocomplete="family-name"/>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="signupEmail">Email Address</label>
            <input type="email" id="signupEmail" class="form-input" placeholder="you@example.co.za" required autocomplete="email"/>
          </div>

          <div class="form-group">
            <label class="form-label" for="signupPassword">
              Password <span class="form-label-hint">(min 6 characters)</span>
            </label>
            <div class="form-input-wrap">
              <input type="password" id="signupPassword" class="form-input" placeholder="Create a password" required autocomplete="new-password"/>
              <button type="button" class="form-pw-toggle" data-target="signupPassword" aria-label="Show password">${EYE_SHOW}${EYE_HIDE}</button>
            </div>
          </div>

          <input type="hidden" id="signupRole" value="attendee"/>

          <div class="auth-recaptcha-wrap${RC_ENABLED ? '' : ' hidden'}" id="rcSignupWrap">
            <div id="rcSignup"></div>
          </div>

          <button type="submit" class="btn btn-primary btn-full" id="signupSubmitBtn">Create Account</button>

          <p class="auth-switch">Already have an account? <button type="button" class="auth-switch-btn" data-switch="login">Log in →</button></p>
          <p class="auth-organiser-note">Want to host events? <a href="mailto:hello@TicketsSA.co.za">Contact us →</a></p>
        </form>
      </div>`;

    document.body.appendChild(overlay);

    // Close handlers
    document.getElementById('authModalClose').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    // Tab / switch buttons
    overlay.querySelectorAll('.auth-tab, .auth-switch-btn').forEach(el => {
      el.addEventListener('click', () => {
        const target = el.dataset.tab || el.dataset.switch;
        if (target) switchTab(target);
      });
    });

    // Form submit
    document.getElementById('loginForm') .addEventListener('submit', handleLogin);
    document.getElementById('signupForm').addEventListener('submit', handleSignup);

    // Google OAuth
    document.getElementById('googleLoginBtn') ?.addEventListener('click', () => handleOAuthSignIn('google'));
    document.getElementById('googleSignupBtn')?.addEventListener('click', () => handleOAuthSignIn('google'));

    // Forgot / back
    document.getElementById('forgotPasswordLink').addEventListener('click', () => { switchTab('forgot'); clearError(); });
    document.getElementById('backToLoginBtn').addEventListener('click', () => {
      switchTab('login'); clearError();
      document.getElementById('forgotSent')?.classList.add('hidden');
      const btn = document.getElementById('forgotSubmitBtn');
      if (btn) { btn.style.display = ''; btn.disabled = false; btn.textContent = 'Send Reset Link'; }
    });
    document.getElementById('forgotSubmitBtn').addEventListener('click', handleForgotPassword);

    // Password show/hide toggle
    overlay.querySelectorAll('.form-pw-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        if (!input) return;
        const toText = input.type === 'password';
        input.type = toText ? 'text' : 'password';
        btn.querySelector('.pw-eye--show').style.display = toText ? 'none' : '';
        btn.querySelector('.pw-eye--hide').style.display = toText ? ''     : 'none';
        btn.setAttribute('aria-label', toText ? 'Hide password' : 'Show password');
      });
    });

    // Keyboard: Escape closes modal
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });
  }

  function switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.auth-form, [data-panel]').forEach(f => f.classList.toggle('hidden', f.dataset.panel !== tab));
    const tabsEl = document.querySelector('.auth-tabs');
    if (tabsEl) tabsEl.style.display = tab === 'forgot' ? 'none' : '';
    clearError();
  }

  function openModal(tab = 'login', contextMessage = null) {
    buildModal();
    switchTab(tab);
    const ctxEl = document.getElementById('authContextMsg');
    if (ctxEl) {
      if (contextMessage) { ctxEl.textContent = contextMessage; ctxEl.classList.remove('hidden'); }
      else                { ctxEl.classList.add('hidden'); }
    }
    document.getElementById('authModal').classList.add('open');
    document.body.style.overflow = 'hidden';
    _renderRecaptchaWidgets();
    setTimeout(() => {
      document.querySelector(`.auth-form[data-panel="${tab}"] input`)?.focus();
    }, 250);
  }

  function closeModal() {
    document.getElementById('authModal')?.classList.remove('open');
    document.body.style.overflow = '';
    _pendingCallback = null;
  }

  function showError(msg) {
    const el = document.getElementById('authError');
    if (el) { el.textContent = msg; el.classList.remove('hidden'); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }

  function clearError() {
    document.getElementById('authError')?.classList.add('hidden');
  }

  /* ── Google / OAuth sign-in ───────────────────────────────────────────── */
  async function handleOAuthSignIn(provider) {
    clearError();
    try {
      const fb = await getFirebase();
      if (provider !== 'google') throw new Error('Unsupported provider');
      const googleProvider = new fb.auth.GoogleAuthProvider();
      const cred = await fb.auth().signInWithPopup(googleProvider);
      await _ensureUserDoc(cred.user);
      await _completeSignIn(cred.user, {
        welcomeMsg: `Welcome, ${(cred.user.displayName || cred.user.email || '').split(' ')[0]}!`,
      });
    } catch (err) {
      if (err && err.code === 'auth/popup-closed-by-user') return;
      showError(`${provider.charAt(0).toUpperCase() + provider.slice(1)} sign-in failed. Please try again.`);
    }
  }

  /* ── Login ────────────────────────────────────────────────────────────── */
  async function handleLogin(e) {
    e.preventDefault();
    clearError();

    const btn   = document.getElementById('loginSubmitBtn');
    const email = document.getElementById('loginEmail')?.value.trim();
    const pass  = document.getElementById('loginPassword')?.value;

    if (!email || !pass) { showError('Please enter your email and password.'); return; }

    let captchaToken = null;
    if (RC_ENABLED) {
      captchaToken = _getRcToken(_rcWidgetLogin);
      if (!captchaToken) { showError('Please complete the reCAPTCHA check.'); return; }
    }

    btn.disabled = true; btn.textContent = 'Logging in…';

    try {
      if (RC_ENABLED && !(await _verifyTurnstile(captchaToken))) {
        _resetRc(_rcWidgetLogin);
        showError('CAPTCHA check failed. Please try again.');
        btn.disabled = false; btn.textContent = 'Log In';
        return;
      }

      const fb   = await getFirebase();
      const cred = await fb.auth().signInWithEmailAndPassword(email, pass);
      await _completeSignIn(cred.user);

    } catch (err) {
      _resetRc(_rcWidgetLogin);
      showError(_friendlyAuthError(err));
      btn.disabled = false; btn.textContent = 'Log In';
    }
  }

  /* ── Signup ───────────────────────────────────────────────────────────── */
  async function handleSignup(e) {
    e.preventDefault();
    clearError();

    const btn       = document.getElementById('signupSubmitBtn');
    const firstName = document.getElementById('signupFirst')?.value.trim();
    const lastName  = document.getElementById('signupLast')?.value.trim();
    const email     = document.getElementById('signupEmail')?.value.trim();
    const password  = document.getElementById('signupPassword')?.value;

    if (!firstName || firstName.length < 2) { showError('First name must be at least 2 characters.'); return; }
    if (!lastName  || lastName.length  < 2) { showError('Last name must be at least 2 characters.'); return; }
    if (!email)                             { showError('A valid email address is required.'); return; }
    if (!password  || password.length  < 6) { showError('Password must be at least 6 characters.'); return; }

    let captchaToken = null;
    if (RC_ENABLED) {
      captchaToken = _getRcToken(_rcWidgetSignup);
      if (!captchaToken) { showError('Please complete the reCAPTCHA check.'); return; }
    }

    btn.disabled = true; btn.textContent = 'Creating account…';

    try {
      if (RC_ENABLED && !(await _verifyTurnstile(captchaToken))) {
        _resetRc(_rcWidgetSignup);
        showError('CAPTCHA check failed. Please try again.');
        btn.disabled = false; btn.textContent = 'Create Account';
        return;
      }

      const fb   = await getFirebase();
      const cred = await fb.auth().createUserWithEmailAndPassword(email, password);
      await _ensureUserDoc(cred.user, { firstName, lastName });
      try { await cred.user.updateProfile({ displayName: `${firstName} ${lastName}`.trim() }); } catch (_) {}

      // Fire the verification email (via Resend) best-effort, then sign back
      // out immediately: no usable session until the link is confirmed, same
      // as the previous Supabase behaviour.
      fetch('/.netlify/functions/firebase-send-auth-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'signup', email }),
      }).catch(() => {});

      await fb.auth().signOut();

      closeModal();
      if (typeof Utils !== 'undefined')
        Utils.showToast('Account created! Check your email to confirm, then log in.', 'success', 6000);
      btn.disabled = false; btn.textContent = 'Create Account';

    } catch (err) {
      _resetRc(_rcWidgetSignup);
      showError(_friendlyAuthError(err));
      btn.disabled = false; btn.textContent = 'Create Account';
    }
  }

  /* ── Forgot password ─────────────────────────────────────────────────── */
  async function handleForgotPassword() {
    clearError();
    const email = document.getElementById('forgotEmail')?.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('Please enter a valid email address.'); return;
    }

    const btn = document.getElementById('forgotSubmitBtn');
    btn.disabled = true; btn.textContent = 'Sending…';

    try {
      await fetch('/.netlify/functions/firebase-send-auth-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'recovery', email }),
      });
    } catch (_) {}

    // Always show success never reveal whether email exists
    btn.style.display = 'none';
    document.getElementById('forgotSent')?.classList.remove('hidden');
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Start loading Turnstile + Firebase immediately so both are ready when
  // the modal first opens (and so the background token-refresh listener
  // attaches on every page, not just ones that open the modal).
  _initRecaptcha();
  getFirebase().catch(() => {});

  return {
    getToken, getUser, isLoggedIn, isAdmin, isOrganiser,
    saveSession, logout, headers,
    openModal, closeModal, updateNavbar,
    requireAuth,
  };

})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Auth.updateNavbar());
} else {
  Auth.updateNavbar();
}
