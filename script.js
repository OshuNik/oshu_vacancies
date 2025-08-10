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
    highlightText,
    cleanImageMarkers,
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

  // Лоадер
  const loaderEl = document.getElementById('loader');
  const progressEl = document.getElementById('progress-bar');
  const tabsEl = document.getElementById('category-tabs');

  function showLoader() {
    try {
      loaderEl?.classList.remove('hidden');
      vacanciesContent?.classList.add('hidden');
      tabsEl?.classList.add('hidden');
      searchContainer?.classList.add('hidden');
      if (progressEl) progressEl.style.width = '0%';
      // фейковый прогресс до 90%
      let w = 0;
      const tick = () => {
        if (!progressEl) return;
        if (w < 90) {
          w += Math.max(1, Math.floor(Math.random()*6));
          if (w > 90) w = 90;
          progressEl.style.width = w + '%';
          setTimeout(tick, 120);
        }
      };
      tick();
    } catch {}
  }

  function hideLoader(success=true) {
    try {
      if (progressEl) progressEl.style.width = '100%';
      setTimeout(()=>{
        loaderEl?.classList.add('hidden');
        vacanciesContent?.classList.remove('hidden');
        tabsEl?.classList.remove('hidden');
        searchContainer?.classList.remove('hidden');
      }, 150);
    } catch {}
  }

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
    main:  { offset:0,total:0,busy:false,loadedOnce:false,loadedForQuery:'' },
    maybe: { offset:0,total:0,busy:false,loadedOnce:false,loadedForQuery:'' },
    other: { offset:0,total:0,busy:false,loadedOnce:false,loadedForQuery:'' },
  };

  // -------- helpers UI --------
  function clearContainer(el){ if(!el) return; const lm=el.querySelector('.load-more-wrap'); el.innerHTML=''; if(lm) el.appendChild(lm); }
  function hideLoadMore(container){ updateLoadMore?.(container, false); const lm=container?.querySelector('.load-more-wrap'); if(lm) lm.remove(); }
  function pinLoadMoreToBottom(container){ const wrap=container?.querySelector('.load-more-wrap'); if(wrap) container.appendChild(wrap); }

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

  function parseTotal(resp){
    const contentRange=resp.headers.get('content-range')||'';
    const m=/^(\d+)-(\d+)\/(\d+)$/.exec(contentRange);
    return m? Number(m[3]) : 0;
  }

  // -------- Рендер карточки --------
  function buildCard(v){
    const card=document.createElement('div');
    card.className='vacancy-card';
    card.id=`card-${v.id}`;

    if(v.category===CAT_NAME.main) card.classList.add('category-main');
    else if(v.category===CAT_NAME.maybe) card.classList.add('category-maybe');
    else card.classList.add('category-other');

    // Отклик
    const applyUrl=allowHttpOrTg(String(v.apply_url||''));
    const applyBtnHtml = applyUrl ? `
      <button class="card-action-btn apply" data-action="apply" data-url="${escapeHtml(applyUrl)}" aria-label="Откликнуться">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>` : '';

    // Инфо-блок
    const UNKNOWN = ['не указано','n/a','none','null','/'];
    const cleanVal = v => String(v ?? '').replace(/[«»"“”'‘’`]/g,'').trim();
    const isMeaningful = v => { const s = cleanVal(v).toLowerCase(); return !!s && !UNKNOWN.includes(s); };
    const joinMeaningful = (...vals)=>vals.map(cleanVal).filter(isMeaningful).join(' / ');

    const infoRows=[];
    const fmt = joinMeaningful(v.employment_type, v.work_format);
    if (fmt) infoRows.push({label:'ФОРМАТ', value:fmt, type:'default'});
    if (isMeaningful(v.salary_display_text)) infoRows.push({label:'ОПЛАТА', value:cleanVal(v.salary_display_text), type:'salary'});
    const sphereTextSrc = isMeaningful(v.industry) ? v.industry : v.sphere;
    if (isMeaningful(sphereTextSrc)) infoRows.push({label:'СФЕРА', value:cleanVal(sphereTextSrc), type:'industry'});

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

    // Полный текст (HTML уже с кликабельными ссылками; очищаем маркеры изображений)
    const originalDetailsHtml = cleanImageMarkers(String(v.text_highlighted || ''));
    const bestImageUrl = pickImageUrl(v, originalDetailsHtml);
    const attachmentsHTML = bestImageUrl ? `<div class="attachments"><a class="image-link-button" href="${escapeHtml(bestImageUrl)}" target="_blank" rel="noopener noreferrer">Изображение</a></div>` : '';

    const cardHtml = `
      <div class="card-header">
        <div class="card-title">${escapeHtml(v.title || 'Без названия')}</div>
        <div class="card-subtitle">
          <span>${escapeHtml(v.company_name || v.channel || 'Без компании')}</span>
          <span>&middot;</span>
          <span class="card-time" data-ts="${escapeHtml(v.timestamp || '')}">${formatTimestamp(v.timestamp)}</span>
        </div>
        <div class="card-actions">
          ${applyBtnHtml}
          <button class="card-action-btn favorite" data-action="favorite" data-id="${v.id}" aria-label="В избранное">
            <svg class="icon-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.716-4.35-9.428-7.279C-0.071 11.017.367 6.96 3.11 5.1c2.18-1.493 4.94-.746 6.193 1.13C10.227 4.354 12.987 3.607 15.167 5.1c2.743 1.86 3.181 5.917.538 8.621C18.716 16.65 12 21 12 21z"></path></svg>
          </button>
          <button class="card-action-btn delete" data-action="delete" data-id="${v.id}" aria-label="Удалить">
            <svg class="icon-x" viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>
      <div class="card-body">
        <p class="card-summary"></p>
        ${infoWindowHtml}
        <div class="card-details">${originalDetailsHtml}</div>
        ${attachmentsHTML}
      </div>
    `;

    card.innerHTML = cardHtml;

    const summaryEl = card.querySelector('.card-summary');
    if (summaryEl) {
      summaryEl.dataset.originalSummary = summaryText;
      summaryEl.innerHTML = q ? highlightText(summaryText, q) : escapeHtml(summaryText);
    }

    return card;
  }

  // -------- Действия по карточкам --------
  const vacanciesContentEl = document.getElementById('vacancies-content');
  vacanciesContentEl?.addEventListener('click',(e)=>{
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

      const card=document.getElementById(`card-${id}`);
      if(card) card.remove();
      const st=state[state.activeKey];
      st.total=Math.max(0, (st.total||1)-1);
      counts[state.activeKey].textContent=`(${st.total})`;
    }catch(e){ console.error(e); safeAlert('Ошибка изменения статуса.'); }
  }

  // -------- Fetch --------
  async function fetchNext(key){
    const container=containers[key];
    const st=state[key];
    if(st.busy) return;
    st.busy=true;
    ensureLoadMore(container, ()=>fetchNext(key));
    updateLoadMore(container, true);

    const url = buildCategoryUrl(key, PAGE_SIZE_MAIN||10, st.offset, state.query);
    currentController?.abort?.();
    const controller = new AbortController();
    currentController = controller;

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
        hideLoadMore(container);
        renderEmptyState(container,'-- Пусто в этой категории --');
      } else {
        updateLoadMore(container, st.offset < st.total);
        pinLoadMoreToBottom(container);
      }
    }catch(e){
      console.error(e);
      renderError(container, 'Ошибка загрузки');
      hideLoadMore(container);
    }finally{
      st.busy=false;
    }
  }

  // -------- Счётчики --------
  async function fetchCountsAll(q){
    const keys=['main','maybe','other'];
    for(const k of keys){
      const url=buildCategoryUrl(k, 1, 0, q);
      try{
        const resp=await fetchWithRetry(url,{ headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}`, Prefer:'count=exact' }}, RETRY_OPTIONS);
        const total=parseTotal(resp);
        if(counts[k]) counts[k].textContent=`(${total})`;
        state[k].total=total;
      }catch{}
    }
  }

  // -------- Поиск --------
  function updateSearchStats(){
    const q=(searchInput?.value||'').trim();
    const active=containers[state.activeKey];
    const total=active?.querySelectorAll('.vacancy-card').length||0;
    const msg = q ? `Найдено: ${total}` : `Всего: ${total}`;
    const id='search-stats';
    let el=document.getElementById(id);
    if(!el){
      el=document.createElement('div');
      el.id=id;
      el.className='search-stats';
      searchContainer?.appendChild(el);
    }
    el.textContent=msg;
  }

  const debouncedSearch = debounce(async()=>{
    state.query=(searchInput?.value||'').trim();
    Object.keys(containers).forEach(k=>{
      state[k]={ offset:0,total:0,busy:false,loadedOnce:false,loadedForQuery:'' };
      clearContainer(containers[k]);
      hideLoadMore(containers[k]);
    });
    fetchCountsAll(state.query);
    await fetchNext(state.activeKey);
    updateSearchStats();
  }, 350);

  searchInput?.addEventListener('input', debouncedSearch);

  // -------- Табы, задержанное удаление и т.п. --------
  tabButtons.forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const target=btn.dataset.target;
      if(!target) return;

      vacancyLists.forEach(v=>v.classList.remove('active'));
      document.getElementById(target)?.classList.add('active');

      Object.keys(containers).forEach(k=>{
        containers[k].style.display = target.endsWith(k) ? '' : 'none';
      });

      tabButtons.forEach(b=>{
        const active=b===btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true':'false');
      });

      if(!state[k=target.split('-').pop()].loadedOnce || state[k].loadedForQuery!==state.query){
        await fetchNext(k);
      }
      updateSearchStats();
    });

    // долгий тап по вкладке — массовое удаление
    let pressTimer=null;
    const holdMs=900;
    const start=(e)=>{
      if(pressTimer) clearTimeout(pressTimer);
      pressTimer=setTimeout(async()=>{
        const key=btn.classList.contains('main')?'main':btn.classList.contains('maybe')?'maybe':'other';
        const ok=await showCustomConfirm('Удалить все вакансии в этой категории?');
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
        Prefer:'return=representation',
      },
      body:JSON.stringify({ status:newStatus }),
    }, RETRY_OPTIONS);
    if(!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
  }

  // -------- Prefetch скрытых вкладок --------
  async function prefetchHidden(){
    const hidden=['maybe','other'].filter(k=>k!==state.activeKey);
    for(const k of hidden){
      if(!state[k].loadedOnce) await fetchNext(k);
    }
  }

  // -------- Init --------
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
    fetchCountsAll(state.query);
    try { await fetchNext('main'); } finally { hideLoader(true); }
    prefetchHidden();
    updateSearchStats();
  }

  document.readyState==='loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

})();
