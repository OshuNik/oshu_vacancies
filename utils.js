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
  const sanitizeUrl = (raw = '') => {
    const norm = normalizeUrl(raw);
    return isHttpUrl(norm) ? norm : '';
  };
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
  const cleanImageMarkers = (text = '') => String(text).replace(/\[\s*изображени[ея]\s*\]/gi, '').replace(/\s{2,}/g, ' ').trim();
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
    const catGifUrl = 'https://raw.githubusercontent.com/OshuNik/oshu_vacancies/5325db67878d324810971a262d689ea2ec7ac00f/img/Uploading%20a%20vacancy.%20The%20doggie.gif';
    container.innerHTML = `<div class="empty-state"><img src="${catGifUrl}" class="empty-state-gif" alt=""><p class="empty-state-text">${escapeHtml(message)}</p></div>`;
  }
  function renderError(container, message, onRetry) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-state-text">Ошибка: ${escapeHtml(message || 'Ошибка сети')}</p>
        <div class="load-more-wrap"><button class="load-more-btn">Повторить</button></div>
      </div>`;
    const btn = container.querySelector('.load-more-btn');
    btn?.addEventListener('click', () => onRetry?.());
  }

  // ---- Load More button per container ----
  function ensureLoadMore(container, onClick) {
    let wrap = container.querySelector('.load-more-wrap');
    let btn = container.querySelector('.load-more-btn');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'load-more-wrap';
      btn = document.createElement('button');
      btn.className = 'load-more-btn';
      btn.type = 'button';
      btn.textContent = 'Загрузить ещё';
      wrap.appendChild(btn);
      container.appendChild(wrap);
    }
    btn.onclick = onClick;
    return { wrap, btn };
  }
  function updateLoadMore(container, visible) {
    let wrap = container.querySelector('.load-more-wrap');
    if (!wrap) return;
    wrap.style.display = visible ? '' : 'none';
  }

  window.utils = {
    tg, escapeHtml, stripTags, debounce, highlightText, safeAlert,
    formatTimestamp, sanitizeUrl, allowHttpOrTg, openLink,
    containsImageMarker, cleanImageMarkers, pickImageUrl,
    fetchWithRetry, renderEmptyState, renderError,
    ensureLoadMore, updateLoadMore
};
})();
