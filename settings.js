const tg = window.Telegram.WebApp;
tg.expand();

// --- ЭЛЕМЕНТЫ ДЛЯ ВКЛАДОК ---
const settingsTabButtons = document.querySelectorAll('.settings-tab-button');
const settingsTabContents = document.querySelectorAll('.settings-tab-content');

// --- ЭЛЕМЕНТЫ ДЛЯ КЛЮЧЕВЫХ СЛОВ ---
const GET_KEYWORDS_URL  = 'https://oshunik.ru/webhook/91f2562c-bfad-42d6-90ba-2ca5473c7e7e';
const SAVE_KEYWORDS_URL = 'https://oshunik.ru/webhook/8a21566c-baf5-47e1-a84c-b96b464d3713';
const keywordsInput   = document.getElementById('keywords-input');
const keywordsDisplay = document.getElementById('current-keywords-display');
const saveBtn = document.getElementById('save-button');

// --- ЭЛЕМЕНТЫ И URL ДЛЯ КАНАЛОВ ---
const GET_CHANNELS_URL = 'https://oshunik.ru/webhook/channels/get-list';
const SAVE_CHANNELS_URL = 'https://oshunik.ru/webhook/channels-save';
const LOAD_DEFAULTS_URL = 'https://oshunik.ru/webhook/channels/load-defaults';
const ADD_CHANNEL_URL = 'https://oshunik.ru/webhook/channels/add';
const DELETE_ALL_URL = 'https://oshunik.ru/webhook/channels/delete-all';

const loadDefaultsBtn = document.getElementById('load-defaults-btn');
const addChannelBtn = document.getElementById('add-channel-btn');
const channelInput = document.getElementById('channel-input');
const channelsListContainer = document.getElementById('channels-list');
const deleteAllBtn = document.getElementById('delete-all-btn');

// --- ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ---
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

// --- КЛЮЧЕВЫЕ СЛОВА ---
async function loadKeywords() {
    if (!keywordsDisplay) return;
    saveBtn.disabled = true;
    try {
        const response = await fetch(GET_KEYWORDS_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        let keywords = '';
        if (data && data.length > 0 && data[0].keywords !== undefined) {
            keywords = data[0].keywords;
        }
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
        await fetch(SAVE_KEYWORDS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords: kws })
        });
        keywordsDisplay.textContent = kws || '-- не заданы --';
        if (tg.showPopup) tg.showPopup({ message: 'Ключевые слова сохранены' });
        else tg.showAlert('Ключевые слова сохранены');
    } catch (error) {
        console.error('Ошибка при сохранении ключевых слов:', error);
    } finally {
        saveBtn.disabled = false;
    }
}

// --- КАНАЛЫ ---
function renderChannel(channel) {
    const channelItem = document.createElement('div');
    channelItem.className = 'channel-item';
    channelItem.dataset.channelId = channel.id;

    const channelInfo = document.createElement('div');
    channelInfo.className = 'channel-item-info';

    const channelTitle = document.createElement('span');
    channelTitle.className = 'channel-item-title';
    channelTitle.textContent = channel.title || channel.id;

    const channelIdLink = document.createElement('a');
    channelIdLink.className = 'channel-item-id';
    const cleanId = channel.id.startsWith('http') ? new URL(channel.id).pathname.substring(1) : channel.id;
    channelIdLink.textContent = cleanId.startsWith('@') ? cleanId : `@${cleanId}`;
    channelIdLink.href = channel.id.startsWith('http') ? channel.id : `https://t.me/${channel.id.replace('@', '')}`;
    channelIdLink.target = '_blank';

    channelInfo.appendChild(channelTitle);
    channelInfo.appendChild(channelIdLink);

    channelItem.innerHTML = `
        <div class="channel-item-toggle">
            <label class="toggle-switch">
                <input type="checkbox" ${channel.enabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>
        <button class="channel-item-delete">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;

    channelItem.prepend(channelInfo);

    // Кнопка удаления отдельного канала (не удаляет на сервере, только из списка)
    channelItem.querySelector('.channel-item-delete').addEventListener('click', () => {
        channelItem.remove();
    });

    channelsListContainer.appendChild(channelItem);
}

function displayChannels(data) {
    channelsListContainer.innerHTML = '';
    // Уникализация по channel_id
    const unique = {};
    if (data && data.length > 0) {
        data.forEach(item => {
            const channelData = item.json ? item.json : item;
            if (channelData && channelData.channel_id) {
                unique[channelData.channel_id] = {
                    id: channelData.channel_id,
                    title: channelData.channel_title,
                    enabled: channelData.is_enabled === 'TRUE'
                };
            }
        });
        Object.values(unique).forEach(renderChannel);
    } else {
        channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
    }
}

async function loadChannels() {
    if (!channelsListContainer) return;
    channelsListContainer.innerHTML = '<p>Загрузка каналов...</p>';
    try {
        const response = await fetch(GET_CHANNELS_URL + '?cache_buster=' + new Date().getTime());
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const responseText = await response.text();
        if (!responseText) {
            displayChannels([]);
            return;
        }
        const data = JSON.parse(responseText);
        displayChannels(data);
    } catch (error) {
        console.error('Ошибка загрузки каналов:', error);
        channelsListContainer.innerHTML = '<p class="empty-list">Не удалось загрузить каналы.</p>';
    }
}

async function saveChannels() {
    const channelItems = channelsListContainer.querySelectorAll('.channel-item');
    // Уникализируем по channel_id
    const seen = {};
    const channelsToSave = [];
    channelItems.forEach(item => {
        const id = item.dataset.channelId;
        if (!seen[id]) {
            seen[id] = true;
            channelsToSave.push({
                channel_id: id,
                channel_title: item.querySelector('.channel-item-title').textContent,
                is_enabled: item.querySelector('input[type="checkbox"]').checked
            });
        }
    });

    saveBtn.disabled = true;
    try {
        await fetch(SAVE_CHANNELS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(channelsToSave)
        });
        if (tg.showPopup) tg.showPopup({ message: 'Список каналов сохранен' });
        else tg.showAlert('Список каналов сохранен');
    } catch (error) {
        console.error('Ошибка сохранения каналов:', error);
        tg.showAlert('Ошибка сохранения каналов');
    } finally {
        saveBtn.disabled = false;
    }
}

if (addChannelBtn) {
    addChannelBtn.addEventListener('click', async () => {
        const channelId = channelInput.value.trim();
        if (!channelId) return;
        // Если канал уже есть — не добавляем
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
            if (emptyMsg) channelsListContainer.innerHTML = '';
            renderChannel({ id: channelId, title: channelId, enabled: true });
            channelInput.value = '';
        } catch (error) {
            console.error('Ошибка добавления канала:', error);
            tg.showAlert(error.message);
        } finally {
            addChannelBtn.disabled = false;
        }
    });
}

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

if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
        if (!confirm('Вы уверены, что хотите удалить все каналы? Это действие необратимо.')) return;
        deleteAllBtn.disabled = true;
        try {
            const response = await fetch(DELETE_ALL_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error('Не удалось удалить каналы на сервере');
            channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
            if (tg.showPopup) tg.showPopup({ message: 'Все каналы удалены' });
            else tg.showAlert('Все каналы удалены.');
        } catch (error) {
            console.error('Ошибка удаления каналов:', error);
            tg.showAlert(error.message);
        } finally {
            deleteAllBtn.disabled = false;
        }
    });
}

// --- ОБЩИЙ ОБРАБОТЧИК СОХРАНЕНИЯ ---
if (saveBtn) {
    saveBtn.addEventListener('click', () => {
        const activeTab = document.querySelector('.settings-tab-content.active');
        if (activeTab.id === 'tab-keywords') saveKeywords();
        else if (activeTab.id === 'tab-channels') saveChannels();
    });
}

// --- НАЧАЛЬНАЯ ЗАГРУЗКА ---
if (document.getElementById('tab-keywords')) loadKeywords();
if (document.getElementById('tab-channels')) loadChannels();
