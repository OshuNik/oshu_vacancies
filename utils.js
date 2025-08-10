<script>
// utils.js — общие утилиты без глобальных конфликтов
(() => {
  // Telegram WebApp (внутри замыкания, наружу — только через window.utils)
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  try { tg && typeof tg.expand === 'function' && tg.expand(); } catch {}

  // ===== базовые =====
  const debounce = (fn, delay = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); }; };
  const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const stripTags = (html = '') => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent || d.innerText || ''; };

  // ===== ссылки =====
  function normalizeUrl(raw = '') {
    let s = String(raw).trim();
    if (!s) return '';
    if (/^(t\.me|telegram\.me)\//i.test(s)) s = 'https://' + s;
    if (/^([a-z0-9-]+)\.[a-z]{2,}/i.test(s) && !/^https?:\/\//i.test(s)) s = 'https://' + s;
    try { return new URL(s, window.location.origin).href; } catch { return ''; }
  }
  const isHttpUrl = (u = '') => /^https?:\/\//i.test(u);
  const sanitizeUrl = (raw = '') => { const norm = normalizeUrl(raw); return isHttpUrl(norm) ? norm : ''; };
  function openLink(url) {
    const safe = sanitizeUrl(url);
    if (!safe) return;
    if (tg && typeof tg.openLink === 'function') tg.openLink(safe);
    else window.open(safe, '_blank', 'noopener');
  }

  // ===== подсветка поиска =====
  const highlightText = (text = '', q = '') => {
    if (!q) return escapeHtml(text);
    const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, 'gi');
    // оборачиваем в ретро-стиль
    return escapeHtml(text).replace(rx, '<mark class="highlight highlight--retro">$1</mark>');
  };

  // ===== время =====
  function formatSmartTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString), now = new Date();
    const diffMs = now - d, sec = Math.floor(diffMs/1000), min = Math.floor(sec/60);
    const pad=n=>String(n).padStart(2,'0');
    const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
    const isSame = now.toDateString() === d.toDateString();
    const y = new Date(now); y.setDate(now.getDate()-1);
    const isY = y.toDateString() === d.toDateString();
    if (sec < 30) return 'только что';
    if (min < 60 && min >= 1) return `${min} мин назад`;
    if (isSame) return `сегодня, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (isY) return `вчера, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${d.getDate().toString().padStart(2,'0')} ${months[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const formatTimestamp = (iso) => formatSmartTime(iso);

  // ===== «Изображение» =====
  const containsImageMarker = (text = '') =>
    /(\[\s*изображени[ея]\s*\]|\b(изображени[ея]|фото|картинк\w|скрин)\b)/i.test(text);

  const cleanImageMarkers = (text = '') =>
    String(text).replace(/\[\s*изображени[ея]\s*\]/gi,'').replace(/\s{2,}/g,' ').trim();

  // выбор ссылки на картинку/пост
  function pickImageUrl(v = {}, detailsText = '') {
    const msg = sanitizeUrl(v.message_link || '');
    const img = sanitizeUrl(v.image_link || '');
    const allow = (v.has_image === true) || containsImageMarker(detailsText) || containsImageMarker(v.reason || '');
    if (!allow) return '';
    if (msg) return msg;        // приоритет — линк на пост в тг
    if (img) return img;        // запасной — прямая ссылка на файл
    return '';
  }

  // ===== сеть =====
  async function fetchWithRetry(url, opt = {}, retries = 2, delay = 600) {
    for (let i=0; i<=retries; i++) {
      try {
        const r = await fetch(url, opt);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r;
      } catch (e) {
        if (i === retries) throw e;
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }

  // ===== визуал пустых/ошибок =====
  function getEmptyStateHtml(message) {
    const cat = 'https://raw.githubusercontent.com/OshuNik/oshu_vacancies/5325db67878d324810971a262d689ea2ec7ac00f/img/Uploading%20a%20vacancy.%20The%20doggie.gif';
    return `<div class="empty-state">
      <img src="${cat}" alt="Загрузка" class="empty-state-gif"/><p class="empty-state-text">${escapeHtml(message)}</p>
    </div>`;
  }
  function renderEmptyState(container, message) { if (container) container.innerHTML = getEmptyStateHtml(message); }
  function renderError(container, message) { if (container) container.innerHTML = `<p class="empty-list">Ошибка: ${escapeHtml(message)}</p>`; }

  // ===== «Загрузить ещё» (единственный на странице) =====
  const _loadMore = { wrap: null, btn: null };
  function ensureLoadMore(onClick) {
    if (!_loadMore.wrap) {
      const wrap = document.createElement('div');
      wrap.className = 'load-more-wrap';
      const btn = document.createElement('button');
      btn.className = 'load-more-btn';
      btn.textContent = 'Загрузить ещё';
      btn.addEventListener('click', () => onClick && onClick());
      wrap.appendChild(btn);
      _loadMore.wrap = wrap; _loadMore.btn = btn;
    } else {
      _loadMore.btn.onclick = onClick || null;
    }
    return _loadMore;
  }
  function updateLoadMore(container, { visible = true, disabled = false } = {}) {
    if (!_loadMore.wrap) return;
    if (visible) {
      if (_loadMore.wrap.parentElement !== container) container.appendChild(_loadMore.wrap);
      _loadMore.wrap.style.display = 'flex';
      _loadMore.btn.disabled = !!disabled;
    } else {
      _loadMore.wrap.style.display = 'none';
    }
  }

  // экспорт
  window.utils = {
    tg, debounce, escapeHtml, stripTags,
    sanitizeUrl, openLink, highlightText,
    formatTimestamp,
    containsImageMarker, cleanImageMarkers, pickImageUrl,
    fetchWithRetry, renderEmptyState, renderError,
    ensureLoadMore, updateLoadMore
  };
})();
</script>
