// script.js — главная лента с СЕРВЕРНОЙ пагинацией и СЕРВЕРНЫМ поиском

const { SUPABASE_URL, SUPABASE_ANON_KEY, PAGE_SIZE_MAIN, RETRY_OPTIONS, SEARCH_FIELDS } = window.APP_CONFIG;
const {
  escapeHtml, stripTags, debounce, highlightText, safeAlert,
  formatTimestamp, sanitizeUrl, openLink,
  containsImageMarker, cleanImageMarkers, pickImageUrl,
  fetchWithRetry, renderEmptyState, renderError,
  ensureLoadMore, updateLoadMore
} = window.utils;

// ----- элементы -----
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

// ----- прогресс -----
const setProgress = (p=0)=>{ if (progressBar) progressBar.style.width = `${Math.max(0,Math.min(100,p))}%`; };
const startProgress = ()=>setProgress(5);
const finishProgress = ()=>setTimeout(()=>setProgress(100),0);
const resetProgress = ()=>setTimeout(()=>setProgress(0),200);

// ===== серверная модель данных =====
const CAT_NAME = { main: 'ТОЧНО ТВОЁ', maybe: 'МОЖЕТ БЫТЬ' };
const state = {
  query: '',      // активный поисковый запрос
  // по категориям
  main: { items: [], offset: 0, total: 0, busy: false },
  maybe:{ items: [], offset: 0, total: 0, busy: false },
  other:{ items: [], offset: 0, total: 0, busy: false },
};
// общий AbortController, чтобы прервать при новом поиске
let currentController = null;
let inFlight = false;

// --- helpers: active tab key ---
function getActiveKey() {
  const active = document.querySelector('.vacancy-list.active');
  return Object.keys(containers).find(k => containers[k] === active) || 'main';
}

// --- построение URL для категории с лимитом/офсетом и поиском ---
function buildCategoryUrl(key, limit, offset, query) {
  const fields = [
    'id','category','reason','employment_type','work_format','salary_display_text',
    'industry','company_name','skills','text_highlighted','channel','timestamp',
    'apply_url','message_link','has_image','image_link'
  ].join(',');

  const params = new URLSearchParams();
  params.set('select', fields);
  params.set('status', 'eq.new');
  params.set('order', 'timestamp.desc');
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  // фильтр категории
  if (key === 'main') {
    params.set('category', `eq.${CAT_NAME.main}`);
  } else if (key === 'maybe') {
    params.set('category', `eq.${CAT_NAME.maybe}`);
  } else {
    // все, кроме двух первых
    params.set('category', `not.in.("ТОЧНО ТВОЁ","МОЖЕТ БЫТЬ")`);
  }

  // поиск (ilike) по нескольким полям
  const q = (query || '').trim();
  if (q) {
    const expr = '(' + SEARCH_FIELDS.map(f => `${f}.ilike.*${q}*`).join(',') + ')';
    params.set('or', expr);
  }

  return `${SUPABASE_URL}/rest/v1/vacancies?${params.toString()}`;
}

// --- чтение total из Content-Range ---
function parseTotal(resp) {
  const cr = resp.headers.get('content-range'); // например: "0-9/58"
  if (!cr || !cr.includes('/')) return 0;
  const total = cr.split('/').pop();
  return Number(total) || 0;
}

// --- отрисовка карточки ---
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
    skillsFooterHtml = `<div class="footer-skill-tags">${
      v.skills.slice(0,3).map(s => `<span class="footer-skill-tag">${escapeHtml(String(s))}</span>`).join('')
    }</div>`;
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
      `<div class="info-row info-row--${row.type}">
         <div class="info-label">${escapeHtml(row.label)} >>\</div>
         <div class="info-value">${escapeHtml(row.value)}</div>
       </div>`
    ).join('') + '</div>';
  }

  const originalSummary = v.reason || 'Описание не было сгенерировано.';
  const q = state.query;

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

// --- действия в карточке (делегирование) ---
vacanciesContent.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'apply') {
    openLink(btn.dataset.url);
  } else if (action === 'favorite') {
    updateStatus(btn.dataset.id, 'favorite');
  } else if (action === 'delete') {
    updateStatus(btn.dataset.id, 'deleted');
  }
});

// --- серверная подгрузка следующей порции для категории ---
async function fetchNext(key) {
  const st = state[key];
  const container = containers[key];
  if (st.busy) return;
  st.busy = true;

  const url = buildCategoryUrl(key, PAGE_SIZE_MAIN, st.offset, state.query);
  try {
    const resp = await fetchWithRetry(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'count=exact' // нужно для Content-Range
      },
      signal: currentController?.signal
    }, RETRY_OPTIONS);
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

    // total по фильтру
    const total = parseTotal(resp);
    if (Number.isFinite(total)) {
      st.total = total;
      // обновляем счётчик вкладки
      const span = counts[key];
      if (span) span.textContent = `(${total})`;
    }

    const items = await resp.json();
    if (st.offset === 0) {
      container.innerHTML = '';
    }

    // рисуем
    const frag = document.createDocumentFragment();
    for (const it of items) frag.appendChild(buildCard(it));
    container.appendChild(frag);

    st.offset += items.length;
    st.items = st.items.concat(items);

    // показать/скрыть кнопку «Загрузить ещё»
    const { btn } = ensureLoadMore(container, () => fetchNext(key));
    updateLoadMore(container, st.offset < st.total);
    btn.disabled = !(st.offset < st.total);

    // пустая вкладка
    if (st.total === 0 && st.offset === 0) {
      renderEmptyState(container, '-- Пусто в этой категории --');
      updateLoadMore(container, false);
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.error('Load error:', e);
    renderError(container, e.message, () => fetchNext(key));
  } finally {
    st.busy = false;
  }
}

// --- полная перезагрузка (смена поиска/первый запуск) ---
async function reloadAll() {
  // отменяем всё предыдущее
  currentController?.abort?.();
  currentController = new AbortController();

  // сбрасываем стейты
  for (const k of ['main','maybe','other']) {
    state[k] = { items: [], offset: 0, total: 0, busy: false };
    containers[k].innerHTML = '';
    counts[k].textContent = '(0)';
  }

  headerActions.classList.add('hidden');
  vacanciesContent.classList.add('hidden');
  searchContainer.classList.add('hidden');
  categoryTabs.classList.add('hidden');

  startProgress();
  loader.classList.remove('hidden');

  try {
    // параллельно стягиваем первые страницы трёх категорий
    await Promise.all([
      fetchNext('main'),
      fetchNext('maybe'),
      fetchNext('other')
    ]);

    finishProgress();
  } finally {
    setTimeout(() => {
      loader.classList.add('hidden');
      vacanciesContent.classList.remove('hidden');
      headerActions.classList.remove('hidden');
      categoryTabs.classList.remove('hidden');
      // показываем поиск, даже если по итогу пусто
      searchContainer.classList.remove('hidden');
      resetProgress();
      document.dispatchEvent(new CustomEvent('vacancies:loaded'));
    }, 200);
  }
}

// --- изменение статуса (favorite/deleted) ---
async function updateStatus(id, newStatus) {
  const card = document.getElementById(`card-${id}`);
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

    // убираем карточку локально
    if (card) {
      const parentList = card.parentElement;
      const key = Object.keys(containers).find(k => containers[k] === parentList);
      card.style.opacity = '0'; card.style.transform = 'scale(0.96)';
      setTimeout(() => {
        card.remove();
        if (key) {
          state[key].total = Math.max(0, state[key].total - 1);
          counts[key].textContent = `(${state[key].total})`;

          // если после удаления карточек меньше, чем может отрисоваться — подтягиваем ещё
          if (state[key].offset < state[key].total) fetchNext(key);
          if (!parentList.querySelector('.vacancy-card')) {
            renderEmptyState(parentList, '-- Пусто в этой категории --');
            updateLoadMore(parentList, false);
          }
        }
      }, 220);
    }
  } catch (e) {
    console.error(e);
    safeAlert('Не удалось обновить статус.');
    if (card) { card.style.opacity = '1'; card.style.transform = 'scale(1)'; }
  }
}

// ----- табы -----
tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    vacancyLists.forEach(l => l.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(button.dataset.target).classList.add('active');
  });
});

// ----- поиск (СЕРВЕРНЫЙ): просто перезагружаем три колонки с новым q -----
const onSearch = debounce(() => {
  state.query = (searchInput?.value || '').trim();
  reloadAll();
}, 300);
searchInput?.addEventListener('input', onSearch);

// ----- pull-to-refresh остался прежний (перезагрузка всего) -----
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
  window.addEventListener('touchend', ()=>{ if (!pulling || locked){ resetBar(); pulling=false; return; } if (ready){ locked=true; bar.textContent='Обновляю…'; setBar(threshold*1.2); const done=()=>{ locked=false; pulling=false; resetBar(); }; const onLoaded=()=>{ document.removeEventListener('vacancies:loaded', onLoaded); done(); }; document.addEventListener('vacancies:loaded', onLoaded); reloadAll(); setTimeout(()=>{ if (locked) done(); }, 8000); } else { resetBar(); pulling=false; } }, {passive:true});
})();

// ----- старт -----
reloadAll();
