// config.js — единые настройки фронта
window.config = {
  SUPABASE_URL: 'https://lwfhtwnfqmdjwzrdznvv.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4',

  // то, что у тебя называлось PAGE_SIZE_MAIN
  PAGE_SIZE: 10,

  // доп. опции — если не используются, можно оставить, не мешают
  RETRY_OPTIONS: { retries: 2, backoffMs: 400 },
  SEARCH_FIELDS: ['reason', 'text_highlighted', 'industry', 'company_name'],
};
