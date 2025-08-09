// =================================================================================
// SCRIPT.JS - FINAL & STABLE VERSION
// =================================================================================

// --- INITIALIZE TELEGRAM ---
const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
if (tg) tg.expand();

// --- CONSTANTS ---
const SUPABASE_URL = 'https://lwfhtwnfqmdjwzrdznvv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j2pTEm1MIJTXyAeluGHocQ_w16iaDj4';
const PRIMARY_SKILLS = ['after effects', 'unity', 'монтаж видео', '2d-анимация', 'рилсы', 'premiere pro'];
const CATEGORY_MAP = {
    'ТОЧНО ТВОЁ': 'main',
    'МОЖЕТ БЫТЬ': 'maybe',
    'НЕ ТВОЁ': 'other'
};

// =================================================================================
// --- DOM ELEMENTS ---
// =================================================================================
const ui = {
    loader: document.getElementById('loader'),
    progressBar: document.getElementById('progress-bar'),
    content: document.getElementById('vacancies-content'),
    searchContainer: document.getElementById('search-container'),
    searchInput: document.getElementById('search-input'),
    categoryTabs: document.getElementById('category-tabs'),
    tabButtons: document.querySelectorAll('.tab-button'),
    confirmOverlay: document.getElementById('custom-confirm-overlay'),
    confirmText: document.getElementById('custom-confirm-text'),
    confirmOkBtn: document.getElementById('confirm-btn-ok'),
    confirmCancelBtn: document.getElementById('confirm-btn-cancel'),
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
    cardTemplate: document.getElementById('vacancy-card-template'),
};


// =================================================================================
// --- STATE MANAGEMENT ---
// =================================================================================
const appState = {
    allVacancies: [],
    isLoading: true,
    activeTab: 'main',
    searchQuery: '',
    get filteredVacancies() {
        if (!this.searchQuery) return this.allVacancies;
        const query = this.searchQuery.toLowerCase();
        return this.allVacancies.filter(v => (v.search_text || '').toLowerCase().includes(query));
    },
};


// =================================================================================
// --- API HELPERS ---
// =================================================================================
const api = {
    async fetchVacancies() {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?status=eq.new&select=*`, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        if (!response.ok) throw new Error(`Network error: ${response.statusText}`);
        return await response.json();
    },
    async updateVacancyStatus(id, newStatus) {
        await fetch(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${id}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
    },
    async clearCategory(categoryName) {
        await fetch(`${SUPABASE_URL}/rest/v1/vacancies?category=eq.${categoryName}&status=eq.new`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'deleted' })
        });
    }
};


// =================================================================================
// --- VIEW / RENDERER ---
// =================================================================================
const view = {
    // --- Progress Bar & Layout Toggles ---
    setProgress(pct) { if (ui.progressBar) ui.progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`; },
    startProgress() { this.setProgress(5); },
    finishProgress() { setTimeout(() => this.setProgress(100), 0); },
    showLoader() { ui.loader.classList.remove('hidden'); ui.content.classList.add('hidden'); },
    showContent() { ui.loader.classList.add('hidden'); ui.content.classList.remove('hidden'); },

    // --- Confirmation Dialog ---
    showConfirm(message, callback) {
        ui.confirmText.textContent = message;
        ui.confirmOverlay.classList.remove('hidden');
        ui.confirmOkBtn.onclick = () => { ui.confirmOverlay.classList.add('hidden'); callback(true); };
        ui.confirmCancelBtn.onclick = () => { ui.confirmOverlay.classList.add('hidden'); callback(false); };
    },
    
    // --- Helper Functions ---
    getEmptyStateHtml(message) {
        const gifUrl = 'https://raw.githubusercontent.com/OshuNik/oshu_vacancies/5325db67878d324810971a262d689ea2ec7ac00f/img/Uploading%20a%20vacancy.%20The%20doggie.gif';
        return `<div class="empty-state"><img src="${gifUrl}" alt="Dog" class="empty-state-gif" /><p class="empty-state-text">${message}</p></div>`;
    },
    escapeHtml(s = '') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); },
    highlightPlainText(text = '', query = '') {
        if (!query || !text) return this.escapeHtml(text);
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, 'gi');
        return this.escapeHtml(text).replace(regex, '<mark class="highlight">$1</mark>');
    },
    highlightHtml(html = '', query = '') {
        if (!query || !html) return html;
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![^<]*>|[^<>]*</)`, 'gi');
        return html.replace(regex, '<mark class="highlight">$1</mark>');
    },
    formatSmartTime(isoString) {
        if (!isoString) return '';
        const d = new Date(isoString), now = new Date();
        const diffMs = now - d, sec = Math.floor(diffMs / 1000), min = Math.floor(sec / 60);
        const pad = n => n.toString().padStart(2, '0');
        const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        if (sec < 30) return 'только что';
        if (min < 60) return `${min} мин назад`;
        if (now.toDateString() === d.toDateString()) return `сегодня, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        const yest = new Date(now); yest.setDate(now.getDate() - 1);
        if (yest.toDateString() === d.toDateString()) return `вчера, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        return `${d.getDate().toString().padStart(2,'0')} ${months[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },

    // --- Card Builder ---
    createCard(v) {
        const card = ui.cardTemplate.content.cloneNode(true).firstElementChild;
        const cardEls = {
            card, categoryTitle: card.querySelector('.card-category-title'), summary: card.querySelector('.card-summary'),
            infoGrid: card.querySelector('.info-grid'), details: card.querySelector('details'), detailsText: card.querySelector('.vacancy-text'),
            skillTags: card.querySelector('.footer-skill-tags'), channelName: card.querySelector('.channel-name'), timestamp: card.querySelector('.timestamp-footer'),
            applyBtn: card.querySelector('.apply'),
        };
        const isValid = val => val && val !== 'null' && val !== 'не указано';
        card.id = `card-${v.id}`; card.dataset.id = v.id;
        card.classList.add(`category-${CATEGORY_MAP[v.category] || 'other'}`);
        cardEls.categoryTitle.textContent = v.category || 'NO_CATEGORY';
        
        // Use highlightPlainText for fields that are definitely not HTML
        cardEls.summary.innerHTML = this.highlightPlainText(v.reason, appState.searchQuery);
        
        cardEls.infoGrid.innerHTML = '';
        const infoRows = [
            { label: 'ФОРМАТ', value: [v.employment_type, v.work_format].filter(isValid).join(' / ') },
            { label: 'ОПЛАТА', value: v.salary_display_text },
            { label: 'СФЕРА', value: [v.industry, v.company_name ? `(${v.company_name})` : ''].filter(isValid).join(' ') }
        ];
        infoRows.forEach(row => {
            if (isValid(row.value)) {
                cardEls.infoGrid.innerHTML += `<div class="info-label">${row.label} >></div><div class="info-value">${this.highlightPlainText(row.value, appState.searchQuery)}</div>`;
            }
        });

        // Use highlightHtml for the field that contains HTML tags
        const hasDetails = v.text_highlighted;
        if (hasDetails) {
            cardEls.detailsText.innerHTML = this.highlightHtml(v.text_highlighted, appState.searchQuery);
        } else { cardEls.details.remove(); }
        
        if (v.skills && v.skills.length > 0) {
            cardEls.skillTags.innerHTML = v.skills.slice(0, 3).map(skill => `<span class="footer-skill-tag ${PRIMARY_SKILLS.includes(String(skill).toLowerCase()) ? 'primary' : ''}">${this.escapeHtml(skill)}</span>`).join('');
        }
        cardEls.channelName.textContent = v.channel || '';
        cardEls.timestamp.textContent = this.formatSmartTime(v.timestamp);
        if(!v.channel) card.querySelector('.footer-meta').style.justifyContent = 'flex-end';
        if (!v.apply_url) cardEls.applyBtn.remove();
        return card;
    },

    // --- Main Render Function ---
    render() {
        const categorizedTotal = { main: 0, maybe: 0, other: 0 };
        appState.allVacancies.forEach(v => {
            const key = CATEGORY_MAP[v.category] || 'other';
            categorizedTotal[key]++;
        });
        ui.counts.main.textContent = `(${categorizedTotal.main})`;
        ui.counts.maybe.textContent = `(${categorizedTotal.maybe})`;
        ui.counts.other.textContent = `(${categorizedTotal.other})`;

        const activeCategoryName = Object.keys(CATEGORY_MAP).find(key => CATEGORY_MAP[key] === appState.activeTab);
        const vacanciesForActiveTab = appState.filteredVacancies.filter(v => (CATEGORY_MAP[v.category] || 'other') === appState.activeTab);
        
        const activeContainer = ui.containers[appState.activeTab];
        if (!activeContainer) return;
        activeContainer.innerHTML = '';
        
        if (vacanciesForActiveTab.length === 0) {
            const message = appState.searchQuery ? `Ничего не найдено в "${activeCategoryName}"` : `-- Пусто в этой категории --`;
            activeContainer.innerHTML = this.getEmptyStateHtml(message);
        } else {
            const fragment = document.createDocumentFragment();
            vacanciesForActiveTab.forEach(v => fragment.appendChild(this.createCard(v)));
            activeContainer.appendChild(fragment);
        }
    }
};

// =================================================================================
// --- UTILITY FUNCTIONS ---
// =================================================================================
const debounce = (fn, delay = 250) => {
    let timeoutId;
    return (...args) => { clearTimeout(timeoutId); timeoutId = setTimeout(() => fn(...args), delay); };
};

// =================================================================================
// --- CONTROLLERS / EVENT HANDLERS ---
// =================================================================================
const controller = {
    async init() {
        this.setupEventListeners();
        view.showLoader();
        view.startProgress();
        try {
            const vacancies = await api.fetchVacancies();
            appState.allVacancies = vacancies
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .map(v => ({...v, search_text: [v.category, v.reason, v.industry, v.company_name, v.text_highlighted, ...(v.skills || [])].join(' ') }));
            view.finishProgress();
            setTimeout(() => {
                view.showContent();
                view.render();
            }, 300);
        } catch (error) {
            console.error('Initialization failed:', error);
            ui.loader.innerHTML = view.getEmptyStateHtml(`Ошибка загрузки: ${error.message}`);
        }
    },

    handleTabClick(e) {
        const button = e.currentTarget;
        appState.activeTab = button.dataset.target.replace('vacancies-list-', '');
        ui.tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        document.querySelectorAll('.vacancy-list').forEach(list => list.classList.remove('active'));
        document.getElementById(button.dataset.target).classList.add('active');
        view.render();
    },

    async handleActionClick(e) {
        const cardAction = e.target.closest('.card-action-btn');
        if (!cardAction) return;
        const card = cardAction.closest('.vacancy-card');
        const id = card.dataset.id;
        let status = null;
        if (cardAction.classList.contains('favorite')) status = 'favorite';
        else if (cardAction.classList.contains('delete')) status = 'deleted';
        else if (cardAction.classList.contains('apply')) {
            const vacancy = appState.allVacancies.find(v => v.id === id);
            if (vacancy && vacancy.apply_url && tg) tg.openLink(vacancy.apply_url);
            return;
        }
        if (id && status) {
            card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.95)';
            try {
                await api.updateVacancyStatus(id, status);
                appState.allVacancies = appState.allVacancies.filter(v => v.id !== id);
                view.render();
            } catch (error) {
                if (tg) tg.showAlert('Не удалось обновить статус.');
                card.style.opacity = '1';
                card.style.transform = 'scale(1)';
            }
        }
    },
    
    handleSearch: debounce((e) => {
        appState.searchQuery = e.target.value.trim();
        view.render();
    }),

    handleClearCategory(button) {
        const categoryName = button.dataset.categoryName;
        if (!categoryName) return;
        view.showConfirm(`Вы уверены, что хотите удалить все из категории "${categoryName}"?`, async (confirmed) => {
            if (!confirmed) return;
            try {
                await api.clearCategory(categoryName);
                appState.allVacancies = appState.allVacancies.filter(v => v.category !== categoryName);
                view.render();
            } catch (error) {
                if (tg) tg.showAlert('Не удалось очистить категорию.');
            }
        });
    },

    setupEventListeners() {
        ui.tabButtons.forEach(button => {
            button.addEventListener('click', this.handleTabClick);
            let pressTimer = null;
            const startPress = () => { pressTimer = setTimeout(() => this.handleClearCategory(button), 800); };
            const cancelPress = () => clearTimeout(pressTimer);
            button.addEventListener('mousedown', startPress);
            button.addEventListener('mouseup', cancelPress);
            button.addEventListener('mouseleave', cancelPress);
            button.addEventListener('touchstart', startPress, { passive: true });
            button.addEventListener('touchend', cancelPress);
        });
        ui.searchInput.addEventListener('input', this.handleSearch);
        ui.content.addEventListener('click', this.handleActionClick);
    }
};

// --- INITIALIZE THE APP ---
document.addEventListener('DOMContentLoaded', () => controller.init());
