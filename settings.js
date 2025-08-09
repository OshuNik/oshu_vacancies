// settings.js — безопасный WebApp fallback + существующая логика

const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
const { tg, safeAlert } = window.utils;

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

// --- Confirm modal ---
const confirmOverlay = document.getElementById('custom-confirm-overlay');
const confirmText = document.getElementById('custom-confirm-text');
const confirmOkBtn = document.getElementById('confirm-btn-ok');
const confirmCancelBtn = document.getElementById('confirm-btn-cancel');

function showCustomConfirm(message, callback) {
  confirmText.textContent = message;
  confirmOverlay.classList.remove('hidden');
  const close = () => confirmOverlay.classList.add('hidden');
  confirmOkBtn.onclick = () => { close(); callback(true); };
  confirmCancelBtn.onclick = () => { close(); callback(false); };
  confirmOverlay.onclick = (e) => { if (e.target === confirmOverlay) { close(); callback(false); } };
  document.addEventListener('keydown', function onEsc(e){ if (e.key==='Escape'){ close(); callback(false); document.removeEventListener('keydown', onEsc);} });
}

// --- TAB SWITCHING ---
settingsTabButtons.forEach(button => {
  button.addEventListener('click', () => {
    settingsTabButtons.forEach(btn => btn.classList.remove('active'));
    settingsTabContents.forEach(content => content.classList.remove('active'));
    button.classList.add('active');
    const targetContent = document.getElementById(button.dataset.target);
    if (targetContent) targetContent.classList.add('active');
  });
});

// --- KEYWORDS ---
async function loadKeywords() {
  if (!keywordsDisplay) return;
  saveBtn.disabled = true; keywordsDisplay.textContent = 'Загрузка...';
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/settings?select=keywords`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) throw new Error('Network response was not ok');
    const data = await res.json();
    const kws = data.length > 0 ? (data[0].keywords || '') : '';
    keywordsInput.value = kws;
    keywordsDisplay.textContent = kws || '-- не заданы --';
  } catch (e) {
    console.error(e);
    keywordsDisplay.textContent = 'Ошибка загрузки';
  } finally {
    saveBtn.disabled = false;
  }
}

async function saveKeywords() {
  const kws = (keywordsInput?.value || '').trim();
  saveBtn.disabled = true;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ update_key: 1, keywords: kws })
    });
    keywordsDisplay.textContent = kws || '-- не заданы --';
    safeAlert('Ключевые слова сохранены');
  } catch (e) {
    console.error(e);
    safeAlert('Ошибка сохранения');
  } finally {
    saveBtn.disabled = false;
  }
}

// --- CHANNELS ---
function renderChannel(channel) {
  const item = document.createElement('div');
  item.className = 'channel-item';
  item.dataset.dbId = channel.id;

  const infoDiv = document.createElement('div');
  infoDiv.className = 'channel-item-info';

  const cleanId = channel.channel_id.replace('@','');
  const titleSpan = document.createElement('span');
  titleSpan.className = 'channel-item-title';
  titleSpan.textContent = channel.channel_title || cleanId;

  const idLink = document.createElement('a');
  idLink.className = 'channel-item-id';
  idLink.textContent = `@${cleanId}`;
  idLink.href = `https://t.me/${cleanId}`;
  idLink.target = '_blank';

  const toggleContainer = document.createElement('div');
  toggleContainer.className = 'channel-item-toggle';
  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'toggle-switch';
  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.checked = channel.is_enabled;
  const toggleSlider = document.createElement('span');
  toggleSlider.className = 'toggle-slider';

  const deleteButton = document.createElement('button');
  deleteButton.className = 'channel-item-delete';
  deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

  deleteButton.addEventListener('click', async () => {
    const dbId = item.dataset.dbId;
    if (!dbId) return;
    item.style.opacity = '0.5';
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/channels?id=eq.${dbId}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
      });
      if (!res.ok) throw new Error('Ошибка сети');
      item.remove();
    } catch (e) {
      console.error(e);
      safeAlert('Не удалось удалить канал');
      item.style.opacity = '1';
    }
  });

  toggleInput.addEventListener('change', async (event) => {
    const dbId = item.dataset.dbId;
    const is_enabled = event.target.checked;
    if (!dbId) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/channels?id=eq.${dbId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ is_enabled })
      });
      if (!res.ok) throw new Error('Ошибка сети');
    } catch (e) {
      console.error(e);
      safeAlert('Не удалось обновить статус');
      event.target.checked = !is_enabled;
    }
  });

  infoDiv.append(titleSpan, idLink);
  toggleLabel.append(toggleInput, toggleSlider);
  toggleContainer.append(toggleLabel);
  item.append(infoDiv, toggleContainer, deleteButton);

  const empty = channelsListContainer.querySelector('.empty-list');
  if (empty) empty.remove();
  channelsListContainer.appendChild(item);
}

async function addChannel() {
  let channelId = channelInput.value.trim();
  if (!channelId) return;
  if (channelId.includes('t.me/')) channelId = '@' + channelId.split('t.me/')[1].split('/')[0];
  if (!channelId.startsWith('@')) channelId = '@' + channelId;

  addChannelBtn.disabled = true;
  const payload = { channel_id: channelId, channel_title: channelId, is_enabled: true };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Канал не найден или ошибка сети');
    const data = await res.json();
    renderChannel(data[0]);
    channelInput.value = '';
  } catch (e) {
    console.error(e);
    safeAlert('Не удалось добавить канал. Проверьте правильность имени.');
  } finally {
    addChannelBtn.disabled = false;
  }
}

async function loadChannels() {
  if (!channelsListContainer) return;
  channelsListContainer.innerHTML = '<p>Загрузка каналов...</p>';
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/channels?select=*`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    channelsListContainer.innerHTML = '';
    if (Array.isArray(data) && data.length > 0) data.forEach(renderChannel);
    else channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
  } catch (e) {
    console.error(e);
    channelsListContainer.innerHTML = '<p class="empty-list">Не удалось загрузить каналы.</p>';
  }
}

// Events
addChannelBtn?.addEventListener('click', addChannel);
saveBtn?.addEventListener('click', () => {
  const activeTab = document.querySelector('.settings-tab-content.active');
  if (activeTab?.id === 'tab-keywords') saveKeywords();
  else safeAlert('Изменения в каналах сохраняются автоматически!');
});
loadDefaultsBtn?.addEventListener('click', async () => {
  loadDefaultsBtn.disabled = true;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/default_channels?select=channel_id`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) throw new Error('Не удалось получить стандартные каналы');
    const defaults = await res.json();
    if (defaults.length === 0) { safeAlert('Список стандартных каналов пуст.'); return; }
    const toUpsert = defaults.map(ch => ({ channel_id: ch.channel_id, is_enabled: true }));
    await fetch(`${SUPABASE_URL}/rest/v1/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(toUpsert)
    });
    await loadChannels();
    safeAlert('Стандартные каналы добавлены.');
  } catch (e) {
    console.error(e);
    safeAlert('Ошибка загрузки стандартных каналов');
  } finally {
    loadDefaultsBtn.disabled = false;
  }
});
deleteAllBtn?.addEventListener('click', () => {
  showCustomConfirm('Вы уверены, что хотите удалить все каналы из базы данных? Это действие необратимо.', async (ok) => {
    if (!ok) return;
    deleteAllBtn.disabled = true;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/channels?id=gt.0`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
      });
      channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
      safeAlert('Все каналы удалены.');
    } catch (e) {
      console.error(e); safeAlert(String(e));
    } finally {
      deleteAllBtn.disabled = false;
    }
  });
});

// Initial
loadKeywords();
loadChannels();
