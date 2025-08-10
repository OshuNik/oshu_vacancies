/* script.js — главная страница
 * — Активные ссылки во всём тексте (включая «вшитые» в Telegram/HTML/Markdown).
 * — Кнопка «Откликнуться» только при наличии apply_url (https:// или tg://).
 * — Вкладки, бесшовный поиск, анимированный pull-to-refresh, счётчики, Load More,
 *   долгий тап по вкладке — массовое удаление категории, кастомный confirm.
 * — ВАЖНО: строки ФОРМАТ/ОПЛАТА/СФЕРА скрываются, если значение «не указано» или пусто.
 */

(function () {
  'use strict';

  // -------- Конфиг / утилиты --------
  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    PAGE_SIZE_MAIN,
    RETRY_OPTIONS,
    SEARCH_FIELDS,
  } = window.APP_CONFIG || {};

  const {
    escapeHtml,
    debounce,
    safeAlert,
    formatTimestamp,
    highlightText,
    openLink,
    pickImageUrl,
    fetchWithRetry,
    renderEmptyState,
    renderError,
    ensureLoadMore,
    updateLoadMore,
    allowHttpOrTg,
  } = window.utils || {};

  if (!window.APP_CONFIG || !window.utils) {
    console.error('APP_CONFIG или utils.js не загружены');
  }

  // -------- DOM --------
  const containers = {
    main:  document.getElementById('vacancies-list-main'),
    maybe: document.getElementById('vacancies-list-maybe'),
    other: document.getElementById('vacancies-list-other'),
  };
  const counts = {
    main:  document.getElementById('count-main'),
    maybe: document.getElementById('count-maybe'),
    other: document.getElementById('count-other'),
  };
  const tabButtons      = document.querySelectorAll('.tab-button');
  const vacancyLists    = document.querySelectorAll('.vacancy-list');
  const searchInput     = document.getElementById('search-input');
  const searchContainer = document.getElementById('search-container');
  const vacanciesContent= document.getElementById('vacancies-content');

  // Кастомный confirm
  const confirmOverlay   = document.getElementById('custom-confirm-overlay');
  const confirmText      = document.getElementById('custom-confirm-text');
  const confirmOkBtn     = document.getElementById('confirm-btn-ok');
  const confirmCancelBtn = document.getElementById('confirm-btn-cancel');

  // -------- Состояние --------
  const state = {
    activeKey: 'main',
    isLoading: false,
    abortController: null,
    // пагинация по категориям
    main:   { page: 0, total: 0, done: false },
    maybe:  { page: 0, total: 0, done: false },
    other:  { page: 0, total: 0, done: false },
    // фильтр
    query: '',
  };

  // -------- Сервис --------
  function setActiveTab(key) {
    state.activeKey = key;
    tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.target === key);
    });
    vacancyLists.forEach(list => {
      list.classList.toggle('active', list.id === `vacancies-list-${key}`);
    });
    updateSearchStats();
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function applySearchFilter() {
    const q = (searchInput?.value || '').trim();
    state.query = q;
    const active = containers[state.activeKey];
    if (!active) return;

    const cards = active.querySelectorAll('.vacancy-card');
    const rx = q ? new RegExp(escapeRegExp(q), 'i') : null;

    cards.forEach(card => {
      const text = card.dataset.searchText || '';
      const ok = rx ? rx.test(text) : true;
      card.style.display = ok ? '' : 'none';

      // подсветка краткого описания
      const summaryEl = card.querySelector('.card-summary');
      if (summaryEl) {
        const original = summaryEl.dataset.originalSummary || summaryEl.textContent || '';
        summaryEl.innerHTML = q ? highlightText(original, q) : escapeHtml(original);
      }
    });

    updateSearchStats();
  }

  // Обновляет счётчики в заголовках вкладок
  function updateCounters() {
    const keys = ['main', 'maybe', 'other'];
    keys.forEach(k => {
      const list = containers[k];
      const count = list ? list.querySelectorAll('.vacancy-card').length : 0;
      if (counts[k]) counts[k].textContent = count;
    });
  }

  // UI: «найдено N из M»
  let searchStatsEl = null;
  function ensureSearchUI(){
    if(!searchStatsEl){
      searchStatsEl = document.createElement('div');
      searchStatsEl.className = 'search-stats';
      searchContainer && searchContainer.appendChild(searchStatsEl);
    }
  }
  function updateSearchStats(){
    ensureSearchUI();
    const active = containers[state.activeKey];
    if(!active){ if(searchStatsEl) searchStatsEl.textContent=''; return; }
    const visible = active.querySelectorAll('.vacancy-card').length;
    const total   = state[state.activeKey].total || visible;
    const q = (searchInput?.value||'').trim();
    if (!searchStatsEl) return;
    searchStatsEl.textContent = q ? (visible===0 ? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`) : '';
  }

  // -------- Abort helper --------
  function abortCurrent() {
    try { state.abortController?.abort(); } catch {}
    state.abortController = null;
    state.isLoading = false;
  }

  // -------- Fetch --------
  function buildQueryParams({ category, page, pageSize, q }) {
    const params = new URLSearchParams();

    // фильтр по категории
    if (category) params.set('category', category);
    // пагинация
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    // поиск на бэке (если доступно)
    if (q) {
      params.set('q', q);
      params.set('fields', (SEARCH_FIELDS || []).join(','));
    }
    return params.toString();
  }

  async function fetchVacancies(categoryKey, page) {
    const pageSize = PAGE_SIZE_MAIN || 20;
    const params = buildQueryParams({
      category: categoryKey,
      page,
      pageSize,
      q: state.query
    });

    const url = `${SUPABASE_URL}/rest/v1/rpc/get_vacancies_paginated?${params}`;
    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    };

    const controller = new AbortController();
    state.abortController = controller;

    const resp = await fetchWithRetry(url, { headers, signal: controller.signal }, RETRY_OPTIONS);
    const data = await resp.json(); // { items: [], total: number }
    return data;
  }

  // -------- Рендер карточки --------
  function renderInfoRows(v) {
    const rows = [];

    const format = String(v.format || '').trim();
    if (format && !/не\s*указано/i.test(format)) {
      rows.push(`<div class="info-row"><span class="info-label">Формат:</span><span class="info-value">${escapeHtml(format)}</span></div>`);
    }

    const pay = String(v.payment || '').trim();
    if (pay && !/не\s*указано/i.test(pay)) {
      rows.push(`<div class="info-row"><span class="info-label">Оплата:</span><span class="info-value">${escapeHtml(pay)}</span></div>`);
    }

    const industry = String(v.industry || '').trim();
    if (industry && !/не\s*указано/i.test(industry)) {
      rows.push(`<div class="info-row"><span class="info-label">Сфера:</span><span class="info-value">${escapeHtml(industry)}</span></div>`);
    }

    return rows.length ? `<div class="info-window">${rows.join('')}</div>` : '';
  }

  function renderDetailsHTML(v) {
    const originalDetailsHtml = String(v.text_highlighted || '').replace(/\[\s*Изображение\s*\]\s*/gi,'');
    const bestImageUrl = pickImageUrl(v, originalDetailsHtml);

    const attachmentsHTML = bestImageUrl ? `<div class="attachments">
      <a class="image-btn" href="${escapeHtml(bestImageUrl)}" target="_blank" rel="noopener noreferrer">Изображение</a>
    </div>` : '';

    const hasDetails = Boolean(originalDetailsHtml) || Boolean(attachmentsHTML);
    return hasDetails
      ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;">${attachmentsHTML + originalDetailsHtml}</div></details>`
      : '';
  }

  function renderCard(v) {
    const card = document.createElement('article');
    card.className = 'vacancy-card';

    // Отклик (только валидные https:// или tg://)
    const applyUrl = allowHttpOrTg(String(v.apply_url || ''));
    const applyBtn = applyUrl ? `<button class="card-action-btn" data-action="apply" data-url="${escapeHtml(applyUrl)}" aria-label="Откликнуться">Откликнуться</button>` : '';

    const infoWindowHtml = renderInfoRows(v);
    const detailsHTML    = renderDetailsHTML(v);

    const skillsFooterHtml = Array.isArray(v.skills) && v.skills.length
      ? `<div class="footer-skill-tags">${v.skills.slice(0,3).map(s=>`<span class="footer-skill-tag">${escapeHtml(String(s))}</span>`).join('')}</div>`
      : '';

    const footerMetaHtml = `
      <div class="footer-meta">
        ${v.channel ? `<span class="channel-name">${escapeHtml(v.channel)}</span>` : ''}
        <span class="timestamp-footer">${escapeHtml(formatTimestamp(v.timestamp))}</span>
      </div>`;

    const summaryText = v.reason || 'Описание не было сгенерировано.';

    card.innerHTML = `
      <div class="card-actions">
        ${applyBtn}
        <button class="card-action-btn" data-action="delete" aria-label="Удалить">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
               viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6"  y2="18"></line>
            <line x1="6"  y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="card-header"><h3>${escapeHtml(v.category || 'NO_CATEGORY')}</h3></div>

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

    // Краткое описание — безопасно + подсветка
    const summaryEl = card.querySelector('.card-summary');
    if (summaryEl) {
      summaryEl.dataset.originalSummary = summaryText;
      const q = state.query;
      summaryEl.innerHTML = q ? highlightText(summaryText, q) : escapeHtml(summaryText);
    }

    // Текст для локального поиска
    const searchChunks = [
      v.category, v.reason, v.industry, v.company_name,
      Array.isArray(v.skills) ? v.skills.join(' ') : '',
      (v.text_highlighted || '').replace(/<[^>]+>/g,' ').replace(/\[\s*Изображение\s*\]\s*/gi,'')
    ].filter(Boolean);
    card.dataset.searchText = searchChunks.join(' ').toLowerCase();

    return card;
  }

  // -------- Рендер списка --------
  function ensureLoadMoreBtn(listEl, onClick) {
    return ensureLoadMore(listEl, onClick);
  }

  async function loadPage(categoryKey) {
    if (state.isLoading) return;
    state.isLoading = true;

    const listEl = containers[categoryKey];
    if (!listEl) { state.isLoading = false; return; }

    const page = state[categoryKey].page;
    try {
      const data = await fetchVacancies(categoryKey, page);
      const items = Array.isArray(data.items) ? data.items : [];
      state[categoryKey].total = Number(data.total || 0);

      if (!items.length && page === 0) {
        listEl.innerHTML = '';
        renderEmptyState(listEl, 'Ничего не найдено');
        updateCounters();
        updateSearchStats();
        state[categoryKey].done = true;
        updateLoadMore(listEl, false);
        return;
      }

      const frag = document.createDocumentFragment();
      items.forEach(v => frag.appendChild(renderCard(v)));
      listEl.appendChild(frag);

      state[categoryKey].page += 1;

      const hasMore = (listEl.querySelectorAll('.vacancy-card').length < state[categoryKey].total);
      const btn = ensureLoadMoreBtn(listEl, () => loadPage(categoryKey));
      updateLoadMore(listEl, hasMore);
      btn.textContent = hasMore ? 'Загрузить ещё' : 'Больше нет';

      updateCounters();
      applySearchFilter();

    } catch (e) {
      console.error('Ошибка загрузки:', e);
      renderError(listEl, 'Ошибка загрузки');
    } finally {
      state.isLoading = false;
    }
  }

  // -------- Слушатели --------
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.target;
      setActiveTab(key);
      if (!containers[key].children.length && !state[key].done) {
        loadPage(key);
      } else {
        applySearchFilter();
      }
    });
    // Долгий тап — очистить категорию
    let holdTimer = null;
    btn.addEventListener('mousedown', () => {
      holdTimer = setTimeout(() => {
        showConfirm(`Очистить вкладку «${btn.textContent.trim()}»?`, () => {
          containers[btn.dataset.target].innerHTML = '';
          state[btn.dataset.target] = { page: 0, total: 0, done: false };
          updateCounters();
          updateSearchStats();
        });
      }, 700);
    });
    ['mouseup','mouseleave'].forEach(ev => btn.addEventListener(ev, () => clearTimeout(holdTimer)));
  });

  function showConfirm(message, onOk) {
    if (!confirmOverlay) { if (window.confirm(message)) onOk?.(); return; }
    confirmText.textContent = message;
    confirmOverlay.classList.remove('hidden');
    confirmOkBtn.onclick = () => { confirmOverlay.classList.add('hidden'); onOk?.(); };
    confirmCancelBtn.onclick = () => { confirmOverlay.classList.add('hidden'); };
  }

  vacanciesContent?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'apply') {
      const url = btn.getAttribute('data-url') || '';
      openLink(url);
      return;
    }

    if (action === 'delete') {
      const card = btn.closest('.vacancy-card');
      if (card) {
        card.remove();
        updateCounters();
        updateSearchStats();
      }
      return;
    }
  });

  // Поиск
  searchInput?.addEventListener('input', debounce(applySearchFilter, 150));

  // Инициализация
  setActiveTab('main');
  loadPage('main');
})();
