const tg = window.Telegram.WebApp;
tg.expand();

// --- SUPABASE SETUP ---
const SUPABASE_URL = 'https://lwfhtwnfqmdjwzrdznvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4';
// --- END OF SETUP ---

const PRIMARY_SKILLS = ['after effects', 'unity', 'монтаж видео', '2d-анимация', 'рилсы', 'premiere pro'];

// Page Elements
const containers = {
  main: document.getElementById('vacancies-list-main'),
  maybe: document.getElementById('vacancies-list-maybe'),
  other: document.getElementById('vacancies-list-other')
};
const counts = {
  main: document.getElementById('count-main'),
  maybe: document.getElementById('count-maybe'),
  other: document.getElementById('count-other')
};
const tabButtons = document.querySelectorAll('.tab-button');
const vacancyLists = document.querySelectorAll('.vacancy-list');
const refreshBtn = document.getElementById('refresh-button');
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
// Helpers (debounce/sanitize/highlight/progress)
// =========================
const debounce = (fn, delay = 250) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; };
const escapeHtml = (s = '') => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const stripTags = (html = '') => { const tmp = document.createElement('div'); tmp.innerHTML = html; return tmp.textContent || tmp.innerText || ''; };
const sanitizeUrl = (url = '') => { try { const u = new URL(url, window.location.origin); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '#'; } catch { return '#'; } };
const highlightText = (text = '', q = '') => {
  if (!q) return escapeHtml(text);
  const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, 'gi');
  return escapeHtml(text).replace(rx, '<mark class="highlight">$1</mark>');
};

const setProgress = (pct = 0) => { if (progressBar) progressBar.style.width = Math.max(0, Math.min(100, pct)) + '%'; };
const startProgress = () => setProgress(5);
const finishProgress = () => setTimeout(() => setProgress(100), 0);
const resetProgress = () => setTimeout(() => setProgress(0), 200);

function openLink(url) { const safe = sanitizeUrl(url); if (safe && safe !== '#') tg.openLink(safe); }

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

function formatTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// =========================
// Search (debounced) + highlight
// =========================
const applySearch = () => {
  const q = (searchInput?.value || '').trim();
  const activeList = document.querySelector('.vacancy-list.active');
  if (!activeList) return;
  const cards = activeList.querySelectorAll('.vacancy-card');
  cards.forEach(card => {
    const haystack = (card.dataset.searchText || card.textContent || '').toLowerCase();
    const match = q === '' || haystack.includes(q.toLowerCase());
    card.style.display = match ? '' : 'none';

    const summaryEl = card.querySelector('.card-summary');
    const detailsEl = card.querySelector('.vacancy-text');
    if (summaryEl && summaryEl.dataset.originalSummary !== undefined) {
      summaryEl.innerHTML = highlightText(summaryEl.dataset.originalSummary || '', q);
    }
    if (detailsEl && detailsEl.dataset.originalText !== undefined) {
      // Кнопка изображения остаётся как есть; подсвечиваем только текст после неё
      const imgBtn = detailsEl.querySelector('.image-link-button');
      const restText = detailsEl.dataset.originalText || '';
      const textHtml = highlightText(restText, q);
      if (imgBtn) {
        detailsEl.innerHTML = imgBtn.outerHTML + textHtml;
      } else {
        detailsEl.innerHTML = textHtml;
      }
    }
  });
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
    tg.showAlert('Не удалось обновить статус.');
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
      tg.showAlert('Не удалось очистить категорию.');
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
    if (isValid(v.apply_url)) {
      const safeApply = sanitizeUrl(v.apply_url);
      if (safeApply && safeApply !== '#') {
        applyIconHtml = `<button class="card-action-btn apply" onclick="openLink('${safeApply}')" aria-label="Откликнуться"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>`;
      }
    }

    let skillsFooterHtml = '';
    if (Array.isArray(v.skills) && v.skills.length > 0) {
      skillsFooterHtml = `<div class="footer-skill-tags">${v.skills.slice(0, 3).map(skill => {
        const isPrimary = PRIMARY_SKILLS.includes(String(skill).toLowerCase());
        return `<span class="footer-skill-tag ${isPrimary ? 'primary' : ''}">${escapeHtml(String(skill))}</span>`;
      }).join('')}</div>`;
    }

    const infoRows = [];
    const employment = isValid(v.employment_type) ? v.employment_type : '';
    const workFormat = isValid(v.work_format) ? v.work_format : '';
    const formatValue = [employment, workFormat].filter(Boolean).join(' / ');
    if (isValid(formatValue)) infoRows.push({label: 'ФОРМАТ', value: formatValue, type: 'default'});

    if (isValid(v.salary_display_text)) infoRows.push({label: 'ОПЛАТА', value: v.salary_display_text, type: 'salary'});

    const industryText = isValid(v.industry) ? v.industry : '';
    const companyText = isValid(v.company_name) ? `(${v.company_name})` : '';
    const sphereValue = `${industryText} ${companyText}`.trim();
    if (sphereValue) infoRows.push({label: 'СФЕРА', value: sphereValue, type: 'industry'});

    let infoWindowHtml = '';
    if (infoRows.length > 0) {
      infoWindowHtml = '<div class="info-window">' + infoRows.map(row => {
        return `<div class="info-row info-row--${row.type}"><div class="info-label">${escapeHtml(row.label)} >></div><div class="info-value">${escapeHtml(row.value)}</div></div>`;
      }).join('') + '</div>';
    }

    // Summary & details
    const originalSummary = v.reason || 'Описание не было сгенерировано.';
    const q = (searchInput?.value || '').trim();

    // Подготовим кнопку изображения
    const safeImage = sanitizeUrl(v.image_link || '');
    const imageBtnHTML = (safeImage && safeImage !== '#') ? `<a class="image-link-button" href="${safeImage}" target="_blank" rel="noopener noreferrer">Изображение</a>` : '';

    // Текст полного описания (без HTML) для подсветки
    const originalDetailsText = v.text_highlighted ? stripTags(String(v.text_highlighted)) : '';

    // Показываем details, если есть либо текст, либо картинка
    const hasAnyDetails = Boolean(originalDetailsText) || Boolean(imageBtnHTML);
    const detailsHTML = hasAnyDetails ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>` : '';

    const channelHtml = isValid(v.channel) ? `<span class="channel-name">${escapeHtml(v.channel)}</span>` : '';
    const timestampHtml = `<span class="timestamp-footer">${escapeHtml(formatTimestamp(v.timestamp))}</span>`;
    const separator = channelHtml && timestampHtml ? ' • ' : '';
    const footerMetaHtml = `<div class="footer-meta">${channelHtml}${separator}${timestampHtml}</div>`;

    card.innerHTML = `
      <div class="card-actions">
        ${applyIconHtml}
        <button class="card-action-btn favorite" onclick="updateStatus(event, '${v.id}', 'favorite')" aria-label="В избранное"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>
        <button class="card-action-btn delete" onclick="updateStatus(event, '${v.id}', 'deleted')" aria-label="Удалить"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
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

    // store searchable text & originals
    const searchChunks = [v.category, v.reason, industryText, v.company_name, Array.isArray(v.skills) ? v.skills.join(' ') : '', originalDetailsText].filter(Boolean);
    card.dataset.searchText = searchChunks.join(' ').toLowerCase();

    const summaryEl = card.querySelector('.card-summary');
    if (summaryEl) {
      summaryEl.dataset.originalSummary = originalSummary;
      summaryEl.innerHTML = highlightText(originalSummary, q);
    }

    const detailsEl = card.querySelector('.vacancy-text');
    if (detailsEl) {
      // Сохраняем исходный текст для подсветки и добавляем кнопку изображения внутри блока
      detailsEl.dataset.originalText = originalDetailsText;
      const textHtml = highlightText(originalDetailsText, q);
      detailsEl.innerHTML = `${imageBtnHTML}${textHtml}`;
    }

    container.appendChild(card);
  }
}

async function loadVacancies() {
  headerActions.classList.add('hidden');
  vacanciesContent.classList.add('hidden');
  searchContainer.classList.add('hidden');
  categoryTabs.classList.add('hidden');
  refreshBtn.classList.add('hidden');

  startProgress();
  loader.classList.remove('hidden');

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?status=eq.new&select=*`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!response.ok) throw new Error(`Ошибка сети: ${response.statusText}`);

    const items = await response.json();
    finishProgress();

    Object.values(containers).forEach(container => container.innerHTML = '');

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
      refreshBtn.classList.remove('hidden');
      if (items && items.length > 0) searchContainer.classList.remove('hidden');
      applySearch();
      resetProgress();
    }, 250);

  } catch (error) {
    console.error('Ошибка загрузки:', error);
    loader.innerHTML = `<p class="empty-list">Ошибка: ${escapeHtml(error.message)}</p>`;
    setProgress(100); resetProgress();
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
refreshBtn?.addEventListener('click', loadVacancies);

// Initial load
loadVacancies();
