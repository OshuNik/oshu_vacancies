<script>
// script.js — главная с вкладками, поиском, «Изображение» и long-press очисткой

// Конфиг
const { SUPABASE_URL, SUPABASE_ANON_KEY, PAGE_SIZE_MAIN = 10 } = window.config || {};

// Утилиты
const {
  tg, debounce, escapeHtml, stripTags, sanitizeUrl, openLink,
  highlightText, formatTimestamp,
  containsImageMarker, cleanImageMarkers, pickImageUrl,
  fetchWithRetry, renderEmptyState, renderError,
  ensureLoadMore, updateLoadMore
} = window.utils;

// DOM
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
const progressBar     = document.getElementById('progress-bar');
const vacanciesWrap   = document.getElementById('vacancies-content');
const headerActions   = document.getElementById('header-actions');
const searchContainer = document.getElementById('search-container');
const categoryTabs    = document.getElementById('category-tabs');

// кастом-confirm (уже есть в index.html)
const confirmOverlay   = document.getElementById('custom-confirm-overlay');
const confirmText      = document.getElementById('custom-confirm-text');
const confirmOkBtn     = document.getElementById('confirm-btn-ok');
const confirmCancelBtn = document.getElementById('confirm-btn-cancel');

function showConfirm(message) {
  return new Promise(res => {
    confirmText.textContent = message;
    confirmOverlay.classList.remove('hidden');
    const done = (v) => { confirmOverlay.classList.add('hidden'); res(v); };
    confirmOkBtn.onclick = () => done(true);
    confirmCancelBtn.onclick = () => done(false);
  });
}

// ===== прогресс =====
const setProgress = (pct=0)=>{ if (progressBar) progressBar.style.width = Math.max(0,Math.min(100,pct))+'%'; };
const startProgress = ()=> setProgress(5);
const finishProgress = ()=> setTimeout(()=>setProgress(100),0);
const resetProgress = ()=> setTimeout(()=>setProgress(0),200);

// ===== состояние =====
const state = {
  data: { main: [], maybe: [], other: [] },
  rendered: { main: 0, maybe: 0, other: 0 },
  activeKey: 'main',
  pageSize: PAGE_SIZE_MAIN
};
const loadMore = ensureLoadMore(()=>renderNextPage());

// ===== поиск (счётчик внизу строки) =====
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
  searchStatsEl.textContent = q ? (visible===0 ? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`) : '';
}

// ===== рендер карточки =====
function buildCard(v) {
  const card = document.createElement('div');
  card.className = 'vacancy-card';
  card.id = `card-${v.id}`;
  if (v.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
  else if (v.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
  else card.classList.add('category-other');

  const isValid = (val) => val && val !== 'null' && val !== 'не указано';

  // Apply
  let applyIconHtml = '';
  const safeApply = sanitizeUrl(v.apply_url || '');
  if (safeApply) {
    applyIconHtml = `
      <button class="card-action-btn apply" onclick="window.utils && utils.openLink ? utils.openLink('${safeApply}') : window.open('${safeApply}','_blank')" aria-label="Откликнуться">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>`;
  }

  // skills (теги внизу)
  let skillsFooterHtml = '';
  if (Array.isArray(v.skills) && v.skills.length > 0) {
    skillsFooterHtml = `<div class="footer-skill-tags">${
      v.skills.slice(0,3).map(s=>`<span class="footer-skill-tag">${escapeHtml(String(s))}</span>`).join('')
    }</div>`;
  }

  // характеристики
  const infoRows = [];
  const employment = isValid(v.employment_type) ? v.employment_type : '';
  const workFormat = isValid(v.work_format) ? v.work_format : '';
  const formatValue = [employment, workFormat].filter(Boolean).join(' / ');
  if (formatValue) infoRows.push({label:'ФОРМАТ', value: formatValue, type:'default'});
  if (isValid(v.salary_display_text)) infoRows.push({label:'ОПЛАТА', value: v.salary_display_text, type:'salary'});

  const industryText = isValid(v.industry) ? v.industry : '';
  const companyText  = isValid(v.company_name) ? `(${v.company_name})` : '';
  const sphereValue  = `${industryText} ${companyText}`.trim();
  if (sphereValue) infoRows.push({label:'СФЕРА', value: sphereValue, type:'industry'});

  let infoWindowHtml = '';
  if (infoRows.length > 0) {
    infoWindowHtml = '<div class="info-window">' + infoRows.map(r =>
      `<div class="info-row info-row--${r.type}">
         <div class="info-label">${escapeHtml(r.label)} >></div>
         <div class="info-value">${escapeHtml(r.value)}</div>
       </div>`
    ).join('') + '</div>';
  }

  // сводка + полный текст (+кнопка Изображение при наличии)
  const q = (searchInput?.value || '').trim();
  const originalSummary = v.reason || 'Описание не было сгенерировано.';
  const originalDetailsRaw = v.text_highlighted ? stripTags(String(v.text_highlighted)) : '';

  const bestImageUrl = pickImageUrl(v, originalDetailsRaw);
  const cleanedDetailsText = bestImageUrl ? cleanImageMarkers(originalDetailsRaw) : originalDetailsRaw;
  const attachmentsHTML = bestImageUrl ? `<div class="attachments"><a class="image-link-button" href="${bestImageUrl}" target="_blank" rel="noopener noreferrer">Изображение</a></div>` : '';
  const hasAnyDetails = Boolean(cleanedDetailsText) || Boolean(attachmentsHTML);
  const detailsHTML = hasAnyDetails ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>` : '';

  const channelHtml = isValid(v.channel) ? `<span class="channel-name">${escapeHtml(v.channel)}</span>` : '';
  const tsHtml      = `<span class="timestamp-footer">${escapeHtml(formatTimestamp(v.timestamp))}</span>`;
  const sep = channelHtml && tsHtml ? ' • ' : '';
  const footerMetaHtml = `<div class="footer-meta">${channelHtml}${sep}${tsHtml}</div>`;

  card.innerHTML = `
    <div class="card-actions">
      ${applyIconHtml}
      <button class="card-action-btn favorite" onclick="updateStatus(event,'${v.id}','favorite')" aria-label="В избранное">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
      </button>
      <button class="card-action-btn delete" onclick="updateStatus(event,'${v.id}','deleted')" aria-label="Удалить">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
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

  // сохраняем для поиска
  const searchChunks = [v.category, v.reason, industryText, v.company_name, Array.isArray(v.skills)?v.skills.join(' '):'', cleanedDetailsText].filter(Boolean);
  card.dataset.searchText = searchChunks.join(' ').toLowerCase();

  // подсветка текста
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
  return card;
}

// ===== отрисовка по страницам =====
function renderNextPage() {
  const key = state.activeKey;
  const list = containers[key];
  const arr = state.data[key];
  const start = state.rendered[key];
  const end = Math.min(start + state.pageSize, arr.length);
  if (start === 0) list.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (let i=start; i<end; i++) frag.appendChild(buildCard(arr[i]));
  list.appendChild(frag);
  state.rendered[key] = end;
  updateLoadMore(list, { visible: end < arr.length, disabled: false });
  applySearch(); // освежим фильтр/подсветку
}

function renderInitial() {
  ['main','maybe','other'].forEach(k => {
    state.rendered[k] = 0;
    containers[k].innerHTML = '';
    if (state.data[k].length === 0) {
      renderEmptyState(containers[k], '-- Пусто в этой категории --');
    } else {
      if (k === state.activeKey) renderNextPage();
      else updateLoadMore(containers[k], { visible:false });
    }
  });
}

// ===== поиск =====
const applySearch = () => {
  const q = (searchInput?.value || '').trim();
  const activeList = containers[state.activeKey];
  if (!activeList) return;
  const cards = Array.from(activeList.querySelectorAll('.vacancy-card'));
  const total = cards.length; let visible = 0;

  cards.forEach(card => {
    const hay = (card.dataset.searchText || card.textContent || '').toLowerCase();
    const match = q === '' || hay.includes(q.toLowerCase());
    card.style.display = match ? '' : 'none';
    if (match) visible++;

    const sum = card.querySelector('.card-summary');
    const det = card.querySelector('.vacancy-text');
    if (sum && sum.dataset.originalSummary !== undefined) {
      sum.innerHTML = highlightText(sum.dataset.originalSummary || '', q);
    }
    if (det && det.dataset.originalText !== undefined) {
      const attachments = det.querySelector('.attachments');
      const textHtml = highlightText(det.dataset.originalText || '', q);
      det.innerHTML = (attachments ? attachments.outerHTML : '') + textHtml;
    }
  });

  // пусто только если карточки есть, но все скрыты
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
};

// ===== API =====
async function updateStatus(e, id, newStatus) {
  const card = document.getElementById(`card-${id}`);
  const parent = card?.parentElement;
  try {
    await fetchWithRetry(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${id}`, {
      method:'PATCH',
      headers:{
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ status: newStatus })
    });
    if (card) {
      card.style.opacity='0'; card.style.transform='scale(0.95)';
      setTimeout(()=>{
        const key = state.activeKey;
        const idx = state.data[key].findIndex(x=>x.id===id);
        if (idx>-1) state.data[key].splice(idx,1);
        card.remove();
        counts[key].textContent = `(${state.data[key].length})`;
        if (parent && parent.querySelectorAll('.vacancy-card').length < state.pageSize && state.rendered[key] < state.data[key].length) {
          renderNextPage();
        }
        if (!parent.querySelector('.vacancy-card')) renderEmptyState(parent, '-- Пусто в этой категории --');
      }, 250);
    }
  } catch(err) {
    console.error(err);
    tg && tg.showAlert && tg.showAlert('Не удалось обновить статус.');
    if (card) { card.style.opacity='1'; card.style.transform='scale(1)'; }
  }
}
window.updateStatus = updateStatus;

// очистка категории (long-press)
async function clearCategory(categoryName) {
  if (!categoryName) return;
  const ok = await showConfirm(`Вы уверены, что хотите удалить все из категории "${categoryName}"?`);
  if (!ok) return;

  const map = { 'ТОЧНО ТВОЁ':'main', 'МОЖЕТ БЫТЬ':'maybe', 'НЕ ТВОЁ':'other' };
  const key = map[categoryName];
  const list = containers[key];
  try {
    list.querySelectorAll('.vacancy-card').forEach(c=>c.style.opacity='0.4');
    await fetchWithRetry(`${SUPABASE_URL}/rest/v1/vacancies?category=eq.${encodeURIComponent(categoryName)}&status=eq.new`, {
      method:'PATCH',
      headers:{
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type':'application/json',
        'Prefer':'return=minimal'
      },
      body: JSON.stringify({ status:'deleted' })
    });
    state.data[key] = [];
    state.rendered[key] = 0;
    counts[key].textContent = '(0)';
    renderEmptyState(list, '-- Пусто в этой категории --');
    updateLoadMore(list, { visible:false });
  } catch (err) {
    console.error(err);
    tg && tg.showAlert && tg.showAlert('Не удалось очистить категорию.');
  }
}

// ===== загрузка =====
async function loadVacancies() {
  ensureSearchUI();
  headerActions.classList.add('hidden');
  vacanciesWrap.classList.add('hidden');
  searchContainer.classList.add('hidden');
  categoryTabs.classList.add('hidden');

  startProgress();
  loader.classList.remove('hidden');

  try {
    const fields = [
      'id','category','reason','employment_type','work_format','industry','company_name','skills',
      'text_highlighted','apply_url','message_link','image_link','has_image',
      'channel','timestamp','status'
    ].join(',');

    const url = `${SUPABASE_URL}/rest/v1/vacancies?status=eq.new&select=${fields}`;
    const r = await fetchWithRetry(url, {
      headers:{ 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    }, 1);
    const items = await r.json();
    finishProgress();

    ['main','maybe','other'].forEach(k => { containers[k].innerHTML = ''; });

    if (!items || items.length === 0) {
      renderEmptyState(containers.main, 'Новых вакансий нет');
      counts.main.textContent = '(0)'; counts.maybe.textContent = '(0)'; counts.other.textContent = '(0)';
    } else {
      items.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
      const main  = items.filter(i=> i.category === 'ТОЧНО ТВОЁ');
      const maybe = items.filter(i=> i.category === 'МОЖЕТ БЫТЬ');
      const other = items.filter(i=> !['ТОЧНО ТВОЁ','МОЖЕТ БЫТЬ'].includes(i.category));

      state.data.main = main;  state.data.maybe = maybe;  state.data.other = other;
      counts.main.textContent  = `(${main.length})`;
      counts.maybe.textContent = `(${maybe.length})`;
      counts.other.textContent = `(${other.length})`;

      renderInitial();
    }

    setTimeout(()=>{
      loader.classList.add('hidden');
      vacanciesWrap.classList.remove('hidden');
      headerActions.classList.remove('hidden');
      categoryTabs.classList.remove('hidden');
      if (items && items.length > 0) searchContainer.classList.remove('hidden');
      applySearch();
      resetProgress();
      document.dispatchEvent(new CustomEvent('vacancies:loaded'));
    }, 200);

  } catch (e) {
    console.error('Ошибка загрузки:', e);
    renderError(loader, e.message || 'Ошибка сети');
    setProgress(100); resetProgress();
    document.dispatchEvent(new CustomEvent('vacancies:loaded'));
  }
}

// ===== вкладки + long-press =====
tabButtons.forEach(btn => {
  let pressTimer = null; let longPress = false;

  const start = () => {
    longPress = false;
    pressTimer = setTimeout(() => {
      longPress = true;
      const categoryName = btn.dataset.categoryName;
      clearCategory(categoryName);
    }, 800);
  };
  const cancel = (e) => { clearTimeout(pressTimer); if (longPress && e) e.preventDefault(); };

  const click = () => {
    if (longPress) return;
    tabButtons.forEach(b=>b.classList.remove('active'));
    vacancyLists.forEach(l=>l.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById(btn.dataset.target);
    target.classList.add('active');

    state.activeKey =
      btn.classList.contains('main')  ? 'main'  :
      btn.classList.contains('maybe') ? 'maybe' : 'other';

    // переместим «Загрузить ещё» в низ активного списка
    const arr = state.data[state.activeKey];
    const list = containers[state.activeKey];
    updateLoadMore(list, { visible: state.rendered[state.activeKey] < arr.length, disabled:false });

    applySearch();
  };

  btn.addEventListener('mousedown', start);
  btn.addEventListener('mouseup', cancel);
  btn.addEventListener('mouseleave', cancel);
  btn.addEventListener('touchstart', start, {passive:true});
  btn.addEventListener('touchend', cancel);
  btn.addEventListener('touchcancel', cancel);
  btn.addEventListener('click', click);
});

// поиск
searchInput?.addEventListener('input', debounce(applySearch, 200));

// Pull-to-refresh (как было)
(function PTR(){
  const threshold = 70; let startY=0, pulling=false, ready=false, locked=false, distance=0;
  const bar = document.createElement('div');
  bar.style.cssText='position:fixed;left:0;right:0;top:0;height:56px;background:var(--card-color);color:var(--hint-color);border-bottom:var(--border-width) solid var(--border-color);display:flex;align-items:center;justify-content:center;transform:translateY(-100%);transition:transform .2s ease;z-index:9999;font-family:inherit;';
  bar.textContent='Потяните вниз для обновления';
  document.body.appendChild(bar);
  const setBar = y=>{ bar.style.transform = `translateY(${Math.min(0,-100+(y/0.56))}%)`; };
  const reset = ()=>{ bar.style.transform = 'translateY(-100%)'; };

  window.addEventListener('touchstart', e=>{
    if (locked) return;
    if (window.scrollY > 0) { pulling=false; return; }
    startY = e.touches[0].clientY; pulling=true; ready=false; distance=0;
  }, {passive:true});

  window.addEventListener('touchmove', e=>{
    if (!pulling || locked) return;
    const y = e.touches[0].clientY; distance = y - startY;
    if (distance > 0) {
      e.preventDefault();
      setBar(Math.min(distance, threshold*1.5));
      if (distance > threshold && !ready) { ready=true; bar.textContent='Отпустите для обновления'; }
      if (distance <= threshold && ready) { ready=false; bar.textContent='Потяните вниз для обновления'; }
    }
  }, {passive:false});

  window.addEventListener('touchend', ()=>{
    if (!pulling || locked) { reset(); pulling=false; return; }
    if (ready) {
      locked = true; bar.textContent='Обновляю…'; setBar(threshold*1.2);
      const done = ()=>{ locked=false; ready=false; pulling=false; reset(); };
      const onLoaded = ()=>{ document.removeEventListener('vacancies:loaded', onLoaded); done(); };
      document.addEventListener('vacancies:loaded', onLoaded);
      loadVacancies();
      setTimeout(()=>{ if (locked) done(); }, 8000);
    } else { reset(); pulling=false; }
  }, {passive:true});
})();

// старт
loadVacancies();
</script>
