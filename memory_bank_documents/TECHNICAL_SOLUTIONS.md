# 🛠️ ТЕХНИЧЕСКИЕ РЕШЕНИЯ И КОД

## 🔧 КЛЮЧЕВЫЕ ФУНКЦИИ И НАСТРОЙКИ

### Pull-to-Refresh (PTR) - Финальная конфигурация

#### Основные параметры
```javascript
// utils.js - основные настройки PTR
const THRESHOLD = 60;           // Порог активации для браузера
const BAR_HEIGHT = 75;          // Высота плашки PTR
const safeZone = 30;            // Безопасная зона для браузера
const resistance = 0.7;         // Сопротивление для браузера
```

#### Telegram Mini App оптимизация
```javascript
// utils.js - специальные настройки для Mini App
if (isMiniApp) {
    THRESHOLD = 30;             // Низкий порог для Mini App
    safeZone = 10;              // Малая безопасная зона
    resistance = 0.6;           // Плавное сопротивление
}
```

#### Плавность анимации
```javascript
// utils.js - плавные переходы
wrapper.style.transition = 'transform 0.1s ease-out';  // При перетаскивании
wrapper.style.transition = 'transform 0.3s ease-out';  // При смене состояний
```

### Загрузчик - Правильная конфигурация

#### CSS для ретро-загрузчика
```css
/* style.css - ретро-загрузчик */
.loader-container {
    background-color: var(--background-color);  /* Светло-серый фон */
}

.retro-progress-bar-fill {
    background-color: var(--accent-green);      /* Зеленая полоса */
    background-image: linear-gradient(45deg, rgba(0,0,0,0.15) 25%, transparent 25%, transparent 50%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.15) 75%, transparent 75%, transparent);
    background-size: 16px 16px;                /* Полосатый узор */
    animation: loading-progress 2s ease-out infinite;
}

.loader-text {
    color: var(--text-color);                  /* Черный текст */
}
```

#### JavaScript таймауты
```javascript
// script.js - оптимизированные таймауты для мобильных
const loaderTimeout = 25000;                    // 25 секунд для мобильных
const fetchTimeout = 20000;                     // 20 секунд для API
```

### Мобильная оптимизация

#### Touch события
```javascript
// script.js - мобильные fallback'и
function setupMobileEventHandlers() {
    // Клонирование элементов поиска для удаления старых listeners
    const newSearchInput = searchInput.cloneNode(true);
    const newSearchClearBtn = searchClearBtn.cloneNode(true);
    
    // Перепривязка event listeners
    searchInput = newSearchInput;
    searchClearBtn = newSearchClearBtn;
}
```

#### Event delegation
```javascript
// script.js - делегирование событий
function setupEventDelegation() {
    document.addEventListener('click', (e) => {
        const target = e.target;
        
        // Визуальная обратная связь для touch
        if (target.closest('.card-action-btn, .header-button, .tab-button')) {
            target.style.transform = 'scale(0.95)';
            setTimeout(() => target.style.transform = '', 100);
        }
    });
}
```

### Вкладки - Исправления

#### Длинный тап
```css
/* style.css - анимация длинного тапа */
.tab-button::after {
    transition: transform 1.2s ease-out;       /* Синхронизировано с holdMs */
}
```

#### JavaScript обработка
```javascript
// script.js - длинный тап для вкладок
const holdMs = 1200;                           // 1.2 секунды
let hasMoved = false;

function checkMovement(touch) {
    const moveThreshold = 10;
    return Math.abs(touch.clientX - startX) > moveThreshold || 
           Math.abs(touch.clientY - startY) > moveThreshold;
}
```

## 📱 МОБИЛЬНЫЕ СПЕЦИФИКИ

### Размеры для touch
```css
/* style.css - мобильная адаптация */
@media (max-width: 768px) {
    .card-action-btn {
        width: 44px !important;                /* Минимальный размер для touch */
        height: 44px !important;
    }
    
    .search-input {
        height: 48px !important;               /* Увеличенная высота для мобильных */
        font-size: 16px !important;            /* Предотвращает zoom в iOS */
    }
}
```

### Производительность
```javascript
// script.js - оптимизация производительности
function setupMobilePerformanceMonitoring() {
    let lastTime = performance.now();
    let frameCount = 0;
    
    function countFPS() {
        frameCount++;
        const currentTime = performance.now();
        
        if (currentTime - lastTime >= 1000) {
            const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
            console.log(`FPS: ${fps}`);
            frameCount = 0;
            lastTime = currentTime;
        }
        
        requestAnimationFrame(countFPS);
    }
    
    requestAnimationFrame(countFPS);
}
```

## 🔄 API И ДАННЫЕ

### Supabase конфигурация
```javascript
// config.js - настройки API
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

// api-service.js - основные методы
class ApiService {
    async fetchVacancies(category, page = 1, query = '') {
        const url = this.buildUrl('/vacancies', { category, page, query });
        return this.fetchWithTimeout(url, 20000);
    }
    
    async fetchCounts() {
        const url = this.buildUrl('/counts');
        return this.fetchWithTimeout(url, 15000);
    }
}
```

### Обработка ошибок
```javascript
// script.js - graceful error handling
async function fetchNext(category, isPriority = false) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        
        const response = await apiService.fetchVacancies(category, currentPage, searchQuery);
        clearTimeout(timeoutId);
        
        return response;
    } catch (error) {
        if (error.name === 'AbortError') {
            showToast('Превышено время ожидания', 'error');
        } else {
            showToast('Ошибка загрузки данных', 'error');
        }
        console.error('Fetch error:', error);
        return null;
    }
}
```

## 🎨 CSS ПЕРЕМЕННЫЕ И ТЕМЫ

### Основная цветовая схема
```css
/* style.css - CSS переменные */
:root {
    --background-color: #F0F0F0;               /* Основной фон */
    --card-color: #FFFFFF;                     /* Карточки */
    --text-color: #000000;                     /* Текст */
    --hint-color: #666666;                     /* Подсказки */
    
    --border-width: 2px;                       /* Толщина границ */
    --border-color: #000000;                   /* Цвет границ */
    --shadow-offset: 4px;                      /* Смещение теней */
    
    --accent-red: #FF5C5C;                     /* Ошибки/удаление */
    --accent-yellow: #FFD93D;                  /* Предупреждения */
    --accent-green: #6BCB77;                   /* Успех/актив */
    --accent-blue: #41A6FF;                    /* Информация */
    
    --transition-fast: 0.1s ease-out;          /* Быстрые переходы */
    --transition-normal: 0.2s ease-out;        /* Обычные переходы */
    --transition-slow: 0.3s ease-out;          /* Медленные переходы */
}
```

### Тени и эффекты
```css
/* style.css - ретро-стиль теней */
--box-shadow: var(--shadow-offset) var(--shadow-offset) 0px var(--border-color);
--box-shadow-pressed: calc(var(--shadow-offset)/2) calc(var(--shadow-offset)/2) 0px var(--border-color);

/* Применение в компонентах */
.card-action-btn:active {
    transform: translate(calc(var(--shadow-offset)/2), calc(var(--shadow-offset)/2));
    box-shadow: var(--box-shadow-pressed);
}
```

## 🚀 ОПТИМИЗАЦИИ ПРОИЗВОДИТЕЛЬНОСТИ

### Параллельная загрузка
```javascript
// script.js - оптимизированная инициализация
async function init() {
    try {
        // Параллельная загрузка основного контента и счетчиков
        const [mainResult, countsResult] = await Promise.allSettled([
            fetchNext('main', true),
            fetchCountsAll()
        ]);
        
        // Обработка результатов
        if (mainResult.status === 'fulfilled') {
            displayVacancies('main', mainResult.value);
        }
        
        if (countsResult.status === 'fulfilled') {
            updateCounts(countsResult.value);
        }
        
    } catch (error) {
        console.error('Initialization error:', error);
        showToast('Ошибка инициализации', 'error');
    }
}
```

### Кэширование и мемоизация
```javascript
// script.js - кэш для поиска
const searchCache = new Map();

function getCachedSearchResults(query, category) {
    const key = `${category}:${query}`;
    return searchCache.get(key);
}

function cacheSearchResults(query, category, results) {
    const key = `${category}:${query}`;
    searchCache.set(key, results);
    
    // Ограничение размера кэша
    if (searchCache.size > 100) {
        const firstKey = searchCache.keys().next().value;
        searchCache.delete(firstKey);
    }
}
```

## 🔍 ОТЛАДКА И ЛОГИРОВАНИЕ

### Ключевые точки логирования
```javascript
// script.js - стратегические console.log
console.log('🚀 App initialization started');
console.log('📱 Mobile device detected:', isMobileDevice());
console.log('🔄 PTR state changed:', state);
console.log('📊 Fetch completed:', { category, count: data.length });
console.log('⚡ Performance metric:', { fps, memory: performance.memory?.usedJSHeapSize });
```

### Error boundaries
```javascript
// script.js - обработка критических ошибок
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    showToast('Произошла критическая ошибка', 'error');
    
    // Попытка восстановления
    setTimeout(() => {
        location.reload();
    }, 3000);
});
```

---
*Этот файл содержит все ключевые технические решения для быстрого восстановления контекста*
