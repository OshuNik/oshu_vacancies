// URL ваших n8n API
const GET_API_URL    = 'https://oshunik.ru/webhook/ВАШ_ПУТЬ_GET_NEW';
const UPDATE_API_URL = 'https://oshunik.ru/webhook/ВАШ_ПУТЬ_UPDATE';

const tg         = window.Telegram.WebApp;
const container  = document.getElementById('vacancies-list');
const refreshBtn = document.getElementById('refresh-button');

tg.expand();

refreshBtn.addEventListener('click', loadVacancies);

async function updateStatus(id, status, button) {
  button.classList.add('button-loading');
  try {
    await fetch(UPDATE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, newStatus: status }),
    });
    const card = document.getElementById(`card-${id}`);
    card.style.transition = 'opacity .3s';
    card.style.opacity = '0';
    setTimeout(() => card.remove(), 300);
  } catch {
    tg.showAlert('Не удалось обновить статус');
    button.classList.remove('button-loading');
  }
}

async function loadVacancies() {
  container.innerHTML = '<p>🔄 Загрузка...</p>';
  refreshBtn.classList.add('button-loading');
  try {
    const res  = await fetch(GET_API_URL + '?_=' + Date.now());
    if (!res.ok) throw new Error(res.statusText);
    let items = await res.json();
    if (!Array.isArray(items)) items = [items];
    if (!items.length) {
      container.innerHTML = '<p>Новых вакансий нет</p>';
      return;
    }
    container.innerHTML = '';
    for (const it of items) {
      const v = it.json || it;
      // делим найденные ключевые слова
      const keys = v.keywords_found.split(',').map(k=>k.trim()).filter(Boolean);
      // создаём regexp для подсветки
      const regex = new RegExp(`(${keys.join('|')})`, 'gi');
      // заменяем в оригинальном тексте
      const highlighted = v.text.replace(regex, '<span class="highlight">$1</span>');

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
          <p>${highlighted}</p>
        </details>
        <div class="card-buttons">
          <button class="favorite-button">⭐ В избранное</button>
          <button class="delete-button">❌ Удалить</button>
        </div>
      `;
      const [favBtn, delBtn] = card.querySelectorAll('button');
      favBtn.onclick = () => updateStatus(v.id, 'favorite', favBtn);
      delBtn.onclick = () => updateStatus(v.id, 'deleted',   delBtn);
      container.appendChild(card);
    }
  } catch (err) {
    container.innerHTML = `<p>Ошибка: ${err.message}</p>`;
  } finally {
    refreshBtn.classList.remove('button-loading');
  }
}

loadVacancies();
