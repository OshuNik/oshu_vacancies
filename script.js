const tg = window.Telegram.WebApp;
tg.expand();

// API URLs
const GET_API_URL = 'https://oshunik.ru/webhook/3807c00b-ec11-402e-b054-ba0b3faad50b';
const UPDATE_API_URL = 'https://oshunik.ru/webhook/cf41ba34-60ed-4f3d-8d13-ec85de6297e2';
const CLEAR_CATEGORY_API_URL = 'https://oshunik.ru/webhook/d5a617c6-34db-45f2-a8a5-c88b091923d5';

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

// Elements to hide during load
const headerActions = document.getElementById('header-actions');
const searchContainer = document.getElementById('search-container');
const categoryTabs = document.getElementById('category-tabs');
const clearCategoryBtn = document.getElementById('clear-category-btn');

// --- HELPER FUNCTIONS ---

function formatTimestamp(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function updateClearButtonVisibility() {
    const activeList = document.querySelector('.vacancy-list.active');
    if (activeList && activeList.querySelector('.vacancy-card')) {
        clearCategoryBtn.classList.remove('hidden');
    } else {
        clearCategoryBtn.classList.add('hidden');
    }
}

function filterVacancies() {
    const query = searchInput.value.toLowerCase();
    const activeList = document.querySelector('.vacancy-list.active');
    if (!activeList) return;

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
    updateClearButtonVisibility();
}

// --- API FUNCTIONS ---

async function updateStatus(event, vacancyId, newStatus) {
    const cardElement = document.getElementById(`card-${vacancyId}`);
    if (!cardElement) return;

    const parentList = cardElement.parentElement;
    const categoryKey = Object.keys(containers).find(key => containers[key] === parentList);

    try {
        await fetch(UPDATE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: vacancyId, newStatus: newStatus })
        });

        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.95)';

        setTimeout(() => {
            cardElement.style.height = '0';
            cardElement.style.paddingTop = '0';
            cardElement.style.paddingBottom = '0';
            cardElement.style.marginTop = '0';
            cardElement.style.marginBottom = '0';
            cardElement.style.borderWidth = '0';

            const countSpan = counts[categoryKey];
            let currentCount = parseInt(countSpan.textContent.replace(/\(|\)/g, ''));
            countSpan.textContent = `(${(currentCount - 1)})`;

            setTimeout(() => {
                cardElement.remove();
                if (parentList.children.length === 0) {
                    parentList.innerHTML = '<p class="empty-list">-- Пусто --</p>';
                }
                updateClearButtonVisibility();
            }, 300);
        }, 300);

    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
        tg.showAlert('Не удалось обновить статус.');
        cardElement.style.opacity = '1';
        cardElement.style.transform = 'scale(1)';
    }
}

async function clearCategory(event, categoryName) {
    if (!categoryName) return;

    if (window.confirm(`Вы уверены, что хотите удалить все из категории "${categoryName}"?`)) {
        try {
            await fetch(CLEAR_CATEGORY_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: categoryName })
            });
            loadVacancies();
        } catch (error) {
            console.error('Ошибка очистки категории:', error);
            tg.showAlert('Не удалось очистить категорию.');
        }
    }
}

function renderVacancies(container, vacancies) {
    if (!container) return;
    container.innerHTML = '';

    if (!vacancies || vacancies.length === 0) {
        container.innerHTML = '<p class="empty-list">-- Пусто --</p>';
        return;
    }

    for (const item of vacancies) {
        const vacancy = item.json ? item.json : item;
        if (!vacancy.id) continue;

        const card = document.createElement('div');
        card.className = 'vacancy-card';
        card.id = `card-${vacancy.id}`;

        if (vacancy.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
        else if (vacancy.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
        else card.classList.add('category-other');

        let detailsHTML = vacancy.text_highlighted ? `
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
    // Show loader and hide everything else
    vacanciesContent.classList.add('hidden');
    headerActions.classList.add('hidden');
    searchContainer.classList.add('hidden');
    categoryTabs.classList.add('hidden');
    clearCategoryBtn.classList.add('hidden');
    refreshBtn.classList.add('hidden');
    
    // Reset and show the loader
    progressBar.style.width = '1%';
    loader.classList.remove('hidden');

    // Start the animation *after* the loader is visible
    setTimeout(() => { progressBar.style.width = '40%'; }, 100);
    setTimeout(() => { progressBar.style.width = '70%'; }, 500);

    try {
        const response = await fetch(GET_API_URL + '?cache_buster=' + new Date().getTime());
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const items = await response.json();
        progressBar.style.width = '100%';

        items.sort((a, b) => new Date((b.json || b).timestamp) - new Date((a.json || a).timestamp));

        const mainVacancies = items.filter(item => (item.json || item).category === 'ТОЧНО ТВОЁ');
        const maybeVacancies = items.filter(item => (item.json || item).category === 'МОЖЕТ БЫТЬ');
        const otherVacancies = items.filter(item => !['ТОЧНО ТВОЁ', 'МОЖЕТ БЫТЬ'].includes((item.json || item).category));

        counts.main.textContent = `(${mainVacancies.length})`;
        counts.maybe.textContent = `(${maybeVacancies.length})`;
        counts.other.textContent = `(${otherVacancies.length})`;

        renderVacancies(containers.main, mainVacancies);
        renderVacancies(containers.maybe, maybeVacancies);
        renderVacancies(containers.other, otherVacancies);

        filterVacancies();

    } catch (error) {
        console.error('Ошибка загрузки:', error);
        loader.innerHTML = `<p class="empty-list">Ошибка: ${error.message}</p>`;
    } finally {
        setTimeout(() => {
            // Hide loader and show everything else
            loader.classList.add('hidden');
            vacanciesContent.classList.remove('hidden');
            headerActions.classList.remove('hidden');
            searchContainer.classList.remove('hidden');
            categoryTabs.classList.remove('hidden');
            refreshBtn.classList.remove('hidden');
            updateClearButtonVisibility();
        }, 500); // Delay to show the full progress bar
    }
}

// --- EVENT LISTENERS ---

clearCategoryBtn.addEventListener('click', (event) => {
    const activeTab = document.querySelector('.tab-button.active');
    if (activeTab) {
        const categoryName = activeTab.dataset.categoryName;
        clearCategory(event, categoryName);
    }
});

searchInput.addEventListener('input', filterVacancies);

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        vacancyLists.forEach(list => list.classList.remove('active'));
        button.classList.add('active');
        document.getElementById(button.dataset.target).classList.add('active');
        filterVacancies();
    });
});

refreshBtn.addEventListener('click', loadVacancies);

// Initial load
loadVacancies();
