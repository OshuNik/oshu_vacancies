// favorites.js — «Избранное» с бесшовным поиском, PTR-панелью и индикатором обновления
// Обновления:
// 1) Убрана кнопка закладки — остались только "Откликнуться" (зелёная) и "Удалить" (красная).
// 2) Хедер карточки зелёный (как "ТОЧНО ТВОЁ").
// 3) "Откликнуться" открывает реальную ссылку на отклик, найденную ИИ (не пост).

(function () {
  'use strict';

  const { SUPABASE_URL, SUPABASE_ANON_KEY, PAGE_SIZE_MAIN, RETRY_OPTIONS, SEARCH_FIELDS } = window.APP_CONFIG || {};
  const {
    escapeHtml, stripTags, debounce, highlightText, safeAlert,
    formatTimestamp, sanitizeUrl, openLink,
    cleanImageMarkers, pickImageUrl,
    fetchWithRetry, renderEmptyState, renderError,
    ensureLoadMore, updateLoadMore
  } = window.utils || {};

  const PAGE_SIZE = PAGE_SIZE_MAIN || 10;

  // ---- DOM ----
  const container = document.getElementById('favorites-list');
  const searchInput = document.getElementById('search-input-fav');
  const searchContainer = document.getElementById('search-container-fav');

  // ---- State ----
  let currentController = null;
  const state = {
    query: '',
    offset: 0,
    total: 0,
    busy: false,
    loadedOnce: false,
    loadedForQuery: ''
  };

  // ---- Abort helper ----
  function abortCurrent() {
    if (currentController) { try { currentController.abort(); } catch {} }
    currentController = new AbortController();
    return currentController;
  }

  // ---- Search UI ----
  let searchStatsEl = null;
  function ensureSearchUI() {
    if (!searchContainer) return;
    if (!searchStatsEl) {
      searchStatsEl = document.createElement('div');
      searchStatsEl.className = 'search-stats';
      searchContainer.appendChild(searchStatsEl);
    }
  }
  function updateSearchStats() {
    ensureSearchUI();
    if (!container || !searchStatsEl) return;
    const visible = container.querySelectorAll('.vacancy-card').length;
    const total = state.total || visible;
    const q = (searchInput?.value || '').trim();
    searchStatsEl.textContent = q ? (visible === 0 ? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`) : '';
  }

  // ---- Helpers ----
  function parseTotal(resp) {
    const cr = resp.headers.get('content-range'); // "0-9/58"
    if (!cr || !cr.includes('/')) return 0;
    const total = cr.split('/').pop();
    return Number(total) || 0;
  }

  function buildUrl(limit, offset, query) {
    const p = new URLSearchParams();
    p.set('select', '*');
    p.set('status', 'eq.favorite');
    p.set('order', 'timestamp.desc');
    p.set('limit', String(limit));
    p.set('offset', String(offset));

    const q = (query || '').trim();
    if (q && Array.isArray(SEARCH_FIELDS) && SEARCH_FIELDS.length) {
      const orExpr = '(' + SEARCH_FIELDS.map(f => `${f}.ilike.*${q}*`).join(',') + ')';
      p.set('or', orExpr);
    }
    return `${SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;
  }

  // Выбираем «реальный» URL отклика (не пост): приоритет полям, где ИИ сохранил ссылку.
  // Порядок важен; берём первую валидную, отдаём предпочтение не-telegram ссылкам.
  function pickApplyUrlFromVacancy(v = {}) {
    const candidatesRaw = [
      v.apply_url_ai, v.apply_ai_url, v.apply_url_extracted, v.apply_link, v.application_url,
      v.apply, v.link_to_apply, v.apply_url, v.original_apply_url,
      // запасные варианты — хуже, но лучше, чем ничего
      v.external_url, v.vacancy_url, v.website_url,
      v.source_url, v.post_url, v.message_link
    ].filter(Boolean);

    // санитизируем и убираем дубликаты
    const seen = new Set();
    const candidates = [];
    for (const c of candidatesRaw) {
      const s = sanitizeUrl(String(c));
      if (!s) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      candidates.push(s);
    }
    if (candidates.length === 0) return '';

    // сортируем: не-telegram выше, затем https выше http
    candidates.sort((a, b) => {
      const aTg = a.includes('t.me/');
      const bTg = b.includes('t.me/');
      if (aTg !== bTg) return aTg ? 1 : -1;
      const aHttps = a.startsWith('https://');
      const bHttps = b.startsWith('https://');
      if (aHttps !== bHttps) return aHttps ? -1 : 1;
      return 0;
    });

    return candidates[0];
  }

  // ---- Card ----
  function buildCard(v) {
    const card = document.createElement('div');
    card.className = 'vacancy-card';
    // зелёная шапка как у "ТОЧНО ТВОЁ"
    card.classList.add('category-main');
    card.id = `fav-${v.id}`;

    const isValid = (val) => val && val !== 'null' && val !== 'не указано';

    // --- header actions ---
    // ОСТАВЛЯЕМ только "Откликнуться" и "Удалить"
    const applyUrl = pickApplyUrlFromVacancy(v);
    const applyBtn = applyUrl ? `
      <button class="card-action-btn apply" data-action="apply" data-url="${escapeHtml(applyUrl)}" aria-label="Откликнуться">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>` : '';

    const deleteBtn = `
      <button class="card-action-btn delete" data-action="delete" data-id="${v.id}" aria-label="Удалить">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>`;

    // --- info window rows ---
    const infoRows = [];
    const fmt = [v.employment_type, v.work_format].filter(Boolean).join(' / ');
    if (fmt) infoRows.push({ label: 'ФОРМАТ', value: fmt, type: 'default' });
    if (isValid(v.salary_display_text)) infoRows.push({ label: 'ОПЛАТА', value: v.salary_display_text, type: 'salary' });
    const sphereText = isValid(v.industry) ? v.industry : (v.sphere || '').trim();
    if (sphereText) infoRows.push({ label: 'СФЕРА', value: sphereText, type: 'industry' });

    let infoWindowHtml = '';
    if (infoRows.length) {
      infoWindowHtml = '<div class="info-window">' +
        infoRows.map(r => `
          <div class="info-row info-row--${r.type}">
            <div class="info-label">${escapeHtml(r.label)} >></div>
            <div class="info-value">${escapeHtml(r.value)}</div>
          </div>`).join('') +
        '</div>';
    }

    const q = state.query;
    const summaryText = v.reason || 'Описание не было сгенерировано.';
    const originalDetailsRaw = v.text_highlighted ? stripTags(String(v.text_highlighted)) : '';
    const bestImageUrl = pickImageUrl(v, originalDetailsRaw);
    const cleanedDetailsText = bestImageUrl ? cleanImageMarkers(originalDetailsRaw) : originalDetailsRaw;
    const attachmentsHTML = bestImageUrl ? `<div class="attachments"><a class="image-link-button" href="${bestImageUrl}" target="_blank" rel="noopener noreferrer">Изображение</a></div>` : '';
    const hasDetails = Boolean(cleanedDetailsText) || Boolean(attachmentsHTML);
    const detailsHTML = hasDetails ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>` : '';

    // footer
    let skillsFooterHtml = '';
    if (Array.isArray(v.skills) && v.skills.length) {
      skillsFooterHtml = `<div class="footer-skill-tags">${
        v.skills.slice(0,3).map(s => `<span class="footer-skill-tag">${escapeHtml(String(s))}</span>`).join('')
      }</div>`;
    }
    const channelHtml = v.channel ? `<span class="channel-name">${escapeHtml(v.channel)}</span>` : '';
    const timestampHtml = `<span class="timestamp-footer">${escapeHtml(formatTimestamp(v.timestamp))}</span>`;
    const sep = channelHtml && timestampHtml ? ' • ' : '';
    const footerMetaHtml = `<div class="footer-meta">${channelHtml}${sep}${timestampHtml}</div>`;

    card.innerHTML = `
      <div class="card-actions">
        ${applyBtn}
        ${deleteBtn}
      </div>
      <div class="card-header"><h3>ИЗБРАННОЕ</h3></div>
      <div class="card-body">
        <p class="card-summary"></p>
        ${infoWindowHtml}
        ${detailsHTML}
      </div>
      <div class="card-footer">
        ${skillsFooterHtml}
        ${footerMetaHtml}
      </div>
    `;

    const summaryEl = card.querySelector('.card-summary');
    if (summaryEl) {
      summaryEl.dataset.originalSummary = summaryText;
      summaryEl.innerHTML = highlightText(summaryText, q);
    }
    const detailsEl = card.querySelector('.vacancy-text');
    if (detailsEl) {
      detailsEl.dataset.originalText = cleanedDetailsText;
      detailsEl.innerHTML = attachmentsHTML + highlightText(cleanedDetailsText, q);
    }
    return card;
  }

  // ---- Actions ----
  container?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'apply')   openLink(btn.dataset.url);
    if (action === 'delete')  updateStatus(btn.dataset.id, 'deleted');
  });

  async function updateStatus(id, newStatus) {
    if (!id) return;
    const ok = await showConfirm('Удалить вакансию из избранного?');
    if (!ok) return;
    try {
      const url = `${SUPABASE_URL}/rest/v1/vacancies?id=eq.${encodeURIComponent(id)}`;
      const resp = await fetchWithRetry(url, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ status: newStatus })
      }, RETRY_OPTIONS);
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      // remove from DOM
      const el = document.getElementById(`fav-${CSS.escape(id)}`);
      if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 150); }

      if (state.total > 0) state.total -= 1;
      updateSearchStats();
    } catch (err) {
      console.error(err);
      safeAlert('Не удалось выполнить действие.');
    }
  }

  // кастомный confirm (общий с главной)
  const overlay = document.getElementById('custom-confirm-overlay');
  const textEl  = document.getElementById('custom-confirm-text');
  const okBtn   = document.getElementById('confirm-btn-ok');
  const cancelBtn = document.getElementById('confirm-btn-cancel');
  function showConfirm(message) {
    return new Promise(res => {
      if (!overlay) return res(window.confirm(message));
      textEl.textContent = message;
      overlay.classList.remove('hidden');
      const close = () => { overlay.classList.add('hidden'); okBtn.onclick = null; cancelBtn.onclick = null; };
      okBtn.onclick = () => { close(); res(true); };
      cancelBtn.onclick = () => { close(); res(false); };
    });
  }

  // ---- Load (append) ----
  async function fetchNext() {
    if (!container || state.busy) return;
    state.busy = true;

    const url = buildUrl(PAGE_SIZE, state.offset, state.query);
    const controller = abortCurrent();

    try {
      const resp = await fetchWithRetry(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: 'count=exact' },
        signal: controller.signal
      }, RETRY_OPTIONS);
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      const total = parseTotal(resp);
      if (Number.isFinite(total)) state.total = total;

      const items = await resp.json();
      const frag = document.createDocumentFragment();
      for (const it of items) frag.appendChild(buildCard(it));
      container.appendChild(frag);

      const { btn } = ensureLoadMore(container, fetchNext);
      state.offset += items.length;
      const hasMore = state.offset < state.total;
      updateLoadMore(container, hasMore);
      if (btn) btn.disabled = !hasMore;

      if (state.total === 0 && state.offset === 0) {
        renderEmptyState(container, '-- В избранном пусто --');
        updateLoadMore(container, false);
      }

      updateSearchStats();
      state.loadedOnce = true;
      state.loadedForQuery = state.query;

    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error('fav load error:', e);
      renderError(container, e.message, fetchNext);
    } finally {
      state.busy = false;
    }
  }

  // ---- Smooth refetch (no flicker) ----
  async function refetchSmooth() {
    if (!container) return;

    abortCurrent();
    state.busy = true;

    const keepH = container.offsetHeight;
    container.style.minHeight = keepH ? `${keepH}px` : '';

    const url = buildUrl(PAGE_SIZE, 0, state.query);
    const controller = currentController;

    try {
      const resp = await fetchWithRetry(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: 'count=exact' },
        signal: controller.signal
      }, RETRY_OPTIONS);
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      const total = parseTotal(resp);
      const items = await resp.json();

      const frag = document.createDocumentFragment();
      for (const it of items) frag.appendChild(buildCard(it));

      const lm = container.querySelector('.load-more-wrap');
      container.replaceChildren(frag);
      if (lm) container.appendChild(lm);

      state.offset = items.length;
      state.total  = Number.isFinite(total) ? total : items.length;
      state.loadedOnce = true;
      state.loadedForQuery = state.query;

      const { btn } = ensureLoadMore(container, fetchNext);
      const hasMore = state.offset < state.total;
      updateLoadMore(container, hasMore);
      if (btn) btn.disabled = !hasMore;

      updateSearchStats();
      flashRefreshed(container);
      document.dispatchEvent(new CustomEvent('favorites:loaded'));

    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('fav refetch error:', e);
        renderError(container, e.message, refetchSmooth);
        document.dispatchEvent(new CustomEvent('favorites:loaded'));
      }
    } finally {
      container.style.minHeight = '';
      state.busy = false;
    }
  }

  // ---- Search ----
  const onSearch = debounce(() => {
    state.query = (searchInput?.value || '').trim();
    refetchSmooth();
  }, 220);
  searchInput?.addEventListener('input', onSearch);

  // ---- PTR panel (как на главной) ----
  (function setupPTRFav() {
    const threshold = 78;
    let startY = 0, pulling = false, ready = false, locked = false;

    const bar = document.createElement('div');
    bar.style.cssText = [
      'position:fixed','left:0','right:0','top:0',
      'height:56px','background:#fff','color:#333',
      'border-bottom:3px solid #000','box-shadow:0 2px 0 #000',
      'transform:translateY(-100%)','transition:transform .2s ease,opacity .14s linear',
      'z-index:9999','font-family:inherit','font-weight:700',
      'display:flex','align-items:center','justify-content:center',
      'letter-spacing:.2px','opacity:0','pointer-events:none'
    ].join(';');
    bar.textContent = 'Потяните вниз для обновления';
    document.body.appendChild(bar);

    const setBar = y => { bar.style.transform = `translateY(${Math.min(0, -100 + (y/0.56))}%)`; bar.style.opacity = y>6 ? '1' : '0'; };
    const resetBar = () => { bar.style.transform = 'translateY(-100%)'; bar.style.opacity = '0'; };

    window.addEventListener('touchstart', (e) => {
      if (locked) return;
      if (window.scrollY > 0) { pulling = false; return; }
      if (e.touches.length !== 1) { pulling = false; return; }
      startY = e.touches[0].clientY; pulling = true; ready = false;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!pulling || locked) return;
      const y = e.touches[0].clientY;
      const dist = y - startY;
      if (dist > 0) {
        e.preventDefault();
        setBar(dist);
        if (dist > threshold && !ready) { ready = true; bar.textContent = 'Отпустите для обновления'; }
        if (dist <= threshold && ready) { ready = false; bar.textContent = 'Потяните вниз для обновления'; }
      } else { pulling = false; resetBar(); }
    }, { passive: false });

    window.addEventListener('touchend', () => {
      if (!pulling || locked) { resetBar(); pulling = false; return; }
      if (ready) {
        locked = true; bar.textContent = 'Обновляю…'; setBar(threshold * 1.2);
        const done = () => { locked = false; pulling = false; resetBar(); };
        const onLoaded = () => { document.removeEventListener('favorites:loaded', onLoaded); done(); };
        document.addEventListener('favorites:loaded', onLoaded);
        refetchSmooth();
        setTimeout(() => { if (locked) done(); }, 8000);
      } else { resetBar(); pulling = false; }
    }, { passive: true });
  })();

  // ---- Flash after refresh ----
  (function injectFlashCSS(){
    const style=document.createElement('style');
    style.textContent=`
      @keyframes refreshedFlashFav { 0%{background:#fffbe6;} 100%{background:transparent;} }
      .refreshed-flash-fav { animation: refreshedFlashFav .6s ease forwards; }
    `;
    document.head.appendChild(style);
  })();
  function flashRefreshed(node){
    if (!node) return;
    node.classList.remove('refreshed-flash-fav');
    void node.offsetWidth;
    node.classList.add('refreshed-flash-fav');
  }

  // ---- Init ----
  function init() {
    ensureSearchUI();
    fetchNext();
  }
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

})();
