// settings.js — страница настроек
(function() {
  'use strict';

  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  if (tg && tg.expand) tg.expand();

  const CFG = window.APP_CONFIG;
  const UTIL = window.utils;

  if (!CFG || !UTIL) {
    alert("Критическая ошибка: Не найден config.js или utils.js!");
    console.error('settings.js: CFG или UTIL не найдены');
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
  const keywordsDisplay = document.getElementById('current-keywords-display');
  const saveBtn = document.getElementById('save-button');
  const loadDefaultsBtn = document.getElementById('load-defaults-btn');
  const addChannelBtn = document.getElementById('add-channel-btn');
  const channelInput = document.getElementById('channel-input');
  const channelsListContainer = document.getElementById('channels-list');
  const deleteAllBtn = document.getElementById('delete-all-btn');

  /**
   * Валидирует и форматирует ID канала
   * @param {string} input - Входная строка (username, t.me ссылка или @username)
   * @returns {string|null} Отформатированный channelId или null при ошибке
   */
  function validateAndFormatChannelId(input) {
    if (!input) return null;
    
    let channelId = input.trim();
    console.log('🔍 Валидация канала:', channelId);
    
    // Преобразование t.me ссылок
    if (channelId.includes('t.me/')) {
      channelId = '@' + channelId.split('t.me/')[1].split('/')[0];
      console.log('🔗 Преобразован из t.me:', channelId);
    }
    
    // Добавление @ если отсутствует
    if (!channelId.startsWith('@')) channelId = '@' + channelId;
    
    console.log('✅ Финальный channelId:', channelId);
    
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
    console.log('🔍 Проверяем существование канала...');
    try {
      const response = await fetch(`${API_ENDPOINTS.CHANNELS}?channel_id=eq.${encodeURIComponent(channelId)}&select=id`, {
        headers: createSupabaseHeaders()
      });
      
      if (response.ok) {
        const existingChannels = await response.json();
        console.log('📊 Найдено существующих каналов:', existingChannels.length);
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
    
    console.log('📤 Отправляем данные в API:', newChannelData);
    console.log('🌐 URL:', API_ENDPOINTS.CHANNELS);
    
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
    
    // Показываем ретро-галочку
    const checkmark = createRetroCheckmark();
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '';
    saveBtn.appendChild(checkmark);
    
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
      // Восстанавливаем оригинальную кнопку
      saveBtn.innerHTML = originalText;
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
    deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
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
    
    // Показываем ретро-прогресс-бар
    const progressContainer = document.createElement('div');
    progressContainer.style.marginTop = '15px';
    const progress = createRetroProgress(channelId);
    progressContainer.appendChild(progress);
    
    // Вставляем прогресс-бар после формы добавления
    const addForm = document.querySelector('.add-channel-form');
    addForm.parentNode.insertBefore(progressContainer, addForm.nextSibling);
    
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
      // Убираем прогресс-бар
      progressContainer.remove();
    }
  }

  async function loadChannels() {
    if (!channelsListContainer) {
        console.error('loadChannels: элемент channelsListContainer не найден');
        return;
    }
    
    // Показываем ретро-спиннер
    const spinner = createRetroSpinner();
    channelsListContainer.innerHTML = '';
    channelsListContainer.appendChild(spinner);
    
    try {
      const response = await fetch(`${API_ENDPOINTS.CHANNELS}?select=*`, {
        headers: createSupabaseHeaders()
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      channelsListContainer.innerHTML = '';
      if (data && data.length > 0) {
          data.forEach(item => renderChannel(item));
      } else {
          channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
      }
    } catch (error) {
      console.error('loadChannels: произошла ошибка', error);
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
    
    // Показываем ретро-прогресс
    const progressContainer = document.createElement('div');
    progressContainer.style.marginTop = '15px';
    const progress = createRetroChannelsProgress(0, 0);
    progressContainer.appendChild(progress);
    
    // Вставляем прогресс после кнопки
    loadDefaultsBtn.parentNode.insertBefore(progressContainer, loadDefaultsBtn.nextSibling);
    
    try {
      const response = await fetch(`${API_ENDPOINTS.DEFAULT_CHANNELS}?select=channel_id`, {
        headers: createSupabaseHeaders()
      });
      if (!response.ok) throw new Error('Не удалось получить стандартные каналы');
      const defaultChannels = await response.json();
      if (defaultChannels.length === 0) { safeAlert('Список стандартных каналов пуст.'); return; }
      
      // Обновляем прогресс
      const progressFill = progress.querySelector('.progress-fill');
      const progressStats = progress.querySelector('.progress-stats');
      
      for (let i = 0; i < defaultChannels.length; i++) {
        const channel = defaultChannels[i];
        await fetch(API_ENDPOINTS.CHANNELS, {
          method: 'POST',
          headers: createSupabaseHeaders({ prefer: 'resolution=merge-duplicates' }),
          body: JSON.stringify({ channel_id: channel.channel_id, is_enabled: true })
        });
        
        // Обновляем прогресс
        const percentage = ((i + 1) / defaultChannels.length) * 100;
        progressFill.style.width = `${percentage}%`;
        progressStats.textContent = `Канал ${i + 1} из ${defaultChannels.length}`;
        
        // Небольшая задержка для визуального эффекта
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      await loadChannels();
      uiToast(MESSAGES.SUCCESS.DEFAULTS_LOADED);
    } catch (error) {
      console.error('Ошибка загрузки стандартных каналов:', error);
      safeAlert('Не удалось добавить стандартные каналы. Проверьте подключение к интернету.');
    } finally {
      loadDefaultsBtn.disabled = false;
      // Убираем прогресс
      progressContainer.remove();
    }
  });

  deleteAllBtn?.addEventListener('click', async () => {
    const message = 'Удалить все каналы из базы? Это действие необратимо.';
    const isConfirmed = await showCustomConfirm(message);
    if (!isConfirmed) return;
    deleteAllBtn.disabled = true;
    try {
      await fetch(`${API_ENDPOINTS.CHANNELS}?id=gt.0`, {
        method: 'DELETE',
        headers: createSupabaseHeaders()
      });
      channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
      uiToast(MESSAGES.SUCCESS.ALL_DELETED);
    } catch (error) {
      console.error('Ошибка удаления каналов:', error);
      safeAlert(String(error));
    } finally {
      deleteAllBtn.disabled = false;
    }
  });

  // Инициализация приложения
  loadKeywords();
  loadChannels();

  // === РЕТРО-ГЕЙМИНГ ПРОГРЕСС-ИНДИКАТОРЫ ===
  
  /**
   * Создает ретро-спиннер загрузки каналов
   * @returns {HTMLElement} Элемент спиннера
   */
  function createRetroSpinner() {
    const spinner = document.createElement('div');
    spinner.className = 'retro-spinner';
    
    const blocks = document.createElement('div');
    blocks.className = 'blocks';
    
    for (let i = 0; i < 6; i++) {
      const block = document.createElement('div');
      block.className = 'block';
      blocks.appendChild(block);
    }
    
    const text = document.createElement('span');
    text.textContent = 'Загружаем каналы...';
    
    spinner.appendChild(blocks);
    spinner.appendChild(text);
    
    return spinner;
  }

  /**
   * Создает ретро-прогресс-бар для добавления канала
   * @param {string} channelName - Имя канала
   * @returns {HTMLElement} Элемент прогресс-бара
   */
  function createRetroProgress(channelName) {
    const container = document.createElement('div');
    container.className = 'retro-progress';
    
    const text = document.createElement('div');
    text.textContent = `Добавляем ${channelName}...`;
    text.style.textAlign = 'center';
    text.style.marginBottom = '8px';
    text.style.fontFamily = 'var(--font-mono)';
    text.style.fontSize = '14px';
    
    const progressBar = document.createElement('div');
    progressBar.className = 'retro-progress-bar';
    progressBar.style.width = '0%';
    
    container.appendChild(text);
    container.appendChild(progressBar);
    
    // Анимация прогресса
    setTimeout(() => {
      progressBar.style.width = '100%';
    }, 100);
    
    return container;
  }

  /**
   * Создает ретро-счетчик для удаления каналов
   * @param {number} current - Текущее количество
   * @param {number} total - Общее количество
   * @returns {HTMLElement} Элемент счетчика
   */
  function createRetroCounter(current, total) {
    const counter = document.createElement('div');
    counter.className = 'retro-counter';
    
    const currentSpan = document.createElement('span');
    currentSpan.className = 'current';
    currentSpan.textContent = current;
    
    const separator = document.createElement('span');
    separator.textContent = ' / ';
    separator.style.color = 'var(--hint-color)';
    
    const totalSpan = document.createElement('span');
    totalSpan.className = 'total';
    totalSpan.textContent = total;
    
    counter.appendChild(currentSpan);
    counter.appendChild(separator);
    counter.appendChild(totalSpan);
    
    return counter;
  }

  /**
   * Создает ретро-галочку для сохранения
   * @returns {HTMLElement} Элемент галочки
   */
  function createRetroCheckmark() {
    const checkmark = document.createElement('div');
    checkmark.className = 'retro-checkmark';
    return checkmark;
  }

  /**
   * Создает ретро-прогресс для загрузки стандартных каналов
   * @param {number} current - Текущий канал
   * @param {number} total - Общее количество каналов
   * @returns {HTMLElement} Элемент прогресса
   */
  function createRetroChannelsProgress(current, total) {
    const container = document.createElement('div');
    container.className = 'retro-channels-progress';
    
    const progressText = document.createElement('div');
    progressText.className = 'progress-text';
    progressText.textContent = 'Загрузка стандартных каналов';
    
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    progressFill.style.width = `${(current / total) * 100}%`;
    
    const progressStats = document.createElement('div');
    progressStats.className = 'progress-stats';
    progressStats.textContent = `Канал ${current} из ${total}`;
    
    progressBar.appendChild(progressFill);
    container.appendChild(progressText);
    container.appendChild(progressBar);
    container.appendChild(progressStats);
    
    return container;
  }

  /**
   * Показывает прогресс-индикатор в указанном контейнере
   * @param {HTMLElement} container - Контейнер для показа
   * @param {HTMLElement} indicator - Индикатор для показа
   */
  function showProgress(container, indicator) {
    // Очищаем контейнер и показываем индикатор
    container.innerHTML = '';
    container.appendChild(indicator);
  }

  /**
   * Скрывает прогресс-индикатор и восстанавливает содержимое
   * @param {HTMLElement} container - Контейнер
   * @param {string} originalContent - Оригинальное содержимое
   */
  function hideProgress(container, originalContent) {
    container.innerHTML = originalContent;
  }
})();
