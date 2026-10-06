/* ================================================
   TicketsSA Listing Wizard Core (wizard-core.js)

   One staged-wizard engine, reused by every listing
   category (event, accommodation, equipment,
   experience). Each category supplies a declarative
   step/field config no bespoke wizard code.

   Depends on: utils.js (Utils), auth.js (Auth).
   Styles:     css/wizard.css

   IMAGES: photos are compressed client-side (JPEG, max
   1600px) and held as data URLs while the form is filled.
   On submit they are uploaded to Supabase Storage (bucket
   `listing-images`) and replaced by public links. If storage
   is unavailable a small photo falls back to staying inline.
   ================================================ */

const WizardCore = (() => {

  const DRAFT_PREFIX  = 'tsa_draft_v1_';
  const DRAFT_VERSION = 1;
  const DRAFT_MAX_AGE = 14 * 24 * 60 * 60 * 1000;   // 14 days
  const IMG_MAX_MB    = 5;

  /* ── Helpers ──────────────────────────────────── */

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(v) {
    const n = parseFloat(v);
    if (isNaN(n)) return '';
    if (n === 0) return 'Free';
    return 'R' + n.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function niceDate(v) {
    if (!v) return '';
    try {
      const d = new Date(String(v).includes('T') ? v : v + 'T00:00:00');
      if (isNaN(d)) return v;
      return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return v; }
  }

  const ICONS = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M20 6L9 17l-5-5"/></svg>',
    left:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    up:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12l-7-7-7 7"/></svg>',
    down:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l7 7 7-7"/></svg>',
    pin:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    cal:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/></svg>',
  };

  /* ── Draft storage ────────────────────────────── */

  function userId() {
    try {
      const u = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
      return u && u.id ? String(u.id) : 'guest';
    } catch { return 'guest'; }
  }

  function draftKey(category) {
    return DRAFT_PREFIX + category + '_' + userId();
  }

  /** Drop drafts that are stale or from an older schema version. */
  function sweepDrafts() {
    try {
      const now = Date.now();
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(DRAFT_PREFIX) !== 0) continue;
        const d = Utils.getStorage(k);
        const stale = !d
          || d.version !== DRAFT_VERSION
          || !d.savedAt
          || (now - new Date(d.savedAt).getTime()) > DRAFT_MAX_AGE;
        if (stale) Utils.removeStorage(k);
      }
    } catch (e) { /* storage unavailable private mode, etc. */ }
  }

  function readDraft(category) {
    const d = Utils.getStorage(draftKey(category));
    if (!d || d.version !== DRAFT_VERSION) return null;
    if (!d.savedAt || (Date.now() - new Date(d.savedAt).getTime()) > DRAFT_MAX_AGE) {
      Utils.removeStorage(draftKey(category));
      return null;
    }
    return d;
  }

  /** Public: summary of the current user's saved drafts (for Seller Hub). */
  function listDrafts() {
    sweepDrafts();
    const out = [];
    try {
      const suffix = '_' + userId();
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(DRAFT_PREFIX) !== 0 || !k.endsWith(suffix)) continue;
        const d = Utils.getStorage(k);
        if (d && d.category) out.push(d);
      }
    } catch (e) { /* ignore */ }
    return out.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  }

  function clearDraft(category) { Utils.removeStorage(draftKey(category)); }

  /* ── Instance ─────────────────────────────────── */

  function create(config) {
    const cfg = Object.assign({
      category:      'listing',
      title:         'Create a listing',
      steps:         [],
      onSubmit:      async () => {},
      buildPreview:  null,
      previewLabel:  'How your listing will appear',
      submitLabel:   'Publish listing',
      exitHref:      'dashboard.html',
      successTitle:  'Listing submitted',
      successBody:   '',
      successActions: [],
      mount:         '#wizardRoot',
    }, config || {});

    const root = document.querySelector(cfg.mount);
    if (!root) { console.error('WizardCore: mount element not found', cfg.mount); return null; }

    // Review is always the final step, generated by the engine.
    const steps = cfg.steps.concat([{ id: '__review', title: 'Review & publish', hint: 'Check everything reads well, then publish. You can edit any step before submitting.', review: true }]);

    let state    = {};
    let stepIx   = 0;
    let maxSeen  = 0;
    let errors   = {};
    let busy     = false;
    let finished = false;

    /* ---- state helpers ---- */
    const get = (name) => state[name];
    const set = (name, val) => { state[name] = val; scheduleSave(); };

    function visibleSteps() {
      return steps.filter(s => !s.showIf || s.showIf(state));
    }
    function visibleFields(step) {
      return (step.fields || []).filter(f => !f.showIf || f.showIf(state));
    }

    /* ---- draft ---- */
    let saveTimer = null;
    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveDraft(true), 600);
    }
    function saveDraft(silent) {
      if (finished) return;
      Utils.setStorage(draftKey(cfg.category), {
        version:   DRAFT_VERSION,
        category:  cfg.category,
        label:     cfg.title,
        titleGuess: state[cfg.draftTitleField || 'title'] || state.name || '',
        stepIndex: stepIx,
        totalSteps: visibleSteps().length,
        percent:   completionPercent(),
        state:     state,
        userId:    userId(),
        savedAt:   new Date().toISOString(),
      });
      if (!silent) Utils.showToast('Draft saved on this device. You can finish it later.', 'success');
    }

    function completionPercent() {
      const vs = visibleSteps().filter(s => !s.review);
      let total = 0, done = 0;
      vs.forEach(s => visibleFields(s).forEach(f => {
        if (f.type === 'info') return;
        total++;
        const v = state[f.name];
        if (Array.isArray(v) ? v.length : (v !== undefined && v !== null && String(v).trim() !== '')) done++;
      }));
      return total ? Math.round(done / total * 100) : 0;
    }

    /* ── Field rendering ──────────────────────── */

    function fieldHTML(f) {
      const v   = state[f.name];
      const err = errors[f.name];
      const id  = 'wf_' + f.name;
      const req = f.required ? '<span class="req">*</span>' : '';
      const help = f.help ? `<div class="wz__field-help">${esc(f.help)}</div>` : '';
      const errHTML = err ? `<div class="wz__field-err" id="${id}_err">${esc(err)}</div>` : '';
      const invalid = err ? ' is-invalid' : '';
      const aria = err ? ` aria-invalid="true" aria-describedby="${id}_err"` : '';

      let control = '';

      switch (f.type) {

        case 'info':
          return `<div class="wz__note${f.tone === 'warn' ? ' is-warn' : ''}">
              <span class="wz__note-icon">${f.icon || 'ℹ️'}</span>
              <div class="wz__note-body">${f.html || esc(f.text || '')}</div>
            </div>`;

        case 'textarea':
          control = `<textarea id="${id}" class="form-textarea${invalid}" data-wf="${esc(f.name)}"
              rows="${f.rows || 5}" placeholder="${esc(f.placeholder || '')}"${aria}>${esc(v || '')}</textarea>`;
          break;

        case 'select':
          control = `<select id="${id}" class="form-select${invalid}" data-wf="${esc(f.name)}"${aria}>
              <option value="">${esc(f.placeholder || 'Select…')}</option>
              ${(f.options || []).map(o => {
                const val = typeof o === 'string' ? o : o.value;
                const lab = typeof o === 'string' ? o : o.label;
                return `<option value="${esc(val)}"${String(v) === String(val) ? ' selected' : ''}>${esc(lab)}</option>`;
              }).join('')}
            </select>`;
          break;

        case 'money':
          control = `<div class="wz__prefix"><span class="wz__prefix-tag">R</span>
              <input id="${id}" type="number" inputmode="decimal" min="0" step="0.01"
                class="form-input${invalid}" data-wf="${esc(f.name)}"
                placeholder="${esc(f.placeholder || '0.00')}" value="${esc(v ?? '')}"${aria}/></div>`;
          break;

        case 'number':
          control = `<input id="${id}" type="number" inputmode="numeric"
              min="${f.min ?? 0}"${f.max !== undefined ? ` max="${f.max}"` : ''} step="${f.step || 1}"
              class="form-input${invalid}" data-wf="${esc(f.name)}"
              placeholder="${esc(f.placeholder || '')}" value="${esc(v ?? '')}"${aria}/>`;
          break;

        case 'cards': {
          const wide = (f.options || []).length > 4 ? ' is-wide' : '';
          control = `<div class="wz__cards${wide}" role="radiogroup" aria-label="${esc(f.label)}">
            ${(f.options || []).map(o => {
              const sel = String(v) === String(o.value);
              return `<button type="button" role="radio" aria-checked="${sel}"
                  class="wz__card${sel ? ' is-selected' : ''}" data-wf-card="${esc(f.name)}" data-val="${esc(o.value)}">
                  ${o.icon ? `<span class="wz__card-icon">${o.icon}</span>` : ''}
                  <span class="wz__card-body">
                    <span class="wz__card-title">${esc(o.label)}</span>
                    ${o.sub ? `<span class="wz__card-sub">${esc(o.sub)}</span>` : ''}
                  </span>
                  <span class="wz__card-check">${ICONS.check}</span>
                </button>`;
            }).join('')}
          </div>`;
          break;
        }

        case 'chips': {
          const arr = Array.isArray(v) ? v : [];
          control = `<div class="wz__chips" role="group" aria-label="${esc(f.label)}">
            ${(f.options || []).map(o => {
              const val = typeof o === 'string' ? o : o.value;
              const lab = typeof o === 'string' ? o : o.label;
              const sel = arr.indexOf(val) !== -1;
              return `<button type="button" aria-pressed="${sel}"
                  class="wz__chip${sel ? ' is-selected' : ''}" data-wf-chip="${esc(f.name)}" data-val="${esc(val)}">
                  <span class="wz__chip-tick">${ICONS.check}</span>${esc(lab)}
                </button>`;
            }).join('')}
          </div>`;
          break;
        }

        case 'image':
        case 'images': {
          const multi = f.type === 'images';
          const list  = multi ? (Array.isArray(v) ? v : []) : (v ? [v] : []);
          const max   = f.max || (multi ? 8 : 1);
          const full  = list.length >= max;
          control = `
            <div class="wz__drop" data-wf-drop="${esc(f.name)}" data-multi="${multi}" data-max="${max}"
                 role="button" tabindex="0" ${full ? 'hidden' : ''}>
              <div class="wz__drop-icon">📷</div>
              <div class="wz__drop-title">${multi ? 'Add photos' : 'Add a photo'}</div>
              <div class="wz__drop-sub">Tap to choose${multi ? ` · up to ${max} images` : ''} · JPG or PNG, max ${IMG_MAX_MB}MB each</div>
            </div>
            <input type="file" accept="image/*" ${multi ? 'multiple' : ''} class="hidden" data-wf-file="${esc(f.name)}"/>
            ${list.length ? `<div class="wz__thumbs">${list.map((src, i) => `
              <div class="wz__thumb">
                <img src="${esc(src)}" alt="${multi ? `Photo ${i + 1}` : 'Selected image'}"/>
                ${multi && i === 0 ? '<span class="wz__thumb-cover">Cover</span>' : ''}
                <div class="wz__thumb-tools">
                  ${multi ? `
                    <button type="button" class="wz__thumb-btn" title="Move earlier" aria-label="Move photo ${i + 1} earlier"
                      data-wf-img-move="${esc(f.name)}" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>${ICONS.up}</button>
                    <button type="button" class="wz__thumb-btn" title="Move later" aria-label="Move photo ${i + 1} later"
                      data-wf-img-move="${esc(f.name)}" data-i="${i}" data-dir="1" ${i === list.length - 1 ? 'disabled' : ''}>${ICONS.down}</button>` : ''}
                  <button type="button" class="wz__thumb-btn is-danger" title="Remove" aria-label="Remove photo ${i + 1}"
                    data-wf-img-del="${esc(f.name)}" data-i="${i}">${ICONS.trash}</button>
                </div>
              </div>`).join('')}</div>` : ''}`;
          break;
        }

        case 'repeater': {
          const rows = Array.isArray(v) && v.length ? v : [Object.assign({}, f.blank || {})];
          control = `<div class="wz__rep">
            ${rows.map((row, i) => `
              <div class="wz__rep-item">
                <div class="wz__rep-head">
                  <span class="wz__rep-label">${esc(f.itemLabel || 'Item')} ${i + 1}</span>
                  ${rows.length > 1 ? `<button type="button" class="wz__rep-remove" data-wf-rep-del="${esc(f.name)}" data-i="${i}">Remove</button>` : ''}
                </div>
                <div class="wz__fields">
                  ${(f.fields || []).map(sub => {
                    const sv  = row[sub.name] ?? '';
                    const sid = `wf_${f.name}_${i}_${sub.name}`;
                    const serr = errors[`${f.name}.${i}.${sub.name}`];
                    const sinv = serr ? ' is-invalid' : '';
                    let sc;
                    if (sub.type === 'money') {
                      sc = `<div class="wz__prefix"><span class="wz__prefix-tag">R</span>
                        <input id="${sid}" type="number" inputmode="decimal" min="0" step="0.01" class="form-input${sinv}"
                          data-wf-rep="${esc(f.name)}" data-i="${i}" data-sub="${esc(sub.name)}"
                          placeholder="${esc(sub.placeholder || '0.00')}" value="${esc(sv)}"/></div>`;
                    } else if (sub.type === 'number') {
                      sc = `<input id="${sid}" type="number" inputmode="numeric" min="${sub.min ?? 0}" class="form-input${sinv}"
                          data-wf-rep="${esc(f.name)}" data-i="${i}" data-sub="${esc(sub.name)}"
                          placeholder="${esc(sub.placeholder || '')}" value="${esc(sv)}"/>`;
                    } else {
                      sc = `<input id="${sid}" type="text" class="form-input${sinv}"
                          data-wf-rep="${esc(f.name)}" data-i="${i}" data-sub="${esc(sub.name)}"
                          placeholder="${esc(sub.placeholder || '')}" value="${esc(sv)}"/>`;
                    }
                    return `<div class="form-group">
                        <label class="form-label" for="${sid}">${esc(sub.label)}${sub.required ? '<span class="req">*</span>' : ''}</label>
                        ${sc}
                        ${sub.help ? `<div class="wz__field-help">${esc(sub.help)}</div>` : ''}
                        ${serr ? `<div class="wz__field-err">${esc(serr)}</div>` : ''}
                      </div>`;
                  }).join('')}
                </div>
              </div>`).join('')}
            <button type="button" class="wz__rep-add" data-wf-rep-add="${esc(f.name)}">+ ${esc(f.addLabel || 'Add another')}</button>
          </div>`;
          break;
        }

        default: {  // text, tel, email, url, date, time
          const t = f.type || 'text';
          control = `<input id="${id}" type="${t}" class="form-input${invalid}" data-wf="${esc(f.name)}"
              placeholder="${esc(f.placeholder || '')}" value="${esc(v ?? '')}"
              ${f.maxlength ? `maxlength="${f.maxlength}"` : ''}${aria}/>`;
        }
      }

      const labelHTML = f.type === 'cards' || f.type === 'chips' || f.type === 'image' || f.type === 'images' || f.type === 'repeater'
        ? `<span class="form-label">${esc(f.label)}${req}</span>`
        : `<label class="form-label" for="${id}">${esc(f.label)}${req}</label>`;

      return `<div class="form-group" data-field="${esc(f.name)}">${labelHTML}${control}${help}${errHTML}</div>`;
    }

    /* ── Review rendering ─────────────────────── */

    function displayValue(f) {
      const v = state[f.name];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return null;

      switch (f.type) {
        case 'money':  return money(v);
        case 'date':   return niceDate(v);
        case 'chips':  return (Array.isArray(v) ? v : []).join(', ');
        case 'image':  return `<img src="${esc(v)}" alt=""/>`;
        case 'images': return `<div class="wz__review-imgs">${v.map(s => `<img src="${esc(s)}" alt=""/>`).join('')}</div>`;
        case 'cards': {
          const o = (f.options || []).find(x => String(x.value) === String(v));
          return esc(o ? o.label : v);
        }
        case 'select': {
          const o = (f.options || []).find(x => String(typeof x === 'string' ? x : x.value) === String(v));
          return esc(o ? (typeof o === 'string' ? o : o.label) : v);
        }
        case 'repeater':
          return (Array.isArray(v) ? v : []).map((row, i) =>
            `${i + 1}. ` + (f.fields || []).map(s => {
              const cell = row[s.name];
              if (cell === undefined || cell === '') return null;
              return `${esc(s.label)}: ${s.type === 'money' ? money(cell) : esc(cell)}`;
            }).filter(Boolean).join(' · ')
          ).join('<br/>');
        default:
          return esc(v);
      }
    }

    function reviewHTML() {
      const groups = visibleSteps().filter(s => !s.review).map((s, i) => {
        const rows = visibleFields(s).filter(f => f.type !== 'info').map(f => {
          const val = displayValue(f);
          return `<div class="wz__review-row">
              <div class="wz__review-key">${esc(f.label)}</div>
              <div class="wz__review-val${val ? '' : ' is-empty'}">${val || 'Not added'}</div>
            </div>`;
        }).join('');
        if (!rows) return '';
        return `<div class="wz__review-group">
            <div class="wz__review-head">
              <span class="wz__review-title">${esc(s.title)}</span>
              <button type="button" class="wz__review-edit" data-wz-goto="${i}">Edit</button>
            </div>
            <div class="wz__review-list">${rows}</div>
          </div>`;
      }).join('');

      let preview = '';
      if (typeof cfg.buildPreview === 'function') {
        const p = cfg.buildPreview(state) || {};
        preview = `<div class="wz__preview">
            <div class="wz__preview-label">${esc(cfg.previewLabel)}</div>
            ${p.image ? `<img class="wz__preview-img" src="${esc(p.image)}" alt=""/>`
                      : '<div class="wz__preview-img-ph">No photo added yet</div>'}
            <div class="wz__preview-body">
              ${p.category ? `<div class="wz__preview-cat">${esc(p.category)}</div>` : ''}
              <div class="wz__preview-title">${esc(p.title || 'Untitled listing')}</div>
              ${(p.meta || []).length ? `<div class="wz__preview-meta">${p.meta.map(m => `
                  <div class="wz__preview-meta-item">${ICONS[m.icon] || ICONS.pin}<span>${esc(m.text)}</span></div>`).join('')}</div>` : ''}
              ${p.description ? `<div class="wz__preview-desc">${esc(String(p.description).slice(0, 320))}${String(p.description).length > 320 ? '…' : ''}</div>` : ''}
              <div class="wz__preview-foot">
                <div class="wz__preview-price">${p.price !== undefined && p.price !== '' ? esc(money(p.price)) : ''}</div>
                ${p.priceNote ? `<div class="wz__preview-cat" style="margin:0">${esc(p.priceNote)}</div>` : ''}
              </div>
            </div>
          </div>`;
      }

      return preview + groups;
    }

    /* ── Validation ───────────────────────────── */

    function validateStep(step) {
      errors = {};
      visibleFields(step).forEach(f => {
        if (f.type === 'info') return;
        const v = state[f.name];

        if (f.required) {
          const empty = Array.isArray(v) ? !v.length : (v === undefined || v === null || String(v).trim() === '');
          if (empty) { errors[f.name] = f.requiredMsg || 'This is required to continue.'; return; }
        }
        if (f.type === 'repeater' && Array.isArray(v)) {
          v.forEach((row, i) => (f.fields || []).forEach(sub => {
            if (sub.required && (row[sub.name] === undefined || String(row[sub.name]).trim() === '')) {
              errors[`${f.name}.${i}.${sub.name}`] = 'Required.';
            }
          }));
        }
        if (v !== undefined && v !== null && String(v).trim() !== '' && typeof f.validate === 'function') {
          const msg = f.validate(v, state);
          if (msg) errors[f.name] = msg;
        }
      });

      if (typeof step.validate === 'function') {
        const extra = step.validate(state) || {};
        Object.assign(errors, extra);
      }
      return Object.keys(errors).length === 0;
    }

    /* ── Render ───────────────────────────────── */

    function render() {
      if (finished) return;
      const vs      = visibleSteps();
      const step    = vs[stepIx];
      const isLast  = stepIx === vs.length - 1;
      const pct     = Math.round(((stepIx) / Math.max(1, vs.length - 1)) * 100);

      root.innerHTML = `
        <div class="wz__top">
          <div class="wz__top-inner">
            <a href="index.html" class="wz__brand"><span class="w">tickets</span><span class="g">sa</span></a>
            <span class="wz__top-title">${esc(cfg.title)}</span>
            <button type="button" class="wz__exit" data-wz-exit>${ICONS.close}<span>Exit</span></button>
          </div>
        </div>

        <div class="wz__container">
          <div class="wz__progress">
            <div class="wz__progress-meta">
              <span class="wz__progress-step">Step <b>${stepIx + 1}</b> of ${vs.length}</span>
              <span class="wz__progress-pct">${pct}% complete</span>
            </div>
            <div class="wz__bar"><div class="wz__bar-fill" style="width:${Math.max(4, pct)}%"></div></div>
            <div class="wz__pips">
              ${vs.map((s, i) => `
                <button type="button" class="wz__pip ${i === stepIx ? 'is-current' : (i <= maxSeen ? 'is-done' : '')}"
                  ${i <= maxSeen && i !== stepIx ? `data-wz-goto="${i}"` : 'disabled aria-disabled="true"'}
                  ${i > maxSeen ? 'title="Finish the current step first"' : ''}>
                  <span class="wz__pip-num">${i < stepIx ? '✓' : i + 1}</span>${esc(s.title)}
                </button>`).join('')}
            </div>
          </div>

          <div class="wz__step">
            <div class="wz__step-head">
              <h1 class="wz__step-title">${esc(step.title)}</h1>
              ${step.hint ? `<p class="wz__step-hint">${step.hintHtml || esc(step.hint)}</p>` : ''}
            </div>
            ${step.review
              ? reviewHTML()
              : `<div class="wz__fields">${visibleFields(step).map(fieldHTML).join('')}</div>`}
          </div>
        </div>

        <div class="wz__actions">
          <div class="wz__actions-inner">
            ${stepIx > 0 ? `<button type="button" class="btn btn-secondary wz__back" data-wz-back>${ICONS.left} Back</button>` : ''}
            <button type="button" class="btn btn-primary wz__next" data-wz-next ${busy ? 'disabled' : ''}>
              ${busy ? 'Submitting…' : (isLast ? esc(cfg.submitLabel) : 'Continue')} ${isLast || busy ? '' : ICONS.right}
            </button>
            <button type="button" class="wz__save" data-wz-save>Save draft</button>
          </div>
          <div class="wz__draft-note">Drafts are saved on this device only</div>
        </div>`;

      bind();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const firstErr = root.querySelector('.is-invalid, .wz__field-err');
      if (firstErr) firstErr.closest('.form-group')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    /* ── Events ───────────────────────────────── */

    function bind() {
      // text-ish inputs
      root.querySelectorAll('[data-wf]').forEach(el => {
        el.addEventListener('input', () => {
          state[el.dataset.wf] = el.value;
          if (errors[el.dataset.wf]) {                    // clear the error as they fix it
            delete errors[el.dataset.wf];
            el.classList.remove('is-invalid');
            const e = el.closest('.form-group')?.querySelector('.wz__field-err');
            if (e) e.remove();
          }
          scheduleSave();
        });
      });

      // single-choice cards
      root.querySelectorAll('[data-wf-card]').forEach(el => {
        el.addEventListener('click', () => { set(el.dataset.wfCard, el.dataset.val); delete errors[el.dataset.wfCard]; render(); });
      });

      // multi-choice chips
      root.querySelectorAll('[data-wf-chip]').forEach(el => {
        el.addEventListener('click', () => {
          const name = el.dataset.wfChip;
          const arr  = Array.isArray(state[name]) ? state[name].slice() : [];
          const i    = arr.indexOf(el.dataset.val);
          if (i === -1) arr.push(el.dataset.val); else arr.splice(i, 1);
          set(name, arr);
          el.classList.toggle('is-selected');
          el.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
        });
      });

      // images
      root.querySelectorAll('[data-wf-drop]').forEach(el => {
        const name  = el.dataset.wfDrop;
        const input = root.querySelector(`[data-wf-file="${name}"]`);
        el.addEventListener('click', () => input && input.click());
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input && input.click(); } });
      });
      root.querySelectorAll('[data-wf-file]').forEach(input => {
        input.addEventListener('change', async () => {
          const name  = input.dataset.wfFile;
          const field = findField(name);
          const multi = field && field.type === 'images';
          const max   = (field && field.max) || (multi ? 8 : 1);
          const files = Array.from(input.files || []);
          if (!files.length) return;

          for (const file of files) {
            if (!file.type.startsWith('image/')) { Utils.showToast('That file is not an image.', 'error'); continue; }
            if (file.size > IMG_MAX_MB * 1024 * 1024) {
              Utils.showToast(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB. Please use an image under ${IMG_MAX_MB}MB.`, 'error');
              continue;
            }
            try {
              const compressed = await Utils.compressImage(file, { maxWidth: 1600, maxHeight: 1600, type: 'image/jpeg' });
              const dataUrl    = await new Promise((res, rej) => {
                const r = new FileReader();
                r.onerror = () => rej(new Error('read failed'));
                r.onload  = (e) => res(e.target.result);
                r.readAsDataURL(compressed);
              });
              if (multi) {
                const arr = Array.isArray(state[name]) ? state[name].slice() : [];
                if (arr.length >= max) { Utils.showToast(`You can add up to ${max} photos.`, 'info'); break; }
                arr.push(dataUrl);
                state[name] = arr;
              } else {
                state[name] = dataUrl;
              }
              delete errors[name];
            } catch (e) {
              Utils.showToast('That image could not be processed. Try another file.', 'error');
            }
          }
          saveDraft(true);
          render();
        });
      });
      root.querySelectorAll('[data-wf-img-del]').forEach(btn => {
        btn.addEventListener('click', () => {
          const name = btn.dataset.wfImgDel, i = +btn.dataset.i;
          const f = findField(name);
          if (f && f.type === 'images') {
            const arr = (state[name] || []).slice(); arr.splice(i, 1); state[name] = arr;
          } else { state[name] = ''; }
          saveDraft(true); render();
        });
      });
      root.querySelectorAll('[data-wf-img-move]').forEach(btn => {
        btn.addEventListener('click', () => {
          const name = btn.dataset.wfImgMove, i = +btn.dataset.i, dir = +btn.dataset.dir;
          const arr = (state[name] || []).slice();
          const j = i + dir;
          if (j < 0 || j >= arr.length) return;
          [arr[i], arr[j]] = [arr[j], arr[i]];
          state[name] = arr; saveDraft(true); render();
        });
      });

      // repeater
      root.querySelectorAll('[data-wf-rep]').forEach(el => {
        el.addEventListener('input', () => {
          const name = el.dataset.wfRep;
          const i    = +el.dataset.i, sub = el.dataset.sub;
          const f    = findField(name);
          const arr  = Array.isArray(state[name]) && state[name].length ? state[name].slice() : [Object.assign({}, f.blank || {})];
          arr[i] = Object.assign({}, arr[i], { [sub]: el.value });
          state[name] = arr;
          delete errors[`${name}.${i}.${sub}`];
          scheduleSave();
        });
      });
      root.querySelectorAll('[data-wf-rep-add]').forEach(btn => {
        btn.addEventListener('click', () => {
          const name = btn.dataset.wfRepAdd, f = findField(name);
          const arr  = Array.isArray(state[name]) && state[name].length ? state[name].slice() : [Object.assign({}, f.blank || {})];
          arr.push(Object.assign({}, f.blank || {}));
          state[name] = arr; saveDraft(true); render();
        });
      });
      root.querySelectorAll('[data-wf-rep-del]').forEach(btn => {
        btn.addEventListener('click', () => {
          const name = btn.dataset.wfRepDel, i = +btn.dataset.i;
          const arr = (state[name] || []).slice(); arr.splice(i, 1);
          state[name] = arr; saveDraft(true); render();
        });
      });

      // navigation
      root.querySelector('[data-wz-next]')?.addEventListener('click', next);
      root.querySelector('[data-wz-back]')?.addEventListener('click', back);
      root.querySelector('[data-wz-save]')?.addEventListener('click', () => saveDraft(false));
      root.querySelector('[data-wz-exit]')?.addEventListener('click', exit);
      root.querySelectorAll('[data-wz-goto]').forEach(b => {
        b.addEventListener('click', () => { stepIx = +b.dataset.wzGoto; errors = {}; render(); });
      });
    }

    function findField(name) {
      for (const s of steps) {
        const f = (s.fields || []).find(x => x.name === name);
        if (f) return f;
      }
      return null;
    }

    /* ── Flow control ─────────────────────────── */

    function next() {
      const vs   = visibleSteps();
      const step = vs[stepIx];

      if (step.review) return submit();

      if (!validateStep(step)) {
        render();
        Utils.showToast('Please complete the highlighted fields.', 'error', 3500);
        return;
      }
      stepIx = Math.min(stepIx + 1, vs.length - 1);
      maxSeen = Math.max(maxSeen, stepIx);
      saveDraft(true);
      render();
    }

    function back() {
      if (stepIx === 0) return;
      stepIx--; errors = {}; saveDraft(true); render();
    }

    function exit() {
      const pct = completionPercent();
      if (pct > 0 && !finished) {
        saveDraft(true);
        Utils.showToast('Draft saved. Continue from your Seller Hub whenever you like.', 'info', 4000);
        setTimeout(() => { window.location.href = cfg.exitHref; }, 700);
      } else {
        window.location.href = cfg.exitHref;
      }
    }

    async function submit() {
      if (busy) return;
      // Re-validate every step so a skipped required field can't slip through.
      const vs = visibleSteps().filter(s => !s.review);
      for (let i = 0; i < vs.length; i++) {
        if (!validateStep(vs[i])) {
          stepIx = i;
          render();
          Utils.showToast('Something is missing on this step. Please complete it.', 'error', 4000);
          return;
        }
      }
      errors = {};
      busy = true; render();
      try {
        await uploadPhotos();
        const result = await cfg.onSubmit(state);
        finished = true;
        notifyTeam();
        clearDraft(cfg.category);
        showDone(result);
      } catch (e) {
        busy = false;
        console.error('Wizard submit failed:', e);
        render();
        Utils.showToast(e && e.message ? e.message : 'Could not submit right now. Please try again.', 'error', 6000);
      }
    }

    /* Photos are held in the browser as data URLs while the seller fills the form.
       Upload them to storage now so the database stores short links, not megabytes. */
    async function uploadPhotos() {
      const fields = [];
      steps.forEach(st => (st.fields || []).forEach(f => { if (f.type === 'image' || f.type === 'images') fields.push(f); }));
      for (const f of fields) {
        const v = state[f.name];
        const isData = x => typeof x === 'string' && x.startsWith('data:');
        const up = async (item) => {
          try { return await SupabaseAPI.uploadListingImage(item); }
          catch (e) {
            if (item.length < 600000) { console.warn('Storage upload failed, keeping photo inline:', e.message); return item; }
            throw e;
          }
        };
        if (f.type === 'images' && Array.isArray(v) && v.some(isData)) {
          const out = [];
          for (const item of v) out.push(isData(item) ? await up(item) : item);
          state[f.name] = out;
        } else if (f.type === 'image' && isData(v)) {
          state[f.name] = await up(v);
        }
      }
    }

    /* Tell the TicketsSA support inbox (and email the seller a receipt) about a
       listing that was just saved. Fire-and-forget: the listing is already safely
       in the database, so a mail problem must never turn into a failed submission. */
    function notifyTeam() {
      if (!cfg.notifyKind || typeof SellerApply === 'undefined') return;
      try {
        const user  = (typeof Auth !== 'undefined' && Auth.getUser()) || {};
        const rows  = [];
        steps.filter(st => !st.review).forEach(st => (st.fields || []).forEach(f => {
          if (['info', 'image', 'images'].includes(f.type)) return;
          const v = state[f.name];
          if (v === undefined || v === null || v === '') return;
          let text;
          if (f.type === 'repeater' && Array.isArray(v)) {
            text = v.map(row => (f.fields || [])
              .filter(sf => row[sf.name] !== '' && row[sf.name] != null)
              .map(sf => `${sf.label}: ${row[sf.name]}`).join(', ')).filter(Boolean).join('  |  ');
          } else if (Array.isArray(v)) {
            text = v.join(', ');
          } else {
            text = String(v);
          }
          if (text) rows.push({ label: f.label || f.name, value: text });
        }));
        const photos = (state.images || []).length + (state.image ? 1 : 0);
        if (photos) rows.push({ label: 'Photos', value: `${photos} uploaded` });

        const title = String(state[cfg.draftTitleField || 'title'] || '').trim() || 'Untitled listing';
        SellerApply.submit(cfg.notifyKind, {
          title,
          contactName:  state.contactName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'TicketsSA seller',
          contactEmail: state.contactEmail || user.email || '',
          contactPhone: state.contactPhone || state.phone || '',
          details:      rows,
        }).catch(e => console.warn('Listing notification not sent:', e && e.message));
      } catch (e) {
        console.warn('Listing notification not sent:', e && e.message);
      }
    }

    function showDone(result) {
      const actions = (typeof cfg.successActions === 'function' ? cfg.successActions(result, state) : cfg.successActions) || [];
      root.innerHTML = `
        <div class="wz__top"><div class="wz__top-inner">
          <a href="index.html" class="wz__brand"><span class="w">tickets</span><span class="g">sa</span></a>
          <span class="wz__top-title">${esc(cfg.title)}</span>
        </div></div>
        <div class="wz__container">
          <div class="wz__done">
            <div class="wz__done-icon">✅</div>
            <h1 class="wz__done-title">${esc(cfg.successTitle)}</h1>
            <p class="wz__done-sub">${cfg.successBodyHtml || esc(cfg.successBody)}</p>
            <div class="wz__done-btns">
              ${actions.map((a, i) => `<a class="btn ${i === 0 ? 'btn-primary' : 'btn-secondary'} btn-full" href="${esc(a.href)}">${esc(a.label)}</a>`).join('')}
            </div>
          </div>
        </div>`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ── Boot ─────────────────────────────────── */

    function start(initialState) {
      sweepDrafts();
      state = Object.assign({}, cfg.initialState || {}, initialState || {});

      // A repeater always shows one blank row, so seed state to match what the
      // user sees otherwise "required" fires before they've touched anything.
      steps.forEach(s => (s.fields || []).forEach(f => {
        if (f.type === 'repeater' && !Array.isArray(state[f.name])) {
          state[f.name] = [Object.assign({}, f.blank || {})];
        }
      }));

      // Editing an existing record always beats a stale local draft.
      const editing = !!(initialState && Object.keys(initialState).length);
      const draft   = editing ? null : readDraft(cfg.category);

      if (draft && draft.state && Object.keys(draft.state).length) {
        renderResume(draft);
      } else {
        render();
      }
    }

    function renderResume(draft) {
      const when = new Date(draft.savedAt);
      const ago  = (() => {
        const mins = Math.round((Date.now() - when.getTime()) / 60000);
        if (mins < 60) return `${Math.max(1, mins)} min ago`;
        if (mins < 1440) return `${Math.round(mins / 60)} hr ago`;
        return `${Math.round(mins / 1440)} day${Math.round(mins / 1440) > 1 ? 's' : ''} ago`;
      })();
      const name = draft.titleGuess || 'Untitled draft';

      root.innerHTML = `
        <div class="wz__top"><div class="wz__top-inner">
          <a href="index.html" class="wz__brand"><span class="w">tickets</span><span class="g">sa</span></a>
          <span class="wz__top-title">${esc(cfg.title)}</span>
          <button type="button" class="wz__exit" data-wz-exit>${ICONS.close}<span>Exit</span></button>
        </div></div>
        <div class="wz__container">
          <div class="wz__resume">
            <div class="wz__resume-body">
              <div class="wz__resume-title">Continue where you left off?</div>
              <div class="wz__resume-sub">“${esc(name)}” · ${draft.percent || 0}% complete · saved ${esc(ago)}</div>
            </div>
            <div class="wz__resume-btns">
              <button type="button" class="btn btn-secondary btn-sm" data-wz-fresh>Start over</button>
              <button type="button" class="btn btn-primary btn-sm" data-wz-resume>Continue</button>
            </div>
          </div>
        </div>`;

      root.querySelector('[data-wz-resume]').addEventListener('click', () => {
        state   = Object.assign({}, draft.state);
        stepIx  = Math.min(draft.stepIndex || 0, visibleSteps().length - 1);
        maxSeen = stepIx;
        render();
      });
      root.querySelector('[data-wz-fresh]').addEventListener('click', () => {
        clearDraft(cfg.category);
        state = Object.assign({}, cfg.initialState || {});
        stepIx = 0; maxSeen = 0;
        render();
      });
      root.querySelector('[data-wz-exit]').addEventListener('click', exit);
    }

    return { start, getState: () => state, setField: set, getField: get };
  }

  return { create, listDrafts, clearDraft, sweepDrafts, DRAFT_PREFIX };

})();
