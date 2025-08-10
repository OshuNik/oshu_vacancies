// script.js — главная лента с вкладками и «Загрузить ещё»

const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
if (tg) tg.expand();

// --- CONFIG (не трогаем) ---
const SUPABASE_URL = 'https://lwfhtwnfqmdjwzrdznvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4';
const PAGE_SIZE = 10;
const PRIMARY_SKILLS = ['after effects','unity','монтаж видео','2d-анимация','рилсы','premiere pro'];

// --- DOM ---
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
const tabButtons = document.querySelectorAll('.tab-button');
const lists = document.querySelectorAll('.vacancy-list');
const searchInput = document.getElementById('search-input');
const loader = document.getElementById('loader');
const progressBar = document.getElementById('progress-bar');
const contentWrap = document.getElementById('vacancies-content');
const headerActions = document.getElementById('header-actions');
const searchContainer = document.getElementById('search-container');
const categoryTabs = document.getElementById('category-tabs');

// --- helpers ---
const escapeHtml = s => String(s||'').replace(/[&<>"']/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
const stripTags = html => { const d=document.createElement('div'); d.innerHTML = html||''; return d.textContent || ''; };
const debounce = (fn,ms=250)=>{ let t; return(...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
const setProgress = p => progressBar && (progressBar.style.width = `${Math.min(100,Math.max(0,p))}%`);
const startProgress = ()=> setProgress(5);
const finishProgress = ()=> setTimeout(()=>setProgress(100),0);
const resetProgress = ()=> setTimeout(()=>setProgress(0),200);
const openLink = url => { try{ const u=new URL(url); if(tg && tg.openLink) tg.openLink(u.href); else window.open(u.href,'_blank','noopener'); }catch{} };
const sanitizeUrl = raw => { try{ const u=new URL(raw); if(!/^https?:$/i.test(u.protocol)) return ''; return u.href; }catch{return '';} };
const highlightText = (text,q)=> {
  if(!q) return escapeHtml(text);
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),'gi');
  return escapeHtml(text).replace(rx,'<mark class="highlight">$&</mark>');
};
function formatSmartTime(iso){
  if(!iso) return '';
  const d=new Date(iso), n=new Date(), s=Math.floor((n-d)/1000), m=Math.floor(s/60);
  const pad=n=>String(n).padStart(2,'0'); const M=['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  const same=n.toDateString()===d.toDateString(), y=new Date(n); y.setDate(n.getDate()-1);
  if(s<30) return 'только что'; if(m<60&&m>=1) return `${m} мин назад`;
  if(same) return `сегодня, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if(y.toDateString()===d.toDateString()) return `вчера, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${String(d.getDate()).padStart(2,'0')} ${M[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// --- поиск (UI счётчик) ---
let searchStatsEl=null;
function ensureSearchUI(){
  if(!searchContainer||!searchInput) return;
  if(!searchStatsEl){
    searchStatsEl=document.createElement('div');
    searchStatsEl.className='search-stats';
    searchContainer.appendChild(searchStatsEl);
  }
}
function updateSearchStats(visible,total){
  if(!searchStatsEl) return;
  const q=(searchInput.value||'').trim();
  searchStatsEl.textContent = q ? (visible===0?'Ничего не найдено':`Найдено: ${visible} из ${total}`) : '';
}

// --- рендер карточки ---
function buildCard(v){
  const card=document.createElement('div');
  card.className='vacancy-card';
  card.id=`card-${v.id}`;

  if (v.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
  else if (v.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
  else card.classList.add('category-other');

  const isValid = val => val && val !== 'null' && val !== 'не указано';
  const safeApply = sanitizeUrl(v.apply_url||'');
  const applyBtn = safeApply ? `
    <button class="card-action-btn apply" onclick="openLink('${safeApply}')" aria-label="Откликнуться">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
    </button>` : '';

  let skillsFooter='';
  if (Array.isArray(v.skills) && v.skills.length){
    skillsFooter = `<div class="footer-skill-tags">${
      v.skills.slice(0,3).map(s=>{
        const p = PRIMARY_SKILLS.includes(String(s).toLowerCase());
        return `<span class="footer-skill-tag ${p?'primary':''}">${escapeHtml(String(s))}</span>`;
      }).join('')
    }</div>`;
  }

  const infoRows=[];
  const employment=isValid(v.employment_type)?v.employment_type:'';
  const workFormat=isValid(v.work_format)?v.work_format:'';
  const fmt=[employment,workFormat].filter(Boolean).join(' / ');
  if(fmt) infoRows.push({label:'ФОРМАТ', value:fmt, type:'default'});
  if(isValid(v.salary_display_text)) infoRows.push({label:'ОПЛАТА', value:v.salary_display_text, type:'salary'});

  const ind=isValid(v.industry)?v.industry:'';
  const comp=isValid(v.company_name)?`(${v.company_name})`:'';
  const sph=(ind+' '+comp).trim();
  if(sph) infoRows.push({label:'СФЕРА', value:sph, type:'industry'});

  let infoHtml='';
  if(infoRows.length){
    infoHtml = '<div class="info-window">' + infoRows.map(r=>`
      <div class="info-row info-row--${r.type}">
        <div class="info-label">${escapeHtml(r.label)} >></div>
        <div class="info-value">${escapeHtml(r.value)}</div>
      </div>`).join('') + '</div>';
  }

  const q=(searchInput?.value||'').trim();
  const originalDetails = v.text_highlighted ? stripTags(String(v.text_highlighted)) : '';
  const summary = v.reason || 'Описание не было сгенерировано.';
  const detailsHtml = originalDetails ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>` : '';

  const channelHtml = isValid(v.channel) ? `<span class="channel-name">${escapeHtml(v.channel)}</span>` : '';
  const timestampHtml = `<span class="timestamp-footer">${escapeHtml(formatSmartTime(v.timestamp))}</span>`;
  const footerMeta = `<div class="footer-meta">${channelHtml}${channelHtml?' • ':''}${timestampHtml}</div>`;

  card.innerHTML = `
    <div class="card-actions">
      ${applyBtn}
      <button class="card-action-btn favorite" onclick="updateStatus(event,'${v.id}','favorite')" aria-label="В избранное">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
      </button>
      <button class="card-action-btn delete" onclick="updateStatus(event,'${v.id}','deleted')" aria-label="Удалить">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="card-header"><h3>${escapeHtml(v.category || 'NO_CATEGORY')}</h3></div>
    <div class="card-body">
      <p class="card-summary"></p>
      ${infoHtml}
      ${detailsHtml}
    </div>
    <div class="card-footer">
      ${skillsFooter}
      ${footerMeta}
    </div>`;

  // searchable text
  const searchChunks = [v.category, v.reason, ind, v.company_name, Array.isArray(v.skills)?v.skills.join(' '):'', originalDetails].filter(Boolean);
  card.dataset.searchText = searchChunks.join(' ').toLowerCase();

  const sEl = card.querySelector('.card-summary');
  if (sEl){ sEl.dataset.originalSummary=summary; sEl.innerHTML = highlightText(summary, q); }
  const dEl = card.querySelector('.vacancy-text');
  if (dEl){ dEl.dataset.originalText=originalDetails; dEl.innerHTML = highlightText(originalDetails, q); }

  return card;
}

// --- состояния и пагинация по вкладкам ---
const store = {
  main:  { all:[], rendered:0 },
  maybe: { all:[], rendered:0 },
  other: { all:[], rendered:0 },
  btn: null
};

function ensureLoadMore(){
  if (!store.btn){
    const b=document.createElement('button');
    b.className='load-more-btn';
    b.textContent='Загрузить ещё';
    b.onclick=()=> renderNext();
    const wrap=document.createElement('div');
    wrap.className='load-more-wrap';
    wrap.appendChild(b);
    store.btn = wrap;
  }
}

function attachLoadMore(toContainer){
  ensureLoadMore();
  // снять у всех
  Object.values(containers).forEach(c=>{
    if (c && store.btn && c.contains(store.btn)) c.removeChild(store.btn);
  });
  if (toContainer && !toContainer.contains(store.btn)) toContainer.appendChild(store.btn);
}

function renderNext(){
  const activeKey = document.querySelector('.tab-button.active')?.dataset?.target?.split('vacancies-list-')[1] || 'main';
  const bucket = store[activeKey];
  const cont = containers[activeKey];
  if (!bucket || !cont) return;

  const start=bucket.rendered, end=Math.min(start+PAGE_SIZE, bucket.all.length);
  const frag=document.createDocumentFragment();
  for (let i=start;i<end;i++) frag.appendChild(buildCard(bucket.all[i]));
  if (start===0) cont.innerHTML='';
  cont.appendChild(frag);
  bucket.rendered=end;

  // кнопка
  if (bucket.rendered < bucket.all.length) {
    attachLoadMore(cont);
  } else if (store.btn && cont.contains(store.btn)) {
    cont.removeChild(store.btn);
  }

  applySearch(); // фильтрация и счётчик
}

// --- API ---
async function updateStatus(ev,id,newStatus){
  const el=document.getElementById(`card-${id}`);
  try{
    await fetch(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${id}`,{
      method:'PATCH',
      headers:{ 'apikey':SUPABASE_ANON_KEY, 'Authorization':`Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type':'application/json', 'Prefer':'return=minimal' },
      body: JSON.stringify({ status:newStatus })
    });
    if(el){ el.style.opacity='0'; el.style.transform='scale(0.95)'; setTimeout(()=>el.remove(),300); }
  }catch(e){ console.error(e); tg?.showAlert?.('Не удалось обновить статус.'); }
}

function splitByCategory(items){
  const main=[], maybe=[], other=[];
  for (const it of items){
    const cat = String(it.category||'').toUpperCase();
    if (cat === 'ТОЧНО ТВОЁ') main.push(it);
    else if (cat === 'МОЖЕТ БЫТЬ') maybe.push(it);
    else other.push(it);
  }
  return { main, maybe, other };
}

async function loadVacancies(){
  ensureSearchUI();
  headerActions.classList.add('hidden');
  contentWrap.classList.add('hidden');
  searchContainer.classList.add('hidden');
  categoryTabs.classList.add('hidden');
  startProgress(); loader.classList.remove('hidden');

  try{
    const r = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?status=eq.new&select=*`,{
      headers:{ 'apikey':SUPABASE_ANON_KEY, 'Authorization':`Bearer ${SUPABASE_ANON_KEY}` }
    });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const raw = await r.json();
    raw.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));

    // сплит
    const { main, maybe, other } = splitByCategory(raw);
    store.main  = { all:main,  rendered:0 };
    store.maybe = { all:maybe, rendered:0 };
    store.other = { all:other, rendered:0 };

    counts.main.textContent  = `(${main.length})`;
    counts.maybe.textContent = `(${maybe.length})`;
    counts.other.textContent = `(${other.length})`;

    Object.values(containers).forEach(c=> c && (c.innerHTML=''));

    // отрисуем активную вкладку
    renderNext();
    finishProgress();
  }catch(e){
    console.error(e);
    loader.innerHTML = `<p class="empty-list">Ошибка: ${escapeHtml(String(e.message||e))}</p>`;
  }finally{
    setTimeout(()=>{
      loader.classList.add('hidden');
      contentWrap.classList.remove('hidden');
      headerActions.classList.remove('hidden');
      categoryTabs.classList.remove('hidden');
      if ((store.main.all.length+store.maybe.all.length+store.other.all.length)>0) searchContainer.classList.remove('hidden');
      resetProgress();
      document.dispatchEvent(new CustomEvent('vacancies:loaded'));
    },200);
  }
}

// --- поиск ---
function applySearch(){
  const q=(searchInput?.value||'').trim().toLowerCase();
  const activeList = document.querySelector('.vacancy-list.active');
  if(!activeList) return;
  const cards=[...activeList.querySelectorAll('.vacancy-card')];
  const total=cards.length; let visible=0;
  for (const card of cards){
    const hay=(card.dataset.searchText || card.textContent || '').toLowerCase();
    const match = !q || hay.includes(q);
    card.style.display = match?'':'none';
    if(match) visible++;
  }
  // пусто?
  let empty=activeList.querySelector('.search-empty-hint');
  if (total>0 && visible===0){
    if(!empty){ empty=document.createElement('div'); empty.className='search-empty-hint'; empty.style.cssText='text-align:center;color:var(--hint-color);padding:30px 0;'; empty.textContent='— Ничего не найдено —'; activeList.appendChild(empty); }
  } else if (empty){ empty.remove(); }
  updateSearchStats(visible,total);
}

// --- события вкладок ---
tabButtons.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    tabButtons.forEach(b=>b.classList.remove('active'));
    lists.forEach(l=>l.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.target).classList.add('active');
    // отрисовать (если ещё не)
    const key = btn.dataset.target.split('vacancies-list-')[1];
    if (store[key].rendered === 0) renderNext();
    else attachLoadMore(containers[key]); // переставим кнопку
    applySearch();
  });
});

// --- PTR (как было) ---
(function setupPTR(){
  const threshold=70; let startY=0, pulling=false, ready=false, locked=false;
  const bar=document.createElement('div');
  bar.style.cssText='position:fixed;left:0;right:0;top:0;height:56px;background:var(--card-color);color:var(--hint-color);border-bottom:var(--border-width) solid var(--border-color);display:flex;align-items:center;justify-content:center;transform:translateY(-100%);transition:transform .2s ease;z-index:9999;font-family:inherit;';
  bar.textContent='Потяните вниз для обновления'; document.body.appendChild(bar);
  const setBar=y=>{ bar.style.transform=`translateY(${Math.min(0,-100+(y/0.56))}%)`; };
  const resetBar=()=>{ bar.style.transform='translateY(-100%)'; };
  window.addEventListener('touchstart',e=>{ if(locked) return; if(window.scrollY>0){ pulling=false; return; } startY=e.touches[0].clientY; pulling=true; ready=false; },{passive:true});
  window.addEventListener('touchmove',e=>{ if(!pulling||locked) return; const y=e.touches[0].clientY; const dist=y-startY; if(dist>0){ e.preventDefault(); setBar(Math.min(dist,threshold*1.5)); if(dist>threshold&&!ready){ ready=true; bar.textContent='Отпустите для обновления'; } if(dist<=threshold&&ready){ ready=false; bar.textContent='Потяните вниз для обновления'; } } },{passive:false});
  window.addEventListener('touchend',()=>{ if(!pulling||locked){ resetBar(); pulling=false; return; } if(ready){ locked=true; bar.textContent='Обновляю…'; const done=()=>{ locked=false; pulling=false; resetBar(); }; const onLoaded=()=>{ document.removeEventListener('vacancies:loaded', onLoaded); done(); }; document.addEventListener('vacancies:loaded', onLoaded); loadVacancies(); setTimeout(()=>{ if(locked) done(); },8000); } else resetBar(); },{passive:true});
})();

// --- init ---
ensureSearchUI();
loadVacancies();
searchInput?.addEventListener('input', debounce(applySearch,250));
window.openLink = openLink;
window.updateStatus = updateStatus;
