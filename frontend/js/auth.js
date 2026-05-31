
/* ================================================
   MyTicketSA — Auth Module v6
   Auth calls go DIRECTLY to Supabase — no backend
   needed for login / signup / logout.
   Backend is only called (best-effort) after signup
   to set up the profile row with the correct role.
   ================================================ */

const Auth = (() => {

  const TOKEN_KEY = 'mt_token';
  const USER_KEY  = 'mt_user';

  // ── Supabase client (lazy-loaded on first use) ───────────────────────────
  const SUPABASE_URL      = 'https://xaooupqqtbqwjddsqnwi.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhb291cHFxdGJxd2pkZHNxbndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY1MDUsImV4cCI6MjA5NTgxMjUwNX0.ahG6OtWIfLnjqV0DLI_hRD0bh-IcbV14ok7SxIKH-qE';

  let _sb = null;
  async function getSupabase() {
    if (_sb) return _sb;
    if (!window.supabase) {
      await new Promise((resolve, reject) => {
        const s   = document.createElement('script');
        s.src     = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        s.onload  = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _sb;
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

  function formatUser(authUser) {
    // Role: prefer app_metadata (server-set) then user_metadata (set at signup)
    return {
      id:               authUser.id,
      email:            authUser.email,
      role:             authUser.app_metadata?.role || authUser.user_metadata?.role || 'attendee',
      firstName:        authUser.user_metadata?.firstName        || '',
      lastName:         authUser.user_metadata?.lastName         || '',
      organisationName: authUser.user_metadata?.organisationName || null,
      createdAt:        authUser.created_at,
    };
  }

  function logout() {
    getSupabase().then(sb => sb.auth.signOut()).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = 'index.html';
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

  /* ── Navbar ───────────────────────────────────────────────────────────── */
  function updateNavbar() {
    const actions = document.querySelector('.navbar__actions');
    if (!actions) return;

    const user = getUser();

    if (user) {
      const adm = isAdmin();
      const org = isOrganiser();

      actions.innerHTML = `
        <a href="dashboard.html" class="btn btn-ghost btn-sm">My Account</a>
        <div class="nav-user" id="navUserMenu">
          <button class="btn btn-primary btn-sm nav-user__btn" id="navUserBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            ${escHtml(user.firstName)}
          </button>
          <div class="nav-user__dropdown" id="navUserDropdown">
            <div class="nav-user__name">${escHtml(user.firstName)} ${escHtml(user.lastName)}</div>
            <div class="nav-user__email">${escHtml(user.email)}</div>
            <div class="nav-user__divider"></div>
            <a href="dashboard.html" class="nav-user__link">🏠 My Dashboard</a>
            ${org ? `<a href="organiser.html" class="nav-user__link">🎤 My Events</a>` : ''}
            ${adm ? `<a href="admin/" class="nav-user__link">🛠 Admin Portal</a>` : ''}
            <div class="nav-user__divider"></div>
            <button class="nav-user__link nav-user__logout" id="navLogoutBtn">Sign Out</button>
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
        <button class="btn btn-ghost btn-sm" id="navLoginBtn">Log In</button>
        <button class="btn btn-primary btn-sm" id="navSignupBtn">Sign Up</button>`;

      document.getElementById('navLoginBtn') ?.addEventListener('click', () => openModal('login'));
      document.getElementById('navSignupBtn')?.addEventListener('click', () => openModal('signup'));
    }
  }

  /* ── Modal ────────────────────────────────────────────────────────────── */
  let _modalMessage = null;

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
        <button class="auth-modal__close" id="authModalClose" aria-label="Close">✕</button>
        <div class="auth-context-msg hidden" id="authContextMsg"></div>
        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">Log In</button>
          <button class="auth-tab"        data-tab="signup">Sign Up</button>
        </div>
        <div class="auth-error hidden" id="authError" role="alert"></div>

        <!-- LOGIN -->
        <form class="auth-form" id="loginForm" data-panel="login" novalidate>
          <div class="form-group">
            <label class="form-label" for="loginEmail">Email Address</label>
            <input type="email" id="loginEmail" class="form-input" placeholder="you@example.co.za" required autocomplete="email"/>
          </div>
          <div class="form-group">
            <label class="form-label" for="loginPassword">Password</label>
            <input type="password" id="loginPassword" class="form-input" placeholder="Your password" required autocomplete="current-password"/>
          </div>
          <button type="submit" class="btn btn-primary btn-full" id="loginSubmitBtn">Log In</button>
          <p class="auth-switch">No account? <button type="button" class="auth-switch-btn" data-switch="signup">Create one →</button></p>
        </form>

        <!-- SIGN UP -->
        <form class="auth-form hidden" id="signupForm" data-panel="signup" novalidate>
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
            <label class="form-label" for="signupPassword">Password <span style="color:var(--text-3);font-weight:400;">(min 6 chars)</span></label>
            <input type="password" id="signupPassword" class="form-input" placeholder="Create a password" required autocomplete="new-password"/>
          </div>
          <div class="form-group">
            <label class="form-label">Account Type</label>
            <div class="auth-role-toggle" role="radiogroup" aria-label="Account type">
              <button type="button" class="auth-role-btn active" data-role="attendee" aria-pressed="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Attendee
              </button>
              <button type="button" class="auth-role-btn" data-role="organiser" aria-pressed="false">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                Event Organiser
              </button>
            </div>
            <input type="hidden" id="signupRole" value="attendee"/>
          </div>
          <button type="submit" class="btn btn-primary btn-full" id="signupSubmitBtn">Create Account</button>
          <p class="auth-switch">Already have an account? <button type="button" class="auth-switch-btn" data-switch="login">Log in →</button></p>
        </form>
      </div>`;

    document.body.appendChild(overlay);

    document.getElementById('authModalClose').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    overlay.querySelectorAll('.auth-tab, .auth-switch-btn').forEach(el => {
      el.addEventListener('click', () => switchTab(el.dataset.tab || el.dataset.switch));
    });

    document.getElementById('loginForm') .addEventListener('submit', handleLogin);
    document.getElementById('signupForm').addEventListener('submit', handleSignup);

    overlay.querySelectorAll('.auth-role-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.auth-role-btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        document.getElementById('signupRole').value = btn.dataset.role;
      });
    });
  }

  function switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.toggle('hidden', f.dataset.panel !== tab));
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
    if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  }

  function clearError() {
    document.getElementById('authError')?.classList.add('hidden');
  }

  /* ── Login — direct Supabase call, no backend needed ─────────────────── */
  async function handleLogin(e) {
    e.preventDefault();
    clearError();

    const btn   = document.getElementById('loginSubmitBtn');
    const email = document.getElementById('loginEmail')?.value.trim();
    const pass  = document.getElementById('loginPassword')?.value;

    if (!email || !pass) { showError('Please enter your email and password.'); return; }

    btn.disabled = true; btn.textContent = 'Logging in…';

    try {
      const sb = await getSupabase();
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });

      if (error || !data.session) {
        showError(error?.message === 'Invalid login credentials'
          ? 'Incorrect email or password.'
          : (error?.message || 'Login failed. Please try again.'));
        btn.disabled = false; btn.textContent = 'Log In';
        return;
      }

      const user = formatUser(data.user);
      saveSession(data.session.access_token, user);
      closeModal();
      updateNavbar();
      if (typeof Utils !== 'undefined') Utils.showToast(`Welcome back, ${user.firstName}!`, 'success');

      if (_pendingCallback) {
        _runPending();
      } else {
        setTimeout(() => window.location.href = 'dashboard.html', 800);
      }

    } catch (err) {
      showError('Unable to reach authentication service. Please try again.');
      btn.disabled = false; btn.textContent = 'Log In';
    }
  }

  /* ── Signup — direct Supabase call, no backend needed ────────────────── */
  async function handleSignup(e) {
    e.preventDefault();
    clearError();

    const btn = document.getElementById('signupSubmitBtn');

    const firstName        = document.getElementById('signupFirst')?.value.trim();
    const lastName         = document.getElementById('signupLast')?.value.trim();
    const email            = document.getElementById('signupEmail')?.value.trim();
    const password         = document.getElementById('signupPassword')?.value;
    const role             = document.getElementById('signupRole')?.value || 'attendee';
    const organisationName = document.getElementById('signupOrgName')?.value?.trim() || null;

    if (!firstName || firstName.length < 2) { showError('First name must be at least 2 characters.'); return; }
    if (!lastName  || lastName.length  < 2) { showError('Last name must be at least 2 characters.'); return; }
    if (!email)                             { showError('A valid email address is required.'); return; }
    if (!password  || password.length  < 6) { showError('Password must be at least 6 characters.'); return; }

    btn.disabled = true; btn.textContent = 'Creating account…';

    try {
      const sb = await getSupabase();
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: { firstName, lastName, role, organisationName },
        },
      });

      if (error) {
        showError(error.message.includes('already registered')
          ? 'An account with this email already exists.'
          : (error.message || 'Registration failed. Please try again.'));
        btn.disabled = false; btn.textContent = 'Create Account';
        return;
      }

      if (!data.session) {
        // Email confirmation is enabled — ask user to check their inbox
        closeModal();
        if (typeof Utils !== 'undefined')
          Utils.showToast('Account created! Check your email to confirm before logging in.', 'success', 5000);
        btn.disabled = false; btn.textContent = 'Create Account';
        return;
      }

      const user = formatUser(data.user);
      saveSession(data.session.access_token, user);

      // Best-effort: tell backend to set role in profiles table + app_metadata
      // If this fails the user is still logged in — role updates on next login
      fetch(_API_BASE + '/api/auth/setup-profile', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${data.session.access_token}` },
        body:    JSON.stringify({ firstName, lastName, role, organisationName }),
      }).catch(() => {});

      closeModal();
      updateNavbar();
      if (typeof Utils !== 'undefined') Utils.showToast(`Welcome, ${user.firstName}!`, 'success', 3500);

      if (_pendingCallback) {
        _runPending();
      } else {
        setTimeout(() => window.location.href = 'dashboard.html', 800);
      }

    } catch (err) {
      showError('Registration failed. Please try again.');
      btn.disabled = false; btn.textContent = 'Create Account';
    }
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    getToken, getUser, isLoggedIn, isAdmin, isOrganiser,
    saveSession, logout, headers, formatUser,
    openModal, closeModal, updateNavbar,
    requireAuth,
  };

})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Auth.updateNavbar());
} else {
  Auth.updateNavbar();
}
