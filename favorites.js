const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const PAGE_SIZE = 10;

let favPage = 0;
let favTotal = 0;

document.addEventListener('DOMContentLoaded', () => {
  loadFavorites();
  document.getElementById('search-input-fav')
    .addEventListener('input', debounce(e => filterFavorites(e.target.value), 200));
});

async function loadFavorites(append = false) {
  const from = favPage * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const listEl = document.getElementById('favorites-list');
  const btnEl = getOrCreateFavBtn();

  showLoader(btnEl);

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/vacancies?status=eq.favorite&select=*&order=timestamp.desc,id.asc&range=${from}-${to}`,
      { headers: { apikey: SUPABASE_ANON_KEY } }
    );
    const data = await res.json();

    if (!append) listEl.innerHTML = '';
    data.forEach(vacancy => {
      listEl.appendChild(renderVacancyCard(vacancy));
    });

    if (data.length < PAGE_SIZE) {
      btnEl.style.display = 'none';
    } else {
      btnEl.style.display = 'inline-block';
    }

    hideLoader(btnEl);
    if (data.length > 0) favPage++;

  } catch (err) {
    console.error('Ошибка загрузки избранного:', err);
    hideLoader(btnEl);
  }
}

function renderVacancyCard(vacancy) {
  const card = document.createElement('div');
  card.className = 'vacancy-card';
  card.innerHTML = `
    <div class="card-body">
      <p class="card-summary">${vacancy.summary || 'Без описания'}</p>
    </div>
  `;
  return card;
}

function getOrCreateFavBtn() {
  let btn = document.getElementById('load-more-fav');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'load-more-fav';
    btn.className = 'load-more-btn';
    btn.textContent = 'Загрузить ещё';
    btn.addEventListener('click', () => loadFavorites(true));
    document.body.appendChild(btn);
  }
  return btn;
}

function debounce(func, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

function filterFavorites(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('#favorites-list .vacancy-card').forEach(card => {
    card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function showLoader(btn) {
  btn.disabled = true;
  btn.innerHTML = `<div class="loader"></div>`;
}

function hideLoader(btn) {
  btn.disabled = false;
  btn.textContent = 'Загрузить ещё';
}
