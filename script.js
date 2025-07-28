// Инициализируем API Телеграма
const tg = window.Telegram.WebApp;
tg.expand();

// Ваши рабочие URL-адреса
const GET_API_URL = 'https://oshunik.ru/webhook/3807c00b-ec11-402e-b054-ba0b3faad50b';
const UPDATE_API_URL = 'https://oshunik.ru/webhook/cf41ba34-60ed-4f3d-8d13-ec85de6297e2';

const container = document.getElementById('vacancies-list');
const refreshBtn = document.getElementById('refresh-button');

// Функция для обновления статуса
async function updateStatus(vacancyId, newStatus) {
    const cardElement = document.getElementById(`card-${vacancyId}`);
    const button = event.target; // Получаем кнопку, на которую нажали
    button.classList.add('button-loading'); // Включаем спиннер

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
        button.classList.remove('button-loading'); // Выключаем спиннер при ошибке
    }
}

// Функция для загрузки и отображения вакансий
async function loadVacancies() {
    container.innerHTML = '<p>🔄 Загрузка...</p>';
    refreshBtn.classList.add('button-loading'); // Включаем спиннер на кнопке "Обновить"
    
    try {
        const response = await fetch(GET_API_URL + '?cache_buster=' + new Date().getTime());
        const text = await response.text();
        if (!text) {
            container.innerHTML = '<p>Новых вакансий нет</p>';
            return;
        }
        let items = JSON.parse(text);

        container.innerHTML = '';
        if (items && !Array.isArray(items)) { items = [items]; }
        if (!items || items.length === 0) {
            container.innerHTML = '<p>Новых вакансий нет</p>';
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
    } finally {
        refreshBtn.classList.remove('button-loading'); // Выключаем спиннер в любом случае
    }
}

// Привязываем функцию к кнопке "Обновить"
refreshBtn.addEventListener('click', loadVacancies);

// Загружаем вакансии при первом открытии приложения
loadVacancies();
