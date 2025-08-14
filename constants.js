// constants.js — константы приложения

(function () {
  'use strict';

  // Размеры страниц
  const PAGE_SIZES = {
    MAIN: 20,
    MOBILE: 15,
    DESKTOP: 25
  };

  // Таймауты (в миллисекундах)
  const TIMEOUTS = {
    MOBILE: 15000,      // 15 секунд для мобильных
    DESKTOP: 10000,     // 10 секунд для десктопа
    DEBOUNCE: 300,      // Задержка поиска
    TOAST: 3000,        // Время показа уведомлений
    LOADER: 500         // Анимация лоадера
  };

  // CSS классы
  const CSS_CLASSES = {
    HIDDEN: 'hidden',
    LOADING: 'loading',
    ACTIVE: 'active',
    BUSY: 'busy',
    VISIBLE: 'visible',
    PULLING: 'ptr-pulling',
    READY: 'ptr-ready',
    REFRESHING: 'ptr-refreshing'
  };

  // DOM селекторы
  const SELECTORS = {
    LOADER: '#loader',
    SEARCH_INPUT: '#search-input',
    SEARCH_CLEAR: '#search-clear-btn',
    SEARCH_CONTAINER: '#search-container',
    VACANCIES_CONTENT: '#vacancies-content',
    MAIN_HEADER: '#main-header',
    TAB_BUTTONS: '.tab-button',
    VACANCY_LISTS: '.vacancy-list',
    LOAD_MORE_WRAP: '.load-more-wrap'
  };

  // Сообщения пользователю
  const MESSAGES = {
    ERRORS: {
      CONFIG_LOAD: 'Критическая ошибка: не удалось загрузить config.js или utils.js',
      COUNT_FAILED: 'count failed',
      FETCH_FAILED: 'Ошибка загрузки данных',
      NETWORK_ERROR: 'Ошибка сети'
    },
    SEARCH: {
      NOTHING_FOUND: 'Ничего не найдено',
      FOUND_COUNT: 'Найдено: {visible} из {total}'
    },
    LOADING: {
      VACANCIES: 'Загрузка вакансий...',
      MORE: 'Загрузить еще'
    }
  };

  // Настройки Pull-to-Refresh
  const PTR_CONFIG = {
    THRESHOLD: 60,           // Порог активации в пикселях
    RESISTANCE: 2.5,         // Сопротивление при тяге
    MAX_DISTANCE: 80,        // Максимальное расстояние тяги
    ANIMATION_DURATION: 300  // Длительность анимации в мс
  };

  // Настройки производительности
  const PERFORMANCE = {
    DEBOUNCE_DELAY: 300,
    THROTTLE_DELAY: 100,
    BATCH_SIZE: 5,
    MAX_RETRIES: 3
  };

  // Экспорт констант в глобальную область
  window.APP_CONSTANTS = {
    PAGE_SIZES,
    TIMEOUTS,
    CSS_CLASSES,
    SELECTORS,
    MESSAGES,
    PTR_CONFIG,
    PERFORMANCE
  };

})();

// Экспортируем константы из APP_CONFIG
window.constants = {
  STATUSES: window.APP_CONFIG?.STATUSES || {
    NEW: 'new',
    FAVORITE: 'favorite',
    DELETED: 'deleted',
  },
  CATEGORIES: window.APP_CONFIG?.CATEGORIES || {
    MAIN: 'ТОЧНО ТВОЁ',
    MAYBE: 'МОЖЕТ БЫТЬ',
  },
  PAGE_SIZE_MAIN: window.APP_CONFIG?.PAGE_SIZE_MAIN || 10,
  RETRY_OPTIONS: window.APP_CONFIG?.RETRY_OPTIONS || { retries: 2, backoffMs: 400 },
  SEARCH_FIELDS: window.APP_CONFIG?.SEARCH_FIELDS || ['reason', 'text_highlighted', 'industry', 'company_name'],
  SUPABASE_URL: window.APP_CONFIG?.SUPABASE_URL,
  SUPABASE_ANON_KEY: window.APP_CONFIG?.SUPABASE_ANON_KEY,
};
