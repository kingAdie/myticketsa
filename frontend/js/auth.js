
/* ================================================
   MyTicketSA — Auth Module v5
   Changes:
   - Admin button removed from public navbar
   - requireAuth(callback) gating helper
   - Post-login redirects to /dashboard.html
   - Clean Login / Sign Up buttons always visible
   ================================================ */

const Auth = (() => {

  const TOKEN_KEY = 'mt_token';
  const USER_KEY  = 'mt_user';

  /* ── Helpers ─────────────────────────────────────── */
  function getToken()    { return localStorage.getItem(TOKEN_KEY); }
  function getUser()     { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
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

  /* ── requireAuth — gate any action behind login ──────
     Usage:
       Auth.requireAuth(() => window.location.href = 'organiser.html')
     If logged in → runs callback immediately.
     If not → opens login modal; on success → runs callback.
  ────────────────────────────────────────────────────── */
  let _pendingCallback = null;

  function requireAuth(callback, message) {
    if (isLoggedIn()) {
      callback();
    } else {
      _pendingCallback = callback;
      openModal('login', message);
    }
  }

  /* Run the pending callback after successful auth */
  function _runPending() {
    if (_pendingCallback) {
      const cb = _pendingCallback;
      _pendingCallback = null;
      cb();
    }
  }

  /* ── Navbar ──────────────────────────────────────── */
  function updateNavbar() {
    const actions = document.querySelector('.navbar__actions');
    if (!actions) return;

    const user = getUser();

    if (user) {
      /* Logged in — show user menu. No Admin button exposed publicly. */
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
      /* Logged out — clean Login + Sign Up */
      actions.innerHTML = `
        <button class="btn btn-ghost btn-sm" id="navLoginBtn">Log In</button>
        <button class="btn btn-primary btn-sm" id="navSignupBtn">Sign Up</button>`;

      document.getElementById('navLoginBtn') ?.addEventListener('click', () => openModal('login'));
      document.getElementById('navSignupBtn')?.addEventListener('click', () => openModal('signup'));
    }
  }

  /* ── Modal ───────────────────────────────────────── */
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

        <!-- Context message (shown when gating a specific action) -->
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
  }

  function switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.toggle('hidden', f.dataset.panel !== tab));
    clearError();
  }

  function openModal(tab = 'login', contextMessage = null) {
    buildModal();
    switchTab(tab);

    // Show context message if provided (e.g. "Sign in to request this service")
    const ctxEl = document.getElementById('authContextMsg');
    if (ctxEl) {
      if (contextMessage) {
        ctxEl.textContent = contextMessage;
        ctxEl.classList.remove('hidden');
      } else {
        ctxEl.classList.add('hidden');
      }
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
    _pendingCallback = null; // clear pending if user closes without logging in
  }

  function showError(msg) {
    const el = document.getElementById('authError');
    if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  }

  function clearError() {
    document.getElementById('authError')?.classList.add('hidden');
  }

  /* ── Login handler ───────────────────────────────── */
  async function handleLogin(e) {
    e.preventDefault();
    clearError();

    const btn   = document.getElementById('loginSubmitBtn');
    const email = document.getElementById('loginEmail')?.value.trim();
    const pass  = document.getElementById('loginPassword')?.value;

    if (!email || !pass) { showError('Please enter your email and password.'); return; }

    btn.disabled = true; btn.textContent = 'Logging in…';

    try {
      const res  = await fetch(_API_BASE + '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showError(data.error || 'Incorrect email or password.');
        btn.disabled = false; btn.textContent = 'Log In';
        return;
      }

      saveSession(data.token, data.user);
      closeModal();
      updateNavbar();
      if (typeof Utils !== 'undefined') Utils.showToast(`Welcome back, ${data.user.firstName}! 👋`, 'success');

      // If there was a pending gated action, run it, otherwise go to dashboard
      if (_pendingCallback) {
        _runPending();
      } else {
        setTimeout(() => window.location.href = 'dashboard.html', 800);
      }

    } catch {
      showError('Unable to reach the server. Please try again in a moment.');
      btn.disabled = false; btn.textContent = 'Log In';
    }
  }

  /* ── Signup handler ──────────────────────────────── */
  async function handleSignup(e) {
    e.preventDefault();
    clearError();

    const btn = document.getElementById('signupSubmitBtn');

    const body = {
      firstName: document.getElementById('signupFirst')?.value.trim(),
      lastName:  document.getElementById('signupLast')?.value.trim(),
      email:     document.getElementById('signupEmail')?.value.trim(),
      password:  document.getElementById('signupPassword')?.value,
      role:      'attendee',
    };

    btn.disabled = true; btn.textContent = 'Creating account…';

    try {
      const res  = await fetch(_API_BASE + '/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showError((data.errors || [data.error]).join(' '));
        btn.disabled = false; btn.textContent = 'Create Account';
        return;
      }

      saveSession(data.token, data.user);
      closeModal();
      updateNavbar();
      if (typeof Utils !== 'undefined') Utils.showToast(`Welcome, ${data.user.firstName}! 🎉`, 'success', 3500);

      // Run any pending gated action, otherwise go to dashboard
      if (_pendingCallback) {
        _runPending();
      } else {
        setTimeout(() => window.location.href = 'dashboard.html', 800);
      }

    } catch {
      showError('Cannot connect to the server. Is the backend running?');
      btn.disabled = false; btn.textContent = 'Create Account';
    }
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

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
