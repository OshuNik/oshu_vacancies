const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const PAGE_SIZE = 10;
let allFavorites = [];
let currentPage = 0;

// --- debounce ---
function debounce(func, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

// --- загрузка ---
async function loadFavorites() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vacancies?status=eq.favorite&select=*`, {
    headers: { apikey: SUPABASE_ANON_KEY }
  });
  let items = await res.json();

  // Стабильная сортировка
  items.sort((a, b) => {
    const da = new Date(a.created_at || a.timestamp || 0);
    const db = new Date(b.created_at || b.timestamp || 0);
    if (db - da !== 0) return db - da;
    return String(a.id).localeCompare(String(b.id));
  });

  allFavorites = items;
  currentPage = 0;
  renderPage();
}

// --- рендер одной страницы ---
function renderPage() {
  const container = document.getElementById('favorites-list');
  if (currentPage === 0) container.innerHTML = '';

  const start = currentPage * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = allFavorites.slice(start, end);

  pageItems.forEach(vacancy => {
    const card = document.createElement('div');
    card.className = 'vacancy-card';
    card.innerHTML = `
      <div class="card-body">
        <p class="card-summary">${vacancy.summary || 'Без описания'}</p>
      </div>
    `;
    container.appendChild(card);
  });

  document.getElementById('load-more-fav').style.display =
    end < allFavorites.length ? 'inline-block' : 'none';
}

// --- поиск ---
function filterFavorites(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('#favorites-list .vacancy-card').forEach(card => {
    card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// --- события ---
document.getElementById('search-input-fav')
  .addEventListener('input', debounce(e => filterFavorites(e.target.value), 200));

document.getElementById('load-more-fav').addEventListener('click', () => {
  currentPage++;
  renderPage();
});

// --- запуск ---
loadFavorites();
