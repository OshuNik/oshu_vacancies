// utils.js — общие утилиты
// ИСПРАВЛЕНО: Корректная обработка tg:// ссылок в браузере

(function () {
  'use strict';

  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

  // --- ОБЩИЕ UI-УТИЛИТЫ ---
  function uiToast(message = '') {
    let cont = document.getElementById('toast-container');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'toast-container';
      cont.className = 'toast-container';
      document.body.appendChild(cont);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = String(message);
    cont.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 200);
    }, 2200);
  }

  const safeAlert = (msg) => {
    if (tg && typeof tg.showAlert === 'function') tg.showAlert(String(msg));
    else uiToast(String(msg));
  };

  // ---- ESCAPE / STRIP ----
  function escapeHtml(s = '') {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
  function stripTags(html = '') {
    const div = document.createElement('div');
    div.innerHTML = String(html);
    return (div.textContent || div.innerText || '').trim();
  }

  // ---- ДЕБАУНС ----
  function debounce(fn, wait = 300) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  };

  const highlightText = (text = '', q = '') => {
    if (!q) return escapeHtml(text);
    const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapeHtml(text).replace(rx, '<mark class="highlight">$1</mark>');
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
  
  // --- ИСПРАВЛЕННАЯ ФУНКЦИЯ ---
  function openLink(url) {
    const safeUrl = String(url || '');
    if (/^tg:\/\//.test(safeUrl)) {
        if (tg && typeof tg.openTelegramLink === 'function') {
            tg.openTelegramLink(safeUrl);
        } else {
            // Фоллбек: попробуем открыть в браузере telgram-ссылку
            window.location.href = safeUrl;
        }
        return;
    }
    if (/^@[\w\d_]{3,}$/i.test(safeUrl)) {
      const u = `https://t.me/${safeUrl.replace(/^@/, '')}`;
      window.open(u, '_blank', 'noopener');
      return;
    }
    const httpUrl = sanitizeUrl(safeUrl);
    if (httpUrl) window.open(httpUrl, '_blank', 'noopener');
  }

  // ---- EMPTY / ERROR STATE ----
  function renderEmptyState({ title = 'Пусто', description = '' } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'empty-state';
    wrap.innerHTML = `
      <div class="empty-ico">🗂️</div>
      <div class="empty-title">${escapeHtml(title)}</div>
      ${description ? `<div class="empty-desc">${escapeHtml(description)}</div>` : ''}
    `;
    return wrap;
  }
  function renderError({ title = 'Ошибка', description = '' } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'error-state';
    wrap.innerHTML = `
      <div class="error-ico">⚠️</div>
      <div class="error-title">${escapeHtml(title)}</div>
      ${description ? `<div class="error-desc">${escapeHtml(description)}</div>` : ''}
    `;
    return wrap;
  }

  // ---- LOAD MORE helpers ----
  function ensureLoadMore(container) {
    let btn = container.querySelector('.load-more');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'load-more';
      btn.type = 'button';
      btn.textContent = 'Загрузить ещё';
      container.appendChild(btn);
    }
    return btn;
  }
  function updateLoadMore(btn, { disabled = false, hidden = false, loading = false } = {}) {
    if (!btn) return;
    btn.disabled = !!disabled || !!loading;
    btn.hidden = !!hidden;
    btn.classList.toggle('loading', !!loading);
    btn.textContent = loading ? 'Загружаю…' : 'Загрузить ещё';
  }

  // ---- формат времени ----
  function formatSmartTime(iso) {
    const d = new Date(iso || Date.now());
    const now = new Date();
    const sec = Math.floor((now.getTime() - d.getTime()) / 1000);
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
        const resp = await fetch(url, options);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp;
      } catch (e) {
        lastErr = e;
        if (attempt === (retryCfg.retries || 0)) break;
        await new Promise(r => setTimeout(r, (retryCfg.backoffMs || 300) * (attempt + 1)));
        attempt++;
      }
    }
    throw lastErr || new Error('Network error');
  }

  // ---- CARD RENDER ----
  function createVacancyCard(v, { pageType = 'main', searchQuery = '' } = {}) {
    const card = document.createElement('article');
    card.className = 'vacancy-card';
    if (v.category === 'ТОЧНО ТВОЁ') card.classList.add('category-good');
    else if (v.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
    else card.classList.add('category-other');

    const allowHttpOrTg = (url) => {
        if (!url) return '';
        try {
            const u = new URL(url, window.location.href);
            if (/^https?:$/.test(u.protocol) || /^tg:$/.test(u.protocol)) return u.href;
            return '';
        } catch { return ''; }
    };
    const applyUrl = allowHttpOrTg(String(v.apply_url || ''));
    const applyBtnHtml = applyUrl ? `
      <button class="card-action-btn apply" data-action="apply" data-url="${escapeHtml(applyUrl)}" aria-label="Откликнуться">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="2 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>` : '';

    const favoriteBtnHtml = pageType === 'main' ? `
      <button class="card-action-btn favorite" data-action="favorite" data-id="${v.id}" aria-label="В избранное">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.35l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </button>` : '';

    const deleteBtnHtml = `
      <button class="card-action-btn delete" data-action="delete" data-id="${v.id}" aria-label="Удалить">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
      </button>`;

    const actionsHtml = `<div class="card-actions">${applyBtnHtml}${favoriteBtnHtml}${deleteBtnHtml}</div>`;

    const UNKNOWN = ['не указано', 'n/a', 'none', 'null', '/'];
    const pretty = (s = '') => {
      const x = String(s || '').trim();
      if (!x) return '—';
      if (UNKNOWN.includes(x.toLowerCase())) return '—';
      return escapeHtml(x);
    };

    const summaryText = String(v.reason || '').trim() || 'Описание отсутствует';
    const infoHtml = `
      <ul class="meta">
        <li><span class="meta-name">Компания:</span> <span class="meta-val">${pretty(v.company_name)}</span></li>
        <li><span class="meta-name">Формат:</span> <span class="meta-val">${pretty(v.work_format)}</span></li>
        <li><span class="meta-name">Занятость:</span> <span class="meta-val">${pretty(v.employment_type)}</span></li>
        <li><span class="meta-name">Сфера:</span> <span class="meta-val">${pretty(v.industry)}</span></li>
        <li><span class="meta-name">Оплата:</span> <span class="meta-val">${pretty(v.salary_display_text)}</span></li>
      </ul>
    `;

    const skills = Array.isArray(v.skills) ? v.skills : [];
    const skillsFooterHtml = skills.length ? `
      <div class="skills">
        ${skills.slice(0, 6).map(s => `<span class="skill">${escapeHtml(String(s))}</span>`).join('')}
      </div>` : '';

    const detailsHTML = `
      <div class="vacancy-text" data-original="1"></div>
    `;

    const footerMetaHtml = `
      <div class="footer-meta">
        <span class="channel">${escapeHtml(v.channel || '')}</span>
        <span class="timestamp">${formatTimestamp(v.timestamp)}</span>
      </div>
    `;

    card.innerHTML = `
      ${actionsHtml}
      <div class="card-header"><h3>${escapeHtml(v.category || 'NO_CATEGORY')}</h3></div>
      <div class="card-body">
        <p class="card-summary"></p>
        ${infoHtml}
        ${detailsHTML}
      </div>
      <div class="card-footer">${skillsFooterHtml}${footerMetaHtml}</div>
    `;

    const summaryEl = card.querySelector('.card-summary');
    if (summaryEl) {
      summaryEl.dataset.originalSummary = summaryText;
      summaryEl.innerHTML = searchQuery ? highlightText(summaryText, searchQuery) : escapeHtml(summaryText);
    }
    const detailsEl = card.querySelector('.vacancy-text');
    if (detailsEl) {
      detailsEl.innerHTML = (v.attachments_html || '') + (v.text_highlighted || '');
    }
    const searchChunks = [
      v.category, v.reason, v.industry, v.company_name,
      Array.isArray(v.skills) ? v.skills.join(' ') : '',
      stripTags(v.text_highlighted || '')
    ].filter(Boolean);
    card.dataset.searchText = searchChunks.join(' ').toLowerCase();

    return card;
  }

  // ---- ОБЩАЯ ФУНКЦИЯ ДЛЯ PULL-TO-REFRESH ----
  function setupPullToRefresh(options = {}) {
    const { onRefresh, refreshEventName, container = window } = options;
    if (typeof onRefresh !== 'function' || !refreshEventName) return;

    const threshold = 78;            // сколько тянуть, чтобы сработал refresh
    const activatePx = 16;           // минимальный вертикальный сдвиг, чтобы вообще показать плашку
    const slopeRatio = 1.3;          // вертикаль должна быть сильнее горизонтали (dy > dx * ratio)

    let startY = 0, startX = 0;
    let pulling = false, ready = false, locked = false, activated = false;

    const bar = document.createElement('div');
    bar.className = 'ptr-bar';
    bar.innerHTML = '<span class="ptr-text">Потяните для обновления</span>';
    document.body.appendChild(bar);
    const barText = bar.querySelector('.ptr-text');

    const setBar = (y) => {
      bar.style.transform = `translateY(${Math.min(0, -100 + (y / (threshold / 100)))}%)`;
      bar.classList.toggle('visible', y > activatePx);
    };
    const resetBar = () => {
      bar.style.transform = 'translateY(-100%)';
      bar.classList.remove('visible');
      if (barText) barText.textContent = 'Потяните для обновления';
    };

    container.addEventListener('touchstart', (e) => {
      if (locked || window.scrollY > 0 || e.touches.length !== 1) {
        pulling = false;
        activated = false;
        return;
      }
      const t = e.touches[0];
      startY = t.clientY;
      startX = t.clientX;
      pulling = true;
      ready = false;
      activated = false;
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (!pulling || locked) return;
      const t = e.touches[0];
      const dy = t.clientY - startY;
      const dx = Math.abs(t.clientX - startX);

      // пока нет явного вертикального жеста — ничего не делаем
      if (!activated) {
        if (dy <= activatePx || dy <= dx * slopeRatio) return;
        activated = true; // теперь можно показывать плашку и блокировать прокрутку
      }

      if (dy > 0) {
        e.preventDefault();           // блокируем скролл только ПОСЛЕ активации
        setBar(dy);
        if (dy > threshold && !ready) {
          ready = true;
          if (barText) barText.textContent = 'Отпустите для обновления';
        } else if (dy <= threshold && ready) {
          ready = false;
          if (barText) barText.textContent = 'Потяните для обновления';
        }
      } else {
        pulling = false;
        activated = false;
        resetBar();
      }
    }, { passive: false });

    container.addEventListener('touchend', () => {
      if (!pulling || locked) {
        resetBar();
        pulling = false;
        activated = false;
        return;
      }
      if (ready) {
        locked = true;
        if (barText) barText.textContent = 'Обновляю…';
        setBar(threshold * 1.2);
        const done = () => { locked = false; pulling = false; activated = false; resetBar(); };
        const onLoaded = () => { document.removeEventListener(refreshEventName, onLoaded); done(); };
        document.addEventListener(refreshEventName, onLoaded);
        onRefresh();
        setTimeout(() => { if (locked) done(); }, 8000);
      } else {
        resetBar();
        pulling = false;
        activated = false;
      }
    }, { passive: true });
  }


  window.utils = {
    tg, escapeHtml, stripTags, debounce, highlightText, safeAlert, uiToast,
    formatTimestamp, sanitizeUrl, openLink,
    containsImageMarker, cleanImageMarkers, pickImageUrl,
    fetchWithRetry, renderEmptyState, renderError,
    ensureLoadMore, updateLoadMore,
    createVacancyCard,
    setupPullToRefresh
  };
})();
