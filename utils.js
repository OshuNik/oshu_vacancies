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
    toast.textContent = message;
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
            // В обычном браузере используем location.href для tg://
            window.location.href = safeUrl;
        }
        return;
    }
    const safeHttpUrl = sanitizeUrl(url);
    if (!safeHttpUrl) return;
    if (tg && typeof tg.openLink === 'function') {
        tg.openLink(safeHttpUrl);
    } else {
        window.open(safeHttpUrl, '_blank', 'noopener');
    }
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

  // ---- ОБЩАЯ ФУНКЦИЯ ДЛЯ КАРТОЧЕК ----
  function createVacancyCard(v, options = {}) {
    const { pageType = 'main', searchQuery = '' } = options;
    const card = document.createElement('div');
    card.className = 'vacancy-card';
    card.id = `card-${v.id}`;

    if (v.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
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
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>` : '';

    const favoriteBtnHtml = pageType === 'main' ? `
      <button class="card-action-btn favorite" data-action="favorite" data-id="${v.id}" aria-label="В избранное">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
      </button>` : '';

    const deleteBtnHtml = `
      <button class="card-action-btn delete" data-action="delete" data-id="${v.id}" aria-label="Удалить">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>`;

    const actionsHtml = `<div class="card-actions">${applyBtnHtml}${favoriteBtnHtml}${deleteBtnHtml}</div>`;

    const UNKNOWN = ['не указано', 'n/a', 'none', 'null', '/'];
    const cleanVal = val => String(val ?? '').replace(/[«»"“”'‘’`]/g,'').trim();
    const isMeaningful = val => {
        const s = cleanVal(val).toLowerCase();
        return !!s && !UNKNOWN.includes(s);
    };
    const infoRows = [];
    const fmt = [v.employment_type, v.work_format].map(cleanVal).filter(isMeaningful).join(' / ');
    if (fmt) infoRows.push({ label: 'ФОРМАТ', value: fmt, type: 'default' });
    if (isMeaningful(v.salary_display_text)) infoRows.push({ label: 'ОПЛАТА', value: cleanVal(v.salary_display_text), type: 'salary' });
    const sphereSrc = isMeaningful(v.industry) ? v.industry : v.sphere;
    if (isMeaningful(sphereSrc)) infoRows.push({ label: 'СФЕРА', value: cleanVal(sphereSrc), type: 'industry' });

    const infoHtml = infoRows.length ? '<div class="info-window">' + infoRows.map(r => `
        <div class="info-row info-row--${r.type}">
          <div class="info-label">${escapeHtml(r.label)} >></div>
          <div class="info-value">${escapeHtml(r.value)}</div>
        </div>`).join('') + '</div>' : '';

    const summaryText = v.reason || 'Описание не было сгенерировано.';
    const originalDetailsHtml = String(v.text_highlighted || '').replace(/\[\s*Изображение\s*\]\s*/gi, '');
    const bestImageUrl = pickImageUrl(v, originalDetailsHtml);
    const attachmentsHTML = bestImageUrl ? `<div class="attachments"><a class="image-link-button" href="${bestImageUrl}" target="_blank" rel="noopener noreferrer">Изображение</a></div>` : '';
    const hasDetails = Boolean(originalDetailsHtml) || Boolean(attachmentsHTML);
    const detailsHTML = hasDetails ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>` : '';

    const skillsFooterHtml = (Array.isArray(v.skills) && v.skills.length) ? `<div class="footer-skill-tags">${
        v.skills.slice(0,3).map(s=>`<span class="footer-skill-tag">${escapeHtml(String(s))}</span>`).join('')
      }</div>` : '';
    const channelHtml = v.channel ? `<span class="channel-name">${escapeHtml(v.channel)}</span>` : '';
    const timestampHtml = `<span class="timestamp-footer">${escapeHtml(formatTimestamp(v.timestamp))}</span>`;
    const sep = channelHtml && timestampHtml ? ' • ' : '';
    const footerMetaHtml = `<div class="footer-meta">${channelHtml}${sep}${timestampHtml}</div>`;

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
      detailsEl.innerHTML = attachmentsHTML + originalDetailsHtml;
    }
    const searchChunks = [
      v.category, v.reason, v.industry, v.company_name,
      Array.isArray(v.skills) ? v.skills.join(' ') : '',
      stripTags(originalDetailsHtml)
    ].filter(Boolean);
    card.dataset.searchText = searchChunks.join(' ').toLowerCase();

    return card;
  }

  // ---- ОБЩАЯ ФУНКЦИЯ ДЛЯ PULL-TO-REFRESH ----
  function setupPullToRefresh(options = {}) {
    const { onRefresh, refreshEventName, container = window } = options;
    if (typeof onRefresh !== 'function' || !refreshEventName) return;

    const threshold = 78;
    let startY = 0, pulling = false, ready = false, locked = false;

    const bar = document.createElement('div');
    bar.className = 'ptr-bar';
    bar.innerHTML = '<span class="ptr-text">Потяните для обновления</span>';
    document.body.appendChild(bar);
    const barText = bar.querySelector('.ptr-text');

    const setBar = (y) => {
        bar.style.transform = `translateY(${Math.min(0, -100 + (y / (threshold / 100)))}%)`;
        bar.classList.toggle('visible', y > 6);
    };

    const resetBar = () => {
        bar.classList.remove('visible');
        bar.style.transform = 'translateY(-100%)';
        if(barText) barText.textContent = 'Потяните для обновления';
    };

    container.addEventListener('touchstart', (e) => {
      if (locked || window.scrollY > 0 || e.touches.length !== 1) {
        pulling = false;
        return;
      }
      startY = e.touches[0].clientY;
      pulling = true;
      ready = false;
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (!pulling || locked) return;
      const dist = e.touches[0].clientY - startY;
      if (dist > 0) {
        e.preventDefault();
        setBar(dist);
        if (dist > threshold && !ready) {
            ready = true;
            if(barText) barText.textContent = 'Отпустите для обновления';
        }
        if (dist <= threshold && ready) {
            ready = false;
            if(barText) barText.textContent = 'Потяните для обновления';
        }
      } else {
        pulling = false;
        resetBar();
      }
    }, { passive: false });

    container.addEventListener('touchend', () => {
      if (!pulling || locked) {
        resetBar();
        pulling = false;
        return;
      }
      if (ready) {
        locked = true;
        if(barText) barText.textContent = 'Обновляю…';
        setBar(threshold * 1.2);
        const done = () => { locked = false; pulling = false; resetBar(); };
        const onLoaded = () => { document.removeEventListener(refreshEventName, onLoaded); done(); };
        document.addEventListener(refreshEventName, onLoaded);
        onRefresh();
        setTimeout(() => { if (locked) done(); }, 8000);
      } else {
        resetBar();
        pulling = false;
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
