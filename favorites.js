const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
if (tg) tg.expand();

// --- SUPABASE SETUP ---
const SUPABASE_URL = 'https://lwfhtwnfqmdjwzrdznvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4';
// --- END OF SETUP ---

// Список ваших основных навыков для подсветки/тегов
const PRIMARY_SKILLS = ['after effects', 'unity', 'монтаж видео', '2d-анимация', 'рилсы', 'premiere pro'];

const container = document.getElementById('favorites-list');
const searchInputFav = document.getElementById('search-input-fav'); // на будущее

// =========================
// Helpers
// =========================
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

function openLink(url) {
  const safe = sanitizeUrl(url);
  if (!safe) return;
  if (tg && typeof tg.openLink === 'function') tg.openLink(safe);
  else window.open(safe, '_blank', 'noopener');
}

function formatTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Маркеры наличия изображения в тексте
function containsImageMarker(text = '') {
  return /(\[\s*изображени[ея]\s*\]|\b(изображени[ея]|фото|картинк\w|скрин)\b)/i.test(text);
}
function cleanImageMarkers(text = '') {
  return String(text).replace(/\[\s*изображени[ея]\s*\]/gi, '').replace(/\s{2,}/g, ' ').trim();
}

// Выбор URL для кнопки (message_link в приоритете, затем image_link)
function pickImageUrl(v, detailsText = '') {
  const msg = sanitizeUrl(v.message_link || '');
  const img = sanitizeUrl(v.image_link || '');
  const hasMarker = containsImageMarker(detailsText) || containsImageMarker(v.reason || '');
  const allow = (v.has_image === true) || hasMarker;
  if (!allow) return '';
  if (msg) return msg;   // переход на пост — приоритет
  if (img) return img;   // fallback — прямая картинка
  return '';
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

    // Кнопка отклика
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

    // Теги навыков
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

    // Инфо-рядки
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
    if (isValid(vacancy.channel)) infoRows.push({icon: '📢', label: 'КАНАЛ', value: escapeHtml(vacancy.channel)});

    let infoGridHtml = '';
    if (infoRows.length > 0) {
      infoGridHtml = '<div class="info-grid">';
      infoRows.forEach(row => {
        const valueHtml = row.highlight ? `<span class="value-highlight ${row.highlightClass}">${row.value}</span>` : row.value;
        infoGridHtml += `<div class="info-label"><span>${row.icon}</span> ${row.label} >></div><div class="info-value">${valueHtml}</div>`;
      });
      infoGridHtml += '</div>';
    }

    // Полный текст + кнопка "Изображение"
    const originalDetailsRaw = vacancy.text_highlighted ? stripTags(String(vacancy.text_highlighted)) : '';
    const bestImageUrl = pickImageUrl(vacancy, originalDetailsRaw);
    const cleanedDetailsText = bestImageUrl ? cleanImageMarkers(originalDetailsRaw) : originalDetailsRaw;
    const attachmentsHTML = bestImageUrl ? `<div class="attachments"><a class="image-link-button" href="${bestImageUrl}" target="_blank" rel="noopener noreferrer">Изображение</a></div>` : '';
    const hasAnyDetails = Boolean(cleanedDetailsText) || Boolean(attachmentsHTML);
    const detailsHTML = hasAnyDetails ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>` : '';

    // Разное внизу карточки
    const timestampHtml = `<span class="timestamp-footer">${escapeHtml(formatTimestamp(vacancy.timestamp))}</span>`;

    // Собираем карточку
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

    // наполняем полный текст
    const detailsEl = card.querySelector('.vacancy-text');
    if (detailsEl) {
      detailsEl.innerHTML = attachmentsHTML + escapeHtml(cleanedDetailsText);
    }

    container.appendChild(card);
  }
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
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ status: newStatus })
    });
    // анимация удаления
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
  container.innerHTML = '<p class="empty-list">Загрузка...</p>';
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?status=eq.favorite&select=*`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!response.ok) throw new Error(`Ошибка сети: ${response.statusText}`);
    const items = await response.json();
    if (items) items.sort((a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp));
    renderFavorites(items);
  } catch (error) {
    console.error('Ошибка загрузки избранного:', error);
    container.innerHTML = `<p class="empty-list">Ошибка: ${escapeHtml(error.message)}</p>`;
  }
}

// Initial load
loadFavorites();
