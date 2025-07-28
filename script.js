// Инициализируем API Телеграма
const tg = window.Telegram.WebApp;
tg.expand();

// !!! URL для ПОЛУЧЕНИЯ списка вакансий
const GET_API_URL = 'СЮДА_ВСТАВЬТЕ_ВАШ_API_URL_ДЛЯ_ПОЛУЧЕНИЯ_ДАННЫХ';

// !!! URL для ОБНОВЛЕНИЯ статуса вакансии
const UPDATE_API_URL = 'СЮДА_ВСТАВЬТЕ_URL_ИЗ_ВОРКФЛОУ_ДЛЯ_ОБНОВЛЕНИЯ';

const container = document.getElementById('vacancies-list');

// Функция для обновления статуса
async function updateStatus(vacancyId, newStatus) {
    const cardElement = document.getElementById(`card-${vacancyId}`);
    try {
        await fetch(UPDATE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: vacancyId, newStatus: newStatus })
        });
        // Если запрос успешен, плавно удаляем карточку с экрана
        cardElement.style.transition = 'opacity 0.3s ease';
        cardElement.style.opacity = '0';
        setTimeout(() => cardElement.remove(), 300);
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
        tg.showAlert('Не удалось обновить статус.');
    }
}

// Функция для загрузки и отображения вакансий
async function loadVacancies() {
    container.innerHTML = '<p>🔄 Загрузка...</p>'; // Показываем статус загрузки
    try {
        const response = await fetch(GET_API_URL + '?cache_buster=' + new Date().getTime());
        let items = await response.json();
        container.innerHTML = '';
        if (items && !Array.isArray(items)) { items = [items]; }
        if (!items || items.length === 0) {
            container.innerHTML = '<p>Новых вакансий пока нет.</p>';
            return;
        }
        for (const item of items) {
            const vacancy = item.json ? item.json : item;
            if (!vacancy.id) continue;
            
            const card = document.createElement('div');
            card.className = 'vacancy-card';
            card.id = `card-${vacancy.id}`;
            
            card.innerHTML = `
                <h3>${vacancy.category || '⚠️ Вакансия без категории'}</h3>
                <p><strong>Причина:</strong> ${vacancy.reason || 'Нет данных'}</p>
                <p><strong>Ключевые слова:</strong> ${vacancy.keywords_found || 'Нет данных'}</p>
                <p><strong>Канал:</strong> ${vacancy.channel || 'Нет данных'}</p>
                <hr>
                <details>
                    <summary>Показать полный текст</summary>
                    <p>${vacancy.text_highlighted || 'Нет данных'}</p>
                </details>
                <div class="card-buttons">
                    <button class="favorite-button" onclick="updateStatus('${vacancy.id}', 'favorite')">⭐ В избранное</button>
                    <button class="delete-button" onclick="updateStatus('${vacancy.id}', 'deleted')">❌ Удалить</button>
                </div>
            `;
            container.appendChild(card);
        }
    } catch (error) {
        console.error('Ошибка в скрипте:', error);
        container.innerHTML = `<p>Ошибка при загрузке данных: ${error.message}</p>`;
    }
}

// --- Код для кнопки "Обновить" ---
// Находим кнопку по её id
const refreshBtn = document.getElementById('refresh-button');
// При клике на кнопку - вызываем функцию загрузки вакансий
refreshBtn.addEventListener('click', loadVacancies);

// Загружаем вакансии при первом открытии приложения
loadVacancies();
