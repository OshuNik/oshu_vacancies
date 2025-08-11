/* script.js — главная страница
 * ИСПРАВЛЕНО: Устранён баг с зависанием "Обновление..." при поиске.
 */
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
    createSupabaseHeaders
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
    if (mainHeader) mainHeader.classList.add('hidden');
    if (vacanciesContent) vacanciesContent.classList.add('hidden');
    if (document.body) document.body.style.overflow = 'hidden';
  }
  function hideLoader() {
    if (loader) loader.classList.add('hidden');
    if (mainHeader) mainHeader.classList.remove('hidden');
    if (vacanciesContent) vacanciesContent.classList.remove('hidden');
    if (document.body) document.body.style.overflow = '';
  }

  let searchStatsEl=null;
  function ensureSearchUI(){
    const searchContainer = document.getElementById('search-container');
    if(!searchContainer || searchStatsEl) return;
    searchStatsEl=document.createElement('div');
    searchStatsEl.className='search-stats';
    searchContainer.appendChild(searchStatsEl);
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
  
  function parseTotal(resp){
    const cr=resp.headers.get('content-range');
    if(!cr||!cr.includes('/')) return 0;
    const total=cr.split('/').pop();
    return Number(total)||0;
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
    const ok = await showCustomConfirm(isFavorite ? 'Добавить в избранное?' : 'Удалить из ленты?');
    if (!ok) return;

    try {
      const url = `${CFG.SUPABASE_URL}/rest/v1/vacancies?id=eq.${encodeURIComponent(id)}`;
      const resp = await fetchWithRetry(url, {
        method: 'PATCH',
        headers: createSupabaseHeaders({ prefer: 'return=minimal' }),
        body: JSON.stringify({ status: newStatus }),
      }, RETRY_OPTIONS);
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      uiToast(isFavorite ? 'Добавлено в избранное' : 'Вакансия удалена');

      document.querySelectorAll(`#card-${CSS.escape(id)}`).forEach((el) => {
        el.style.transition = 'opacity .2s ease-out, transform .2s ease-out';
        el.style.opacity = '0';
        el.style.transform = 'scale(0.95)';
        setTimeout(() => el.remove(), 200);
      });

      const k = state.activeKey;
      if (state[k].total > 0) state[k].total -= 1;
      counts[k].textContent = `(${state[k].total})`;
      const cont = containers[k];
      if (cont && cont.querySelectorAll('.vacancy-card').length === 0) {
        hideLoadMore(cont);
        renderEmptyState(cont, '-- Пусто в этой категории --');
      }
      updateSearchStats();
    } catch(err) {
      console.error(err);
      safeAlert('Не удалось выполнить действие.');
    }
  }

  async function fetchNext(key, isInitialLoad = false) {
    const st = state[key];
    const container = containers[key];
    if (!container || st.busy) return;
    st.busy = true;

    // ИЗМЕНЕНИЕ: Показываем индикатор загрузки только если он нужен
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
      
      // ИЗМЕНЕНИЕ: Очищаем контейнер только перед вставкой новых элементов
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
      document.dispatchEvent(new CustomEvent(`feed:loaded:${key}`));
    }
  }
  
  // ИЗМЕНЕНИЕ: Упрощенная и более надежная функция "мягкой" перезагрузки
  async function refetchFromZeroSmooth(key) {
    const st = state[key];
    const container = containers[key];
    if (!container || st.busy) return;

    // Сбрасываем пагинацию и просто вызываем fetchNext,
    // который сам корректно покажет индикатор загрузки.
    st.offset = 0;
    
    await fetchNext(key, false);
    
    document.dispatchEvent(new CustomEvent('feed:loaded'));
  }

  const onSearch = debounce(async () => {
    state.query = (searchInput?.value || '').trim();
    await fetchCountsAll(state.query);
    await refetchFromZeroSmooth(state.activeKey);
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
  searchInput?.addEventListener('input', onSearch);

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
        updateSearchStats();
        uiToast('Категория очищена');

    } catch(e) {
        console.error(e);
        safeAlert('Ошибка: не получилось очистить категорию.');
    }
  }

  tabButtons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const targetId = btn.dataset.target;
      if(!targetId) return;
      activateTabByTarget(targetId);
    });

    let pressTimer = null;
    const holdMs = 700;
    const start = () => {
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        const key = keyFromTargetId(btn.dataset.target || '');
        bulkDeleteCategory(key);
      }, holdMs);
    };
    const cancel = () => { clearTimeout(pressTimer); };

    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', cancel);
    btn.addEventListener('pointerleave', cancel);
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
        refreshEventName: 'feed:loaded'
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
