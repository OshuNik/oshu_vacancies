// utils.js — общие хелперы + безопасный shim Telegram

(function () {
  // Безопасный доступ к Telegram WebApp
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  if (tg && typeof tg.expand === 'function') tg.expand();
  window.tg = tg;

  // Утилиты
  window.debounce = (fn, delay = 250) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; };
  window.escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  window.stripTags = (html = '') => { const tmp = document.createElement('div'); tmp.innerHTML = html; return tmp.textContent || tmp.innerText || ''; };

  function normalizeUrl(raw = '') {
    let s = String(raw).trim();
    if (!s) return '';
    if (/^(t\.me|telegram\.me)\//i.test(s)) s = 'https://' + s;
    if (/^([a-z0-9-]+)\.[a-z]{2,}/i.test(s) && !/^https?:\/\//i.test(s)) s = 'https://' + s;
    try { return new URL(s, window.location.origin).href; } catch { return ''; }
  }
  function isHttpUrl(u = '') { return /^https?:\/\//i.test(u); }
  window.sanitizeUrl = (raw = '') => { const norm = normalizeUrl(raw); return isHttpUrl(norm) ? norm : ''; };

  window.safeAlert = (msg) => {
    if (window.tg && typeof window.tg.showAlert === 'function') window.tg.showAlert(String(msg));
    else alert(String(msg));
  };

  window.openLink = (url) => {
    const safe = window.sanitizeUrl(url);
    if (!safe) return;
    if (window.tg && typeof window.tg.openLink === 'function') window.tg.openLink(safe);
    else window.open(safe, '_blank', 'noopener');
  };

  window.highlightText = (text = '', q = '') => {
    if (!q) return window.escapeHtml(text);
    const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, 'gi');
    return window.escapeHtml(text).replace(rx, '<mark class="highlight">$1</mark>');
  };

  // Время (RU)
  function formatSmartTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const now = new Date();
    const sec = Math.floor((now - d) / 1000);
    const min = Math.floor(sec / 60);
    const pad = n => n.toString().padStart(2, '0');
    const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
    const isSame = now.toDateString() === d.toDateString();
    const y = new Date(now); y.setDate(now.getDate() - 1);
    const isY = y.toDateString() === d.toDateString();
    if (sec < 30) return 'только что';
    if (min < 60 && min >= 1) return `${min} мин назад`;
    if (isSame) return `сегодня, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (isY) return `вчера, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${d.getDate().toString().padStart(2,'0')} ${months[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  window.formatTimestamp = (s) => formatSmartTime(s);

  // Изображения
  window.containsImageMarker = (text = '') => /(\[\s*изображени[ея]\s*\]|\b(изображени[ея]|фото|картинк\w|скрин)\b)/i.test(text);
  window.cleanImageMarkers = (text = '') => String(text).replace(/\[\s*изображени[ея]\s*\]/gi,'').replace(/\s{2,}/g,' ').trim();
  window.pickImageUrl = (v, detailsText = '') => {
    const msg = window.sanitizeUrl(v.message_link || '');
    const img = window.sanitizeUrl(v.image_link || '');
    const allow = (v.has_image === true) || window.containsImageMarker(detailsText) || window.containsImageMarker(v.reason || '');
    if (!allow) return '';
    if (msg) return msg;
    if (img) return img;
    return '';
  };
})();
