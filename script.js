// ==================================
// script.js — главная лента
// ==================================

// --- Конфиг и утилиты
const { SUPABASE_URL, SUPABASE_ANON_KEY, PAGE_SIZE_MAIN, RETRY_OPTIONS, SEARCH_FIELDS } = window.config;
const {
  tg, escapeHtml, stripTags, debounce, highlightText,
  formatTimestamp, sanitizeUrl,
  containsImageMarker, cleanImageMarkers, pickImageUrl,
  startProgress, finishProgress, resetProgress,
  showCustomConfirm, buildSupabaseUrl, fetchWithRetry
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
const tabButtons      = document.querySelectorAll('.tab-button');
const vacancyLists    = document.querySelectorAll('.vacancy-list');
const searchInput     = document.getElementById('search-input');
const loader          = document.getElementById('loader');
const vacanciesContent= document.getElementById('vacancies-content');
const headerActions   = document.getElementById('header-actions');
const searchContainer = document.getElementById('search-container');
const categoryTabs    = document.getElementById('category-tabs');

// Пагинация
let allItems = [];
let rendered = 0;
const PAGE = PAGE_SIZE_MAIN || 10;

function ensureSearchStatsUI(){
  let el = document.querySelector('#search-container .search-stats');
  if (!el){
    el = document.createElement('div');
    el.className = 'search-stats';
    document.getElementById('search-container')?.appendChild(el);
  }
  return el;
}

function updateSearchStats(visible, total){
  const el = ensureSearchStatsUI();
  const q = (searchInput?.value || '').trim();
  el.textContent = q ? (visible===0? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`) : '';
}

function buildInfoRows(v){
  const rows = [];
  const employment = v.employment_type && v.employment_type !== 'не указано' ? v.employment_type : '';
  const workFormat = v.work_format && v.work_format !== 'не указано' ? v.work_format : '';
  const formatValue = [employment, workFormat].filter(Boolean).join(' / ');
  if (formatValue) rows.push({label:'ФОРМАТ', value: formatValue});
  if (v.salary_display_text) rows.push({label:'ОПЛАТА', value: v.salary_display_text, kind:'salary'});
  const sphere = [v.industry||'', v.company_name?`(${v.company_name})`:'' ].join(' ').trim();
  if (sphere) rows.push({label:'СФЕРА', value: sphere, kind:'industry'});
  return rows;
}

function renderVacancyCard(v){
  const card = document.createElement('div');
  card.className = 'vacancy-card';
  if (v.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
  else if (v.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
  else card.classList.add('category-other');
  card.id = `card-${v.id}`;

  const summary = v.reason || 'Описание не было сгенерировано.';
  const originalDetailsRaw = v.text_highlighted ? stripTags(String(v.text_highlighted)) : '';
  const bestImageUrl = pickImageUrl(v, originalDetailsRaw);
  const cleanedDetailsText = bestImageUrl ? cleanImageMarkers(originalDetailsRaw) : originalDetailsRaw;
  const attachmentsHTML = bestImageUrl ? `<div class="attachments"><a class="image-link-button" href="${bestImageUrl}" target="_blank" rel="noopener noreferrer">Изображение</a></div>` : '';
  const hasAnyDetails = Boolean(cleanedDetailsText) || Boolean(attachmentsHTML);
  const detailsHTML = hasAnyDetails ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>` : '';

  // Метаданные внизу (канал + время)
  const channelHtml = v.channel ? `<span class="channel-name">${escapeHtml(v.channel)}</span>` : '';
  const tsHtml = `<span class="timestamp-footer">${escapeHtml(formatTimestamp(v.timestamp))}</span>`;
  const sep = channelHtml && tsHtml ? ' • ' : '';
  const footerMetaHtml = `<div class="footer-meta">${channelHtml}${sep}${tsHtml}</div>`;

  const infoRows = buildInfoRows(v);
  let infoWindowHtml = '';
  if (infoRows.length){
    infoWindowHtml = '<div class="info-window">' + infoRows.map(r=>`<div class="info-row info-row--${r.kind||'default'}"><div class="info-label">${r.label} >></div><div class="info-value">${escapeHtml(r.value)}</div></div>`).join('') + '</div>';
  }

  const applyIconHtml = sanitizeUrl(v.apply_url||'')
    ? `<button class="card-action-btn apply" onclick="window.open('${sanitizeUrl(v.apply_url)}','_blank','noopener')" aria-label="Откликнуться"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>`
    : '';

  card.innerHTML = `
    <div class="card-actions">
      ${applyIconHtml}
      <button class="card-action-btn favorite" data-id="${v.id}" data-action="favorite" aria-label="В избранное"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>
      <button class="card-action-btn delete" data-id="${v.id}" data-action="deleted" aria-label="Удалить"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
    </div>
    <div class="card-header"><h3>${escapeHtml(v.category || 'NO_CATEGORY')}</h3></div>
    <div class="card-body">
      <p class="card-summary"></p>
      ${infoWindowHtml}
      ${detailsHTML}
    </div>
    <div class="card-footer">
      ${Array.isArray(v.skills) && v.skills.length ? `<div class="footer-skill-tags">${v.skills.slice(0,3).map(s=>`<span class="footer-skill-tag">${escapeHtml(String(s))}</span>`).join('')}</div>` : ''}
      ${footerMetaHtml}
    </div>`;

  // Заполняем сводку/детали с подсветкой запросом
  const q = (searchInput?.value || '').trim();
  const summaryEl = card.querySelector('.card-summary');
  summaryEl.dataset.originalSummary = summary;
  summaryEl.innerHTML = highlightText(summary, q);

  const detailsEl = card.querySelector('.vacancy-text');
  if (detailsEl){
    detailsEl.dataset.originalText = cleanedDetailsText;
    detailsEl.innerHTML = attachmentsHTML + highlightText(cleanedDetailsText, q);
  }

  // dataset для быстрого поиска
  const searchChunks = [v.category, v.reason, v.industry, v.company_name, Array.isArray(v.skills)?v.skills.join(' '):'', cleanedDetailsText].filter(Boolean);
  card.dataset.searchText = searchChunks.join(' ').toLowerCase();

  return card;
}

function renderNextPortion(){
  const list = document.querySelector('.vacancy-list.active') || containers.main;
  const frag = document.createDocumentFragment();
  const end = Math.min(rendered + PAGE, allItems.length);
  for (let i=rendered; i<end; i++) frag.appendChild(renderVacancyCard(allItems[i]));
  if (rendered === 0) list.innerHTML = '';
  list.appendChild(frag);
  rendered = end;
  ensureLoadMorePosition();
  applySearch();
}

// Кнопка «Загрузить ещё»
let loadMoreBtn;
function ensureLoadMorePosition(){
  if (!loadMoreBtn){
    loadMoreBtn = document.createElement('div');
    loadMoreBtn.className = 'load-more-wrap';
    loadMoreBtn.innerHTML = '<button id="load-more" class="load-more-btn">Загрузить ещё</button>';
    containers.other.parentElement.appendChild(loadMoreBtn);
    loadMoreBtn.addEventListener('click', (e)=>{
      const btn = e.target.closest('#load-more');
      if (!btn) return;
      renderNextPortion();
      if (rendered >= allItems.length) btn.disabled = true;
    });
  }
  const btn = loadMoreBtn.querySelector('#load-more');
  if (rendered >= allItems.length) btn.disabled = true; else btn.disabled = false;
}

// Поиск по отрисованным карточкам (без мигания)
const applySearch = debounce(()=>{
  const q=(searchInput?.value||'').trim().toLowerCase();
  const activeList=document.querySelector('.vacancy-list.active')||containers.main;
  const cards=Array.from(activeList.querySelectorAll('.vacancy-card'));
  let visible=0; const total=cards.length;
  cards.forEach(c=>{
    const hay=(c.dataset.searchText||'').toLowerCase();
    const match = q==='' || hay.includes(q);
    c.style.display = match ? '' : 'none';
    if (match) visible++;
    const sEl=c.querySelector('.card-summary');
    const dEl=c.querySelector('.vacancy-text');
    if (sEl && 'originalSummary' in sEl.dataset) sEl.innerHTML = highlightText(sEl.dataset.originalSummary||'', q);
    if (dEl && 'originalText' in dEl.dataset) dEl.innerHTML = (dEl.querySelector('.attachments')?dEl.querySelector('.attachments').outerHTML:'') + highlightText(dEl.dataset.originalText||'', q);
  });
  updateSearchStats(visible, total);
}, 120);

// Обработчик кликов на «избранное/удалить» (делегирование)
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('.card-action-btn');
  if (!btn) return;
  const id = btn.dataset.id; const action = btn.dataset.action;
  if (!id || !action) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type':'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer':'return=minimal'
      },
      body: JSON.stringify({ status: action })
    });
    if (!r.ok) throw new Error('HTTP '+r.status);
    const card = document.getElementById(`card-${id}`);
    if (card){ card.style.opacity='0'; card.style.transform='scale(0.98)'; setTimeout(()=>card.remove(),180); }
  } catch(err){
    if (tg && tg.showAlert) tg.showAlert('Не удалось обновить статус');
    console.error(err);
  }
});

// Загрузка данных
async function loadVacancies(){
  // UI подготовка
  headerActions?.classList.add('hidden');
  vacanciesContent?.classList.add('hidden');
  searchContainer?.classList.add('hidden');
  categoryTabs?.classList.add('hidden');
  document.getElementById('loader')?.classList.remove('hidden');
  startProgress();

  const fields = [
    'id','category','reason','employment_type','work_format','industry','company_name','skills',
    'apply_url','message_link','image_link','has_image','status','timestamp','channel','salary_display_text','text_highlighted'
  ];

  const url = buildSupabaseUrl(SUPABASE_URL, 'vacancies', {
    select: fields,
    filters: { status: 'eq.new' },
    order: 'timestamp.desc'
  });

  try {
    const r = await fetchWithRetry(url, {
      ...RETRY_OPTIONS,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    const items = await r.json();

    // Сортировка и разложение по категориям (а также общий список для пагинации)
    items.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
    allItems = items; rendered = 0;

    // Счётчики по категориям
    const mainItems = items.filter(i=>i.category==='ТОЧНО ТВОЁ');
    const maybeItems = items.filter(i=>i.category==='МОЖЕТ БЫТЬ');
    const otherItems = items.filter(i=>i.category!=='ТОЧНО ТВОЁ' && i.category!=='МОЖЕТ БЫТЬ');
    counts.main.textContent  = `(${mainItems.length})`;
    counts.maybe.textContent = `(${maybeItems.length})`;
    counts.other.textContent = `(${otherItems.length})`;

    // Первичная порция
    Object.values(containers).forEach(c=>c.innerHTML='');
    renderNextPortion();

    setTimeout(()=>{
      document.getElementById('loader')?.classList.add('hidden');
      vacanciesContent?.classList.remove('hidden');
      headerActions?.classList.remove('hidden');
      categoryTabs?.classList.remove('hidden');
      if (items.length>0) searchContainer?.classList.remove('hidden');
      resetProgress();
    }, 200);

  } catch(err){
    console.error('Ошибка загрузки:', err);
    const loaderEl=document.getElementById('loader');
    if (loaderEl) loaderEl.innerHTML = `<p class="empty-list">Ошибка: ${escapeHtml(err.message||String(err))}</p>`;
    finishProgress(); resetProgress();
  }
}

// Табы
function setupTabs(){
  tabButtons.forEach(button=>{
    button.addEventListener('click', ()=>{
      tabButtons.forEach(b=>b.classList.remove('active'));
      vacancyLists.forEach(l=>l.classList.remove('active'));
      button.classList.add('active');
      document.getElementById(button.dataset.target).classList.add('active');
      applySearch();
      ensureLoadMorePosition();
    });
  });
}

// Слушатели
searchInput?.addEventListener('input', applySearch);

// Инициализация
setupTabs();
loadVacancies();
