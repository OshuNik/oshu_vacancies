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
const GET_CHANNELS_URL = 'https://oshunik.ru/webhook/channels';
const SAVE_CHANNELS_URL = 'https://oshunik.ru/webhook/channels-save';
const LOAD_DEFAULTS_URL = 'https://oshunik.ru/webhook/channels/load-defaults';
const ADD_CHANNEL_URL = 'https://oshunik.ru/webhook/channels/add'; // ✅ Новый URL
const DELETE_ALL_URL = 'https://oshunik.ru/webhook/channels/delete-all'; // ✅ Новый URL

const loadDefaultsBtn = document.getElementById('load-defaults-btn');
const addChannelBtn = document.getElementById('add-channel-btn');
const channelInput = document.getElementById('channel-input');
const channelsListContainer = document.getElementById('channels-list');
const deleteAllBtn = document.getElementById('delete-all-btn'); // ✅ Новая кнопка

// --- ЛОГИКА ПЕРЕКЛЮЧЕНИЯ ВКЛАДОК ---
// ... (этот блок без изменений) ...

// --- ЛОГИКА ДЛЯ КЛЮЧЕВЫХ СЛОВ ---
// ... (этот блок без изменений) ...

// --- ЛОГИКА ДЛЯ КАНАЛОВ ---

function renderChannel(channel) {
    // ... (эта функция без изменений) ...
}

function displayChannels(data) {
    // ... (эта функция без изменений) ...
}

async function loadChannels() {
    // ... (эта функция без изменений) ...
}

async function saveChannels() {
    // ... (эта функция без изменений) ...
}

// ✅ ИЗМЕНЕНИЕ 3: Логика добавления канала теперь сохраняет его на сервере
if (addChannelBtn) {
    addChannelBtn.addEventListener('click', async () => {
        const channelId = channelInput.value.trim();
        if (!channelId) return;

        if (channelsListContainer.querySelector(`[data-channel-id="${channelId}"]`)) {
            tg.showAlert('Этот канал уже есть в списке.');
            return;
        }

        try {
            const response = await fetch(ADD_CHANNEL_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel_id: channelId })
            });

            if (!response.ok) throw new Error('Не удалось добавить канал');
            
            // Если все успешно, добавляем в UI
            const emptyMsg = channelsListContainer.querySelector('.empty-list');
            if (emptyMsg) {
                channelsListContainer.innerHTML = '';
            }
            renderChannel({ id: channelId, title: channelId, enabled: true });
            channelInput.value = '';

        } catch (error) {
            console.error('Ошибка добавления канала:', error);
            tg.showAlert(error.message);
        }
    });
}

if (loadDefaultsBtn) {
    // ... (этот блок без изменений) ...
}

// ✅ ИЗМЕНЕНИЕ 2: Логика удаления всех каналов
if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
        if (!confirm('Вы уверены, что хотите удалить все каналы? Это действие необратимо.')) {
            return;
        }

        try {
            const response = await fetch(DELETE_ALL_URL, { method: 'POST' });
            if (!response.ok) throw new Error('Не удалось удалить каналы');
            
            // Если все успешно, очищаем UI
            channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
            tg.showAlert('Все каналы удалены.');

        } catch (error) {
            console.error('Ошибка удаления каналов:', error);
            tg.showAlert(error.message);
        }
    });
}


// --- ОБЩИЙ ОБРАБОТЧИК СОХРАНЕНИЯ ---
// ... (этот блок без изменений) ...

// --- НАЧАЛЬНАЯ ЗАГРУЗКА ---
// ... (этот блок без изменений) ...
