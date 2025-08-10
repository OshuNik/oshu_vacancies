// script.js — вкладки, бесшовный поиск, PTR, счётчики, индикатор обновления
// Отклик — ТОЛЬКО из v.apply_url (если пусто — кнопки нет).
// Фикс пустых состояний: после PTR/удалений всегда показываем заглушку (собака),
// «Загрузить ещё» прячем сразу.

(function () {
  'use strict';

  // ---- Конфиг/утилиты ----
  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    PAGE_SIZE_MAIN,
    RETRY_OPTIONS,
    SEARCH_FIELDS,
  } = window.APP_CONFIG || {};

  const {
    escapeHtml,
    stripTags,
    debounce,
    highlightText,
    safeAlert,
    formatTimestamp,
    sanitizeUrl,
    openLink,
    cleanImageMarkers,
    pickImageUrl,
    fetchWithRetry,
    renderEmptyState,
    renderError,
    ensureLoadMore,
    updateLoadMore,
  } = window.utils || {};

  // ---- DOM ----
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

  // кастомный confirm
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

  // ---- Состояние ----
  const CAT_NAME = { main:'ТОЧНО ТВОЁ', maybe:'МОЖЕТ БЫТЬ' };
  let currentController=null;

  const state = {
    query: '',
    activeKey: 'main',
    main:  { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' },
    maybe: { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' },
    other: { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' },
  };

  // ---- Search stats ----
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

  // ---- Abort helper ----
  function abortCurrent(){
    if(currentController){ try{ currentController.abort(); }catch{} }
    currentController = new AbortController();
    return currentController;
  }

  // ---- Helpers ----
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
    updateLoadMore?.(container,false);
    const lm = container?.querySelector('.load-more-wrap');
    if (lm) lm.remove();
  }
  function showEmpty(container, message){
    // гарантированно показываем заглушку и убираем «Загрузить ещё»
    hideLoadMore(container);
    if (typeof renderEmptyState === 'function') {
      renderEmptyState(container, message);
    } else {
      container.innerHTML = `<div class="empty-state"><p class="empty-state-text">${escapeHtml(message||'Пусто')}</p></div>`;
    }
    // фикс для странных состояний скролла после PTR
    try { window.scrollTo({top:0, behavior:'auto'}); } catch {}
  }
  function resetCategory(key, clearDom=true){
    const st=state[key];
    st.offset=0; st.total=0; st.busy=false; st.loadedOnce=false; st.loadedForQuery='';
    if(clearDom) clearContainer(containers[key]);
    hideLoadMore(containers[key]);
  }
  function pinLoadMoreToBottom(container){
    const wrap=container?.querySelector('.load-more-wrap');
    if(wrap) container.appendChild(wrap);
  }

  // ---- API URLs ----
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

  // ---- Быстрые счётчики ----
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

  // ---- Карточка ----
  function buildCard(v){
    const card=document.createElement('div');
    card.className='vacancy-card';
    card.id=`card-${v.id}`;

    if(v.category==='ТОЧНО ТВОЁ') card.classList.add('category-main');
    else if(v.category==='МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
    else card.classList.add('category-other');

    const isValid = (val)=>val && val!=='null' && val!=='не указано';

    // Отклик — строго из apply_url
    const applyUrl = sanitizeUrl(String(v.apply_url || ''));
    const applyBtn = applyUrl ? `<button class="card-action-btn apply" data-action="apply" data-url="${escapeHtml(applyUrl)}" aria-label="Откликнуться">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
    </button>` : '';

    const infoRows=[];
    const fmt=[v.employment_type,v.work_format].filter(Boolean).join(' / ');
    if(fmt) infoRows.push({label:'ФОРМАТ',value:fmt,type:'default'});
    if(isValid(v.salary_display_text)) infoRows.push({label:'ОПЛАТА',value:v.salary_display_text,type:'salary'});
    const sphereText = isValid(v.industry) ? v.industry : (v.sphere||'').trim();
    if(sphereText) infoRows.push({label:'СФЕРА',value:sphereText,type:'industry'});

    let infoWindowHtml='';
    if(infoRows.length){
      infoWindowHtml = '<div class="info-window">'+infoRows.map(r=>`
        <div class="info-row info-row--${r.type}">
          <div class="info-label">${escapeHtml(r.label)} >></div>
          <div class="info-value">${escapeHtml(r.value)}</div>
        </div>`).join('')+'</div>';
    }

    const q = state.query;
    const summaryText = v.reason || 'Описание не было сгенерировано.';
    const originalDetailsRaw = v.text_highlighted ? stripTags(String(v.text_highlighted)) : '';
    const bestImageUrl = pickImageUrl(v, originalDetailsRaw);
    const cleanedDetailsText = bestImageUrl ? cleanImageMarkers(originalDetailsRaw) : originalDetailsRaw;
    const attachmentsHTML = bestImageUrl ? `<div class="attachments"><a class="image-link-button" href="${bestImageUrl}" target="_blank" rel="noopener noreferrer">Изображение</a></div>` : '';
    const hasDetails = Boolean(cleanedDetailsText) || Boolean(attachmentsHTML);
    const detailsHTML = hasDetails ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>` : '';

    let skillsFooterHtml='';
    if(Array.isArray(v.skills)&&v.skills.length>0){
      skillsFooterHtml = `<div class="footer-skill-tags">${
        v.skills.slice(0,3).map(s=>`<span class="footer-skill-tag">${escapeHtml(String(s))}</span>`).join('')
      }</div>`;
    }

    const channelHtml = v.channel ? `<span class="channel-name">${escapeHtml(v.channel)}</span>` : '';
    const timestampHtml = `<span class="timestamp-footer">${escapeHtml(formatTimestamp(v.timestamp))}</span>`;
    const sep = channelHtml && timestampHtml ? ' • ' : '';
    const footerMetaHtml = `<div class="footer-meta">${channelHtml}${sep}${timestampHtml}</div>`;

    card.innerHTML = `
      <div class="card-actions">
        ${applyBtn}
        <button class="card-action-btn favorite" data-action="favorite" data-id="${v.id}" aria-label="В избранное">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
        <button class="card-action-btn delete" data-action="delete" data-id="${v.id}" aria-label="Удалить">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

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
      summaryEl.innerHTML = highlightText(summaryText, q);
    }
    const detailsEl = card.querySelector('.vacancy-text');
    if(detailsEl){
      detailsEl.dataset.originalText = cleanedDetailsText;
      detailsEl.innerHTML = attachmentsHTML + highlightText(cleanedDetailsText, q);
    }
    return card;
  }

  // ---- Действия по карточкам ----
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
        showEmpty(cont, '-- Пусто в этой категории --');
      }
      updateSearchStats();
    }catch(err){
      console.error(err);
      safeAlert('Не удалось выполнить действие. Повторите позже.');
    }
  }

  // ---- Загрузка порций ----
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
      const frag=document.createDocumentFragment();
      for(const it of items) frag.appendChild(buildCard(it));
      container.appendChild(frag);
      pinLoadMoreToBottom(container);

      const {btn}=ensureLoadMore(container,()=>fetchNext(key));
      st.offset += items.length;
      const hasMore = st.offset < st.total;
      updateLoadMore(container,hasMore);
      if(btn) btn.disabled=!hasMore;

      if(st.total===0 && st.offset===0){
        showEmpty(container,'-- Пусто в этой категории --');
      }

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

  // ---- Мягкая полная перезагрузка ----
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
      for(const it of items) frag.appendChild(buildCard(it));

      const lm=container.querySelector('.load-more-wrap');
      container.replaceChildren(frag);
      if(lm) container.appendChild(lm);

      st.offset=items.length;
      st.total=Number.isFinite(total)?total:items.length;
      st.loadedOnce=true;
      st.loadedForQuery=state.query;

      if(counts[key]) counts[key].textContent=`(${st.total})`;

      if (st.total === 0) {
        showEmpty(container,'-- Пусто в этой категории --');
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

  // ---- Поиск ----
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

  // ---- Переключение вкладок ----
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

    // долгий тап — очистка категории
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
          showEmpty(containers[key],'-- Пусто в этой категории --');
          if(state.activeKey===key) updateSearchStats();
          safeAlert('Готово: категория очищена.');
        }catch(e){ console.error(e); safeAlert('Ошибка: не получилось удалить категорию.'); }
      }, holdMs);
    };
    const cancel=()=>{ clearTimeout(pressTimer); };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', cancel);
    btn.addEventListener('pointerleave', cancel);
  });

  // ---- BULK helper ----
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

  // ---- PTR панель ----
  (function setupPTR(){
    const threshold=78;
    let startY=0, pulling=false, ready=false, locked=false;

    const bar=document.createElement('div');
    bar.style.cssText=[
      'position:fixed','left:0','right:0','top:0',
      'height:56px','background:#fff','color:#333',
      'border-bottom:3px solid #000','box-shadow:0 2px 0 #000',
      'transform:translateY(-100%)','transition:transform .2s ease,opacity .14s linear',
      'z-index:9999','font-family:inherit','font-weight:700',
      'display:flex','align-items:center','justify-content:center',
      'letter-spacing:.2px','opacity:0','pointer-events:none'
    ].join(';');
    bar.textContent='Потяните вниз для обновления';
    document.body.appendChild(bar);

    const setBar=y=>{ bar.style.transform=`translateY(${Math.min(0, -100 + (y/0.56))}%)`; bar.style.opacity = y>6?'1':'0'; };
    const resetBar=()=>{ bar.style.transform='translateY(-100%)'; bar.style.opacity='0'; };

    window.addEventListener('touchstart',(e)=>{
      if(locked) return;
      if(window.scrollY>0){ pulling=false; return; }
      startY=e.touches[0].clientY; pulling=true; ready=false;
    },{passive:true});

    window.addEventListener('touchmove',(e)=>{
      if(!pulling || locked) return;
      const y=e.touches[0].clientY;
      const dist=y-startY;
      if(dist>0){
        e.preventDefault();
        setBar(dist);
        if(dist>threshold && !ready){ ready=true; bar.textContent='Отпустите для обновления'; }
        if(dist<=threshold && ready){ ready=false; bar.textContent='Потяните вниз для обновления'; }
      }else{ pulling=false; resetBar(); }
    },{passive:false});

    window.addEventListener('touchend',()=>{
      if(!pulling || locked){ resetBar(); pulling=false; return; }
      if(ready){
        locked=true; bar.textContent='Обновляю…'; setBar(threshold*1.2);
        const done=()=>{ locked=false; pulling=false; resetBar(); };
        const onLoaded=()=>{ document.removeEventListener('feed:loaded', onLoaded); done(); };
        document.addEventListener('feed:loaded', onLoaded);
        refetchFromZeroSmooth(state.activeKey);
        setTimeout(()=>{ if(locked) done(); }, 8000);
      }else{ resetBar(); pulling=false; }
    },{passive:true});
  })();

  // ---- Вспышка после обновления ----
  (function injectFlashCSS(){
    const style=document.createElement('style');
    style.textContent=`
      @keyframes refreshedFlash { 0%{background:#fffbe6;} 100%{background:transparent;} }
      .refreshed-flash { animation: refreshedFlash .6s ease forwards; }
    `;
    document.head.appendChild(style);
  })();
  function flashRefreshed(container){
    if(!container) return;
    container.classList.remove('refreshed-flash');
    void container.offsetWidth;
    container.classList.add('refreshed-flash');
  }

  // ---- Prefetch ----
  async function prefetchHidden(){
    fetchCountsAll(state.query);
    ['maybe','other'].forEach(k=>{
      if(!containers[k].querySelector('.vacancy-card')){
        fetchNext(k);
      }
    });
  }

  // ---- Инициализация ----
  async function init(){
    Object.keys(containers).forEach(k=>{
      containers[k].style.display = (k===state.activeKey) ? '' : 'none';
    });

    tabButtons.forEach(b=>{
      const active=(b.dataset.target||'').endsWith('-main');
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true':'false');
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
