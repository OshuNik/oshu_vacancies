// script.js

// Инициализируем Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();

// URL API для получения и обновления вакансий
const GET_API_URL    = 'https://oshunik.ru/webhook/3807c00b-ec11-402e-b054-ba0b3faad50b';
const UPDATE_API_URL = 'https://oshunik.ru/webhook/cf41ba34-60ed-4f3d-8d13-ec85de6297e2';

const container  = document.getElementById('vacancies-list');
const refreshBtn = document.getElementById('refresh-button');

// Функция обновления статуса вакансии
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

// Функция загрузки и отображения вакансий
async function loadVacancies() {
  container.innerHTML        = '<p>🔄 Загрузка...</p>';
  refreshBtn.classList.add('button-loading');

  try {
    // Запрос к API
    const response = await fetch(`${GET_API_URL}?cache_buster=${Date.now()}`);
    console.log('Fetch to', GET_API_URL, '→', response.status, response.statusText);

    const text = await response.text();
    console.log('Fetch response:', text);

    let items = [];
    if (text) {
      try {
        items = JSON.parse(text);
      } catch (e) {
        console.error('Ошибка парсинга JSON:', e);
        container.innerHTML = '<p>Ошибка разбора данных от сервера</p>';
        return;
      }
    }

    container.innerHTML = '';

    if (items && !Array.isArray(items)) {
      items = [items];
    }
    if (!items.length) {
      container.innerHTML = '<p>Новых вакансий нет</p>';
      return;
    }

    // Рендерим каждую карточку
    items.forEach(item => {
      const vacancy = item.json ? item.json : item;
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
          <p>${vacancy.text_highlighted_sms || 'нет данных'}</p>
        </details>
        <div class="card-buttons">
          <button class="favorite-button" onclick="updateStatus('${vacancy.id}', 'favorite')">⭐ В избранное</button>
          <button class="delete-button"   onclick="updateStatus('${vacancy.id}', 'deleted')">❌ Удалить</button>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (error) {
    console.error('Ошибка в loadVacancies:', error);
    container.innerHTML = `<p>Ошибка при загрузке данных: ${error.message}</p>`;
  } finally {
    refreshBtn.classList.remove('button-loading');
  }
}

// Привязываем кнопку и вызываем при старте
refreshBtn.addEventListener('click', loadVacancies);
loadVacancies();
