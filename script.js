/* script.js — главная страница
 * — Активные ссылки во всём тексте (включая «вшитые» в Telegram/HTML/Markdown).
 * — Кнопка «Откликнуться» только при наличии apply_url (https:// или tg://).
 * — Вкладки, бесшовный поиск, анимированный pull-to-refresh, счётчики, Load More,
 *   долгий тап по вкладке — массовое удаление категории, кастомный confirm.
 * — ВАЖНО: строки ФОРМАТ/ОПЛАТА/СФЕРА скрываются, если значение «не указано» или пусто.
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
    escapeHtml,
    debounce,
    safeAlert,
    formatTimestamp,
    openLink,
    pickImageUrl,
    fetchWithRetry,
    renderEmptyState,
    renderError,
    ensureLoadMore,
    updateLoadMore,
    highlightText,
  } = window.utils || {};

  // Разрешаем https:// и tg:// в кнопке отклика
  function allowHttpOrTg(url) {
    if (!url) return '';
    try {
      const u = new URL(url, window.location.href);
      if (/^https?:$/.test(u.protocol) || /^tg:$/.test(u.protocol)) return u.href;
      return '';
    } catch { return ''; }
  }

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
  // Loader + верхняя панель
  const loaderEl       = document.getElementById('loader');
  const progressBarEl  = document.getElementById('progress-bar');
  const loaderTextEl   = loaderEl ? loaderEl.querySelector('.loader-text') : null;
  const headerActions  = document.getElementById('header-actions');
  const categoryTabsEl = document.getElementById('category-tabs');

  function setProgress(pct, text){
    try{
      if(progressBarEl){
        const v = Math.max(1, Math.min(100, Number(pct)||0));
        progressBarEl.style.width = v + '%';
      }
      if(text && loaderTextEl){ loaderTextEl.textContent = String(text); }
    }catch{}
  }
  function showLoader(){
    try{
      loaderEl?.classList.remove('hidden');
      searchContainer?.classList.add('hidden');
      categoryTabsEl?.classList.add('hidden');
      vacanciesContent?.classList.add('hidden');
      headerActions?.classList.add('hidden');
      setProgress(10, 'Вакансии загружаются...');
    }catch{}
  }
  function hideLoader(){
    try{
      loaderEl?.classList.add('hidden');
      searchContainer?.classList.remove('hidden');
      categoryTabsEl?.classList.remove('hidden');
      vacanciesContent?.classList.remove('hidden');
      headerActions?.classList.remove('hidden');
      setProgress(0);
    }catch{}
  }

  // -------- Состояние --------
  const state = {
    activeKey: 'main',
    query: '',
    main:  { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' },
    maybe: { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' },
    other: { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' },
  };

  // -------- Поисковая панель: «Найдено: X из Y» --------
  let searchStatsEl;
  function ensureSearchUI(){
    if (!searchStatsEl) {
      searchStatsEl = document.createElement('div');
      searchStatsEl.className = 'search-stats';
      searchStatsEl.setAttribute('role','status');
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
  let currentController;
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
    if(!wrap) return;
    wrap.style.position='sticky';
    wrap.style.bottom='-1px';
    wrap.style.background='linear-gradient(to top, rgba(240,240,240,1), rgba(240,240,240,0.2))';
  }

  // -------- API: counts --------
  async function fetchCount(category, q){
    const p = new URLSearchParams();
    p.set('select','*');
    if(category==='main')  p.set('status','eq.main');
    if(category==='maybe') p.set('status','eq.maybe');
    if(category==='other') p.set('status','eq.other');

    if (q && Array.isArray(SEARCH_FIELDS) && SEARCH_FIELDS.length){
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
      counts.main.textContent  = `(${cMain||0})`;
      counts.maybe.textContent = `(${cMaybe||0})`;
      counts.other.textContent = `(${cOther||0})`;
      state.main.total  = cMain||0;
      state.maybe.total = cMaybe||0;
      state.other.total = cOther||0;
    }catch(e){
      console.warn('fetchCountsAll',e);
    }
  }

  // -------- API: список --------
  function buildQueryParams(key, q){
    const p = new URLSearchParams();
    p.set('select','*');
    p.set('order','timestamp.desc');
    if(key==='main')  p.set('status','eq.main');
    if(key==='maybe') p.set('status','eq.maybe');
    if(key==='other') p.set('status','eq.other');

    if(q && Array.isArray(SEARCH_FIELDS) && SEARCH_FIELDS.length){
      const orExpr = '('+SEARCH_FIELDS.map(f=>`${f}.ilike.*${q}*`).join(',')+')';
      p.set('or', orExpr);
    }
    const limit = PAGE_SIZE_MAIN || 20;
    const from = state[key].offset;
    const to   = from + limit - 1;
    p.set('range', `${from}-${to}`);
    return p.toString();
  }

  async function fetchNext(key){
    const container=containers[key];
    const st=state[key];
    if(!container || st.busy) return;
    st.busy=true;

    try{
      const p = buildQueryParams(key, state.query);
      const url = `${SUPABASE_URL}/rest/v1/vacancies?${p}`;
      const resp = await fetchWithRetry(url, {
        headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}`, Prefer:'count=exact' },
        signal: abortCurrent().signal
      }, RETRY_OPTIONS);
      if(!resp.ok) throw new Error('load failed');

      const data = await resp.json();
      st.total  = parseTotal(resp);
      st.offset += data.length;
      st.loadedOnce=true;
      st.loadedForQuery = state.query || '';

      if(st.offset===data.length) clearContainer(container); // первая порция

      for(const v of data){
        const card = renderCard(v);
        container.appendChild(card);
      }

      const {btn}=ensureLoadMore(container,()=>fetchNext(key));
      const hasMore = st.offset < st.total;
      updateLoadMore(container,hasMore);
      if(btn) btn.disabled=!hasMore;
      pinLoadMoreToBottom(container);

      if(state.activeKey===key) updateSearchStats();
      document.dispatchEvent(new CustomEvent('feed:loaded'));
    }catch(e){
      if(e.name!=='AbortError'){
        console.error('fetchNext error:',e);
        renderError(container,e.message,()=>fetchNext(key));
        pinLoadMoreToBottom(container);
        document.dispatchEvent(new CustomEvent('feed:loaded'));
      }
    }finally{
      st.busy=false;
    }
  }

  async function refetchFromZeroSmooth(key){
    const container=containers[key];
    const st=state[key];
    if(!container) return;

    st.offset=0; st.total=0;
    st.loadedOnce=false; st.loadedForQuery=state.query||'';
    clearContainer(container);

    // заглушка высоты, чтобы не прыгало
    container.style.minHeight = container.offsetHeight+'px';

    try{
      const p = buildQueryParams(key, state.query);
      const url = `${SUPABASE_URL}/rest/v1/vacancies?${p}`;
      const resp = await fetchWithRetry(url, {
        headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}`, Prefer:'count=exact' },
        signal: abortCurrent().signal
      }, RETRY_OPTIONS);
      if(!resp.ok) throw new Error('reload failed');

      const data = await resp.json();
      st.total  = parseTotal(resp);
      st.offset = data.length;
      st.loadedOnce=true;

      for(const v of data){
        const card = renderCard(v);
        container.appendChild(card);
      }

      const {btn}=ensureLoadMore(container,()=>fetchNext(key));
      const hasMore = st.offset < st.total;
      updateLoadMore(container,hasMore);
      if(btn) btn.disabled=!hasMore;
      pinLoadMoreToBottom(container);

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

    const st=state[key];
    if(!st.loadedOnce || st.loadedForQuery !== (state.query||'')){
      await refetchFromZeroSmooth(key);
    }else{
      updateSearchStats();
    }
  }
  tabButtons.forEach(btn=>{
    btn.addEventListener('click', ()=> activateTabByTarget(btn.dataset.target));
    // Долгий тап по вкладке — массовое удаление
    let t;
    btn.addEventListener('pointerdown', ()=>{ t=setTimeout(()=>massDeleteForTab(btn), 700); });
    ['pointerup','pointerleave','pointercancel'].forEach(ev=>btn.addEventListener(ev, ()=>clearTimeout(t)));
  });

  // -------- Прелоад подсеток --------
  function prefetchHidden(){
    ['maybe','other'].forEach(k=>{
      const st=state[k];
      if(!st.loadedOnce && containers[k]?.offsetHeight===0){ // скрыта
        fetchNext(k);
      }
    });
  }

  // -------- Карточка --------
  function renderCard(v){
    const q = state.query || '';

    // Сводка
    const summaryText = String(v.summary || '').trim();

    // Полный текст, без маркеров [Изображение]
    const originalDetailsHtml = String(v.details_html || '').replace(/\[\s*Изображение\s*\]\s*/gi,'');
    const bestImageUrl = pickImageUrl(v, originalDetailsHtml);
    const attachmentsHTML = bestImageUrl
      ? `<div class="attachments"><a class="image-link-button" href="${escapeHtml(bestImageUrl)}" target="_blank" rel="noopener noreferrer">Изображение</a></div>`
      : '';
    const hasDetails = Boolean(originalDetailsHtml) || Boolean(attachmentsHTML);
    const detailsHTML = hasDetails
      ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>`
      : '';

    let skillsFooterHtml='';
    if(Array.isArray(v.skills)&&v.skills.length>0){
      skillsFooterHtml = `<div class="footer-skill-tags">${
        v.skills.slice(0,3).map(s=>`<span class="footer-skill-tag">${escapeHtml(String(s))}</span>`).join('')
      }</div>`;
    }

    const channelHtml = v.channel ? `<span class="channel-name">${escapeHtml(v.channel)}</span>` : '';
    const timestampHtml = `<span class="timestamp-footer">${escapeHtml(formatTimestamp(v.timestamp || v.created_at || v.updated_at))}</span>`;

    // Инфо-блок: показываем ТОЛЬКО осмысленные значения
    const infoRows=[];
    const joinMeaningful=(...vals)=>vals.map(x=>String(x||'').trim()).filter(x=>x && !/^не\s*указано$/i.test(x)).join(' · ');
    const isMeaningful=(x)=>!!String(x||'').trim() && !/^не\s*указано$/i.test(String(x||'').trim());
    const cleanVal=(x)=>String(x||'').replace(/\s+/g,' ').trim();

    const fmt = joinMeaningful(v.employment_type, v.work_format);
    if (fmt) infoRows.push({label:'ФОРМАТ', value:fmt, type:'default'});

    if (isMeaningful(v.salary_display_text))
      infoRows.push({label:'ОПЛАТА', value:cleanVal(v.salary_display_text), type:'salary'});

    const sphereTextSrc = isMeaningful(v.industry) ? v.industry : v.sphere;
    if (isMeaningful(sphereTextSrc))
      infoRows.push({label:'СФЕРА', value:cleanVal(sphereTextSrc), type:'industry'});

    let infoWindowHtml='';
    if(infoRows.length){
      infoWindowHtml = '<div class="info-window">'+infoRows.map(r=>`
        <div class="info-row info-row--${r.type}">
          <div class="info-label">${escapeHtml(r.label)} >></div>
          <div class="info-value">${escapeHtml(r.value)}</div>
        </div>`).join('')+'</div>';
    }

    const footerMetaHtml = `<div class="footer-meta">
      ${channelHtml}
      ${timestampHtml}
    </div>`;

    const applyUrl = allowHttpOrTg(String(v.apply_url || ''));
    const applyBtn = applyUrl ? `<button class="card-action-btn apply" data-action="apply" data-url="${escapeHtml(applyUrl)}" aria-label="Откликнуться">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
    </button>` : '';

    const actionsHtml = `<div class="card-actions">
      ${applyBtn}
      <button class="card-action-btn favorite" data-action="favorite" data-id="${v.id}" aria-label="В избранное">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#FFD93D" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9 12 2"></polygon></svg>
      </button>
      <button class="card-action-btn delete" data-action="delete" data-id="${v.id}" aria-label="Удалить">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="6" y1="18" x2="18" y2="6"></line></svg>
      </button>
    </div>`;

    const card = document.createElement('article');
    card.className = 'vacancy-card';
    if(v.category==='ТОЧНО ТВОЁ') card.classList.add('category-main');
    else if(v.category==='МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
    else card.classList.add('category-other');

    card.innerHTML = `
      ${actionsHtml}
      <div class="card-header"><h3>${escapeHtml(v.category || 'NO_CATEGORY')}</h3></div>
      <div class="card-body">
        <p class="card-summary"></p>
        ${infoWindowHtml}
        ${detailsHTML}
      </div>
      <div class="card-footer">
        ${skillsFooterHtml}
        ${footerMetaHtml}
      </div>
    `;

    const summaryEl = card.querySelector('.card-summary');
    if(summaryEl){
      summaryEl.dataset.originalSummary = summaryText;
      summaryEl.innerHTML = q ? highlightText(summaryText, q) : escapeHtml(summaryText);
    }
    const detailsEl = card.querySelector('.vacancy-text');
    if(detailsEl){
      detailsEl.innerHTML = attachmentsHTML + originalDetailsHtml;
    }
    return card;
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

  // -------- Массовое удаление по вкладке --------
  function massDeleteForTab(btn){
    const tabName = btn?.dataset?.categoryName || 'этой категории';
    showCustomConfirm(`Удалить все вакансии из «${tabName}»?`)
      .then(ok=>{
        if(!ok) return;
        const key = keyFromTargetId(btn.dataset.target);
        bulkUpdateStatusByTab(key,'deleted');
      });
  }

  // -------- Кастомный confirm --------
  const confirmOverlay   = document.getElementById('custom-confirm-overlay');
  const confirmText      = document.getElementById('custom-confirm-text');
  const confirmOkBtn     = document.getElementById('confirm-btn-ok');
  const confirmCancelBtn = document.getElementById('confirm-btn-cancel');
  function showCustomConfirm(message){
    return new Promise(res=>{
      if(!confirmOverlay) return res(window.confirm(message));
      confirmText.textContent=message;
      confirmOverlay.classList.remove('hidden');
      const onOk=()=>{ cleanup(); res(true); };
      const onCancel=()=>{ cleanup(); res(false); };
      function cleanup(){
        confirmOverlay.classList.add('hidden');
        confirmOkBtn.removeEventListener('click', onOk);
        confirmCancelBtn.removeEventListener('click', onCancel);
      }
      confirmOkBtn.addEventListener('click', onOk);
      confirmCancelBtn.addEventListener('click', onCancel);
    });
  }

  // -------- Обновление статуса --------
  async function updateStatus(id, newStatus){
    try{
      const url = `${SUPABASE_URL}/rest/v1/vacancies?id=eq.${encodeURIComponent(id)}`;
      const resp = await fetchWithRetry(url,{
        method:'PATCH',
        headers:{
          apikey:SUPABASE_ANON_KEY,
          Authorization:`Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type':'application/json'
        },
        body: JSON.stringify({ status:newStatus })
      }, RETRY_OPTIONS);
      if(!resp.ok) throw new Error('update failed');

      // Удаляем карточку из текущего списка
      const card = vacanciesContent.querySelector(`.vacancy-card .card-action-btn[data-id="${id}"]`)?.closest('.vacancy-card');
      if(card) card.remove();
      updateSearchStats();
      fetchCountsAll(state.query);
    }catch(e){
      console.error('updateStatus',e);
      safeAlert('Не удалось обновить статус.');
    }
  }

  // -------- Массовое обновление статусов по вкладке --------
  async function bulkUpdateStatusByTab(key, newStatus){
    try{
      const p = new URLSearchParams();
      if(key==='main')  p.set('status','eq.main');
      if(key==='maybe') p.set('status','eq.maybe');
      if(key==='other') p.set('status','eq.other');
      const url = `${SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;
      const resp = await fetchWithRetry(url,{
        method:'PATCH',
        headers:{
          apikey:SUPABASE_ANON_KEY,
          Authorization:`Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type':'application/json',
          Prefer:'return=minimal'
        },
        body: JSON.stringify({ status:newStatus })
      }, RETRY_OPTIONS);
      if(!resp.ok) throw new Error('bulk update failed');

      clearContainer(containers[key]);
      state[key] = { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' };
      fetchCountsAll(state.query);
      updateSearchStats();
    }catch(e){
      console.error('bulkUpdateStatusByTab',e);
      safeAlert('Не удалось обновить список.');
    }
  }

  // -------- Визуал «обновлено» --------
  function flashRefreshed(container){
    try{
      container.style.scrollBehavior='auto';
      container.classList.add('just-refreshed');
      setTimeout(()=>container.classList.remove('just-refreshed'), 300);
      setTimeout(()=>container.style.scrollBehavior='', 10);
    }catch{}
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

    showLoader();
    setProgress(15, 'Вакансии загружаются...');

    await fetchCountsAll(state.query);
    setProgress(40);

    await fetchNext('main');
    setProgress(75);

    prefetchHidden();
    setProgress(100);

    updateSearchStats();
    setTimeout(hideLoader, 200);
  }

  document.readyState==='loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

})();
