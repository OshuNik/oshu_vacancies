// Инициализируем API Телеграма
const tg = window.Telegram.WebApp;
tg.expand(); // Расширяем приложение на весь экран

// Убедитесь, что это ваш РАБОЧИЙ (Production) URL из n8n
const API_URL = 'https://oshunik.ru/webhook/3807c00b-ec11-402e-b054-ba0b3faad50b';

const container = document.getElementById('vacancies-list');

// Функция для загрузки и отображения вакансий
async function loadVacancies() {
    try {
        const response = await fetch(API_URL);
        let items = await response.json();

        container.innerHTML = ''; // Очищаем надпись "Загрузка..."

        // --- ЭТОТ БЛОК РЕШАЕТ ПРОБЛЕМУ ---
        // Если n8n вернул один объект, а не массив, мы превращаем его в массив
        if (items && !Array.isArray(items)) {
            items = [items];
        }
        // ---------------------------------

        if (!items || items.length === 0) {
            container.innerHTML = '<p>Новых вакансий пока нет.</p>';
            return;
        }

        for (const item of items) {
            // Данные могут быть напрямую в item или в item.json, этот код обработает оба случая
            const vacancy = item.json ? item.json : item; 

            const card = document.createElement('div');
            card.className = 'vacancy-card';

            // Собираем карточку вакансии (убедитесь, что поля category и reason существуют)
            card.innerHTML = `
                <h3>${vacancy.category || 'Без категории'}</h3>
                <p>${vacancy.reason || 'Без описания'}</p>
            `;

            container.appendChild(card);
        }
    } catch (error) {
        console.error('Ошибка в скрипте:', error); // Добавил вывод в консоль для отладки
        container.innerHTML = `<p>Ошибка при загрузке данных: ${error.message}</p>`;
    }
}

// Загружаем вакансии при открытии приложения
loadVacancies();