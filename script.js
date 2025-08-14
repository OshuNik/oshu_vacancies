// script.js — главная страница

(function () {
  'use strict';
  
  const CFG = window.APP_CONFIG || {};
  const UTIL = window.utils || {};
  const CONSTANTS = window.constants || {};
  
  // Инициализируем MCP Manager для Context7
  let mcpManager = null;

  try {
    const { config, utils } = UTIL.validateConfiguration(CFG, UTIL);
  } catch (error) {
    return;
  }

  const {
    PAGE_SIZE_MAIN,
    RETRY_OPTIONS,
    SEARCH_FIELDS,
    STATUSES,
    CATEGORIES
  } = CONSTANTS;

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

  // Кэшируем DOM элементы с проверкой на null
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

  // Контейнеры будут проверены в соответствующих функциях

  const tabButtons      = document.querySelectorAll('.tab-button');
  const vacancyLists    = document.querySelectorAll('.vacancy-list');
  let searchInput       = document.getElementById('search-input');
  const mainHeader      = document.getElementById('main-header');
  const vacanciesContent= document.getElementById('vacancies-content');
  const loader          = document.getElementById('loader');
  let searchClearBtn    = document.getElementById('search-clear-btn');
  let searchInputWrapper = searchInput?.parentElement;

  const state = {
    query: '',
    activeKey: 'main',
    main:  { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' },
    maybe: { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' },
    other: { offset:0, total:0, busy:false, loadedOnce:false, loadedForQuery:'' },
  };
  let currentController = null;

  function showLoader() {
    if (loader) {
      loader.classList.remove('hidden');
      // Добавляем класс для анимации появления
      loader.classList.add('loading');
    }
  }
  function hideLoader() {
    if (loader) {
      loader.classList.remove('loading');
      loader.classList.add('hidden');
    }
  }

  // Создаем менеджер поиска для устранения дублирования кода
  const searchManager = UTIL.createSearchManager({
    container: vacanciesContent,
    searchInput,
    searchClearBtn,
    searchInputWrapper,
    onSearch: () => {
      onSearch();
    },
    onClear: () => {
      onSearch();
    }
  });

  // Инициализируем поиск
  searchManager.setupSearch();

  function updateSearchStats(){
    const active = containers[state.activeKey];
    if(!active) return;
    
    const visible = active.querySelectorAll('.vacancy-card').length;
    const total   = state[state.activeKey].total || visible;
    const q = (searchInput?.value||'').trim();
    
    searchManager.updateStats(total, visible, q);
  }

  function abortCurrent(){
    if(currentController && !currentController.signal.aborted){ 
      try{ 
        currentController.abort(); 
      } catch(error) {
        console.warn('Ошибка отмены запроса:', error);
      }
    }
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
     UTIL.clearElement(el);
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
    return `${CONSTANTS.SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;
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
        
        const url = `${CONSTANTS.SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;
        
        // Увеличиваем таймаут для мобильных устройств
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 секунд для мобильных
        
        try {
        const resp = await fetchWithRetry(url, {
            headers: createSupabaseHeaders({ prefer: 'count=exact' }),
            signal: controller.signal
        }, RETRY_OPTIONS);
        if(!resp.ok) throw new Error('count failed');
        return parseTotal(resp);
        } finally {
          clearTimeout(timeoutId);
        }
    };
    
    try {
      // Загружаем счетчики последовательно для лучшей производительности на мобильных
      const mainCount = await fetchCount('main').catch(() => 0);
      const maybeCount = await fetchCount('maybe').catch(() => 0);
      const otherCount = await fetchCount('other').catch(() => 0);
      
      // Безопасно обновляем счетчики
      state.main.total = mainCount;  counts.main.textContent = `(${mainCount})`;
      state.maybe.total = maybeCount; counts.maybe.textContent = `(${maybeCount})`;
      state.other.total = otherCount; counts.other.textContent = `(${otherCount})`;
      
    } catch(e) { 
      console.warn('Ошибка загрузки счетчиков:', e);
      // Fallback: устанавливаем нули и продолжаем работу
      state.main.total = 0; counts.main.textContent = '(0)';
      state.maybe.total = 0; counts.maybe.textContent = '(0)';
      state.other.total = 0; counts.other.textContent = '(0)';
      
      // Не блокируем основную загрузку из-за ошибки счетчиков
      // Пользователь все равно увидит вакансии
    }
  }

  vacanciesContent?.addEventListener('click', (e) => {
    console.log('🖱️ Click event:', e.target, e.target.dataset);
    
    const btn = e.target.closest('[data-action]');
    if (!btn) {
      console.log('⚠️ Кнопка не найдена');
      return;
    }
    
    const action = btn.dataset.action;
    console.log('🎯 Действие:', action, 'ID:', btn.dataset.id);
    
    if (action === 'apply') {
      console.log('🔗 Открываем ссылку:', btn.dataset.url);
      openLink(btn.dataset.url);
    }
    if (action === 'favorite') {
      console.log('⭐ Добавляем в избранное:', btn.dataset.id);
      updateStatus(btn.dataset.id, STATUSES.FAVORITE);
    }
    if (action === 'delete') {
      console.log('🗑️ Удаляем вакансию:', btn.dataset.id);
      updateStatus(btn.dataset.id, STATUSES.DELETED);
    }
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
                         const url = `${CONSTANTS.SUPABASE_URL}/rest/v1/vacancies?id=eq.${encodeURIComponent(id)}`;
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
    console.log(`📥 fetchNext: ${key}, isInitialLoad: ${isInitialLoad}`);
    
    const st = state[key];
    const container = containers[key];
    
    console.log(`🔍 Проверяем состояние для ${key}:`, st);
    console.log(`🔍 Контейнер для ${key}:`, container);
    
    if (!container || st.busy) {
      console.warn(`⚠️ fetchNext ${key} пропущен:`, { container: !!container, busy: st?.busy });
      return;
    }
    
    st.busy = true;
    console.log(`🚀 Начинаем загрузку ${key}...`);

         if (st.offset === 0 && !isInitialLoad) {
         UTIL.setSafeHTML(container, '<div class="empty-list"><div class="retro-spinner-inline"></div> Загрузка...</div>');
     }

    const url = buildCategoryUrl(key, PAGE_SIZE_MAIN || 10, st.offset, state.query);
    console.log(`🌐 URL для ${key}:`, url);
    
    const controller = abortCurrent();

    try {
      // Увеличиваем таймаут для мобильных устройств
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 секунд для мобильных
      console.log(`⏰ Установлен таймаут 20с для ${key}`);
      
      try {
        console.log(`📡 Отправляем запрос для ${key}...`);
      const resp = await fetchWithRetry(url, {
        headers: createSupabaseHeaders({ prefer: 'count=exact' }),
        signal: controller.signal
      }, RETRY_OPTIONS);
        
        clearTimeout(timeoutId);
        console.log(`✅ Ответ получен для ${key}:`, resp.status, resp.statusText);
        
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

      const total = parseTotal(resp);
        console.log(`📊 Общее количество для ${key}:`, total);
        
      if (Number.isFinite(total)){ st.total = total; counts[key].textContent = `(${total})`; }

      const data = await resp.json();
        console.log(`📦 Данные получены для ${key}:`, data?.length, 'элементов');
      
      // Валидация данных API
      if (!Array.isArray(data)) {
        throw new Error('API вернул некорректный формат данных (ожидался массив)');
      }
      
      const items = data.filter(item => item && typeof item === 'object' && item.id);
        console.log(`✅ Валидных элементов для ${key}:`, items.length);
      
      if (st.offset === 0) {
          clearContainer(container);
      }

      if (items.length === 0) {
        if (st.offset === 0) {
            const message = state.query ? 'По вашему запросу ничего не найдено' : '-- Пусто в этой категории --';
            renderEmptyState(container, message);
        }
      } else {
          console.log(`🎨 Создаем карточки для ${key}...`);
        const frag = document.createDocumentFragment();
        for (const it of items) frag.appendChild(createVacancyCard(it, { pageType: 'main', searchQuery: state.query }));
        container.appendChild(frag);
        pinLoadMoreToBottom(container);

        const { btn } = ensureLoadMore(container, () => fetchNext(key));
        st.offset += items.length;
        const hasMore = st.offset < st.total;
        updateLoadMore(container, hasMore);
        if (btn) btn.disabled = !hasMore;
          console.log(`✅ Карточки добавлены для ${key}, offset: ${st.offset}, hasMore: ${hasMore}`);
      }
      st.loadedOnce = true;
      st.loadedForQuery = state.query;
      updateSearchStats();
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        console.error(`❌ Ошибка fetch для ${key}:`, fetchError);
        throw fetchError;
      }
      
    } catch(e) {
      if (e.name === 'AbortError') {
        console.warn(`⏰ Запрос ${key} отменен по таймауту`);
      if (st.offset === 0) {
          renderError(container, 'Превышено время ожидания. Проверьте соединение.', () => refetchFromZeroSmooth(key));
        }
        return;
      }
      
      console.error(`❌ Load error для ${key}:`, e);
      if (st.offset === 0) {
        const errorMessage = e.message.includes('Failed to fetch') || e.message.includes('NetworkError') 
          ? 'Ошибка сети. Проверьте соединение.' 
          : e.message;
        renderError(container, errorMessage, () => refetchFromZeroSmooth(key));
      }
    } finally {
      st.busy = false;
      if (isInitialLoad) {
          hideLoader();
      }
      document.dispatchEvent(new CustomEvent(`feed:loaded`));
      console.log(`🏁 fetchNext ${key} завершен`);
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
      
      // Убираем полупрозрачность - это вызывало баг
      // container.classList.add('loading-seamless');

      const url = buildCategoryUrl(key, PAGE_SIZE_MAIN || 10, 0, state.query);
      const controller = abortCurrent();
      
      // Добавляем таймаут для поиска на мобильных устройствах
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 секунд для мобильных

      try {
          const resp = await fetchWithRetry(url, {
              headers: createSupabaseHeaders({ prefer: 'count=exact' }),
              signal: controller.signal
          }, RETRY_OPTIONS);
          
          clearTimeout(timeoutId);

          if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

          const total = parseTotal(resp);
          if (Number.isFinite(total)) { counts[key].textContent = `(${total})`; }

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
          clearTimeout(timeoutId);
          if (e.name === 'AbortError') {
              console.warn('Поиск отменен по таймауту');
              renderError(container, 'Превышено время ожидания поиска. Проверьте соединение.', () => seamlessSearch(key));
          } else if (e.name !== 'AbortError') {
              const errorMessage = e.message.includes('Failed to fetch') || e.message.includes('NetworkError') 
                ? 'Ошибка сети при поиске. Проверьте соединение.' 
                : e.message;
              renderError(container, errorMessage, () => seamlessSearch(key));
          }
      } finally {
          st.busy = false;
          // Убираем полупрозрачность - это вызывало баг
          // container.classList.remove('loading-seamless');
      }
  }

  const onSearch = debounce(() => {
    state.query = (searchInput?.value || '').trim();
    
    // Проверяем триггер для Context7
    if (mcpManager && state.query.toLowerCase().includes('контекст7')) {
      console.log('🔧 Обнаружен триггер Context7 в поиске');
      mcpManager.manualActivate();
    }
    
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

        const url = `${CONSTANTS.SUPABASE_URL}/rest/v1/vacancies?${p.toString()}`;
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
        safeAlert('Не удалось удалить вакансии из этой категории. Попробуйте позже.');
    }
  }

  tabButtons.forEach(btn=>{
    console.log('🔘 Настраиваем вкладку:', btn.dataset.target);
    
    let pressTimer = null;
    let isHeld = false;
    const holdMs = 1200; // Увеличиваем время для предотвращения случайных срабатываний

    const start = (e) => {
      console.log('👆 Начало нажатия на вкладку:', btn.dataset.target);
      isHeld = false;
      btn.classList.add('pressing');
      
      // Добавляем проверку на движение пальца
      let hasMoved = false;
      const startX = e.clientX || e.touches?.[0]?.clientX || 0;
      const startY = e.clientY || e.touches?.[0]?.clientY || 0;
      
      const checkMovement = (e) => {
        const currentX = e.clientX || e.touches?.[0]?.clientX || 0;
        const currentY = e.clientY || e.touches?.[0]?.clientY || 0;
        const distance = Math.sqrt((currentX - startX) ** 2 + (currentY - startY) ** 2);
        
        if (distance > 10) { // Если палец сдвинулся больше чем на 10px
          hasMoved = true;
          cancel(e);
        }
      };
      
      // Добавляем слушатели для отслеживания движения
      document.addEventListener('pointermove', checkMovement, { passive: true });
      document.addEventListener('touchmove', checkMovement, { passive: true });
      
      pressTimer = setTimeout(() => {
        if (!hasMoved) {
          isHeld = true;
          btn.classList.remove('pressing');
          const key = keyFromTargetId(btn.dataset.target || '');
          console.log('⏰ Долгое нажатие на вкладку:', key);
          bulkDeleteCategory(key);
        }
      }, holdMs);
      
      // Сохраняем ссылку на функцию для очистки
      btn._checkMovement = checkMovement;
    };
    
    const cancel = (e) => {
      console.log('❌ Отмена нажатия на вкладку:', btn.dataset.target);
      btn.classList.remove('pressing');
      clearTimeout(pressTimer);
      
      // Очищаем слушатели движения
      if (btn._checkMovement) {
        document.removeEventListener('pointermove', btn._checkMovement);
        document.removeEventListener('touchmove', btn._checkMovement);
        delete btn._checkMovement;
      }
    };

    const clickHandler = (e) => {
        console.log('🖱️ Клик по вкладке:', btn.dataset.target, 'isHeld:', isHeld);
        if (isHeld) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🚫 Долгое нажатие - предотвращаем обычный клик');
        } else {
            const targetId = btn.dataset.target;
            console.log('✅ Обычный клик - переключаем на вкладку:', targetId);
            if(targetId) activateTabByTarget(targetId);
        }
    };

    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', cancel);
    btn.addEventListener('pointerleave', cancel);
    btn.addEventListener('click', clickHandler);
    
    console.log('✅ Вкладка настроена:', btn.dataset.target);
  });

  // Улучшенное определение мобильных устройств
  function isMobileDevice() {
    // Проверяем различные признаки мобильного устройства
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;
    
    // Основные мобильные платформы
    const mobilePlatforms = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i;
    
    // Проверяем размер экрана
    const isSmallScreen = window.innerWidth <= 768;
    
    // Проверяем touch поддержку
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Проверяем, что это НЕ iPad (iPad может работать как десктоп)
    const isIPad = /iPad/.test(userAgent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    // Определяем как мобильное, если это не iPad и есть признаки мобильного
    const isMobile = mobilePlatforms.test(userAgent) && !isIPad && (isSmallScreen || hasTouch);
    
    console.log('📱 Определение устройства:', {
      userAgent: userAgent.substring(0, 100) + '...',
      platform,
      isSmallScreen,
      hasTouch,
      isIPad,
      isMobile
    });
    
    return isMobile;
  }

  // Fallback обработчики для мобильных устройств
  function setupMobileFallbacks() {
    console.log('📱 Настраиваем fallback для мобильных устройств...');
    
    const isMobile = isMobileDevice();
    console.log('📱 Мобильное устройство:', isMobile);
    
    if (isMobile) {
      // Добавляем touchstart обработчики как fallback
      console.log('👆 Добавляем touchstart обработчики...');
      
      // Обработчики для кнопок действий
      document.addEventListener('touchstart', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        
        console.log('👆 Touchstart на кнопке:', btn.dataset.action);
        
        // Предотвращаем двойное срабатывание
        e.preventDefault();
        
        const action = btn.dataset.action;
        if (action === 'apply') {
          openLink(btn.dataset.url);
        } else if (action === 'favorite') {
          updateStatus(btn.dataset.id, STATUSES.FAVORITE);
        } else if (action === 'delete') {
          updateStatus(btn.dataset.id, STATUSES.DELETED);
        }
      }, { passive: false });
      
      // Обработчики для вкладок - используем более мягкий подход
      document.addEventListener('touchstart', (e) => {
        const tab = e.target.closest('.tab-button');
        if (!tab) return;
        
        console.log('👆 Touchstart на вкладке:', tab.dataset.target);
        
        // НЕ предотвращаем по умолчанию - это может конфликтовать с PTR
        // Вместо этого используем touchend для активации
      }, { passive: true });
      
      // Активируем вкладку только при touchend
      document.addEventListener('touchend', (e) => {
        const tab = e.target.closest('.tab-button');
        if (!tab) return;
        
        console.log('👆 Touchend на вкладке:', tab.dataset.target);
        
        const targetId = tab.dataset.target;
        if (targetId) {
          activateTabByTarget(targetId);
        }
      });
      
      // Обработчики для поиска
      if (searchInput) {
        searchInput.addEventListener('touchstart', (e) => {
          console.log('👆 Touchstart на поле поиска');
          searchInput.focus();
        });
      }
      
      // Дополнительные обработчики для мобильных устройств
      console.log('📱 Добавляем дополнительные мобильные обработчики...');
      
      // Обработчик для всех кликабельных элементов
      document.addEventListener('touchend', (e) => {
        const target = e.target;
        
        // Проверяем, есть ли у элемента data-action
        if (target.hasAttribute('data-action')) {
          console.log('👆 Touchend на элементе с data-action:', target.dataset.action);
          // Не вызываем действие здесь, оно уже обработано в touchstart
        }
        
        // Проверяем, есть ли у элемента класс tab-button
        if (target.classList.contains('tab-button')) {
          console.log('👆 Touchend на вкладке:', target.dataset.target);
          // Не вызываем действие здесь, оно уже обработано в touchstart
        }
      });
      
      // Обработчик для предотвращения zoom на двойное касание
      let lastTouchEnd = 0;
      document.addEventListener('touchend', (e) => {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
          e.preventDefault();
        }
        lastTouchEnd = now;
      }, false);
      
      console.log('✅ Fallback обработчики настроены');
    } else {
      console.log('💻 Десктопное устройство - fallback не нужен');
    }
  }

  // Делегирование событий для мобильных устройств
  function setupEventDelegation() {
    console.log('🎯 Настраиваем делегирование событий...');
    
    const isMobile = isMobileDevice();
    
    if (isMobile) {
      console.log('📱 Настраиваем делегирование для мобильных устройств...');
      
      // Используем делегирование для всех кликабельных элементов
      document.addEventListener('click', (e) => {
        // Обработка кнопок действий
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
          console.log('🎯 Делегированный клик на кнопке:', actionBtn.dataset.action);
          
          const action = actionBtn.dataset.action;
          if (action === 'apply') {
            openLink(actionBtn.dataset.url);
          } else if (action === 'favorite') {
            updateStatus(actionBtn.dataset.id, STATUSES.FAVORITE);
          } else if (action === 'delete') {
            updateStatus(actionBtn.dataset.id, STATUSES.DELETED);
          }
          return;
        }
        
        // Обработка вкладок
        const tabBtn = e.target.closest('.tab-button');
        if (tabBtn) {
          console.log('🎯 Делегированный клик на вкладке:', tabBtn.dataset.target);
          
          const targetId = tabBtn.dataset.target;
          if (targetId) {
            activateTabByTarget(targetId);
          }
          return;
        }
        
        // Обработка кнопки "Загрузить ещё"
        const loadMoreBtn = e.target.closest('.load-more-btn');
        if (loadMoreBtn) {
          console.log('🎯 Делегированный клик на кнопке "Загрузить ещё"');
          
          const container = loadMoreBtn.closest('.vacancy-list');
          if (container) {
            const key = container.id.replace('vacancies-list-', '');
            fetchNext(key, false);
          }
          return;
        }
        
        // Обработка кнопки очистки поиска
        if (e.target.id === 'search-clear-btn') {
          console.log('🎯 Делегированный клик на кнопке очистки поиска');
          
          if (searchInput) {
            searchInput.value = '';
            searchInputWrapper?.classList.remove('has-text');
            onSearch();
            searchInput.focus();
          }
          return;
        }
      });
      
      // Дополнительная обработка для touch событий
      document.addEventListener('touchstart', (e) => {
        const target = e.target;
        
        // Добавляем визуальную обратную связь для touch (НО НЕ ДЛЯ ВКЛАДОК И КНОПКИ ОЧИСТКИ!)
        if (target.closest('[data-action], .load-more-btn')) {
          target.style.opacity = '0.7';
          target.style.transform = 'scale(0.98)';
          
          // Убираем эффект через 150ms
          setTimeout(() => {
            target.style.opacity = '';
            target.style.transform = '';
          }, 150);
        }
        
        // Отдельная обработка для кнопки очистки - только opacity, без transform
        if (target.closest('#search-clear-btn')) {
          target.style.opacity = '0.7';
          
          // Убираем эффект через 150ms
          setTimeout(() => {
            target.style.opacity = '';
          }, 150);
        }
      });
      
      console.log('✅ Делегирование событий настроено');
    } else {
      console.log('💻 Делегирование не нужно для десктопа');
    }
  }

  // Проверка доступности элементов перед добавлением обработчиков
  function ensureElementAccessibility() {
    console.log('🔒 Проверяем доступность элементов...');
    
    const elements = {
      searchInput: document.getElementById('search-input'),
      searchClearBtn: document.getElementById('search-clear-btn'),
      searchInputWrapper: document.getElementById('search-input')?.parentElement,
      vacanciesContent: document.getElementById('vacancies-content')
    };
    
    const missing = Object.entries(elements)
      .filter(([key, el]) => !el)
      .map(([key]) => key);
    
    if (missing.length > 0) {
      console.warn('⚠️ Отсутствуют элементы:', missing);
      return false;
    }
    
    console.log('✅ Все элементы доступны');
    return true;
  }

  // Улучшенная обработка событий для мобильных устройств
  function setupMobileEventHandlers() {
    console.log('📱 Настраиваем обработчики событий для мобильных устройств...');
    
    const isMobile = isMobileDevice();
    
    if (isMobile) {
      // Убираем стандартные обработчики событий, которые могут конфликтовать
      console.log('📱 Убираем стандартные обработчики для предотвращения конфликтов...');
      
      // Получаем элементы (используем глобальные переменные)
      
      // Очищаем существующие обработчики
      if (searchInput) {
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        // Обновляем ссылку
        searchInput = newSearchInput;
        
        // Обновляем searchInputWrapper
        searchInputWrapper = newSearchInput.parentElement;
        
        // Добавляем обработчики событий для нового элемента
        newSearchInput.addEventListener('input', () => {
          searchInputWrapper?.classList.toggle('has-text', newSearchInput.value.length > 0);
          onSearch();
        });
      }
      
      if (searchClearBtn) {
        const newSearchClearBtn = searchClearBtn.cloneNode(true);
        searchClearBtn.parentNode.replaceChild(newSearchClearBtn, searchClearBtn);
        // Обновляем ссылку
        searchClearBtn = newSearchClearBtn;
        
        // Добавляем обработчики событий для нового элемента
        newSearchClearBtn.addEventListener('click', () => {
          if (searchInput) {
            searchInput.value = '';
            searchInputWrapper?.classList.remove('has-text');
            onSearch();
            searchInput.focus();
          }
        });
      }
      
      console.log('✅ Обработчики событий настроены для мобильных устройств');
    } else {
      console.log('💻 Стандартные обработчики событий оставлены для десктопа');
    }
  }

  // Диагностика производительности для мобильных устройств
  function setupMobilePerformanceMonitoring() {
    console.log('📊 Настраиваем мониторинг производительности для мобильных устройств...');
    
    const isMobile = isMobileDevice();
    
    if (isMobile) {
      // Мониторинг FPS
      let frameCount = 0;
      let lastTime = performance.now();
      
      function countFrames() {
        frameCount++;
        const currentTime = performance.now();
        
        if (currentTime - lastTime >= 1000) {
          const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
          console.log(`📊 FPS: ${fps}`);
          
          if (fps < 30) {
            console.warn('⚠️ Низкая производительность: FPS < 30');
          }
          
          frameCount = 0;
          lastTime = currentTime;
        }
        
        requestAnimationFrame(countFrames);
      }
      
      // Мониторинг памяти (если доступен)
      if ('memory' in performance) {
        setInterval(() => {
          const memory = performance.memory;
          console.log(`📊 Память: ${Math.round(memory.usedJSHeapSize / 1024 / 1024)}MB / ${Math.round(memory.jsHeapSizeLimit / 1024 / 1024)}MB`);
          
          if (memory.usedJSHeapSize > memory.jsHeapSizeLimit * 0.8) {
            console.warn('⚠️ Высокое потребление памяти');
          }
        }, 5000);
      }
      
      // Запускаем мониторинг FPS
      requestAnimationFrame(countFrames);
      
      console.log('✅ Мониторинг производительности запущен');
    } else {
      console.log('💻 Мониторинг производительности не нужен для десктопа');
    }
  }

  // Улучшенная функция инициализации
  async function init() {
    console.log('🚀 Инициализация приложения...');
    
    // Показываем лоадер в самом начале
    showLoader();
    
    // Увеличиваем таймаут для лоадера на мобильных устройствах
    const loaderTimeout = setTimeout(() => {
      console.warn('⚠️ Лоадер висит слишком долго, принудительно скрываем');
      hideLoader();
    }, 25000); // 25 секунд для мобильных устройств
    
    // Проверяем критические элементы
    console.log('🔍 Проверяем критические элементы...');
    console.log('containers.main:', containers.main);
    console.log('containers.maybe:', containers.maybe);
    console.log('containers.other:', containers.other);
    
    if (!containers.main || !containers.maybe || !containers.other) {
      console.error('❌ Критическая ошибка: не найдены контейнеры для вакансий');
      hideLoader();
      safeAlert('Приложение не может запуститься. Перезагрузите страницу.');
      return;
    }

    console.log('✅ Критические элементы найдены');

    Object.keys(containers).forEach(k => {
      containers[k].style.display = (k === state.activeKey) ? '' : 'none';
    });

    tabButtons.forEach(b => {
      const active = (b.dataset.target || '').endsWith('-main');
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    
    console.log('🔄 Настраиваем Pull-to-Refresh...');
    setupPullToRefresh({
        onRefresh: () => refetchFromZeroSmooth(state.activeKey),
        refreshEventName: 'feed:loaded'
    });
    
    // Настраиваем fallback для мобильных устройств
    setupMobileFallbacks();
    setupEventDelegation(); // Добавляем вызов новой функции
    
    // Проверяем доступность элементов и настраиваем обработчики
    if (ensureElementAccessibility()) {
      setupMobileEventHandlers();
      setupMobilePerformanceMonitoring(); // Добавляем вызов новой функции
    }
    
    // Приоритетная загрузка только основной категории для быстрого отображения
    console.log('📥 Загружаем основную категорию...');
    try {
    await fetchNext('main', true);
      console.log('✅ Основная категория загружена успешно');
      
      // Скрываем лоадер после загрузки основной категории
      clearTimeout(loaderTimeout);
      hideLoader();
      
    } catch (error) {
      console.error('❌ Ошибка загрузки основной категории:', error);
      clearTimeout(loaderTimeout);
      hideLoader();
      renderError(containers.main, error.message, () => refetchFromZeroSmooth('main'));
      return;
    }
    
    // Отложенная загрузка счетчиков и остальных категорий
    console.log('⏰ Планируем отложенную загрузку...');
    setTimeout(async () => {
      try {
        console.log('📊 Загружаем счетчики...');
        // Загружаем счетчики отдельно с увеличенным таймаутом
        await fetchCountsAll('');
        console.log('✅ Счетчики загружены');
      } catch (error) {
        console.warn('⚠️ Ошибка загрузки счетчиков:', error);
        // Не блокируем работу приложения
      }
      
      // Фоновая загрузка остальных категорий
      console.log('🔄 Загружаем остальные категории...');
        const backgroundLoads = ['maybe', 'other']
            .filter(k => !state[k].loadedOnce)
            .map(k => fetchNext(k, false).catch(error => {
              console.warn(`⚠️ Фоновая загрузка ${k} неуспешна:`, error);
                return null;
            }));
            
        if (backgroundLoads.length > 0) {
            await Promise.allSettled(backgroundLoads);
          console.log('✅ Фоновая загрузка завершена');
        }
    }, 1000); // Увеличиваем задержку до 1 секунды

    updateSearchStats();
    console.log('🎉 Инициализация завершена');
  }
  
  function handlePageVisibility() {
      if (document.visibilityState === 'visible') {
          try {
              if (localStorage.getItem('needs-refresh-main') === 'true') {
                  localStorage.removeItem('needs-refresh-main');
                  uiToast('Обновление ленты...');
                  fetchCountsAll(state.query);
                  refetchFromZeroSmooth(state.activeKey);
              }
          } catch (error) {
              console.warn('localStorage недоступен:', error);
              // Fallback: просто обновляем без проверки флага
              uiToast('Обновление ленты...');
              fetchCountsAll(state.query);
              refetchFromZeroSmooth(state.activeKey);
          }
      }
  }
  document.addEventListener('visibilitychange', handlePageVisibility);

  // Улучшенная инициализация с проверкой готовности DOM
  function waitForDOM() {
    return new Promise((resolve) => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', resolve);
      } else {
        resolve();
      }
    });
  }

  // Проверка критических элементов
  function checkCriticalElements() {
    const critical = {
      containers: {
        main: document.getElementById('vacancies-list-main'),
        maybe: document.getElementById('vacancies-list-maybe'),
        other: document.getElementById('vacancies-list-other'),
      },
      counts: {
        main: document.getElementById('count-main'),
        maybe: document.getElementById('count-maybe'),
        other: document.getElementById('count-other'),
      },
      other: {
        searchInput: document.getElementById('search-input'),
        loader: document.getElementById('loader'),
        tabButtons: document.querySelectorAll('.tab-button'),
        vacancyLists: document.querySelectorAll('.vacancy-list'),
      }
    };

    console.log('🔍 Проверяем критические элементы:', critical);
    
    // Проверяем контейнеры
    const missingContainers = Object.entries(critical.containers)
      .filter(([key, el]) => !el)
      .map(([key]) => key);
    
    if (missingContainers.length > 0) {
      console.error('❌ Отсутствуют контейнеры:', missingContainers);
      return false;
    }

    // Проверяем счетчики
    const missingCounts = Object.entries(critical.counts)
      .filter(([key, el]) => !el)
      .map(([key]) => key);
    
    if (missingCounts.length > 0) {
      console.error('❌ Отсутствуют счетчики:', missingCounts);
      return false;
    }

    // Проверяем остальные элементы
    const missingOther = Object.entries(critical.other)
      .filter(([key, el]) => !el || (Array.isArray(el) && el.length === 0))
      .map(([key]) => key);
    
    if (missingOther.length > 0) {
      console.error('❌ Отсутствуют элементы:', missingOther);
      return false;
    }

    console.log('✅ Все критические элементы найдены');
    return true;
  }

  // Основная функция инициализации
  async function mainInit() {
    try {
      console.log('🚀 Начинаем инициализацию приложения...');
      
      // Ждем готовности DOM
      await waitForDOM();
      console.log('✅ DOM готов');
      
      // Инициализируем MCP Manager
      if (window.MCPManager) {
        mcpManager = new window.MCPManager();
        console.log('🔧 MCP Manager инициализирован');
      } else {
        console.warn('⚠️ MCPManager не найден, Context7 недоступен');
      }
      
      // Проверяем критические элементы
      if (!checkCriticalElements()) {
        throw new Error('Критические элементы не найдены');
      }
      
      // Инициализируем приложение
      await init();
      
    } catch (error) {
      console.error('❌ Критическая ошибка инициализации:', error);
      
      // Показываем пользователю ошибку
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #ff4444;
        color: white;
        padding: 20px;
        border-radius: 8px;
        text-align: center;
        z-index: 10000;
        max-width: 80%;
      `;
             UTIL.setSafeHTML(errorDiv, `
         <h3>Ошибка загрузки приложения</h3>
         <p>${error.message}</p>
         <button onclick="location.reload()" style="
           background: white;
           color: #ff4444;
           border: none;
           padding: 10px 20px;
           border-radius: 4px;
           margin-top: 10px;
           cursor: pointer;
         ">Перезагрузить</button>
       `);
      document.body.appendChild(errorDiv);
    }
  }

  // Запускаем инициализацию
  mainInit();
})();
