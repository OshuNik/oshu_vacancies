const tg = window.Telegram.WebApp;
tg.expand();

// --- НАСТРОЙКА SUPABASE ---
const SUPABASE_URL = 'https://lwfhtwnfqmdjwzrdznvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4';
// --- КОНЕЦ НАСТРОЙКИ ---

// --- ЭЛЕМЕНТЫ ДЛЯ ВКЛАДОК ---
const settingsTabButtons = document.querySelectorAll('.settings-tab-button');
const settingsTabContents = document.querySelectorAll('.settings-tab-content');

// --- ЭЛЕМЕНТЫ ДЛЯ КЛЮЧЕВЫХ СЛОВ ---
const keywordsInput = document.getElementById('keywords-input');
const keywordsDisplay = document.getElementById('current-keywords-display');
const saveBtn = document.getElementById('save-button');

// --- ЭЛЕМЕНТЫ ДЛЯ КАНАЛОВ ---
const loadDefaultsBtn = document.getElementById('load-defaults-btn');
const addChannelBtn = document.getElementById('add-channel-btn');
const channelInput = document.getElementById('channel-input');
const channelsListContainer = document.getElementById('channels-list');
const deleteAllBtn = document.getElementById('delete-all-btn');

// --- ЛОГИКА ПЕРЕКЛЮЧЕНИЯ ВКЛАДОК ---
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

// --- ЛОГИКА ДЛЯ КЛЮЧЕВЫХ СЛОВ ---
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
        await fetch(`${SUPABASE_URL}/rest/v1/settings?update_key=eq.1`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
            body: JSON.stringify({ keywords: kws })
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

// --- ЛОГИКА ДЛЯ КАНАЛОВ ---
function renderChannel(channel) {
    const channelItem = document.createElement('div');
    channelItem.className = 'channel-item';
    channelItem.dataset.channelId = channel.channel_id; // Используем channel_id как уникальный идентификатор

    const channelInfo = document.createElement('div');
    channelInfo.className = 'channel-item-info';

    const channelIdLink = document.createElement('a');
    channelIdLink.className = 'channel-item-id';
    const cleanId = channel.channel_id.startsWith('http') ? new URL(channel.channel_id).pathname.substring(1) : channel.channel_id;
    channelIdLink.textContent = cleanId.startsWith('@') ? cleanId : `@${cleanId}`;
    channelIdLink.href = channel.channel_id.startsWith('http') ? channel.channel_id : `https://t.me/${channel.channel_id.replace('@', '')}`;
    channelIdLink.target = '_blank';
    
    channelInfo.appendChild(channelIdLink);

    channelItem.innerHTML = `
        <div class="channel-item-toggle">
            <label class="toggle-switch">
                <input type="checkbox" ${channel.is_enabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>
        <button class="channel-item-delete">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;
    channelItem.prepend(channelInfo);
    
    // Локальное удаление из списка для UI
    channelItem.querySelector('.channel-item-delete').addEventListener('click', () => {
        channelItem.remove();
    });

    channelsListContainer.appendChild(channelItem);
}

function displayChannels(data) {
    channelsListContainer.innerHTML = '';
    if (data && data.length > 0) {
        data.forEach(item => renderChannel(item));
    } else {
        channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
    }
}

async function loadChannels() {
    if (!channelsListContainer) return;
    channelsListContainer.innerHTML = '<p>Загрузка каналов...</p>';
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/channels?select=*`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        displayChannels(data);
    } catch (error) {
        console.error('Ошибка загрузки каналов:', error);
        channelsListContainer.innerHTML = '<p class="empty-list">Не удалось загрузить каналы.</p>';
    }
}

async function saveChannels() {
    const channelItems = channelsListContainer.querySelectorAll('.channel-item');
    const channelsToSave = [];
    channelItems.forEach(item => {
        channelsToSave.push({
            channel_id: item.dataset.channelId,
            is_enabled: item.querySelector('input[type="checkbox"]').checked
        });
    });

    saveBtn.disabled = true;
    try {
        // Сначала удаляем все старые каналы
        await fetch(`${SUPABASE_URL}/rest/v1/channels?select=*`, {
            method: 'DELETE',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });

        // Затем вставляем новый список
        if (channelsToSave.length > 0) {
            await fetch(`${SUPABASE_URL}/rest/v1/channels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
                body: JSON.stringify(channelsToSave)
            });
        }
        tg.showAlert('Список каналов сохранен');
    } catch (error) {
        console.error('Ошибка сохранения каналов:', error);
        tg.showAlert('Ошибка сохранения каналов');
    } finally {
        saveBtn.disabled = false;
    }
}

// Добавление канала
if (addChannelBtn) {
    addChannelBtn.addEventListener('click', async () => {
        const channelId = channelInput.value.trim();
        if (!channelId) return;

        if (channelsListContainer.querySelector(`[data-channel-id="${channelId}"]`)) {
            tg.showAlert('Этот канал уже есть в списке.');
            return;
        }
        
        // Просто добавляем в UI, сохранение произойдет по кнопке "Сохранить"
        renderChannel({ channel_id: channelId, is_enabled: true });
        channelInput.value = '';
    });
}

// Загрузка стандартных каналов
if (loadDefaultsBtn) {
    loadDefaultsBtn.addEventListener('click', async () => {
        loadDefaultsBtn.disabled = true;
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/default_channels?select=channel_id`, {
                 headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
            });
            if (!response.ok) throw new Error('Could not fetch default channels');
            const defaultChannels = await response.json();
            
            const channelsToAdd = defaultChannels.map(ch => ({ channel_id: ch.channel_id, is_enabled: true }));

            // Добавляем в UI, избегая дубликатов
            channelsToAdd.forEach(channel => {
                 if (!channelsListContainer.querySelector(`[data-channel-id="${channel.channel_id}"]`)) {
                    renderChannel(channel);
                }
            });

        } catch (error) {
            console.error('Ошибка загрузки стандартных каналов:', error);
            tg.showAlert('Ошибка загрузки стандартных каналов');
        } finally {
            loadDefaultsBtn.disabled = false;
        }
    });
}

// Удаление всех каналов (только в UI)
if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
        if (!confirm('Вы уверены, что хотите очистить список? Изменения сохранятся только после нажатия на иконку сохранения.')) {
            return;
        }
        channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
    });
}

// Общий обработчик сохранения
if (saveBtn) {
    saveBtn.addEventListener('click', () => {
        const activeTab = document.querySelector('.settings-tab-content.active');
        if (activeTab.id === 'tab-keywords') {
            saveKeywords();
        } else if (activeTab.id === 'tab-channels') {
            saveChannels();
        }
    });
}

// Начальная загрузка
if (document.getElementById('tab-keywords')) {
    loadKeywords();
}
if (document.getElementById('tab-channels')) {
    loadChannels();
}
