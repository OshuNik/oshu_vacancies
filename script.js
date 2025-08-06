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
    // ... (эта функция остается без изменений) ...
}

async function clearCategory(categoryName) {
    // ... (эта функция остается без изменений) ...
}

function renderVacancies(container, vacancies) {
    // ... (эта функция остается без изменений) ...
}

// --- LOAD FUNCTION (ИСПРАВЛЕНА) ---
async function loadVacancies() {
    // СНАЧАЛА скрываем ВСЕ, кроме загрузчика
    vacanciesContent.classList.add('hidden');
    if(emptyStateContainer) emptyStateContainer.classList.add('hidden');
    headerActions.classList.add('hidden');
    searchContainer.classList.add('hidden');
    categoryTabs.classList.add('hidden');
    refreshBtn.classList.add('hidden');
    loader.classList.remove('hidden');
    progressBar.style.width = '1%';

    setTimeout(() => { progressBar.style.width = '40%'; }, 100);
    setTimeout(() => { progressBar.style.width = '70%'; }, 500);

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?status=eq.new&select=*`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        if (!response.ok) throw new Error(`Ошибка сети: ${response.statusText}`);
        
        const items = await response.json();
        progressBar.style.width = '100%';
        items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        if (items.length === 0 && emptyStateContainer) {
            vacanciesContent.classList.add('hidden');
            emptyStateContainer.classList.remove('hidden');
        } else {
            vacanciesContent.classList.remove('hidden');
            if(emptyStateContainer) emptyStateContainer.classList.add('hidden');
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
        if(loader) loader.innerHTML = `<p class="empty-list">Ошибка: ${error.message}</p>`;
    } finally {
        setTimeout(() => {
            // ПОТОМ показываем все обратно
            loader.classList.add('hidden');
            headerActions.classList.remove('hidden');
            searchContainer.classList.remove('hidden');
            categoryTabs.classList.remove('hidden');
            refreshBtn.classList.remove('hidden');
        }, 500);
    }
}

// --- EVENT LISTENERS (ИСПРАВЛЕНО) ---
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
            }, 800); // 800ms для длинного нажатия
        };

        const cancelPress = (e) => {
            clearTimeout(pressTimer);
            if (longPressTriggered) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        const handleClick = (e) => {
            if (longPressTriggered) {
                return;
            }
            if (button.classList.contains('active')) return;
            
            tabButtons.forEach(btn => btn.classList.remove('active'));
            if(vacancyLists) vacancyLists.forEach(list => list.classList.remove('active'));
            
            button.classList.add('active');
            const targetList = document.getElementById(button.dataset.target);
            if (targetList) {
                targetList.classList.add('active');
            }
            filterVacancies();
        };

        // Добавляем обработчики и для мыши, и для касаний
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
