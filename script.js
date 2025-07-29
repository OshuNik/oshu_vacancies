// script.js

// 1) Инициализируем WebApp API — tg становится глобальным
const tg = window.Telegram.WebApp;
tg.expand();

// 2) Навешиваем обработчик на кнопку “Настройки”
document.getElementById('settings-button').addEventListener('click', () => {
  // Откроет внешний URL в браузере или внутри WebView
  tg.openLink('https://your-domain.com/settings.html');
});

// 3) Остальной код приложения — загрузка и отображение вакансий
const GET_API_URL    = 'https://oshunik.ru/webhook/3807c00b-ec11-402e-b054-ba0b3faad50b';
const UPDATE_API_URL = 'https://oshunik.ru/webhook/cf41ba34-60ed-4f3d-8d13-ec85de6297e2';

const container  = document.getElementById('vacancies-list');
const refreshBtn = document.getElementById('refresh-button');

refreshBtn.addEventListener('click', loadVacancies);

async function updateStatus(id, newStatus) {
  const btn = event.target;
  btn.classList.add('button-loading');
  try {
    await fetch(UPDATE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, newStatus }),
    });
    document.getElementById(`card-${id}`)?.remove();
  } catch {
    tg.showAlert('Не удалось обновить статус.');
    btn.classList.remove('button-loading');
  }
}

async function loadVacancies() {
  container.innerHTML = '<p>🔄 Загрузка...</p>';
  refreshBtn.classList.add('button-loading');
  let items = [];
  try {
    const res  = await fetch(`${GET_API_URL}?cache_buster=${Date.now()}`);
    const text = await res.text();
    items = text ? JSON.parse(text) : [];
    if (!Array.isArray(items)) items = [items];
  } catch (e) {
    console.error(e);
    container.innerHTML = `<p>Ошибка: ${e.message}</p>`;
    refreshBtn.classList.remove('button-loading');
    return;
  }

  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = '<p>Новых вакансий нет</p>';
  }

  items.forEach(it => {
    const v = it.json || it;
    const card = document.createElement('div');
    card.className = 'vacancy-card';
    card.id = `card-${v.id}`;
    card.innerHTML = `
      <h3>${v.category}</h3>
      <p><strong>Причина:</strong> ${v.reason}</p>
      <p><strong>Ключевые слова:</strong> ${v.keywords_found}</p>
      <p><strong>Канал:</strong> ${v.channel}</p>
      <hr>
      <details>
        <summary>Показать полный текст</summary>
        <p>${v.text_highlighted_webapp || 'нет данных'}</p>
      </details>
      <div class="card-buttons">
        <button class="favorite-button" onclick="updateStatus('${v.id}','favorite')">⭐ В избранное</button>
        <button class="delete-button"   onclick="updateStatus('${v.id}','deleted')">❌ Удалить</button>
      </div>
    `;
    container.appendChild(card);
  });

  refreshBtn.classList.remove('button-loading');
}

// Первый запуск
loadVacancies();
