// utils.js — общие утилиты (ПОЛНАЯ ВЕРСИЯ)
// Без зависимостей. Экспортирует window.utils.

(function () {
  'use strict';

  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

  // --- Безопасность текста ---
  const escapeHtml = (s = '') =>
    String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const stripTags = (html = '') => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const debounce = (fn, delay = 250) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  };

  const highlightText = (text = '', q = '') => {
    if (!q) return escapeHtml(text);
    const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapeHtml(text).replace(rx, '<mark class="highlight">$1</mark>');
  };

  const safeAlert = (msg = '') => {
    if (tg && typeof tg.showAlert === 'function') tg.showAlert(String(msg));
    else alert(String(msg));
  };

  // --- Дата/время ---
  const pad2 = n => String(n).padStart(2, '0');
  const formatTimestamp = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${String(d.getFullYear()).slice(-2)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  // --- Работа с изображениями внутри HTML ---
  function containsImageMarker(s = '') { return /\[\s*Изображение\s*\]/i.test(String(s)); }
  function cleanImageMarkers(html = '') { return String(html).replace(/\[\s*Изображение\s*\]\s*/gi, ''); }
  function pickImageUrl(vacancy = {}, html = '') {
    const fromField = (vacancy.images && vacancy.images[0]) || vacancy.image || '';
    if (fromField) return fromField;
    const m = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
    return m ? m[1] : '';
  }

  // --- URL helpers ---
  function normalizeUrl(raw = '') {
    let s = String(raw).trim();
    if (!s) return '';
    // Поддержка кратких telegram ссылок без схемы
    if (/^(t\.me|telegram\.me)\//i.test(s)) s = 'https://' + s;
    // Домен без схемы → https
    if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(s) && !/^https?:\/\//i.test(s)) s = 'https://' + s;
    try { return new URL(s, window.location.origin).href; } catch { return ''; }
  }
  function isHttpUrl(u = '') { return /^https?:\/\//i.test(u); }
  function sanitizeUrl(raw = '') {
    const norm = normalizeUrl(raw);
    return isHttpUrl(norm) ? norm : '';
  }

  // Разрешаем https:// и tg://
  function allowHttpOrTg(url = '') {
    if (!url) return '';
    try {
      const u = new URL(url, window.location.href);
      if (/^https?:$/.test(u.protocol) || /^tg:$/.test(u.protocol)) return u.href;
      return '';
    } catch { return ''; }
  }

  function openLink(url) {
    const safe = allowHttpOrTg(url) || sanitizeUrl(url);
    if (!safe) return;
    if (tg && typeof tg.openLink === 'function') tg.openLink(safe);
    else window.open(safe, '_blank', 'noopener,noreferrer');
  }

  // --- fetch с ретраями ---
  async function fetchWithRetry(url, opts = {}, retryOptions = { retries: 2, backoffMs: 400 }) {
    const { retries = 2, backoffMs = 400 } = retryOptions || {};
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      try {
        const r = await fetch(url, opts);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r;
      } catch (e) {
        lastErr = e;
        if (i === retries) break;
        await new Promise(res => setTimeout(res, backoffMs * (i + 1)));
      }
    }
    throw lastErr || new Error('Fetch failed');
  }

  // --- Состояния списка ---
  function renderEmptyState(container, text = 'Ничего не найдено') {
    const el = document.createElement('div');
    el.className = 'empty-state';
    el.textContent = text;
    container.appendChild(el);
  }
  function renderError(container, text = 'Ошибка загрузки') {
    const el = document.createElement('div');
    el.className = 'error-state';
    el.textContent = text;
    container.appendChild(el);
  }

  function ensureLoadMore(container, onClick) {
    let wrap = container.querySelector('.load-more-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'load-more-wrap';
      wrap.innerHTML = `<button class="load-more-btn" type="button">Загрузить ещё</button>`;
      container.appendChild(wrap);
    }
    const btn = wrap.querySelector('.load-more-btn');
    btn.onclick = onClick;
    return btn;
  }
  function updateLoadMore(container, visible) {
    let wrap = container.querySelector('.load-more-wrap');
    if (!wrap) return;
    wrap.style.display = visible ? '' : 'none';
  }

  // --- Экспорт ---
  window.utils = {
    tg,
    // текст/подсветка
    escapeHtml, stripTags, debounce, highlightText, safeAlert,
    // время
    formatTimestamp,
    // ссылки
    sanitizeUrl, allowHttpOrTg, openLink,
    // изображения в тексте
    containsImageMarker, cleanImageMarkers, pickImageUrl,
    // сеть
    fetchWithRetry,
    // UI helpers
    renderEmptyState, renderError, ensureLoadMore, updateLoadMore,
  };
})();
