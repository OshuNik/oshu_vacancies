const tg = window.Telegram.WebApp;
tg.expand();

// --- SUPABASE SETUP ---
const SUPABASE_URL = 'https://lwfhtwnfqmdjwzrdznvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4';
// --- END OF SETUP ---

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
const emptyStateContainer = document.getElementById('empty-state-container');

// --- HELPER FUNCTIONS ---
function showCustomConfirm(message, callback) {
    if (!confirmOverlay) return;
    confirmText.textContent = message;
    confirmOverlay.classList.remove('hidden');
    confirmOkBtn.onclick = () => {
        confirmOverlay.classList.add('hidden');
        callback(true);
    };
    confirmCancelBtn.onclick = () => {
        confirmOverlay.classList.add('hidden');
        callback(false);
    };
}

function formatTimestamp(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function filterVacancies() {
    const activeList = document.querySelector('.vacancy-list.active');
    if (!activeList || !searchInput) return;
    const query = searchInput.value.toLowerCase();
    const cards = activeList.querySelectorAll('.vacancy-card');
    let visibleCount = 0;
    cards.forEach(card => {
        const cardText = card.textContent.toLowerCase();
        if (cardText.includes(query)) {
            card.style.display = '';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });
    let emptyMessage = activeList.querySelector('.empty-list');
    if (visibleCount === 0 && cards.length > 0) {
        if (!emptyMessage) {
            emptyMessage = document.createElement('p');
            emptyMessage.className = 'empty-list';
            activeList.appendChild(emptyMessage);
        }
        emptyMessage.textContent = '-- Ничего не найдено --';
        emptyMessage.style.display = 'block';
    } else if (emptyMessage) {
        emptyMessage.style.display = 'none';
    }
}

// --- API FUNCTIONS ---
async function updateStatus(event, vacancyId, newStatus) {
    const cardElement = document.getElementById(`card-${vacancyId}`);
    if (!cardElement) return;
    const parentList = cardElement.parentElement;
    const categoryKey = Object.keys(containers).find(key => containers[key] === parentList);
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${vacancyId}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ status: newStatus })
        });
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
            cardElement.remove();
            const countSpan = counts[categoryKey];
            let currentCount = parseInt(countSpan.textContent.replace(/\(|\)/g, ''));
            countSpan.textContent = `(${(currentCount - 1)})`;
            renderVacancies(parentList, Array.from(parentList.querySelectorAll('.vacancy-card')));
        }, 300);
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
        tg.showAlert('Не удалось обновить статус.');
        if (cardElement) {
            cardElement.style.opacity = '1';
            cardElement.style.transform = 'scale(1)';
        }
    }
}

async function clearCategory(categoryName) {
    if (!categoryName) return;
    showCustomConfirm(`Вы уверены, что хотите удалить все из категории "${categoryName}"?`, async (isConfirmed) => {
        if (isConfirmed) {
            const activeList = document.querySelector('.vacancy-list.active');
            try {
                await fetch(`${SUPABASE_URL}/rest/v1/vacancies?category=eq.${categoryName}&status=eq.new`, {
                    method: 'PATCH',
                    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                    body: JSON.stringify({ status: 'deleted' })
                });
                if (activeList) {
                    const categoryKey = Object.keys(containers).find(key => containers[key] === activeList);
                    if (categoryKey) counts[categoryKey].textContent = '(0)';
                    renderVacancies(activeList, []);
                }
            } catch (error) {
                console.error('Ошибка очистки категории:', error);
                tg.showAlert('Не удалось очистить категорию.');
            }
        }
    });
}

function renderVacancies(container, vacancies) {
    if (!container) return;
    container.innerHTML = '';
    
    if (!vacancies || vacancies.length === 0) {
        container.innerHTML = '<p class="empty-list">-- В этой категории пусто --</p>';
        return;
    }

    for (const item of vacancies) {
        const vacancy = item;
        const card = document.createElement('div');
        card.className = 'vacancy-card';
        card.id = `card-${vacancy.id}`;
        if (vacancy.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
        else if (vacancy.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
        else card.classList.add('category-other');

        const detailsHTML = vacancy.text_highlighted ? `
        <details>
            <summary>Показать полный текст</summary>
            <div class="vacancy-text" style="margin-top:10px;">${vacancy.text_highlighted}</div>
        </details>` : '';

        card.innerHTML = `
            <div class="card-actions">
                <button class="card-action-btn favorite" onclick="updateStatus(event, '${vacancy.id}', 'favorite')"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>
                <button class="card-action-btn delete" onclick="updateStatus(event, '${vacancy.id}', 'deleted')"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <div class="card-header"><h3>${vacancy.category || 'NO_CATEGORY'}</h3></div>
            <div class="card-body">
                <p><strong>Причина:</strong> ${vacancy.reason || 'Нет данных'}</p>
                <p><strong>Ключевые слова:</strong> ${vacancy.keywords_found || 'Нет данных'}</p>
                <p><strong>Канал:</strong> ${vacancy.channel || 'Нет данных'}</p>
                ${detailsHTML}
            </div>
            <div class="card-footer"><span class="timestamp-footer">${formatTimestamp(vacancy.timestamp)}</span></div>`;
        container.appendChild(card);
    }
}

async function loadVacancies() {
    // Скрываем все элементы интерфейса перед загрузкой
    if(vacanciesContent) vacanciesContent.classList.add('hidden');
    if(emptyStateContainer) emptyStateContainer.classList.add('hidden');
    if(headerActions) headerActions.classList.add('hidden');
    if(searchContainer) searchContainer.classList.add('hidden');
    if(categoryTabs) categoryTabs.classList.add('hidden');
    if(refreshBtn) refreshBtn.classList.add('hidden');
    if(loader) loader.classList.remove('hidden');
    if(progressBar) progressBar.style.width = '1%';

    setTimeout(() => { if (progressBar) progressBar.style.width = '40%'; }, 100);
    setTimeout(() => { if (progressBar) progressBar.style.width = '70%'; }, 500);

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?status=eq.new&select=*`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        if (!response.ok) throw new Error(`Ошибка сети: ${response.statusText}`);
        
        const items = await response.json();
        if (progressBar) progressBar.style.width = '100%';
        items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Показываем нужный блок в зависимости от того, есть ли вакансии
        if (items.length === 0) {
            if (vacanciesContent) vacanciesContent.classList.add('hidden');
            if (emptyStateContainer) emptyStateContainer.classList.remove('hidden');
        } else {
            if (vacanciesContent) vacanciesContent.classList.remove('hidden');
            if (emptyStateContainer) emptyStateContainer.classList.add('hidden');
        }

        const mainVacancies = items.filter(item => item.category === 'ТОЧНО ТВОЁ');
        const maybeVacancies = items.filter(item => item.category === 'МОЖЕТ БЫТЬ');
        const otherVacancies = items.filter(item => !['ТОЧНО ТВОЁ', 'МОЖЕТ БЫТЬ'].includes(item.category));

        if (counts.main) counts.main.textContent = `(${mainVacancies.length})`;
        if (counts.maybe) counts.maybe.textContent = `(${maybeVacancies.length})`;
        if (counts.other) counts.other.textContent = `(${otherVacancies.length})`;

        renderVacancies(containers.main, mainVacancies);
        renderVacancies(containers.maybe, maybeVacancies);
        renderVacancies(containers.other, otherVacancies);
        
        filterVacancies();

    } catch (error) {
        console.error('Ошибка загрузки:', error);
        if (loader) loader.innerHTML = `<p class="empty-list">Ошибка: ${error.message}</p>`;
    } finally {
        setTimeout(() => {
            if (loader) loader.classList.add('hidden');
            // Показываем интерфейс после завершения загрузки
            if (headerActions) headerActions.classList.remove('hidden');
            if (searchContainer) searchContainer.classList.remove('hidden');
            if (categoryTabs) categoryTabs.classList.remove('hidden');
            if (refreshBtn) refreshBtn.classList.remove('hidden');
        }, 500);
    }
}

// --- EVENT LISTENERS ---
if (tabButtons) {
    tabButtons.forEach(button => {
        let pressTimer = null;
        let longPressTriggered = false;

        const startPress = (e) => {
            longPressTriggered = false;
            pressTimer = window.setTimeout(() => {
                longPressTriggered = true;
                const categoryName = button.dataset.categoryName;
                clearCategory(categoryName);
            }, 800);
        };

        const cancelPress = (e) => {
            clearTimeout(pressTimer);
            if (longPressTriggered) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        const handleClick = (e) => {
            if (longPressTriggered) return;
            if (button.classList.contains('active')) return;
            
            tabButtons.forEach(btn => btn.classList.remove('active'));
            if(vacancyLists) vacancyLists.forEach(list => list.classList.remove('active'));
            
            button.classList.add('active');
            const targetList = document.getElementById(button.dataset.target);
            if (targetList) {
                targetList.classList.add('active');
                if (targetList.children.length === 0 && document.querySelectorAll('.vacancy-card').length === 0) {
                    if (emptyStateContainer) emptyStateContainer.classList.remove('hidden');
                    if (vacanciesContent) vacanciesContent.classList.add('hidden');
                } else {
                    if (emptyStateContainer) emptyStateContainer.classList.add('hidden');
                    if (vacanciesContent) vacanciesContent.classList.remove('hidden');
                }
            }
            filterVacancies();
        };

        button.addEventListener('mousedown', startPress);
        button.addEventListener('mouseup', cancelPress);
        button.addEventListener('mouseleave', cancelPress);
        button.addEventListener('touchstart', startPress, { passive: true });
        button.addEventListener('touchend', cancelPress);
        button.addEventListener('touchcancel', cancelPress);
        button.addEventListener('click', handleClick);
    });
}

if (searchInput) searchInput.addEventListener('input', filterVacancies);
if (refreshBtn) refreshBtn.addEventListener('click', loadVacancies);

// Initial load
loadVacancies();
