const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
if (tg) tg.expand();

// --- SUPABASE SETUP ---
const SUPABASE_URL = 'https://lwfhtwnfqmdjwzrdznvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4';
// --- END OF SETUP ---

const PRIMARY_SKILLS = ['after effects', 'unity', 'монтаж видео', '2d-анимация', 'рилсы', 'premiere pro'];

// Page Elements
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

// =========================
// Helpers (debounce/sanitize/highlight/progress/time)
// =========================
const debounce = (fn, delay = 250) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; };
const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const stripTags = (html = '') => { const tmp = document.createElement('div'); tmp.innerHTML = html; return tmp.textContent || tmp.innerText || ''; };

function normalizeUrl(raw = '') {
  let s = String(raw).trim();
  if (!s) return '';
  // t.me без протокола → https://t.me/...
  if (/^(t\.me|telegram\.me)\//i.test(s)) s = 'https://' + s;
  // домен без протокола → добавим https
  if (/^([a-z0-9-]+)\.[a-z]{2,}/i.test(s) && !/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { return new URL(s, window.location.origin).href; } catch { return ''; }
}
function isHttpUrl(u = '') { return /^https?:\/\//i.test(u); }
function sanitizeUrl(raw = '') { const norm = normalizeUrl(raw); return isHttpUrl(norm) ? norm : ''; }

const highlightText = (text = '', q = '') => {
  if (!q) return escapeHtml(text);
  const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, 'gi');
  return escapeHtml(text).replace(rx, '<mark class="highlight">$1</mark>');
};

const setProgress = (pct = 0) => { if (progressBar) progressBar.style.width = Math.max(0, Math.min(100, pct)) + '%'; };
const startProgress = () => setProgress(5);
const finishProgress = () => setTimeout(() => setProgress(100), 0);
const resetProgress = () => setTimeout(() => setProgress(0), 200);

function openLink(url) {
  const safe = sanitizeUrl(url);
  if (!safe) return;
  if (tg && typeof tg.openLink === 'function') tg.openLink(safe);
  else window.open(safe, '_blank', 'noopener');
}

function getEmptyStateHtml(message) {
  const catGifUrl = 'https://raw.githubusercontent.com/OshuNik/oshu_vacancies/5325db67878d324810971a262d689ea2ec7ac00f/img/Uploading%20a%20vacancy.%20The%20doggie.gif';
  return `<div class="empty-state"><img src="${catGifUrl}" alt="Спящий котик" class="empty-state-gif" /><p class="empty-state-text">${escapeHtml(message)}</p></div>`;
}

function showCustomConfirm(message, callback) {
  confirmText.textContent = message;
  confirmOverlay.classList.remove('hidden');
  confirmOkBtn.onclick = () => { confirmOverlay.classList.add('hidden'); callback(true); };
  confirmCancelBtn.onclick = () => { confirmOverlay.classList.add('hidden'); callback(false); };
}

// ==== умное время (RU) ====
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
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
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
  if (msg) return msg;  // приоритет — пост
  if (img) return img;  // fallback — файл
  return '';
}

// =========================
// Search UI (счётчик снизу)
// =========================
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
  if (!q) { searchStatsEl.textContent = ''; return; }
  searchStatsEl.textContent = visible === 0 ? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`;
}

// =========================
// Search (debounced) + highlight
// =========================
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

  // Плашка "ничего не найдено" (только если карточки есть, но все скрыты)
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

  updateSearchStats(visible, total);
};

// =========================
// API functions
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
        parentList.innerHTML = getEmptyStateHtml('-- Пусто в этой категории --');
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

async function clearCategory(categoryName) {
  if (!categoryName) return;
  showCustomConfirm(`Вы уверены, что хотите удалить все из категории "${categoryName}"?`, async (isConfirmed) => {
    if (!isConfirmed) return;
    const activeList = document.querySelector('.vacancy-list.active');
    if (activeList) { activeList.querySelectorAll('.vacancy-card').forEach(card => card.style.opacity = '0'); }
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?category=eq.${categoryName}&status=eq.new`, {
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
        const categoryKey = Object.keys(containers).find(key => containers[key] === activeList);
        if (categoryKey) counts[categoryKey].textContent = '(0)';
      }
    } catch (error) {
      console.error('Ошибка очистки категории:', error);
      if (tg && tg.showAlert) tg.showAlert('Не удалось очистить категорию.');
    }
  });
}

function renderVacancies(container, vacancies) {
  if (!container) return;
  container.innerHTML = '';

  if (!vacancies || vacancies.length === 0) {
    container.innerHTML = getEmptyStateHtml('-- Пусто в этой категории --');
    return;
  }

  for (const v of vacancies) {
    const card = document.createElement('div');
    card.className = 'vacancy-card';
    card.id = `card-${v.id}`;
    if (v.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
    else if (v.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
    else card.classList.add('category-other');

    const isValid = (val) => val && val !== 'null' && val !== 'не указано';

    let applyIconHtml = '';
    const safeApply = sanitizeUrl(v.apply_url || '');
    if (safeApply) {
      applyIconHtml = `<button class=\"card-action-btn apply\" onclick=\"openLink('${safeApply}')\" aria-label=\"Откликнуться\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"22\" y1=\"2\" x2=\"11\" y2=\"13\"></line><polygon points=\"22 2 15 22 11 13 2 9 22 2\"></polygon></svg></button>`;
    }

    let skillsFooterHtml = '';
    if (Array.isArray(v.skills) && v.skills.length > 0) {
      skillsFooterHtml = `<div class=\"footer-skill-tags\">${v.skills.slice(0, 3).map(skill => {
        const isPrimary = PRIMARY_SKILLS.includes(String(skill).toLowerCase());
        return `<span class=\"footer-skill-tag ${isPrimary ? 'primary' : ''}\">${escapeHtml(String(skill))}</span>`;
      }).join('')}</div>`;
    }

    const infoRows = [];
    const employment = isValid(v.employment_type) ? v.employment_type : '';
    const workFormat = isValid(v.work_format) ? v.work_format : '';
    const formatValue = [employment, workFormat].filter(Boolean).join(' / ');
    if (formatValue) infoRows.push({label: 'ФОРМАТ', value: formatValue, type: 'default'});
    if (isValid(v.salary_display_text)) infoRows.push({label: 'ОПЛАТА', value: v.salary_display_text, type: 'salary'});

    const industryText = isValid(v.industry) ? v.industry : '';
    const companyText = isValid(v.company_name) ? `(${v.company_name})` : '';
    const sphereValue = `${industryText} ${companyText}`.trim();
    if (sphereValue) infoRows.push({label: 'СФЕРА', value: sphereValue, type: 'industry'});

    let infoWindowHtml = '';
    if (infoRows.length > 0) {
      infoWindowHtml = '<div class=\"info-window\">' + infoRows.map(row => {
        return `<div class=\"info-row info-row--${row.type}\"><div class=\"info-label\">${escapeHtml(row.label)} >>\</div><div class=\"info-value\">${escapeHtml(row.value)}</div></div>`;
      }).join('') + '</div>';
    }

    const originalSummary = v.reason || 'Описание не было сгенерировано.';
    const q = (searchInput?.value || '').trim();

    const originalDetailsRaw = v.text_highlighted ? stripTags(String(v.text_highlighted)) : '';
    const bestImageUrl = pickImageUrl(v, originalDetailsRaw);
    const cleanedDetailsText = bestImageUrl ? cleanImageMarkers(originalDetailsRaw) : originalDetailsRaw;

    const attachmentsHTML = bestImageUrl ? `<div class=\"attachments\"><a class=\"image-link-button\" href=\"${bestImageUrl}\" target=\"_blank\" rel=\"noopener noreferrer\">Изображение</a></div>` : '';

    const hasAnyDetails = Boolean(cleanedDetailsText) || Boolean(attachmentsHTML);
    const detailsHTML = hasAnyDetails ? `<details><summary>Показать полный текст</summary><div class=\"vacancy-text\" style=\"margin-top:10px;\"></div></details>` : '';

    const channelHtml = isValid(v.channel) ? `<span class=\"channel-name\">${escapeHtml(v.channel)}</span>` : '';
    const timestampHtml = `<span class=\"timestamp-footer\">${escapeHtml(formatTimestamp(v.timestamp))}</span>`;
    const separator = channelHtml && timestampHtml ? ' • ' : '';
    const footerMetaHtml = `<div class=\"footer-meta\">${channelHtml}${separator}${timestampHtml}</div>`;

    const cardHTML = `
      <div class=\"card-actions\">
        ${applyIconHtml}
        <button class=\"card-action-btn favorite\" onclick=\"updateStatus(event, '${v.id}', 'favorite')\" aria-label=\"В избранное\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z\"/></svg></button>
        <button class=\"card-action-btn delete\" onclick=\"updateStatus(event, '${v.id}', 'deleted')\" aria-label=\"Удалить\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"></line><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"></line></svg></button>
      </div>
      <div class=\"card-header\"><h3>${escapeHtml(v.category || 'NO_CATEGORY')}</h3></div>
      <div class=\"card-body\">
        <p class=\"card-summary\"></p>
        ${infoWindowHtml}
        ${detailsHTML}
      </div>
      <div class=\"card-footer\">
        ${skillsFooterHtml}
        ${footerMetaHtml}
      </div>`;

    card.innerHTML = cardHTML;

    // store searchable text & originals
    const searchChunks = [v.category, v.reason, industryText, v.company_name, Array.isArray(v.skills) ? v.skills.join(' ') : '', cleanedDetailsText].filter(Boolean);
    card.dataset.searchText = searchChunks.join(' ').toLowerCase();

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

    container.appendChild(card);
  }
}

async function loadVacancies() {
  ensureSearchUI();
  headerActions.classList.add('hidden');
  vacanciesContent.classList.add('hidden');
  searchContainer.classList.add('hidden');
  categoryTabs.classList.add('hidden');

  startProgress();
  loader.classList.remove('hidden');

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?status=eq.new&select=*`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!response.ok) throw new Error(`Ошибка сети: ${response.statusText}`);

    const items = await response.json();
    finishProgress();

    Object.values(containers).forEach(c => c.innerHTML = '');

    if (!items || items.length === 0) {
      containers.main.innerHTML = getEmptyStateHtml('Новых вакансий нет');
    } else {
      items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const mainVacancies = items.filter(item => item.category === 'ТОЧНО ТВОЁ');
      const maybeVacancies = items.filter(item => item.category === 'МОЖЕТ БЫТЬ');
      const otherVacancies = items.filter(item => !['ТОЧНО ТВОЁ', 'МОЖЕТ БЫТЬ'].includes(item.category));

      counts.main.textContent = `(${mainVacancies.length})`;
      counts.maybe.textContent = `(${maybeVacancies.length})`;
      counts.other.textContent = `(${otherVacancies.length})`;

      renderVacancies(containers.main, mainVacancies);
      renderVacancies(containers.maybe, maybeVacancies);
      renderVacancies(containers.other, otherVacancies);
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
    }, 250);

  } catch (error) {
    console.error('Ошибка загрузки:', error);
    loader.innerHTML = `<p class=\"empty-list\">Ошибка: ${escapeHtml(error.message)}</p>`;
    setProgress(100);
    resetProgress();
    document.dispatchEvent(new CustomEvent('vacancies:loaded'));
  }
}

// --- EVENT LISTENERS ---
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
    if (longPressTriggered) { return; }
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

// =========================
// Pull‑to‑refresh
// =========================
(function setupPTR(){
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
      const onLoaded = ()=>{ document.removeEventListener('vacancies:loaded', onLoaded); done(); };
      document.addEventListener('vacancies:loaded', onLoaded);
      loadVacancies();
      // safety fallback
      setTimeout(()=>{ if (locked) { done(); } }, 8000);
    } else { resetBar(); pulling=false; }
  }, {passive:true});
})();

// Initial load
ensureSearchUI();
loadVacancies();
