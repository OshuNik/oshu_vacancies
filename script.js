// script.js — главная лента с пагинацией, поиском и «очисткой категории»

// --- Конфиг и утилиты
const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  PAGE_SIZE_MAIN = 10,
  RETRY_OPTIONS = { retries: 2, backoffMs: 400 },
  SEARCH_FIELDS = ['reason', 'text_highlighted', 'industry', 'company_name'],
} = (window.APP_CONFIG || {});

const {
  tg,
  escapeHtml,
  stripTags,
  debounce,
  highlightText,
  sanitizeUrl,
  openLink,
  formatTimestamp,
  containsImageMarker,
  cleanImageMarkers,
  pickImageUrl,
  getEmptyStateHtml,
  renderError,
  startProgress,
  finishProgress,
  resetProgress,
  fetchWithRetry,
} = (window.utils || {});

// --- Элементы страницы
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
const tabButtons     = document.querySelectorAll('.tab-button');
const vacancyLists   = document.querySelectorAll('.vacancy-list');
const searchInput    = document.getElementById('search-input');
const loader         = document.getElementById('loader');
const progressBar    = document.getElementById('progress-bar');
const vacanciesContent = document.getElementById('vacancies-content');
const headerActions  = document.getElementById('header-actions');
const searchContainer= document.getElementById('search-container');
const categoryTabs   = document.getElementById('category-tabs');

const confirmOverlay = document.getElementById('custom-confirm-overlay');
const confirmText    = document.getElementById('custom-confirm-text');
const confirmOkBtn   = document.getElementById('confirm-btn-ok');
const confirmCancelBtn = document.getElementById('confirm-btn-cancel');

// ---- helpers (локальные, не ломают твою utils)
const showConfirm = (message) => new Promise((resolve)=>{
  if (!confirmOverlay) return resolve(false);
  confirmText.textContent = message;
  confirmOverlay.classList.remove('hidden');
  const onOk = () => { cleanup(); resolve(true); };
  const onCancel = () => { cleanup(); resolve(false); };
  const cleanup = () => {
    confirmOverlay.classList.add('hidden');
    confirmOkBtn.removeEventListener('click', onOk);
    confirmCancelBtn.removeEventListener('click', onCancel);
  };
  confirmOkBtn.addEventListener('click', onOk);
  confirmCancelBtn.addEventListener('click', onCancel);
});

const setProgress = (pct=0) => { if (progressBar) progressBar.style.width = Math.max(0, Math.min(100, pct)) + '%'; };
const startPg = () => setProgress(5);
const finishPg = () => setTimeout(()=>setProgress(100), 0);
const resetPg = () => setTimeout(()=>setProgress(0), 200);

const getActiveList = () => document.querySelector('.vacancy-list.active');

// =========================
// Поиск (подсветка + счётчик)
// =========================
let searchStatsEl = null;
const ensureSearchUI = () => {
  if (!searchContainer || !searchInput) return;
  if (!searchStatsEl) {
    searchStatsEl = document.createElement('div');
    searchStatsEl.className = 'search-stats';
    searchContainer.appendChild(searchStatsEl);
  }
};
const updateSearchStats = () => {
  if (!searchStatsEl) return;
  const q = (searchInput?.value || '').trim();
  const active = getActiveList();
  const total = active ? active.querySelectorAll('.vacancy-card').length : 0;
  const visible = active ? [...active.querySelectorAll('.vacancy-card')].filter(el=>el.style.display !== 'none').length : 0;
  searchStatsEl.textContent = q ? (visible === 0 ? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`) : '';
};
window.updateSearchStats = updateSearchStats;

const applySearch = () => {
  const q = (searchInput?.value || '').trim();
  const active = getActiveList();
  if (!active) return;

  const cards = Array.from(active.querySelectorAll('.vacancy-card'));
  const total = cards.length;
  let visible = 0;

  cards.forEach(card => {
    const haystack = (card.dataset.searchText || card.textContent || '').toLowerCase();
    const match = q === '' || haystack.includes(q.toLowerCase());
    card.style.display = match ? '' : 'none';
    if (match) visible++;

    // подсветка
    const summaryEl = card.querySelector('.card-summary');
    const detailsEl = card.querySelector('.vacancy-text');
    if (summaryEl && summaryEl.dataset.originalSummary !== undefined) {
      summaryEl.innerHTML = (highlightText ? highlightText(summaryEl.dataset.originalSummary || '', q) : escapeHtml(summaryEl.dataset.originalSummary || ''));
    }
    if (detailsEl && detailsEl.dataset.originalText !== undefined) {
      const attachments = detailsEl.querySelector('.attachments');
      const textHtml = (highlightText ? highlightText(detailsEl.dataset.originalText || '', q) : escapeHtml(detailsEl.dataset.originalText || ''));
      detailsEl.innerHTML = (attachments ? attachments.outerHTML : '') + textHtml;
    }
  });

  // плашка "ничего не найдено"
  let emptyHint = active.querySelector('.search-empty-hint');
  if (total > 0 && visible === 0) {
    if (!emptyHint) {
      emptyHint = document.createElement('div');
      emptyHint.className = 'search-empty-hint';
      emptyHint.style.cssText = 'text-align:center;color:var(--hint-color);padding:30px 0;';
      emptyHint.textContent = '— Ничего не найдено —';
      active.appendChild(emptyHint);
    }
  } else if (emptyHint) {
    emptyHint.remove();
  }

  updateSearchStats();
};

// =========================
// API
// =========================
async function updateStatus(event, vacancyId, newStatus) {
  const cardElement = document.getElementById(`card-${vacancyId}`);
  if (!cardElement) return;
  const parentList = cardElement.parentElement;
  const categoryKey = Object.keys(containers).find(key => containers[key] === parentList);

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${vacancyId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ status: newStatus })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await r.json();

    cardElement.style.opacity = '0';
    cardElement.style.transform = 'scale(0.95)';
    setTimeout(() => {
      cardElement.remove();
      if (parentList && parentList.querySelectorAll('.vacancy-card').length === 0) {
        parentList.innerHTML = getEmptyStateHtml ? getEmptyStateHtml('-- Пусто в этой категории --') : '<p class="empty-list">-- Пусто --</p>';
      }
      const countSpan = categoryKey ? counts[categoryKey] : null;
      if (countSpan) {
        const currentCount = parseInt((countSpan.textContent || '0').replace(/\(|\)/g, '')) || 0;
        countSpan.textContent = `(${Math.max(0, currentCount - 1)})`;
      }
    }, 300);
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
    if (tg && tg.showAlert) tg.showAlert('Не удалось обновить статус.');
    cardElement.style.opacity = '1';
    cardElement.style.transform = 'scale(1)';
  }
}
window.updateStatus = updateStatus;

async function clearCategory(categoryName, key) {
  if (!categoryName) return;
  const ok = await showConfirm(`Вы уверены, что хотите удалить все из категории "${categoryName}"?`);
  if (!ok) return;

  const activeList = getActiveList();
  if (activeList) { activeList.querySelectorAll('.vacancy-card').forEach(card => card.style.opacity = '0'); }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?category=eq.${encodeURIComponent(categoryName)}&status=eq.new`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ status: 'deleted' })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    if (activeList) {
      activeList.innerHTML = getEmptyStateHtml ? getEmptyStateHtml('-- Пусто в этой категории --') : '<p class="empty-list">-- Пусто --</p>';
      const countSpan = key ? counts[key] : null;
      if (countSpan) countSpan.textContent = '(0)';
    }
  } catch (error) {
    console.error('Ошибка очистки категории:', error);
    if (tg && tg.showAlert) tg.showAlert('Не удалось очистить категорию.');
  }
}
window.clearCategory = clearCategory;

// =========================
// Рендер карточек
// =========================
function renderVacancies(container, vacancies) {
  if (!container) return;
  container.innerHTML = '';

  if (!vacancies || vacancies.length === 0) {
    container.innerHTML = getEmptyStateHtml ? getEmptyStateHtml('-- Пусто в этой категории --') : '<p class="empty-list">-- Пусто --</p>';
    return;
  }

  const q = (searchInput?.value || '').trim();

  for (const v of vacancies) {
    const card = document.createElement('div');
    card.className = 'vacancy-card';
    card.id = `card-${v.id}`;
    if (v.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
    else if (v.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
    else card.classList.add('category-other');

    const safeApply = sanitizeUrl ? sanitizeUrl(v.apply_url || '') : (v.apply_url || '');
    const applyIconHtml = safeApply ? `
      <button class="card-action-btn apply" onclick="openLink('${safeApply}')" aria-label="Откликнуться">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>` : '';

    const infoRows = [];
    const isValid = (val) => val && val !== 'null' && val !== 'не указано';

    const employment = isValid(v.employment_type) ? v.employment_type : '';
    const workFormat = isValid(v.work_format) ? v.work_format : '';
    const formatValue = [employment, workFormat].filter(Boolean).join(' / ');
    if (formatValue) infoRows.push({label: 'ФОРМАТ', value: formatValue, type: 'default'});

    if (isValid(v.salary_display_text)) {
      infoRows.push({label: 'ОПЛАТА', value: v.salary_display_text, type: 'salary'});
    }

    const industryText = isValid(v.industry) ? v.industry : '';
    const companyText = isValid(v.company_name) ? `(${v.company_name})` : '';
    const sphereValue = `${industryText} ${companyText}`.trim();
    if (sphereValue) infoRows.push({label: 'СФЕРА', value: sphereValue, type: 'industry'});

    let infoWindowHtml = '';
    if (infoRows.length > 0) {
      infoWindowHtml = '<div class="info-window">' + infoRows.map(row => {
        return `<div class="info-row info-row--${row.type}">
                  <div class="info-label">${escapeHtml ? escapeHtml(row.label) : row.label} >></div>
                  <div class="info-value">${escapeHtml ? escapeHtml(row.value) : row.value}</div>
                </div>`;
      }).join('') + '</div>';
    }

    const originalSummary = v.reason || 'Описание не было сгенерировано.';

    const originalDetailsRaw = v.text_highlighted ? stripTags(String(v.text_highlighted)) : '';
    const bestImageUrl = pickImageUrl ? pickImageUrl(v, originalDetailsRaw) : '';
    const cleanedDetailsText = bestImageUrl ? (cleanImageMarkers ? cleanImageMarkers(originalDetailsRaw) : originalDetailsRaw) : originalDetailsRaw;
    const attachmentsHTML = bestImageUrl ? `<div class="attachments"><a class="image-link-button" href="${bestImageUrl}" target="_blank" rel="noopener noreferrer">Изображение</a></div>` : '';
    const hasAnyDetails = Boolean(cleanedDetailsText) || Boolean(attachmentsHTML);
    const detailsHTML = hasAnyDetails ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>` : '';

    const channelHtml = isValid(v.channel) ? `<span class="channel-name">${escapeHtml ? escapeHtml(v.channel) : v.channel}</span>` : '';
    const timestampHtml = `<span class="timestamp-footer">${escapeHtml ? escapeHtml(formatTimestamp ? formatTimestamp(v.timestamp) : v.timestamp) : (formatTimestamp ? formatTimestamp(v.timestamp) : v.timestamp)}</span>`;
    const separator = channelHtml && timestampHtml ? ' • ' : '';
    const footerMetaHtml = `<div class="footer-meta">${channelHtml}${separator}${timestampHtml}</div>`;

    const cardHTML = `
      <div class="card-actions">
        ${applyIconHtml}
        <button class="card-action-btn favorite" onclick="updateStatus(event, '${v.id}', 'favorite')" aria-label="В избранное">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
        <button class="card-action-btn delete" onclick="updateStatus(event, '${v.id}', 'deleted')" aria-label="Удалить">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="card-header"><h3>${escapeHtml ? escapeHtml(v.category || 'NO_CATEGORY') : (v.category || 'NO_CATEGORY')}</h3></div>
      <div class="card-body">
        <p class="card-summary"></p>
        ${infoWindowHtml}
        ${detailsHTML}
      </div>
      <div class="card-footer">
        ${Array.isArray(v.skills) && v.skills.length ? `
          <div class="footer-skill-tags">
            ${v.skills.slice(0,3).map(s=>`<span class="footer-skill-tag">${escapeHtml ? escapeHtml(String(s)) : String(s)}</span>`).join('')}
          </div>` : ''
        }
        ${footerMetaHtml}
      </div>
    `;

    card.innerHTML = cardHTML;

    // searchable текст
    const searchChunks = [v.category, v.reason, industryText, v.company_name, Array.isArray(v.skills)?v.skills.join(' '):'', cleanedDetailsText].filter(Boolean);
    card.dataset.searchText = searchChunks.join(' ').toLowerCase();

    const summaryEl = card.querySelector('.card-summary');
    if (summaryEl) {
      summaryEl.dataset.originalSummary = originalSummary;
      summaryEl.innerHTML = (highlightText ? highlightText(originalSummary, q) : escapeHtml ? escapeHtml(originalSummary) : originalSummary);
    }

    const detailsEl = card.querySelector('.vacancy-text');
    if (detailsEl) {
      detailsEl.dataset.originalText = cleanedDetailsText;
      const textHtml = (highlightText ? highlightText(cleanedDetailsText, q) : escapeHtml ? escapeHtml(cleanedDetailsText) : cleanedDetailsText);
      detailsEl.innerHTML = attachmentsHTML + textHtml;
    }

    container.appendChild(card);
  }
}

// =========================
// Загрузка вакансий
// =========================
async function loadVacancies() {
  ensureSearchUI();

  headerActions?.classList.add('hidden');
  vacanciesContent?.classList.add('hidden');
  searchContainer?.classList.add('hidden');
  categoryTabs?.classList.add('hidden');

  startPg();
  loader?.classList.remove('hidden');

  try {
    const url = `${SUPABASE_URL}/rest/v1/vacancies?status=eq.new&select=*`;
    const r = await fetchWithRetry ? fetchWithRetry(url, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    }, RETRY_OPTIONS.retries, RETRY_OPTIONS.backoffMs) : fetch(url, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!r.ok) throw new Error(`Ошибка сети: ${r.statusText}`);
    const items = await r.json();
    finishPg();

    Object.values(containers).forEach(c => { if (c) c.innerHTML = ''; });

    if (!items || items.length === 0) {
      containers.main.innerHTML = getEmptyStateHtml ? getEmptyStateHtml('Новых вакансий нет') : '<p class="empty-list">Новых вакансий нет</p>';
    } else {
      items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const mainVacancies  = items.filter(item => item.category === 'ТОЧНО ТВОЁ');
      const maybeVacancies = items.filter(item => item.category === 'МОЖЕТ БЫТЬ');
      const otherVacancies = items.filter(item => !['ТОЧНО ТВОЁ', 'МОЖЕТ БЫТЬ'].includes(item.category));

      counts.main.textContent  = `(${mainVacancies.length})`;
      counts.maybe.textContent = `(${maybeVacancies.length})`;
      counts.other.textContent = `(${otherVacancies.length})`;

      renderVacancies(containers.main,  mainVacancies);
      renderVacancies(containers.maybe, maybeVacancies);
      renderVacancies(containers.other, otherVacancies);
    }

    setTimeout(() => {
      loader?.classList.add('hidden');
      vacanciesContent?.classList.remove('hidden');
      headerActions?.classList.remove('hidden');
      categoryTabs?.classList.remove('hidden');
      if (items && items.length > 0) searchContainer?.classList.remove('hidden');

      // после первичной отрисовки — синхронизировать видимость вкладок
      if (typeof syncListsVisibility === 'function') syncListsVisibility();

      applySearch();
      resetPg();
      document.dispatchEvent(new CustomEvent('vacancies:loaded'));
    }, 250);

  } catch (error) {
    console.error('Ошибка загрузки:', error);
    loader.innerHTML = renderError ? renderError(error.message) : `<p class="empty-list">Ошибка: ${escapeHtml ? escapeHtml(error.message) : error.message}</p>`;
    setProgress(100);
    resetPg();
    document.dispatchEvent(new CustomEvent('vacancies:loaded'));
  }
}

// =========================
// Переключение вкладок (фикс)
// =========================
function syncListsVisibility() {
  const act = getActiveList();
  vacancyLists.forEach(list => {
    const on = (list === act);
    list.style.display = on ? '' : 'none';
  });
  // Переносим "Загрузить ещё" (если используется) в конец активного списка
  if (act) {
    const wrap = act.querySelector('.load-more-wrap');
    if (wrap && wrap.parentElement !== act) act.appendChild(wrap);
  }
}
window.syncListsVisibility = syncListsVisibility;

(function bindTabsFix(){
  tabButtons.forEach((button) => {
    if (button.dataset.tabsBound === '1') return;
    button.dataset.tabsBound = '1';

    const activateTab = () => {
      const targetId = button?.dataset?.target;
      if (!targetId) return;

      tabButtons.forEach(b => b.classList.remove('active'));
      button.classList.add('active');

      vacancyLists.forEach(list => {
        const on = (list.id === targetId);
        list.classList.toggle('active', on);
      });

      syncListsVisibility();
      updateSearchStats();
    };

    // Клик по табу — только наш обработчик (capture + stopImmediatePropagation)
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      activateTab();
    }, true);

    // Двойной тап — очистка активной категории
    let lastTap = 0;
    button.addEventListener('click', () => {
      const now = Date.now();
      if (button.classList.contains('active') && (now - lastTap) < 400) {
        const name = button.dataset.categoryName;
        const key =
          button.classList.contains('main')  ? 'main'  :
          button.classList.contains('maybe') ? 'maybe' : 'other';
        clearCategory(name, key);
      }
      lastTap = now;
    });

    // Долгий тап — очистка активной категории
    let pressTimer = null;
    const startPress = () => {
      pressTimer = window.setTimeout(() => {
        const name = button.dataset.categoryName;
        const key =
          button.classList.contains('main')  ? 'main'  :
          button.classList.contains('maybe') ? 'maybe' : 'other';
        clearCategory(name, key);
      }, 800);
    };
    const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };

    button.addEventListener('mousedown', startPress);
    button.addEventListener('mouseup',   cancelPress);
    button.addEventListener('mouseleave',cancelPress);
    button.addEventListener('touchstart',startPress, { passive: true });
    button.addEventListener('touchend',  cancelPress);
    button.addEventListener('touchcancel', cancelPress);
  });

  // при старте — привести DOM к одному активному списку
  syncListsVisibility();

  // после обновлений данных
  document.addEventListener('vacancies:loaded', syncListsVisibility);
})();

// =========================
// Слушатели
// =========================
searchInput?.addEventListener('input', debounce ? debounce(applySearch, 250) : applySearch);

// Первичная загрузка
ensureSearchUI();
loadVacancies();
