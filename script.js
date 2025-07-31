// =======================================================================
// 5. Обновлённый JavaScript (script.js) для oshu://work
// =======================================================================

const tg = window.Telegram.WebApp;
tg.expand();

const GET_API_URL = 'https://oshunik.ru/webhook/3807c00b-ec11-402e-b054-ba0b3faad50b';
const UPDATE_API_URL = 'https://oshunik.ru/webhook/cf41ba34-60ed-4f3d-8d13-ec85de6297e2';
const CLEAR_CATEGORY_API_URL = 'https://oshunik.ru/webhook/d5a617c6-34db-45f2-a8a5-c88b091923d5';

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

const loader = document.getElementById('loader');
const progressBar = document.getElementById('progress-bar');
const vacanciesContent = document.getElementById('vacancies-content');

function formatTimestamp(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('ru-RU', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
}

async function updateStatus(event, vacancyId, newStatus) {
    const cardElement = document.getElementById(`card-${vacancyId}`);
    const parentList = cardElement.parentElement;
    const categoryKey = Object.keys(containers).find(key => containers[key] === parentList);

    try {
        await fetch(UPDATE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: vacancyId, newStatus: newStatus })
        });
        cardElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
            cardElement.remove();
            const countSpan = counts[categoryKey];
            let currentCount = parseInt(countSpan.textContent.replace(/\(|\)/g, ''));
            countSpan.textContent = `(${(currentCount - 1)})`;
            if (parentList.children.length === 0) {
                parentList.innerHTML = '<p class="empty-list">-- Пусто --</p>';
            }
        }, 300);
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
        tg.showAlert('Не удалось обновить статус.');
    }
}

async function clearCategory(event, categoryName) {
    const button = event.target;
    const displayName = categoryName;

    if (window.confirm(`Вы уверены, что хотите удалить все из категории "${displayName}"?`)) {
        button.disabled = true;
        button.textContent = 'Очистка...';
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
            button.disabled = false;
            button.textContent = 'Очистить все';
        }
    }
}

// === ГЛАВНАЯ ФУНКЦИЯ ОТОБРАЖЕНИЯ ВАКАНСИЙ ===
function renderVacancies(container, vacancies, categoryName) {
    if (!container) return;
    container.innerHTML = '';

    if (vacancies && vacancies.length > 0) {
        const header = document.createElement('div');
        header.className = 'list-header';
        header.innerHTML = `<button class="clear-button" onclick="clearCategory(event, '${categoryName}')">Очистить все</button>`;
        container.appendChild(header);
    } else {
        container.innerHTML = '<p class="empty-list">-- Пусто --</p>';
        return;
    }

    for (const item of vacancies) {
        const vacancy = item.json ? item.json : item;
        if (!vacancy.id) continue;

        const card = document.createElement('div');
        card.className = 'vacancy-card';
        card.id = `card-${vacancy.id}`;

        // Сборка details с новым div
        let detailsHTML = '';
        if (vacancy.text_highlighted) {
            detailsHTML = `
<details>
    <summary>Показать полный текст</summary>
    <div class="vacancy-text" style="margin-top:10px;">
        ${vacancy.text_highlighted}
    </div>
</details>`;
        }

        card.innerHTML = `
            <div class="card-actions">
                <button class="card-action-btn favorite" onclick="updateStatus(event, '${vacancy.id}', 'favorite')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                </button>
                <button class="card-action-btn delete" onclick="updateStatus(event, '${vacancy.id}', 'deleted')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            <div class="card-header">
                <h3>${vacancy.category || 'NO_CATEGORY'}</h3>
            </div>
            <div class="card-body">
                <p><strong>Причина:</strong> ${vacancy.reason || 'Нет данных'}</p>
                <p><strong>Ключевые слова:</strong> ${vacancy.keywords_found || 'Нет данных'}</p>
                <p><strong>Канал:</strong> ${vacancy.channel || 'Нет данных'}</p>
                ${detailsHTML}
            </div>
            <div class="card-footer">
                <span class="timestamp-footer">${formatTimestamp(vacancy.timestamp)}</span>
            </div>
        `;
        container.appendChild(card);
    }
}

async function loadVacancies() {
    loader.classList.remove('hidden');
    vacanciesContent.classList.add('hidden');
    refreshBtn.classList.add('hidden');
    progressBar.style.width = '1%';

    setTimeout(() => { progressBar.style.width = '40%'; }, 100);
    setTimeout(() => { progressBar.style.width = '70%'; }, 500);

    try {
        const response = await fetch(GET_API_URL + '?cache_buster=' + new Date().getTime());
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const items = await response.json();
        progressBar.style.width = '100%';

        if (items && items.length > 0) {
            items.sort((a, b) => {
                const timeA = (a.json || a).timestamp;
                const timeB = (b.json || b).timestamp;
                if (!timeA) return 1;
                if (!timeB) return -1;
                return new Date(timeB) - new Date(timeA);
            });
        }

        const mainVacancies = [], maybeVacancies = [], otherVacancies = [];
        if (items && items.length > 0) {
            for (const item of items) {
                const vacancy = item.json || item;
                if (vacancy.category === 'ТОЧНО ТВОЁ') mainVacancies.push(item);
                else if (vacancy.category === 'МОЖЕТ БЫТЬ') maybeVacancies.push(item);
                else otherVacancies.push(item);
            }
        }

        counts.main.textContent = `(${mainVacancies.length})`;
        counts.maybe.textContent = `(${maybeVacancies.length})`;
        counts.other.textContent = `(${otherVacancies.length})`;

        renderVacancies(containers.main, mainVacancies, 'ТОЧНО ТВОЁ');
        renderVacancies(containers.maybe, maybeVacancies, 'МОЖЕТ БЫТЬ');
        renderVacancies(containers.other, otherVacancies, 'НЕ ТВОЁ');

    } catch (error) {
        console.error('Ошибка загрузки:', error);
        loader.innerHTML = `<p class="empty-list">Ошибка: ${error.message}</p>`;
    } finally {
        setTimeout(() => {
            loader.classList.add('hidden');
            vacanciesContent.classList.remove('hidden');
            refreshBtn.classList.remove('hidden');
        }, 500);
    }
}

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        vacancyLists.forEach(list => list.classList.remove('active'));
        button.classList.add('active');
        const targetListId = button.dataset.target;
        document.getElementById(targetListId).classList.add('active');
    });
});

refreshBtn.addEventListener('click', loadVacancies);
loadVacancies();
