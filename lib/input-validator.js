/**
 * Модуль для безопасной валидации пользовательского ввода
 * Предотвращает внедрение опасных данных в запросы и интерфейс
 */
const InputValidator = {
  /**
   * Валидация поискового запроса
   * @param {string} query - Поисковый запрос
   * @param {Object} options - Опции валидации
   * @returns {string} Валидированный запрос
   */
  validateSearchQuery(query = '', options = {}) {
    const defaults = {
      maxLength: 100,
      allowedPattern: /[^\wа-яА-ЯёЁ\s.,\-_]/gi
    };
    
    const settings = {...defaults, ...options};
    
    // Обрезаем строку по максимальной длине
    let result = (query || '').trim();
    if (result.length > settings.maxLength) {
      result = result.substring(0, settings.maxLength);
    }
    
    // Удаляем запрещенные символы
    return result.replace(settings.allowedPattern, '');
  },
  
  /**
   * Экранирование для PostgreSQL LIKE запросов
   * @param {string} str - Строка для экранирования
   * @returns {string} Экранированная строка
   */
  escapePgLike(str = '') {
    return (str || '').replace(/[\\%_]/g, '\\$&');
  },
  
  /**
   * Валидация текста на максимальную длину
   * @param {string} text - Исходный текст
   * @param {number} maxLength - Максимальная длина
   * @returns {string} Валидированный текст
   */
  validateText(text = '', maxLength = 1000) {
    return (text || '').substring(0, maxLength);
  },
  
  /**
   * Проверяет, содержит ли строка потенциально опасный контент
   * @param {string} input - Проверяемая строка
   * @returns {boolean} true если содержит опасный контент, иначе false
   */
  containsHazardousContent(input = '') {
    const dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,  // script tags
      /javascript\s*:/gi,  // javascript: protocol
      /on\w+\s*=/gi,  // event handlers (onclick, onload, etc)
      /data\s*:/gi,   // data: URLs
      /vbscript\s*:/gi // vbscript: protocol
    ];
    
    return dangerousPatterns.some(pattern => pattern.test(input));
  }
};

// Экспортируем модуль
window.InputValidator = InputValidator;
