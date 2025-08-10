// favorites.js — вкладка «Избранное»
// кликабельные ссылки, tg://, скрытие "не указано",
// мягкое обновление без мигания, фикс кнопки «Изображение»,
// СТАРЫЙ КРЕСТИК удаления (исправлено y2="18"), убрана метка theTimestamp:

(function () {
  'use strict';

  // --- Гарантированно берём конфиг и утилиты ---
  const CFG  = window.APP_CONFIG;
  const UTIL = window.utils;

  if (!CFG) { alert('APP_CONFIG не загружен'); return; }
  if (!UTIL) { alert('utils.js не загружен'); return; }

  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    RETRY_OPTIONS = { retries: 2, backoffMs: 400 },
  } = CFG;

  const {
    escapeHtml, stripTags, debounce, highlightText, formatTimestamp, cleanImageMarkers,
    openLink, pickImageUrl, safeAlert, fetchWithRetry,
  } = UTIL;

  // --- DOM ---
  const container      = document.getElementById('favorites-list');
  const searchInputFav = document.getElementById('search-input-fav');

  // --- Сервисные функции ---
  function allowHttpOrTg(url) {
    if (!url) return '';
    try {
      const u = new URL(url, window.location.href);
      if (/^https?:$/.test(u.protocol) || /^tg:$/.test(u.protocol)) return u.href;
      return '';
    } catch { return ''; }
  }

  const UNKNOWN = ['не указано', 'n/a', 'none', 'null', '/'];
  const cleanVal = v => String(v ?? '').replace(/[«»"“”'‘’`]/g,'').trim();
  const isMeaningful = v => {
    const s = cleanVal(v).toLowerCase();
    return !!s && !UNKNOWN.includes(s);
  };
  const joinMeaningful = (...vals) => vals.map(cleanVal).filter(isMeaningful).join(' / ');

  // --- SEARCH UI (счётчик) ---
  let favStatsEl = null;
  function ensureFavSearchUI() {
    const parent = document.getElementById('search-container-fav') || searchInputFav?.parentElement;
    if (!parent) return;
    if (!favStatsEl) {
      favStatsEl = document.createElement('div');
      favStatsEl.id = 'search-stats-fav';
      favStatsEl.className = 'search-stats';
      parent.appendChild(favStatsEl);
    }
  }
  function updateFavStats() {
    const q = (searchInputFav?.value || '').trim();
    const total = container?.querySelectorAll('.vacancy-card:not([hidden])').length || 0;
    favStatsEl.textContent = q ? `Найдено: ${total}` : `Всего: ${total}`;
  }

  // --- Загрузка избранного ---
  async function loadFavorites() {
    if (!container) return;
    container.innerHTML = '<p class="empty-list">Загрузка…</p>';
    try {
      const p = new URLSearchParams();
      p.set('select', '*');
      p.set('status', 'eq.favorite');
      p.set('order', 'timestamp.desc');
      const url = `${SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;

      const resp = await fetchWithRetry(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      }, RETRY_OPTIONS);
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      const data = await resp.json();
      container.innerHTML = '';
      favState.all = data || [];
      favState.rendered = 0;
      renderNextFav();
      updateFavStats();
    } catch (e) {
      console.error(e);
      container.innerHTML = '<p class="empty-list">Ошибка загрузки.</p>';
    }
  }

  const favState = { all: [], rendered: 0, pageSize: PAGE_SIZE_FAV, btn: null };

  function makeFavBtn() {
    const b = document.createElement('button');
    b.className = 'load-more-btn';
    b.textContent = 'Показать ещё';
    b.style.marginTop = '10px';
    b.addEventListener('click', renderNextFav);
    return b;
  }
  function updateFavBtn() {
    if (!container) return;
    if (!favState.btn) favState.btn = makeFavBtn();
    const btn = favState.btn;
    const total = favState.all.length, rendered = favState.rendered;
    if (rendered < total) {
      if (!btn.parentElement) container.appendChild(btn);
      btn.disabled = false;
    } else if (btn.parentElement) {
      btn.parentElement.remove();
    }
  }

  // --- Карточка ---
  function buildFavCard(v) {
    const card = document.createElement('div');
    card.className = 'vacancy-card';
    card.id = `card-${v.id}`;

    if (v.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
    else if (v.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
    else card.classList.add('category-other');

    // Отклик: только если есть валидный https:// или tg://
    const applyUrl = allowHttpOrTg(String(v.apply_url || ''));
    const applyBtnHtml = applyUrl ? `
      <button class="card-action-btn apply" data-action="apply" data-url="${escapeHtml(applyUrl)}" aria-label="Откликнуться">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>` : '';

    // ТОЛЬКО 2 иконки: отклик + удалить
    const actionsHtml = `
      <div class="card-actions">
        ${applyBtnHtml}
        <button class="card-action-btn delete" data-action="delete" data-id="${v.id}" aria-label="Удалить">
          <svg class="icon-x" viewBox="0 0 24 24" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>`;

    const infoRows = [];
    const fmt = joinMeaningful(v.employment_type, v.work_format);
    if (fmt) infoRows.push({ label:'ФОРМАТ', value: fmt, type:'default' });
    if (isMeaningful(v.salary_display_text)) infoRows.push({ label:'ОПЛАТА', value: cleanVal(v.salary_display_text), type:'salary' });
    const sphereSrc = isMeaningful(v.industry) ? v.industry : v.sphere;
    if (isMeaningful(sphereSrc)) infoRows.push({ label:'СФЕРА', value: cleanVal(sphereSrc), type:'industry' });

    let infoHtml = '';
    if (infoRows.length) {
      infoHtml = '<div class="info-window">' + infoRows.map(r => `
        <div class="info-row info-row--${r.type}">
          <div class="info-label">${escapeHtml(r.label)} >></div>
          <div class="info-value">${escapeHtml(r.value)}</div>
        </div>`).join('') + '</div>';
    }

    const summaryText = v.reason || 'Описание не было сгенерировано.';
    const q = (searchInputFav?.value || '').trim();

    // Полный текст: HTML с кликабельными ссылками (убираем маркеры изображений)
    const originalDetailsHtml = cleanImageMarkers(String(v.text_highlighted || ''));
    const bestImageUrl = pickImageUrl(v, originalDetailsHtml);
    const attachmentsHTML = bestImageUrl ? `<div class="attachments"><a class="image-link-button" href="${escapeHtml(bestImageUrl)}" target="_blank" rel="noopener noreferrer">Изображение</a></div>` : '';

    card.innerHTML = `
      <div class="card-header">
        <div class="card-title">${escapeHtml(v.title || 'Без названия')}</div>
        <div class="card-subtitle">
          <span>${escapeHtml(v.company_name || v.channel || 'Без компании')}</span>
          <span>&middot;</span>
          <span class="card-time">${formatTimestamp(v.timestamp)}</span>
        </div>
        ${actionsHtml}
      </div>
      <div class="card-body">
        <p class="card-summary" data-original-summary="${escapeHtml(summaryText)}">${q ? highlightText(summaryText, q) : escapeHtml(summaryText)}</p>
        ${infoHtml}
        <div class="card-details">${originalDetailsHtml}</div>
        ${attachmentsHTML}
      </div>
    `;
    return card;
  }

  function renderNextFav() {
    const all = favState.all;
    const start = favState.rendered;
    const end = Math.min(start + favState.pageSize, all.length);
    for (let i = start; i < end; i++) {
      container.appendChild(buildFavCard(all[i]));
    }
    favState.rendered = end;
    updateFavBtn();
  }

  // --- Обновление статуса ---
  async function updateStatus(id, newStatus) {
    if (!id) return;
    try {
      const url = `${SUPABASE_URL}/rest/v1/vacancies?id=eq.${encodeURIComponent(id)}`;
      const resp = await fetchWithRetry(url, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ status: newStatus }),
      }, RETRY_OPTIONS);
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      const card = document.getElementById(`card-${id}`);
      if (card) {
        card.style.opacity = '0';
        setTimeout(() => {
          card.remove();
          if (container.querySelectorAll('.vacancy-card').length === 0) {
            container.innerHTML = '<p class="empty-list">-- В избранном пусто --</p>';
          }
          updateFavStats();
        }, 250);
      }
    } catch (e) {
      console.error(e);
      safeAlert('Не удалось изменить статус. Повторите позже.');
    }
  }

  // --- Слушатели карточек ---
  container?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'apply')   openLink(btn.dataset.url);
    if (action === 'delete')  updateStatus(btn.dataset.id, 'deleted');
  });

  // --- Pull-to-refresh (без мигания) ---
  (function setupPTR(){
    const threshold = 78;
    let startY=0, pulling=false, ready=false, locked=false;

    const onStart=(e)=>{
      if(locked) return;
      if((document.scrollingElement||document.documentElement).scrollTop>2) return;
      pulling=true; ready=false; startY=(e.touches?e.touches[0].clientY:e.clientY)||0;
    };
    const onMove=(e)=>{
      if(!pulling) return;
      const y=(e.touches?e.touches[0].clientY:e.clientY)||0;
      const dy=y-startY;
      if(dy>threshold) ready=true;
    };
    const onEnd=async()=>{
      if(!pulling) return;
      pulling=false;
      if(!ready) return;
      locked=true;
      try{ await loadFavorites(); } finally{ locked=false; }
    };
    window.addEventListener('touchstart', onStart, {passive:true});
    window.addEventListener('touchmove', onMove, {passive:true});
    window.addEventListener('touchend', onEnd, {passive:true});
    window.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  })();

  // --- Поиск в избранном ---
  function applyFavSearch() {
    const q = (searchInputFav?.value || '').trim();
    container.querySelectorAll('.vacancy-card').forEach(card => {
      const text = (card.dataset.searchText || '');
      const hit  = q ? text.includes(q) : true;
      card.hidden = !hit;

      const summaryEl = card.querySelector('.card-summary');
      if (summaryEl) {
        const original = summaryEl.dataset.originalSummary || '';
        summaryEl.innerHTML = q ? highlightText(original, q) : escapeHtml(original);
      }
    });
    updateFavStats();
  }
  const debouncedFavSearch = debounce(applyFavSearch, 300);
  searchInputFav?.addEventListener('input', debouncedFavSearch);

  // --- Init ---
  const PAGE_SIZE_FAV = 20;
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', () => { ensureFavSearchUI(); loadFavorites(); })
    : (ensureFavSearchUI(), loadFavorites());

})();
