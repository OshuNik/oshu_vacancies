// favorites.js — полная, синхронизированная версия
// UI: крестик внутри поля поиска, счётчик ниже; кнопка «Изображение» в details,
// ссылка ведёт на message_link, показывается только если есть has_image === true

const tg = window.Telegram?.WebApp || { openLink: (url) => window.open(url, '_blank') };
tg.expand?.();

// --- SUPABASE SETUP ---
const SUPABASE_URL = 'https://lwfhtwnfqmdjwzrdznvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4';
// --- END OF SETUP ---

const PRIMARY_SKILLS = ['after effects', 'unity', 'монтаж видео', '2d-анимация', 'рилсы', 'premiere pro'];

// DOM
const container = document.getElementById('favorites-list');
const searchContainerFav = document.getElementById('search-container-fav');
const searchInputFav = document.getElementById('search-input-fav');

// Elements, created on demand
let favStatsEl = null;
let favClearBtn = null;

// Utils
function openLink(url) { if (url) tg.openLink(url); }
function formatTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function getEmptyStateHtml(message) {
  const gif = 'https://raw.githubusercontent.com/OshuNik/oshu_vacancies/5325db67878d324810971a262d689ea2ec7ac00f/img/Uploading%20a%20vacancy.%20The%20doggie.gif';
  return `<div class="empty-state"><img class="empty-state-gif" src="${gif}" alt="Пусто"/><p class="empty-state-text">${message}</p></div>`;
}
function isValid(v) { return !!(v && v !== 'null' && v !== 'не указано'); }

// Search UI (крестик внутри, счётчик снаружи)
function ensureFavSearchUI() {
  if (!searchContainerFav || !searchInputFav) return;
  // кнопка очистки
  if (!favClearBtn) {
    favClearBtn = document.createElement('button');
    favClearBtn.type = 'button';
    favClearBtn.className = 'search-clear-btn';
    favClearBtn.setAttribute('aria-label', 'Очистить');
    favClearBtn.textContent = '×';
    favClearBtn.onclick = () => { searchInputFav.value = ''; applySearchFav(); searchInputFav.focus(); };
    searchContainerFav.appendChild(favClearBtn);
  }
  // счётчик — сразу ПОСЛЕ контейнера, чтобы не менять его высоту
  if (!favStatsEl) {
    favStatsEl = document.createElement('div');
    favStatsEl.className = 'search-stats';
    // если по старой разметке был счётчик внутри контейнера — удалим
    searchContainerFav.querySelectorAll('.search-stats').forEach(n => n.remove());
    searchContainerFav.insertAdjacentElement('afterend', favStatsEl);
  }
}

// Render
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

    // Кнопка «Откликнуться»
    let applyIconHtml = '';
    if (isValid(vacancy.apply_url)) {
      applyIconHtml = `
        <button class="card-action-btn apply" onclick="openLink('${vacancy.apply_url}')" title="Откликнуться">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>`;
    }

    // Список навыков (до 3), выделяем основные
    let skillsFooterHtml = '';
    if (Array.isArray(vacancy.skills) && vacancy.skills.length) {
      const tags = vacancy.skills.slice(0, 3).map(skill => {
        const primary = PRIMARY_SKILLS.includes(String(skill).toLowerCase());
        return `<span class="footer-skill-tag ${primary ? 'primary' : ''}">${skill}</span>`;
      }).join('');
      skillsFooterHtml = `<div class="footer-skill-tags">${tags}</div>`;
    }

    // Инфоблок
    const infoRows = [];
    const employment = isValid(vacancy.employment_type) ? vacancy.employment_type : '';
    const workFormat = isValid(vacancy.work_format) ? vacancy.work_format : '';
    const formatValue = [employment, workFormat].filter(Boolean).join(' / ');
    if (isValid(formatValue)) infoRows.push({ label: 'ФОРМАТ', value: formatValue, type: 'default' });

    if (isValid(vacancy.salary_display_text)) infoRows.push({ label: 'ОПЛАТА', value: vacancy.salary_display_text, type: 'salary' });

    const industryText = isValid(vacancy.industry) ? vacancy.industry : '';
    const companyText = isValid(vacancy.company_name) ? `(${vacancy.company_name})` : '';
    const sphereValue = `${industryText} ${companyText}`.trim();
    if (sphereValue) infoRows.push({ label: 'СФЕРА', value: sphereValue, type: 'industry' });

    let infoWindowHtml = '';
    if (infoRows.length) {
      infoWindowHtml = '<div class="info-window">' + infoRows.map(r => `
        <div class="info-row info-row--${r.type}">
          <div class="info-label">${r.label} >></div>
          <div class="info-value">${r.value}</div>
        </div>`).join('') + '</div>';
    }

    // Полный текст (+кнопка «Изображение» только если есть картинка)
    let attachments = '';
    if (vacancy.has_image === true && isValid(vacancy.message_link)) {
      const url = vacancy.message_link;
      attachments = `<div class="attachments"><a class="image-link-button" href="${url}" target="_blank" rel="noopener">Изображение</a></div>`;
    }
    const detailsHTML = vacancy.text_highlighted
      ? `<details><summary>Показать полный текст</summary><div class="vacancy-text">${attachments}${vacancy.text_highlighted}</div></details>`
      : '';

    const channelHtml = isValid(vacancy.channel) ? `<span class="channel-name">${vacancy.channel}</span>` : '';
    const timestampHtml = `<span class="timestamp-footer">${formatTimestamp(vacancy.timestamp)}</span>`;
    const separator = channelHtml && timestampHtml ? ' • ' : '';
    const footerMetaHtml = `<div class="footer-meta">${channelHtml}${separator}${timestampHtml}</div>`;

    card.innerHTML = `
      <div class="card-actions">
        ${applyIconHtml}
        <button class="card-action-btn delete" onclick="updateStatusFav(event, '${vacancy.id}', 'new')" title="Убрать из избранного">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6"  y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="card-header"><h3>${vacancy.category || 'NO_CATEGORY'}</h3></div>
      <div class="card-body">
        <p class="card-summary">${vacancy.reason || 'Описание не было сгенерировано.'}</p>
        ${infoWindowHtml}
        ${detailsHTML}
      </div>
      <div class="card-footer">${skillsFooterHtml}${footerMetaHtml}</div>`;

    container.appendChild(card);
  }
}

// Status update (из избранного -> new)
async function updateStatusFav(event, vacancyId, newStatus) {
  const card = document.getElementById(`card-${vacancyId}`);
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${vacancyId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (card) {
      card.style.transition = 'opacity .3s ease, transform .3s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.95)';
      setTimeout(() => {
        card.remove();
        if (!container.children.length) {
          container.innerHTML = '<p class="empty-list">-- В избранном пусто --</p>';
        }
        applySearchFav();
      }, 300);
    }
  } catch (e) {
    console.error('Ошибка обновления статуса:', e);
    tg.showAlert?.('Не удалось обновить статус.');
  }
}

// Search logic
function applySearchFav() {
  const query = (searchInputFav?.value || '').trim().toLowerCase();
  const cards = container.querySelectorAll('.vacancy-card');
  let visible = 0;
  cards.forEach(card => {
    const show = !query || card.textContent.toLowerCase().includes(query);
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  if (favStatsEl) {
    if (!cards.length) {
      favStatsEl.textContent = '';
    } else if (!visible) {
      favStatsEl.textContent = 'Ничего не найдено';
    } else {
      favStatsEl.textContent = `Найдено: ${visible} из ${cards.length}`;
    }
  }
}

// Load
async function loadFavorites() {
  if (!container) return;
  container.innerHTML = '<p class="empty-list">Загрузка…</p>';
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?status=eq.favorite&select=*`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    if (Array.isArray(items)) items.sort((a, b) => new Date(b.timestamp || b.created_at) - new Date(a.timestamp || a.created_at));
    renderFavorites(items);
  } catch (e) {
    console.error('Ошибка загрузки избранного:', e);
    container.innerHTML = `<p class="empty-list">Ошибка: ${e.message}</p>`;
  }
  ensureFavSearchUI();
  applySearchFav();
}

// Init
if (searchInputFav) {
  searchInputFav.addEventListener('input', applySearchFav);
}

// глобально используемые функции из html-строк
window.updateStatusFav = updateStatusFav;
window.openLink = openLink;

loadFavorites();
