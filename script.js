// Инициализируем API Телеграма
const tg = window.Telegram.WebApp;
tg.expand(); // Расширяем приложение на весь экран

// Убедитесь, что это ваш РАБОЧИЙ (Production) URL из n8n
const API_URL = 'https://oshunik.ru/webhook/3807c00b-ec11-402e-b054-ba0b3faad50b';

const container = document.getElementById('vacancies-list');

// Функция для загрузки и отображения вакансий
async function loadVacancies() {
    try {
        const response = await fetch(API_URL + '?cache_buster=' + new Date().getTime());
        let items = await response.json();

        container.innerHTML = ''; // Очищаем

        if (items && !Array.isArray(items)) {
            items = [items];
        }

        if (!items || items.length === 0) {
            container.innerHTML = '<p>Новых вакансий пока нет.</p>';
            return;
        }

        for (const item of items) {
            const vacancy = item.json ? item.json : item; 

            const card = document.createElement('div');
            card.className = 'vacancy-card';

            // --- ЭТОТ БЛОК ОБНОВЛЕН ---
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
            `;
            // -------------------------

            container.appendChild(card);
        }
    } catch (error) {
        console.error('Ошибка в скрипте:', error);
        container.innerHTML = `<p>Ошибка при загрузке данных: ${error.message}</p>`;
    }
}

// Загружаем вакансии при открытии приложения
loadVacancies();