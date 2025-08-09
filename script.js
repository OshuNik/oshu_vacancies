// =================================================================================
// SCRIPT.JS - FINAL CORRECTED VERSION
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
    headerActions: document.getElementById('header-actions'),
    searchContainer: document.getElementById('search-container'),
    searchInput: document.getElementById('search-input'),
    searchStats: document.querySelector('.search-stats'),
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
        if (!this.searchQuery) {
            return this.allVacancies;
        }
        const query = this.searchQuery.toLowerCase();
        return this.allVacancies.filter(v =>
            (v.search_text || '').toLowerCase().includes(query)
        );
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
        const response = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${id}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ status: newStatus })
        });
        if (!response.ok) throw new Error(`API Error on status update: ${response.statusText}`);
    },
    async clearCategory(categoryName) {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?category=eq.${categoryName}&status=eq.new`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'deleted' })
        });
        if (!response.ok) throw new Error(`API Error on category clear: ${response.statusText}`);
    }
};


// =================================================================================
// --- VIEW / RENDERER ---
// =================================================================================
const view = {
    // --- Progress Bar ---
    setProgress(pct) { if (ui.progressBar) ui.progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`; },
    startProgress() { this.setProgress(5); },
    finishProgress() { setTimeout(() => this.setProgress(100), 0); },
    resetProgress() { setTimeout(() => this.setProgress(0), 250); },
    
    // --- Main Layout Toggles ---
    showLoader() {
        ui.loader.classList.remove('hidden');
        ui.content.classList.add('hidden');
        ui.headerActions.classList.add('hidden');
        ui.searchContainer.classList.add('hidden');
        ui.categoryTabs.classList.add('hidden');
    },
    showContent(hasVacancies) {
        ui.loader.classList.add('hidden');
        ui.content.classList.remove('hidden');
        ui.headerActions.classList.remove('hidden');
        ui.categoryTabs.classList.remove('hidden');
        if (hasVacancies) {
            ui.searchContainer.classList.remove('hidden');
        }
    },

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
    escapeHtml(s = '') {
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
    },
    highlightText(text = '', query = '') {
        if (!query || !text) return this.escapeHtml(text);
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, 'gi');
        return this.escapeHtml(text).replace(regex, '<mark class="highlight">$1</mark>');
    },
    formatSmartTime(isoString) {
        if (!isoString) return '';
        const d = new Date(isoString);
        const now = new Date();
        const diffMs = now - d;
        const sec = Math.floor(diffMs / 1000);
        const min = Math.floor(sec / 60);

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
            card,
            categoryTitle: card.querySelector('.card-category-title'),
            summary: card.querySelector('.card-summary'),
            infoGrid: card.querySelector('.info-grid'),
            details: card.querySelector('details'),
            detailsText: card.querySelector('.vacancy-text'),
            skillTags: card.querySelector('.footer-skill-tags'),
            channelName: card.querySelector('.channel-name'),
            timestamp: card.querySelector('.timestamp-footer'),
            applyBtn: card.querySelector('.apply'),
        };

        const isValid = val => val && val !== 'null' && val !== 'не указано';
        
        // Set IDs, classes and base data
        card.id = `card-${v.id}`;
        card.dataset.id = v.id;
        card.classList.add(`category-${CATEGORY_MAP[v.category] || 'other'}`);
        cardEls.categoryTitle.textContent = v.category || 'NO_CATEGORY';
        cardEls.summary.innerHTML = this.highlightText(v.reason, appState.searchQuery);
        
        // Info Grid (Corrected Logic)
        cardEls.infoGrid.innerHTML = '';
        const infoRows = [
            { label: 'ФОРМАТ', value: [v.employment_type, v.work_format].filter(isValid).join(' / '), type: 'default' },
            { label: 'ОПЛАТА', value: v.salary_display_text, type: 'salary' },
            { label: 'СФЕРА', value: [v.industry, v.company_name ? `(${v.company_name})` : ''].filter(isValid).join(' '), type: 'industry' }
        ];

        infoRows.forEach(row => {
            if (isValid(row.value)) {
                const highlightedValue = this.highlightText(row.value, appState.searchQuery);
                const valueHtml = `<span class="highlight ${row.type}">${highlightedValue}</span>`;
                cardEls.infoGrid.innerHTML += `<div class="info-label">${row.label} >></div><div class="info-value">${valueHtml}</div>`;
            }
        });

        // Details (full text)
        const hasDetails = v.text_highlighted || (v.has_image && v.message_link);
        if (hasDetails) {
            let detailsContent = '';
            if(v.has_image && v.message_link) {
                detailsContent += `<a href="${v.message_link}" target="_blank" class="image-link-button">[ Изображение ]</a><br><br>`;
            }
            if(v.text_highlighted) {
                // The HTML from Supabase is already formatted with <br>, just highlight it.
                detailsContent += v.text_highlighted.replace(new RegExp(`(${appState.searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, 'gi'), '<mark class="highlight">$1</mark>');
            }
            cardEls.detailsText.innerHTML = detailsContent;
        } else {
            cardEls.details.remove();
        }

        // Footer
        if (v.skills && v.skills.length > 0) {
            cardEls.skillTags.innerHTML = v.skills.slice(0, 3).map(skill => {
                const isPrimary = PRIMARY_SKILLS.includes(String(skill).toLowerCase());
                return `<span class="footer-skill-tag ${isPrimary ? 'primary' : ''}">${this.escapeHtml(skill)}</span>`;
            }).join('');
        }
        cardEls.channelName.textContent = v.channel || '';
        cardEls.timestamp.textContent = this.formatSmartTime(v.timestamp);
        if(!v.channel) card.querySelector('.footer-meta').style.justifyContent = 'flex-end';
        
        // Actions
        if (!v.apply_url) cardEls.applyBtn.remove();
        
        return card;
    },

    // --- Main Render Function ---
    render() {
        // Reset all containers
        Object.values(ui.containers).forEach(c => c.innerHTML = '');
        
        // Filter vacancies for rendering based on current search
        const vacanciesToRender = appState.filteredVacancies;
        
        // Update total counts based on all vacancies
        const categorizedTotal = { main: 0, maybe: 0, other: 0 };
        appState.allVacancies.forEach(v => {
            const categoryKey = CATEGORY_MAP[v.category] || 'other';
            categorizedTotal[categoryKey]++;
        });
        ui.counts.main.textContent = `(${categorizedTotal.main})`;
        ui.counts.maybe.textContent = `(${categorizedTotal.maybe})`;
        ui.counts.other.textContent = `(${categorizedTotal.other})`;
        
        // Render cards that match the filter
        vacanciesToRender.forEach(v => {
            const categoryKey = CATEGORY_MAP[v.category] || 'other';
            const container = ui.containers[categoryKey];
            if (container) {
                const card = this.createCard(v);
                container.appendChild(card);
            }
        });

        // Add empty states if needed
        Object.keys(ui.containers).forEach(key => {
            if (ui.containers[key].children.length === 0) {
                const message = appState.searchQuery ? 'Ничего не найдено в этой категории' : '-- Пусто в этой категории --';
                ui.containers[key].innerHTML = this.getEmptyStateHtml(message);
            }
        });

        // Update search stats
        if (ui.searchStats) {
            if (appState.searchQuery) {
                ui.searchStats.textContent = `Найдено: ${vacanciesToRender.length}`;
            } else {
                ui.searchStats.textContent = '';
            }
        }
    }
};

// =================================================================================
// --- UTILITY FUNCTIONS ---
// =================================================================================
const debounce = (fn, delay = 250) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
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
                .map(v => ({
                    ...v,
                    search_text: [v.category, v.reason, v.industry, v.company_name, v.text_highlighted, ...(v.skills || [])].join(' ')
                }));
            
            appState.isLoading = false;
            view.finishProgress();
            setTimeout(() => { // Short delay to allow progress bar to finish
                view.showContent(appState.allVacancies.length > 0);
                view.render();
                document.dispatchEvent(new CustomEvent('vacancies:loaded'));
            }, 300);
        } catch (error) {
            console.error('Initialization failed:', error);
            ui.loader.innerHTML = view.getEmptyStateHtml(`Ошибка загрузки: ${error.message}`);
            document.dispatchEvent(new CustomEvent('vacancies:loaded'));
        }
    },

    handleTabClick(e) {
        const button = e.currentTarget;
        appState.activeTab = button.dataset.target.replace('vacancies-list-', '');
        
        ui.tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        document.querySelectorAll('.vacancy-list').forEach(list => list.classList.remove('active'));
        document.getElementById(button.dataset.target).classList.add('active');
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
                console.error('Failed to update status:', error);
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
                console.error(`Failed to clear category ${categoryName}:`, error);
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

// --- PULL-TO-REFRESH & INITIALIZATION ---
(function setupPTR() {
    // A full pull-to-refresh implementation is complex and can be buggy.
    // For now, we rely on manual refresh or re-opening the app.
    // The 'vacancies:loaded' event is dispatched to support this if added later.
})();


// --- INITIALIZE THE APP ---
document.addEventListener('DOMContentLoaded', () => controller.init());
