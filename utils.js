// utils.js — общие утилиты

(function () {
  'use strict';

  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  const CFG = window.APP_CONFIG || {};

  function uiToast(message = '', options = {}) {
    const { onUndo, onTimeout, timeout = 3000 } = options;
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        console.error('Toast container not found');
        return;
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    const textEl = document.createElement('span');
    textEl.textContent = message;
    toast.appendChild(textEl);
    let actionTimeout;
    const removeToast = () => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 300);
    };
    if (typeof onUndo === 'function') {
      const undoBtn = document.createElement('button');
      undoBtn.className = 'toast-undo-btn';
      undoBtn.textContent = 'Отменить';
      undoBtn.onclick = (e) => {
        e.stopPropagation();
        clearTimeout(actionTimeout);
        onUndo();
        removeToast();
      };
      toast.appendChild(undoBtn);
    }
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
    actionTimeout = setTimeout(() => {
        removeToast();
        if (onTimeout) {
            onTimeout();
        }
    }, timeout);
  }

  const safeAlert = (msg) => {
    if (tg && typeof tg.showAlert === 'function') tg.showAlert(String(msg));
    else uiToast(String(msg));
  };
  
  function showCustomConfirm(message) {
    return new Promise(resolve => {
        const confirmOverlay = document.querySelector('#custom-confirm-overlay');
        if (!confirmOverlay) return resolve(window.confirm(message));
        const confirmText = confirmOverlay.querySelector('#custom-confirm-text');
        const confirmOkBtn = confirmOverlay.querySelector('#confirm-btn-ok');
        const confirmCancelBtn = confirmOverlay.querySelector('#confirm-btn-cancel');
        if (!confirmText || !confirmOkBtn || !confirmCancelBtn) {
            return resolve(window.confirm(message));
        }
        confirmText.textContent = message;
        confirmOverlay.classList.remove('hidden');
        const close = (result) => {
            confirmOverlay.classList.add('hidden');
            confirmOkBtn.onclick = null;
            confirmCancelBtn.onclick = null;
            resolve(result);
        };
        confirmOkBtn.onclick = () => close(true);
        confirmCancelBtn.onclick = () => close(false);
    });
  }
  
  function createSupabaseHeaders(options = {}) {
    const { prefer } = options;
    const headers = {
      'apikey': CFG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${CFG.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    };
    if (prefer) {
      headers['Prefer'] = prefer;
    }
    return headers;
  }

  const escapeHtml = (s = '') =>
    String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const stripTags = (html = '') => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const debounce = (fn, delay = 250) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  };

  const highlightText = (text = '', q = '') => {
    if (!q) return escapeHtml(text);
    const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapeHtml(text).replace(rx, '<mark class="highlight">$1</mark>');
  };

  function sanitizeLink(raw = '') {
    let s = String(raw).trim();
    if (!s) return '';
    if (/^(t\.me|telegram\.me)\//i.test(s)) {
        s = 'https://' + s;
    }
    if (!/^[a-z]+:\/\//i.test(s) && s.includes('.')) {
        s = 'https://' + s;
    }
    try {
        const url = new URL(s);
        if (['https:', 'http:', 'tg:'].includes(url.protocol)) {
            return url.href;
        }
    } catch (e) {}
    return '';
  }
  
  function openLink(url) {
    let safeUrl = sanitizeLink(url);
    if (!safeUrl) return;

    if (safeUrl.startsWith('tg://') && !safeUrl.includes('?')) {
        const username = safeUrl.replace('tg://', '').replace('/', '');
        safeUrl = `https://t.me/${username}`;
    }

    if (safeUrl.startsWith('https://t.me')) {
        if (tg && typeof tg.openTelegramLink === 'function') {
            tg.openTelegramLink(safeUrl);
        } else {
            window.open(safeUrl, '_blank', 'noopener');
        }
    } else {
        if (tg && typeof tg.openLink === 'function') {
            tg.openLink(safeUrl);
        } else {
            window.open(safeUrl, '_blank', 'noopener');
        }
    }
  }

  function formatSmartTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now - d;
    const sec = Math.floor(diffMs / 1000);
    const min = Math.floor(sec / 60);
    const pad = n => n.toString().padStart(2, '0');
    const months = ['янв','фев','мар','апр','мая','июн','юл','авг','сен','окт','ноя','дек'];
    const isSameDay = now.toDateString() === d.toDateString();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    const isYesterday = yest.toDateString() === d.toDateString();
    if (sec < 30) return 'только что';
    if (min < 60 && min >= 1) return `${min} мин назад`;
    if (isSameDay) return `сегодня, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (isYesterday) return `вчера, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${d.getDate().toString().padStart(2,'0')} ${months[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const formatTimestamp = (s) => formatSmartTime(s);

  function parseTotal(resp){
    const cr = resp.headers.get('content-range');
    if (!cr || !cr.includes('/')) return 0;
    const total = cr.split('/').pop();
    return Number(total) || 0;
  }
  
  const containsImageMarker = (text = '') =>
    /(\[\s*изображени[ея]\s*\]|\b(изображени[ея]|фото|картинк\w|скрин)\b)/i.test(text);
  const cleanImageMarkers = (text = '') => String(text).replace(/\[\s*изображени[ея]\s*\]/gi, '').replace(/\s{2,}/g, ' ').trim();
  function pickImageUrl(v, detailsText = '') {
    const msg = sanitizeLink(v.message_link || '');
    const img = sanitizeLink(v.image_link || '');
    const allow = (v.has_image === true) || containsImageMarker(detailsText) || containsImageMarker(v.reason || '');
    if (!allow) return '';
    if (msg) return msg;
    if (img) return img;
    return '';
  }

  async function fetchWithRetry(url, options = {}, retryCfg = { retries: 0, backoffMs: 300 }) {
    let attempt = 0;
    let lastErr = null;
    while (attempt <= (retryCfg.retries || 0)) {
      try {
        return await fetch(url, options);
      } catch (e) {
        lastErr = e;
        if (attempt === retryCfg.retries) break;
        await new Promise(r => setTimeout(r, (retryCfg.backoffMs || 300) * Math.pow(2, attempt)));
        attempt++;
      }
    }
    throw lastErr || new Error('Network error');
  }

  function renderEmptyState(container, message) {
    const catGifUrl = 'https://raw.githubusercontent.com/OshuNik/oshu_vacancies/5325db67878d324810971a262d689ea2ec7ac00f/img/Uploading%20a%20vacancy.%20The%20doggie.gif';
    container.innerHTML = `<div class="empty-state"><img src="${catGifUrl}" class="empty-state-gif" alt=""><p class="empty-state-text">${escapeHtml(message)}</p></div>`;
  }

  function renderError(container, message, onRetry) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-state-text">Ошибка: ${escapeHtml(message || 'Ошибка сети')}</p>
        <div class="load-more-wrap"><button class="load-more-btn">Повторить</button></div>
      </div>`;
    const btn = container.querySelector('.load-more-btn');
    btn?.addEventListener('click', () => onRetry?.());
  }

  function ensureLoadMore(container, onClick) {
    let wrap = container.querySelector('.load-more-wrap');
    let btn = container.querySelector('.load-more-btn');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'load-more-wrap';
      btn = document.createElement('button');
      btn.className = 'load-more-btn';
      btn.type = 'button';
      btn.textContent = 'Загрузить ещё';
      wrap.appendChild(btn);
      container.appendChild(wrap);
    }
    btn.onclick = onClick;
    return { wrap, btn };
  }
  
  function updateLoadMore(container, visible) {
    let wrap = container.querySelector('.load-more-wrap');
    if (!wrap) return;
    wrap.style.display = visible ? '' : 'none';
  }

  function createVacancyCard(v, options = {}) {
    const { pageType = 'main', searchQuery = '' } = options;
    const template = document.getElementById('vacancy-card-template');
    if (!template) {
        console.error('Template #vacancy-card-template not found!');
        const el = document.createElement('div');
        el.textContent = 'Ошибка: шаблон не найден.';
        return el;
    }
    
    const card = template.content.cloneNode(true).querySelector('.vacancy-card');
    if (!card) {
        console.error('Could not find .vacancy-card in template');
        const el = document.createElement('div');
        el.textContent = 'Ошибка: структура шаблона неверна.';
        return el;
    }

    card.id = `card-${v.id}`;
    if (v.category === CFG.CATEGORIES.MAIN) card.classList.add('category-main');
    else if (v.category === CFG.CATEGORIES.MAYBE) card.classList.add('category-maybe');
    else card.classList.add('category-other');
    const elements = {
      applyBtn: card.querySelector('[data-element="apply-btn"]'),
      favoriteBtn: card.querySelector('[data-element="favorite-btn"]'),
      deleteBtn: card.querySelector('[data-element="delete-btn"]'),
      category: card.querySelector('[data-element="category"]'),
      summary: card.querySelector('[data-element="summary"]'),
      infoWindow: card.querySelector('[data-element="info-window"]'),
      details: card.querySelector('[data-element="details"]'),
      attachments: card.querySelector('[data-element="attachments"]'),
      fullText: card.querySelector('[data-element="full-text"]'),
      skills: card.querySelector('[data-element="skills"]'),
      channel: card.querySelector('[data-element="channel"]'),
      timestamp: card.querySelector('[data-element="timestamp"]'),
      metaSeparator: card.querySelector('.meta-separator'),
    };
    const applyUrl = sanitizeLink(v.apply_url || '');
    if (applyUrl) {
      elements.applyBtn.dataset.action = 'apply';
      elements.applyBtn.dataset.url = applyUrl;
    } else {
      elements.applyBtn.remove();
    }
    if (pageType === 'main') {
      elements.favoriteBtn.dataset.action = 'favorite';
      elements.favoriteBtn.dataset.id = v.id;
    } else {
      elements.favoriteBtn.remove();
    }
    elements.deleteBtn.dataset.action = 'delete';
    elements.deleteBtn.dataset.id = v.id;
    elements.category.textContent = v.category || 'NO_CATEGORY';
    const summaryText = v.reason || 'Описание не было сгенерировано.';
    elements.summary.dataset.originalSummary = summaryText;
    elements.summary.innerHTML = searchQuery ? highlightText(summaryText, searchQuery) : escapeHtml(summaryText);
    const infoRows = [];
    const cleanVal = val => String(val ?? '').replace(/[«»"“”'‘’`']/g,'').trim();
    const isMeaningful = val => !!cleanVal(val) && !['не указано', 'n/a'].includes(cleanVal(val).toLowerCase());
    const fmt = [v.employment_type, v.work_format].map(cleanVal).filter(isMeaningful).join(' / ');
    if (fmt) infoRows.push({ label: 'ФОРМАТ', value: fmt, type: 'default' });
    if (isMeaningful(v.salary_display_text)) infoRows.push({ label: 'ОПЛАТА', value: cleanVal(v.salary_display_text), type: 'salary' });
    if (isMeaningful(v.industry)) infoRows.push({ label: 'СФЕРА', value: cleanVal(v.industry), type: 'industry' });
    if (infoRows.length > 0) {
      infoRows.forEach(r => {
        const row = document.createElement('div');
        row.className = `info-row info-row--${r.type}`;
        row.innerHTML = `<div class="info-label">${escapeHtml(r.label)} >></div><div class="info-value">${escapeHtml(r.value)}</div>`;
        elements.infoWindow.appendChild(row);
      });
    } else {
      elements.infoWindow.remove();
    }
    const originalDetailsHtml = String(v.text_highlighted || '').replace(/\[\s*Изображение\s*\]\s*/gi, '');
    const bestImageUrl = pickImageUrl(v, originalDetailsHtml);
    if (bestImageUrl) {
        const imgBtn = document.createElement('a');
        imgBtn.className = 'image-link-button';
        imgBtn.href = bestImageUrl;
        imgBtn.target = '_blank';
        imgBtn.rel = 'noopener noreferrer';
        imgBtn.textContent = 'Изображение';
        elements.attachments.appendChild(imgBtn);
    }
    if (originalDetailsHtml) {
        elements.fullText.innerHTML = originalDetailsHtml;
    }
    if (!bestImageUrl && !originalDetailsHtml) {
        elements.details.remove();
    }
    if (Array.isArray(v.skills) && v.skills.length > 0) {
        v.skills.slice(0, 3).forEach(s => {
            const tag = document.createElement('span');
            tag.className = 'footer-skill-tag';
            tag.textContent = s;
            elements.skills.appendChild(tag);
        });
    } else {
      elements.skills.remove();
    }
    if(v.channel) {
      elements.channel.textContent = v.channel;
    } else {
      elements.channel.remove();
      elements.metaSeparator.remove();
    }
    elements.timestamp.textContent = formatTimestamp(v.timestamp);
    const searchChunks = [
      v.category, v.reason, v.industry, v.company_name,
      Array.isArray(v.skills) ? v.skills.join(' ') : '',
      stripTags(originalDetailsHtml)
    ].filter(Boolean);
    card.dataset.searchText = searchChunks.join(' ').toLowerCase();
    return card;
  }
  
  function setupPullToRefresh(options = {}) {
    const { onRefresh, refreshEventName } = options;
    if (typeof onRefresh !== 'function' || !refreshEventName) return;

    const wrapper = document.querySelector('.main-wrapper');
    const ptrBar = wrapper?.querySelector('.ptr-bar');
    const ptrText = ptrBar?.querySelector('.ptr-text');

    if (!wrapper || !ptrBar || !ptrText) return;

    const { THRESHOLD, BAR_HEIGHT } = CFG.PTR_CONFIG || { THRESHOLD: 70, BAR_HEIGHT: 50 };
    let startY = 0, pulling = false, locked = false;

    const resetState = () => {
        locked = false;
        wrapper.style.transition = 'transform 0.3s';
        wrapper.style.transform = 'translateY(0px)';
        ptrText.innerHTML = 'Потяните для обновления';
    };

    const onLoaded = () => {
        document.removeEventListener(refreshEventName, onLoaded);
        resetState();
    };

    document.body.addEventListener('touchstart', (e) => {
        if (locked || window.scrollY > 0) {
            pulling = false;
            return;
        }
        wrapper.style.transition = 'none';
        startY = e.touches[0].clientY;
        pulling = true;
    }, { passive: true });

    document.body.addEventListener('touchmove', (e) => {
        if (!pulling || locked) return;
        const dist = e.touches[0].clientY - startY;

        if (dist > 0 && window.scrollY === 0) {
            e.preventDefault();
            const pullDist = Math.pow(dist, 0.85);
            wrapper.style.transform = `translateY(${pullDist}px)`;
            
            if (pullDist > THRESHOLD) {
                ptrText.textContent = 'Отпустите для обновления';
            } else {
                ptrText.textContent = 'Потяните для обновления';
            }
        }
    }, { passive: false });

    document.body.addEventListener('touchend', (e) => {
        if (!pulling || locked) {
            pulling = false;
            return;
        };
        
        const finalDist = e.changedTouches[0].clientY - startY;
        
        if (Math.pow(finalDist, 0.85) > THRESHOLD) {
            locked = true;
            wrapper.style.transition = 'transform 0.3s';
            wrapper.style.transform = `translateY(${BAR_HEIGHT}px)`;
            ptrText.innerHTML = '<div class="retro-spinner-inline"></div> Обновление...';
            
            if (tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred) {
                tg.HapticFeedback.impactOccurred('medium');
            }
            
            document.addEventListener(refreshEventName, onLoaded);
            onRefresh();
            
            setTimeout(() => { if (locked) onLoaded(); }, 8000);
        } else {
            resetState();
        }
        pulling = false;
    }, { passive: true });
  }

  window.utils = {
    tg, 
    escapeHtml, 
    stripTags, 
    debounce, 
    highlightText, 
    safeAlert, 
    uiToast,
    formatTimestamp, 
    sanitizeLink, 
    openLink,
    containsImageMarker, 
    cleanImageMarkers, 
    pickImageUrl,
    fetchWithRetry, 
    renderEmptyState, 
    renderError,
    ensureLoadMore, 
    updateLoadMore,
    createVacancyCard,
    setupPullToRefresh,
    showCustomConfirm,
    createSupabaseHeaders,
    parseTotal
  };
})();
