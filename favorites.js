<!-- favorites.js (JavaScript-код) -->
// Инициализируем API Телеграма
const tg = window.Telegram.WebApp;
tg.expand();

// Убедитесь, что здесь ваши правильные URL-адреса
const GET_FAVORITES_API_URL = 'https://oshunik.ru/webhook/9dcaefca-5f63-4668-9364-965c4ace49d2';
const UPDATE_API_URL = 'https://oshunik.ru/webhook/cf41ba34-60ed-4f3d-8d13-ec85de6297e2';

// ИСПРАВЛЕНО: Теперь скрипт ищет правильный ID контейнера
const container = document.getElementById('favorites-list');

// Функция для обновления статуса (удаления из избранного)
async function updateStatus(vacancyId, newStatus) {
    const cardElement = document.getElementById(`card-${vacancyId}`);
    const button = event.target;
    button.disabled = true; // Блокируем кнопку, чтобы избежать двойных нажатий

    try {
        await fetch(UPDATE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: vacancyId, newStatus: newStatus })
        });
        // Плавное удаление карточки из списка
        cardElement.style.transition = 'opacity 0.3s ease';
        cardElement.style.opacity = '0';
        setTimeout(() => cardElement.remove(), 300);
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
        tg.showAlert('Не удалось обновить статус.');
        button.disabled = false; // Разблокируем кнопку в случае ошибки
    }
}

// Функция для загрузки и отображения вакансий
async function loadVacancies() {
    if (!container) {
        console.error('Контейнер для вакансий не найден!');
        return;
    }
    container.innerHTML = '<p>🔄 Загрузка...</p>';
    try {
        const response = await fetch(GET_FAVORITES_API_URL + '?cache_buster=' + new Date().getTime());
        const text = await response.text();
        if (!text) {
            container.innerHTML = '<p>В избранном пусто</p>';
            return;
        }
        
        let items = JSON.parse(text);
        
        container.innerHTML = '';
        if (items && !Array.isArray(items)) { items = [items]; }
        if (!items || items.length === 0) {
            container.innerHTML = '<p>В избранном пусто</p>';
            return;
        }

        for (const item of items) {
            const vacancy = item.json ? item.json : item;
            if (!vacancy.id) continue;
            
            const card = document.createElement('div');
            card.className = 'vacancy-card';
            card.id = `card-${vacancy.id}`;
            
            // Кнопка удаления теперь занимает всю ширину
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
                <div class="card-buttons" style="grid-template-columns: 1fr;">
                    <button class="button button-danger" onclick="updateStatus('${vacancy.id}', 'deleted')">❌ Удалить из избранного</button>
                </div>
            `;
            container.appendChild(card);
        }
    } catch (error) {
        console.error('Ошибка в скрипте:', error);
        container.innerHTML = `<p>Ошибка при загрузке данных: ${error.message}</p>`;
    }
}

// Загружаем вакансии при открытии приложения
loadVacancies();
