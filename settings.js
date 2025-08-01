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

const loadDefaultsBtn = document.getElementById('load-defaults-btn');
const addChannelBtn = document.getElementById('add-channel-btn');
const channelInput = document.getElementById('channel-input');
const channelsListContainer = document.getElementById('channels-list');

// --- ЛОГИКА ПЕРЕКЛЮЧЕНИЯ ВКЛАДОК ---
if (settingsTabButtons.length > 0) {
    settingsTabButtons.forEach(button => {
        button.addEventListener('click', () => {
            settingsTabButtons.forEach(btn => btn.classList.remove('active'));
            settingsTabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            const targetContent = document.getElementById(button.dataset.target);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

// --- ЛОГИКА ДЛЯ КЛЮЧЕВЫХ СЛОВ ---
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
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ keywords:kws })
    });
    
    keywordsDisplay.textContent = kws || '-- не заданы --'; 
    if (tg.showPopup) {
        tg.showPopup({ message: 'Ключевые слова сохранены' });
    } else {
        tg.showAlert('Ключевые слова сохранены');
    }

  } catch (error) {
    console.error('Ошибка при сохранении ключевых слов:', error);
  } finally {
    saveBtn.disabled = false;
  }
}

// --- ЛОГИКА ДЛЯ КАНАЛОВ ---
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

    channelItem.querySelector('.channel-item-delete').addEventListener('click', () => {
        channelItem.remove();
    });
    
    channelsListContainer.appendChild(channelItem);
}

async function loadChannels() {
    if (!channelsListContainer) return;
    channelsListContainer.innerHTML = '<p>Загрузка каналов...</p>';
    try {
        const response = await fetch(GET_CHANNELS_URL + '?cache_buster=' + new Date().getTime());
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        channelsListContainer.innerHTML = '';
        if (data && data.length > 0) {
            data.forEach(item => {
                // ИСПРАВЛЕНИЕ: Убираем .json, так как данные приходят напрямую
                const channelData = item; 
                if (channelData && channelData.channel_id) {
                    renderChannel({
                        id: channelData.channel_id,
                        title: channelData.channel_title,
                        enabled: channelData.is_enabled === 'TRUE'
                    });
                }
            });
        } else {
             channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
        }
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
            channel_title: item.querySelector('.channel-item-title').textContent,
            is_enabled: item.querySelector('input[type="checkbox"]').checked
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
            tg.showPopup({ message: 'Список каналов сохранен' });
        } else {
            tg.showAlert('Список каналов сохранен');
        }
    } catch (error) {
        console.error('Ошибка сохранения каналов:', error);
        tg.showAlert('Ошибка сохранения каналов');
    } finally {
        saveBtn.disabled = false;
    }
}

if (addChannelBtn) {
    addChannelBtn.addEventListener('click', () => {
        const channelId = channelInput.value.trim();
        if (channelId) {
            if (channelsListContainer.querySelector(`[data-channel-id="${channelId}"]`)) {
                tg.showAlert('Этот канал уже есть в списке.');
                return;
            }
            renderChannel({ id: channelId, title: channelId, enabled: true });
            channelInput.value = '';
        }
    });
}

if (loadDefaultsBtn) {
    loadDefaultsBtn.addEventListener('click', async () => {
        loadDefaultsBtn.disabled = true;
        try {
            await fetch(LOAD_DEFAULTS_URL, { method: 'POST' });
            await loadChannels();
        } catch (error) {
            console.error('Ошибка загрузки стандартных каналов:', error);
            tg.showAlert('Ошибка загрузки стандартных каналов');
        } finally {
            loadDefaultsBtn.disabled = false;
        }
    });
}

// --- ОБЩИЙ ОБРАБОТЧИК СОХРАНЕНИЯ ---
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


// --- НАЧАЛЬНАЯ ЗАГРУЗКА ---
if (document.getElementById('tab-keywords')) {
    loadKeywords();
}
if (document.getElementById('tab-channels')) {
    loadChannels();
}
