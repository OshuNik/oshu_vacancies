// config.js — общие константы приложения
const SUPABASE_URL = 'https://lwfhtwnfqmdjwzrdznvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4';

// Главная лента: порционная отрисовка
const PAGE_SIZE_MAIN = 10;

// Параметры повторов сетевых запросов
const RETRY_OPTIONS = {
  retries: 2,          // сколько раз повторять при 5xx/429/сети
  baseDelay: 600       // мс (экспоненциально: 0:600, 1:1200, 2:2400 ...)
};

// Экспорт в window для простых скриптов без сборщика
window.APP_CONFIG = { SUPABASE_URL, SUPABASE_ANON_KEY, PAGE_SIZE_MAIN, RETRY_OPTIONS };
