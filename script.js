// script.js — главная страница

(function () {
  'use strict';
  
  const CFG = window.APP_CONFIG || {};
  const UTIL = window.utils || {};

  if (!CFG || !UTIL) {
    alert('Критическая ошибка: не удалось загрузить config.js или utils.js');
    return;
  }

  const {
    PAGE_SIZE_MAIN,
    RETRY_OPTIONS,
    SEARCH_FIELDS,
    STATUSES,
    CATEGORIES
  } = CFG;

  const {
    debounce,
    safeAlert,
    uiToast,
    openLink,
    fetchWithRetry,
    renderEmptyState,
    renderError,
    ensureLoadMore,
    updateLoadMore,
    createVacancyCard,
    setupPullToRefresh,
    showCustomConfirm,
    createSupabaseHeaders,
    parseTotal
  } = UTIL;

  const containers = {
    main:  document.getElementById('vacancies-list-main'),
    maybe: document.getElementById('vacancies-list-maybe'),
    other: document.getElementById('vacancies-list-other'),
  };
  const counts = {
    main:  document.getElementById('count-main'),
    maybe: document.getElementById('count-maybe'),
    other: document.getElementById('count-other'),
  };
  const tabButtons      = document.querySelectorAll('.tab-button');
  const vacancyLists    = document.querySelectorAll('.vacancy-list');
  const searchInput     = document.getElementById('search-input');
  const mainHeader      = document.getElementById('main-header');
  const vacanciesContent= document.getElementById('vacancies-content');
  const loader          = document.getElementById('loader');
  const searchClearBtn  = document.getElementById('search-clear-btn');
  const searchInputWrapper = searchInput?.parentElement;

  const state = {
    query: '',
    activeKey: 'main',
    main:  { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' },
    maybe: { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' },
    other: { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' },
  };
  let currentController = null;

  function showLoader() {
    if (loader) loader.classList.remove('hidden');
  }
  function hideLoader() {
    if (loader) loader.classList.add('hidden');
  }

  let searchStatsEl=null;
  function ensureSearchUI(){
    const searchContainer = document.getElementById('search-container');
    if(!searchContainer || searchStatsEl) return;
    searchStatsEl=document.createElement('div');
    searchStatsEl.className='search-stats';
    searchInputWrapper.insertAdjacentElement('afterend', searchStatsEl);
  }
  function updateSearchStats(){
    ensureSearchUI();
    const active = containers[state.activeKey];
    if(!active || !searchStatsEl){
        if(searchStatsEl) searchStatsEl.textContent='';
        return;
    }
    const visible = active.querySelectorAll('.vacancy-card').length;
    const total   = state[state.activeKey].total || visible;
    const q = (searchInput?.value||'').trim();
    searchStatsEl.textContent = q ? (visible===0 ? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`) : '';
  }

  function abortCurrent(){
    if(currentController){ try{ currentController.abort(); }catch{} }
    currentController = new AbortController();
    return currentController;
  }
  
  function keyFromTargetId(targetId){
    if (targetId.endsWith('-main'))  return 'main';
    if (targetId.endsWith('-maybe')) return 'maybe';
    return 'other';
  }
  function clearContainer(el){
    if(!el) return;
    const lm=el.querySelector('.load-more-wrap');
    el.innerHTML='';
    if(lm) el.appendChild(lm);
  }
  function hideLoadMore(container){
    updateLoadMore?.(container, false);
    const lm=container?.querySelector('.load-more-wrap');
    if(lm) lm.remove();
  }
  function pinLoadMoreToBottom(container){
    const wrap=container?.querySelector('.load-more-wrap');
    if(wrap) container.appendChild(wrap);
  }

  function buildCategoryUrl(key, limit, offset, query){
    const p = new URLSearchParams();
    p.set('select', '*');
    p.set('status', `eq.${STATUSES.NEW}`);
    p.set('order', 'timestamp.desc');
    p.set('limit', String(limit));
    p.set('offset', String(offset));

    if (key === 'main') p.set('category', `eq.${CATEGORIES.MAIN}`);
    else if (key === 'maybe') p.set('category', `eq.${CATEGORIES.MAYBE}`);
    else p.set('category', `not.in.("${CATEGORIES.MAIN}","${CATEGORIES.MAYBE}")`);

    const q = (query || '').trim();
    if (q && Array.isArray(SEARCH_FIELDS) && SEARCH_FIELDS.length){
      const orExpr = '(' + SEARCH_FIELDS.map(f => `${f}.ilike.*${q}*`).join(',') + ')';
      p.set('or', orExpr);
    }
    return `${CFG.SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;
  }

  async function fetchCountsAll(query){
    const fetchCount = async (key) => {
        const p = new URLSearchParams();
        p.set('select', 'id');
        p.set('status', `eq.${STATUSES.NEW}`);
        p.set('limit', '1');
        
        if (key === 'main') p.set('category', `eq.${CATEGORIES.MAIN}`);
        else if (key === 'maybe') p.set('category', `eq.${CATEGORIES.MAYBE}`);
        else p.set('category', `not.in.("${CATEGORIES.MAIN}","${CATEGORIES.MAYBE}")`);

        const q = (query || '').trim();
        if (q && Array.isArray(SEARCH_FIELDS) && SEARCH_FIELDS.length){
          const orExpr = '(' + SEARCH_FIELDS.map(f => `${f}.ilike.*${q}*`).join(',') + ')';
          p.set('or', orExpr);
        }
        
        const url = `${CFG.SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;
        const resp = await fetchWithRetry(url, {
          headers: createSupabaseHeaders({ prefer: 'count=exact' })
        }, RETRY_OPTIONS);
        if(!resp.ok) throw new Error('count failed');
        return parseTotal(resp);
    };
    try {
      const [cMain, cMaybe, cOther] = await Promise.all([
        fetchCount('main', query),
        fetchCount('maybe', query),
        fetchCount('other', query),
      ]);
      state.main.total  = cMain;  counts.main.textContent  = `(${cMain})`;
      state.maybe.total = cMaybe; counts.maybe.textContent = `(${cMaybe})`;
      state.other.total = cOther; counts.other.textContent = `(${cOther})`;
    } catch(e) { console.warn('counts err', e); }
  }

  vacanciesContent?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'apply')    openLink(btn.dataset.url);
    if (action === 'favorite') updateStatus(btn.dataset.id, STATUSES.FAVORITE);
    if (action === 'delete')   updateStatus(btn.dataset.id, STATUSES.DELETED);
  });

  async function updateStatus(id, newStatus){
    if (!id) return;
    const isFavorite = newStatus === STATUSES.FAVORITE;
    
    if (isFavorite) {
        const ok = await showCustomConfirm('Добавить в избранное?');
        if (!ok) return;
    }
    
    const cardEl = document.querySelector(`#card-${CSS.escape(id)}`);
    if (!cardEl) return;
    
    cardEl.style.transition = 'opacity .3s, transform .3s, max-height .3s, margin .3s, padding .3s, border-width .3s';
    cardEl.style.opacity = '0';
    cardEl.style.transform = 'scale(0.95)';
    cardEl.style.maxHeight = '0px';
    cardEl.style.paddingTop = '0';
    cardEl.style.paddingBottom = '0';
    cardEl.style.marginTop = '0';
    cardEl.style.marginBottom = '0';
    cardEl.style.borderWidth = '0';
    
    const parent = cardEl.parentElement;
    const nextSibling = cardEl.nextElementSibling;
    
    const onUndo = () => {
        parent.insertBefore(cardEl, nextSibling);
        requestAnimationFrame(() => {
            cardEl.style.opacity = '1';
            cardEl.style.transform = 'scale(1)';
            cardEl.style.maxHeight = '500px';
            cardEl.style.paddingTop = '';
            cardEl.style.paddingBottom = '';
            cardEl.style.marginTop = '';
            cardEl.style.marginBottom = '';
            cardEl.style.borderWidth = '';
        });
    };
    
    uiToast(isFavorite ? 'Добавлено в избранное' : 'Вакансия удалена', {
      timeout: 5000,
      onUndo: onUndo,
      onTimeout: async () => {
          try {
            cardEl.remove();
            const url = `${CFG.SUPABASE_URL}/rest/v1/vacancies?id=eq.${encodeURIComponent(id)}`;
            const resp = await fetchWithRetry(url, {
              method: 'PATCH',
              headers: createSupabaseHeaders({ prefer: 'return=minimal' }),
              body: JSON.stringify({ status: newStatus }),
            }, RETRY_OPTIONS);
            if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
            
            const k = state.activeKey;
            if (state[k].total > 0) state[k].total -= 1;
            counts[k].textContent = `(${state[k].total})`;
            if (parent && parent.querySelectorAll('.vacancy-card').length === 0) {
                renderEmptyState(parent, '-- Пусто в этой категории --');
            }
          } catch(err) {
            safeAlert('Не удалось выполнить действие.');
            onUndo();
          }
      }
    });
  }

  async function fetchNext(key, isInitialLoad = false) {
    const st = state[key];
    const container = containers[key];
    if (!container || st.busy) return;
    st.busy = true;

    if (st.offset === 0 && !isInitialLoad) {
        container.innerHTML = '<div class="empty-list"><div class="retro-spinner-inline"></div> Загрузка...</div>';
    }

    const url = buildCategoryUrl(key, PAGE_SIZE_MAIN || 10, st.offset, state.query);
    const controller = abortCurrent();

    try {
      const resp = await fetchWithRetry(url, {
        headers: createSupabaseHeaders({ prefer: 'count=exact' }),
        signal: controller.signal
      }, RETRY_OPTIONS);
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      const total = parseTotal(resp);
      if (Number.isFinite(total)){ st.total = total; counts[key].textContent = `(${total})`; }

      const items = await resp.json();
      
      if (st.offset === 0) {
          clearContainer(container);
      }

      if (items.length === 0) {
        if (st.offset === 0) {
            const message = state.query ? 'По вашему запросу ничего не найдено' : '-- Пусто в этой категории --';
            renderEmptyState(container, message);
        }
      } else {
        const frag = document.createDocumentFragment();
        for (const it of items) frag.appendChild(createVacancyCard(it, { pageType: 'main', searchQuery: state.query }));
        container.appendChild(frag);
        pinLoadMoreToBottom(container);

        const { btn } = ensureLoadMore(container, () => fetchNext(key));
        st.offset += items.length;
        const hasMore = st.offset < st.total;
        updateLoadMore(container, hasMore);
        if (btn) btn.disabled = !hasMore;
      }
      st.loadedOnce = true;
      st.loadedForQuery = state.query;
      updateSearchStats();
    } catch(e) {
      if (e.name === 'AbortError') return;
      console.error('Load error:', e);
      if (st.offset === 0) {
        renderError(container, e.message, () => refetchFromZeroSmooth(key));
      }
    } finally {
      st.busy = false;
      if (isInitialLoad) {
          hideLoader();
      }
      document.dispatchEvent(new CustomEvent(`feed:loaded`));
    }
  }
  
  async function refetchFromZeroSmooth(key) {
    const st = state[key];
    const container = containers[key];
    if (!container || st.busy) return;
    st.offset = 0;
    await fetchNext(key, false);
  }

  async function seamlessSearch(key) {
      const st = state[key];
      const container = containers[key];
      if (!container || st.busy) return;
      
      st.busy = true;
      st.offset = 0;
      
      container.classList.add('loading-seamless');

      const url = buildCategoryUrl(key, PAGE_SIZE_MAIN || 10, 0, state.query);
      const controller = abortCurrent();

      try {
          const resp = await fetchWithRetry(url, {
              headers: createSupabaseHeaders({ prefer: 'count=exact' }),
              signal: controller.signal
          }, RETRY_OPTIONS);
          if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

          const total = parseTotal(resp);
          if (Number.isFinite(total)) { st.total = total; counts[key].textContent = `(${total})`; }

          const items = await resp.json();
          
          const frag = document.createDocumentFragment();
          if (items.length === 0) {
              const message = state.query ? 'По вашему запросу ничего не найдено' : '-- Пусто в этой категории --';
              const emptyEl = document.createElement('div');
              renderEmptyState(emptyEl, message);
              frag.appendChild(emptyEl.firstElementChild);
          } else {
              items.forEach(it => frag.appendChild(createVacancyCard(it, { pageType: 'main', searchQuery: state.query })));
              
              st.offset = items.length;
              const hasMore = st.offset < total;
              const { wrap } = ensureLoadMore(document.createElement('div'), () => fetchNext(key));
              updateLoadMore(wrap, hasMore);
              frag.appendChild(wrap);
          }
          container.replaceChildren(frag);

          st.loadedOnce = true;
          st.loadedForQuery = state.query;
          updateSearchStats();
      } catch (e) {
          if (e.name !== 'AbortError') {
              renderError(container, e.message, () => seamlessSearch(key));
          }
      } finally {
          st.busy = false;
          container.classList.remove('loading-seamless');
      }
  }

  const onSearch = debounce(() => {
    state.query = (searchInput?.value || '').trim();
    fetchCountsAll(state.query);
    seamlessSearch(state.activeKey);
    ['main', 'maybe', 'other'].forEach(key => {
      if (key !== state.activeKey) {
        const st = state[key];
        st.loadedOnce = false;
        st.loadedForQuery = '';
        st.offset = 0;
        clearContainer(containers[key]);
        hideLoadMore(containers[key]);
      }
    });
  }, 300);
  
  searchInput?.addEventListener('input', () => {
      searchInputWrapper?.classList.toggle('has-text', searchInput.value.length > 0);
      onSearch();
  });
  searchClearBtn?.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchInputWrapper?.classList.remove('has-text');
        onSearch();
        searchInput.focus();
      }
  });

  function showOnly(targetId){
    vacancyLists.forEach(list=>{
      list.classList.remove('active');
      list.style.display='none';
    });
    const target=document.getElementById(targetId);
    if(target){ target.classList.add('active'); target.style.display=''; }
  }
  
  async function activateTabByTarget(targetId){
    const key = keyFromTargetId(targetId);
    state.activeKey = key;

    tabButtons.forEach(b => {
      const active = b.dataset.target === targetId;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    showOnly(targetId);
    updateSearchStats();

    const st = state[key];
    if (!st.loadedOnce || st.loadedForQuery !== state.query) {
       await fetchNext(key, false);
    }
  }

  async function bulkDeleteCategory(key) {
    const ok = await showCustomConfirm('Удалить ВСЕ вакансии в этой категории?');
    if(!ok) return;

    try {
        const p = new URLSearchParams();
        p.set('status', `eq.${STATUSES.NEW}`);
        if (key === 'main') p.set('category', `eq.${CATEGORIES.MAIN}`);
        else if (key === 'maybe') p.set('category', `eq.${CATEGORIES.MAYBE}`);
        else p.set('category', `not.in.("${CATEGORIES.MAIN}","${CATEGORIES.MAYBE}")`);

        const url = `${CFG.SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;
        const resp = await fetchWithRetry(url, {
            method: 'PATCH',
            headers: createSupabaseHeaders({ prefer: 'return=minimal' }),
            body: JSON.stringify({ status: STATUSES.DELETED }),
        }, RETRY_OPTIONS);

        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

        clearContainer(containers[key]);
        state[key] = { offset: 0, total: 0, busy: false, loadedOnce: true, loadedForQuery: state.query };
        counts[key].textContent = '(0)';
        hideLoadMore(containers[key]);
        renderEmptyState(containers[key], '-- Пусто в этой категории --');
        uiToast('Категория очищена');

    } catch(e) {
        console.error(e);
        safeAlert('Ошибка: не получилось очистить категорию.');
    }
  }

  tabButtons.forEach(btn=>{
    let pressTimer = null;
    let isHeld = false;
    const holdMs = 700;

    const start = (e) => {
      isHeld = false;
      btn.classList.add('pressing');
      pressTimer = setTimeout(() => {
        isHeld = true;
        btn.classList.remove('pressing');
        const key = keyFromTargetId(btn.dataset.target || '');
        bulkDeleteCategory(key);
      }, holdMs);
    };
    
    const cancel = (e) => {
      btn.classList.remove('pressing');
      clearTimeout(pressTimer);
    };

    const clickHandler = (e) => {
        if (isHeld) {
            e.preventDefault();
            e.stopPropagation();
        } else {
            const targetId = btn.dataset.target;
            if(targetId) activateTabByTarget(targetId);
        }
    };

    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', cancel);
    btn.addEventListener('pointerleave', cancel);
    btn.addEventListener('click', clickHandler);
  });

  async function init() {
    Object.keys(containers).forEach(k => {
      containers[k].style.display = (k === state.activeKey) ? '' : 'none';
    });

    tabButtons.forEach(b => {
      const active = (b.dataset.target || '').endsWith('-main');
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    
    setupPullToRefresh({
        onRefresh: () => refetchFromZeroSmooth(state.activeKey),
        refreshEventName: 'feed:loaded',
        container: document.documentElement
    });
    
    showLoader();
    await fetchCountsAll('');
    await fetchNext('main', true);
    
    setTimeout(() => {
        ['maybe', 'other'].forEach(k => {
            if (!state[k].loadedOnce) {
                fetchNext(k, false);
            }
        });
    }, 500);

    updateSearchStats();
  }
  
  function handlePageVisibility() {
      if (document.visibilityState === 'visible') {
          if (localStorage.getItem('needs-refresh-main') === 'true') {
              localStorage.removeItem('needs-refresh-main');
              uiToast('Обновление ленты...');
              fetchCountsAll(state.query);
              refetchFromZeroSmooth(state.activeKey);
          }
      }
  }
  document.addEventListener('visibilitychange', handlePageVisibility);

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
