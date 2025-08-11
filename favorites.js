// favorites.js — вкладка «Избранное»
// ИСПОЛЬЗУЕТ ОБЩИЕ ФУНКЦИИ из utils.js для рендеринга и pull-to-refresh

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
    escapeHtml, debounce, highlightText,
    openLink, safeAlert, fetchWithRetry,
    createVacancyCard, // Используем общую функцию
    setupPullToRefresh // Используем общую функцию
  } = UTIL;

  // --- DOM ---
  const container      = document.getElementById('favorites-list');
  const searchInputFav = document.getElementById('search-input-fav');

  // --- Стили ---
  (function injectCSS() {
    const style = document.createElement('style');
    style.textContent = `
      .vacancy-text a, .card-summary a { text-decoration: underline; color:#1f6feb; word-break: break-word; }
      .vacancy-text a:hover, .card-summary a:hover { opacity:.85; }
      .image-link-button{
        display:inline-flex; align-items:center; justify-content:center;
        padding:6px 12px; background:#e6f3ff; color:#0b5ed7; font-weight:700;
        border:3px solid #000; border-radius:12px; line-height:1; text-decoration:none;
        box-shadow:0 3px 0 #000; transition:transform .08s ease, box-shadow .08s ease, filter .15s ease;
        outline:none;
      }
      .image-link-button:hover{ filter:saturate(1.05) brightness(1.02); }
      .image-link-button:active{ transform:translateY(2px); box-shadow:0 1px 0 #000; }
      .image-link-button:focus-visible{ outline:3px solid #8ec5ff; outline-offset:2px; }
      details > summary { list-style:none; cursor:pointer; user-select:none; outline:none; }
      details > summary::-webkit-details-marker{ display:none; }
      .vacancy-card{ position:relative; overflow:visible; }
      .card-actions{
        position:absolute; right:12px; top:12px; display:flex; gap:12px;
        z-index:2; pointer-events:auto;
      }
      .card-action-btn{
        width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center;
        background:transparent; border:0; padding:0; cursor:pointer;
      }
      .card-action-btn svg{ width:24px; height:24px; }
      .card-action-btn.delete{ color:#ff5b5b; }
      .card-action-btn.delete .icon-x{ stroke: currentColor; stroke-width: 2.5; fill: none; }
      .fade-swap-enter{ opacity:0; }
      .fade-swap-enter.fade-swap-enter-active{ opacity:1; transition:opacity .18s ease; }
      .fade-swap-exit{ opacity:1; }
      .fade-swap-exit.fade-swap-exit-active{ opacity:0; transition:opacity .12s ease; }
    `;
    document.head.appendChild(style);
  })();

  // --- SEARCH UI (счётчик) ---
  let favStatsEl = null;
  function ensureFavSearchUI() {
    const parent = document.getElementById('search-container-fav') || searchInputFav?.parentElement;
    if (!parent) return;
    if (!favStatsEl) {
      favStatsEl = document.createElement('div');
      favStatsEl.className = 'search-stats';
      parent.appendChild(favStatsEl);
    }
  }
  function updateFavStats() {
    if (!favStatsEl) return;
    const q = (searchInputFav?.value || '').trim();
    const visible = container?.querySelectorAll('.vacancy-card:not([hidden])').length || 0;
    const total   = container?.querySelectorAll('.vacancy-card').length || 0;
    favStatsEl.textContent = q ? (visible===0 ? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`) : '';
  }

  // --- Пагинация в памяти ---
  const PAGE_SIZE_FAV = 10;
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

  // --- Рендер порции ---
  function renderNextFav() {
    const start = favState.rendered;
    const end   = Math.min(start + favState.pageSize, favState.all.length);

    if (favState.all.length === 0 && start === 0) {
      container.innerHTML = '<p class="empty-list">-- В избранном пусто --</p>';
      updateFavBtn();
      updateFavStats();
      return;
    }

    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
        // ИСПОЛЬЗУЕМ ОБЩУЮ ФУНКЦИЮ
        const card = createVacancyCard(favState.all[i], {
            pageType: 'favorites',
            searchQuery: (searchInputFav?.value || '').trim()
        });
        frag.appendChild(card);
    }
    container.appendChild(frag);
    favState.rendered = end;

    updateFavBtn();
    applySearchFav();
  }

  // --- Поиск по избранному (локально) ---
  function applySearchFav() {
    const q = (searchInputFav?.value || '').trim().toLowerCase();

    const cards = container.querySelectorAll('.vacancy-card');
    cards.forEach(card => {
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

  // --- API: мягкая перезагрузка без мигания ---
  async function loadFavorites() {
    try {
      const p = new URLSearchParams();
      p.set('select', '*');
      p.set('status', 'eq.favorite');
      p.set('order', 'timestamp.desc');

      const url  = `${SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;

      const keepHeight = container.offsetHeight;
      if (keepHeight) container.style.minHeight = `${keepHeight}px`;

      const resp = await fetchWithRetry(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      }, RETRY_OPTIONS);
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      const data = await resp.json();
      favState.all = data || [];
      favState.rendered = 0;

      const tmp = document.createElement('div');
      const to = Math.min(favState.pageSize, favState.all.length);
      for (let i = 0; i < to; i++) {
          // ИСПОЛЬЗУЕМ ОБЩУЮ ФУНКЦИЮ
          const card = createVacancyCard(favState.all[i], {
              pageType: 'favorites',
              searchQuery: (searchInputFav?.value || '').trim()
          });
          tmp.appendChild(card);
      }

      const old = container;
      old.classList.add('fade-swap-exit', 'fade-swap-exit-active');

      setTimeout(() => {
        old.innerHTML = tmp.innerHTML;
        favState.rendered = to;
        updateFavBtn();
        applySearchFav();

        old.classList.remove('fade-swap-exit','fade-swap-exit-active');
        old.classList.add('fade-swap-enter', 'fade-swap-enter-active');

        setTimeout(() => {
          old.classList.remove('fade-swap-enter','fade-swap-enter-active');
          old.style.minHeight = '';
          document.dispatchEvent(new CustomEvent('favorites:loaded'));
        }, 200);
      }, 120);

    } catch (e) {
      console.error(e);
      container.innerHTML = '<p class="empty-list">Ошибка загрузки избранного.</p>';
      document.dispatchEvent(new CustomEvent('favorites:loaded'));
    }
  }

  async function updateStatus(vacancyId, newStatus) {
    const cardElement = document.getElementById(`card-${vacancyId}`);
    try {
      const url = `${SUPABASE_URL}/rest/v1/vacancies?id=eq.${encodeURIComponent(vacancyId)}`;
      const resp = await fetchWithRetry(url, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ status: newStatus })
      }, RETRY_OPTIONS);

      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      if (cardElement) {
        cardElement.style.transition = 'opacity .25s ease, transform .25s ease';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.98)';
        setTimeout(() => {
          cardElement.remove();
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

  // --- События и старт ---
  searchInputFav?.addEventListener('input', debounce(applySearchFav, 220));

  // ИСПОЛЬЗУЕМ ОБЩУЮ ФУНКЦИЮ
  setupPullToRefresh({
      onRefresh: loadFavorites,
      refreshEventName: 'favorites:loaded'
  });

  ensureFavSearchUI();
  loadFavorites();
})();
