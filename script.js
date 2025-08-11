/* script.js — главная страница
 * ИСПРАВЛЕНО: Полностью исправлен баг с зависанием "pull-to-refresh".
 */

(function () {
  'use strict';

  // -------- Конфиг / утилиты --------
  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    PAGE_SIZE_MAIN,
    RETRY_OPTIONS,
    SEARCH_FIELDS,
  } = window.APP_CONFIG || {};

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
    setupPullToRefresh
  } = window.utils || {};

  // -------- DOM --------
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

  // Кастомный confirm
  const confirmOverlay   = document.getElementById('custom-confirm-overlay');
  const confirmText      = document.getElementById('custom-confirm-text');
  const confirmOkBtn     = document.getElementById('confirm-btn-ok');
  const confirmCancelBtn = document.getElementById('confirm-btn-cancel');
  function showCustomConfirm(message){
    return new Promise(res=>{
      if(!confirmOverlay) return res(window.confirm(message));
      confirmText.textContent = message;
      confirmOverlay.classList.remove('hidden');
      const close=(result)=>{confirmOverlay.classList.add('hidden');confirmOkBtn.onclick=null;confirmCancelBtn.onclick=null;res(result);};
      confirmOkBtn.onclick=()=>close(true);
      confirmCancelBtn.onclick=()=>close(false);
    });
  }

  // -------- Состояние --------
  const CAT_NAME = { main:'ТОЧНО ТВОЁ', maybe:'МОЖЕТ БЫТЬ' };
  let currentController=null;

  const state = {
    query: '',
    activeKey: 'main',
    main:  { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' },
    maybe: { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' },
    other: { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' },
  };

  // --- Функции управления загрузчиком ---
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

  // -------- Статистика поиска --------
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

  // -------- Abort helper --------
  function abortCurrent(){
    if(currentController){ try{ currentController.abort(); }catch{} }
    currentController = new AbortController();
    return currentController;
  }

  // -------- Helpers --------
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

  // -------- API URLs --------
  function buildCategoryUrl(key, limit, offset, query){
    const p=new URLSearchParams();
    p.set('select','*');
    p.set('status','eq.new');
    p.set('order','timestamp.desc');
    p.set('limit', String(limit));
    p.set('offset', String(offset));

    if(key==='main') p.set('category', `eq.${CAT_NAME.main}`);
    else if(key==='maybe') p.set('category', `eq.${CAT_NAME.maybe}`);
    else p.set('category', `not.in.("${CAT_NAME.main}","${CAT_NAME.maybe}")`);

    const q=(query||'').trim();
    if(q && Array.isArray(SEARCH_FIELDS) && SEARCH_FIELDS.length){
      const orExpr = '('+SEARCH_FIELDS.map(f=>`${f}.ilike.*${q}*`).join(',')+')';
      p.set('or', orExpr);
    }
    return `${SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;
  }

  // -------- Счётчики --------
  async function fetchCountsAll(query){
    const fetchCount = async (key) => {
        const p=new URLSearchParams();
        p.set('select','id');
        p.set('status','eq.new');
        p.set('limit','1');
        if(key==='main') p.set('category', `eq.${CAT_NAME.main}`);
        else if(key==='maybe') p.set('category', `eq.${CAT_NAME.maybe}`);
        else p.set('category', `not.in.("${CAT_NAME.main}","${CAT_NAME.maybe}")`);
        const q=(query||'').trim();
        if(q && Array.isArray(SEARCH_FIELDS) && SEARCH_FIELDS.length){
          const orExpr = '('+SEARCH_FIELDS.map(f=>`${f}.ilike.*${q}*`).join(',')+')';
          p.set('or', orExpr);
        }
        const url = `${SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;
        const resp = await fetchWithRetry(url,{
          headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}`, Prefer:'count=exact' }
        }, RETRY_OPTIONS);
        if(!resp.ok) throw new Error('count failed');
        return parseTotal(resp);
    };
    try{
      const [cMain,cMaybe,cOther] = await Promise.all([
        fetchCount('main', query),
        fetchCount('maybe', query),
        fetchCount('other', query),
      ]);
      state.main.total  = cMain;  counts.main.textContent  = `(${cMain})`;
      state.maybe.total = cMaybe; counts.maybe.textContent = `(${cMaybe})`;
      state.other.total = cOther; counts.other.textContent = `(${cOther})`;
    }catch(e){ console.warn('counts err', e); }
  }

  // -------- Действия по карточкам --------
  vacanciesContent?.addEventListener('click',(e)=>{
    const btn=e.target.closest('[data-action]');
    if(!btn) return;
    const action=btn.dataset.action;
    if(action==='apply')    openLink(btn.dataset.url);
    if(action==='favorite') updateStatus(btn.dataset.id,'favorite');
    if(action==='delete')   updateStatus(btn.dataset.id,'deleted');
  });

  async function updateStatus(id,newStatus){
    if(!id) return;
    const isFavorite = newStatus === 'favorite';
    const ok = await showCustomConfirm(isFavorite ? 'Добавить в избранное?' : 'Удалить из ленты?');
    if(!ok) return;

    try{
      const url = `${SUPABASE_URL}/rest/v1/vacancies?id=eq.${encodeURIComponent(id)}`;
      const resp = await fetchWithRetry(url,{
        method:'PATCH',
        headers:{
          apikey:SUPABASE_ANON_KEY,
          Authorization:`Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type':'application/json',
          Prefer:'return=minimal',
        },
        body:JSON.stringify({ status:newStatus }),
      }, RETRY_OPTIONS);
      if(!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

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
    }catch(err){
      console.error(err);
      safeAlert('Не удалось выполнить действие.');
    }
  }

  // -------- Загрузка порций --------
  async function fetchNext(key, isInitialLoad = false) {
    const st=state[key];
    const container=containers[key];
    if(!container || st.busy) return;
    st.busy=true;

    if (isInitialLoad) {
        showLoader();
    } else if (st.offset === 0) {
        container.innerHTML = '<p class="empty-list">Загрузка...</p>';
    }

    const url = buildCategoryUrl(key, PAGE_SIZE_MAIN||10, st.offset, state.query);
    const controller = abortCurrent();

    try{
      const resp = await fetchWithRetry(url,{
        headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}`, Prefer:'count=exact' },
        signal: controller.signal
      }, RETRY_OPTIONS);
      if(!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      const total=parseTotal(resp);
      if(Number.isFinite(total)){ st.total=total; counts[key].textContent=`(${total})`; }

      const items=await resp.json();

      if (st.offset === 0) clearContainer(container);

      if (items.length===0) {
        if (st.offset === 0) renderEmptyState(container,'-- Пусто в этой категории --');
      } else {
        const frag=document.createDocumentFragment();
        for(const it of items) frag.appendChild(
            createVacancyCard(it, { pageType: 'main', searchQuery: state.query })
        );
        container.appendChild(frag);
        pinLoadMoreToBottom(container);

        const {btn}=ensureLoadMore(container,()=>fetchNext(key));
        st.offset += items.length;
        const hasMore = st.offset < st.total;
        updateLoadMore(container,hasMore);
        if(btn) btn.disabled=!hasMore;
      }
      st.loadedOnce=true;
      st.loadedForQuery=state.query;
      updateSearchStats();
    }catch(e){
      if(e.name==='AbortError') return;
      console.error('Load error:',e);
      if (st.offset === 0) {
        renderError(container,e.message,()=>fetchNext(key, isInitialLoad));
      }
    }finally{
      st.busy=false;
      if (isInitialLoad) {
        hideLoader();
      }
    }
  }

  // -------- ИСПРАВЛЕННАЯ Мягкая перезагрузка (без полноэкранного лоадера) --------
  async function refetchFromZeroSmooth(key){
    const st=state[key];
    const container=containers[key];
    if(!container || st.busy) return;

    abortCurrent();
    st.busy=true;
    st.offset = 0;

    const keepHeight = container.offsetHeight;
    if (keepHeight) container.style.minHeight = `${keepHeight}px`;
    container.innerHTML = '<p class="empty-list">Обновление...</p>';

    try {
        const url = buildCategoryUrl(key, PAGE_SIZE_MAIN || 10, 0, state.query);
        const resp = await fetchWithRetry(url, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: 'count=exact' },
            signal: currentController.signal
        });
        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

        const total = parseTotal(resp);
        if (Number.isFinite(total)) { st.total = total; counts[key].textContent = `(${total})`; }

        const items = await resp.json();
        clearContainer(container);

        if (items.length === 0) {
            renderEmptyState(container, '-- Пусто в этой категории --');
        } else {
            const frag = document.createDocumentFragment();
            for (const it of items) frag.appendChild(
                createVacancyCard(it, { pageType: 'main', searchQuery: state.query })
            );
            container.appendChild(frag);
            pinLoadMoreToBottom(container);

            st.offset = items.length;
            const hasMore = st.offset < st.total;
            const { btn } = ensureLoadMore(container, () => fetchNext(key));
            updateLoadMore(container, hasMore);
            if (btn) btn.disabled = !hasMore;
        }
        st.loadedOnce = true;
        st.loadedForQuery = state.query;
        updateSearchStats();
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('Refetch error:', e);
            renderError(container, e.message, () => refetchFromZeroSmooth(key));
        }
    } finally {
        st.busy = false;
        container.style.minHeight = '';
        document.dispatchEvent(new CustomEvent('feed:loaded'));
        flashRefreshed(container);
    }
  }

  // -------- Поиск --------
  const onSearch = debounce(async ()=>{
    state.query = (searchInput?.value||'').trim();
    await fetchCountsAll(state.query);
    await refetchFromZeroSmooth(state.activeKey);
    ['main','maybe','other'].forEach(key=>{
      if(key!==state.activeKey){
        const st=state[key];
        st.loadedOnce=false;
        st.loadedForQuery='';
        st.offset = 0;
        clearContainer(containers[key]);
        hideLoadMore(containers[key]);
      }
    });
  }, 300);
  searchInput?.addEventListener('input', onSearch);

  // -------- Переключение вкладок --------
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

    tabButtons.forEach(b=>{
      const active = b.dataset.target===targetId;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true':'false');
    });

    showOnly(targetId);
    updateSearchStats();

    const st=state[key];
    if(!st.loadedOnce || st.loadedForQuery !== state.query) {
       await fetchNext(key);
    }
  }

  // --- ВОЗВРАЩЕН ДОЛГИЙ ТАП ---
  async function bulkDeleteCategory(key) {
    const ok = await showCustomConfirm('Удалить ВСЕ вакансии в этой категории?');
    if(!ok) return;

    try {
        const p = new URLSearchParams();
        p.set('status', 'eq.new');
        if (key === 'main') p.set('category', `eq.${CAT_NAME.main}`);
        else if (key === 'maybe') p.set('category', `eq.${CAT_NAME.maybe}`);
        else p.set('category', `not.in.("${CAT_NAME.main}","${CAT_NAME.maybe}")`);

        const url = `${SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;
        const resp = await fetchWithRetry(url, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
            },
            body: JSON.stringify({ status: 'deleted' }),
        }, RETRY_OPTIONS);

        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

        // Обновление UI
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

    // Логика долгого нажатия
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
  // --- КОНЕЦ БЛОКА С ДОЛГИМ ТАПОМ ---

  // -------- Вспышка после обновления --------
  function flashRefreshed(container){
    if(!container) return;
    container.classList.remove('refreshed-flash');
    void container.offsetWidth;
    container.classList.add('refreshed-flash');
  }

  // -------- Префетч скрытых вкладок --------
  async function prefetchHidden(){
    await fetchCountsAll(state.query);
    ['maybe','other'].forEach(k=>{
      if(!containers[k].querySelector('.vacancy-card')){
        fetchNext(k);
      }
    });
  }

  // -------- Инициализация --------
  async function init(){
    Object.keys(containers).forEach(k=>{
      containers[k].style.display = (k===state.activeKey) ? '' : 'none';
    });

    tabButtons.forEach(b=>{
      const active=(b.dataset.target||'').endsWith('-main');
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true':'false');
    });

    setupPullToRefresh({
        onRefresh: () => refetchFromZeroSmooth(state.activeKey),
        refreshEventName: 'feed:loaded'
    });

    await fetchNext('main', true); // Передаем флаг, что это самая первая загрузка
    await prefetchHidden();
    updateSearchStats();
  }

  document.readyState==='loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

})();
