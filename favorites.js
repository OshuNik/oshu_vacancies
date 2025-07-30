/* 6. Обновлённый JavaScript для избранного (favorites.js)               */
/* ======================================================================= */
const tg = window.Telegram.WebApp;
tg.expand();

const GET_FAVORITES_API_URL = 'https://oshunik.ru/webhook/9dcaefca-5f63-4668-9364-965c4ace49d2'; 
const UPDATE_API_URL = 'https://oshunik.ru/webhook/cf41ba34-60ed-4f3d-8d13-ec85de6297e2';

const container = document.getElementById('favorites-list');

function formatTimestamp(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('ru-RU', { 
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
    });
}

// ИЗМЕНЕНИЕ: Функция теперь не перезагружает страницу
async function updateStatus(event, vacancyId, newStatus) {
    const cardElement = document.getElementById(`card-${vacancyId}`);
    
    try {
        await fetch(UPDATE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: vacancyId, newStatus: newStatus })
        });
        cardElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
            cardElement.remove();
            // Проверяем, не стал ли список пустым
            if (container.children.length === 0) {
                 container.innerHTML = '<p class="empty-list">-- В избранном пусто --</p>';
            }
        }, 300);
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
        tg.showAlert('Не удалось обновить статус.');
    }
}

async function loadFavorites() {
    if (!container) return;
    container.innerHTML = '<p class="empty-list">Загрузка...</p>';

    try {
        const response = await fetch(GET_FAVORITES_API_URL + '?cache_buster=' + new Date().getTime());
        const items = await response.json();
        
        if (items && items.length > 0) {
            items.sort((a, b) => {
                const timeA = (a.json || a).timestamp;
                const timeB = (b.json || b).timestamp;
                if (!timeA) return 1;
                if (!timeB) return -1;
                return new Date(timeB) - new Date(timeA);
            });
        }
        
        container.innerHTML = '';
        if (!items || items.length === 0) {
            container.innerHTML = '<p class="empty-list">-- В избранном пусто --</p>';
            return;
        }

        for (const item of items) {
            const vacancy = item.json ? item.json : item;
            if (!vacancy.id) continue;

            const card = document.createElement('div');
            card.className = 'vacancy-card';
            card.id = `card-${vacancy.id}`;
            
            card.innerHTML = `
                <div class="card-actions">
                    <button class="card-action-btn delete" onclick="updateStatus(event, '${vacancy.id}', 'new')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div class="card-header">
                    <h3>${vacancy.category || 'NO_CATEGORY'}</h3>
                </div>
                <div class="card-body">
                    <p><strong>Причина:</strong> ${vacancy.reason || 'Нет данных'}</p>
                    <p><strong>Ключевые слова:</strong> ${vacancy.keywords_found || 'Нет данных'}</p>
                    <p><strong>Канал:</strong> ${vacancy.channel || 'Нет данных'}</p>
                    <details>
                        <summary>Показать полный текст</summary>
                        <p>${vacancy.text_highlighted || 'Нет данных'}</p>
                    </details>
                </div>
                <div class="card-footer">
                    <span class="timestamp-footer">${formatTimestamp(vacancy.timestamp)}</span>
                </div>
            `;
            container.appendChild(card);
        }

    } catch (error) {
        console.error('Ошибка загрузки избранного:', error);
        container.innerHTML = `<p class="empty-list">Ошибка: ${error.message}</p>`;
    }
}

loadFavorites();
