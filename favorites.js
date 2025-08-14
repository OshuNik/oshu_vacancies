// favorites.js — вкладка «Избранное»

(function () {
  'use strict';

  const CFG  = window.APP_CONFIG || {};
  const UTIL = window.utils || {};
  const CONSTANTS = window.constants || {};

  try {
    const { config, utils } = UTIL.validateConfiguration(CFG, UTIL);
  } catch (error) {
    return;
  }

  const {
    RETRY_OPTIONS,
    STATUSES
  } = CONSTANTS;

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
    showCustomConfirm,
    createSupabaseHeaders,
    highlightText
  } = UTIL;

  const container = document.getElementById('favorites-list');
  const searchInputFav = document.getElementById('search-input-fav');
  const searchClearBtnFav = document.getElementById('search-clear-btn-fav');
  const searchInputWrapperFav = searchInputFav?.parentElement;
  
  // Проверяем критические элементы
  if (!container) {
    console.error('Критическая ошибка: не найден контейнер favorites-list');
    safeAlert('Не удается отобразить избранные вакансии. Перезагрузите страницу.');
    return;
  }
  
  let allFavorites = [];

  // Создаем менеджер поиска для устранения дублирования кода
  const searchManager = UTIL.createSearchManager({
    container,
    searchInput: searchInputFav,
    searchClearBtn: searchClearBtnFav,
    searchInputWrapper: searchInputWrapperFav,
    onSearch: () => {
      renderFilteredFavorites();
    },
    onClear: () => {
      renderFilteredFavorites();
    }
  });

  // Инициализируем поиск
  searchManager.setupSearch();

  function updateFavStats(total, visible) {
    const q = (searchInputFav?.value || '').trim();
    searchManager.updateStats(total, visible, q);
  }

  function renderFilteredFavorites() {
    const query = (searchInputFav?.value || '').trim().toLowerCase();
    
    let visibleCount = 0;
    
    container.querySelectorAll('.vacancy-card').forEach(card => {
        const isVisible = query ? card.dataset.searchText.toLowerCase().includes(query) : true;
        card.style.display = isVisible ? '' : 'none';
        
        if (isVisible) {
            visibleCount++;
            const summaryEl = card.querySelector('.card-summary');
            if (summaryEl && summaryEl.dataset.originalSummary) {
                UTIL.setSafeText(summaryEl, highlightText(summaryEl.dataset.originalSummary, query));
            }
        }
    });

    const emptyEl = container.querySelector('.empty-state');
    if (emptyEl) emptyEl.remove();

    if (allFavorites.length === 0) {
        renderEmptyState(container, '-- В избранном пусто --');
    } else if (visibleCount === 0 && query) {
        const div = document.createElement('div');
        renderEmptyState(div, 'Ничего не найдено по вашему запросу');
        container.prepend(div.firstElementChild);
    }
    
    updateFavStats(allFavorites.length, visibleCount);
  }

  async function loadFavorites(query = '') {
    UTIL.setSafeHTML(container, '<div class="loader-container" style="position: static; padding: 50px 0;"><div class="retro-spinner-inline"></div></div>');
    try {
      const p = new URLSearchParams();
      p.set('select', '*');
      p.set('status', `eq.${STATUSES.FAVORITE}`);
      p.set('order', 'timestamp.desc');

      const url  = `${CONSTANTS.SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;

      const resp = await fetchWithRetry(url, {
        headers: createSupabaseHeaders()
      }, RETRY_OPTIONS);
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      allFavorites = await resp.json();
      UTIL.clearElement(container);

      if (!allFavorites || allFavorites.length === 0) {
        renderEmptyState(container, '-- В избранном пусто --');
      } else {
        const frag = document.createDocumentFragment();
        allFavorites.forEach(v => {
          const card = createVacancyCard(v, { pageType: 'favorites' });
          frag.appendChild(card);
        });
        container.appendChild(frag);
      }
      renderFilteredFavorites(); 
      document.dispatchEvent(new CustomEvent('favorites:loaded'));
    } catch (e) {
      console.error(e);
      renderError(container, 'Ошибка загрузки избранного', () => loadFavorites());
      document.dispatchEvent(new CustomEvent('favorites:loaded'));
    }
  }

  async function updateStatus(vacancyId, newStatus) {
    const ok = await showCustomConfirm('Удалить из избранного?');
    if (!ok) return;

    const cardElement = document.getElementById(`card-${vacancyId}`);
    if (!cardElement) return;

    cardElement.style.transition = 'opacity .3s, max-height .3s, margin .3s, padding .3s, border-width .3s';
    cardElement.style.opacity = '0';
    cardElement.style.maxHeight = '0px';
    cardElement.style.paddingTop = '0';
    cardElement.style.paddingBottom = '0';
    cardElement.style.marginTop = '0';
    cardElement.style.marginBottom = '0';
    cardElement.style.borderWidth = '0';

    const onUndo = () => {
        cardElement.style.opacity = '1';
        cardElement.style.maxHeight = '500px';
        cardElement.style.paddingTop = '';
        cardElement.style.paddingBottom = '';
        cardElement.style.marginTop = '';
        cardElement.style.marginBottom = '';
        cardElement.style.borderWidth = '';
    };

    uiToast('Удалено из избранного', {
        timeout: 5000,
        onUndo: onUndo,
        onTimeout: async () => {
            try {
              cardElement.remove();
              const url = `${CONSTANTS.SUPABASE_URL}/rest/v1/vacancies?id=eq.${encodeURIComponent(vacancyId)}`;
              const resp = await fetchWithRetry(url, {
                method: 'PATCH',
                headers: createSupabaseHeaders({ prefer: 'return=minimal' }),
                body: JSON.stringify({ status: newStatus })
              }, RETRY_OPTIONS);

              if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
              
              try {
                  localStorage.setItem('needs-refresh-main', 'true');
              } catch (storageError) {
                  console.warn('localStorage недоступен:', storageError);
                  // Продолжаем работу без localStorage
              }
              allFavorites = allFavorites.filter(v => v.id !== vacancyId);
              renderFilteredFavorites();
            } catch (e) {
              safeAlert('Не удалось изменить статус.');
              onUndo();
            }
        }
    });
  }

  container?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'apply')   openLink(btn.dataset.url);
    if (action === 'delete')  updateStatus(btn.dataset.id, STATUSES.NEW);
  });

  const onSearch = debounce(() => renderFilteredFavorites(), 200);
  
  searchInputFav?.addEventListener('input', () => {
      searchInputWrapperFav?.classList.toggle('has-text', searchInputFav.value.length > 0);
      onSearch();
  });
  searchClearBtnFav?.addEventListener('click', () => {
      if (searchInputFav) {
        searchInputFav.value = '';
        searchInputWrapperFav?.classList.remove('has-text');
        onSearch();
        searchInputFav.focus();
      }
  });
  
  setupPullToRefresh({
      onRefresh: () => loadFavorites(),
      refreshEventName: 'favorites:loaded'
  });

  loadFavorites();
})();
