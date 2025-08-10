// settings.js — Настройки (ключевые слова + каналы) с единым конфигом из window.APP_CONFIG

(function () {
  'use strict';

  // Telegram WebApp
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  if (tg && tg.expand) tg.expand();

  // --- CONFIG ---
  const CFG = window.APP_CONFIG || null;
  if (!CFG) {
    alert('APP_CONFIG не найден. Подключите config.js ПЕРЕД settings.js');
    return;
  }
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = CFG;

  // --- UI helpers (тосты/алерты) ---
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
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 200);
    }, 2200);
  }
  function uiAlert(msg) {
    if (tg && typeof tg.showAlert === 'function') tg.showAlert(msg);
    else uiToast(msg);
  }

  // --- Tabs ---
  const settingsTabButtons = document.querySelectorAll('.settings-tab-button');
  const settingsTabContents = document.querySelectorAll('.settings-tab-content');
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
  const keywordsInput = document.getElementById('keywords-input');
  const keywordsDisplay = document.getElementById('current-keywords-display');
  const saveBtn = document.getElementById('save-button');

  async function loadKeywords() {
    if (!keywordsDisplay) return;
    saveBtn && (saveBtn.disabled = true);
    keywordsDisplay.textContent = 'Загрузка.';
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/settings?select=keywords`, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const keywords = data.length > 0 ? (data[0].keywords || '') : '';
      if (keywordsInput) keywordsInput.value = keywords;
      keywordsDisplay.textContent = keywords || '-- не заданы --';
    } catch (e) {
      console.error('Ошибка загрузки ключевых слов:', e);
      keywordsDisplay.textContent = 'Ошибка загрузки';
    } finally {
      saveBtn && (saveBtn.disabled = false);
    }
  }

  async function saveKeywords() {
    if (!keywordsInput) return;
    const kws = keywordsInput.value.trim();
    saveBtn && (saveBtn.disabled = true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({ update_key: 1, keywords: kws })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      if (keywordsDisplay) keywordsDisplay.textContent = kws || '-- не заданы --';
      uiAlert('Ключевые слова сохранены');
    } catch (e) {
      console.error('Ошибка при сохранении ключевых слов:', e);
      uiAlert('Ошибка сохранения');
    } finally {
      saveBtn && (saveBtn.disabled = false);
    }
  }

  saveBtn?.addEventListener('click', () => {
    const activeTab = document.querySelector('.settings-tab-content.active');
    if (activeTab && activeTab.id === 'tab-keywords') saveKeywords();
    else uiAlert('Изменения в каналах сохраняются автоматически!');
  });

  // --- CHANNELS ---
  const loadDefaultsBtn = document.getElementById('load-defaults-btn');
  const addChannelBtn = document.getElementById('add-channel-btn');
  const channelInput = document.getElementById('channel-input');
  const channelsListContainer = document.getElementById('channels-list');
  const deleteAllBtn = document.getElementById('delete-all-btn');

  // кастомный confirm из вёрстки
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

  function normalizeChannelId(raw) {
    if (!raw) return '';
    let s = String(raw).trim();
    if (s.includes('t.me/')) s = s.split('t.me/')[1].split('/')[0];
    if (!s.startsWith('@')) s = '@' + s.replace(/^@+/, '');
    return s;
  }

  function renderChannel(channel) {
    const channelItem = document.createElement('div');
    channelItem.className = 'channel-item';
    channelItem.dataset.dbId = channel.id;

    const infoDiv = document.createElement('div');
    infoDiv.className = 'channel-item-info';

    const cleanId = (channel.channel_id || '').replace('@', '');
    const titleSpan = document.createElement('span');
    titleSpan.className = 'channel-item-title';
    titleSpan.textContent = channel.channel_title || cleanId;

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
    toggleInput.checked = !!channel.is_enabled;
    const toggleSlider = document.createElement('span');
    toggleSlider.className = 'toggle-slider';

    const deleteButton = document.createElement('button');
    deleteButton.className = 'channel-item-delete';
    deleteButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
           viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6"  y2="18"></line>
        <line x1="6"  y1="6" x2="18" y2="18"></line>
      </svg>`;

    infoDiv.appendChild(titleSpan);
    infoDiv.appendChild(idLink);
    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleSlider);
    toggleContainer.appendChild(toggleLabel);

    channelItem.appendChild(infoDiv);
    channelItem.appendChild(toggleContainer);
    channelItem.appendChild(deleteButton);
    channelsListContainer.appendChild(channelItem);

    // handlers
    toggleInput.addEventListener('change', async () => {
      try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/channels?id=eq.${channel.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ is_enabled: !!toggleInput.checked })
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        uiToast(toggleInput.checked ? 'Канал включён' : 'Канал выключен');
      } catch (e) {
        console.error('Ошибка переключения канала:', e);
        uiAlert('Не удалось сохранить переключатель');
        toggleInput.checked = !toggleInput.checked; // откат
      }
    });

    deleteButton.addEventListener('click', () => {
      showCustomConfirm('Удалить канал из базы?', async (yes) => {
        if (!yes) return;
        try {
          const resp = await fetch(`${SUPABASE_URL}/rest/v1/channels?id=eq.${channel.id}`, {
            method: 'DELETE',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          channelItem.remove();
          uiToast('Канал удалён');
        } catch (e) {
          console.error('Ошибка удаления канала:', e);
          uiAlert('Не удалось удалить канал');
        }
      });
    });
  }

  async function addChannel() {
    if (!channelInput) return;
    const raw = channelInput.value.trim();
    if (!raw) { uiAlert('Введите @username или ссылку на канал'); return; }
    const norm = normalizeChannelId(raw);

    addChannelBtn && (addChannelBtn.disabled = true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ channel_id: norm, is_enabled: true })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      renderChannel(data[0]);
      channelInput.value = '';
      uiToast('Канал добавлен');
    } catch (e) {
      console.error('Ошибка добавления канала:', e);
      uiAlert('Не удалось добавить канал. Проверьте имя.');
    } finally {
      addChannelBtn && (addChannelBtn.disabled = false);
    }
  }

  async function loadChannels() {
    if (!channelsListContainer) return;
    channelsListContainer.innerHTML = '<p>Загрузка каналов...</p>';
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/channels?select=*`, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      channelsListContainer.innerHTML = '';
      if (Array.isArray(data) && data.length > 0) data.forEach(renderChannel);
      else channelsListContainer.innerHTML = '<p class="empty-list">-- Список каналов пуст --</p>';
    } catch (e) {
      console.error('Ошибка загрузки каналов:', e);
      channelsListContainer.innerHTML = '<p class="empty-list">Не удалось загрузить каналы.</p>';
    }
  }

  loadDefaultsBtn?.addEventListener('click', async () => {
    loadDefaultsBtn.disabled = true;
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/default_channels?select=channel_id`, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
      });
      if (!resp.ok) throw new Error('Не удалось получить стандартные каналы');
      const rows = await resp.json();
      if (!rows.length) { uiAlert('Список стандартных каналов пуст.'); return; }
      const upsertRows = rows.map(ch => ({ channel_id: ch.channel_id, is_enabled: true }));
      const upsert = await fetch(`${SUPABASE_URL}/rest/v1/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(upsertRows)
      });
      if (!upsert.ok) throw new Error(`HTTP ${upsert.status}`);
      await loadChannels();
      uiToast('Стандартные каналы добавлены');
    } catch (e) {
      console.error('Ошибка загрузки стандартных каналов:', e);
      uiAlert('Ошибка загрузки стандартных каналов');
    } finally {
      loadDefaultsBtn.disabled = false;
    }
  });

  deleteAllBtn?.addEventListener('click', () => {
    const msg = 'Удалить все каналы из базы? Это действие необратимо.';
    showCustomConfirm(msg, async (yes) => {
      if (!yes) return;
      try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/channels`, {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        await loadChannels();
        uiToast('Все каналы удалены');
      } catch (e) {
        console.error('Ошибка удаления всех каналов:', e);
        uiAlert('Не удалось удалить все каналы');
      }
    });
  });

  // init
  loadKeywords();
  loadChannels();
})();
