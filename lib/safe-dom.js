/**
 * Безопасные операции с DOM
 * Модуль для предотвращения XSS уязвимостей при работе с DOM
 */
const SafeDOM = {
  /**
   * Безопасно устанавливает текстовое содержимое элемента
   * @param {HTMLElement} element - Целевой элемент
   * @param {string} text - Текстовое содержимое
   * @returns {HTMLElement} Элемент для цепочки вызовов
   */
  setText(element, text) {
    if (element) {
      element.textContent = text || '';
    }
    return element;
  },
  
  /**
   * Безопасно устанавливает HTML содержимое с санитизацией
   * @param {HTMLElement} element - Целевой элемент
   * @param {string} html - HTML содержимое
   * @param {Object} options - Опции санитизации для DOMPurify
   * @returns {HTMLElement} Элемент для цепочки вызовов
   */
  setHTML(element, html, options = {}) {
    if (!element) return element;
    
    // Проверка наличия DOMPurify
    if (typeof DOMPurify !== 'undefined') {
      // Настройки по умолчанию для безопасности
      const defaultOptions = {
        ALLOWED_TAGS: ['p', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'br', 'span', 'mark'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
        ALLOW_DATA_ATTR: false,
        ADD_ATTR: ['target="_blank"', 'rel="noopener noreferrer"'],
        USE_PROFILES: { html: true }
      };
      
      // Объединяем дефолтные опции с переданными
      const mergedOptions = {...defaultOptions, ...options};
      
      // Санитизируем HTML и устанавливаем содержимое
      element.innerHTML = DOMPurify.sanitize(html || '', mergedOptions);
    } else {
      // Fallback, если DOMPurify не найден
      console.warn('DOMPurify не найден. Используется fallback режим с textContent');
      element.textContent = stripTags(html || '');
    }
    
    return element;
  },
  
  /**
   * Безопасное создание элемента с текстом
   * @param {string} tag - Тег элемента
   * @param {string} text - Текстовое содержимое
   * @param {string|Array} className - CSS классы
   * @returns {HTMLElement} Созданный элемент
   */
  createElement(tag, text, className) {
    const el = document.createElement(tag);
    
    if (text) {
      el.textContent = text;
    }
    
    if (className) {
      if (Array.isArray(className)) {
        el.className = className.join(' ');
      } else {
        el.className = className;
      }
    }
    
    return el;
  },
  
  /**
   * Безопасно выделяет совпадения в тексте
   * @param {string} text - Исходный текст
   * @param {string} query - Поисковый запрос
   * @returns {string} Безопасный HTML с выделенными совпадениями
   */
  highlightText(text = '', query = '') {
    if (!text || !query) {
      return escapeHtml(text || '');
    }
    
    try {
      // Экранируем текст и запрос
      const escapedText = escapeHtml(text);
      // Экранируем и защищаем спецсимволы в запросе
      const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Создаем регулярное выражение и заменяем совпадения
      const rx = new RegExp(`(${escapedQuery})`, 'gi');
      return escapedText.replace(rx, '<mark class="highlight">$1</mark>');
    } catch (e) {
      console.warn('Ошибка в highlightText:', e);
      return escapeHtml(text);
    }
  },
  
  /**
   * Безопасная валидация и нормализация URL
   * @param {string} raw - Исходный URL
   * @returns {string} Безопасный URL или пустая строка
   */
  sanitizeUrl(raw = '') {
    let url = String(raw || '').trim();
    if (!url) return '';
    
    // Нормализация t.me ссылок
    if (/^(t\.me|telegram\.me)\//i.test(url)) {
      url = 'https://' + url;
    }
    
    // Добавляем протокол для относительных URL
    if (!/^[a-z]+:\/\//i.test(url) && url.includes('.')) {
      url = 'https://' + url;
    }
    
    try {
      const parsedUrl = new URL(url);
      
      // Проверка безопасности протокола
      if (!['https:', 'http:', 'tg:'].includes(parsedUrl.protocol)) {
        console.warn('Небезопасный протокол:', parsedUrl.protocol);
        return '';
      }
      
      // Проверка на javascript: URL
      if (parsedUrl.href.toLowerCase().includes('javascript:')) {
        console.warn('Обнаружен javascript: URL');
        return '';
      }
      
      // Проверка на другие опасные протоколы
      if (parsedUrl.href.toLowerCase().match(/^(vbscript|data|file):/)) {
        console.warn('Обнаружен опасный протокол:', parsedUrl.protocol);
        return '';
      }
      
      return parsedUrl.href;
    } catch (e) {
      console.warn('Невалидный URL:', url);
      return '';
    }
  }
};

// Экспортируем модуль
window.SafeDOM = SafeDOM;
