// api-service.js — сервис для работы с API

(function () {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const CONST = window.APP_CONSTANTS || {};
  const UTIL = window.utils || {};

  class ApiService {
    constructor() {
      this.baseUrl = CFG.SUPABASE_URL;
      this.anonKey = CFG.SUPABASE_ANON_KEY;
      this.retryOptions = CFG.RETRY_OPTIONS || {};
    }

    // Создать заголовки для запросов
    createHeaders(options = {}) {
      const headers = {
        'apikey': this.anonKey,
        'Authorization': `Bearer ${this.anonKey}`,
        'Content-Type': 'application/json',
      };
      
      if (options.prefer) {
        headers['Prefer'] = options.prefer;
      }
      
      return headers;
    }

    // Построить URL для категории вакансий
    buildCategoryUrl(key, limit, offset, query) {
      const params = new URLSearchParams();
      params.set('select', '*');
      params.set('status', `eq.${CFG.STATUSES.NEW}`);
      params.set('order', 'timestamp.desc');
      params.set('limit', String(limit));
      params.set('offset', String(offset));

      // Установка категории
      if (key === 'main') {
        params.set('category', `eq.${CFG.CATEGORIES.MAIN}`);
      } else if (key === 'maybe') {
        params.set('category', `eq.${CFG.CATEGORIES.MAYBE}`);
      } else {
        params.set('category', `not.in.("${CFG.CATEGORIES.MAIN}","${CFG.CATEGORIES.MAYBE}")`);
      }

      // Добавление поискового запроса
      const trimmedQuery = (query || '').trim();
      if (trimmedQuery && Array.isArray(CFG.SEARCH_FIELDS) && CFG.SEARCH_FIELDS.length) {
        const orExpr = '(' + CFG.SEARCH_FIELDS.map(field => `${field}.ilike.*${trimmedQuery}*`).join(',') + ')';
        params.set('or', orExpr);
      }

      return `${this.baseUrl}/rest/v1/vacancies?${params.toString()}`;
    }

    // Построить URL для подсчета вакансий
    buildCountUrl(key, query) {
      const params = new URLSearchParams();
      params.set('select', 'id');
      params.set('status', `eq.${CFG.STATUSES.NEW}`);
      params.set('limit', '1');
      
      // Установка категории
      if (key === 'main') {
        params.set('category', `eq.${CFG.CATEGORIES.MAIN}`);
      } else if (key === 'maybe') {
        params.set('category', `eq.${CFG.CATEGORIES.MAYBE}`);
      } else {
        params.set('category', `not.in.("${CFG.CATEGORIES.MAIN}","${CFG.CATEGORIES.MAYBE}")`);
      }

      // Добавление поискового запроса
      const trimmedQuery = (query || '').trim();
      if (trimmedQuery && Array.isArray(CFG.SEARCH_FIELDS) && CFG.SEARCH_FIELDS.length) {
        const orExpr = '(' + CFG.SEARCH_FIELDS.map(field => `${field}.ilike.*${trimmedQuery}*`).join(',') + ')';
        params.set('or', orExpr);
      }

      return `${this.baseUrl}/rest/v1/vacancies?${params.toString()}`;
    }

    // Загрузить вакансии для категории
    async fetchVacancies(key, limit, offset, query, signal) {
      const url = this.buildCategoryUrl(key, limit, offset, query);
      const headers = this.createHeaders();
      
      try {
        const response = await UTIL.fetchWithRetry(url, {
          headers,
          signal
        }, this.retryOptions);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return {
          success: true,
          data,
          total: UTIL.parseTotal(response)
        };
      } catch (error) {
        if (error.name === 'AbortError') {
          return { success: false, aborted: true };
        }
        
        console.error(`Ошибка загрузки вакансий для ${key}:`, error);
        return {
          success: false,
          error: error.message || 'Неизвестная ошибка'
        };
      }
    }

    // Загрузить счетчики для всех категорий
    async fetchCountsAll(query) {
      const categories = ['main', 'maybe', 'other'];
      const results = {};

      try {
        const promises = categories.map(async (key) => {
          const url = this.buildCountUrl(key, query);
          const headers = this.createHeaders({ prefer: 'count=exact' });
          
          // Увеличиваем таймаут для мобильных устройств
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), CONST.TIMEOUTS.MOBILE);
          
          try {
            const response = await UTIL.fetchWithRetry(url, {
              headers,
              signal: controller.signal
            }, this.retryOptions);
            
            if (!response.ok) {
              throw new Error('count failed');
            }
            
            return { key, count: UTIL.parseTotal(response) };
          } finally {
            clearTimeout(timeoutId);
          }
        });

        const countResults = await Promise.allSettled(promises);
        
        countResults.forEach((result, index) => {
          const key = categories[index];
          if (result.status === 'fulfilled') {
            results[key] = result.value.count;
          } else {
            console.warn(`Не удалось загрузить счетчик для ${key}:`, result.reason);
            results[key] = 0;
          }
        });

        return { success: true, counts: results };
      } catch (error) {
        console.error('Ошибка загрузки счетчиков:', error);
        return {
          success: false,
          error: error.message || 'Неизвестная ошибка',
          counts: { main: 0, maybe: 0, other: 0 }
        };
      }
    }

    // Обновить статус вакансии
    async updateVacancyStatus(vacancyId, newStatus, signal) {
      const url = `${this.baseUrl}/rest/v1/vacancies?id=eq.${vacancyId}`;
      const headers = this.createHeaders();
      
      try {
        const response = await fetch(url, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: newStatus }),
          signal
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return { success: true };
      } catch (error) {
        if (error.name === 'AbortError') {
          return { success: false, aborted: true };
        }
        
        console.error('Ошибка обновления статуса вакансии:', error);
        return {
          success: false,
          error: error.message || 'Неизвестная ошибка'
        };
      }
    }

    // Удалить вакансию
    async deleteVacancy(vacancyId, signal) {
      const url = `${this.baseUrl}/rest/v1/vacancies?id=eq.${vacancyId}`;
      const headers = this.createHeaders();
      
      try {
        const response = await fetch(url, {
          method: 'DELETE',
          headers,
          signal
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return { success: true };
      } catch (error) {
        if (error.name === 'AbortError') {
          return { success: false, aborted: true };
        }
        
        console.error('Ошибка удаления вакансии:', error);
        return {
          success: false,
          error: error.message || 'Неизвестная ошибка'
        };
      }
    }

    // Проверить доступность API
    async healthCheck() {
      try {
        const response = await fetch(`${this.baseUrl}/rest/v1/vacancies?select=id&limit=1`, {
          headers: this.createHeaders()
        });
        
        return {
          success: response.ok,
          status: response.status,
          available: response.ok
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          available: false
        };
      }
    }
  }

  // Создаем глобальный экземпляр API сервиса
  window.apiService = new ApiService();

})();
