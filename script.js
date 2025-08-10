// script.js — мягкий серверный поиск без мерцаний + счётчик «Найдено: X из Y» + long/double-tap очистка + фикс вкладки «НЕ ТВОЁ»

const { SUPABASE_URL, SUPABASE_ANON_KEY, PAGE_SIZE_MAIN, RETRY_OPTIONS, SEARCH_FIELDS } = window.APP_CONFIG;
const {
  escapeHtml, stripTags, debounce, highlightText, safeAlert,
  formatTimestamp, sanitizeUrl, openLink,
  containsImageMarker, cleanImageMarkers, pickImageUrl,
  fetchWithRetry, renderEmptyState, renderError,
  ensureLoadMore, updateLoadMore
} = window.utils;

// ----- элементы -----
const containers = {
  main: document.getElementById('vacancies-list-main'),
  maybe: document.getElementById('vacancies-list-maybe'),
  other: document.getElementById('vacancies-list-other'),
};
const counts = {
  main: document.getElementById('count-main'),
  maybe: document.getElementById('count-maybe'),
  other: document.getElementById('count-other'),
};
const tabButtons = document.querySelectorAll('.tab-button');
const vacancyLists = document.querySelectorAll('.vacancy-list');
const searchInput = document.getElementById('search-input');
const loader = document.getElementById('loader');
const progressBar = document.getElementById('progress-bar');
const vacanciesContent = document.getElementById('vacancies-content');
const headerActions = document.getElementById('header-actions');
const searchContainer = document.getElementById('search-container');
const categoryTabs = document.getElementById('category-tabs');

// --- кастомный confirm (из HTML) ---
const confirmOverlay = document.getElementById('custom-confirm-overlay');
const confirmText   = document.getElementById('custom-confirm-text');
const confirmOkBtn  = document.getElementById('confirm-btn-ok');
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

// ----- Прогресс -----
const setProgress=(p=0)=>{ if(progressBar) progressBar.style.width=Math.max(0,Math.min(100,p))+'%'; };
const startProgress=()=>setProgress(5);
const finishProgress=()=>setTimeout(()=>setProgress(100),0);
const resetProgress=()=>setTimeout(()=>setProgress(0),200);

// ===== состояние =====
const CAT_NAME = { main:'ТОЧНО ТВОЁ', maybe:'МОЖЕТ БЫТЬ' };
let currentController=null;
const state = {
  query: '',
  main:  { offset:0, total:0, busy:false },
  maybe: { offset:0, total:0, busy:false },
  other: { offset:0, total:0, busy:false },
};

// ===== Search UI: «Найдено: X из Y» =====
let searchStatsEl=null;
function ensureSearchUI(){
  if(!searchContainer || !searchInput) return;
  if(!searchStatsEl){
    searchStatsEl=document.createElement('div');
    searchStatsEl.className='search-stats';
    searchContainer.appendChild(searchStatsEl);
  }
}
function updateSearchStats(){
  ensureSearchUI();
  const activeList=document.querySelector('.vacancy-list.active');
  if(!activeList){ searchStatsEl.textContent=''; return; }
  const visible = activeList.querySelectorAll('.vacancy-card').length;
  const key = Object.keys(containers).find(k=>containers[k]===activeList);
  const total = key ? state[key].total : visible;
  const q=(searchInput?.value||'').trim();
  searchStatsEl.textContent = q ? (visible===0 ? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`) : '';
}

// ===== helper: синхронизируем видимость списков =====
function syncTabVisibility(){
  const active = document.querySelector('.vacancy-list.active') || containers.main;
  vacancyLists.forEach(list=>{
    const on = list === active;
    list.style.display = on ? '' : 'none';
  });
}

// ===== построение URL =====
function buildCategoryUrl(key, limit, offset, query){
  const p=new URLSearchParams();
  p.set('select','*');
  p.set('status','eq.new');
  p.set('order','timestamp.desc');
  p.set('limit',String(limit));
  p.set('offset',String(offset));
  if(key==='main') p.set('category',`eq.${CAT_NAME.main}`);
  else if(key==='maybe') p.set('category',`eq.${CAT_NAME.maybe}`);
  else { p.append('category',`neq."${CAT_NAME.main}"`); p.append('category',`neq."${CAT_NAME.maybe}"`); }
  const q=(query||'').trim();
  if(q){ const expr='('+SEARCH_FIELDS.map(f=>`${f}.ilike.*${q}*`).join(',')+')'; p.set('or',expr); }
  return `${SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;
}
function parseTotal(resp){
  const cr=resp.headers.get('content-range');
  if(!cr||!cr.includes('/')) return 0;
  const total=cr.split('/').pop();
  return Number(total)||0;
}

// ===== карточка =====
function buildCard(v){
  const card=document.createElement('div');
  card.className='vacancy-card';
  card.id=`card-${v.id}`;
  if(v.category==='ТОЧНО ТВОЁ') card.classList.add('category-main');
  else if(v.category==='МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
  else card.classList.add('category-other');

  const isValid = (val)=>val && val!=='null' && val!=='не указано';

  let skillsFooterHtml='';
  if(Array.isArray(v.skills)&&v.skills.length>0){
    skillsFooterHtml=`<div class="footer-skill-tags">${
      v.skills.slice(0,3).map(s=>`<span class="footer-skill-tag">${escapeHtml(String(s))}</span>`).join('')
    }</div>`;
  }

  const infoRows=[];
  const fmt=[v.employment_type,v.work_format].filter(Boolean).join(' / ');
  if(fmt) infoRows.push({label:'ФОРМАТ',value:fmt,type:'default'});
  if(isValid(v.salary_display_text)) infoRows.push({label:'ОПЛАТА',value:v.salary_display_text,type:'salary'});
  const sphere=`${isValid(v.industry)?v.industry:''} ${isValid(v.company_name)?`(${v.company_name})`:''}`.trim();
  if(sphere) infoRows.push({label:'СФЕРА',value:sphere,type:'industry'});
  let infoWindowHtml='';
  if(infoRows.length>0){
    infoWindowHtml = '<div class="info-window">'+infoRows.map(r=>
      `<div class="info-row info-row--${r.type}">
         <div class="info-label">${escapeHtml(r.label)} >>\</div>
         <div class="info-value">${escapeHtml(r.value)}</div>
       </div>`).join('')+'</div>';
  }

  const originalSummary = v.reason || 'Описание не было сгенерировано.';
  const q = state.query;

  const originalDetailsRaw = v.text_highlighted ? stripTags(String(v.text_highlighted)) : '';
  const bestImageUrl = pickImageUrl(v, originalDetailsRaw);
  const cleanedDetailsText = bestImageUrl ? cleanImageMarkers(originalDetailsRaw) : originalDetailsRaw;
  const attachmentsHTML = bestImageUrl ? `<div class="attachments"><a class="image-link-button" href="${bestImageUrl}" target="_blank" rel="noopener noreferrer">Изображение</a></div>` : '';
  const hasAnyDetails = Boolean(cleanedDetailsText) || Boolean(attachmentsHTML);
  const detailsHTML = hasAnyDetails ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>` : '';

  const channelHtml = isValid(v.channel) ? `<span class="channel-name">${escapeHtml(v.channel)}</span>` : '';
  const timestampHtml = `<span class="timestamp-footer">${escapeHtml(formatTimestamp(v.timestamp))}</span>`;
  const separator = channelHtml && timestampHtml ? ' • ' : '';
  const footerMetaHtml = `<div class="footer-meta">${channelHtml}${separator}${timestampHtml}</div>`;

  const applyBtn = v.apply_url ? `<button class="card-action-btn apply" data-action="apply" data-url="${escapeHtml(sanitizeUrl(v.apply_url))}" aria-label="Откликнуться">
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg></button>` : '';

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
    </div>`;

  const summaryEl = card.querySelector('.card-summary');
  if (summaryEl) {
    summaryEl.dataset.originalSummary = originalSummary;
    summaryEl.innerHTML = highlightText(originalSummary, q);
  }
  const detailsEl = card.querySelector('.vacancy-text');
  if (detailsEl) {
    detailsEl.dataset.originalText = cleanedDetailsText;
    detailsEl.innerHTML = attachmentsHTML + highlightText(cleanedDetailsText, q);
  }
  return card;
}

// ----- действия на карточках (делегирование) -----
vacanciesContent.addEventListener('click',(e)=>{
  const btn=e.target.closest('[data-action]');
  if(!btn) return;
  const act=btn.dataset.action;
  if(act==='apply') openLink(btn.dataset.url);
  if(act==='favorite') updateStatus(btn.dataset.id,'favorite');
  if(act==='delete') updateStatus(btn.dataset.id,'deleted');
});

// ----- держим кнопку «Загрузить ещё» внизу -----
function pinLoadMoreToBottom(container){
  const wrap=container.querySelector('.load-more-wrap');
  if(wrap) container.appendChild(wrap);
}

// ===== fetch одной категории (порция) =====
async function fetchNext(key){
  const st=state[key]; const container=containers[key];
  if(st.busy) return; st.busy = true;
  const url=buildCategoryUrl(key,PAGE_SIZE_MAIN,st.offset,state.query);

  try{
    const resp = await fetchWithRetry(url,{
      headers:{ 'apikey':SUPABASE_ANON_KEY,'Authorization':`Bearer ${SUPABASE_ANON_KEY}`,'Prefer':'count=exact' },
      signal: currentController?.signal
    },RETRY_OPTIONS);
    if(!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

    const total=parseTotal(resp);
    if(Number.isFinite(total)){ st.total=total; counts[key].textContent=`(${total})`; }

    const items=await resp.json();
    const frag=document.createDocumentFragment();
    for(const it of items) frag.appendChild(buildCard(it));
    container.appendChild(frag);
    pinLoadMoreToBottom(container);

    st.offset += items.length;

    const {btn}=ensureLoadMore(container,()=>fetchNext(key));
    const hasMore = st.offset < st.total;
    updateLoadMore(container, hasMore);
    btn.disabled = !hasMore;

    const active = document.querySelector('.vacancy-list.active');
    if(active===container) updateSearchStats();

  }catch(e){
    if(e.name==='AbortError') return;
    console.error('Load error:',e);
    renderError(container,e.message,()=>fetchNext(key));
  }finally{
    st.busy=false;
  }
}

// ===== МЯГКАЯ ПЕРЕЗАГРУЗКА КАТЕГОРИИ =====
async function reloadCategory(key){
  const container=containers[key];
  const st = state[key] = { offset:0, total:0, busy:false };

  const url=buildCategoryUrl(key,PAGE_SIZE_MAIN,0,state.query);
  try{
    const resp = await fetchWithRetry(url,{
      headers:{ 'apikey':SUPABASE_ANON_KEY,'Authorization':`Bearer ${SUPABASE_ANON_KEY}`,'Prefer':'count=exact' },
      signal: currentController?.signal
    },RETRY_OPTIONS);
    if(!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

    const total=parseTotal(resp);
    if(Number.isFinite(total)){ st.total=total; counts[key].textContent=`(${total})`; }

    const items=await resp.json();

    const newChildren=[];
    if(items.length===0){
      const tmp=document.createElement('div');
      renderEmptyState(tmp,'-- Пусто в этой категории --');
      newChildren.push(...tmp.childNodes);
    }else{
      for(const it of items) newChildren.push(buildCard(it));
    }

    container.replaceChildren(...newChildren);
    pinLoadMoreToBottom(container);

    st.offset = items.length;

    const {btn}=ensureLoadMore(container,()=>fetchNext(key));
    const hasMore = st.offset < st.total;
    updateLoadMore(container, hasMore);
    btn.disabled = !hasMore;

    const active=document.querySelector('.vacancy-list.active');
    if(active===container) updateSearchStats();

  }catch(e){
    if(e.name==='AbortError') return;
    console.error('Reload error:',e);
    renderError(container,e.message,()=>reloadCategory(key));
  }
}

// ===== Полная мягкая перезагрузка всех категорий (поиск) =====
async function softReloadAll(){
  currentController?.abort?.();
  currentController = new AbortController();
  await Promise.all([ reloadCategory('main'), reloadCategory('maybe'), reloadCategory('other') ]);
  updateSearchStats();
}

// ===== Первый запуск =====
async function initialLoad(){
  currentController?.abort?.();
  currentController = new AbortController();

  headerActions.classList.add('hidden');
  vacanciesContent.classList.add('hidden');
  searchContainer.classList.add('hidden');
  categoryTabs.classList.add('hidden');

  startProgress(); loader.classList.remove('hidden');

  try{
    await Promise.all([ reloadCategory('main'), reloadCategory('maybe'), reloadCategory('other') ]);
    finishProgress();
  }finally{
    setTimeout(()=>{
      loader.classList.add('hidden');
      vacanciesContent.classList.remove('hidden');
      headerActions.classList.remove('hidden');
      categoryTabs.classList.remove('hidden');
      searchContainer.classList.remove('hidden');
      syncTabVisibility();              // <-- важно: прячем неактивные списки
      resetProgress();
      updateSearchStats();
      document.dispatchEvent(new CustomEvent('vacancies:loaded'));
    },200);
  }
}

// ===== Обновление статуса карточки =====
async function updateStatus(id,newStatus){
  const card=document.getElementById(`card-${id}`);
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${id}`,{
      method:'PATCH',
      headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':`Bearer ${SUPABASE_ANON_KEY}`,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify({status:newStatus})
    });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);

    if(card){
      const parent=card.parentElement;
      const key=Object.keys(containers).find(k=>containers[k]===parent);
      card.style.opacity='0'; card.style.transform='scale(0.96)';
      setTimeout(()=>{
        card.remove();
        if(key){
          state[key].total=Math.max(0,state[key].total-1);
          counts[key].textContent=`(${state[key].total})`;
          const active=document.querySelector('.vacancy-list.active');
          if(active===parent) updateSearchStats();
          if(state[key].offset < state[key].total) fetchNext(key);
          if(!parent.querySelector('.vacancy-card')){
            renderEmptyState(parent,'-- Пусто в этой категории --');
            updateLoadMore(parent,false);
          }else{
            pinLoadMoreToBottom(parent);
          }
        }
      },220);
    }
  }catch(e){
    console.error(e); safeAlert('Не удалось обновить статус.');
    if(card){ card.style.opacity='1'; card.style.transform='scale(1)'; }
  }
}

// ===== табы: клик + долгий/двойной тап (очистка) =====
tabButtons.forEach(button=>{
  const key = button.classList.contains('main') ? 'main' : (button.classList.contains('maybe') ? 'maybe':'other');
  const categoryName = button.dataset.categoryName;

  let lastTap=0;
  button.addEventListener('click',()=>{
    const now=Date.now();
    const active=button.classList.contains('active');
    if(active && (now-lastTap)<400){ clearCategory(categoryName,key); lastTap=0; return; }
    lastTap=now;

    // переключение
    tabButtons.forEach(b=>b.classList.remove('active'));
    button.classList.add('active');

    const targetId = button.dataset.target;
    vacancyLists.forEach(list=>{
      const on = (list.id === targetId);
      list.classList.toggle('active', on);
      list.style.display = on ? '' : 'none';     // <-- фикс: показываем только выбранную вкладку
    });

    pinLoadMoreToBottom(document.querySelector('.vacancy-list.active'));
    updateSearchStats();
  });

  let pressTimer=null;
  const startPress=()=>{ pressTimer=window.setTimeout(()=>clearCategory(categoryName,key),800); };
  const cancelPress=()=>{ if(pressTimer){ clearTimeout(pressTimer); pressTimer=null; } };
  button.addEventListener('mousedown',startPress);
  button.addEventListener('mouseup',cancelPress);
  button.addEventListener('mouseleave',cancelPress);
  button.addEventListener('touchstart',startPress,{passive:true});
  button.addEventListener('touchend',cancelPress);
  button.addEventListener('touchcancel',cancelPress);
});

async function clearCategory(categoryName,key){
  const ok=await showCustomConfirm(`Удалить все из категории «${categoryName}»?`);
  if(!ok) return;
  const container=containers[key];
  try{
    const url=`${SUPABASE_URL}/rest/v1/vacancies?category=eq.${encodeURIComponent(categoryName)}&status=eq.new`;
    const r=await fetch(url,{method:'PATCH',headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':`Bearer ${SUPABASE_ANON_KEY}`,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({status:'deleted'})});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    container.replaceChildren(); renderEmptyState(container,'-- Пусто в этой категории --'); updateLoadMore(container,false);
    counts[key].textContent='(0)'; state[key]={offset:0,total:0,busy:false};
    updateSearchStats();
  }catch(e){ console.error(e); safeAlert('Не удалось очистить категорию.'); }
}

// ===== Поиск (мягкий) =====
const onSearch = debounce(()=>{
  state.query=(searchInput?.value||'').trim();
  softReloadAll();
},300);
searchInput?.addEventListener('input',onSearch);

// ===== Pull-to-refresh =====
(function setupPTR(){
  if(window.__PTR_INITIALIZED__) return; window.__PTR_INITIALIZED__=true;
  const threshold=70; let startY=0,pulling=false,ready=false,locked=false;
  const bar=document.createElement('div');
  bar.style.cssText='position:fixed;left:0;right:0;top:0;height:56px;background:var(--card-color);color:var(--hint-color);border-bottom:var(--border-width) solid var(--border-color);display:flex;align-items:center;justify-content:center;transform:translateY(-100%);transition:transform .2s ease;z-index:9999;font-family:inherit;';
  bar.textContent='Потяните вниз для обновления';
  document.body.appendChild(bar);
  const setBar=y=>{ bar.style.transform=`translateY(${Math.min(0,-100+(y/0.56))}%)`; };
  const resetBar=()=>{ bar.style.transform='translateY(-100%)'; };

  window.addEventListener('touchstart',(e)=>{ if(locked) return; if(window.scrollY>0){ pulling=false; return; } startY=e.touches[0].clientY; pulling=true; ready=false; },{passive:true});
  window.addEventListener('touchmove',(e)=>{ if(!pulling||locked) return; const y=e.touches[0].clientY; const d=y-startY; if(d>0){ e.preventDefault(); setBar(Math.min(d,threshold*1.5)); if(d>threshold && !ready){ ready=true; bar.textContent='Отпустите для обновления'; } if(d<=threshold && ready){ ready=false; bar.textContent='Потяните вниз для обновления'; } } },{passive:false});
  window.addEventListener('touchend',()=>{ if(!pulling||locked){ resetBar(); pulling=false; return; } if(ready){ locked=true; bar.textContent='Обновляю…'; setBar(threshold*1.2); const done=()=>{ locked=false; pulling=false; resetBar(); }; const onLoaded=()=>{ document.removeEventListener('vacancies:loaded',onLoaded); done(); }; document.addEventListener('vacancies:loaded',onLoaded); initialLoad(); setTimeout(()=>{ if(locked) done(); },8000); } else { resetBar(); pulling=false; } },{passive:true});
})();

// ===== старт =====
ensureSearchUI();
syncTabVisibility();          // на всякий случай сразу синхронизируем
initialLoad();
