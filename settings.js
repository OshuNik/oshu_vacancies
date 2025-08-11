// settings.js — стилизованные уведомления + confirm
// ИСПРАВЛЕНО: убран хардкод, настройки берутся из APP_CONFIG

(function() {
  'use strict';

  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  if (tg && tg.expand) tg.expand();

  // --- ИСПРАВЛЕНО: Берём конфиг из глобального объекта ---
  const CFG = window.APP_CONFIG;
  if (!CFG || !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) {
    alert("Критическая ошибка: Конфигурация приложения не найдена!");
    return;
  }
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = CFG;
  // --- КОНЕЦ ИСПРАВЛЕНИЯ ---


  // ---------- UI helpers ----------
  function uiToast(message = '') {
    let cont = document.getElementById('toast-container');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'toast-container';
      cont.className = 'toast-container';
      document.body.appendChild(cont);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    cont.appendChild(toast);
    // авто-скрытие
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 200);
    }, 2200);
  }
  function uiAlert(msg) {
    // в Telegram используем нативный диалог, в браузере — тост
    if (tg && typeof tg.showAlert === 'function') tg.showAlert(msg);
    else uiToast(msg);
  }

  // --- элементы вкладок ---
  const settingsTabButtons = document.querySelectorAll('.settings-tab-button');
  const settingsTabContents = document.querySelectorAll('.settings-tab-content');

  // --- KEYWORDS ---
  const keywordsInput = document.getElementById('keywords-input');
  const keywordsDisplay = document.getElementById('current-keywords-display');
  const saveBtn = document.getElementById('save-button');

  // --- CHANNELS ---
  const loadDefaultsBtn = document.getElementById('load-defaults-btn');
  const addChannelBtn = document.getElementById('add-channel-btn');
  const channelInput = document.getElementById('channel-input');
  const channelsListContainer = document.getElementById('channels-list');
  const deleteAllBtn = document.getElementById('delete-all-btn');

  // --- confirm overlay из HTML ---
  const confirmOverlay = document.getElementById('custom-confirm-overlay');
  const confirmText = document.getElementById('custom-confirm-text');
  const confirmOkBtn = document.getElementById('confirm-btn-ok');
  const confirmCancelBtn = document.getElementById('confirm-btn-cancel');

  function showCustomConfirm(message, callback) {
    if (!confirmOverlay) return callback(window.confirm(message));
    confirmText.textContent = message;
    confirmOverlay.classList.remove('hidden');
    confirmOkBtn.onclick = () => { confirmOverlay.classList.add('hidden'); callback(true); };
    confirmCancelBtn.onclick = () => { confirmOverlay.classList.add('hidden'); callback(false); };
  }

  // --- табы ---
  settingsTabButtons.forEach(button => {
    button.addEventListener('click', () => {
      settingsTabButtons.forEach(btn => btn.classList.remove('active'));
      settingsTabContents.forEach(content => content.classList.remove('active'));
      button.classList.add('active');
      const targetContent = document.getElementById(button.dataset.target);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // --- KEYWORDS logic ---
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
      uiAlert('Ключевые слова сохранены');
    } catch (error) {
      console.error('Ошибка при сохранении ключевых слов:', error);
      uiAlert('Ошибка сохранения');
    } finally {
      saveBtn.disabled = false;
    }
  }

  // --- CHANNELS logic ---
  function renderChannel(channel) {
    const channelItem = document.createElement('div');
    channelItem.className = 'channel-item';
    channelItem.dataset.dbId = channel.id;

    const infoDiv = document.createElement('div');
    infoDiv.className = 'channel-item-info';

    const cleanId = channel.channel_id.replace('@', '');
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
      const dbId = channelItem.dataset.dbId;
      if (!dbId) return;
      channelItem.style.opacity = '0.5';
      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/channels?id=eq.${dbId}`, {
          method: 'DELETE',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        if (!response.ok) throw new Error('Ошибка ответа сети');
        channelItem.remove();
        uiToast('Канал удалён');
      } catch (error) {
        console.error('Ошибка удаления канала:', error);
        uiAlert('Не удалось удалить канал');
        channelItem.style.opacity = '1';
      }
    });

    toggleInput.addEventListener('change', async (event) => {
      const dbId = channelItem.dataset.dbId;
      const is_enabled = event.target.checked;
      if (!dbId) return;
      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/channels?id=eq.${dbId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ is_enabled: is_enabled })
        });
        if (!response.ok) throw new Error('Ошибка ответа сети');
        uiToast(is_enabled ? 'Канал включён' : 'Канал выключен');
      } catch (error) {
        console.error('Ошибка обновления статуса канала:', error);
        uiAlert('Не удалось обновить статус');
        event.target.checked = !is_enabled;
      }
    });

    infoDiv.append(titleSpan, idLink);
    toggleLabel.append(toggleInput, toggleSlider);
    toggleContainer.append(toggleLabel);
    channelItem.append(infoDiv, toggleContainer, deleteButton);

    const emptyListMessage = channelsListContainer.querySelector('.empty-list');
    if (emptyListMessage) emptyListMessage.remove();
    channelsListContainer.appendChild(channelItem);
  }

  async function addChannel() {
    let channelId = channelInput.value.trim();
    if (!channelId) return;

    if (channelId.includes('t.me/')) {
      channelId = '@' + channelId.split('t.me/')[1].split('/')[0];
    }
    if (!channelId.startsWith('@')) channelId = '@' + channelId;

    addChannelBtn.disabled = true;
    const newChannelData = { channel_id: channelId, channel_title: channelId, is_enabled: true };

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(newChannelData)
      });
      if (!response.ok) throw new Error('Канал не найден или ошибка сети');

      const data = await response.json();
      renderChannel(data[0]);
      channelInput.value = '';
      uiToast('Канал добавлен');
    } catch (error) {
      console.error('Ошибка добавления канала:', error);
      uiAlert('Не удалось добавить канал. Проверьте имя.');
    } finally {
      addChannelBtn.disabled = false;
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

      channelsListContainer.innerHTML = '';
      if (data && data.length > 0) data.forEach(item => renderChannel(item));
      else channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';

    } catch (error) {
      console.error('Ошибка загрузки каналов:', error);
      channelsListContainer.innerHTML = '<p class="empty-list">Не удалось загрузить каналы.</p>';
    }
  }

  // --- обработчики ---
  addChannelBtn?.addEventListener('click', addChannel);

  saveBtn?.addEventListener('click', () => {
    const activeTab = document.querySelector('.settings-tab-content.active');
    if (activeTab.id === 'tab-keywords') saveKeywords();
    else uiAlert('Изменения в каналах сохраняются автоматически!');
  });

  loadDefaultsBtn?.addEventListener('click', async () => {
    loadDefaultsBtn.disabled = true;
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/default_channels?select=channel_id`, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
      });
      if (!response.ok) throw new Error('Не удалось получить стандартные каналы');
      const defaultChannels = await response.json();
      if (defaultChannels.length === 0) { uiAlert('Список стандартных каналов пуст.'); return; }
      const channelsToUpsert = defaultChannels.map(ch => ({ channel_id: ch.channel_id, is_enabled: true }));
      await fetch(`${SUPABASE_URL}/rest/v1/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(channelsToUpsert)
      });
      await loadChannels();
      uiToast('Стандартные каналы добавлены.');
    } catch (error) {
      console.error('Ошибка загрузки стандартных каналов:', error);
      uiAlert('Ошибка загрузки стандартных каналов');
    } finally {
      loadDefaultsBtn.disabled = false;
    }
  });

  deleteAllBtn?.addEventListener('click', () => {
    const message = 'Удалить все каналы из базы? Это действие необратимо.';
    showCustomConfirm(message, async (isConfirmed) => {
      if (!isConfirmed) return;
      deleteAllBtn.disabled = true;
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/channels?id=gt.0`, {
          method: 'DELETE',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
        uiToast('Все каналы удалены.');
      } catch (error) {
        console.error('Ошибка удаления каналов:', error);
        uiAlert(String(error));
      } finally {
        deleteAllBtn.disabled = false;
      }
    });
  });

  // Initial
  loadKeywords();
  loadChannels();
})();
