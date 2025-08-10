// utils.js — утилиты, доступны как window.utils
(() => {
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  if (tg && typeof tg.expand === 'function') tg.expand();

  // --- Безопасность текста/ссылок
  const escapeHtml = (s = '') =>
    String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const stripTags = (html = '') => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const normalizeUrl = (raw = '') => {
    let s = String(raw).trim();
    if (!s) return '';
    if (/^(t\.me|telegram\.me)\//i.test(s)) s = 'https://' + s;
    if (/^([a-z0-9-]+)\.[a-z]{2,}/i.test(s) && !/^https?:\/\//i.test(s)) s = 'https://' + s;
    try { return new URL(s, window.location.origin).href; } catch { return ''; }
  };
  const isHttpUrl = (u = '') => /^https?:\/\//i.test(u);
  const sanitizeUrl = (raw = '') => {
    const norm = normalizeUrl(raw);
    return isHttpUrl(norm) ? norm : '';
  };

  const openLink = (url) => {
    const safe = sanitizeUrl(url);
    if (!safe) return;
    if (tg && typeof tg.openLink === 'function') tg.openLink(safe);
    else window.open(safe, '_blank', 'noopener');
  };

  // --- Поиск/подсветка
  const debounce = (fn, delay = 250) => {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  };

  const highlightText = (text = '', q = '') => {
    if (!q) return escapeHtml(text);
    const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, 'gi');
    // Используем <mark class="highlight"> — стили уже есть в style.css
    return escapeHtml(text).replace(rx, '<mark class="highlight">$1</mark>');
  };

  // --- Прогресс «загрузка»
  const setProgress = (el, pct = 0) => { if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%'; };
  const startProgress = (el) => setProgress(el, 5);
  const finishProgress = (el) => setTimeout(() => setProgress(el, 100), 0);
  const resetProgress = (el) => setTimeout(() => setProgress(el, 0), 200);

  // --- Время
  const formatSmartTime = (isoString) => {
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
  };
  const formatTimestamp = (s) => formatSmartTime(s);

  // --- Работа с изображениями/маркерами
  const containsImageMarker = (text = '') =>
    /(\[\s*изображени[ея]\s*\]|\b(изображени[ея]|фото|картинк\w|скрин)\b)/i.test(text);

  const cleanImageMarkers = (text = '') =>
    String(text).replace(/\[\s*изображени[ея]\s*\]/gi, '').replace(/\s{2,}/g, ' ').trim();

  const pickImageUrl = (v, detailsText = '') => {
    const msg = sanitizeUrl(v?.message_link || '');
    const img = sanitizeUrl(v?.image_link || '');
    const allow = (v?.has_image === true) || containsImageMarker(detailsText) || containsImageMarker(v?.reason || '');
    if (!allow) return '';
    if (msg) return msg;     // приоритет — пост
    if (img) return img;     // fallback — файл
    return '';
  };

  // --- Шаблоны состояний
  const getEmptyStateHtml = (message) => {
    const catGifUrl = 'https://raw.githubusercontent.com/OshuNik/oshu_vacancies/5325db67878d324810971a262d689ea2ec7ac00f/img/Uploading%20a%20vacancy.%20The%20doggie.gif';
    return `<div class="empty-state"><img src="${catGifUrl}" alt="Спящий котик" class="empty-state-gif" /><p class="empty-state-text">${escapeHtml(message)}</p></div>`;
  };

  const renderError = (code = '') =>
    `<div class="empty-state"><p class="empty-state-text">Ошибка: ${escapeHtml(String(code))}</p></div>`;

  // --- Перемещение/управление кнопкой «Загрузить ещё»
  const ensureLoadMore = (activeList, btnEl) => {
    if (!activeList || !btnEl) return;
    // Всегда держим кнопку последним элементом списка
    if (btnEl.parentElement !== activeList) {
      activeList.appendChild(btnEl);
    } else {
      activeList.appendChild(btnEl); // переместит в конец
    }
  };

  // --- Кастомный confirm (использует разметку index.html)
  const showCustomConfirm = (message, onResult) => {
    const overlay = document.getElementById('custom-confirm-overlay');
    const textEl  = document.getElementById('custom-confirm-text');
    const okBtn   = document.getElementById('confirm-btn-ok');
    const cancelBtn = document.getElementById('confirm-btn-cancel');
    if (!overlay || !textEl || !okBtn || !cancelBtn) {
      const yes = window.confirm(message);
      onResult?.(!!yes);
      return;
    }
    textEl.textContent = message;
    overlay.classList.remove('hidden');
    const clean = () => overlay.classList.add('hidden');
    okBtn.onclick = () => { clean(); onResult?.(true); };
    cancelBtn.onclick = () => { clean(); onResult?.(false); };
  };

  // --- Сетевой помощник c retry
  const fetchWithRetry = async (url, options = {}, tries = 2, delay = 500) => {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(url, options);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r;
      } catch (e) {
        lastErr = e;
        if (i < tries - 1) await new Promise(res => setTimeout(res, delay));
      }
    }
    throw lastErr;
  };

  window.utils = {
    tg,
    escapeHtml, stripTags, debounce,
    normalizeUrl, isHttpUrl, sanitizeUrl, openLink,
    highlightText,
    setProgress, startProgress, finishProgress, resetProgress,
    formatTimestamp,
    containsImageMarker, cleanImageMarkers, pickImageUrl,
    getEmptyStateHtml, renderError,
    ensureLoadMore, showCustomConfirm,
    fetchWithRetry
  };
})();
