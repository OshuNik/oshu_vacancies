/* ======================================================================= */
/* 5. Обновлённый JavaScript (script.js)                                 */
/* ======================================================================= */
const tg = window.Telegram.WebApp;
tg.expand();

const GET_API_URL = 'https://oshunik.ru/webhook/3807c00b-ec11-402e-b054-ba0b3faad50b'; 
const UPDATE_API_URL = 'https://oshunik.ru/webhook/cf41ba34-60ed-4f3d-8d13-ec85de6297e2';

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
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
    });
}

async function updateStatus(event, vacancyId, newStatus) {
    const cardElement = document.getElementById(`card-${vacancyId}`);
    const button = event.target;
    
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
            loadVacancies(); 
        }, 300);
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
        tg.showAlert('Не удалось обновить статус.');
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
        
        // Генерируем новый HTML для карточки
        card.innerHTML = `
            <div class="card-actions">
                <button class="card-action-btn favorite" onclick="updateStatus(event, '${vacancy.id}', 'favorite')">★</button>
                <button class="card-action-btn delete" onclick="updateStatus(event, '${vacancy.id}', 'deleted')">×</button>
            </div>
            <div class="card-header">
                <h3>${vacancy.category || 'NO_CATEGORY'}</h3>
                <span class="timestamp">${formatTimestamp(vacancy.timestamp)}</span>
            </div>
            <div class="card-body">
                <p><strong>Причина:</strong> ${vacancy.reason || 'Нет данных'}</p>
                <p><strong>Канал:</strong> ${vacancy.channel || 'Нет данных'}</p>
            </div>
        `;
        container.appendChild(card);
    }
}

async function loadVacancies() {
    Object.values(containers).forEach(c => {
        if (c) c.innerHTML = '<p class="empty-list">Загрузка...</p>';
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
                    otherVacancies.push(item);
                }
            }
        }
        
        counts.main.textContent = `(${mainVacancies.length})`;
        counts.maybe.textContent = `(${maybeVacancies.length})`;
        counts.other.textContent = `(${otherVacancies.length})`;

        renderVacancies(containers.main, mainVacancies);
        renderVacancies(containers.maybe, maybeVacancies);
        renderVacancies(containers.other, otherVacancies);

    } catch (error) {
        console.error('Ошибка загрузки:', error);
        Object.values(containers).forEach(c => {
            if(c) c.innerHTML = `<p class="empty-list">Ошибка: ${error.message}</p>`;
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
