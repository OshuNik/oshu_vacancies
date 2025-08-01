const tg = window.Telegram.WebApp;
tg.expand();

// --- ЭЛЕМЕНТЫ ДЛЯ ВКЛАДОК ---
const settingsTabButtons = document.querySelectorAll('.settings-tab-button');
const settingsTabContents = document.querySelectorAll('.settings-tab-content');

// --- ЭЛЕМЕНТЫ ДЛЯ КЛЮЧЕВЫХ СЛОВ ---
const GET_KEYWORDS_URL  = 'https://oshunik.ru/webhook/91f2c-bfad-42d6-90ba-2ca5473c7e7e';
const SAVE_KEYWORDS_URL = 'https://oshunik.ru/webhook/8a21566c-baf5-47e1-a84c-b96b464d3713';
const keywordsInput   = document.getElementById('keywords-input');
const keywordsDisplay = document.getElementById('current-keywords-display');
const saveBtn = document.getElementById('save-button');

// --- ЭЛЕМЕНТЫ ДЛЯ КАНАЛОВ ---
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

    if (data && data.length > 0) {
        if (data[0].keywords !== undefined) {
            keywords = data[0].keywords;
        } 
        else if (data[0].json && data[0].json.keywords !== undefined) {
            keywords = data[0].json.keywords;
        }
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

// --- ЛОГИКА ДЛЯ КАНАЛОВ (пока визуальная часть) ---
function renderChannel(channel) {
    const channelItem = document.createElement('div');
    channelItem.className = 'channel-item';
    channelItem.dataset.channelId = channel.id;

    channelItem.innerHTML = `
        <span class="channel-item-name">${channel.id}</span>
        <div class="channel-item-toggle">
            <span class="toggle-label">${channel.enabled ? 'Вкл' : 'Выкл'}</span>
            <label class="toggle-switch">
                <input type="checkbox" ${channel.enabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>
        <button class="channel-item-delete">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;

    channelItem.querySelector('.channel-item-delete').addEventListener('click', () => {
        channelItem.remove();
    });

    const toggleInput = channelItem.querySelector('input[type="checkbox"]');
    toggleInput.addEventListener('change', () => {
        channelItem.querySelector('.toggle-label').textContent = toggleInput.checked ? 'Вкл' : 'Выкл';
    });
    
    channelsListContainer.appendChild(channelItem);
}

function loadChannels() {
    if (!channelsListContainer) return;
    channelsListContainer.innerHTML = '';
    const fakeChannels = [
        { id: '@gamedevjob', enabled: true },
        { id: 'https://t.me/cidjin', enabled: true },
        { id: '@motionhunter', enabled: false }
    ];
    fakeChannels.forEach(renderChannel);
}

if (addChannelBtn) {
    addChannelBtn.addEventListener('click', () => {
        const channelId = channelInput.value.trim();
        if (channelId) {
            renderChannel({ id: channelId, enabled: true });
            channelInput.value = '';
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
            console.log('Сохранение каналов...');
            if (tg.showPopup) {
                tg.showPopup({ message: 'Функция сохранения каналов в разработке' });
            } else {
                tg.showAlert('Функция сохранения каналов в разработке');
            }
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
