// config.js — все настраиваемые параметры в одном месте

window.APP_CONFIG = {
  // 👉 ваши действующие данные Supabase
  SUPABASE_URL: 'https://lwfhtwnfqmdjwzrdznvv.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4',

  // Порции на главной
  PAGE_SIZE_MAIN: 10,

  // Ретраи сетевых запросов
  RETRY_OPTIONS: { retries: 2, backoffMs: 400 },

  // Поля, по которым ищем на сервере (ilike)
  SEARCH_FIELDS: ['reason', 'text_highlighted', 'industry', 'company_name'],

  // ИЗМЕНЕНИЕ: Централизованные константы для статусов и категорий
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
