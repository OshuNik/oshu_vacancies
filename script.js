// Инициализируем API Телеграма
const tg = window.Telegram.WebApp;
tg.expand(); // Расширяем приложение на весь экран

// !!! ВАЖНО: Вставьте сюда ваш РАБОЧИЙ (Production) URL из n8n !!!
const API_URL = 'https://oshunik.ru/webhook/3807c00b-ec11-402e-b054-ba0b3faad50b';

const container = document.getElementById('vacancies-list');

// Функция для загрузки и отображения вакансий
async function loadVacancies() {
    try {
        // Добавляем параметр для обхода кэша
        const response = await fetch(API_URL + '?cache_buster=' + new Date().getTime());
        let items = await response.json();
        
        container.innerHTML = ''; // Очищаем надпись "Загрузка..."

        // Проверяем, если n8n вернул один объект, а не массив, превращаем его в массив
        if (items && !Array.isArray(items)) {
            items = [items];
        }

        if (!items || items.length === 0) {
            container.innerHTML = '<p>Новых вакансий пока нет.</p>';
            return;
        }

        for (const item of items) {
            // Данные могут быть напрямую в item или в item.json, этот код обработает оба случая
            const vacancy = item.json ? item.json : item; 
            
            const card = document.createElement('div');
            card.className = 'vacancy-card';
            
            const categoryTitle = vacancy.category || '⚠️ Вакансия без категории';
            
            // Собираем карточку вакансии
            card.innerHTML = `
                <h3>${categoryTitle}</h3>
                <p>${vacancy.reason || 'Описание отсутствует.'}</p>
            `;
            
            container.appendChild(card);
        }
    } catch (error) {
        console.error('Ошибка в скрипте:', error); // Выводим ошибку в консоль для отладки
        container.innerHTML = `<p>Ошибка при загрузке данных: ${error.message}</p>`;
    }
}

// Загружаем вакансии при открытии приложения
loadVacancies();