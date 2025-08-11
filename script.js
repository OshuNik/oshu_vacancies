/* script.js — главная страница
 * ИСПОЛЬЗУЕТ ОБЩИЕ ФУНКЦИИ из utils.js для рендеринга и pull-to-refresh
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
    openLink,
    fetchWithRetry,
    renderEmptyState,
    renderError,
    ensureLoadMore,
    updateLoadMore,
    createVacancyCard, // Используем общую функцию
    setupPullToRefresh // Используем общую функцию
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
  const searchContainer = document.getElementById('search-container');
  const vacanciesContent= document.getElementById('vacancies-content');

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
      const close=()=>{confirmOverlay.classList.add('hidden');confirmOkBtn.onclick=null;confirmCancelBtn.onclick=null;};
      confirmOkBtn.onclick=()=>{close();res(true);};
      confirmCancelBtn.onclick=()=>{close();res(false);};
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

  // -------- Статистика поиска --------
  let searchStatsEl=null;
  function ensureSearchUI(){
    if(!searchContainer) return;
    if(!searchStatsEl){
      searchStatsEl=document.createElement('div');
      searchStatsEl.className='search-stats';
      searchContainer.appendChild(searchStatsEl);
    }
  }
  function updateSearchStats(){
    ensureSearchUI();
    const active = containers[state.activeKey];
    if(!active){ searchStatsEl.textContent=''; return; }
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
    if (targetId.endsWith('-other')) return 'other';
    if (/main$/i.test(targetId))  return 'main';
    if (/maybe$/i.test(targetId)) return 'maybe';
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
  async function fetchCount(key, query){
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
  }
  async function fetchCountsAll(query){
    try{
      const [cMain,cMaybe,cOther] = await Promise.all([
        fetchCount('main',query),
        fetchCount('maybe',query),
        fetchCount('other',query),
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
    const ok = await showCustomConfirm(newStatus==='deleted' ? 'Удалить вакансию из ленты?' : 'Добавить вакансию в избранное?');
    if(!ok) return;
    try{
      const url = `${SUPABASE_URL}/rest/v1/vacancies?id=eq.${encodeURIComponent(id)}`;
      const resp = await fetchWithRetry(url,{
        method:'PATCH',
        headers:{
          apikey:SUPABASE_ANON_KEY,
          Authorization:`Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type':'application/json',
          Prefer:'return=representation',
        },
        body:JSON.stringify({ status:newStatus }),
      }, RETRY_OPTIONS);
      if(!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      document.querySelectorAll(`#card-${CSS.escape(id)}`).forEach((el) => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 150);
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
      safeAlert('Не удалось выполнить действие. Повторите позже.');
    }
  }

  // -------- Загрузка порций --------
  async function fetchNext(key){
    const st=state[key];
    const container=containers[key];
    if(!container || st.busy) return;
    st.busy=true;

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

      if (st.offset===0 && (total===0 || items.length===0)) {
        clearContainer(container);
        hideLoadMore(container);
        renderEmptyState(container,'-- Пусто в этой категории --');
        st.loadedOnce=true; st.loadedForQuery=state.query;
        updateSearchStats();
        return;
      }

      const frag=document.createDocumentFragment();
      // ИСПОЛЬЗУЕМ ОБЩУЮ ФУНКЦИЮ
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

      if(state.activeKey===key) updateSearchStats();
      st.loadedOnce=true;
      st.loadedForQuery=state.query;
    }catch(e){
      if(e.name==='AbortError') return;
      console.error('Load error:',e);
      renderError(container,e.message,()=>fetchNext(key));
      pinLoadMoreToBottom(container);
    }finally{
      st.busy=false;
    }
  }

  // -------- Мягкая перезагрузка текущей вкладки --------
  async function refetchFromZeroSmooth(key){
    const st=state[key], container=containers[key];
    if(!container) return;

    abortCurrent();
    st.busy=true;

    const keepHeight = container.offsetHeight;
    container.style.minHeight = keepHeight ? `${keepHeight}px` : '';

    const url = buildCategoryUrl(key, PAGE_SIZE_MAIN||10, 0, state.query);
    const controller = currentController;

    try{
      const resp = await fetchWithRetry(url,{
        headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}`, Prefer:'count=exact' },
        signal: controller.signal
      }, RETRY_OPTIONS);
      if(!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      const total=parseTotal(resp);
      const items=await resp.json();

      const frag=document.createDocumentFragment();
      // ИСПОЛЬЗУЕМ ОБЩУЮ ФУНКЦИЮ
      for(const it of items) frag.appendChild(
          createVacancyCard(it, { pageType: 'main', searchQuery: state.query })
      );

      const lm=container.querySelector('.load-more-wrap');
      container.replaceChildren(frag);
      if(lm) container.appendChild(lm);

      st.offset=items.length;
      st.total=Number.isFinite(total)?total:items.length;
      st.loadedOnce=true;
      st.loadedForQuery=state.query;

      if(counts[key]) counts[key].textContent=`(${st.total})`;

      if (st.total === 0) {
        hideLoadMore(container);
        renderEmptyState(container,'-- Пусто в этой категории --');
      } else {
        const {btn}=ensureLoadMore(container,()=>fetchNext(key));
        const hasMore = st.offset < st.total;
        updateLoadMore(container,hasMore);
        if(btn) btn.disabled=!hasMore;
        pinLoadMoreToBottom(container);
      }

      if(state.activeKey===key) updateSearchStats();

      flashRefreshed(container);
      document.dispatchEvent(new CustomEvent('feed:loaded'));
    }catch(e){
      if(e.name!=='AbortError'){
        console.error('Refetch error:',e);
        renderError(container,e.message,()=>refetchFromZeroSmooth(key));
        pinLoadMoreToBottom(container);
        document.dispatchEvent(new CustomEvent('feed:loaded'));
      }
    }finally{
      container.style.minHeight='';
      st.busy=false;
    }
  }

  // -------- Поиск --------
  const onSearch = debounce(async ()=>{
    state.query = (searchInput?.value||'').trim();
    fetchCountsAll(state.query);
    await refetchFromZeroSmooth(state.activeKey);
    ['main','maybe','other'].forEach(key=>{
      if(key!==state.activeKey){
        const st=state[key];
        st.loadedOnce=false; st.loadedForQuery='';
        hideLoadMore(containers[key]);
      }
    });
  }, 220);
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
    if(st.loadedOnce && st.loadedForQuery===state.query) return;

    if(containers[key].querySelector('.vacancy-card')){
      await refetchFromZeroSmooth(key);
    }else{
      await fetchNext(key);
    }
  }
  tabButtons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const targetId = btn.dataset.target;
      if(!targetId) return;
      activateTabByTarget(targetId);
    });

    // Долгий тап — массовое удаление категории
    let pressTimer=null; const holdMs=700;
    const start=()=>{
      clearTimeout(pressTimer);
      pressTimer=setTimeout(async ()=>{
        const key = keyFromTargetId(btn.dataset.target||'');
        const ok = await showCustomConfirm('Удалить ВСЕ вакансии в этой категории?');
        if(!ok) return;
        try{
          await bulkSetStatusForCategory(key,'deleted');
          clearContainer(containers[key]);
          state[key]={ offset:0,total:0,busy:false,loadedOnce:false,loadedForQuery:'' };
          counts[key].textContent='(0)';
          hideLoadMore(containers[key]);
          if(state.activeKey===key) updateSearchStats();
          renderEmptyState(containers[key],'-- Пусто в этой категории --');
          safeAlert('Готово: категория очищена.');
        }catch(e){ console.error(e); safeAlert('Ошибка: не получилось удалить категорию.'); }
      }, holdMs);
    };
    const cancel=()=>{ clearTimeout(pressTimer); };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', cancel);
    btn.addEventListener('pointerleave', cancel);
  });

  // -------- Массовое изменение статуса --------
  async function bulkSetStatusForCategory(key,newStatus){
    const p=new URLSearchParams();
    p.set('status','eq.new');
    if(key==='main') p.set('category',`eq.${CAT_NAME.main}`);
    else if(key==='maybe') p.set('category',`eq.${CAT_NAME.maybe}`);
    else p.set('category',`not.in.("${CAT_NAME.main}","${CAT_NAME.maybe}")`);
    const url=`${SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;
    const resp=await fetchWithRetry(url,{
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
  }

  // -------- Вспышка после обновления --------
  (function injectFlashCSS(){
    const style=document.createElement('style');
    style.textContent=`
      @keyframes refreshedFlash { 0%{background:#fffbe6;} 100%{background:transparent;} }
      .refreshed-flash { animation: refreshedFlash .6s ease forwards; }
      .vacancy-text a, .card-summary a { text-decoration: underline; color:#1f6feb; word-break: break-word; }
      .vacancy-text a:hover, .card-summary a:hover { opacity:.85; }
    `;
    document.head.appendChild(style);
  })();
  function flashRefreshed(container){
    if(!container) return;
    container.classList.remove('refreshed-flash');
    void container.offsetWidth;
    container.classList.add('refreshed-flash');
  }

  // -------- Префетч скрытых вкладок --------
  async function prefetchHidden(){
    fetchCountsAll(state.query);
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

    // ИСПОЛЬЗУЕМ ОБЩУЮ ФУНКЦИЮ
    setupPullToRefresh({
        onRefresh: () => refetchFromZeroSmooth(state.activeKey),
        refreshEventName: 'feed:loaded'
    });

    fetchCountsAll(state.query);
    await fetchNext('main');
    prefetchHidden();
    updateSearchStats();
  }

  document.readyState==='loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

})();
