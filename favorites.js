// favorites.js — вкладка «Избранное»
// ИЗМЕНЕНИЕ: Реализован быстрый поиск на стороне клиента и синхронизация страниц.

(function () {
  'use strict';

  const CFG  = window.APP_CONFIG;
  const UTIL = window.utils;

  if (!CFG || !UTIL) {
      alert('Критическая ошибка: не удалось загрузить config.js или utils.js');
      return;
  }

  const {
    RETRY_OPTIONS,
    STATUSES,
    SEARCH_FIELDS
  } = CFG;

  const {
    debounce,
    openLink,
    uiToast,
    fetchWithRetry,
    createVacancyCard,
    setupPullToRefresh,
    renderEmptyState,
    renderError,
    showCustomConfirm,
    createSupabaseHeaders
  } = UTIL;

  const container      = document.getElementById('favorites-list');
  const searchInputFav = document.getElementById('search-input-fav');
  let allFavorites = []; // Кэш для всех избранных вакансий

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

  function renderFilteredFavorites() {
    const query = (searchInputFav?.value || '').trim().toLowerCase();
    
    const visibleCards = [];
    let hasContent = false;
    
    container.querySelectorAll('.vacancy-card').forEach(card => {
        const isVisible = query ? card.dataset.searchText.toLowerCase().includes(query) : true;
        card.style.display = isVisible ? '' : 'none';
        if (isVisible) visibleCards.push(card);
    });

    const emptyEl = container.querySelector('.empty-state');
    if (emptyEl) emptyEl.remove();

    if (allFavorites.length === 0) {
        renderEmptyState(container, '-- В избранном пусто --');
    } else if (visibleCards.length === 0 && query) {
        renderEmptyState(container, 'Ничего не найдено по вашему запросу');
    }
    
    updateFavStats(allFavorites.length, visibleCards.length);
  }

  async function loadFavorites(query = '') {
    container.innerHTML = '<div class="loader-container" style="position: static; padding: 50px 0;"><div class="retro-spinner"></div></div>';
    try {
      const p = new URLSearchParams();
      p.set('select', '*');
      p.set('status', `eq.${STATUSES.FAVORITE}`);
      p.set('order', 'timestamp.desc');

      const url  = `${CFG.SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;

      const resp = await fetchWithRetry(url, {
        headers: createSupabaseHeaders()
      }, RETRY_OPTIONS);
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      allFavorites = await resp.json();
      container.innerHTML = '';

      if (!allFavorites || allFavorites.length === 0) {
        renderEmptyState(container, '-- В избранном пусто --');
      } else {
        const frag = document.createDocumentFragment();
        allFavorites.forEach(v => {
          const card = createVacancyCard(v, { pageType: 'favorites', searchQuery: query });
          frag.appendChild(card);
        });
        container.appendChild(frag);
      }
      renderFilteredFavorites();
      document.dispatchEvent(new CustomEvent('favorites:loaded'));
    } catch (e) {
      console.error(e);
      renderError(container, 'Ошибка загрузки избранного', () => loadFavorites(query));
      document.dispatchEvent(new CustomEvent('favorites:loaded'));
    }
  }

  async function updateStatus(vacancyId, newStatus) {
    const ok = await showCustomConfirm('Удалить из избранного?');
    if (!ok) return;

    try {
      const url = `${CFG.SUPABASE_URL}/rest/v1/vacancies?id=eq.${encodeURIComponent(vacancyId)}`;
      const resp = await fetchWithRetry(url, {
        method: 'PATCH',
        headers: createSupabaseHeaders({ prefer: 'return=minimal' }),
        body: JSON.stringify({ status: newStatus })
      }, RETRY_OPTIONS);

      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      uiToast('Удалено из избранного');
      
      allFavorites = allFavorites.filter(v => v.id !== vacancyId);
      const cardElement = document.getElementById(`card-${vacancyId}`);
      if (cardElement) {
        cardElement.style.transition = 'opacity .2s ease-out, transform .2s ease-out';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
          cardElement.remove();
          renderFilteredFavorites();
        }, 200);
      }
      localStorage.setItem('needs-refresh-main', 'true');
    } catch (e) {
      console.error(e);
      UTIL.safeAlert('Не удалось изменить статус.');
    }
  }

  container?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'apply')   openLink(btn.dataset.url);
    if (action === 'delete')  updateStatus(btn.dataset.id, STATUSES.NEW);
  });

  const onSearch = debounce(() => {
    renderFilteredFavorites();
  }, 200);
  searchInputFav?.addEventListener('input', onSearch);

  setupPullToRefresh({
      onRefresh: () => loadFavorites(searchInputFav?.value || ''),
      refreshEventName: 'favorites:loaded'
  });

  ensureFavSearchUI();
  loadFavorites();
})();
