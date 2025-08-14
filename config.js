// config.js — все настраиваемые параметры в одном месте

window.APP_CONFIG = {
  // 👉 ваши действующие данные Supabase
  SUPABASE_URL: 'https://lwfhtwnfqmdjwzrdznvv.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4',

  // Порции на главной
  PAGE_SIZE_MAIN: 10,

  // Ретраи сетевых запросов
  RETRY_OPTIONS: { retries: 2, backoffMs: 400 },
  
  // ИЗМЕНЕНИЕ: Параметры для Pull-to-Refresh
  PTR_CONFIG: {
    THRESHOLD: 80, // (в px) дистанция для срабатывания
    BAR_HEIGHT: 60 // (в px) высота плашки обновления
  },

  // Поля, по которым ищем на сервере (ilike)
  SEARCH_FIELDS: ['reason', 'text_highlighted', 'industry', 'company_name'],

  STATUSES: {
    NEW: 'new',
    FAVORITE: 'favorite',
    DELETED: 'deleted',
  },
  CATEGORIES: {
    MAIN: 'ТОЧНО ТВОЁ',
    MAYBE: 'МОЖЕТ БЫТЬ',
  }
};
