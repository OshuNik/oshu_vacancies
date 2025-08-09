const tg = window.Telegram.WebApp;
tg.expand();

// --- SUPABASE SETUP ---
const SUPABASE_URL = 'https://lwfhtwnfqmdjwzrdznvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4';
// --- END OF SETUP ---

// Список ваших основных навыков для подсветки, как на главном экране
const PRIMARY_SKILLS = ['after effects', 'unity', 'монтаж видео', '2d-анимация', 'рилсы', 'premiere pro'];

const container = document.getElementById('favorites-list');

// --- Helpers: sanitize ---
const escapeHtml = (s = '') => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const sanitizeUrl = (url = '') => { try { const u = new URL(url, window.location.origin); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '#'; } catch { return '#'; } };
function openLink(url) { const safe = sanitizeUrl(url); if (safe && safe !== '#') tg.openLink(safe); }

function formatTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function renderFavorites(items) {
  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = '<p class="empty-list">-- В избранном пусто --</p>';
    return;
  }

  for (const v of items) {
    if (!v.id) continue;

    const card = document.createElement('div');
    card.className = 'vacancy-card';
    card.id = `card-${v.id}`;
    if (v.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
    else if (v.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
    else card.classList.add('category-other');

    let applyIconHtml = '';
    if (v.apply_url && v.apply_url !== 'null') {
      const safeApply = sanitizeUrl(v.apply_url);
      if (safeApply && safeApply !== '#') {
        applyIconHtml = `
          <button class="card-action-btn apply" onclick="openLink('${safeApply}')" aria-label="Откликнуться">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>`;
      }
    }

    let skillsFooterHtml = '';
    if (Array.isArray(v.skills) && v.skills.length > 0) {
      skillsFooterHtml = `
        <div class="footer-skill-tags">
          ${v.skills.slice(0, 3).map(skill => {
            const s = String(skill);
            const isPrimary = PRIMARY_SKILLS.includes(s.toLowerCase());
            return `<span class="footer-skill-tag ${isPrimary ? 'primary' : ''}">${escapeHtml(s)}</span>`;
          }).join('')}
        </div>`;
    }

    const isValid = (val) => val && val !== 'null' && val !== 'не указано';
    const infoRows = [];
    const employment = isValid(v.employment_type) ? v.employment_type : '';
    const workFormat = isValid(v.work_format) ? v.work_format : '';
    const formatValue = [employment, workFormat].filter(Boolean).join(' / ');
    if (isValid(formatValue)) infoRows.push({icon: '📋', label: 'ФОРМАТ', value: formatValue});
    if (isValid(v.salary_display_text)) infoRows.push({icon: '💰', label: 'ОПЛАТА', value: v.salary_display_text, highlight: true, highlightClass: 'salary'});
    if (isValid(v.industry) || isValid(v.company_name)) {
      const industryText = isValid(v.industry) ? v.industry : '';
      let companyName = isValid(v.company_name) ? v.company_name : '';
      const safeCompanyUrl = sanitizeUrl(v.company_url || '');
      if (safeCompanyUrl && companyName) companyName = `<a href="${safeCompanyUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(companyName)}</a>`;
      const sphereValue = `${industryText ? escapeHtml(industryText) : ''} ${companyName ? `(${companyName})` : ''}`.trim();
      if (sphereValue) infoRows.push({icon: '🏢', label: 'СФЕРА', value: sphereValue, highlight: true, highlightClass: 'industry'});
    }
    if (isValid(v.channel)) infoRows.push({icon: '📢', label: 'КАНАЛ', value: escapeHtml(v.channel)});

    let infoGridHtml = '';
    if (infoRows.length > 0) {
      infoGridHtml = '<div class="info-grid">' + infoRows.map(row => {
        const valueHtml = row.highlight ? `<span class="value-highlight ${row.highlightClass}">${row.value}</span>` : row.value;
        return `<div class="info-label"><span>${row.icon}</span> ${row.label} >></div><div class="info-value">${valueHtml}</div>`;
      }).join('') + '</div>';
    }

    // Image button (hotfix)
    const safeImage = sanitizeUrl(v.image_link || '');
    const imageBtnHTML = (safeImage && safeImage !== '#') ? `<a class="image-link-button" href="${safeImage}" target="_blank" rel="noopener noreferrer">Изображение</a>` : '';

    const detailsHTML = v.text_highlighted ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;">${v.text_highlighted}</div></details>` : '';

    card.innerHTML = `
      <div class="card-actions">
        ${applyIconHtml}
        <button class="card-action-btn delete" onclick="updateStatus(event, '${v.id}', 'new')" aria-label="Убрать из избранного">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div class="card-header"><h3>${escapeHtml(v.category || 'NO_CATEGORY')}</h3></div>
      <div class="card-body">
        <p class="card-summary">${escapeHtml(v.reason || 'Описание не было сгенерировано.')}</p>
        ${infoGridHtml}
        ${imageBtnHTML}
        ${detailsHTML}
      </div>
      <div class="card-footer">
        ${skillsFooterHtml}
        <span class="timestamp-footer">${escapeHtml(formatTimestamp(v.timestamp))}</span>
      </div>`;

    container.appendChild(card);
  }
}

async function updateStatus(event, vacancyId, newStatus) {
  const cardElement = document.getElementById(`card-${vacancyId}`);
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
    const payload = await r.json();
    if (!Array.isArray(payload) || !payload[0]) throw new Error('Empty response');

    cardElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    cardElement.style.opacity = '0';
    cardElement.style.transform = 'scale(0.95)';
    setTimeout(() => {
      cardElement.remove();
      if (container.children.length === 0) {
        container.innerHTML = '<p class="empty-list">-- В избранном пусто --</p>';
      }
    }, 300);
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
    tg.showAlert('Не удалось обновить статус.');
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
