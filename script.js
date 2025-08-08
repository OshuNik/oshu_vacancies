const tg = window.Telegram.WebApp;
tg.expand();

// --- SUPABASE SETUP ---
const SUPABASE_URL = 'https://lwfhtwnfqmdjwzrdznvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4';
// --- END OF SETUP ---

const PRIMARY_SKILLS = ['after effects', 'unity', 'монтаж видео', '2d-анимация', 'рилсы', 'premiere pro'];

// Page Elements
const containers = { main: document.getElementById('vacancies-list-main'), maybe: document.getElementById('vacancies-list-maybe'), other: document.getElementById('vacancies-list-other') };
const counts = { main: document.getElementById('count-main'), maybe: document.getElementById('count-maybe'), other: document.getElementById('count-other') };
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

// --- HELPER FUNCTIONS ---
function openApplyLink(url) {
    if (url) {
        tg.openLink(url);
    }
}

function getEmptyStateHtml(message) {
    const catGifUrl = 'https://raw.githubusercontent.com/OshuNik/oshu_vacancies/5325db67878d324810971a262d689ea2ec7ac00f/img/Uploading%20a%20vacancy.%20The%20doggie.gif'; 
    return `
    <div class="empty-state">
        <img src="${catGifUrl}" alt="Спящий котик" class="empty-state-gif" />
        <p class="empty-state-text">${message}</p>
    </div>`;
}

function showCustomConfirm(message, callback) { confirmText.textContent = message; confirmOverlay.classList.remove('hidden'); confirmOkBtn.onclick = () => { confirmOverlay.classList.add('hidden'); callback(true); }; confirmCancelBtn.onclick = () => { confirmOverlay.classList.add('hidden'); callback(false); };}
function formatTimestamp(isoString) { if (!isoString) return ''; const date = new Date(isoString); return date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });}
function filterVacancies() { const query = searchInput.value.toLowerCase(); const activeList = document.querySelector('.vacancy-list.active'); if (!activeList) return; const cards = activeList.querySelectorAll('.vacancy-card'); cards.forEach(card => { const cardText = card.textContent.toLowerCase(); if (cardText.includes(query)) { card.style.display = ''; } else { card.style.display = 'none'; } });}

// --- API FUNCTIONS & ANIMATIONS ---
async function updateStatus(event, vacancyId, newStatus) { const cardElement = document.getElementById(`card-${vacancyId}`); if (!cardElement) return; const parentList = cardElement.parentElement; const categoryKey = Object.keys(containers).find(key => containers[key] === parentList); try { await fetch(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${vacancyId}`, { method: 'PATCH', headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: newStatus }) }); cardElement.style.opacity = '0'; cardElement.style.transform = 'scale(0.95)'; setTimeout(() => { cardElement.remove(); if (parentList.querySelectorAll('.vacancy-card').length === 0) { parentList.innerHTML = getEmptyStateHtml("-- Пусто в этой категории --"); } const countSpan = counts[categoryKey]; let currentCount = parseInt(countSpan.textContent.replace(/\(|\)/g, '')); countSpan.textContent = `(${(currentCount - 1)})`; }, 300); } catch (error) { console.error('Ошибка обновления статуса:', error); tg.showAlert('Не удалось обновить статус.'); if (cardElement) { cardElement.style.opacity = '1'; cardElement.style.transform = 'scale(1)'; } } } 
async function clearCategory(categoryName) { if (!categoryName) return; showCustomConfirm(`Вы уверены, что хотите удалить все из категории "${categoryName}"?`, async (isConfirmed) => { if (isConfirmed) { const activeList = document.querySelector('.vacancy-list.active'); if (activeList) { const cards = activeList.querySelectorAll('.vacancy-card'); cards.forEach(card => card.style.opacity = '0'); } try { await fetch(`${SUPABASE_URL}/rest/v1/vacancies?category=eq.${categoryName}&status=eq.new`, { method: 'PATCH', headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: 'deleted' }) }); if (activeList) { activeList.innerHTML = getEmptyStateHtml("-- Пусто в этой категории --"); const categoryKey = Object.keys(containers).find(key => containers[key] === activeList); if (categoryKey) counts[categoryKey].textContent = '(0)'; } } catch (error) { console.error('Ошибка очистки категории:', error); tg.showAlert('Не удалось очистить категорию.'); } } }); }

function renderVacancies(container, vacancies) {
    if (!container) return;
    container.innerHTML = '';
    
    if (!vacancies || vacancies.length === 0) {
        container.innerHTML = getEmptyStateHtml("-- Пусто в этой категории --");
        return;
    }

    for (const vacancy of vacancies) {
        const card = document.createElement('div');
        card.className = 'vacancy-card';
        card.id = `card-${vacancy.id}`;
        if (vacancy.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
        else if (vacancy.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
        else card.classList.add('category-other');

        const isValid = (val) => val && val !== 'null' && val !== 'не указано';
        
        let applyIconHtml = '';
        if (isValid(vacancy.apply_url)) {
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
        
        const employment = isValid(vacancy.employment_type) ? vacancy.employment_type : '';
        const workFormat = isValid(vacancy.work_format) ? vacancy.work_format : '';
        const formatValue = [employment, workFormat].filter(Boolean).join(' / ');
        if (isValid(formatValue)) infoRows.push({icon: '📋', label: 'ФОРМАТ', value: formatValue});
        
        if (isValid(vacancy.salary_display_text)) infoRows.push({icon: '💰', label: 'ОПЛАТА', value: vacancy.salary_display_text, highlight: true, highlightClass: 'salary'});
        
        const industryText = isValid(vacancy.industry) ? vacancy.industry : '';
        let companyText = isValid(vacancy.company_name) ? vacancy.company_name : '';
        if (companyText && isValid(vacancy.company_url)) {
            companyText = `(<a href="${vacancy.company_url}" target="_blank">${companyText}</a>)`;
        } else if (companyText) {
            companyText = `(${companyText})`;
        }
        const sphereValue = `${industryText} ${companyText}`.trim();
        if (sphereValue) {
            infoRows.push({icon: '🏢', label: 'СФЕРА', value: sphereValue, highlight: true, highlightClass: 'industry'});
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

        const detailsHTML = vacancy.text_highlighted ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;">${vacancy.text_highlighted}</div></details>` : '';

        // --- ИЗМЕНЕНИЕ ЗДЕСЬ: Собираем новый подвал ---
        const channelHtml = isValid(vacancy.channel) ? `<span class="channel-name">${vacancy.channel}</span>` : '';
        const timestampHtml = `<span class="timestamp-footer">${formatTimestamp(vacancy.timestamp)}</span>`;
        const separator = channelHtml && timestampHtml ? ' • ' : '';

        const footerMetaHtml = `<div class="footer-meta">${channelHtml}${separator}${timestampHtml}</div>`;

        card.innerHTML = `
            <div class="card-actions">
                ${applyIconHtml}
                <button class="card-action-btn favorite" onclick="updateStatus(event, '${vacancy.id}', 'favorite')"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>
                <button class="card-action-btn delete" onclick="updateStatus(event, '${vacancy.id}', 'deleted')"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <div class="card-header"><h3>${vacancy.category || 'NO_CATEGORY'}</h3></div>
            <div class="card-body">
                <p class="card-summary">${vacancy.reason || 'Описание не было сгенерировано.'}</p>
                ${infoGridHtml}
                ${detailsHTML}
            </div>
            <div class="card-footer">
                ${skillsFooterHtml}
                ${footerMetaHtml}
            </div>`;
        container.appendChild(card);
    }
}

async function loadVacancies() {
    // ... (остальной код без изменений)
    headerActions.classList.add('hidden');
    vacanciesContent.classList.add('hidden');
    searchContainer.classList.add('hidden');
    categoryTabs.classList.add('hidden');
    refreshBtn.classList.add('hidden');
    
    progressBar.style.width = '1%';
    loader.classList.remove('hidden');
    setTimeout(() => { progressBar.style.width = '40%'; }, 100);
    setTimeout(() => { progressBar.style.width = '70%'; }, 500);

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?status=eq.new&select=*`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        if (!response.ok) throw new Error(`Ошибка сети: ${response.statusText}`);
        
        const items = await response.json();
        progressBar.style.width = '100%';

        Object.values(containers).forEach(container => container.innerHTML = '');
        
        if (items.length === 0) {
            containers.main.innerHTML = getEmptyStateHtml("Новых вакансий нет");
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
            
            if (items.length > 0) {
                searchContainer.classList.remove('hidden');
            }

            filterVacancies();
        }, 500);

    } catch (error) {
        console.error('Ошибка загрузки:', error);
        loader.innerHTML = `<p class="empty-list">Ошибка: ${error.message}</p>`;
    }
}

// --- EVENT LISTENERS ---
// ... (остальной код без изменений)
tabButtons.forEach(button => { let pressTimer = null; let longPressTriggered = false; const startPress = (e) => { longPressTriggered = false; pressTimer = window.setTimeout(() => { longPressTriggered = true; const categoryName = button.dataset.categoryName; clearCategory(categoryName); }, 800); }; const cancelPress = (e) => { clearTimeout(pressTimer); if (longPressTriggered) { e.preventDefault(); } }; const handleClick = () => { if (longPressTriggered) { return; } tabButtons.forEach(btn => btn.classList.remove('active')); vacancyLists.forEach(list => list.classList.remove('active')); button.classList.add('active'); document.getElementById(button.dataset.target).classList.add('active'); filterVacancies(); }; button.addEventListener('mousedown', startPress); button.addEventListener('mouseup', cancelPress); button.addEventListener('mouseleave', cancelPress); button.addEventListener('touchstart', startPress, { passive: true }); button.addEventListener('touchend', cancelPress); button.addEventListener('touchcancel', cancelPress); button.addEventListener('click', handleClick); });
searchInput.addEventListener('input', filterVacancies);
refreshBtn.addEventListener('click', loadVacancies);

// Initial load
loadVacancies();
