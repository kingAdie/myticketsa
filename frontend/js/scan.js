/* ================================================
   TicketsSA door check-in (scan.html)

   The organiser picks one of their events, points the phone camera at a
   ticket QR (or types the reference), and gets an instant answer:
     ✅ admitted   ⚠ already used   ❌ not paid / expired / cancelled / wrong event
   A valid ticket is checked in on the spot, so the same QR can't get in twice.
   ================================================ */

/* global Utils, Auth, SupabaseAPI, Html5Qrcode */

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('scRoot');
  const esc  = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const time = iso => iso ? new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '';

  let events = [], eventId = null, sales = [], scanner = null, busy = false, lastCode = '', lastAt = 0;
  const recent = [];

  if (!Auth.isLoggedIn()) {
    root.innerHTML = `<div class="sc-card sc-center"><h1>Sign in to scan tickets</h1><p>Use the account you listed the event with.</p><button class="btn btn-primary btn-lg" id="scLogin">Sign in</button></div>`;
    document.getElementById('scLogin').addEventListener('click', () => Auth.requireAuth(() => location.reload(), 'Sign in to scan tickets', 'login'));
    return;
  }

  start();

  async function start() {
    const user = Auth.getUser();
    try { events = await SupabaseAPI.getEvents({ organiserId: user.id }); } catch (_) { events = []; }
    if (!events.length) {
      root.innerHTML = `<div class="sc-card sc-center"><h1>No events yet</h1><p>Only the organiser of an event can check its tickets in.</p><a class="btn btn-primary" href="sell-event.html">List an event</a></div>`;
      return;
    }
    // Soonest upcoming published event first.
    const today = new Date().toISOString().slice(0, 10);
    events.sort((a, b) => {
      const ua = (a.date || '') >= today ? 0 : 1, ub = (b.date || '') >= today ? 0 : 1;
      return ua - ub || String(a.date || '').localeCompare(String(b.date || ''));
    });
    const params = new URLSearchParams(location.search);
    eventId = params.get('event') && events.some(e => e.id === params.get('event')) ? params.get('event') : events[0].id;
    try { sales = await SupabaseAPI.getSalesForMyEvents(); } catch (_) { sales = []; }
    renderShell();
  }

  function stats() {
    const mine = sales.filter(t => t.event.id === eventId);
    const qty  = list => list.reduce((n, t) => n + (Number(t.ticket.quantity) || 0), 0);
    return {
      inside:   qty(mine.filter(t => t.state === 'checked_in')),
      expected: qty(mine.filter(t => t.state === 'checked_in' || t.state === 'confirmed')),
      unpaid:   mine.filter(t => t.state === 'reserved').length,
    };
  }

  function renderShell() {
    const s = stats();
    root.innerHTML = `
      <section class="sc-card sc-pick">
        <label for="scEvent">Event</label>
        <select id="scEvent">${events.map(e => `<option value="${esc(e.id)}"${e.id === eventId ? ' selected' : ''}>${esc(e.title)}${e.date ? ' · ' + esc(Utils.formatDate(e.date)) : ''}</option>`).join('')}</select>
        <div class="sc-stats">
          <div><b id="scIn">${s.inside}</b><span>checked in</span></div>
          <div><b>${s.expected}</b><span>paid tickets</span></div>
          <div><b>${s.unpaid}</b><span>unpaid bookings</span></div>
        </div>
      </section>

      <section class="sc-card sc-cam">
        <div class="sc-cam__view" id="scReader"></div>
        <div class="sc-cam__frame" aria-hidden="true"><i></i><i></i><i></i><i></i><span class="sc-cam__line"></span></div>
        <div class="sc-cam__idle" id="scIdle">
          <button class="btn btn-primary btn-lg" id="scStart" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Start camera
          </button>
          <p>Point the camera at the QR code on the guest's ticket.</p>
        </div>
        <div class="sc-result" id="scResult" hidden></div>
      </section>

      <form class="sc-card sc-manual" id="scManual" autocomplete="off">
        <label for="scCode">No camera? Type the reference</label>
        <div class="sc-manual__row">
          <input id="scCode" placeholder="TKT-XXXXXXXXXX" autocapitalize="characters" spellcheck="false"/>
          <button class="btn btn-secondary" type="submit">Check</button>
        </div>
      </form>

      <section class="sc-card sc-recent" ${recent.length ? '' : 'hidden'} id="scRecentWrap">
        <h2>Recent scans</h2>
        <ul id="scRecent"></ul>
      </section>`;

    document.getElementById('scEvent').addEventListener('change', e => { eventId = e.target.value; stopCam(); recent.length = 0; renderShell(); });
    document.getElementById('scStart').addEventListener('click', startCam);
    document.getElementById('scManual').addEventListener('submit', e => {
      e.preventDefault();
      const v = document.getElementById('scCode').value.trim();
      if (v) handle(v, true);
    });
    drawRecent();
  }

  /* ── Camera ─────────────────────────────────────────────── */
  async function startCam() {
    if (typeof Html5Qrcode === 'undefined') {
      Utils.showToast('The camera scanner could not load. Type the reference below instead.', 'error', 6000);
      return;
    }
    const idle = document.getElementById('scIdle');
    try {
      scanner = new Html5Qrcode('scReader', { verbose: false });
      await scanner.start({ facingMode: 'environment' }, { fps: 12, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; } },
        code => handle(code, false), () => {});
      idle.hidden = true;
      document.querySelector('.sc-cam').classList.add('is-live');
    } catch (err) {
      scanner = null;
      Utils.showToast('Camera blocked. Allow camera access for this site in your browser settings, or type the reference below.', 'error', 7000);
    }
  }
  function stopCam() { try { scanner && scanner.stop(); } catch (_) {} scanner = null; }
  window.addEventListener('pagehide', stopCam);

  /* ── One scan ───────────────────────────────────────────── */
  async function handle(code, manual) {
    const now = Date.now();
    if (busy || (!manual && code === lastCode && now - lastAt < 4000)) return;   // ignore the same QR held in view
    busy = true; lastCode = code; lastAt = now;
    try { scanner && scanner.pause(true); } catch (_) {}

    let res;
    try { res = await SupabaseAPI.checkInTicket(code, eventId); }
    catch (err) { res = { result: 'error', message: err.message }; }

    showResult(res);
    recent.unshift({ at: new Date().toISOString(), res });
    if (recent.length > 12) recent.pop();
    drawRecent();

    if (res.result === 'admitted') {
      const t = sales.find(x => x.id === res.ticket.id);
      if (t) t.state = 'checked_in'; else sales.push(res.ticket);
      const el = document.getElementById('scIn'); if (el) el.textContent = stats().inside;
    }
    feedback(res.result === 'admitted');
    if (manual) document.getElementById('scCode').value = '';
  }

  const RESULTS = {
    admitted:    { cls: 'ok',   icon: '✓', title: 'Valid. Let them in' },
    already:     { cls: 'warn', icon: '!', title: 'Already checked in' },
    unpaid:      { cls: 'bad',  icon: '✕', title: 'Not paid yet' },
    expired:     { cls: 'bad',  icon: '✕', title: 'Reservation expired' },
    cancelled:   { cls: 'bad',  icon: '✕', title: 'Booking cancelled' },
    wrong_event: { cls: 'bad',  icon: '✕', title: 'Ticket for a different event' },
    not_found:   { cls: 'bad',  icon: '?', title: 'Not a TicketsSA ticket' },
    error:       { cls: 'bad',  icon: '!', title: 'Could not check this ticket' },
  };

  function showResult(res) {
    const r = RESULTS[res.result] || RESULTS.error;
    const t = res.ticket;
    const detail =
      res.result === 'admitted'    ? `Admits <b>${esc(t.ticket.quantity)}</b> · ${esc(t.ticket.typeName)}` :
      res.result === 'already'     ? `Checked in at ${esc(time(t.checkedInAt))}. Do not admit again.` :
      res.result === 'unpaid'      ? 'The organiser has not marked this booking as paid. Check their proof of payment in the Seller Hub.' :
      res.result === 'expired'     ? 'This reservation was never paid and has expired.' :
      res.result === 'cancelled'   ? 'This booking was cancelled.' :
      res.result === 'wrong_event' ? `This ticket is for <b>${esc(t.event.title)}</b>.` :
      res.result === 'not_found'   ? 'The code does not match any booking. It may be fake.' :
                                     esc(res.message || 'Check your connection and try again.');
    const box = document.getElementById('scResult');
    box.className = `sc-result sc-result--${r.cls}`;
    box.innerHTML = `
      <div class="sc-result__icon">${r.icon}</div>
      <h2>${r.title}</h2>
      ${t ? `<p class="sc-result__who">${esc([t.buyer.firstName, t.buyer.lastName].filter(Boolean).join(' '))}</p>` : ''}
      <p>${detail}</p>
      ${t ? `<p class="sc-result__ref">${esc(t.id)}</p>` : ''}
      <button class="btn btn-lg ${r.cls === 'ok' ? 'btn-primary' : 'btn-secondary'}" type="button" id="scNext">Scan next</button>`;
    box.hidden = false;
    document.getElementById('scNext').addEventListener('click', next);
    if (r.cls === 'ok') setTimeout(() => { if (!box.hidden) next(); }, 2600);   // keep the queue moving
  }

  function next() {
    const box = document.getElementById('scResult');
    if (box) box.hidden = true;
    busy = false;
    try { scanner && scanner.resume(); } catch (_) {}
  }

  function drawRecent() {
    const wrap = document.getElementById('scRecentWrap'), ul = document.getElementById('scRecent');
    if (!wrap || !ul) return;
    wrap.hidden = !recent.length;
    ul.innerHTML = recent.map(({ at, res }) => {
      const r = RESULTS[res.result] || RESULTS.error, t = res.ticket;
      return `<li class="sc-r--${r.cls}"><span class="sc-dot"></span><span>${t ? esc([t.buyer.firstName, t.buyer.lastName].filter(Boolean).join(' ')) : esc(res.id || 'Unknown code')}</span><em>${r.title}</em><time>${time(at)}</time></li>`;
    }).join('');
  }

  /* Beep + buzz so the door person doesn't have to read the screen */
  let audio;
  function feedback(ok) {
    try { navigator.vibrate && navigator.vibrate(ok ? 80 : [120, 80, 120]); } catch (_) {}
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = ok ? 880 : 220; o.type = ok ? 'sine' : 'square';
      g.gain.setValueAtTime(0.12, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + (ok ? 0.18 : 0.45));
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + (ok ? 0.2 : 0.5));
    } catch (_) {}
  }
});
