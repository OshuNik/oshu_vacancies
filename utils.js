// utils.js — общие утилиты (без зависимостей)

(function () {
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

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

  const safeAlert = (msg) => {
    try { tg?.showAlert?.(String(msg)); } catch { alert(String(msg)); }
  };

  // ---- URL helpers ----
  function normalizeUrl(raw = '') {
    let s = String(raw).trim();
    if (!s) return '';
    if (/^(t\.me|telegram\.me)\//i.test(s)) s = 'https://' + s;
    if (/^([a-z0-9-]+)\.[a-z]{2,}/i.test(s) && !/^https?:\/\//i.test(s)) s = 'https://' + s;
    try { return new URL(s, window.location.origin).href; } catch { return ''; }
  }

  const isHttpUrl = (u = '') => /^https?:\/\//i.test(u);
  const isTelegramUrl = (u = '') => /^tg:\/\//i.test(u) || /^https?:\/\/t\.me\//i.test(u);

  const sanitizeUrl = (raw = '') => {
    const norm = normalizeUrl(raw);
    return (isHttpUrl(norm) || isTelegramUrl(norm)) ? norm : '';
  };

  function openLink(url) {
    const safe = sanitizeUrl(url);
    if (!safe) return;
    if (isTelegramUrl(safe)) {
      if (tg && typeof tg.openTelegramLink === 'function') tg.openTelegramLink(safe);
      else window.location.href = safe;
      return;
    }
    if (tg && typeof tg.openLink === 'function') tg.openLink(safe);
    else window.open(safe, '_blank', 'noopener');
  }

  // ---- time ----
  function formatSmartTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now - d;
    const sec = Math.floor(diffMs / 1000);
    const min = Math.floor(sec / 60);

    const pad = n => n.toString().padStart(2, '0');
    const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];

    const isSameDay = now.toDateString() === d.toDateString();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    const isYesterday = yest.toDateString() === d.toDateString();

    if (sec < 30) return 'только что';
    if (min < 60 && min >= 1) return `${min} мин назад`;
    if (isSameDay) return `сегодня, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (isYesterday) return `вчера, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${d.getDate().toString().padStart(2,'0')} ${months[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const formatTimestamp = (s) => formatSmartTime(s);

  // ---- image markers ----
  const containsImageMarker = (text = '') =>
    /(\[\s*изображени[ея]\s*\]|\b(изображени[ея]|фото|картинк\w|скрин)\b)/i.test(text);

  const cleanImageMarkers = (text = '') =>
    String(text).replace(/\[\s*изображени[ея]\s*\]/gi, '').replace(/\s{2,}/g, ' ').trim();

  function pickImageUrl(v, detailsText = '') {
    const msg = sanitizeUrl(v.message_link || '');
    const img = sanitizeUrl(v.image_link || '');
    const allow = (v.has_image === true) || containsImageMarker(detailsText) || containsImageMarker(v.reason || '');
    if (!allow) return '';
    if (msg) return msg;
    if (img) return img;
    return '';
  }

  // ---- fetch with retry ----
  async function fetchWithRetry(url, options = {}, retryCfg = { retries: 0, backoffMs: 300 }) {
    let attempt = 0;
    let lastErr = null;
    while (attempt <= (retryCfg.retries || 0)) {
      try {
        return await fetch(url, options);
      } catch (e) {
        lastErr = e;
        if (attempt === retryCfg.retries) break;
        await new Promise(r => setTimeout(r, (retryCfg.backoffMs || 300) * Math.pow(2, attempt)));
        attempt++;
      }
    }
    throw lastErr || new Error('Network error');
  }

  // ---- empty/error ----
  function renderEmptyState(container, message) {
    if (!container) return;
    container.innerHTML = `<p class="empty-list">${escapeHtml(message || '-- Пусто --')}</p>`;
  }
  function renderError(container, message) {
    if (!container) return;
    container.innerHTML = `<p class="empty-list">${escapeHtml(message || 'Ошибка')}</p>`;
  }

  // ---- Load More helpers ----
  function ensureLoadMore(container, onClick) {
    if (!container) return;
    let wrap = container.querySelector('.load-more-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'load-more-wrap';
      wrap.innerHTML = `<button class="load-more-btn" type="button">Загрузить ещё</button>`;
      container.appendChild(wrap);
      wrap.querySelector('button')?.addEventListener('click', onClick);
    }
  }
  function updateLoadMore(container, visible) {
    let wrap = container.querySelector('.load-more-wrap');
    if (!wrap) return;
    wrap.style.display = visible ? '' : 'none';
  }

  window.utils = {
    tg, escapeHtml, stripTags, debounce, highlightText, safeAlert,
    formatTimestamp, sanitizeUrl, openLink,
    containsImageMarker, cleanImageMarkers, pickImageUrl,
    fetchWithRetry, renderEmptyState, renderError,
    ensureLoadMore, updateLoadMore
  };
})();
