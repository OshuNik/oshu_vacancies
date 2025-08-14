/**
 * Расширение API клиента для безопасной обработки запросов
 * Предотвращает SQL инъекции и другие атаки на уровне API
 */
class SafeApiClient extends ApiService {
  /**
   * Создает заголовки для запросов с CSRF защитой
   * @param {Object} options - Опции заголовков
   * @returns {Object} Заголовки запроса
   */
  createHeaders(options = {}) {
    const headers = super.createHeaders(options);
    
    // Добавляем CSRF защиту
    headers['X-CSRF-Protection'] = '1';
    
    return headers;
  }
  
  /**
   * Безопасно формирует URL для категории вакансий
   * @param {string} key - Ключ категории
   * @param {number} limit - Лимит результатов
   * @param {number} offset - Смещение
   * @param {string} query - Поисковый запрос
   * @returns {string} URL для запроса
   */
  buildCategoryUrl(key, limit, offset, query) {
    // Валидация входных параметров
    const safeLimit = Math.min(Math.max(1, limit || 10), 100);
    const safeOffset = Math.max(0, offset || 0);
    const safeQuery = InputValidator.validateSearchQuery(query);
    
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('status', `eq.${this.CFG.STATUSES.NEW}`);
    params.set('order', 'timestamp.desc');
    params.set('limit', String(safeLimit));
    params.set('offset', String(safeOffset));
    
    // Установка категории
    if (key === 'main') {
      params.set('category', `eq.${this.CFG.CATEGORIES.MAIN}`);
    } else if (key === 'maybe') {
      params.set('category', `eq.${this.CFG.CATEGORIES.MAYBE}`);
    } else {
      params.set('category', `not.in.("${this.CFG.CATEGORIES.MAIN}","${this.CFG.CATEGORIES.MAYBE}")`);
    }
    
    // Добавление поискового запроса с экранированием
    if (safeQuery && Array.isArray(this.CFG.SEARCH_FIELDS) && this.CFG.SEARCH_FIELDS.length) {
      const escapedQuery = InputValidator.escapePgLike(safeQuery);
      const orExpr = '(' + this.CFG.SEARCH_FIELDS.map(field => `${field}.ilike.*${escapedQuery}*`).join(',') + ')';
      params.set('or', orExpr);
    }
    
    return `${this.baseUrl}/rest/v1/vacancies?${params.toString()}`;
  }
  
  /**
   * Безопасно формирует URL для подсчета вакансий
   * @param {string} key - Ключ категории
   * @param {string} query - Поисковый запрос
   * @returns {string} URL для запроса подсчета
   */
  buildCountUrl(key, query) {
    // Валидация входных параметров
    const safeQuery = InputValidator.validateSearchQuery(query);
    
    const params = new URLSearchParams();
    params.set('select', 'id');
    params.set('status', `eq.${this.CFG.STATUSES.NEW}`);
    params.set('limit', '1');
    
    // Установка категории
    if (key === 'main') {
      params.set('category', `eq.${this.CFG.CATEGORIES.MAIN}`);
    } else if (key === 'maybe') {
      params.set('category', `eq.${this.CFG.CATEGORIES.MAYBE}`);
    } else {
      params.set('category', `not.in.("${this.CFG.CATEGORIES.MAIN}","${this.CFG.CATEGORIES.MAYBE}")`);
    }
    
    // Добавление поискового запроса с экранированием
    if (safeQuery && Array.isArray(this.CFG.SEARCH_FIELDS) && this.CFG.SEARCH_FIELDS.length) {
      const escapedQuery = InputValidator.escapePgLike(safeQuery);
      const orExpr = '(' + this.CFG.SEARCH_FIELDS.map(field => `${field}.ilike.*${escapedQuery}*`).join(',') + ')';
      params.set('or', orExpr);
    }
    
    return `${this.baseUrl}/rest/v1/vacancies?${params.toString()}`;
  }
}
