// script.js

// Инициализируем Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();

// URL API для получения и обновления вакансий
const GET_API_URL    = 'https://oshunik.ru/webhook/3807c00b-ec11-402e-b054-ba0b3faad50b';
const UPDATE_API_URL = 'https://oshunik.ru/webhook/cf41ba34-60ed-4f3d-8d13-ec85de6297e2';

const container  = document.getElementById('vacancies-list');
const refreshBtn = document.getElementById('refresh-button');

// Обновление статуса вакансии
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
    console.log('Update status →', res.status);
    cardElement.style.opacity = '0';
    setTimeout(() => cardElement.remove(), 300);
  } catch (err) {
    console.error(err);
    tg.showAlert('Не удалось обновить статус');
    button.classList.remove('button-loading');
  }
}

// Загрузка и рендер вакансий
async function loadVacancies() {
  container.innerHTML = '<p>🔄 Загрузка...</p>';
  refreshBtn.classList.add('button-loading');
  try {
    const response = await fetch(`${GET_API_URL}?cache_buster=${Date.now()}`);
    console.log('Fetch status:', response.status);
    const text = await response.text();
    console.log('Fetch response text:', text);
    let items = text ? JSON.parse(text) : [];
    if (!Array.isArray(items)) items = [items];

    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = '<p>Новых вакансий нет</p>';
      return;
    }

    items.forEach(item => {
      const v = item.json || item;
      const card = document.createElement('div');
      card.className = 'vacancy-card';
      card.id        = `card-${v.id}`;

      card.innerHTML = `
        <h3>${v.category || '⚠️ Без категории'}</h3>
        <p><strong>Причина:</strong> ${v.reason || 'нет данных'}</p>
        <p><strong>Ключевые слова:</strong> ${v.keywords_found || 'нет данных'}</p>
        <p><strong>Канал:</strong> ${v.channel || 'нет данных'}</p>
        <hr>
        <details>
          <summary>Показать полный текст</summary>
          <p>${v.text_highlighted || 'нет данных'}</p>
        </details>
        <div class="card-buttons">
          <button class="favorite-button" onclick="updateStatus('${v.id}', 'favorite')">⭐ В избранное</button>
          <button class="delete-button"   onclick="updateStatus('${v.id}', 'deleted')">❌ Удалить</button>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (e) {
    console.error('Error loadVacancies:', e);
    container.innerHTML = `<p>Ошибка загрузки: ${e.message}</p>`;
  } finally {
    refreshBtn.classList.remove('button-loading');
  }
}

refreshBtn.addEventListener('click', loadVacancies);
loadVacancies();
