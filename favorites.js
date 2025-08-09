// =================================================================================
// FAVORITES.JS - FINAL CORRECTED VERSION
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
const PAGE_SIZE = 15;

// =================================================================================
// --- DOM ELEMENTS ---
// =================================================================================
const ui = {
    container: document.getElementById('favorites-list'),
    searchInput: document.getElementById('search-input-fav'),
    searchStats: document.querySelector('.search-stats'),
    loadMoreContainer: document.querySelector('.load-more-wrap'),
    cardTemplate: document.getElementById('vacancy-card-template'),
};


// =================================================================================
// --- STATE MANAGEMENT ---
// =================================================================================
const favState = {
    allVacancies: [],
    renderedCount: 0,
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
// --- VIEW / RENDERER ---
// =================================================================================
const view = {
    // --- Helper Functions ---
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
        if (isNaN(d.getTime())) return '';
        const diffMs = now - d;
        const sec = Math.floor(diffMs / 1000);
        const min = Math.floor(sec / 60);
        const pad = n => n.toString().padStart(2, '0');
        const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        if (sec < 30) return 'только что';
        if (min < 60) return `${min} мин назад`;
        if (now.toDateString() === d.toDateString()) return `сегодня, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        const yest = new Date(now);
        yest.setDate(now.getDate() - 1);
        if (yest.toDateString() === d.toDateString()) return `вчера, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        return `${d.getDate().toString().padStart(2, '0')} ${months[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },

    // --- Card Builder (Full version) ---
    createCard(v) {
        if (!ui.cardTemplate) return null;
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
            deleteBtn: card.querySelector('.delete'),
            favoriteBtn: card.querySelector('.favorite'),
        };

        const isValid = val => val && val !== 'null' && val !== 'не указано';
        
        // Remove favorite button, it's not needed on this page
        if(cardEls.favoriteBtn) cardEls.favoriteBtn.remove();
        
        // Set IDs, classes and base data
        card.id = `card-${v.id}`;
        card.dataset.id = v.id;
        card.classList.add(`category-${CATEGORY_MAP[v.category] || 'other'}`);
        cardEls.categoryTitle.textContent = v.category || 'NO_CATEGORY';
        cardEls.summary.innerHTML = this.highlightText(v.reason, favState.searchQuery);
        
        // Info Grid
        cardEls.infoGrid.innerHTML = '';
        const infoRows = [
            { label: 'ФОРМАТ', value: [v.employment_type, v.work_format].filter(isValid).join(' / '), type: 'default' },
            { label: 'ОПЛАТА', value: v.salary_display_text, type: 'salary' },
            { label: 'СФЕРА', value: [v.industry, v.company_name ? `(${v.company_name})` : ''].filter(isValid).join(' '), type: 'industry' }
        ];

        infoRows.forEach(row => {
            if (isValid(row.value)) {
                const highlightedValue = this.highlightText(row.value, favState.searchQuery);
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
                detailsContent += v.text_highlighted.replace(new RegExp(`(${favState.searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, 'gi'), '<mark class="highlight">$1</mark>');
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
        cardEls.deleteBtn.onclick = () => controller.unfavoriteVacancy(v.id);
        if (v.apply_url) {
            cardEls.applyBtn.onclick = () => tg.openLink(v.apply_url);
        } else {
            cardEls.applyBtn.remove();
        }

        return card;
    },

    // --- Main Render Function ---
    render() {
        ui.container.innerHTML = '';
        const vacanciesToRender = favState.filteredVacancies.slice(0, favState.renderedCount);

        if (vacanciesToRender.length === 0 && favState.allVacancies.length === 0) {
             ui.container.innerHTML = `<div class="empty-state"><p class="empty-state-text">-- В избранном пусто --</p></div>`;
        } else if (vacanciesToRender.length === 0 && favState.searchQuery) {
            ui.container.innerHTML = `<div class="empty-state"><p class="empty-state-text">Ничего не найдено по запросу "${this.escapeHtml(favState.searchQuery)}"</p></div>`;
        } else {
            const fragment = document.createDocumentFragment();
            vacanciesToRender.forEach(v => {
                const cardNode = this.createCard(v);
                if (cardNode) fragment.appendChild(cardNode);
            });
            ui.container.appendChild(fragment);
        }

        this.updateLoadMoreButton();
        this.updateSearchStats();
    },

    renderMore() {
        const newRenderedCount = Math.min(favState.renderedCount + PAGE_SIZE, favState.filteredVacancies.length);
        if (newRenderedCount > favState.renderedCount) {
            favState.renderedCount = newRenderedCount;
            this.render();
        }
    },

    updateLoadMoreButton() {
        ui.loadMoreContainer.innerHTML = '';
        if (favState.renderedCount < favState.filteredVacancies.length) {
            const button = document.createElement('button');
            button.className = 'btn btn--load-more';
            button.textContent = 'Загрузить ещё';
            button.onclick = () => this.renderMore();
            ui.loadMoreContainer.appendChild(button);
        }
    },

    updateSearchStats() {
        if (!ui.searchStats) return;
        if (favState.searchQuery) {
            const count = favState.filteredVacancies.length;
            ui.searchStats.textContent = `Найдено: ${count}`;
        } else {
            ui.searchStats.textContent = '';
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
// --- CONTROLLER ---
// =================================================================================
const controller = {
    async init() {
        ui.container.innerHTML = `<div class="empty-state"><p class="empty-state-text">Загрузка избранного...</p></div>`;
        this.setupEventListeners();
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?status=eq.favorite&select=*&order=created_at.desc`, {
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
            });
            if (!response.ok) throw new Error('Network error');

            favState.allVacancies = (await response.json()).map(v => ({
                ...v,
                search_text: [v.category, v.reason, v.industry, v.company_name, v.text_highlighted, ...(v.skills || [])].join(' ')
            }));
            
            favState.renderedCount = Math.min(PAGE_SIZE, favState.allVacancies.length);
            view.render();

        } catch (e) {
            ui.container.innerHTML = `<div class="empty-state"><p class="empty-state-text">Ошибка загрузки: ${e.message}</p></div>`;
        }
    },
    
    async unfavoriteVacancy(id) {
        const card = document.getElementById(`card-${id}`);
        if(card) {
            card.style.opacity = '0';
            card.style.transform = 'scale(0.95)';
        }

        try {
            await fetch(`${SUPABASE_URL}/rest/v1/vacancies?id=eq.${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`},
                body: JSON.stringify({ status: 'new' })
            });

            favState.allVacancies = favState.allVacancies.filter(v => v.id !== id);
            // If we remove an item, we might need to adjust the rendered count
            favState.renderedCount = Math.min(favState.renderedCount, favState.allVacancies.length);
            view.render();

        } catch (e) {
            if (tg) tg.showAlert('Ошибка при удалении из избранного');
            if (card) {
                card.style.opacity = '1';
                card.style.transform = 'scale(1)';
            }
        }
    },

    handleSearch: debounce(e => {
        favState.searchQuery = e.target.value.trim();
        favState.renderedCount = Math.min(PAGE_SIZE, favState.filteredVacancies.length);
        view.render();
    }),
    
    setupEventListeners() {
        ui.searchInput.addEventListener('input', this.handleSearch);
    }
};

// --- INITIALIZE THE APP ---
document.addEventListener('DOMContentLoaded', () => controller.init());
