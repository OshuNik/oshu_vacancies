// settings.js — страница настроек
(function() {
  'use strict';

  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  if (tg && tg.expand) tg.expand();

  const CFG = window.APP_CONFIG;
  const UTIL = window.utils;

  try {
    const { config, utils } = UTIL.validateConfiguration(CFG, UTIL);
  } catch (error) {
    return;
  }

  const { uiToast, safeAlert, showCustomConfirm, createSupabaseHeaders, escapeHtml } = UTIL;

  // Константы для валидации и конфигурации
  const CHANNEL_VALIDATION = {
    MIN_LENGTH: 5,
    MAX_LENGTH: 32,
    PATTERN: /^[a-zA-Z0-9_]+$/
  };

  const API_ENDPOINTS = {
    SETTINGS: `${CFG.SUPABASE_URL}/rest/v1/settings`,
    CHANNELS: `${CFG.SUPABASE_URL}/rest/v1/channels`,
    DEFAULT_CHANNELS: `${CFG.SUPABASE_URL}/rest/v1/default_channels`
  };

  const MESSAGES = {
    ERRORS: {
      CHANNEL_EXISTS: 'Такой канал уже существует в списке!',
      INVALID_FORMAT: `Неверный формат username. Используйте только буквы, цифры и подчеркивания (${CHANNEL_VALIDATION.MIN_LENGTH}-${CHANNEL_VALIDATION.MAX_LENGTH} символов).`,
      ADD_FAILED: 'Не удалось добавить канал',
      LOAD_FAILED: 'Не удалось загрузить каналы',
      DELETE_FAILED: 'Не удалось удалить канал',
      UPDATE_FAILED: 'Не удалось обновить статус'
    },
    SUCCESS: {
      CHANNEL_ADDED: 'Канал добавлен успешно!',
      CHANNEL_DELETED: 'Канал удалён',
      CHANNEL_TOGGLED: 'Канал включён',
      CHANNEL_DISABLED: 'Канал выключен',
      KEYWORDS_SAVED: 'Ключевые слова сохранены',
      DEFAULTS_LOADED: 'Стандартные каналы добавлены.',
      ALL_DELETED: 'Все каналы удалены.'
    }
  };

  const settingsTabButtons = document.querySelectorAll('.settings-tab-button');
  const settingsTabContents = document.querySelectorAll('.settings-tab-content');
  const keywordsInput = document.getElementById('keywords-input');
  const excludeKeywordsInput = document.getElementById('exclude-keywords-input');
  const saveKeywordsBtn = document.getElementById('save-keywords-btn');
  const saveExcludeKeywordsBtn = document.getElementById('save-exclude-keywords-btn');
  const addChannelBtn = document.getElementById('add-channel-btn');
  const channelInput = document.getElementById('channel-id-input');
  const channelsListContainer = document.getElementById('channels-list');
  const exportDataBtn = document.getElementById('export-data-btn');
  const importDataBtn = document.getElementById('import-data-btn');
  const clearDataBtn = document.getElementById('clear-data-btn');
  const notificationsEnabled = document.getElementById('notifications-enabled');
  const notificationInterval = document.getElementById('notification-interval');
  const saveNotificationSettingsBtn = document.getElementById('save-notification-settings-btn');

  /**
   * Переключает табы настроек
   */
  function switchTab(tabName) {
    // Убираем активный класс со всех табов и контента
    settingsTabButtons.forEach(btn => btn.classList.remove('active'));
    settingsTabContents.forEach(content => content.classList.remove('active'));
    
    // Активируем нужный таб и контент
    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}-tab`);
    
    if (activeTab) activeTab.classList.add('active');
    if (activeContent) activeContent.classList.add('active');
  }

  /**
   * Валидирует и форматирует ID канала
   * @param {string} input - Входная строка (username, t.me ссылка или @username)
   * @returns {string|null} Отформатированный channelId или null при ошибке
   */
  function validateAndFormatChannelId(input) {
    if (!input) return null;
    
    let channelId = input.trim();
            utils.safeLog.log('🔍 Валидация канала:', channelId);
    
    // Преобразование t.me ссылок
    if (channelId.includes('t.me/')) {
      channelId = '@' + channelId.split('t.me/')[1].split('/')[0];
              utils.safeLog.log('🔗 Преобразован из t.me:', channelId);
    }
    
    // Добавление @ если отсутствует
    if (!channelId.startsWith('@')) channelId = '@' + channelId;
    
            utils.safeLog.log('✅ Финальный channelId:', channelId);
    
    // Валидация username
    const username = channelId.substring(1);
    if (!CHANNEL_VALIDATION.PATTERN.test(username) || 
        username.length < CHANNEL_VALIDATION.MIN_LENGTH || 
        username.length > CHANNEL_VALIDATION.MAX_LENGTH) {
      safeAlert(MESSAGES.ERRORS.INVALID_FORMAT);
      return null;
    }
    
    return channelId;
  }

  /**
   * Проверяет существование канала в базе данных
   * @param {string} channelId - ID канала для проверки
   * @returns {Promise<boolean>} true если канал существует, false если нет
   */
  async function isChannelExists(channelId) {
            utils.safeLog.log('🔍 Проверяем существование канала...');
    try {
      const response = await fetch(`${API_ENDPOINTS.CHANNELS}?channel_id=eq.${encodeURIComponent(channelId)}&select=id`, {
        headers: createSupabaseHeaders()
      });
      
      if (response.ok) {
        const existingChannels = await response.json();
        utils.safeLog.log('📊 Найдено существующих каналов:', existingChannels.length);
        return existingChannels.length > 0;
      } else {
        console.warn('⚠️ Ошибка проверки дубликатов:', response.status, response.statusText);
        return false;
      }
    } catch (error) {
      console.error('Ошибка проверки существования канала:', error);
      return false;
    }
  }

  /**
   * Создает новый канал в базе данных и отображает его в интерфейсе
   * @param {string} channelId - ID канала для создания
   * @returns {Promise<Object>} Созданный объект канала
   */
  async function createChannel(channelId) {
    const newChannelData = { 
      channel_id: channelId, 
      channel_title: channelId, 
      is_enabled: true 
    };
    
            utils.safeLog.log('📤 Отправляем данные в API:', newChannelData);
        utils.safeLog.log('🌐 URL:', API_ENDPOINTS.CHANNELS);
    
    const response = await fetch(API_ENDPOINTS.CHANNELS, {
      method: 'POST',
      headers: createSupabaseHeaders({ prefer: 'return=representation' }),
      body: JSON.stringify(newChannelData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка API: ${response.status} ${response.statusText}. ${errorText}`);
    }
    
    const data = await response.json();
    if (data && data.length > 0) {
      renderChannel(data[0]);
      channelInput.value = '';
      uiToast(MESSAGES.SUCCESS.CHANNEL_ADDED);
      return data[0];
    } else {
      throw new Error('API не вернул данные о добавленном канале');
    }
  }

  settingsTabButtons.forEach(button => {
    button.addEventListener('click', () => {
      settingsTabButtons.forEach(btn => btn.classList.remove('active'));
      settingsTabContents.forEach(content => content.classList.remove('active'));
      button.classList.add('active');
      const targetContent = document.getElementById(button.dataset.target);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  async function loadKeywords() {
    if (!keywordsDisplay) {
        console.error('loadKeywords: элемент keywordsDisplay не найден');
        return;
    }
    saveBtn.disabled = true;
    keywordsDisplay.textContent = 'Загрузка...';
    try {
      const response = await fetch(`${API_ENDPOINTS.SETTINGS}?select=keywords`, {
        headers: createSupabaseHeaders()
      });
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      const keywords = data.length > 0 ? data[0].keywords : '';
      keywordsInput.value = keywords;
      keywordsDisplay.textContent = keywords || '-- не заданы --';
    } catch (error) {
      console.error('loadKeywords: произошла ошибка', error);
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
      await fetch(API_ENDPOINTS.SETTINGS, {
        method: 'POST',
        headers: createSupabaseHeaders({ prefer: 'resolution=merge-duplicates' }),
        body: JSON.stringify({ update_key: 1, keywords: kws })
      });
      keywordsDisplay.textContent = kws || '-- не заданы --';
      uiToast(MESSAGES.SUCCESS.KEYWORDS_SAVED);
    } catch (error) {
      console.error('saveKeywords: произошла ошибка', error);
      safeAlert('Не удалось сохранить настройки. Проверьте подключение к интернету.');
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
    // Санитизируем текст для безопасности
    titleSpan.textContent = escapeHtml(channel.channel_title || cleanId);
    
    const idLink = document.createElement('a');
    idLink.className = 'channel-item-id';
    idLink.textContent = `@${cleanId}`;
    idLink.href = `https://t.me/${cleanId}`;
    idLink.target = '_blank';
    idLink.rel = 'noopener noreferrer';
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
            utils.setSafeHTML(deleteButton, `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`);
    // Создаем обработчики как отдельные функции для возможности cleanup
          const deleteHandler = async () => {
        const dbId = channelItem.dataset.dbId;
        if (!dbId) return;
        const ok = await showCustomConfirm('Удалить этот канал?');
        if (!ok) return;
        channelItem.style.opacity = '0.5';
        try {
          const response = await fetch(`${API_ENDPOINTS.CHANNELS}?id=eq.${dbId}`, {
            method: 'DELETE',
            headers: createSupabaseHeaders()
          });
          if (!response.ok) throw new Error('Ошибка ответа сети');
          channelItem.remove();
          uiToast(MESSAGES.SUCCESS.CHANNEL_DELETED);
        } catch (error) {
          console.error('Ошибка удаления канала:', error);
          safeAlert(MESSAGES.ERRORS.DELETE_FAILED);
          channelItem.style.opacity = '1';
        }
      };
    
          const toggleHandler = async (event) => {
        const dbId = channelItem.dataset.dbId;
        const is_enabled = event.target.checked;
        if (!dbId) return;
        try {
          const response = await fetch(`${API_ENDPOINTS.CHANNELS}?id=eq.${dbId}`, {
            method: 'PATCH',
            headers: createSupabaseHeaders(),
            body: JSON.stringify({ is_enabled: is_enabled })
          });
          if (!response.ok) throw new Error('Ошибка ответа сети');
          uiToast(is_enabled ? MESSAGES.SUCCESS.CHANNEL_TOGGLED : MESSAGES.SUCCESS.CHANNEL_DISABLED);
        } catch (error) {
          console.error('Ошибка обновления статуса канала:', error);
          safeAlert(MESSAGES.ERRORS.UPDATE_FAILED);
          event.target.checked = !is_enabled;
        }
      };
    
    deleteButton.addEventListener('click', deleteHandler);
    toggleInput.addEventListener('change', toggleHandler);
    
    // Сохраняем cleanup функцию на элементе
    channelItem.cleanup = () => {
      deleteButton.removeEventListener('click', deleteHandler);
      toggleInput.removeEventListener('change', toggleHandler);
    };
    infoDiv.append(titleSpan, idLink);
    toggleLabel.append(toggleInput, toggleSlider);
    toggleContainer.append(toggleLabel);
    channelItem.append(infoDiv, toggleContainer, deleteButton);
    const emptyListMessage = channelsListContainer.querySelector('.empty-list');
    if (emptyListMessage) emptyListMessage.remove();
    channelsListContainer.appendChild(channelItem);
  }
  
  async function addChannel() {
    const channelId = validateAndFormatChannelId(channelInput.value);
    if (!channelId) return;
    
    addChannelBtn.disabled = true;
    
    try {
      // Проверяем существование канала
      if (await isChannelExists(channelId)) {
        safeAlert(MESSAGES.ERRORS.CHANNEL_EXISTS);
        return;
      }
      
      // Создаем новый канал
      await createChannel(channelId);
      
    } catch (error) {
      console.error('Ошибка добавления канала:', error);
      safeAlert(`${MESSAGES.ERRORS.ADD_FAILED}: ${error.message}`);
    } finally {
      addChannelBtn.disabled = false;
    }
  }

  async function loadChannels() {
    if (!channelsListContainer) {
        console.error('loadChannels: элемент channelsListContainer не найден');
        return;
    }
            utils.setSafeHTML(channelsListContainer, '<p class="empty-list">Загрузка каналов...</p>');
    try {
      const response = await fetch(`${API_ENDPOINTS.CHANNELS}?select=*`, {
        headers: createSupabaseHeaders()
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
              utils.clearElement(channelsListContainer);
      if (data && data.length > 0) {
          data.forEach(item => renderChannel(item));
      } else {
          utils.setSafeHTML(channelsListContainer, '<p class="empty-list">-- Список каналов пуст --</p>');
      }
    } catch (error) {
      console.error('loadChannels: произошла ошибка', error);
              utils.setSafeHTML(channelsListContainer, '<p class="empty-list">Не удалось загрузить каналы.</p>');
    }
  }

  // Обработчики событий для табов
  settingsTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      if (tabName) {
        switchTab(tabName);
      }
    });
  });

  // Обработчики для кнопок
  addChannelBtn?.addEventListener('click', addChannel);
  saveKeywordsBtn?.addEventListener('click', saveKeywords);
  saveExcludeKeywordsBtn?.addEventListener('click', saveExcludeKeywords);
  saveNotificationSettingsBtn?.addEventListener('click', saveNotificationSettings);
  exportDataBtn?.addEventListener('click', exportData);
  importDataBtn?.addEventListener('click', importData);
  clearDataBtn?.addEventListener('click', clearAllData);



  // Функции для работы с ключевыми словами
  async function saveKeywords() {
    if (!keywordsInput) return;
    const keywords = keywordsInput.value.trim();
    try {
      localStorage.setItem('search-keywords', keywords);
      uiToast('Ключевые слова сохранены');
    } catch (error) {
      safeAlert('Не удалось сохранить ключевые слова');
    }
  }

  async function saveExcludeKeywords() {
    if (!excludeKeywordsInput) return;
    const excludeKeywords = excludeKeywordsInput.value.trim();
    try {
      localStorage.setItem('exclude-keywords', excludeKeywords);
      uiToast('Слова для исключения сохранены');
    } catch (error) {
      safeAlert('Не удалось сохранить слова для исключения');
    }
  }

  async function saveNotificationSettings() {
    if (!notificationsEnabled || !notificationInterval) return;
    try {
      localStorage.setItem('notifications-enabled', notificationsEnabled.checked);
      localStorage.setItem('notification-interval', notificationInterval.value);
      uiToast('Настройки уведомлений сохранены');
    } catch (error) {
      safeAlert('Не удалось сохранить настройки уведомлений');
    }
  }

  async function exportData() {
    try {
      const data = {
        keywords: localStorage.getItem('search-keywords') || '',
        excludeKeywords: localStorage.getItem('exclude-keywords') || '',
        notificationsEnabled: localStorage.getItem('notifications-enabled') || 'false',
        notificationInterval: localStorage.getItem('notification-interval') || '10'
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'oshu-work-settings.json';
      a.click();
      URL.revokeObjectURL(url);
      
      uiToast('Данные экспортированы');
    } catch (error) {
      safeAlert('Не удалось экспортировать данные');
    }
  }

  async function importData() {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (data.keywords !== undefined) localStorage.setItem('search-keywords', data.keywords);
        if (data.excludeKeywords !== undefined) localStorage.setItem('exclude-keywords', data.excludeKeywords);
        if (data.notificationsEnabled !== undefined) localStorage.setItem('notifications-enabled', data.notificationsEnabled);
        if (data.notificationInterval !== undefined) localStorage.setItem('notification-interval', data.notificationInterval);
        
        // Обновляем UI
        loadKeywords();
        loadNotificationSettings();
        
        uiToast('Данные импортированы');
      };
      input.click();
    } catch (error) {
      safeAlert('Не удалось импортировать данные');
    }
  }

  async function clearAllData() {
    const message = 'Очистить все данные? Это действие необратимо.';
    const isConfirmed = await showCustomConfirm(message);
    if (!isConfirmed) return;
    
    try {
      localStorage.clear();
      uiToast('Все данные очищены');
      
      // Обновляем UI
      loadKeywords();
      loadNotificationSettings();
    } catch (error) {
      safeAlert('Не удалось очистить данные');
    }
  }

  // Функция загрузки ключевых слов
  function loadKeywords() {
    if (keywordsInput) {
      keywordsInput.value = localStorage.getItem('search-keywords') || '';
    }
    if (excludeKeywordsInput) {
      excludeKeywordsInput.value = localStorage.getItem('exclude-keywords') || '';
    }
  }

  // Функция загрузки настроек уведомлений
  function loadNotificationSettings() {
    if (notificationsEnabled) {
      notificationsEnabled.checked = localStorage.getItem('notifications-enabled') === 'true';
    }
    if (notificationInterval) {
      notificationInterval.value = localStorage.getItem('notification-interval') || '10';
    }
  }

  // Инициализация приложения
  loadKeywords();
  loadChannels();
  loadNotificationSettings();
})();
