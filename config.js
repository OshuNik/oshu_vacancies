// config.js — общие константы приложения (без глобальных const)
(() => {
  const cfg = {
    SUPABASE_URL: 'https://lwfhtwnfqmdjwzrdznvv.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4',
    PAGE_SIZE_MAIN: 10,
    RETRY_OPTIONS: { retries: 2, baseDelay: 600 }
  };
  Object.freeze(cfg);
  window.APP_CONFIG = cfg;
})();
