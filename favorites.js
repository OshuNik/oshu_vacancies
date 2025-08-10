// favorites.js — вкладка «Избранное» (кликабельные ссылки, tg://, скрытие "не указано",
// мягкое обновление без мигания, фикс кнопки «Изображение», СТАРЫЙ КРЕСТИК удаления)

(function () {
  'use strict';

  // --- Гарантированно берём конфиг и утилиты ---
  const CFG  = window.APP_CONFIG;
  const UTIL = window.utils;

  if (!CFG) { alert('APP_CONFIG не загружен'); return; }
  if (!UTIL) { alert('utils.js не загружен'); return; }

  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    RETRY_OPTIONS = { retries: 2, backoffMs: 400 },
  } = CFG;

  const {
    escapeHtml, stripTags, debounce, highlightText, formatTimestamp,
    openLink, pickImageUrl, safeAlert, fetchWithRetry,
  } = UTIL;

  // --- DOM ---
  const container      = document.getElementById('favorites-list');
  const searchInputFav = document.getElementById('search-input-fav');

  // --- Стили (фикс кнопки, фокуса и позиционирования иконок) ---
  (function injectCSS() {
    const style = document.createElement('style');
    style.textContent = `
      /* Ссылки в тексте */
      .vacancy-text a, .card-summary a { text-decoration: underline; color:#1f6feb; word-break: break-word; }
      .vacancy-text a:hover, .card-summary a:hover { opacity:.85; }

      /* Кнопка "Изображение" */
      .image-link-button{
        display:inline-flex; align-items:center; justify-content:center;
        padding:6px 12px; background:#e6f3ff; color:#0b5ed7; font-weight:700;
        border:3px solid #000; border-radius:12px; line-height:1; text-decoration:none;
        box-shadow:0 3px 0 #000; transition:transform .08s ease, box-shadow .08s ease, filter .15s ease;
        outline:none;
      }
      .image-link-button:hover{ filter:saturate(1.05) brightness(1.02); }
      .image-link-button:active{ transform:translateY(2px); box-shadow:0 1px 0 #000; }
      .image-link-button:focus-visible{ outline:3px solid #8ec5ff; outline-offset:2px; }

      /* Summary без синих артефактов */
      details > summary { list-style:none; cursor:pointer; user-select:none; outline:none; }
      details > summary::-webkit-details-marker{ display:none; }

      /* Позиционирование action-иконок */
      .vacancy-card{ position:relative; overflow:visible; }
      .card-actions{
        position:absolute; right:12px; top:12px; display:flex; gap:12px;
        z-index:2; pointer-events:auto;
      }
      .card-action-btn{
        width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center;
        background:transparent; border:0; padding:0; cursor:pointer;
      }
      .card-action-btn svg{ width:24px; height:24px; }

      /* СТАРЫЙ крестик (как раньше) */
      .card-action-btn.delete{ color:#ff5b5b; }
      .card-action-btn.delete .icon-x{
        stroke: currentColor; stroke-width: 2.5; fill: none;
      }

      /* Плавная замена при обновлении */
      .fade-swap-enter{ opacity:0; }
      .fade-swap-enter.fade-swap-enter-active{ opacity:1; transition:opacity .18s ease; }
      .fade-swap-exit{ opacity:1; }
      .fade-swap-exit.fade-swap-exit-active{ opacity:0; transition:opacity .12s ease; }
    `;
    document.head.appendChild(style);
  })();

  // --- Сервисные функции ---
  function allowHttpOrTg(url) {
    if (!url) return '';
    try {
      const u = new URL(url, window.location.href);
      if (/^https?:$/.test(u.protocol) || /^tg:$/.test(u.protocol)) return u.href;
      return '';
    } catch { return ''; }
  }

  const UNKNOWN = ['не указано', 'n/a', 'none', 'null', '/'];
  const cleanVal = v => String(v ?? '').replace(/[«»"“”'‘’`]/g,'').trim();
  const isMeaningful = v => {
    const s = cleanVal(v).toLowerCase();
    return !!s && !UNKNOWN.includes(s);
  };
  const joinMeaningful = (...vals) => vals.map(cleanVal).filter(isMeaningful).join(' / ');

  // --- SEARCH UI (счётчик) ---
  let favStatsEl = null;
  function ensureFavSearchUI() {
    const parent = document.getElementById('search-container-fav') || searchInputFav?.parentElement;
    if (!parent) return;
    if (!favStatsEl) {
      favStatsEl = document.createElement('div');
      favStatsEl.className = 'search-stats';
      parent.appendChild(favStatsEl);
    }
  }
  function updateFavStats() {
    if (!favStatsEl) return;
    const q = (searchInputFav?.value || '').trim();
    const visible = container?.querySelectorAll('.vacancy-card:not([hidden])').length || 0;
    const total   = container?.querySelectorAll('.vacancy-card').length || 0;
    favStatsEl.textContent = q ? (visible===0 ? 'Ничего не найдено' : `Найдено: ${visible} из ${total}`) : '';
  }

  // --- Пагинация в памяти ---
  const PAGE_SIZE_FAV = 10;
  const favState = { all: [], rendered: 0, pageSize: PAGE_SIZE_FAV, btn: null };

  function makeFavBtn() {
    const b = document.createElement('button');
    b.className = 'load-more-btn';
    b.textContent = 'Показать ещё';
    b.style.marginTop = '10px';
    b.addEventListener('click', renderNextFav);
    return b;
  }
  function updateFavBtn() {
    if (!container) return;
    if (!favState.btn) favState.btn = makeFavBtn();
    const btn = favState.btn;
    const total = favState.all.length, rendered = favState.rendered;
    if (rendered < total) {
      if (!btn.parentElement) container.appendChild(btn);
      btn.disabled = false;
    } else if (btn.parentElement) {
      btn.parentElement.remove();
    }
  }

  // --- Карточка ---
  function buildFavCard(v) {
    const card = document.createElement('div');
    card.className = 'vacancy-card';
    card.id = `card-${v.id}`;

    if (v.category === 'ТОЧНО ТВОЁ') card.classList.add('category-main');
    else if (v.category === 'МОЖЕТ БЫТЬ') card.classList.add('category-maybe');
    else card.classList.add('category-other');

    // Отклик: только если есть валидный https:// или tg://
    const applyUrl = allowHttpOrTg(String(v.apply_url || ''));
    const applyBtnHtml = applyUrl ? `
      <button class="card-action-btn apply" data-action="apply" data-url="${escapeHtml(applyUrl)}" aria-label="Откликнуться">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>` : '';

    // ТОЛЬКО 2 иконки: отклик + удалить (СТАРЫЙ КРЕСТИК)
    const actionsHtml = `
      <div class="card-actions">
        ${applyBtnHtml}
        <button class="card-action-btn delete" data-action="delete" data-id="${v.id}" aria-label="Удалить">
          <svg class="icon-x" viewBox="0 0 24 24" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>`;

    // Инфо-блок: показываем ТОЛЬКО осмысленные значения
    const infoRows = [];
    const fmt = joinMeaningful(v.employment_type, v.work_format);
    if (fmt) infoRows.push({ label:'ФОРМАТ', value: fmt, type:'default' });
    if (isMeaningful(v.salary_display_text)) infoRows.push({ label:'ОПЛАТА', value: cleanVal(v.salary_display_text), type:'salary' });
    const sphereSrc = isMeaningful(v.industry) ? v.industry : v.sphere;
    if (isMeaningful(sphereSrc)) infoRows.push({ label:'СФЕРА', value: cleanVal(sphereSrc), type:'industry' });

    let infoHtml = '';
    if (infoRows.length) {
      infoHtml = '<div class="info-window">' + infoRows.map(r => `
        <div class="info-row info-row--${r.type}">
          <div class="info-label">${escapeHtml(r.label)} >></div>
          <div class="info-value">${escapeHtml(r.value)}</div>
        </div>`).join('') + '</div>';
    }

    const summaryText = v.reason || 'Описание не было сгенерировано.';
    const q = (searchInputFav?.value || '').trim();

    // Полный текст: HTML с кликабельными ссылками (убираем «[ Изображение ]»)
    const originalDetailsHtml = String(v.text_highlighted || '').replace(/\[\s*Изображение\s*\]\s*/gi, '');
    const bestImageUrl = pickImageUrl(v, originalDetailsHtml);
    const attachmentsHTML = bestImageUrl ? `<div class="attachments"><a class="image-link-button" href="${bestImageUrl}" target="_blank" rel="noopener noreferrer">Изображение</a></div>` : '';
    const hasDetails = Boolean(originalDetailsHtml) || Boolean(attachmentsHTML);
    const detailsHTML = hasDetails
      ? `<details><summary>Показать полный текст</summary><div class="vacancy-text" style="margin-top:10px;"></div></details>`
      : '';

    // Низ карточки
    let skillsFooterHtml = '';
    if (Array.isArray(v.skills) && v.skills.length) {
      skillsFooterHtml = `<div class="footer-skill-tags">${
        v.skills.slice(0,3).map(s=>`<span class="footer-skill-tag">${escapeHtml(String(s))}</span>`).join('')
      }</div>`;
    }
    const channelHtml   = v.channel ? `<span class="channel-name">${escapeHtml(v.channel)}</span>` : '';
    theTimestamp:
    const timestampHtml = `<span class="timestamp-footer">${escapeHtml(formatTimestamp(v.timestamp))}</span>`;
    const sep = channelHtml && timestampHtml ? ' • ' : '';
    const footerMetaHtml = `<div class="footer-meta">${channelHtml}${sep}${timestampHtml}</div>`;

    // Сборка
    card.innerHTML = `
      ${actionsHtml}
      <div class="card-header"><h3>${escapeHtml(v.category || 'NO_CATEGORY')}</h3></div>
      <div class="card-body">
        <p class="card-summary"></p>
        ${infoHtml}
        ${detailsHTML}
      </div>
      <div class="card-footer">
        ${skillsFooterHtml}
        ${footerMetaHtml}
      </div>
    `;

    // Рендер краткого описания с подсветкой
    const summaryEl = card.querySelector('.card-summary');
    if (summaryEl) {
      summaryEl.dataset.originalSummary = summaryText;
      summaryEl.innerHTML = q ? highlightText(summaryText, q) : escapeHtml(summaryText);
    }

    // Рендер полного текста
    const detailsEl = card.querySelector('.vacancy-text');
    if (detailsEl) {
      detailsEl.innerHTML = attachmentsHTML + originalDetailsHtml;
    }

    // Текст для локального поиска
    const searchChunks = [
      v.category, v.reason, v.industry, v.company_name,
      Array.isArray(v.skills) ? v.skills.join(' ') : '',
      stripTags(originalDetailsHtml)
    ].filter(Boolean);
    card.dataset.searchText = searchChunks.join(' ').toLowerCase();

    return card;
  }

  // --- Рендер порции ---
  function renderNextFav() {
    const start = favState.rendered;
    const end   = Math.min(start + favState.pageSize, favState.all.length);

    if (favState.all.length === 0 && start === 0) {
      container.innerHTML = '<p class="empty-list">-- В избранном пусто --</p>';
      updateFavBtn();
      updateFavStats();
      return;
    }

    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) frag.appendChild(buildFavCard(favState.all[i]));
    container.appendChild(frag);
    favState.rendered = end;

    updateFavBtn();
    applySearchFav();
  }

  // --- Поиск по избранному (локально) ---
  function applySearchFav() {
    const q = (searchInputFav?.value || '').trim().toLowerCase();

    const cards = container.querySelectorAll('.vacancy-card');
    cards.forEach(card => {
      const text = (card.dataset.searchText || '');
      const hit  = q ? text.includes(q) : true;
      card.hidden = !hit;

      const summaryEl = card.querySelector('.card-summary');
      if (summaryEl) {
        const original = summaryEl.dataset.originalSummary || '';
        summaryEl.innerHTML = q ? highlightText(original, q) : escapeHtml(original);
      }
    });

    updateFavStats();
  }

  // --- API: мягкая перезагрузка без мигания ---
  async function loadFavorites() {
    try {
      const p = new URLSearchParams();
      p.set('select', '*');
      p.set('status', 'eq.favorite');
      p.set('order', 'timestamp.desc');

      const url  = `${SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;

      const keepHeight = container.offsetHeight;
      if (keepHeight) container.style.minHeight = `${keepHeight}px`;

      const resp = await fetchWithRetry(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      }, RETRY_OPTIONS);
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      const data = await resp.json();
      favState.all = data || [];
      favState.rendered = 0;

      const tmp = document.createElement('div');
      const to = Math.min(favState.pageSize, favState.all.length);
      for (let i = 0; i < to; i++) tmp.appendChild(buildFavCard(favState.all[i]));

      const old = container;
      old.classList.add('fade-swap-exit'); void old.offsetWidth;
      old.classList.add('fade-swap-exit-active');

      setTimeout(() => {
        old.innerHTML = tmp.innerHTML;
        favState.rendered = to;
        updateFavBtn();
        applySearchFav();

        old.classList.remove('fade-swap-exit','fade-swap-exit-active');
        old.classList.add('fade-swap-enter'); void old.offsetWidth;
        old.classList.add('fade-swap-enter-active');

        setTimeout(() => {
          old.classList.remove('fade-swap-enter','fade-swap-enter-active');
          old.style.minHeight = '';
          document.dispatchEvent(new CustomEvent('favorites:loaded'));
        }, 200);
      }, 120);

    } catch (e) {
      console.error(e);
      container.innerHTML = '<p class="empty-list">Ошибка загрузки избранного.</p>';
      document.dispatchEvent(new CustomEvent('favorites:loaded'));
    }
  }

  async function updateStatus(vacancyId, newStatus) {
    const cardElement = document.getElementById(`card-${vacancyId}`);
    try {
      const url = `${SUPABASE_URL}/rest/v1/vacancies?id=eq.${encodeURIComponent(vacancyId)}`;
      const resp = await fetchWithRetry(url, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ status: newStatus })
      }, RETRY_OPTIONS);

      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      if (cardElement) {
        cardElement.style.transition = 'opacity .25s ease, transform .25s ease';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.98)';
        setTimeout(() => {
          cardElement.remove();
          if (container.querySelectorAll('.vacancy-card').length === 0) {
            container.innerHTML = '<p class="empty-list">-- В избранном пусто --</p>';
          }
          updateFavStats();
        }, 250);
      }
    } catch (e) {
      console.error(e);
      safeAlert('Не удалось изменить статус. Повторите позже.');
    }
  }

  // --- Слушатели карточек ---
  container?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'apply')   openLink(btn.dataset.url);
    if (action === 'delete')  updateStatus(btn.dataset.id, 'deleted');
  });

  // --- Pull-to-refresh (без мигания) ---
  (function setupPTR(){
    const threshold = 78;
    let startY=0, pulling=false, ready=false, locked=false;

    const bar = document.createElement('div');
    bar.style.cssText = [
      'position:fixed','left:0','right:0','top:0','height:56px',
      'background:#fff','color:#333','border-bottom:3px solid #000','box-shadow:0 2px 0 #000',
      'transform:translateY(-100%)','transition:transform .2s ease,opacity .14s linear',
      'z-index:9999','font-family:inherit','font-weight:700','display:flex','align-items:center','justify-content:center',
      'letter-spacing:.2px','opacity:0','pointer-events:none'
    ].join(';');
    bar.textContent = 'Потяните вниз для обновления';
    document.body.appendChild(bar);

    const setBar = y => { bar.style.transform = `translateY(${Math.min(0, -100 + (y/0.56))}%)`; bar.style.opacity = y>6?'1':'0'; };
    const resetBar = ()=>{ bar.style.transform='translateY(-100%)'; bar.style.opacity='0'; };

    window.addEventListener('touchstart',(e)=>{
      if (locked) return;
      if (window.scrollY>0) { pulling=false; return; }
      if (e.touches.length!==1) { pulling=false; return; }
      startY = e.touches[0].clientY; pulling=true; ready=false;
    },{passive:true});

    window.addEventListener('touchmove',(e)=>{
      if (!pulling || locked) return;
      const y = e.touches[0].clientY;
      const dist = y - startY;
      if (dist>0) {
        e.preventDefault();
        setBar(dist);
        if (dist>threshold && !ready) { ready=true; bar.textContent='Отпустите для обновления'; }
        if (dist<=threshold && ready) { ready=false; bar.textContent='Потяните вниз для обновления'; }
      } else { pulling=false; resetBar(); }
    },{passive:false});

    window.addEventListener('touchend',()=>{
      if (!pulling || locked) { resetBar(); pulling=false; return; }
      if (ready) {
        locked=true; bar.textContent='Обновляю…'; setBar(threshold*1.2);
        const done = ()=>{ locked=false; pulling=false; resetBar(); };
        const onLoaded = ()=>{ document.removeEventListener('favorites:loaded', onLoaded); done(); };
        document.addEventListener('favorites:loaded', onLoaded);
        loadFavorites();
        setTimeout(()=>{ if (locked) done(); }, 8000);
      } else { resetBar(); pulling=false; }
    },{passive:true});
  })();

  // --- События и старт ---
  searchInputFav?.addEventListener('input', debounce(applySearchFav, 220));
  ensureFavSearchUI();
  loadFavorites();
})();
