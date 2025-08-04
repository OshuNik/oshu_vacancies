const tg = window.Telegram.WebApp;
tg.expand();

// --- НАСТРОЙКА SUPABASE ---
// Вставьте сюда ваши данные из вашего проекта Supabase
const SUPABASE_URL = 'https://lwfhtwnfqmdjwzrdznvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4';
// --- КОНЕЦ НАСТРОЙКИ ---

const container = document.getElementById('favorites-list');
const searchInputFav = document.getElementById('search-input-fav');

// --- Функция поиска (без изменений) ---
function filterFavorites() {
    const query = searchInputFav.value.toLowerCase();
    const cards = container.querySelectorAll('.vacancy-card');
    let visibleCount = 0;

    cards.forEach(card => {
        const cardText = card.textContent.toLowerCase();
        if (cardText.includes(query)) {
            card.style.display = '';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });

    let emptyMessage = container.querySelector('.empty-list');
    if (visibleCount === 0 && cards.length > 0) {
        if (!emptyMessage) {
            emptyMessage = document.createElement('p');
            emptyMessage.className = 'empty-list';
            container.appendChild(emptyMessage);
        }
        emptyMessage.textContent = '-- Ничего не найдено --';
        emptyMessage.style.display = 'block';
    } else if (emptyMessage && emptyMessage.textContent.includes('найдено')) {
        emptyMessage.style.display = 'none';
    }
}

searchInputFav.addEventListener('input', filterFavorites);

// --- Вспомогательная функция (без изменений) ---
function formatTimestamp(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('ru-RU', { 
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
    });
}

// --- ОБНОВЛЕННАЯ ФУНКЦИЯ ---
// Теперь удаление из избранного (смена статуса на 'new') происходит через Supabase
async function updateStatus(event, vacancyId, newStatus) {
    const cardElement = document.getElementById(`card-${vacancyId}`);
    
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${vacancyId}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });

        // Анимация исчезновения
        cardElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
            cardElement.remove();
            if (container.children.length === 0) {
                 container.innerHTML = '<p class="empty-list">-- В избранном пусто --</p>';
            }
        }, 300);
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
        tg.showAlert('Не удалось обновить статус.');
    }
}

// --- ОБНОВЛЕННАЯ ФУНКЦИЯ ---
// Теперь загрузка избранного происходит из Supabase
async function loadFavorites() {
    if (!container) return;
    container.innerHTML = '<p class="empty-list">Загрузка...</p>';

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?status=eq.favorite&select=*`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Ошибка сети: ${response.statusText}`);
        }

        const items = await response.json();
        
        if (items && items.length > 0) {
            items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }
        
        container.innerHTML = '';
        if (!items || items.length === 0) {
            container.innerHTML = '<p class="empty-list">-- В избранном пусто --</p>';
            return;
        }

        for (const item of items) {
            // Код отрисовки карточки остается без изменений
            const vacancy = item;
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
        filterFavorites();

    } catch (error) {
        console.error('Ошибка загрузки избранного:', error);
        container.innerHTML = `<p class="empty-list">Ошибка: ${error.message}</p>`;
    }
}

// Initial load
loadFavorites();
