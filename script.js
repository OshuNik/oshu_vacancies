const tg = window.Telegram.WebApp;
tg.expand();

// --- SUPABASE SETUP ---
const SUPABASE_URL = 'https://lwfhtwnfqmdjwzrdznvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4';
// --- END OF SETUP ---

// --- TAB ELEMENTS ---
const settingsTabButtons = document.querySelectorAll('.settings-tab-button');
const settingsTabContents = document.querySelectorAll('.settings-tab-content');

// --- KEYWORD ELEMENTS ---
const keywordsInput = document.getElementById('keywords-input');
const keywordsDisplay = document.getElementById('current-keywords-display');
const saveBtn = document.getElementById('save-button');

// --- CHANNEL ELEMENTS ---
const loadDefaultsBtn = document.getElementById('load-defaults-btn');
const addChannelBtn = document.getElementById('add-channel-btn');
const channelInput = document.getElementById('channel-input');
const channelsListContainer = document.getElementById('channels-list');
const deleteAllBtn = document.getElementById('delete-all-btn');

// --- TAB SWITCHING LOGIC ---
if (settingsTabButtons.length > 0) {
    settingsTabButtons.forEach(button => {
        button.addEventListener('click', () => {
            settingsTabButtons.forEach(btn => btn.classList.remove('active'));
            settingsTabContents.forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            const targetContent = document.getElementById(button.dataset.target);
            if (targetContent) targetContent.classList.add('active');
        });
    });
}

// --- KEYWORD LOGIC (без изменений) ---
async function loadKeywords() {
    if (!keywordsDisplay) return;
    saveBtn.disabled = true;
    keywordsDisplay.textContent = 'Загрузка...';
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/settings?select=keywords`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        const keywords = data.length > 0 ? data[0].keywords : '';
        keywordsInput.value = keywords;
        keywordsDisplay.textContent = keywords || '-- не заданы --';
    } catch (error) {
        console.error('Ошибка загрузки ключевых слов:', error);
        keywordsDisplay.textContent = 'Ошибка загрузки';
    } finally {
        saveBtn.disabled = false;
    }
}

async function saveKeywords() {
    if (!keywordsInput) return;
    const kws = keywordsInput.value.trim();
    saveBtn.disabled = true;
    try {
        // Мы используем upsert: true, чтобы создать запись, если она не существует
        await fetch(`${SUPABASE_URL}/rest/v1/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify({ update_key: 1, keywords: kws })
        });
        keywordsDisplay.textContent = kws || '-- не заданы --';
        tg.showAlert('Ключевые слова сохранены');
    } catch (error) {
        console.error('Ошибка при сохранении ключевых слов:', error);
        tg.showAlert('Ошибка сохранения');
    } finally {
        saveBtn.disabled = false;
    }
}

// --- НОВАЯ ЛОГИКА ДЛЯ КАНАЛОВ (АВТОСОХРАНЕНИЕ) ---

// Функция для отрисовки ОДНОГО канала и навешивания на него событий
function renderChannel(channel) {
    const channelItem = document.createElement('div');
    channelItem.className = 'channel-item';
    // Используем ID из базы данных, если он есть, для надежности
    channelItem.dataset.dbId = channel.id;

    // --- HTML-структура элемента списка ---
    const cleanId = channel.channel_id.startsWith('http') ? new URL(channel.channel_id).pathname.substring(1) : channel.channel_id.replace('@', '');
    channelItem.innerHTML = `
        <div class="channel-item-info">
            <span class="channel-item-title">${channel.channel_title || cleanId}</span>
            <a href="https://t.me/${cleanId}" target="_blank" class="channel-item-id">@${cleanId}</a>
        </div>
        <div class="channel-item-toggle">
            <label class="toggle-switch">
                <input type="checkbox" class="toggle-channel" ${channel.is_enabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>
        <button class="channel-item-delete">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;

    // --- Событие для кнопки УДАЛЕНИЯ ---
    channelItem.querySelector('.channel-item-delete').addEventListener('click', async () => {
        const dbId = channelItem.dataset.dbId;
        if (!dbId) return; // Не удаляем, если нет ID из базы
        
        // Визуально удаляем сразу для отзывчивости
        channelItem.style.opacity = '0';
        setTimeout(() => channelItem.remove(), 300);

        try {
            await fetch(`${SUPABASE_URL}/rest/v1/channels?id=eq.${dbId}`, {
                method: 'DELETE',
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
            });
        } catch (error) {
            console.error('Ошибка удаления канала:', error);
            tg.showAlert('Не удалось удалить канал');
            // Если ошибка, возвращаем элемент на место
            channelItem.style.opacity = '1';
        }
    });

    // --- Событие для ПЕРЕКЛЮЧАТЕЛЯ ---
    channelItem.querySelector('.toggle-channel').addEventListener('change', async (event) => {
        const dbId = channelItem.dataset.dbId;
        const is_enabled = event.target.checked;
        if (!dbId) return;
        
        try {
            await fetch(`${SUPABASE_URL}/rest/v1/channels?id=eq.${dbId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
                body: JSON.stringify({ is_enabled: is_enabled })
            });
        } catch (error) {
            console.error('Ошибка обновления статуса канала:', error);
            tg.showAlert('Не удалось обновить статус');
            // Возвращаем чекбокс в исходное состояние
            event.target.checked = !is_enabled;
        }
    });

    // Вставляем созданный элемент в список
    const emptyListMessage = channelsListContainer.querySelector('.empty-list');
    if (emptyListMessage) {
        emptyListMessage.remove();
    }
    channelsListContainer.appendChild(channelItem);
}


// Функция для ДОБАВЛЕНИЯ нового канала
async function addChannel() {
    let channelId = channelInput.value.trim();
    if (!channelId) return;
    
    // Очищаем от лишнего
    if (channelId.includes('t.me/')) {
        channelId = '@' + channelId.split('t.me/')[1].split('/')[0];
    }
    if (!channelId.startsWith('@')) {
        channelId = '@' + channelId;
    }

    addChannelBtn.disabled = true;
    const newChannelData = {
        channel_id: channelId,
        channel_title: channelId, // Изначально ставим юзернейм как заголовок
        is_enabled: true
    };

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/channels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Prefer': 'return=representation' },
            body: JSON.stringify(newChannelData)
        });
        if (!response.ok) throw new Error('Канал не найден или ошибка сети');
        
        const data = await response.json();
        renderChannel(data[0]); // Отрисовываем канал с ID, полученным от базы
        channelInput.value = ''; // Очищаем поле ввода
    } catch (error) {
        console.error('Ошибка добавления канала:', error);
        tg.showAlert('Не удалось добавить канал. Проверьте правильность имени.');
    } finally {
        addChannelBtn.disabled = false;
    }
}

// ОСНОВНАЯ ФУНКЦИЯ ЗАГРУЗКИ КАНАЛОВ
async function loadChannels() {
    if (!channelsListContainer) return;
    channelsListContainer.innerHTML = '<p>Загрузка каналов...</p>';
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/channels?select=*`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        channelsListContainer.innerHTML = ''; // Очищаем контейнер
        if (data && data.length > 0) {
            data.forEach(item => renderChannel(item));
        } else {
            channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
        }

    } catch (error) {
        console.error('Ошибка загрузки каналов:', error);
        channelsListContainer.innerHTML = '<p class="empty-list">Не удалось загрузить каналы.</p>';
    }
}


// --- ИНИЦИАЛИЗАЦИЯ И ОБРАБОТЧИКИ СОБЫТИЙ ---

// Кнопка "Добавить канал"
if (addChannelBtn) {
    addChannelBtn.addEventListener('click', addChannel);
}

// ИЗМЕНЕНО: Кнопка "Сохранить" теперь сохраняет только ключевые слова
if (saveBtn) {
    saveBtn.addEventListener('click', () => {
        const activeTab = document.querySelector('.settings-tab-content.active');
        if (activeTab.id === 'tab-keywords') {
            saveKeywords();
        } else {
            // Для вкладки каналов кнопка больше ничего не делает, так как у нас автосохранение
            tg.showAlert('Изменения в каналах сохраняются автоматически!');
        }
    });
}

// Загрузка стандартных каналов (без изменений)
if (loadDefaultsBtn) {
    loadDefaultsBtn.addEventListener('click', async () => {
        loadDefaultsBtn.disabled = true;
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/default_channels?select=channel_id`, {
                 headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
            });
            if (!response.ok) throw new Error('Не удалось получить стандартные каналы');
            const defaultChannels = await response.json();
            if (defaultChannels.length === 0) {
                tg.showAlert('Список стандартных каналов пуст.');
                return;
            }
            const channelsToUpsert = defaultChannels.map(ch => ({ channel_id: ch.channel_id, is_enabled: true }));
            await fetch(`${SUPABASE_URL}/rest/v1/channels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Prefer': 'resolution=merge-duplicates'},
                body: JSON.stringify(channelsToUpsert)
            });
            await loadChannels();
            tg.showAlert('Стандартные каналы добавлены.');
        } catch (error) {
            console.error('Ошибка загрузки стандартных каналов:', error);
            tg.showAlert('Ошибка загрузки стандартных каналов');
        } finally {
            loadDefaultsBtn.disabled = false;
        }
    });
}

// Удаление всех каналов (без изменений)
if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
        if (!confirm('Вы уверены, что хотите удалить все каналы из базы данных? Это действие необратимо.')) {
            return;
        }
        deleteAllBtn.disabled = true;
        try {
            await fetch(`${SUPABASE_URL}/rest/v1/channels?id=gt.0`, {
                method: 'DELETE',
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
            });
            channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
            tg.showAlert('Все каналы удалены.');

        } catch (error) {
             console.error('Ошибка удаления каналов:', error);
             tg.showAlert(String(error));
        } finally {
            deleteAllBtn.disabled = false;
        }
    });
}

// Начальная загрузка данных при открытии страницы
loadKeywords();
loadChannels();
