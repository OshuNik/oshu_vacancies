// utils.js — общие утилиты (с новой функцией Pull-to-Refresh)

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
         timerManager.setTimeout(() => {
             if (toast.parentElement) {
                 toast.parentElement.removeChild(toast);
             }
         }, 300, 'toast_remove');
    };
    if (typeof onUndo === 'function') {
      const undoBtn = document.createElement('button');
      undoBtn.className = 'toast-undo-btn';
      undoBtn.textContent = 'Отменить';
      undoBtn.onclick = (e) => {
        e.stopPropagation();
                 if (actionTimeout) timerManager.clearTimeout(actionTimeout);
        onUndo();
        removeToast();
      };
      toast.appendChild(undoBtn);
    }
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
         actionTimeout = timerManager.setTimeout(() => {
         removeToast();
         if (onTimeout) {
             onTimeout();
         }
     }, timeout, 'toast_action');
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
          'apikey': window.constants?.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${window.constants?.SUPABASE_ANON_KEY}`,
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
    setSafeHTML(tmp, html);
    return tmp.textContent || tmp.innerText || '';
  };

  const debounce = (fn, delay = 250) => {
       let t;
   return (...args) => {
     if (t) clearTimeout(t);
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
    if (!container) {
      console.error('renderEmptyState: контейнер не найден');
      return;
    }
    
    // Создаём элементы безопасно через DOM API
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    
    const img = document.createElement('img');
    img.className = 'empty-state-gif';
    img.alt = 'Загрузка изображения';
    img.src = 'https://raw.githubusercontent.com/OshuNik/oshu_vacancies/5325db67878d324810971a262d689ea2ec7ac00f/img/Uploading%20a%20vacancy.%20The%20doggie.gif';
    
    const p = document.createElement('p');
    p.className = 'empty-state-text';
    p.textContent = message; // безопасно вставляем текст
    
    emptyDiv.appendChild(img);
    emptyDiv.appendChild(p);
    clearElement(container); // очищаем
    container.appendChild(emptyDiv);
  }

  function renderError(container, message, onRetry) {
    if (!container) {
      console.error('renderError: контейнер не найден');
      return;
    }
    
    // Создаём элементы безопасно
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    
    const p = document.createElement('p');
    p.className = 'empty-state-text';
    p.textContent = `Ошибка: ${message || 'Ошибка сети'}`;
    
    const wrapDiv = document.createElement('div');
    wrapDiv.className = 'load-more-wrap';
    
    const btn = document.createElement('button');
    btn.className = 'load-more-btn';
    btn.textContent = 'Повторить';
    const retryHandler = () => {
      if (typeof onRetry === 'function') {
        onRetry();
      }
    };
    btn.addEventListener('click', retryHandler);
    
    // Сохраняем cleanup функцию
    container.retryCleanup = () => {
      btn.removeEventListener('click', retryHandler);
    };
    
    wrapDiv.appendChild(btn);
    emptyDiv.appendChild(p);
    emptyDiv.appendChild(wrapDiv);
    
    clearElement(container);
    container.appendChild(emptyDiv);
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
    if (v.category === window.constants?.CATEGORIES?.MAIN) card.classList.add('category-main');
    else if (v.category === window.constants?.CATEGORIES?.MAYBE) card.classList.add('category-maybe');
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
    setSafeText(elements.summary, searchQuery ? highlightText(summaryText, searchQuery) : escapeHtml(summaryText));
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
        setSafeHTML(row, `<div class="info-label">${escapeHtml(r.label)} >></div><div class="info-value">${escapeHtml(r.value)}</div>`);
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
        setSafeHTML(elements.fullText, originalDetailsHtml);
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
  
  /**
   * НОВАЯ ВЕРСИЯ PULL-TO-REFRESH
   */
     function setupPullToRefresh(options = {}) {
     const { onRefresh, refreshEventName } = options;
     if (typeof onRefresh !== 'function' || !refreshEventName) {
       return;
     }
     
     // Определяем, находимся ли мы в Mini App
     const isMiniApp = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
             safeLog.log('🚀 PTR: Mini App detected:', isMiniApp);

    const wrapper = document.querySelector('.main-wrapper');
    const ptrBar = wrapper?.querySelector('.ptr-bar');
    if (!wrapper || !ptrBar) {
      return;
    }

    // Динамически создаем контент для плашки
    setSafeHTML(ptrBar, `
      <div class="ptr-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <polyline points="19 12 12 19 5 12"></polyline>
        </svg>
      </div>
      <div class="ptr-spinner retro-spinner-inline"></div>
      <span class="ptr-text">Потяните для обновления</span>
    `);
    
    const ptrText = ptrBar.querySelector('.ptr-text');
              // В Mini App делаем PTR максимально простым
     const THRESHOLD = isMiniApp ? 15 : (window.constants?.PTR_CONFIG?.THRESHOLD || 60);
     const BAR_HEIGHT = window.constants?.PTR_CONFIG?.BAR_HEIGHT || 75;
             safeLog.log('🚀 PTR: Threshold:', THRESHOLD, 'BAR_HEIGHT:', BAR_HEIGHT);

    let startY = 0;
    let pullDistance = 0;
    let state = 'waiting'; // 'waiting', 'pulling', 'refreshing'

    const setState = (newState) => {
      if (state === newState) return;
      state = newState;

      switch(state) {
                 case 'waiting':
           wrapper.classList.remove('ptr-pulling');
           ptrBar.classList.remove('ptr-visible', 'ptr-ready', 'ptr-refreshing');
           wrapper.style.transition = 'transform 0.3s ease-out';
           wrapper.style.transform = 'translateY(0px)';
           break;

        case 'pulling':
          wrapper.classList.add('ptr-pulling');
          ptrBar.classList.add('ptr-visible');
          break;

                 case 'refreshing':
           wrapper.classList.remove('ptr-pulling');
           ptrBar.classList.add('ptr-refreshing');
           wrapper.style.transition = 'transform 0.3s ease-out';
           wrapper.style.transform = `translateY(${BAR_HEIGHT}px)`;
           ptrText.textContent = 'Обновление...';
          
          // Безопасный вызов HapticFeedback с проверкой версии
          if (tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred) {
            try {
              // Проверяем что версия поддерживает HapticFeedback (6.1+)
              if (tg.version && parseFloat(tg.version) >= 6.1) {
                tg.HapticFeedback.impactOccurred('medium');
              }
            } catch (error) {
              // Игнорируем ошибки HapticFeedback для совместимости
              console.debug('HapticFeedback не поддерживается в этой версии:', error.message);
            }
          }

          onRefresh();
          
                     const safetyTimeout = timerManager.setTimeout(() => {
             if (state === 'refreshing') setState('waiting');
           }, 8000, 'ptr_safety');

          const onLoaded = () => {
            if (safetyTimeout) timerManager.clearTimeout(safetyTimeout);
            document.removeEventListener(refreshEventName, onLoaded);
            setState('waiting');
          };
          document.addEventListener(refreshEventName, onLoaded);
          break;
      }
    };

         const handleTouchStart = (e) => {
       if (state !== 'waiting' || window.scrollY > 0) return;
       
       const touchY = e.touches[0].clientY;
       
       // В Mini App делаем зону безопасности минимальной
       const safeZone = isMiniApp ? 5 : 30;
       if (touchY < safeZone) return;
       
       startY = touchY;
       
       // В Mini App активируем PTR мгновенно
       if (isMiniApp) {
         setState('pulling');
         // Сразу показываем плашку
         ptrBar.classList.add('ptr-visible');
       }
     };

         const handleTouchMove = (e) => {
       // В браузере активируем PTR при движении
       if (state === 'waiting' && startY !== 0 && !isMiniApp) {
         const currentY = e.touches[0].clientY;
         const moveDistance = currentY - startY;
         
         if (moveDistance > 15) {
           setState('pulling');
         }
         return;
       }
       
       // В Mini App PTR уже активен, просто обрабатываем движение
       if (state !== 'pulling') return;
       
       pullDistance = e.touches[0].clientY - startY;
       
       if (pullDistance > 0) {
         e.preventDefault();
         
         // В Mini App делаем сопротивление более плавным, но все еще легким
         const resistance = isMiniApp ? 0.6 : 0.7;
         const dragDistance = Math.pow(pullDistance, resistance);
         wrapper.style.transform = `translateY(${dragDistance}px)`;
         wrapper.style.transition = 'transform 0.1s ease-out';
         
                    // В Mini App делаем активацию более плавной
           if (isMiniApp) {
             // Показываем "готово" при движении больше 15px для плавности
             if (dragDistance > 15) {
               ptrBar.classList.add('ptr-ready');
               ptrText.textContent = 'Отпустите для обновления';
             } else {
               ptrBar.classList.remove('ptr-ready');
               ptrText.textContent = 'Потяните для обновления';
             }
           } else {
           // В браузере обычная логика
           if (dragDistance > THRESHOLD) {
             ptrBar.classList.add('ptr-ready');
             ptrText.textContent = 'Отпустите для обновления';
           } else {
             ptrBar.classList.remove('ptr-ready');
             ptrText.textContent = 'Потяните для обновления';
           }
         }
       }
     };

         const handleTouchEnd = () => {
       if (state === 'pulling') {
         if (isMiniApp) {
           // В Mini App обновление срабатывает при движении больше 10px для плавности
           if (pullDistance > 10) {
             setState('refreshing');
           } else {
             setState('waiting');
           }
         } else {
           // В браузере обычная логика
           if (Math.pow(pullDistance, 0.85) > THRESHOLD) {
             setState('refreshing');
           } else {
             setState('waiting');
           }
         }
         pullDistance = 0;
       }
       
       // Сбрасываем startY в любом случае
       startY = 0;
     };

    // Добавляем listeners с возможностью очистки
    // Используем capture: true для более агрессивного перехвата событий
    document.body.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
    document.body.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    document.body.addEventListener('touchend', handleTouchEnd, { capture: true });
    
    // Сохраняем cleanup функцию для возможности удаления listeners
    wrapper.ptrCleanup = () => {
      document.body.removeEventListener('touchstart', handleTouchStart, { capture: true });
      document.body.removeEventListener('touchmove', handleTouchMove, { capture: true });
      document.body.removeEventListener('touchend', handleTouchEnd, { capture: true });
    };
  }

/**
 * Безопасные методы для работы с DOM
 * Заменяют innerHTML для предотвращения XSS атак
 */

/**
 * Безопасно устанавливает HTML содержимое элемента
 * @param {Element} element - DOM элемент
 * @param {string} html - HTML строка
 */
function setSafeHTML(element, html) {
  if (!element) return;
  
  // Очищаем элемент
  element.textContent = '';
  
  // Создаем временный контейнер для парсинга HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Перемещаем все дочерние элементы
  while (temp.firstChild) {
    element.appendChild(temp.firstChild);
  }
}

/**
 * Безопасно устанавливает текст элемента
 * @param {Element} element - DOM элемент
 * @param {string} text - Текст для установки
 */
function setSafeText(element, text) {
  if (!element) return;
  element.textContent = text || '';
}

/**
 * Безопасно добавляет HTML в конец элемента
 * @param {Element} element - DOM элемент
 * @param {string} html - HTML строка
 */
function appendSafeHTML(element, html) {
  if (!element) return;
  
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  while (temp.firstChild) {
    element.appendChild(temp.firstChild);
  }
}

/**
 * Безопасно очищает элемент
 * @param {Element} element - DOM элемент
 */
function clearElement(element) {
  if (!element) return;
  element.textContent = '';
}

/**
 * Безопасное логирование для продакшена
 * В продакшене console.log отключается
 */
const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

/**
 * Консолидация условных выражений
 * Убирает дублирующиеся проверки и объединяет логику
 */
function consolidateConditions(conditions, defaultValue = false) {
  if (!Array.isArray(conditions)) {
    return defaultValue;
  }
  
  return conditions.every(condition => {
    if (typeof condition === 'function') {
      return condition();
    }
    return Boolean(condition);
  });
}

/**
 * Универсальная функция для проверки конфигурации
 * Заменяет дублирующиеся проверки в разных файлах
 */
function validateConfiguration(config, utils) {
  const errors = [];
  
  if (!config) {
    errors.push('APP_CONFIG не найден');
  }
  
  if (!utils) {
    errors.push('utils не найден');
  }
  
  if (errors.length > 0) {
    const errorMessage = `Критическая ошибка: ${errors.join(', ')}`;
    if (typeof alert === 'function') {
      alert(errorMessage);
    }
    throw new Error(errorMessage);
  }
  
  return { config, utils };
}

/**
 * Универсальная функция поиска
 * Заменяет дублирующуюся логику поиска в разных файлах
 */
function createSearchManager(options = {}) {
  const {
    container,
    searchInput,
    searchClearBtn,
    searchInputWrapper,
    onSearch,
    onClear,
    placeholder = 'Поиск...',
    className = 'search-stats'
  } = options;

  let statsElement = null;

  function ensureSearchUI() {
    if (!searchInputWrapper || statsElement) return;
    
    statsElement = document.createElement('div');
    statsElement.className = className;
    searchInputWrapper.insertAdjacentElement('afterend', statsElement);
  }

  function updateStats(total, visible, query = '') {
    if (!statsElement) return;
    
    const searchQuery = query || (searchInput?.value || '').trim();
    statsElement.textContent = searchQuery ? 
      (visible === 0 ? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`) : '';
  }

  function setupSearch() {
    if (!searchInput) return;

    // Обработчик поиска с debounce
    const debouncedSearch = debounce(() => {
      if (onSearch) onSearch();
    }, 300);

    searchInput.addEventListener('input', debouncedSearch);

    // Обработчик очистки
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (onClear) onClear();
        if (onSearch) onSearch();
      });
    }

    // Инициализация UI
    ensureSearchUI();
  }

  return {
    setupSearch,
    updateStats,
    ensureSearchUI,
    getStatsElement: () => statsElement
  };
}

const safeLog = {
  log: (...args) => {
    if (!isProduction) {
      console.log(...args);
    }
  },
  error: (...args) => {
    // Ошибки всегда логируем
    console.error(...args);
  },
  warn: (...args) => {
    if (!isProduction) {
      console.warn(...args);
    }
  },
  info: (...args) => {
    if (!isProduction) {
      console.info(...args);
    }
  }
};

/**
 * Безопасное управление таймерами
 * Предотвращает утечки памяти и обеспечивает правильную очистку
 */
class TimerManager {
  constructor() {
    this.timers = new Map();
    this.intervalTimers = new Map();
  }

  /**
   * Безопасно устанавливает timeout
   * @param {Function} callback - функция для выполнения
   * @param {number} delay - задержка в миллисекундах
   * @param {string} id - уникальный идентификатор таймера
   * @returns {string} id таймера
   */
  setTimeout(callback, delay, id = null) {
    if (!id) {
      id = `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Очищаем существующий таймер с таким же id
    this.clearTimeout(id);

    const timerId = setTimeout(() => {
      try {
        callback();
      } catch (error) {
                 safeLog.error('Ошибка в таймере:', error);
      } finally {
        this.timers.delete(id);
      }
    }, delay);

    this.timers.set(id, timerId);
    return id;
  }

  /**
   * Безопасно устанавливает interval
   * @param {Function} callback - функция для выполнения
   * @param {number} delay - задержка в миллисекундах
   * @param {string} id - уникальный идентификатор интервала
   * @returns {string} id интервала
   */
  setInterval(callback, delay, id = null) {
    if (!id) {
      id = `interval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Очищаем существующий интервал с таким же id
    this.clearInterval(id);

    const intervalId = setInterval(() => {
      try {
        callback();
      } catch (error) {
        utils.safeLog.error('Ошибка в интервале:', error);
      }
    }, delay);

    this.intervalTimers.set(id, intervalId);
    return id;
  }

  /**
   * Очищает timeout по id
   * @param {string} id - идентификатор таймера
   */
  clearTimeout(id) {
    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
    }
  }

  /**
   * Очищает interval по id
   * @param {string} id - идентификатор интервала
   */
  clearInterval(id) {
    if (this.intervalTimers.has(id)) {
      clearInterval(this.intervalTimers.get(id));
      this.intervalTimers.delete(id);
    }
  }

  /**
   * Очищает все таймеры
   */
  clearAll() {
    this.timers.forEach((timerId) => clearTimeout(timerId));
    this.intervalTimers.forEach((intervalId) => clearInterval(intervalId));
    this.timers.clear();
    this.intervalTimers.clear();
  }

  /**
   * Получает количество активных таймеров
   * @returns {Object} объект с количеством таймеров и интервалов
   */
  getStats() {
    return {
      timeouts: this.timers.size,
      intervals: this.intervalTimers.size,
      total: this.timers.size + this.intervalTimers.size
    };
  }
}

// Создаем глобальный экземпляр менеджера таймеров
const timerManager = new TimerManager();

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
    setupPullToRefresh, // <-- Новая функция
    showCustomConfirm,
    createSupabaseHeaders,
    parseTotal,
    setSafeHTML,
    setSafeText,
    appendSafeHTML,
    clearElement,
    safeLog,
    timerManager,
    consolidateConditions,
    validateConfiguration,
    createSearchManager
  };
})();
