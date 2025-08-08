const tg = window.Telegram.WebApp;
tg.expand();

// --- SUPABASE SETUP ---
const SUPABASE_URL = 'https://lwfhtwnfqmdjwzrdznvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4';
// --- END OF SETUP ---

// Список ваших основных навыков для подсветки, как на главном экране
const PRIMARY_SKILLS = ['after effects', 'unity', 'монтаж видео', '2d-анимация', 'рилсы', 'premiere pro'];

const container = document.getElementById('favorites-list');
const searchInputFav = document.getElementById('search-input-fav');

// --- HELPER FUNCTIONS (Скопированы с главного экрана) ---
function openApplyLink(url) {
    if (url) {
        tg.openLink(url);
    }
}

function formatTimestamp(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('ru-RU', { 
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
    });
}

// Функция рендеринга, теперь идентичная той, что на главном экране
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
        if (vacancy.apply_url && vacancy.apply_url !== 'null') {
            applyIconHtml = `
            <button class="card-action-btn apply" onclick="openApplyLink('${vacancy.apply_url}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
            </button>`;
        }
        
        let skillsFooterHtml = '';
        if (vacancy.skills && vacancy.skills.length > 0) {
            skillsFooterHtml = `
            <div class="footer-skill-tags">
                ${vacancy.skills.slice(0, 3).map(skill => {
                    const isPrimary = PRIMARY_SKILLS.includes(skill.toLowerCase());
                    return `<span class="footer-skill-tag ${isPrimary ? 'primary' : ''}">${skill}</span>`;
                }).join('')}
            </div>`;
        }
        
        const infoRows = [];
        const isValid = (val) => val && val !== 'null' && val !== 'не указано';
        const employment = isValid(vacancy.employment_type) ? vacancy.employment_type : '';
        const workFormat = isValid(vacancy.work_format) ? vacancy.work_format : '';
        const formatValue = [employment, workFormat].filter(Boolean).join(' / ');
        if (isValid(formatValue)) infoRows.push({icon: '📋', label: 'ФОРМАТ', value: formatValue});
        if (isValid(vacancy.salary_display_text)) infoRows.push({icon: '💰', label: 'ОПЛАТА', value: vacancy.salary_display_text, highlight: true, highlightClass: 'salary'});
        if (isValid(vacancy.industry) || isValid(vacancy.company_name)) {
            const industryText = isValid(vacancy.industry) ? vacancy.industry : '';
            let companyName = isValid(vacancy.company_name) ? vacancy.company_name : '';
            if (isValid(vacancy.company_url) && companyName) companyName = `<a href="${vacancy.company_url}" target="_blank">${companyName}</a>`;
            const sphereValue = `${industryText} ${companyName ? `(${companyName})` : ''}`.trim();
            if (sphereValue) infoRows.push({icon: '🏢', label: 'СФЕРА', value: sphereValue, highlight: true, highlightClass: 'industry'});
        }
        if (isValid(vacancy.channel)) infoRows.push({icon: '📢', label: 'КАНАЛ', value: vacancy.channel});
        
        let infoGridHtml = '';
        if (infoRows.length > 0) {
            infoGridHtml = '<div class="info-grid">';
            infoRows.forEach(row => {
                const valueHtml = row.highlight ? `<span class="value-highlight ${row.highlightClass}">${row.value}</span>` : row.value;
                infoGridHtml += `<div class="info-label"><span>${row.icon}</span> ${row.label} >></div><div class="info-value">${valueHtml}</div>`;
            });
            infoGridHtml += '</div>';
        }

        const detailsHTML = vacancy.text_highlighted ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;">${vacancy.text_highlighted}</div></details>` : '';

        card.innerHTML = `
            <div class="card-actions">
                ${applyIconHtml}
                <button class="card-action-btn delete" onclick="updateStatus(event, '${vacancy.id}', 'new')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            <div class="card-header"><h3>${vacancy.category || 'NO_CATEGORY'}</h3></div>
            <div class="card-body">
                <p class="card-summary">${vacancy.reason || 'Описание не было сгенерировано.'}</p>
                ${infoGridHtml}
                ${detailsHTML}
            </div>
            <div class="card-footer">
                ${skillsFooterHtml}
                <span class="timestamp-footer">${formatTimestamp(vacancy.timestamp)}</span>
            </div>`;
        container.appendChild(card);
    }
}

async function updateStatus(event, vacancyId, newStatus) {
    const cardElement = document.getElementById(`card-${vacancyId}`);
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${vacancyId}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
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
        if (items) items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        renderFavorites(items);
    } catch (error) {
        console.error('Ошибка загрузки избранного:', error);
        container.innerHTML = `<p class="empty-list">Ошибка: ${error.message}</p>`;
    }
}

// Initial load
loadFavorites();
