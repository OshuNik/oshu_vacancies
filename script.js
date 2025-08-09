// script.js — Главная лента, порционная отрисовка и защита запросов

const { SUPABASE_URL, SUPABASE_ANON_KEY, PAGE_SIZE_MAIN, RETRY_OPTIONS } = window.APP_CONFIG;
const {
  tg, escapeHtml, stripTags, debounce, highlightText, safeAlert,
  formatTimestamp, sanitizeUrl, openLink,
  containsImageMarker, cleanImageMarkers, pickImageUrl,
  fetchWithRetry, renderEmptyState, renderError,
  ensureLoadMore, updateLoadMore
} = window.utils;

// Элементы
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
const tabButtons = document.querySelectorAll('.tab-button');
const vacancyLists = document.querySelectorAll('.vacancy-list');
const searchInput = document.getElementById('search-input');
const loader = document.getElementById('loader');
const progressBar = document.getElementById('progress-bar');
const vacanciesContent = document.getElementById('vacancies-content');
const headerActions = document.getElementById('header-actions');
const searchContainer = document.getElementById('search-container');
const categoryTabs = document.getElementById('category-tabs');
const confirmOverlay = document.getElementById('custom-confirm-overlay');
const confirmText = document.getElementById('custom-confirm-text');
const confirmOkBtn = document.getElementById('confirm-btn-ok');
const confirmCancelBtn = document.getElementById('confirm-btn-cancel');

// Прогресс
const setProgress = (p=0)=>{ if (progressBar) progressBar.style.width = `${Math.max(0,Math.min(100,p))}%`; };
const startProgress = ()=>setProgress(5);
const finishProgress = ()=>setTimeout(()=>setProgress(100),0);
const resetProgress = ()=>setTimeout(()=>setProgress(0),200);

// Модалка подтверждения (фикс «залипаний» + Esc/overlay)
(function initConfirm(){
  if (!confirmOverlay) return;
  const close = () => confirmOverlay.classList.add('hidden');
  confirmOverlay.addEventListener('click', e => { if (e.target === confirmOverlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !confirmOverlay.classList.contains('hidden')) close(); });
  confirmOkBtn?.addEventListener('click', ()=>close());
  confirmCancelBtn?.addEventListener('click', ()=>close());
})();
function showCustomConfirm(message, onResult){
  confirmText.textContent = message;
  confirmOverlay.classList.remove('hidden');
  confirmOkBtn.onclick = ()=>{ confirmOverlay.classList.add('hidden'); onResult(true); };
  confirmCancelBtn.onclick = ()=>{ confirmOverlay.classList.add('hidden'); onResult(false); };
}

// Поиск
let searchStatsEl = null;
function ensureSearchUI() {
  if (!searchContainer || !searchInput) return;
  if (!searchStatsEl) {
    searchStatsEl = document.createElement('div');
    searchStatsEl.className = 'search-stats';
    searchContainer.appendChild(searchStatsEl);
  }
}
function updateSearchStats(visible, total) {
  if (!searchStatsEl) return;
  const q = (searchInput?.value || '').trim();
  searchStatsEl.textContent = q ? (visible === 0 ? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`) : '';
}
const applySearch = () => {
  const q = (searchInput?.value || '').trim();
  const activeList = document.querySelector('.vacancy-list.active');
  if (!activeList) return;
  const cards = Array.from(activeList.querySelectorAll('.vacancy-card'));
  const total = cards.length;
  let visible = 0;
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

  let emptyHint = activeList.querySelector('.search-empty-hint');
  if (total > 0 && visible === 0) {
    if (!emptyHint) {
      emptyHint = document.createElement('div');
      emptyHint.className = 'search-empty-hint';
      emptyHint.style.cssText = 'text-align:center;color:var(--hint-color);padding:30px 0;';
      emptyHint.textContent = '— Ничего не найдено —';
      activeList.appendChild(emptyHint);
    }
  } else if (emptyHint) emptyHint.remove();
  updateSearchStats(visible, total);

  // держим кнопку «Загрузить ещё» внизу
  const key = getActiveKey();
  if (key) updateLoadMore(containers[key], listState[key].rendered < listState[key].all.length);
};

// Состояние списков и пагинации
const listState = {
  main: { all: [], rendered: 0, pageSize: PAGE_SIZE_MAIN },
  maybe: { all: [], rendered: 0, pageSize: PAGE_SIZE_MAIN },
  other: { all: [], rendered: 0, pageSize: PAGE_SIZE_MAIN }
};

function getActiveKey() {
  const active = document.querySelector('.vacancy-list.active');
  return Object.keys(containers).find(k => containers[k] === active) || null;
}

// Рендер одной карточки
function buildCard(v) {
  const card = document.createElement('div');
  card.className = 'vacancy-card';
  card.id = `card-${v.id}`;
  if (v.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
  else if (v.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
  else card.classList.add('category-other');

  const isValid = (val) => val && val !== 'null' && val !== 'не указано';

  let skillsFooterHtml = '';
  if (Array.isArray(v.skills) && v.skills.length > 0) {
    skillsFooterHtml = `<div class="footer-skill-tags">${v.skills.slice(0, 3).map(s =>
      `<span class="footer-skill-tag">${escapeHtml(String(s))}</span>`
    ).join('')}</div>`;
  }

  const infoRows = [];
  const formatValue = [v.employment_type, v.work_format].filter(Boolean).join(' / ');
  if (formatValue) infoRows.push({label:'ФОРМАТ', value:formatValue, type:'default'});
  if (isValid(v.salary_display_text)) infoRows.push({label:'ОПЛАТА', value:v.salary_display_text, type:'salary'});
  const sphereValue = `${isValid(v.industry)?v.industry:''} ${isValid(v.company_name)?`(${v.company_name})`:''}`.trim();
  if (sphereValue) infoRows.push({label:'СФЕРА', value:sphereValue, type:'industry'});
  let infoWindowHtml = '';
  if (infoRows.length > 0) {
    infoWindowHtml = '<div class="info-window">' + infoRows.map(row =>
      `<div class="info-row info-row--${row.type}"><div class="info-label">${escapeHtml(row.label)} >>\</div><div class="info-value">${escapeHtml(row.value)}</div></div>`
    ).join('') + '</div>';
  }

  const originalSummary = v.reason || 'Описание не было сгенерировано.';
  const q = (searchInput?.value || '').trim();

  const originalDetailsRaw = v.text_highlighted ? stripTags(String(v.text_highlighted)) : '';
  const bestImageUrl = pickImageUrl(v, originalDetailsRaw);
  const cleanedDetailsText = bestImageUrl ? cleanImageMarkers(originalDetailsRaw) : originalDetailsRaw;
  const attachmentsHTML = bestImageUrl ? `<div class="attachments"><a class="image-link-button" href="${bestImageUrl}" target="_blank" rel="noopener noreferrer">Изображение</a></div>` : '';
  const hasAnyDetails = Boolean(cleanedDetailsText) || Boolean(attachmentsHTML);
  const detailsHTML = hasAnyDetails ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>` : '';

  const channelHtml = isValid(v.channel) ? `<span class="channel-name">${escapeHtml(v.channel)}</span>` : '';
  const timestampHtml = `<span class="timestamp-footer">${escapeHtml(formatTimestamp(v.timestamp))}</span>`;
  const separator = channelHtml && timestampHtml ? ' • ' : '';
  const footerMetaHtml = `<div class="footer-meta">${channelHtml}${separator}${timestampHtml}</div>`;

  const applyBtn = v.apply_url ? `<button class="card-action-btn apply" data-action="apply" data-url="${escapeHtml(sanitizeUrl(v.apply_url))}" aria-label="Откликнуться">
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg></button>` : '';

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
    <div class="card-header"><h3>${escapeHtml(v.category || 'NO_CATEGORY')}</h3></div>
    <div class="card-body">
      <p class="card-summary"></p>
      ${infoWindowHtml}
      ${detailsHTML}
    </div>
    <div class="card-footer">
      ${skillsFooterHtml}
      ${footerMetaHtml}
    </div>`;

  // searchable data
  const searchChunks = [v.category, v.reason, v.industry, v.company_name, Array.isArray(v.skills) ? v.skills.join(' ') : '', cleanedDetailsText].filter(Boolean);
  card.dataset.searchText = searchChunks.join(' ').toLowerCase();

  const summaryEl = card.querySelector('.card-summary');
  if (summaryEl) {
    summaryEl.dataset.originalSummary = originalSummary;
    summaryEl.innerHTML = highlightText(originalSummary, q);
  }
  const detailsEl = card.querySelector('.vacancy-text');
  if (detailsEl) {
    detailsEl.dataset.originalText = cleanedDetailsText;
    detailsEl.innerHTML = attachmentsHTML + highlightText(cleanedDetailsText, q);
  }

  return card;
}

// Порционная отрисовка
function renderNextChunk(key) {
  const state = listState[key];
  const container = containers[key];
  if (!container) return;

  const start = state.rendered;
  const end = Math.min(start + state.pageSize, state.all.length);

  if (state.all.length === 0 && start === 0) {
    renderEmptyState(container, '-- Пусто в этой категории --');
    updateLoadMore(container, false);
    return;
  }

  const frag = document.createDocumentFragment();
  for (let i=start; i<end; i++) frag.appendChild(buildCard(state.all[i]));
  if (start === 0) container.innerHTML = '';
  container.appendChild(frag);

  state.rendered = end;
  const { btn } = ensureLoadMore(container, () => renderNextChunk(key));
  btn.disabled = state.rendered >= state.all.length;

  updateLoadMore(container, state.rendered < state.all.length);
}

// Клики по карточкам (делегирование)
vacanciesContent.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'apply') {
    openLink(btn.dataset.url);
  } else if (action === 'favorite') {
    updateStatus(e, btn.dataset.id, 'favorite');
  } else if (action === 'delete') {
    updateStatus(e, btn.dataset.id, 'deleted');
  }
});

// Обновление статуса
async function updateStatus(event, id, newStatus) {
  const card = document.getElementById(`card-${id}`);
  const parentList = card?.parentElement;
  const key = Object.keys(containers).find(k => containers[k] === parentList);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ status: newStatus })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (card) {
      card.style.opacity = '0'; card.style.transform = 'scale(0.95)';
      setTimeout(() => {
        card.remove();
        if (key) {
          const state = listState[key];
          // если есть ещё карточки в данных — дорисуем, чтобы сохранить плотность
          if (state.rendered < state.all.length) renderNextChunk(key);
          // обновим счётчик
          const span = counts[key];
          const current = parseInt((span.textContent || '0').replace(/\(|\)/g,'')) || 0;
          span.textContent = `(${Math.max(0, current-1)})`;
        }
      }, 250);
    }
  } catch (e) {
    console.error(e);
    safeAlert('Не удалось обновить статус.');
    if (card) { card.style.opacity='1'; card.style.transform='scale(1)'; }
  }
}

// Загрузка (Abort + Retry)
let inFlight = false;
let currentController = null;

async function loadVacancies() {
  if (inFlight) { currentController?.abort(); }
  inFlight = true;
  currentController = new AbortController();

  ensureSearchUI();
  headerActions.classList.add('hidden');
  vacanciesContent.classList.add('hidden');
  searchContainer.classList.add('hidden');
  categoryTabs.classList.add('hidden');

  startProgress();
  loader.classList.remove('hidden');

  try {
    const fields = [
      'id','category','reason','employment_type','work_format','salary_display_text',
      'industry','company_name','skills','text_highlighted','channel','timestamp',
      'apply_url','message_link'
    ].join(',');
    const url = `${SUPABASE_URL}/rest/v1/vacancies?status=eq.new&select=${fields}&order=timestamp.desc&limit=200`;
    const response = await fetchWithRetry(url, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      signal: currentController.signal
    }, window.APP_CONFIG.RETRY_OPTIONS);

    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

    const items = await response.json();
    finishProgress();

    // подготовим состояние
    Object.values(containers).forEach(c => c.innerHTML = '');
    listState.main = { all: [], rendered: 0, pageSize: PAGE_SIZE_MAIN };
    listState.maybe = { all: [], rendered: 0, pageSize: PAGE_SIZE_MAIN };
    listState.other = { all: [], rendered: 0, pageSize: PAGE_SIZE_MAIN };

    if (!items || items.length === 0) {
      renderEmptyState(containers.main, 'Новых вакансий нет');
      counts.main.textContent = '(0)';
      counts.maybe.textContent = '(0)';
      counts.other.textContent = '(0)';
    } else {
      const main = items.filter(i => i.category === 'ТОЧНО ТВОЁ');
      const maybe = items.filter(i => i.category === 'МОЖЕТ БЫТЬ');
      const other = items.filter(i => !['ТОЧНО ТВОЁ','МОЖЕТ БЫТЬ'].includes(i.category));

      listState.main.all = main;
      listState.maybe.all = maybe;
      listState.other.all = other;

      counts.main.textContent = `(${main.length})`;
      counts.maybe.textContent = `(${maybe.length})`;
      counts.other.textContent = `(${other.length})`;

      // первая порция в каждую вкладку
      renderNextChunk('main');
      renderNextChunk('maybe');
      renderNextChunk('other');
    }

    setTimeout(() => {
      loader.classList.add('hidden');
      vacanciesContent.classList.remove('hidden');
      headerActions.classList.remove('hidden');
      categoryTabs.classList.remove('hidden');
      if (items && items.length > 0) searchContainer.classList.remove('hidden');
      applySearch();
      resetProgress();
      document.dispatchEvent(new CustomEvent('vacancies:loaded'));
    }, 200);

  } catch (error) {
    if (error.name === 'AbortError') return; // прервали — тишина
    console.error('Ошибка загрузки:', error);
    renderError(loader, error.message, () => { loadVacancies(); });
    setProgress(100); resetProgress();
    document.dispatchEvent(new CustomEvent('vacancies:loaded'));
  } finally {
    inFlight = false;
  }
}

// Табы
tabButtons.forEach(button => {
  let pressTimer = null;
  let longPressTriggered = false;
  const startPress = () => { longPressTriggered = false; pressTimer = window.setTimeout(() => { longPressTriggered = true; const name = button.dataset.categoryName; clearCategory(name); }, 800); };
  const cancelPress = (e) => { clearTimeout(pressTimer); if (longPressTriggered) e.preventDefault(); };
  const handleClick = () => {
    if (longPressTriggered) return;
    tabButtons.forEach(btn => btn.classList.remove('active'));
    vacancyLists.forEach(list => list.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(button.dataset.target).classList.add('active');
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

searchInput?.addEventListener('input', debounce(applySearch, 250));

// Pull-to-refresh (гард от повторной инициализации)
(function setupPTR(){
  if (window.__PTR_INITIALIZED__) return; window.__PTR_INITIALIZED__ = true;
  const threshold = 70;
  let startY = 0, pulling = false, ready = false, locked = false;
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:0;right:0;top:0;height:56px;background:var(--card-color);color:var(--hint-color);border-bottom:var(--border-width) solid var(--border-color);display:flex;align-items:center;justify-content:center;transform:translateY(-100%);transition:transform .2s ease;z-index:9999;font-family:inherit;';
  bar.textContent = 'Потяните вниз для обновления';
  document.body.appendChild(bar);
  const setBar = y => { bar.style.transform = `translateY(${Math.min(0, -100 + (y/0.56))}%)`; };
  const resetBar = () => { bar.style.transform = 'translateY(-100%)'; };

  window.addEventListener('touchstart', (e)=>{ if (locked) return; if (window.scrollY > 0) { pulling=false; return; } startY = e.touches[0].clientY; pulling=true; ready=false; }, {passive:true});
  window.addEventListener('touchmove', (e)=>{ if (!pulling || locked) return; const y = e.touches[0].clientY; const dist = y - startY; if (dist>0){ e.preventDefault(); setBar(Math.min(dist, threshold*1.5)); if (dist>threshold && !ready){ ready=true; bar.textContent='Отпустите для обновления'; } if (dist<=threshold && ready){ ready=false; bar.textContent='Потяните вниз для обновления'; } } }, {passive:false});
  window.addEventListener('touchend', ()=>{ if (!pulling || locked){ resetBar(); pulling=false; return; } if (ready){ locked=true; bar.textContent='Обновляю…'; setBar(threshold*1.2); const done=()=>{ locked=false; pulling=false; resetBar(); }; const onLoaded=()=>{ document.removeEventListener('vacancies:loaded', onLoaded); done(); }; document.addEventListener('vacancies:loaded', onLoaded); loadVacancies(); setTimeout(()=>{ if (locked) done(); }, 8000); } else { resetBar(); pulling=false; } }, {passive:true});
})();

// Очистка категории
async function clearCategory(categoryName) {
  if (!categoryName) return;
  showCustomConfirm(`Вы уверены, что хотите удалить все из категории "${categoryName}"?`, async (ok) => {
    if (!ok) return;
    const activeList = document.querySelector('.vacancy-list.active');
    if (activeList) { activeList.querySelectorAll('.vacancy-card').forEach(c => c.style.opacity='0'); }
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?category=eq.${encodeURIComponent(categoryName)}&status=eq.new`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return-minimal'
        },
        body: JSON.stringify({ status: 'deleted' })
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (activeList) {
        renderEmptyState(activeList, '-- Пусто в этой категории --');
        const key = Object.keys(containers).find(k => containers[k] === activeList);
        if (key) counts[key].textContent = '(0)';
      }
    } catch (e) {
      console.error(e);
      safeAlert('Не удалось очистить категорию.');
    }
  });
}

// Init
ensureSearchUI();
loadVacancies();
