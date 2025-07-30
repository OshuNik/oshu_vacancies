/* ======================================================================= */
/* 3. Обновлённый JavaScript (script.js)                                 */
/* ======================================================================= */
const tg = window.Telegram.WebApp;
tg.expand();

const GET_API_URL = 'https://oshunik.ru/webhook/3807c00b-ec11-402e-b054-ba0b3faad50b'; 
const UPDATE_API_URL = 'https://oshunik.ru/webhook/cf41ba34-60ed-4f3d-8d13-ec85de6297e2';
// ИЗМЕНЕНИЕ: Вставляем ваш новый URL
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

function formatTimestamp(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('ru-RU', { 
        day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' 
    });
}

async function updateStatus(event, vacancyId, newStatus) {
    const cardElement = document.getElementById(`card-${vacancyId}`);
    const button = event.target;
    button.disabled = true;

    try {
        await fetch(UPDATE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: vacancyId, newStatus: newStatus })
        });
        cardElement.style.transition = 'opacity 0.3s ease';
        cardElement.style.opacity = '0';
        setTimeout(() => {
            cardElement.remove();
            loadVacancies(); 
        }, 300);
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
        tg.showAlert('Не удалось обновить статус.');
        button.disabled = false;
    }
}

async function clearCategory(event, categoryName) {
    const button = event.target;
    
    // Для категории "Не твоё" используем более понятное имя в диалоге
    const displayName = categoryName === 'НЕ ТВОЁ' ? 'Не твоё' : categoryName;

    tg.showConfirm(`Вы уверены, что хотите удалить все из категории "${displayName}"?`, async (isConfirmed) => {
        if (!isConfirmed) return;

        button.disabled = true;
        button.textContent = 'Очистка...';

        try {
            await fetch(CLEAR_CATEGORY_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: categoryName })
            });
            loadVacancies(); // Обновляем списки
        } catch (error) {
            console.error('Ошибка очистки категории:', error);
            tg.showAlert('Не удалось очистить категорию.');
            button.disabled = false;
            button.textContent = 'Очистить все';
        }
    });
}

function renderVacancies(container, vacancies, categoryName) {
    if (!container) return;
    container.innerHTML = ''; 
    
    if (vacancies && vacancies.length > 0) {
        const header = document.createElement('div');
        header.className = 'list-header';
        header.innerHTML = `<button class="clear-button" onclick="clearCategory(event, '${categoryName}')">Очистить все</button>`;
        container.appendChild(header);
    } else {
        container.innerHTML = '<p class="empty-list">Пусто</p>';
        return;
    }

    for (const item of vacancies) {
        const vacancy = item.json ? item.json : item;
        if (!vacancy.id) continue;
        
        const card = document.createElement('div');
        card.className = 'vacancy-card';
        card.id = `card-${vacancy.id}`;
        
        card.innerHTML = `
            <div class="card-header">
                <h3>${vacancy.category || '⚠️ Без категории'}</h3>
                <span class="timestamp">${formatTimestamp(vacancy.timestamp)}</span>
            </div>
            <p><strong>Причина:</strong> ${vacancy.reason || 'Нет данных'}</p>
            <p><strong>Ключевые слова:</strong> ${vacancy.keywords_found || 'Нет данных'}</p>
            <p><strong>Канал:</strong> ${vacancy.channel || 'Нет данных'}</p>
            <hr>
            <details>
                <summary>Показать полный текст</summary>
                <p>${vacancy.text_highlighted || 'Нет данных'}</p>
            </details>
            <div class="card-buttons">
                <button class="button button-primary" onclick="updateStatus(event, '${vacancy.id}', 'favorite')">⭐ В избранное</button>
                <button class="button button-danger" onclick="updateStatus(event, '${vacancy.id}', 'deleted')">❌ Удалить</button>
            </div>
        `;
        container.appendChild(card);
    }
}

async function loadVacancies() {
    Object.values(containers).forEach(c => {
        if (c) c.innerHTML = '<p>🔄 Загрузка...</p>';
    });
    if(refreshBtn) refreshBtn.disabled = true;

    try {
        const response = await fetch(GET_API_URL + '?cache_buster=' + new Date().getTime());
        const items = await response.json();
        
        if (items && items.length > 0) {
            items.sort((a, b) => {
                const timeA = a.json ? a.json.timestamp : a.timestamp;
                const timeB = b.json ? b.json.timestamp : b.timestamp;
                return new Date(timeB) - new Date(timeA);
            });
        }
        
        const mainVacancies = [];
        const maybeVacancies = [];
        const otherVacancies = [];

        if (items && items.length > 0) {
            for (const item of items) {
                const vacancy = item.json || item;
                if (vacancy.category === 'ТОЧНО ТВОЁ') {
                    mainVacancies.push(item);
                } else if (vacancy.category === 'МОЖЕТ БЫТЬ') {
                    maybeVacancies.push(item);
                } else {
                    // Все остальные категории попадают сюда
                    otherVacancies.push(item);
                }
            }
        }
        
        counts.main.textContent = `(${mainVacancies.length})`;
        counts.maybe.textContent = `(${maybeVacancies.length})`;
        counts.other.textContent = `(${otherVacancies.length})`;

        // ИЗМЕНЕНИЕ: Передаём правильные имена категорий
        renderVacancies(containers.main, mainVacancies, 'ТОЧНО ТВОЁ');
        renderVacancies(containers.maybe, maybeVacancies, 'МОЖЕТ БЫТЬ');
        renderVacancies(containers.other, otherVacancies, 'НЕ ТВОЁ');

    } catch (error) {
        console.error('Ошибка загрузки:', error);
        Object.values(containers).forEach(c => {
            if(c) c.innerHTML = `<p>Ошибка: ${error.message}</p>`;
        });
    } finally {
        if(refreshBtn) refreshBtn.disabled = false;
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
