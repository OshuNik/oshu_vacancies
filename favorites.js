const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
if (tg) tg.expand();

// --- SUPABASE SETUP ---
const SUPABASE_URL = 'https://lwfhtwnfqmdjwzrdznvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4';
// --- END OF SETUP ---

const PRIMARY_SKILLS = ['after effects', 'unity', 'монтаж видео', '2d-анимация', 'рилсы', 'premiere pro'];

const container = document.getElementById('favorites-list');
const searchInputFav = document.getElementById('search-input-fav');

// =========================
// Helpers (time/url/safe)
// =========================
const debounce = (fn, delay = 250) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; };
const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[c]));
const stripTags = (html = '') => { const tmp = document.createElement('div'); tmp.innerHTML = html; return tmp.textContent || tmp.innerText || ''; };

function normalizeUrl(raw = '') {
  let s = String(raw).trim();
  if (!s) return '';
  if (/^(t\.me|telegram\.me)\//i.test(s)) s = 'https://' + s;
  if (/^([a-z0-9-]+)\.[a-z]{2,}/i.test(s) && !/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { return new URL(s, window.location.origin).href; } catch { return ''; }
}
function isHttpUrl(u = '') { return /^https?:\/\//i.test(u); }
function sanitizeUrl(raw = '') { const norm = normalizeUrl(raw); return isHttpUrl(norm) ? norm : ''; }

function openLink(url) {
  const safe = sanitizeUrl(url);
  if (!safe) return;
  if (tg && typeof tg.openLink === 'function') tg.openLink(safe);
  else window.open(safe, '_blank', 'noopener');
}

function formatSmartTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now - d;
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const pad = n => n.toString().padStart(2, '0');
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const isSameDay = now.toDateString() === d.toDateString();
  const yest = new Date(now); yest.setDate(now.getDate()-1);
  const isYesterday = yest.toDateString() === d.toDateString();
  if (sec < 30) return 'только что';
  if (min < 60 && min >= 1) return `${min} мин назад`;
  if (isSameDay) return `сегодня, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (isYesterday) return `вчера, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getDate().toString().padStart(2,'0')} ${months[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatTimestamp(isoString) { return formatSmartTime(isoString); }

// ==== изображение ====
function containsImageMarker(text = '') {
  return /(\[\s*изображени[ея]\s*\]|\b(изображени[ея]|фото|картинк\w|скрин)\b)/i.test(text);
}
function cleanImageMarkers(text = '') {
  return String(text).replace(/\[\s*изображени[ея]\s*\]/gi, '').replace(/\s{2,}/g, ' ').trim();
}
function pickImageUrl(v, detailsText = '') {
  const msg = sanitizeUrl(v.message_link || '');
  const img = sanitizeUrl(v.image_link || '');
  const hasMarker = containsImageMarker(detailsText) || containsImageMarker(v.reason || '');
  const allow = (v.has_image === true) || hasMarker;
  if (!allow) return '';
  if (msg) return msg;
  if (img) return img;
  return '';
}

// =========================
// Search UI (крестик/счётчик)
// =========================
let favStatsEl = null;
function ensureFavSearchUI() {
  const parent = document.getElementById('search-container-fav') || searchInputFav?.parentElement;
  if (!parent || !searchInputFav) return;

  // удалим любые старые кнопки внутри контейнера
  parent.querySelectorAll('button:not(.search-clear-btn)').forEach(btn => btn.remove());

  // единственная кнопка очистки
  let favClearBtn = parent.querySelector('.search-clear-btn');
  if (!favClearBtn) {
    favClearBtn = document.createElement('button');
    favClearBtn.type = 'button';
    favClearBtn.className = 'search-clear-btn';
    favClearBtn.setAttribute('aria-label', 'Очистить');
    favClearBtn.textContent = '×';
    favClearBtn.onclick = () => { searchInputFav.value = ''; applySearchFav(); searchInputFav.focus(); };
    parent.appendChild(favClearBtn);
  }

  // счётчик снизу
  const stats = parent.querySelectorAll('.search-stats');
  for (let i = 1; i < stats.length; i++) stats[i].remove();
  if (!stats[0]) {
    favStatsEl = document.createElement('div');
    favStatsEl.className = 'search-stats';
    parent.appendChild(favStatsEl);
  } else {
    favStatsEl = stats[0];
  }
}
function updateFavStats(visible, total) {
  if (!favStatsEl) return;
  const q = (searchInputFav?.value || '').trim();
  if (!q) { favStatsEl.textContent = ''; return; }
  favStatsEl.textContent = visible === 0 ? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`;
}

// =========================
// Rendering
// =========================
function renderFavorites(items) {
  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = '<p class="empty-list">-- В избранном пусто --</p>';
    return;
  }

  for (const vacancy of items) {
    if (!vacancy.id) continue;

    const card = document.createElement('div');
    card.className = 'vacancy-card';
    card.id = `card-${vacancy.id}`;
    if (vacancy.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
    else if (vacancy.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
    else card.classList.add('category-other');

    let applyIconHtml = '';
    const safeApply = sanitizeUrl(vacancy.apply_url || '');
    if (safeApply) {
      applyIconHtml = `
        <button class="card-action-btn apply" onclick="openLink('${safeApply}')" aria-label="Откликнуться">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>`;
    }

    let skillsFooterHtml = '';
    if (Array.isArray(vacancy.skills) && vacancy.skills.length > 0) {
      skillsFooterHtml = `
        <div class="footer-skill-tags">
          ${vacancy.skills.slice(0, 3).map(skill => {
            const isPrimary = PRIMARY_SKILLS.includes(String(skill).toLowerCase());
            return `<span class="footer-skill-tag ${isPrimary ? 'primary' : ''}">${escapeHtml(String(skill))}</span>`;
          }).join('')}
        </div>`;
    }

    const isValid = (val) => val && val !== 'null' && val !== 'не указано';
    const infoRows = [];
    const employment = isValid(vacancy.employment_type) ? vacancy.employment_type : '';
    const workFormat = isValid(vacancy.work_format) ? vacancy.work_format : '';
    const formatValue = [employment, workFormat].filter(Boolean).join(' / ');
    if (formatValue) infoRows.push({icon: '📋', label: 'ФОРМАТ', value: formatValue});
    if (isValid(vacancy.salary_display_text)) infoRows.push({icon: '💰', label: 'ОПЛАТА', value: vacancy.salary_display_text, highlight: true, highlightClass: 'salary'});
    if (isValid(vacancy.industry) || isValid(vacancy.company_name)) {
      const industryText = isValid(vacancy.industry) ? vacancy.industry : '';
      let companyName = isValid(vacancy.company_name) ? vacancy.company_name : '';
      if (isValid(vacancy.company_url) && companyName) {
        const safeCompany = sanitizeUrl(vacancy.company_url);
        if (safeCompany) companyName = `<a href="${safeCompany}" target="_blank" rel="noopener">${escapeHtml(companyName)}</a>`;
        else companyName = escapeHtml(companyName);
      } else {
        companyName = escapeHtml(companyName);
      }
      const sphereValue = `${escapeHtml(industryText)} ${companyName ? `(${companyName})` : ''}`.trim();
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

    const originalDetailsRaw = vacancy.text_highlighted ? stripTags(String(vacancy.text_highlighted)) : '';
    const bestImageUrl = pickImageUrl(vacancy, originalDetailsRaw);
    const cleanedDetailsText = bestImageUrl ? cleanImageMarkers(originalDetailsRaw) : originalDetailsRaw;
    const attachmentsHTML = bestImageUrl ? `<div class="attachments"><a class="image-link-button" href="${bestImageUrl}" target="_blank" rel="noopener noreferrer">Изображение</a></div>` : '';
    const hasAnyDetails = Boolean(cleanedDetailsText) || Boolean(attachmentsHTML);
    const detailsHTML = hasAnyDetails ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>` : '';

    const timestampHtml = `<span class="timestamp-footer">${escapeHtml(formatTimestamp(vacancy.timestamp))}</span>`;

    card.innerHTML = `
      <div class="card-actions">
        ${applyIconHtml}
        <button class="card-action-btn delete" onclick="updateStatus(event, '${vacancy.id}', 'new')" aria-label="Убрать из избранного">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div class="card-header"><h3>${escapeHtml(vacancy.category || 'NO_CATEGORY')}</h3></div>
      <div class="card-body">
        <p class="card-summary">${escapeHtml(vacancy.reason || 'Описание не было сгенерировано.')}</p>
        ${infoGridHtml}
        ${detailsHTML}
      </div>
      <div class="card-footer">
        ${skillsFooterHtml}
        ${timestampHtml}
      </div>`;

    const detailsEl = card.querySelector('.vacancy-text');
    if (detailsEl) {
      detailsEl.innerHTML = attachmentsHTML + escapeHtml(cleanedDetailsText);
    }

    container.appendChild(card);
  }
}

// =========================
// Search + счётчик + пустое состояние
// =========================
function applySearchFav() {
  const q = (searchInputFav?.value || '').trim();
  const cards = Array.from(container.querySelectorAll('.vacancy-card'));
  const total = cards.length; let visible = 0;
  cards.forEach(card => {
    const haystack = (card.textContent || '').toLowerCase();
    const match = q === '' || haystack.includes(q.toLowerCase());
    card.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  // Плашка "ничего не найдено"
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

// =========================
// API
// =========================
async function updateStatus(event, vacancyId, newStatus) {
  const cardElement = document.getElementById(`card-${vacancyId}`);
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${vacancyId}`, {
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
      cardElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      cardElement.style.opacity = '0';
      cardElement.style.transform = 'scale(0.95)';
      setTimeout(() => {
        cardElement.remove();
        if (container.children.length === 0) {
          container.innerHTML = '<p class="empty-list">-- В избранном пусто --</p>';
        }
      }, 300);
    }
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
    if (tg && tg.showAlert) tg.showAlert('Не удалось обновить статус.');
  }
}

async function loadFavorites() {
  ensureFavSearchUI();
  container.innerHTML = '<p class="empty-list">Загрузка...</p>';
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?status=eq.favorite&select=*`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!response.ok) throw new Error(`Ошибка сети: ${response.statusText}`);
    const items = await response.json();
    if (items) items.sort((a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp));
    renderFavorites(items);
    document.dispatchEvent(new CustomEvent('favorites:loaded'));
  } catch (error) {
    console.error('Ошибка загрузки избранного:', error);
    container.innerHTML = `<p class=\"empty-list\">Ошибка: ${escapeHtml(error.message)}</p>`;
    document.dispatchEvent(new CustomEvent('favorites:loaded'));
  }
}

// =========================
// Pull‑to‑refresh для избранного
// =========================
(function setupPTRFav(){
  const threshold = 70; // px
  let startY = 0; let pulling = false; let ready = false; let locked = false; let distance = 0;
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:0;right:0;top:0;height:56px;background:var(--card-color);color:var(--hint-color);border-bottom:var(--border-width) solid var(--border-color);display:flex;align-items:center;justify-content:center;transform:translateY(-100%);transition:transform .2s ease;z-index:9999;font-family:inherit;';
  bar.textContent = 'Потяните вниз для обновления';
  document.body.appendChild(bar);

  const setBar = y => { bar.style.transform = `translateY(${Math.min(0, -100 + (y/0.56))}%)`; };
  const resetBar = () => { bar.style.transform = 'translateY(-100%)'; };

  window.addEventListener('touchstart', (e)=>{
    if (locked) return;
    if (window.scrollY > 0) { pulling = false; return; }
    startY = e.touches[0].clientY; pulling = true; ready = false; distance = 0;
  }, {passive:true});

  window.addEventListener('touchmove', (e)=>{
    if (!pulling || locked) return;
    const y = e.touches[0].clientY;
    distance = y - startY;
    if (distance > 0) {
      e.preventDefault();
      setBar(Math.min(distance, threshold*1.5));
      if (distance > threshold && !ready) { ready = true; bar.textContent = 'Отпустите для обновления'; }
      if (distance <= threshold && ready) { ready = false; bar.textContent = 'Потяните вниз для обновления'; }
    }
  }, {passive:false});

  window.addEventListener('touchend', ()=>{
    if (!pulling || locked) { resetBar(); pulling=false; return; }
    if (ready) {
      locked = true; bar.textContent = 'Обновляю…'; setBar(threshold*1.2);
      const done = ()=>{ locked=false; ready=false; pulling=false; resetBar(); };
      const onLoaded = ()=>{ document.removeEventListener('favorites:loaded', onLoaded); done(); };
      document.addEventListener('favorites:loaded', onLoaded);
      loadFavorites();
      setTimeout(()=>{ if (locked) { done(); } }, 8000);
    } else { resetBar(); pulling=false; }
  }, {passive:true});
})();

// Events
searchInputFav?.addEventListener('input', debounce(applySearchFav, 200));

// Initial
ensureFavSearchUI();
loadFavorites();
