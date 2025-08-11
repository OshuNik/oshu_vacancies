// Отладочная версия settings.js
(function() {
  'use strict';
  console.log('[DEBUG] settings.js: Скрипт запущен.');

  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  if (tg && tg.expand) tg.expand();
  console.log('[DEBUG] settings.js: Telegram WebApp инициализирован.');

  const CFG = window.APP_CONFIG;
  const UTIL = window.utils;

  if (!CFG || !UTIL) {
    alert("Критическая ошибка: Не найден config.js или utils.js!");
    console.error('[DEBUG] settings.js: CRITICAL_ERROR - CFG или UTIL не найдены.', { CFG, UTIL });
    return;
  }
  console.log('[DEBUG] settings.js: CFG и UTIL успешно загружены.');

  const { uiToast, safeAlert, showCustomConfirm, createSupabaseHeaders } = UTIL;
  console.log('[DEBUG] settings.js: Функции из UTIL успешно извлечены.');

  const settingsTabButtons = document.querySelectorAll('.settings-tab-button');
  const settingsTabContents = document.querySelectorAll('.settings-tab-content');
  const keywordsInput = document.getElementById('keywords-input');
  const keywordsDisplay = document.getElementById('current-keywords-display');
  const saveBtn = document.getElementById('save-button');
  const loadDefaultsBtn = document.getElementById('load-defaults-btn');
  const addChannelBtn = document.getElementById('add-channel-btn');
  const channelInput = document.getElementById('channel-input');
  const channelsListContainer = document.getElementById('channels-list');
  const deleteAllBtn = document.getElementById('delete-all-btn');
  console.log('[DEBUG] settings.js: Все DOM-элементы найдены.');

  settingsTabButtons.forEach(button => {
    button.addEventListener('click', () => {
      settingsTabButtons.forEach(btn => btn.classList.remove('active'));
      settingsTabContents.forEach(content => content.classList.remove('active'));
      button.classList.add('active');
      const targetContent = document.getElementById(button.dataset.target);
      if (targetContent) targetContent.classList.add('active');
    });
  });
  console.log('[DEBUG] settings.js: Обработчики для табов установлены.');

  async function loadKeywords() {
    console.log('[DEBUG] loadKeywords: Функция вызвана.');
    if (!keywordsDisplay) {
        console.error('[DEBUG] loadKeywords: CRITICAL - элемент keywordsDisplay не найден.');
        return;
    }
    saveBtn.disabled = true;
    keywordsDisplay.textContent = 'Загрузка...';
    try {
      console.log('[DEBUG] loadKeywords: Отправка запроса на получение ключевых слов...');
      const response = await fetch(`${CFG.SUPABASE_URL}/rest/v1/settings?select=keywords`, {
        headers: createSupabaseHeaders()
      });
      console.log('[DEBUG] loadKeywords: Получен ответ от сервера.', response.status);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      const keywords = data.length > 0 ? data[0].keywords : '';
      keywordsInput.value = keywords;
      keywordsDisplay.textContent = keywords || '-- не заданы --';
      console.log('[DEBUG] loadKeywords: Ключевые слова успешно загружены и отображены.');
    } catch (error) {
      console.error('[DEBUG] loadKeywords: Произошла ошибка.', error);
      keywordsDisplay.textContent = 'Ошибка загрузки';
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function saveKeywords() {
    console.log('[DEBUG] saveKeywords: Функция вызвана.');
    if (!keywordsInput) return;
    const kws = keywordsInput.value.trim();
    saveBtn.disabled = true;
    try {
      await fetch(`${CFG.SUPABASE_URL}/rest/v1/settings`, {
        method: 'POST',
        headers: createSupabaseHeaders({ prefer: 'resolution=merge-duplicates' }),
        body: JSON.stringify({ update_key: 1, keywords: kws })
      });
      keywordsDisplay.textContent = kws || '-- не заданы --';
      uiToast('Ключевые слова сохранены');
    } catch (error) {
      console.error('[DEBUG] saveKeywords: Произошла ошибка.', error);
      safeAlert('Ошибка сохранения');
    } finally {
      saveBtn.disabled = false;
    }
  }

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
      const ok = await showCustomConfirm('Удалить этот канал?');
      if (!ok) return;
      channelItem.style.opacity = '0.5';
      try {
        const response = await fetch(`${CFG.SUPABASE_URL}/rest/v1/channels?id=eq.${dbId}`, {
          method: 'DELETE',
          headers: createSupabaseHeaders()
        });
        if (!response.ok) throw new Error('Ошибка ответа сети');
        channelItem.remove();
        uiToast('Канал удалён');
      } catch (error) {
        console.error('Ошибка удаления канала:', error);
        safeAlert('Не удалось удалить канал');
        channelItem.style.opacity = '1';
      }
    });
    toggleInput.addEventListener('change', async (event) => {
      const dbId = channelItem.dataset.dbId;
      const is_enabled = event.target.checked;
      if (!dbId) return;
      try {
        const response = await fetch(`${CFG.SUPABASE_URL}/rest/v1/channels?id=eq.${dbId}`, {
          method: 'PATCH',
          headers: createSupabaseHeaders(),
          body: JSON.stringify({ is_enabled: is_enabled })
        });
        if (!response.ok) throw new Error('Ошибка ответа сети');
        uiToast(is_enabled ? 'Канал включён' : 'Канал выключен');
      } catch (error) {
        console.error('Ошибка обновления статуса канала:', error);
        safeAlert('Не удалось обновить статус');
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
      const response = await fetch(`${CFG.SUPABASE_URL}/rest/v1/channels`, {
        method: 'POST',
        headers: createSupabaseHeaders({ prefer: 'return=representation' }),
        body: JSON.stringify(newChannelData)
      });
      if (!response.ok) throw new Error('Канал не найден или ошибка сети');
      const data = await response.json();
      renderChannel(data[0]);
      channelInput.value = '';
      uiToast('Канал добавлен');
    } catch (error) {
      console.error('Ошибка добавления канала:', error);
      safeAlert('Не удалось добавить канал. Проверьте имя.');
    } finally {
      addChannelBtn.disabled = false;
    }
  }

  async function loadChannels() {
    console.log('[DEBUG] loadChannels: Функция вызвана.');
    if (!channelsListContainer) {
        console.error('[DEBUG] loadChannels: CRITICAL - элемент channelsListContainer не найден.');
        return;
    }
    channelsListContainer.innerHTML = '<p class="empty-list">Загрузка каналов...</p>';
    try {
      console.log('[DEBUG] loadChannels: Отправка запроса на получение каналов...');
      const response = await fetch(`${CFG.SUPABASE_URL}/rest/v1/channels?select=*`, {
        headers: createSupabaseHeaders()
      });
      console.log('[DEBUG] loadChannels: Получен ответ от сервера.', response.status);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      channelsListContainer.innerHTML = '';
      if (data && data.length > 0) {
          data.forEach(item => renderChannel(item));
      } else {
          channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
      }
      console.log('[DEBUG] loadChannels: Каналы успешно загружены и отображены.');
    } catch (error) {
      console.error('[DEBUG] loadChannels: Произошла ошибка.', error);
      channelsListContainer.innerHTML = '<p class="empty-list">Не удалось загрузить каналы.</p>';
    }
  }

  addChannelBtn?.addEventListener('click', addChannel);

  saveBtn?.addEventListener('click', () => {
    const activeTab = document.querySelector('.settings-tab-content.active');
    if (activeTab.id === 'tab-keywords') saveKeywords();
    else safeAlert('Изменения в каналах сохраняются автоматически!');
  });

  loadDefaultsBtn?.addEventListener('click', async () => {
    loadDefaultsBtn.disabled = true;
    try {
      const response = await fetch(`${CFG.SUPABASE_URL}/rest/v1/default_channels?select=channel_id`, {
        headers: createSupabaseHeaders()
      });
      if (!response.ok) throw new Error('Не удалось получить стандартные каналы');
      const defaultChannels = await response.json();
      if (defaultChannels.length === 0) { safeAlert('Список стандартных каналов пуст.'); return; }
      const channelsToUpsert = defaultChannels.map(ch => ({ channel_id: ch.channel_id, is_enabled: true }));
      await fetch(`${CFG.SUPABASE_URL}/rest/v1/channels`, {
        method: 'POST',
        headers: createSupabaseHeaders({ prefer: 'resolution=merge-duplicates' }),
        body: JSON.stringify(channelsToUpsert)
      });
      await loadChannels();
      uiToast('Стандартные каналы добавлены.');
    } catch (error) {
      console.error('Ошибка загрузки стандартных каналов:', error);
      safeAlert('Ошибка загрузки стандартных каналов');
    } finally {
      loadDefaultsBtn.disabled = false;
    }
  });

  deleteAllBtn?.addEventListener('click', async () => {
    const message = 'Удалить все каналы из базы? Это действие необратимо.';
    const isConfirmed = await showCustomConfirm(message);
    if (!isConfirmed) return;
    deleteAllBtn.disabled = true;
    try {
      await fetch(`${CFG.SUPABASE_URL}/rest/v1/channels?id=gt.0`, {
        method: 'DELETE',
        headers: createSupabaseHeaders()
      });
      channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
      uiToast('Все каналы удалены.');
    } catch (error) {
      console.error('Ошибка удаления каналов:', error);
      safeAlert(String(error));
    } finally {
      deleteAllBtn.disabled = false;
    }
  });

  console.log('[DEBUG] settings.js: Функции определены. Вызываю начальную загрузку...');
  loadKeywords();
  loadChannels();
  console.log('[DEBUG] settings.js: Начальная загрузка вызвана. Скрипт завершил выполнение.');
})();
