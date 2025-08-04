const tg = window.Telegram.WebApp;
tg.expand();

// --- КОНСТАНТЫ ДЛЯ КАНАЛОВ ---
const GET_CHANNELS_URL   = 'https://oshunik.ru/webhook/channels/get-list';
const SAVE_CHANNELS_URL  = 'https://oshunik.ru/webhook/channels-save';
const LOAD_DEFAULTS_URL  = 'https://oshunik.ru/webhook/channels/load-defaults';
const ADD_CHANNEL_URL    = 'https://oshunik.ru/webhook/channels/add';
const DELETE_ALL_URL     = 'https://oshunik.ru/webhook/channels/delete-all';

const loadDefaultsBtn         = document.getElementById('load-defaults-btn');
const addChannelBtn           = document.getElementById('add-channel-btn');
const channelInput            = document.getElementById('channel-input');
const channelsListContainer   = document.getElementById('channels-list');
const deleteAllBtn            = document.getElementById('delete-all-btn');
const saveBtn                 = document.getElementById('save-button');

// --- РЕНДЕР КАНАЛА ---
function renderChannel(channel) {
    if (!channel.channel_id) return;
    const channelItem = document.createElement('div');
    channelItem.className = 'channel-item';
    channelItem.dataset.channelId = channel.channel_id;

    const channelInfo = document.createElement('div');
    channelInfo.className = 'channel-item-info';

    const channelTitle = document.createElement('span');
    channelTitle.className = 'channel-item-title';
    channelTitle.textContent = channel.channel_title || channel.channel_id;

    const channelIdLink = document.createElement('a');
    channelIdLink.className = 'channel-item-id';
    const cleanId = channel.channel_id.startsWith('http') ? new URL(channel.channel_id).pathname.substring(1) : channel.channel_id;
    channelIdLink.textContent = cleanId.startsWith('@') ? cleanId : `@${cleanId}`;
    channelIdLink.href = channel.channel_id.startsWith('http') ? channel.channel_id : `https://t.me/${channel.channel_id.replace('@', '')}`;
    channelIdLink.target = '_blank';

    channelInfo.appendChild(channelTitle);
    channelInfo.appendChild(channelIdLink);

    channelItem.innerHTML = `
        <div class="channel-item-toggle">
            <label class="toggle-switch">
                <input type="checkbox" ${channel.is_enabled === true || channel.is_enabled === "TRUE" ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>
        <button class="channel-item-delete">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;

    channelItem.prepend(channelInfo);

    channelItem.querySelector('.channel-item-delete').addEventListener('click', () => {
        channelItem.remove();
    });

    channelsListContainer.appendChild(channelItem);
}

// --- ВЫВОД СПИСКА КАНАЛОВ ---
function displayChannels(data) {
    channelsListContainer.innerHTML = '';
    // фильтр уникальных каналов по channel_id
    const unique = {};
    if (Array.isArray(data) && data.length > 0) {
        data.forEach(item => {
            const channelData = item.json ? item.json : item;
            if (channelData && channelData.channel_id && !unique[channelData.channel_id]) {
                unique[channelData.channel_id] = true;
                renderChannel(channelData);
            }
        });
    }
    if (Object.keys(unique).length === 0) {
        channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
    }
}

// --- ЗАГРУЗКА КАНАЛОВ С СЕРВЕРА ---
async function loadChannels() {
    if (!channelsListContainer) return;
    channelsListContainer.innerHTML = '<p>Загрузка каналов...</p>';
    try {
        const response = await fetch(GET_CHANNELS_URL + '?cache_buster=' + new Date().getTime());
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        displayChannels(data);
    } catch (error) {
        console.error('Ошибка загрузки каналов:', error);
        channelsListContainer.innerHTML = '<p class="empty-list">Не удалось загрузить каналы.</p>';
    }
}

// --- СОХРАНЕНИЕ СПИСКА КАНАЛОВ ---
async function saveChannels() {
    const channelItems = channelsListContainer.querySelectorAll('.channel-item');
    const channelsToSave = [];
    channelItems.forEach(item => {
        channelsToSave.push({
            channel_id: item.dataset.channelId,
            channel_title: item.querySelector('.channel-item-title').textContent,
            is_enabled: item.querySelector('input[type="checkbox"]').checked ? "TRUE" : "FALSE"
        });
    });

    saveBtn.disabled = true;
    try {
        await fetch(SAVE_CHANNELS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(channelsToSave)
        });
        if (tg.showPopup) {
            tg.showPopup({ message: 'Список каналов сохранён' });
        } else {
            tg.showAlert('Список каналов сохранён');
        }
    } catch (error) {
        console.error('Ошибка сохранения каналов:', error);
        tg.showAlert('Ошибка сохранения каналов');
    } finally {
        saveBtn.disabled = false;
    }
}

// --- ДОБАВИТЬ КАНАЛ ---
if (addChannelBtn) {
    addChannelBtn.addEventListener('click', async () => {
        const channelId = channelInput.value.trim();
        if (!channelId) return;
        // Проверка на дубли
        if (channelsListContainer.querySelector(`[data-channel-id="${channelId}"]`)) {
            tg.showAlert('Этот канал уже есть в списке.');
            return;
        }
        addChannelBtn.disabled = true;
        try {
            const response = await fetch(ADD_CHANNEL_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel_id: channelId })
            });
            if (!response.ok) throw new Error('Не удалось добавить канал на сервере');
            const emptyMsg = channelsListContainer.querySelector('.empty-list');
            if (emptyMsg) {
                channelsListContainer.innerHTML = '';
            }
            renderChannel({ channel_id: channelId, channel_title: channelId, is_enabled: true });
            channelInput.value = '';
        } catch (error) {
            console.error('Ошибка добавления канала:', error);
            tg.showAlert(error.message);
        } finally {
            addChannelBtn.disabled = false;
        }
    });
}

// --- ЗАГРУЗИТЬ СТАНДАРТНЫЕ КАНАЛЫ ---
if (loadDefaultsBtn) {
    loadDefaultsBtn.addEventListener('click', async () => {
        loadDefaultsBtn.disabled = true;
        channelsListContainer.innerHTML = '<p>Загрузка стандартных каналов...</p>';
        try {
            const response = await fetch(LOAD_DEFAULTS_URL, { method: 'POST' });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            await loadChannels();
        } catch (error) {
            console.error('Ошибка загрузки стандартных каналов:', error);
            tg.showAlert('Ошибка загрузки стандартных каналов');
            channelsListContainer.innerHTML = '<p class="empty-list">Ошибка.</p>';
        } finally {
            loadDefaultsBtn.disabled = false;
        }
    });
}

// --- УДАЛИТЬ ВСЕ КАНАЛЫ ---
if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
        if (!confirm('Вы уверены, что хотите удалить все каналы? Это действие необратимо.')) {
            return;
        }
        deleteAllBtn.disabled = true;
        try {
            const response = await fetch(DELETE_ALL_URL, { method: 'POST' });
            if (!response.ok) throw new Error('Не удалось удалить каналы на сервере');
            channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
            if (tg.showPopup) {
                tg.showPopup({ message: 'Все каналы удалены' });
            } else {
                tg.showAlert('Все каналы удалены.');
            }
        } catch (error) {
            console.error('Ошибка удаления каналов:', error);
            tg.showAlert(error.message);
        } finally {
            deleteAllBtn.disabled = false;
        }
    });
}

// --- КНОПКА СОХРАНЕНИЯ ---
if (saveBtn) {
    saveBtn.addEventListener('click', () => {
        const activeTab = document.querySelector('.settings-tab-content.active');
        if (activeTab && activeTab.id === 'tab-channels') {
            saveChannels();
        }
    });
}

// --- АВТОЗАГРУЗКА ---
if (document.getElementById('tab-channels')) {
    loadChannels();
}
