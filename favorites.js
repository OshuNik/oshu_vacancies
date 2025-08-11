// favorites.js — вкладка «Избранное»
// ИСПРАВЛЕНО: Поиск работает через сервер, добавлены уведомления

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
    SEARCH_FIELDS,
  } = CFG;

  const {
    debounce,
    openLink,
    safeAlert,
    uiToast,
    fetchWithRetry,
    createVacancyCard,
    setupPullToRefresh,
    renderEmptyState,
    renderError,
  } = UTIL;

  // --- DOM ---
  const container      = document.getElementById('favorites-list');
  const searchInputFav = document.getElementById('search-input-fav');

  // --- SEARCH UI (счётчик) ---
  let favStatsEl = null;
  function ensureFavSearchUI() {
    const parent = document.getElementById('search-container-fav') || searchInputFav?.parentElement;
    if (!parent || favStatsEl) return;
    favStatsEl = document.createElement('div');
    favStatsEl.className = 'search-stats';
    parent.appendChild(favStatsEl);
  }
  function updateFavStats(total, visible) {
    if (!favStatsEl) return;
    const q = (searchInputFav?.value || '').trim();
    favStatsEl.textContent = q ? (visible===0 ? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`) : '';
  }

  // --- API: загрузка избранного с поиском ---
  async function loadFavorites(query = '') {
    container.innerHTML = '<div class="loader-container" style="position: static; padding: 50px 0;"><div class="progress-bar-outline" style="max-width:300px;"><div class="progress-bar" style="animation: loading-anim 1.5s ease-in-out infinite;"></div></div></div>';

    try {
      const p = new URLSearchParams();
      p.set('select', '*');
      p.set('status', 'eq.favorite');
      p.set('order', 'timestamp.desc');

      const q = (query || '').trim();
      if(q && Array.isArray(SEARCH_FIELDS) && SEARCH_FIELDS.length){
        const orExpr = '('+SEARCH_FIELDS.map(f=>`${f}.ilike.*${q}*`).join(',')+')';
        p.set('or', orExpr);
      }

      const url  = `${SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;

      const resp = await fetchWithRetry(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      }, RETRY_OPTIONS);
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      const data = await resp.json();
      container.innerHTML = ''; // Очищаем лоадер

      if (!data || data.length === 0) {
        renderEmptyState(container, q ? 'Ничего не найдено по вашему запросу' : '-- В избранном пусто --');
      } else {
        const frag = document.createDocumentFragment();
        data.forEach(v => {
          const card = createVacancyCard(v, { pageType: 'favorites', searchQuery: q });
          frag.appendChild(card);
        });
        container.appendChild(frag);
      }
      updateFavStats(data.length, data.length);
      document.dispatchEvent(new CustomEvent('favorites:loaded'));

    } catch (e) {
      console.error(e);
      renderError(container, 'Ошибка загрузки избранного', () => loadFavorites(query));
      document.dispatchEvent(new CustomEvent('favorites:loaded'));
    }
  }

  async function updateStatus(vacancyId, newStatus) {
    const ok = await new Promise(resolve => {
        const confirmOverlay = document.querySelector('#custom-confirm-overlay'); // Находим его на главной
        if (!confirmOverlay) return resolve(window.confirm('Удалить из избранного?'));
        
        const confirmText = confirmOverlay.querySelector('#custom-confirm-text');
        const confirmOkBtn = confirmOverlay.querySelector('#confirm-btn-ok');
        const confirmCancelBtn = confirmOverlay.querySelector('#confirm-btn-cancel');

        confirmText.textContent = 'Удалить из избранного?';
        confirmOverlay.classList.remove('hidden');
        const close = (result) => {
            confirmOverlay.classList.add('hidden');
            confirmOkBtn.onclick = null;
            confirmCancelBtn.onclick = null;
            resolve(result);
        };
        confirmOkBtn.onclick = () => close(true);
        confirmCancelBtn.onclick = () => close(false);
    });

    if (!ok) return;

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

      uiToast('Удалено из избранного');
      const cardElement = document.getElementById(`card-${vacancyId}`);
      if (cardElement) {
        cardElement.style.transition = 'opacity .2s ease-out, transform .2s ease-out';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
          cardElement.remove();
          if (container.children.length === 0) {
             renderEmptyState(container, '-- В избранном пусто --');
          }
          const total = container.querySelectorAll('.vacancy-card').length;
          updateFavStats(total, total);
        }, 200);
      }
    } catch (e) {
      console.error(e);
      safeAlert('Не удалось изменить статус.');
    }
  }

  // --- Слушатели ---
  container?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'apply')   openLink(btn.dataset.url);
    if (action === 'delete')  updateStatus(btn.dataset.id, 'new'); // Возвращаем в ленту
  });

  const onSearch = debounce(() => {
      const query = searchInputFav?.value || '';
      loadFavorites(query);
  }, 300);
  searchInputFav?.addEventListener('input', onSearch);

  // --- Инициализация ---
  setupPullToRefresh({
      onRefresh: () => loadFavorites(searchInputFav?.value || ''),
      refreshEventName: 'favorites:loaded'
  });

  ensureFavSearchUI();
  loadFavorites();
})();
