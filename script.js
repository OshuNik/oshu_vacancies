// script.js — вкладки + поиск + постраничная загрузка + действия по карточкам
// Важно: опирается на window.APP_CONFIG и window.utils

(function () {
  'use strict';

  // ==== Конфиг/утилиты из глобала ====
  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    PAGE_SIZE_MAIN,
    RETRY_OPTIONS,
    SEARCH_FIELDS,
  } = window.APP_CONFIG || {};

  const {
    escapeHtml,
    stripTags,
    debounce,
    highlightText,
    safeAlert,
    formatTimestamp,
    sanitizeUrl,
    openLink,
    containsImageMarker,
    cleanImageMarkers,
    pickImageUrl,
    fetchWithRetry,
    renderEmptyState,
    renderError,
    ensureLoadMore,
    updateLoadMore,
  } = window.utils || {};

  // ==== DOM ====
  const containers = {
    main: document.getElementById('vacancies-list-main'),
    maybe: document.getElementById('vacancies-list-maybe'),
    other: document.getElementById('vacancies-list-other'),
  };

  const counts = {
    main: document.getElementById('count-main'),
    maybe: document.getElementById('count-maybe'),
    other: document.getElementById('count-other'),
  };

  const tabButtons = document.querySelectorAll('.tab-button'); // data-tab="main|maybe|other"
  const searchInput = document.getElementById('search-input');
  const searchContainer = document.getElementById('search-container');
  const vacanciesContent = document.getElementById('vacancies-content');

  // Кастомный confirm
  const confirmOverlay = document.getElementById('custom-confirm-overlay');
  const confirmText = document.getElementById('custom-confirm-text');
  const confirmOkBtn = document.getElementById('confirm-btn-ok');
  const confirmCancelBtn = document.getElementById('confirm-btn-cancel');

  function showCustomConfirm(message) {
    return new Promise((res) => {
      if (!confirmOverlay) return res(window.confirm(message));
      confirmText.textContent = message;
      confirmOverlay.classList.remove('hidden');
      const close = () => {
        confirmOverlay.classList.add('hidden');
        confirmOkBtn.onclick = null;
        confirmCancelBtn.onclick = null;
      };
      confirmOkBtn.onclick = () => {
        close();
        res(true);
      };
      confirmCancelBtn.onclick = () => {
        close();
        res(false);
      };
    });
  }

  // ==== Состояние ====
  const CAT_NAME = { main: 'ТОЧНО ТВОЁ', maybe: 'МОЖЕТ БЫТЬ' };

  let currentController = null;

  const state = {
    query: '',
    main: { offset: 0, total: 0, busy: false, loadedOnce: false },
    maybe: { offset: 0, total: 0, busy: false, loadedOnce: false },
    other: { offset: 0, total: 0, busy: false, loadedOnce: false },
    activeKey: 'main',
  };

  // ==== Статистика поиска ====
  let searchStatsEl = null;
  function ensureSearchUI() {
    if (!searchContainer || !searchInput) return;
    if (!searchStatsEl) {
      searchStatsEl = document.createElement('div');
      searchStatsEl.className = 'search-stats';
      searchContainer.appendChild(searchStatsEl);
    }
  }
  function updateSearchStats() {
    ensureSearchUI();
    const activeList = containers[state.activeKey];
    if (!activeList) {
      if (searchStatsEl) searchStatsEl.textContent = '';
      return;
    }
    const visible = activeList.querySelectorAll('.vacancy-card').length;
    const total = state[state.activeKey].total || visible;
    const q = (searchInput?.value || '').trim();
    searchStatsEl.textContent = q
      ? visible === 0
        ? 'Ничего не найдено'
        : `Найдено: ${visible} из ${total}`
      : '';
  }

  // ==== Помощники ====
  function abortCurrent() {
    if (currentController) {
      try {
        currentController.abort();
      } catch {}
      currentController = null;
    }
    currentController = new AbortController();
    return currentController;
  }

  function clearContainer(el) {
    if (!el) return;
    const lm = el.querySelector('.load-more-wrap');
    el.innerHTML = '';
    if (lm) el.appendChild(lm);
  }

  function resetCategory(key) {
    state[key].offset = 0;
    state[key].total = 0;
    state[key].busy = false;
    clearContainer(containers[key]);
    updateLoadMore(containers[key], false);
  }

  // ГЛАВНЫЙ ФИКС ВКЛАДОК: показываем только активный список, остальные скрываем
  function activateList(key) {
    state.activeKey = key;

    // Скрыть все списки
    Object.keys(containers).forEach((k) => {
      const list = containers[k];
      if (!list) return;
      list.classList.remove('active');
      list.classList.add('hidden'); // гарантированное скрытие
      list.style.display = 'none';
    });

    // Показать нужный
    const target = containers[key];
    if (target) {
      target.classList.add('active');
      target.classList.remove('hidden');
      target.style.display = ''; // сброс в норму (упирается в CSS)
    }

    // Подсветка кнопок
    tabButtons.forEach((btn) => {
      const isActive = btn?.dataset?.tab === key;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Обновить стату
    updateSearchStats();

    // Подгрузить первую порцию, если ещё не грузили
    if (!state[key].loadedOnce) {
      fetchNext(key);
    }
  }

  function buildCategoryUrl(key, limit, offset, query) {
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('order', 'timestamp.desc');
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    params.set('status', 'eq.new');

    if (key === 'main') {
      params.set('category', `eq.${CAT_NAME.main}`);
    } else if (key === 'maybe') {
      params.set('category', `eq.${CAT_NAME.maybe}`);
    } else {
      // всё остальное
      // PostgREST: not.in.(...)
      params.set(
        'category',
        `not.in.("${CAT_NAME.main}","${CAT_NAME.maybe}")`
      );
    }

    const q = (query || '').trim();
    if (q && Array.isArray(SEARCH_FIELDS) && SEARCH_FIELDS.length) {
      const orExpr =
        '(' + SEARCH_FIELDS.map((f) => `${f}.ilike.*${q}*`).join(',') + ')';
      params.set('or', orExpr);
    }

    return `${SUPABASE_URL}/rest/v1/vacancies?${params.toString()}`;
  }

  function parseTotal(resp) {
    const cr = resp.headers.get('content-range'); // "0-9/58"
    if (!cr || !cr.includes('/')) return 0;
    const total = cr.split('/').pop();
    return Number(total) || 0;
  }

  // ==== Построение карточки ====
  function buildCard(v) {
    const card = document.createElement('div');
    card.className = 'vacancy-card';
    card.id = `card-${v.id}`;

    if (v.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
    else if (v.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
    else card.classList.add('category-other');

    const isValid = (val) => val && val !== 'null' && val !== 'не указано';

    // Верх: кнопки
    const applyBtn = v.apply_url
      ? `<button class="card-action-btn apply" data-action="apply" data-url="${escapeHtml(
          sanitizeUrl(v.apply_url)
        )}" aria-label="Откликнуться">
           <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
         </button>`
      : '';

    // Info-rows (формат/оплата/сфера)
    const infoRows = [];
    const fmt = [v.employment_type, v.work_format].filter(Boolean).join(' / ');
    if (fmt) infoRows.push({ label: 'ФОРМАТ', value: fmt, type: 'default' });
    if (isValid(v.salary_display_text))
      infoRows.push({
        label: 'ОПЛАТА',
        value: v.salary_display_text,
        type: 'salary',
      });
    const sphereText = isValid(v.industry)
      ? v.industry
      : (v.sphere || '').trim();
    if (sphereText)
      infoRows.push({
        label: 'СФЕРА',
        value: sphereText,
        type: 'industry',
      });

    let infoWindowHtml = '';
    if (infoRows.length) {
      infoWindowHtml =
        '<div class="info-window">' +
        infoRows
          .map(
            (r) => `
        <div class="info-row info-row--${r.type}">
          <div class="info-label">${escapeHtml(r.label)} >></div>
          <div class="info-value">${escapeHtml(r.value)}</div>
        </div>`
          )
          .join('') +
        '</div>';
    }

    // Текст и вложения
    const q = state.query;
    const summaryText = v.reason || 'Описание не было сгенерировано.';
    const originalDetailsRaw = v.text_highlighted
      ? stripTags(String(v.text_highlighted))
      : '';

    const bestImageUrl = pickImageUrl(v, originalDetailsRaw);
    const cleanedDetailsText = bestImageUrl
      ? cleanImageMarkers(originalDetailsRaw)
      : originalDetailsRaw;

    const attachmentsHTML = bestImageUrl
      ? `<div class="attachments"><a class="image-link-button" href="${bestImageUrl}" target="_blank" rel="noopener noreferrer">Изображение</a></div>`
      : '';
    const hasAnyDetails = Boolean(cleanedDetailsText) || Boolean(attachmentsHTML);
    const detailsHTML = hasAnyDetails
      ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>`
      : '';

    // Футер: теги-скиллы (top-3) + мета
    let skillsFooterHtml = '';
    if (Array.isArray(v.skills) && v.skills.length > 0) {
      skillsFooterHtml = `<div class="footer-skill-tags">
        ${v.skills
          .slice(0, 3)
          .map(
            (s) =>
              `<span class="footer-skill-tag">${escapeHtml(String(s))}</span>`
          )
          .join('')}
      </div>`;
    }

    const channelHtml = v.channel
      ? `<span class="channel-name">${escapeHtml(v.channel)}</span>`
      : '';
    const timestampHtml = `<span class="timestamp-footer">${escapeHtml(
      formatTimestamp(v.timestamp)
    )}</span>`;
    const sep = channelHtml && timestampHtml ? ' • ' : '';
    const footerMetaHtml = `<div class="footer-meta">${channelHtml}${sep}${timestampHtml}</div>`;

    card.innerHTML = `
      <div class="card-actions">
        ${applyBtn}
        <button class="card-action-btn favorite" data-action="favorite" data-id="${v.id}" aria-label="В избранное">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
        <button class="card-action-btn delete" data-action="delete" data-id="${v.id}" aria-label="Удалить">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div class="card-header"><h3>${escapeHtml(
        v.category || 'NO_CATEGORY'
      )}</h3></div>

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

    // Вставим подсвеченные тексты
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

  // ==== Действия по карточкам (делегирование) ====
  vacanciesContent?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'apply') openLink(btn.dataset.url);
    if (action === 'favorite') updateStatus(btn.dataset.id, 'favorite');
    if (action === 'delete') updateStatus(btn.dataset.id, 'deleted');
  });

  async function updateStatus(id, newStatus) {
    if (!id) return;
    const ok = await showCustomConfirm(
      newStatus === 'deleted'
        ? 'Удалить вакансию из ленты?'
        : 'Добавить вакансию в избранное?'
    );
    if (!ok) return;

    try {
      const url = `${SUPABASE_URL}/rest/v1/vacancies?id=eq.${encodeURIComponent(
        id
      )}`;
      const resp = await fetchWithRetry(
        url,
        {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({ status: newStatus }),
        },
        RETRY_OPTIONS
      );
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      // Удаляем карточку из всех списков, если она есть
      document.querySelectorAll(`#card-${CSS.escape(id)}`).forEach((el) => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 150);
      });

      // Обновим счётчик активной вкладки
      const k = state.activeKey;
      if (state[k].total > 0) state[k].total -= 1;
      const c = counts[k];
      if (c) c.textContent = `(${state[k].total})`;
      updateSearchStats();
    } catch (err) {
      console.error(err);
      safeAlert('Не удалось выполнить действие. Повторите позже.');
    }
  }

  // ==== Загрузка порций ====
  async function fetchNext(key) {
    const st = state[key];
    const container = containers[key];
    if (!container || st.busy) return;
    st.busy = true;

    const url = buildCategoryUrl(
      key,
      PAGE_SIZE_MAIN || 20,
      st.offset,
      state.query
    );

    const controller = abortCurrent();

    try {
      const resp = await fetchWithRetry(
        url,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            Prefer: 'count=exact',
          },
          signal: controller.signal,
        },
        RETRY_OPTIONS
      );
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      const total = parseTotal(resp);
      if (Number.isFinite(total)) {
        st.total = total;
        if (counts[key]) counts[key].textContent = `(${total})`;
      }

      const items = await resp.json();
      const frag = document.createDocumentFragment();
      for (const it of items) frag.appendChild(buildCard(it));
      container.appendChild(frag);

      // Кнопка "Ещё"
      const { btn } = ensureLoadMore(container, () => fetchNext(key));
      st.offset += items.length;
      const hasMore = st.offset < st.total;
      updateLoadMore(container, hasMore);
      if (btn) btn.disabled = !hasMore;

      if (st.total === 0 && st.offset === 0) {
        renderEmptyState(container, '-- Пусто в этой категории --');
        updateLoadMore(container, false);
      }

      // Обновим счётчик поиска, если это активный список
      if (state.activeKey === key) updateSearchStats();

      st.loadedOnce = true;
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error('Load error:', e);
      renderError(container, e.message, () => fetchNext(key));
    } finally {
      st.busy = false;
    }
  }

  // ==== Поиск ====
  const onSearch = debounce(() => {
    state.query = (searchInput?.value || '').trim();

    // Полный мягкий сброс активной вкладки
    Object.keys(containers).forEach((k) => resetCategory(k));

    // Грузим заново только активную
    fetchNext(state.activeKey);
    updateSearchStats();
  }, 300);

  searchInput?.addEventListener('input', onSearch);

  // ==== Вкладки ====
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.tab;
      if (!key || !containers[key]) return;
      if (state.activeKey === key) return; // уже активна
      activateList(key);
    });
  });

  // ==== Инициализация ====
  function init() {
    // Гарантированно скрыть "неактивные" списки перед стартом
    Object.keys(containers).forEach((k) => {
      if (k !== state.activeKey) {
        containers[k]?.classList.add('hidden');
        if (containers[k]) containers[k].style.display = 'none';
      }
    });

    // Подсветим активную кнопку
    tabButtons.forEach((btn) => {
      const isActive = btn?.dataset?.tab === state.activeKey;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Загрузим первую вкладку
    activateList(state.activeKey);
  }

  // Старт
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
