// favorites.js — Избранное с защитой запросов и едиными хелперами

const { SUPABASE_URL, SUPABASE_ANON_KEY, RETRY_OPTIONS } = window.APP_CONFIG;
const {
  tg, escapeHtml, stripTags, debounce, sanitizeUrl, openLink,
  formatTimestamp, containsImageMarker, cleanImageMarkers, pickImageUrl,
  fetchWithRetry, renderEmptyState, renderError
} = window.utils;

const PAGE_SIZE_FAV = 10;
const container = document.getElementById('favorites-list');
const searchInputFav = document.getElementById('search-input-fav');

// SEARCH UI
let favStatsEl = null;
function ensureFavSearchUI() {
  const parent = document.getElementById('search-container-fav') || searchInputFav?.parentElement;
  if (!parent) return;
  if (!favStatsEl) {
    favStatsEl = document.createElement('div');
    favStatsEl.className = 'search-stats';
    parent.appendChild(favStatsEl);
  }
}
function updateFavStats(visible, total) {
  if (!favStatsEl) return;
  const q = (searchInputFav?.value || '').trim();
  favStatsEl.textContent = q ? (visible===0 ? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`) : '';
}

// PAGINATION
const favState = { all: [], rendered: 0, pageSize: PAGE_SIZE_FAV, btn: null };
function makeFavBtn() { const b=document.createElement('button'); b.className='header-button'; b.textContent='Загрузить ещё'; b.style.marginTop='10px'; b.onclick=renderNextFav; return b; }
function updateFavBtn() { if (!container) return; const total=favState.all.length, rendered=favState.rendered; if (!favState.btn) favState.btn = makeFavBtn(); const btn=favState.btn; if (rendered < total) { if (!btn.parentElement) container.appendChild(btn); btn.disabled=false; } else if (btn.parentElement) { btn.parentElement.remove(); } }

function buildFavCard(v) {
  const isValid = (val) => val && val !== 'null' && val !== 'не указано';
  const card = document.createElement('div');
  card.className = 'vacancy-card';
  card.id = `card-${v.id}`;
  if (v.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
  else if (v.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
  else card.classList.add('category-other');

  const applyBtn = sanitizeUrl(v.apply_url || '') ? `
    <button class="card-action-btn apply" data-action="apply" data-url="${escapeHtml(sanitizeUrl(v.apply_url))}" aria-label="Откликнуться">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
    </button>` : '';

  let skillsFooterHtml = '';
  if (Array.isArray(v.skills) && v.skills.length > 0) {
    skillsFooterHtml = `
      <div class="footer-skill-tags">
        ${v.skills.slice(0, 3).map(s => `<span class="footer-skill-tag">${escapeHtml(String(s))}</span>`).join('')}
      </div>`;
  }

  const infoRows = [];
  const employment = isValid(v.employment_type) ? v.employment_type : '';
  const workFormat = isValid(v.work_format) ? v.work_format : '';
  const formatValue = [employment, workFormat].filter(Boolean).join(' / ');
  if (formatValue) infoRows.push({icon: '📋', label: 'ФОРМАТ', value: formatValue});
  if (isValid(v.salary_display_text)) infoRows.push({icon: '💰', label: 'ОПЛАТА', value: v.salary_display_text, highlight: true, highlightClass: 'salary'});
  if (isValid(v.industry) || isValid(v.company_name)) {
    const industryText = isValid(v.industry) ? v.industry : '';
    let companyName = isValid(v.company_name) ? v.company_name : '';
    const sphereValue = `${escapeHtml(industryText)} ${companyName ? `(${escapeHtml(companyName)})` : ''}`.trim();
    if (sphereValue) infoRows.push({icon: '🏢', label: 'СФЕРА', value: sphereValue, highlight: true, highlightClass: 'industry'});
  }

  let infoGridHtml = '';
  if (infoRows.length > 0) {
    infoGridHtml = '<div class="info-grid">';
    infoRows.forEach(row => {
      const valueHtml = row.highlight ? `<span class="value-highlight ${row.highlightClass}">${row.value}</span>` : row.value;
      infoGridHtml += `<div class="info-label"><span>${row.icon}</span> ${row.label} >></div><div class="info-value">${valueHtml}</div>`;
    });
    infoGridHtml += '</div>';
  }

  const originalDetailsRaw = v.text_highlighted ? stripTags(String(v.text_highlighted)) : '';
  const bestImageUrl = pickImageUrl(v, originalDetailsRaw);
  const cleanedDetailsText = bestImageUrl ? cleanImageMarkers(originalDetailsRaw) : originalDetailsRaw;
  const attachmentsHTML = bestImageUrl ? `<div class="attachments"><a class="image-link-button" href="${bestImageUrl}" target="_blank" rel="noopener noreferrer">Изображение</a></div>` : '';
  const hasAnyDetails = Boolean(cleanedDetailsText) || Boolean(attachmentsHTML);
  const detailsHTML = hasAnyDetails ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>` : '';

  const timestampHtml = `<span class="timestamp-footer">${escapeHtml(formatTimestamp(v.timestamp))}</span>`;

  card.innerHTML = `
    <div class="card-actions">
      ${applyBtn}
      <button class="card-action-btn delete" data-action="unfavorite" data-id="${v.id}" aria-label="Убрать из избранного">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    <div class="card-header"><h3>${escapeHtml(v.category || 'NO_CATEGORY')}</h3></div>
    <div class="card-body">
      <p class="card-summary">${escapeHtml(v.reason || 'Описание не было сгенерировано.')}</p>
      ${infoGridHtml}
      ${detailsHTML}
    </div>
    <div class="card-footer">
      ${skillsFooterHtml}
      ${timestampHtml}
    </div>`;

  const detailsEl = card.querySelector('.vacancy-text');
  if (detailsEl) detailsEl.innerHTML = attachmentsHTML + escapeHtml(cleanedDetailsText);

  const searchChunks = [v.category, v.reason, v.industry, v.company_name, Array.isArray(v.skills)?v.skills.join(' '):'', cleanedDetailsText].filter(Boolean);
  card.dataset.searchText = searchChunks.join(' ').toLowerCase();

  return card;
}

function renderNextFav() {
  const start = favState.rendered;
  const end = Math.min(start + favState.pageSize, favState.all.length);
  if (favState.all.length === 0 && start === 0) {
    renderEmptyState(container, '-- В избранном пусто --');
    updateFavBtn();
    return;
  }
  const frag = document.createDocumentFragment();
  for (let i=start; i<end; i++) frag.appendChild(buildFavCard(favState.all[i]));
  if (start === 0) container.innerHTML = '';
  container.appendChild(frag);
  favState.rendered = end;
  updateFavBtn();
  applySearchFav();
}

function applySearchFav() {
  const q = (searchInputFav?.value || '').trim();
  const cards = Array.from(container.querySelectorAll('.vacancy-card'));
  const total = cards.length; let visible = 0;
  cards.forEach(card => {
    const haystack = (card.dataset.searchText || card.textContent || '').toLowerCase();
    const match = q === '' || haystack.includes(q.toLowerCase());
    card.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  let emptyHint = container.querySelector('.search-empty-hint');
  if (total > 0 && visible === 0) {
    if (!emptyHint) {
      emptyHint = document.createElement('div');
      emptyHint.className = 'search-empty-hint';
      emptyHint.style.cssText = 'text-align:center;color:var(--hint-color);padding:30px 0;';
      emptyHint.textContent = '— Ничего не найдено —';
      container.appendChild(emptyHint);
    }
  } else if (emptyHint) emptyHint.remove();
  updateFavStats(visible, total);
}

// API
async function updateStatus(event, id, newStatus) {
  const cardElement = document.getElementById(`card-${id}`);
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return-minimal'
      },
      body: JSON.stringify({ status: newStatus })
    });
    if (cardElement) {
      cardElement.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      cardElement.style.opacity = '0';
      cardElement.style.transform = 'scale(0.95)';
      setTimeout(() => {
        cardElement.remove();
        if (container.querySelectorAll('.vacancy-card').length < PAGE_SIZE_FAV && favState.rendered < favState.all.length) {
          renderNextFav();
        }
        if (container.children.length === 0) {
          renderEmptyState(container, '-- В избранном пусто --');
        }
      }, 250);
    }
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
    safeAlert('Не удалось обновить статус.');
  }
}

// Загрузка (Abort + Retry)
let inFlightFav = false;
let controllerFav = null;

async function loadFavorites() {
  ensureFavSearchUI();
  if (inFlightFav) { controllerFav?.abort(); }
  inFlightFav = true;
  controllerFav = new AbortController();
  renderEmptyState(container, 'Загрузка...');

  try {
    const fields = [
      'id','category','reason','employment_type','work_format','salary_display_text',
      'industry','company_name','skills','text_highlighted','channel','timestamp',
      'apply_url','message_link'
    ].join(',');
    const url = `${SUPABASE_URL}/rest/v1/vacancies?status=eq.favorite&select=${fields}&order=timestamp.desc&limit=500`;
    const response = await fetchWithRetry(url, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      signal: controllerFav.signal
    }, RETRY_OPTIONS);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

    const items = await response.json();
    favState.all = items || [];
    favState.rendered = 0;
    renderNextFav();
    document.dispatchEvent(new CustomEvent('favorites:loaded'));
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error('Ошибка загрузки избранного:', error);
    renderError(container, error.message, () => loadFavorites());
    document.dispatchEvent(new CustomEvent('favorites:loaded'));
  } finally {
    inFlightFav = false;
  }
}

// Делегирование кликов
container.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'apply') openLink(btn.dataset.url);
  if (action === 'unfavorite') updateStatus(e, btn.dataset.id, 'new');
});

// Events
searchInputFav?.addEventListener('input', debounce(applySearchFav, 200));

// Init
ensureFavSearchUI();
loadFavorites();

// Pull-to-refresh — прежний, с событием favorites:loaded (оставлен как есть)
(function setupPTRFav(){
  if (window.__PTR_FAV_INITIALIZED__) return; window.__PTR_FAV_INITIALIZED__ = true;
  const threshold = 70; let startY=0; let pulling=false; let ready=false; let locked=false;
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:0;right:0;top:0;height:56px;background:var(--card-color);color:var(--hint-color);border-bottom:var(--border-width) solid var(--border-color);display:flex;align-items:center;justify-content:center;transform:translateY(-100%);transition:transform .2s ease;z-index:9999;font-family:inherit;';
  bar.textContent = 'Потяните вниз для обновления';
  document.body.appendChild(bar);
  const setBar = y => { bar.style.transform = `translateY(${Math.min(0, -100 + (y/0.56))}%)`; };
  const resetBar = () => { bar.style.transform = 'translateY(-100%)'; };

  window.addEventListener('touchstart', (e)=>{ if (locked) return; if (window.scrollY>0){ pulling=false; return; } startY=e.touches[0].clientY; pulling=true; ready=false; }, {passive:true});
  window.addEventListener('touchmove', (e)=>{ if (!pulling||locked) return; const y=e.touches[0].clientY; const d=y-startY; if (d>0){ e.preventDefault(); setBar(Math.min(d, threshold*1.5)); if (d>threshold && !ready){ ready=true; bar.textContent='Отпустите для обновления'; } if (d<=threshold && ready){ ready=false; bar.textContent='Потяните вниз для обновления'; } } }, {passive:false});
  window.addEventListener('touchend', ()=>{ if (!pulling||locked){ resetBar(); pulling=false; return; } if (ready){ locked=true; bar.textContent='Обновляю…'; setBar(threshold*1.2); const done=()=>{ locked=false; pulling=false; resetBar(); }; const onLoaded=()=>{ document.removeEventListener('favorites:loaded', onLoaded); done(); }; document.addEventListener('favorites:loaded', onLoaded); loadFavorites(); setTimeout(()=>{ if (locked) done(); }, 8000); } else { resetBar(); pulling=false; } }, {passive:true});
})();
