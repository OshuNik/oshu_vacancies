// Функция для загрузки и отображения вакансий
async function loadVacancies() {
    try {
        // URL вашего Webhook из n8n (Шаг 2)
        const API_URL = 'https://oshunik.ru/webhook/3807c00b-ec11-402e-b054-ba0b3faad50b'; // Убедитесь, что URL верный

        const response = await fetch(API_URL);
        let items = await response.json(); // Убираем const, чтобы можно было изменить

        const container = document.getElementById('vacancies-list');
        container.innerHTML = ''; // Очищаем надпись "Загрузка..."

        // --- НОВЫЙ БЛОК ПРОВЕРКИ ---
        // Если n8n вернул один объект, а не массив, мы превращаем его в массив из одного элемента
        if (!Array.isArray(items)) {
            items = [items];
        }
        // --------------------------

        if (items.length === 0) {
            container.innerHTML = '<p>Новых вакансий пока нет.</p>';
            return;
        }

        for (const item of items) {
            const vacancy = item.json; // Данные лежат внутри .json

            const card = document.createElement('div');
            card.className = 'vacancy-card';

            // Собираем карточку вакансии
            card.innerHTML = `
                <h3>${vacancy.category}</h3>
                <p>${vacancy.reason}</p>
            `;

            container.appendChild(card);
        }
    } catch (error) {
        container.innerHTML = `<p>Ошибка при загрузке данных: ${error.message}</p>`;
    }
}

// Загружаем вакансии при открытии приложения
loadVacancies();