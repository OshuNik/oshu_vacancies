const tg = window.Telegram.WebApp;
tg.expand();

const GET_URL    = 'https://oshunik.ru/webhook/3807c00b-ec11-402e-b054-ba0b3faad50b';
const UPDATE_URL = 'https://oshunik.ru/webhook/cf41ba34-60ed-4f3d-8d13-ec85de6297e2';

const listEl = document.getElementById('vacancies-list');
const btn     = document.getElementById('refresh-button');

async function loadVacancies() {
  listEl.innerHTML = '<p>🔄 Загрузка...</p>';
  try {
    const res  = await fetch(GET_URL + '?cache_buster=' + Date.now());
    const data = await res.json();
    listEl.innerHTML = '';
    (Array.isArray(data)? data : [data]).forEach(item => {
      const v = item.json || item;
      const card = document.createElement('div');
      card.className = 'vacancy-card';
      card.innerHTML = `
        <h3>${v.category}</h3>
        <p><strong>Причина:</strong> ${v.reason}</p>
        <p><strong>Ключевые слова:</strong> ${v.keywords_found}</p>
        <p><strong>Канал:</strong> ${v.channel}</p>
        <hr>
        <details>
          <summary>Показать полный текст</summary>
          <p>${v.text_highlighted_sheet}</p>
        </details>
        <div class="card-buttons">
          <button class="favorite-button" onclick="updateStatus('${v.id}','favorite')">⭐ В избранное</button>
          <button class="delete-button"   onclick="updateStatus('${v.id}','deleted')">❌ Удалить</button>
        </div>
      `;
      listEl.appendChild(card);
    });
    if (!data || !data.length) listEl.innerHTML = '<p>Новых вакансий нет</p>';
  } catch(e) {
    listEl.innerHTML = `<p>Ошибка: ${e.message}</p>`;
  }
}

async function updateStatus(id, status) {
  try {
    await fetch(UPDATE_URL, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ id, newStatus: status })
    });
    loadVacancies();
  } catch(e) {
    alert('Не удалось обновить статус');
    console.error(e);
  }
}

btn.addEventListener('click', loadVacancies);
loadVacancies();
