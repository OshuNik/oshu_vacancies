/* ======================================================================= */
/* 1. Обновлённый JavaScript (script.js)                                 */
/* ======================================================================= */
// Этот код полностью заменяет содержимое вашего файла script.js

const tg = window.Telegram.WebApp;
tg.expand();

// URL-адреса остаются прежними
const GET_API_URL = 'https://oshunik.ru/webhook/3807c00b-ec11-402e-b054-ba0b3faad50b'; 
const UPDATE_API_URL = 'https://oshunik.ru/webhook/cf41ba34-60ed-4f3d-8d13-ec85de6297e2';

// Получаем ссылки на все три контейнера и кнопку
const containers = {
    main: document.getElementById('vacancies-list-main'),
    maybe: document.getElementById('vacancies-list-maybe'),
    other: document.getElementById('vacancies-list-other')
};
const refreshBtn = document.getElementById('refresh-button');

// НОВАЯ ФУНКЦИЯ: для форматирования времени без секунд
function formatTimestamp(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    // Форматируем дату и время для русского языка (день, месяц, часы, минуты)
    return date.toLocaleString('ru-RU', { 
        day: '2-digit', 
        month: 'long', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

// Функция обновления статуса
async function updateStatus(vacancyId, newStatus) {
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
        setTimeout(() => cardElement.remove(), 300);
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
        tg.showAlert('Не удалось обновить статус.');
        button.disabled = false;
    }
}

// Функция для отрисовки вакансий в нужном контейнере
function renderVacancies(container, vacancies) {
    if (!container) return;
    container.innerHTML = ''; 
    if (!vacancies || vacancies.length === 0) {
        container.innerHTML = '<p class="empty-list">Пусто</p>';
        return;
    }
    for (const item of vacancies) {
        const vacancy = item.json ? item.json : item;
        if (!vacancy.id) continue;
        
        const card = document.createElement('div');
        card.className = 'vacancy-card';
        card.id = `card-${vacancy.id}`;
        
        // В карточку добавлено поле с отформатированной датой
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
                <p>${vacancy.text_highlighted_webapp || 'Нет данных'}</p>
            </details>
            <div class="card-buttons">
                <button class="button button-primary" onclick="updateStatus('${vacancy.id}', 'favorite')">⭐ В избранное</button>
                <button class="button button-danger" onclick="updateStatus('${vacancy.id}', 'deleted')">❌ Удалить</button>
            </div>
        `;
        container.appendChild(card);
    }
}

// Основная функция загрузки (сортирует по категориям)
async function loadVacancies() {
    Object.values(containers).forEach(c => {
        if (c) c.innerHTML = '<p>🔄 Загрузка...</p>';
    });
    if(refreshBtn) refreshBtn.disabled = true;

    try {
        const response = await fetch(GET_API_URL + '?cache_buster=' + new Date().getTime());
        const items = await response.json();
        
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
        
        renderVacancies(containers.main, mainVacancies);
        renderVacancies(containers.maybe, maybeVacancies);
        renderVacancies(containers.other, otherVacancies);

    } catch (error) {
        console.error('Ошибка загрузки:', error);
        Object.values(containers).forEach(c => {
            if(c) c.innerHTML = `<p>Ошибка: ${error.message}</p>`;
        });
    } finally {
        if(refreshBtn) refreshBtn.disabled = false;
    }
}

refreshBtn.addEventListener('click', loadVacancies);
loadVacancies();
