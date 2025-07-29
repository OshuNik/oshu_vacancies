// script.js

// Инициализируем API Телеграма
const tg = window.Telegram.WebApp;
tg.expand();

const GET_API_URL    = 'https://oshunik.ru/webhook/3807c00b-ec11-402e-b054-ba0b3faad50b';
const UPDATE_API_URL = 'https://oshunik.ru/webhook/cf41ba34-60ed-4f3d-8d13-ec85de6297e2';

const container  = document.getElementById('vacancies-list');
const refreshBtn = document.getElementById('refresh-button');

// Функция для обновления статуса вакансии
async function updateStatus(vacancyId, newStatus) {
  const cardElement = document.getElementById(`card-${vacancyId}`);
  const button      = event.target;
  button.classList.add('button-loading');

  try {
    const res = await fetch(UPDATE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: vacancyId, newStatus })
    });
    console.log('Update status →', res.status, res.statusText);
    cardElement.style.transition = 'opacity 0.3s ease';
    cardElement.style.opacity    = '0';
    setTimeout(() => cardElement.remove(), 300);
  } catch (err) {
    console.error('Ошибка обновления статуса:', err);
    tg.showAlert('Не удалось обновить статус.');
    button.classList.remove('button-loading');
  }
}

// Функция для загрузки и отображения вакансий
async function loadVacancies() {
  container.innerHTML        = '<p>🔄 Загрузка...</p>';
  refreshBtn.classList.add('button-loading');

  try {
    // 1) Делаем запрос
    const response = await fetch(`${GET_API_URL}?cache_buster=${Date.now()}`);
    console.log('Fetch to', GET_API_URL, '→', response.status, response.statusText);

    // 2) Читаем текст ответа и логируем
    const text = await response.text();
    console.log('Fetch response text:', text);

    // 3) Парсим JSON
    let items;
    try {
      items = text ? JSON.parse(text) : [];
    } catch (e) {
      console.error('Error parsing JSON:', e);
      container.innerHTML = '<p>Ошибка при разборе ответа от сервера</p>';
      return;
    }
    console.log('Parsed items:', items);

    // 4) Обнуляем контейнер
    container.innerHTML = '';

    // 5) Нормализация: если пришёл одиночный объект, делаем массив
    if (items && !Array.isArray(items)) {
      items = [items];
    }
    if (!items || items.length === 0) {
      container.innerHTML = '<p>Новых вакансий нет</p>';
      return;
    }

    // 6) Рендерим карточки
    for (const item of items) {
      const vacancy = item.json ? item.json : item;
      if (!vacancy.id) continue;

      const card = document.createElement('div');
      card.className = 'vacancy-card';
      card.id        = `card-${vacancy.id}`;

      card.innerHTML = `
        <h3>${vacancy.category || '⚠️ Без категории'}</h3>
        <p><strong>Причина:</strong> ${vacancy.reason || 'нет данных'}</p>
        <p><strong>Ключевые слова:</strong> ${vacancy.keywords_found || 'нет данных'}</p>
        <p><strong>Канал:</strong> ${vacancy.channel || 'нет данных'}</p>
        <hr>
        <details>
          <summary>Показать полный текст</summary>
          <p>${vacancy.text_highlighted_sheet || 'нет данных'}</p>
        </details>
        <div class="card-buttons">
          <button class="favorite-button" onclick="updateStatus('${vacancy.id}', 'favorite')">⭐ В избранное</button>
          <button class="delete-button"   onclick="updateStatus('${vacancy.id}', 'deleted')">❌ Удалить</button>
        </div>
      `;
      container.appendChild(card);
    }
  } catch (error) {
    console.error('Ошибка в скрипте loadVacancies:', error);
    container.innerHTML = `<p>Ошибка при загрузке данных: ${error.message}</p>`;
  } finally {
    refreshBtn.classList.remove('button-loading');
  }
}

// Привязываем кнопку «Обновить» к loadVacancies и вызываем при старте
refreshBtn.addEventListener('click', loadVacancies);
loadVacancies();
