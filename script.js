// Замените на реальные URL ваших n8n‑вебхуков:
const GET_API_URL    = 'https://oshunik.ru/webhook/ВАШ_GET_NEW_PATH';
const UPDATE_API_URL = 'https://oshunik.ru/webhook/ВАШ_UPDATE_STATUS_PATH';

const tg         = window.Telegram.WebApp;
const container  = document.getElementById('vacancies-list');
const refreshBtn = document.getElementById('refresh-button');

tg.expand();
refreshBtn.addEventListener('click', loadVacancies);

async function loadVacancies() {
  container.innerHTML = '<p>🔄 Загрузка...</p>';
  refreshBtn.classList.add('button-loading');
  try {
    const res = await fetch(`${GET_API_URL}?_=${Date.now()}`);
    if (!res.ok) throw new Error(res.statusText);
    let items = await res.json();
    if (!Array.isArray(items)) items = [items];
    container.innerHTML = '';
    if (items.length === 0) {
      container.innerHTML = '<p>Новых вакансий нет</p>';
      return;
    }
    items.forEach(it => renderVacancy(it.json || it));
  } catch (err) {
    container.innerHTML = `<p>Ошибка загрузки: ${err.message}</p>`;
  } finally {
    refreshBtn.classList.remove('button-loading');
  }
}

function renderVacancy(v) {
  const text = v.text || '';
  const keys = (v.keywords_found || '').split(',').map(k => k.trim()).filter(Boolean);
  const re   = new RegExp(`(${keys.join('|')})`, 'gi');
  const highlighted = text.replace(re, '<span class="highlight">$1</span>');

  const card = document.createElement('div');
  card.className = 'vacancy-card';
  card.id        = `card-${v.id}`;
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
  favBtn.addEventListener('click', () => updateStatus(v.id, 'favorite', favBtn));
  delBtn.addEventListener('click', () => updateStatus(v.id, 'deleted',   delBtn));
  container.appendChild(card);
}

async function updateStatus(id, newStatus, btn) {
  btn.classList.add('button-loading');
  try {
    await fetch(UPDATE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, newStatus }),
    });
    document.getElementById(`card-${id}`)
            .style.transition = 'opacity .3s';
    document.getElementById(`card-${id}`).style.opacity = '0';
    setTimeout(() => document.getElementById(`card-${id}`).remove(), 300);
  } catch {
    btn.classList.remove('button-loading');
    tg.showAlert('Не удалось обновить статус');
  }
}

loadVacancies();
