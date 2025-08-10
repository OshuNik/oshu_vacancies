// script.js — главная лента с пагинацией, поиском и «очисткой категории»

// --- Конфиг и утилиты
const { SUPABASE_URL, SUPABASE_ANON_KEY, PAGE_SIZE } = window.config;
const {
  tg, escapeHtml, stripTags, debounce, highlightText, sanitizeUrl, openLink,
  formatTimestamp, containsImageMarker, cleanImageMarkers, pickImageUrl,
  getEmptyStateHtml, renderError,
  startProgress, finishProgress, resetProgress, ensureLoadMore, showCustomConfirm,
  fetchWithRetry
} = window.utils;

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

// Статистика поиска под строкой
let searchStatsEl = null;
const ensureSearchStats = () => {
  if (!searchContainer || !searchInput) return;
  if (!searchStatsEl) {
    searchStatsEl = document.createElement('div');
    searchStatsEl.className = 'search-stats';
    searchContainer.appendChild(searchStatsEl);
  }
};
const updateSearchStats = (visible, total) => {
  if (!searchStatsEl) return;
  const q = (searchInput?.value || '').trim();
  if (!q) { searchStatsEl.textContent = ''; return; }
  searchStatsEl.textContent = visible === 0 ? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`;
};

// Кнопка «Загрузить ещё» — одна на всё приложение, всегда перемещаем в конец активного списка
const loadMoreBtn = document.createElement('button');
loadMoreBtn.className = 'load-more-btn';
loadMoreBtn.textContent = 'Загрузить ещё';
const loadMoreWrap = document.createElement('div');
loadMoreWrap.className = 'load-more-wrap';
loadMoreWrap.appendChild(loadMoreBtn);

// --- Состояние
const state = {
  all:   { main: [], maybe: [], other: [] },
  page:  { main: 0,  maybe: 0,  other: 0  },
  pageSize: PAGE_SIZE
};

// --- Рендер карточки
function buildCard(v) {
  const card = document.createElement('div');
  card.className = 'vacancy-card';
  card.id = `card-${v.id}`;
  if (v.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
  else if (v.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
  else card.classList.add('category-other');

  const isValid = (val) => val && val !== 'null' && val !== 'не указано';

  // Кнопки действий
  let applyIconHtml = '';
  const safeApply = sanitizeUrl(v.apply_url || '');
  if (safeApply) {
    applyIconHtml = `
      <button class="card-action-btn apply" onclick="window.__openLink('${safeApply}')" aria-label="Откликнуться">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>`;
  }

  const infoRows = [];
  const employment = isValid(v.employment_type) ? v.employment_type : '';
  const workFormat = isValid(v.work_format) ? v.work_format : '';
  const formatValue = [employment, workFormat].filter(Boolean).join(' / ');
  if (formatValue) infoRows.push({label: 'ФОРМАТ', value: formatValue, type: 'default'});
  if (isValid(v.salary_display_text)) infoRows.push({label: 'ОПЛАТА', value: v.salary_display_text, type: 'salary'});

  const industryText = isValid(v.industry) ? v.industry : '';
  const companyText  = isValid(v.company_name) ? `(${v.company_name})` : '';
  const sphereValue  = `${industryText} ${companyText}`.trim();
  if (sphereValue) infoRows.push({label: 'СФЕРА', value: sphereValue, type: 'industry'});

  let infoWindowHtml = '';
  if (infoRows.length > 0) {
    infoWindowHtml =
      '<div class="info-window">' +
      infoRows.map(row =>
        `<div class="info-row info-row--${row.type}">
           <div class="info-label">${escapeHtml(row.label)} >></div>
           <div class="info-value">${escapeHtml(row.value)}</div>
         </div>`).join('') +
      '</div>';
  }

  const originalSummary = v.reason || 'Описание не было сгенерировано.';
  const q = (searchInput?.value || '').trim();

  const originalDetailsRaw = v.text_highlighted ? stripTags(String(v.text_highlighted)) : '';
  const bestImageUrl = pickImageUrl(v, originalDetailsRaw);
  const cleanedDetailsText = bestImageUrl ? cleanImageMarkers(originalDetailsRaw) : originalDetailsRaw;
  const attachmentsHTML = bestImageUrl
    ? `<div class="attachments">
         <a class="image-link-button" href="${bestImageUrl}" target="_blank" rel="noopener noreferrer">Изображение</a>
       </div>`
    : '';

  const hasAnyDetails = Boolean(cleanedDetailsText) || Boolean(attachmentsHTML);
  const detailsHTML = hasAnyDetails
    ? `<details><summary>Показать полный текст</summary>
         <div class="vacancy-text" style="margin-top:10px;"></div>
       </details>`
    : '';

  const channelHtml   = isValid(v.channel) ? `<span class="channel-name">${escapeHtml(v.channel)}</span>` : '';
  const timestampHtml = `<span class="timestamp-footer">${escapeHtml(formatTimestamp(v.timestamp))}</span>`;
  const separator = channelHtml && timestampHtml ? ' • ' : '';
  const footerMetaHtml = `<div class="footer-meta">${channelHtml}${separator}${timestampHtml}</div>`;

  card.innerHTML = `
    <div class="card-actions">
      ${applyIconHtml}
      <button class="card-action-btn favorite" onclick="window.__updateStatus(event, '${v.id}', 'favorite')" aria-label="В избранное">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </button>
      <button class="card-action-btn delete" onclick="window.__updateStatus(event, '${v.id}', 'deleted')" aria-label="Удалить">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
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
      ${footerMetaHtml}
    </div>`;

  // Текст и подсветка
  const summaryEl = card.querySelector('.card-summary');
  if (summaryEl) {
    summaryEl.dataset.originalSummary = originalSummary;
    summaryEl.innerHTML = highlightText(originalSummary, q);
  }
  const detailsEl = card.querySelector('.vacancy-text');
  if (detailsEl) {
    detailsEl.dataset.originalText = cleanedDetailsText;
    const textHtml = highlightText(cleanedDetailsText, q);
    detailsEl.innerHTML = attachmentsHTML + textHtml;
  }

  // Данные для быстрого поиска
  const searchChunks = [
    v.category, v.reason, industryText, v.company_name,
    cleanedDetailsText
  ].filter(Boolean);
  card.dataset.searchText = searchChunks.join(' ').toLowerCase();

  return card;
}

// --- API
window.__openLink = openLink;

window.__updateStatus = async (event, vacancyId, newStatus) => {
  const cardElement = document.getElementById(`card-${vacancyId}`);
  if (!cardElement) return;
  const parentList = cardElement.parentElement;
  const categoryKey = Object.keys(containers).find(key => containers[key] === parentList);

  try {
    const r = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${vacancyId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ status: newStatus })
    });
    await r.json();

    cardElement.style.opacity = '0';
    cardElement.style.transform = 'scale(0.95)';
    setTimeout(() => {
      cardElement.remove();
      // Обновим счётчик
      if (categoryKey) {
        const span = counts[categoryKey];
        const current = parseInt((span.textContent || '0').replace(/\(|\)/g, '')) || 0;
        span.textContent = `(${Math.max(0, current - 1)})`;
      }
      // Переустановим кнопку «Загрузить ещё»
      const activeList = document.querySelector('.vacancy-list.active');
      ensureLoadMore(activeList, loadMoreWrap);
    }, 300);
  } catch (e) {
    console.error('Ошибка обновления статуса:', e);
    tg?.showAlert && tg.showAlert('Не удалось обновить статус.');
    cardElement.style.opacity = '1';
    cardElement.style.transform = 'scale(1)';
  }
};

async function clearCategory(categoryName) {
  if (!categoryName) return;
  showCustomConfirm(`Вы уверены, что хотите удалить все из категории "${categoryName}"?`, async (isConfirmed) => {
    if (!isConfirmed) return;
    const activeList = document.querySelector('.vacancy-list.active');
    if (activeList) { activeList.querySelectorAll('.vacancy-card').forEach(card => card.style.opacity = '0'); }
    try {
      const r = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/vacancies?category=eq.${encodeURIComponent(categoryName)}&status=eq.new`, {
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
        activeList.innerHTML = getEmptyStateHtml('-- Пусто в этой категории --');
        const key = Object.keys(containers).find(k => containers[k] === activeList);
        if (key) counts[key].textContent = '(0)';
      }
    } catch (e) {
      console.error('Ошибка очистки категории:', e);
      tg?.showAlert && tg.showAlert('Не удалось очистить категорию.');
    }
  });
}

// --- Рендер порций
function renderNextPortion(key) {
  const listEl = containers[key];
  const items = state.all[key];
  const start = state.page[key] * state.pageSize;
  const end   = Math.min(start + state.pageSize, items.length);
  const frag  = document.createDocumentFragment();
  for (let i = start; i < end; i++) {
    frag.appendChild(buildCard(items[i]));
  }
  if (start === 0) listEl.innerHTML = '';
  listEl.appendChild(frag);
  state.page[key]++;

  // Показ/скрытие кнопки
  const hasMore = end < items.length;
  loadMoreWrap.style.display = hasMore ? '' : 'none';
  const activeList = document.querySelector('.vacancy-list.active');
  ensureLoadMore(activeList, loadMoreWrap);
}

// --- Поиск по активной вкладке
const applySearch = () => {
  const q = (searchInput?.value || '').trim();
  const activeList = document.querySelector('.vacancy-list.active');
  if (!activeList) return;

  const cards = Array.from(activeList.querySelectorAll('.vacancy-card'));
  const total = cards.length; let visible = 0;

  cards.forEach(card => {
    const haystack = (card.dataset.searchText || card.textContent || '').toLowerCase();
    const match = q === '' || haystack.includes(q.toLowerCase());
    card.style.display = match ? '' : 'none';
    if (match) visible++;

    const summaryEl = card.querySelector('.card-summary');
    const detailsEl = card.querySelector('.vacancy-text');
    if (summaryEl && summaryEl.dataset.originalSummary !== undefined) {
      summaryEl.innerHTML = highlightText(summaryEl.dataset.originalSummary || '', q);
    }
    if (detailsEl && detailsEl.dataset.originalText !== undefined) {
      const attachments = detailsEl.querySelector('.attachments');
      const textHtml = highlightText(detailsEl.dataset.originalText || '', q);
      detailsEl.innerHTML = (attachments ? attachments.outerHTML : '') + textHtml;
    }
  });

  // Плашка «ничего не найдено» (если карточки есть, но все скрыты)
  let emptyHint = activeList.querySelector('.search-empty-hint');
  if (total > 0 && visible === 0) {
    if (!emptyHint) {
      emptyHint = document.createElement('div');
      emptyHint.className = 'search-empty-hint';
      emptyHint.style.cssText = 'text-align:center;color:var(--hint-color);padding:30px 0;';
      emptyHint.textContent = '— Ничего не найдено —';
      activeList.appendChild(emptyHint);
    }
  } else if (emptyHint) {
    emptyHint.remove();
  }

  // Если идёт фильтр — «Загрузить ещё» прячем
  loadMoreWrap.style.display = (q && q.length > 0) ? 'none' : loadMoreWrap.style.display;
  updateSearchStats(visible, total);
};

// --- Загрузка вакансий
async function loadVacancies() {
  ensureSearchStats();
  headerActions.classList.add('hidden');
  vacanciesContent.classList.add('hidden');
  searchContainer.classList.add('hidden');
  categoryTabs.classList.add('hidden');

  startProgress(progressBar);
  loader.classList.remove('hidden');

  try {
    const fields = [
      'id','category','reason','employment_type','work_format','industry','company_name',
      'skills','text_highlighted','apply_url','message_link','image_link','has_image',
      'channel','timestamp'
    ].join(',');

    const url = `${SUPABASE_URL}/rest/v1/vacancies?status=eq.new&select=${fields}`;
    const response = await fetchWithRetry(url, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });

    const items = await response.json();
    finishProgress(progressBar);

    Object.values(containers).forEach(c => c.innerHTML = '');

    if (!items || items.length === 0) {
      containers.main.innerHTML = getEmptyStateHtml('Новых вакансий нет');
      // Спрячем кнопку
      loadMoreWrap.style.display = 'none';
    } else {
      items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      state.all.main  = items.filter(i => i.category === 'ТОЧНО ТВОЁ');
      state.all.maybe = items.filter(i => i.category === 'МОЖЕТ БЫТЬ');
      state.all.other = items.filter(i => !['ТОЧНО ТВОЁ','МОЖЕТ БЫТЬ'].includes(i.category));
      state.page.main = state.page.maybe = state.page.other = 0;

      counts.main.textContent  = `(${state.all.main.length})`;
      counts.maybe.textContent = `(${state.all.maybe.length})`;
      counts.other.textContent = `(${state.all.other.length})`;

      // По умолчанию активна первая вкладка (ТОЧНО ТВОЁ)
      renderNextPortion('main');
    }

    setTimeout(() => {
      loader.classList.add('hidden');
      vacanciesContent.classList.remove('hidden');
      headerActions.classList.remove('hidden');
      categoryTabs.classList.remove('hidden');
      if (items && items.length > 0) searchContainer.classList.remove('hidden');

      // Привяжем кнопку под активным списком
      const activeList = document.querySelector('.vacancy-list.active') || containers.main;
      ensureLoadMore(activeList, loadMoreWrap);

      applySearch();
      resetProgress(progressBar);
      document.dispatchEvent(new CustomEvent('vacancies:loaded'));
    }, 200);

  } catch (error) {
    console.error('Ошибка загрузки:', error);
    loader.innerHTML = renderError(error.message || error);
    resetProgress(progressBar);
    document.dispatchEvent(new CustomEvent('vacancies:loaded'));
  }
}

// --- Слушатели вкладок (включая долгое нажатие — очистка)
tabButtons.forEach(button => {
  let pressTimer = null;
  let longPressTriggered = false;

  const startPress = () => {
    longPressTriggered = false;
    pressTimer = window.setTimeout(() => {
      longPressTriggered = true;
      const categoryName = button.dataset.categoryName;
      clearCategory(categoryName);
    }, 800);
  };
  const cancelPress = (e) => {
    clearTimeout(pressTimer);
    if (longPressTriggered) { e.preventDefault(); }
  };
  const handleClick = () => {
    if (longPressTriggered) return;

    tabButtons.forEach(btn => btn.classList.remove('active'));
    vacancyLists.forEach(list => list.classList.remove('active'));

    button.classList.add('active');
    const targetEl = document.getElementById(button.dataset.target);
    targetEl.classList.add('active');

    // Отрендерить след. порцию для выбранной вкладки (если она ещё пустая)
    const key = Object.keys(containers).find(k => containers[k].id === button.dataset.target);
    if (state.page[key] === 0) renderNextPortion(key);

    // Переместить кнопку под активный список
    ensureLoadMore(targetEl, loadMoreWrap);

    // Применить текущий поиск к новому списку
    applySearch();
  };

  button.addEventListener('mousedown', startPress);
  button.addEventListener('mouseup', cancelPress);
  button.addEventListener('mouseleave', cancelPress);
  button.addEventListener('touchstart', startPress, { passive: true });
  button.addEventListener('touchend', cancelPress);
  button.addEventListener('touchcancel', cancelPress);
  button.addEventListener('click', handleClick);
});

// Поиск
searchInput?.addEventListener('input', debounce(applySearch, 200));

// Клик по «Загрузить ещё»
loadMoreBtn.addEventListener('click', () => {
  const activeList = document.querySelector('.vacancy-list.active');
  const key = Object.keys(containers).find(k => containers[k] === activeList) || 'main';
  renderNextPortion(key);
});

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  // Сделаем «ТОЧНО ТВОЁ» активной по умолчанию
  document.querySelector('.tab-button.main')?.classList.add('active');
  containers.main?.classList.add('active');
  // Вставим кнопку «Загрузить ещё» под активный список
  ensureLoadMore(containers.main, loadMoreWrap);
});

loadVacancies();
