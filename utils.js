// utils.js — единые хелперы

// --- Telegram safe ---
const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
if (tg && typeof tg.expand === 'function') { try { tg.expand(); } catch(_){} }

exported = {}; // маленький хак для подсказок IDE (не используется)

// --- UI helpers ---
function escapeHtml(s = '') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
function stripTags(html = '') { const tmp = document.createElement('div'); tmp.innerHTML = html; return tmp.textContent || tmp.innerText || ''; }
function debounce(fn, delay = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); }; }

function highlightText(text = '', q = '') {
  if (!q) return escapeHtml(text);
  const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')})`, 'gi');
  return escapeHtml(text).replace(rx, '<mark class="highlight">$1</mark>');
}

function safeAlert(msg) {
  if (tg && typeof tg.showAlert === 'function') tg.showAlert(String(msg));
  else alert(String(msg));
}

// --- Time (RU) ---
function formatSmartTime(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  const diff = now - d;
  const sec = Math.floor(diff/1000), min = Math.floor(sec/60);
  const pad = n => String(n).padStart(2,'0');
  const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  const y = new Date(now); y.setDate(now.getDate()-1);
  if (sec < 30) return 'только что';
  if (min < 60 && min >= 1) return `${min} мин назад`;
  if (now.toDateString() === d.toDateString()) return `сегодня, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (y.toDateString() === d.toDateString()) return `вчера, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${String(d.getDate()).padStart(2,'0')} ${months[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const formatTimestamp = formatSmartTime;

// --- URL / Links ---
function normalizeUrl(raw = '') {
  let s = String(raw || '').trim();
  if (!s) return '';
  // t.me/..., telegram.me/... → https://
  if (/^(t(?:elegram)?\.me)\//i.test(s)) s = 'https://' + s;
  // схемы без протокола → https://
  if (/^([a-z0-9-]+\.)+[a-z]{2,}/i.test(s) && !/^https?:\/\//i.test(s)) s = 'https://' + s;

  // поддержка t.me/c/... и t.me/+invite
  // (просто нормализуем к https, валидность оставляем платформе)
  try { return new URL(s, window.location.origin).href; } catch { return ''; }
}
function isHttpUrl(u = '') { return /^https?:\/\//i.test(u); }
function sanitizeUrl(raw = '') { const norm = normalizeUrl(raw); return isHttpUrl(norm) ? norm : ''; }
function openLink(url) { const safe = sanitizeUrl(url); if (!safe) return; if (tg && typeof tg.openLink === 'function') tg.openLink(safe); else window.open(safe, '_blank', 'noopener'); }

// --- Vacancy text/image helpers ---
function containsImageMarker(text = '') { return /(\[\s*изображени[ея]\s*\]|\b(изображени[ея]|фото|картинк\w|скрин)\b)/i.test(text); }
function cleanImageMarkers(text = '') { return String(text).replace(/\[\s*изображени[ея]\s*\]/gi,'').replace(/\s{2,}/g,' ').trim(); }
function pickImageUrl(v = {}, detailsText = '') {
  const msg = sanitizeUrl(v.message_link || '');
  const img = sanitizeUrl(v.image_link || '');
  const allow = (v.has_image === true) || containsImageMarker(detailsText) || containsImageMarker(v.reason || '');
  if (!allow) return '';
  if (msg) return msg;
  if (img) return img;
  return '';
}

// --- Network with Abort + Retry ---
async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
async function fetchWithRetry(url, options = {}, retryCfg = {retries:0, baseDelay:600}) {
  const { retries = 0, baseDelay = 600 } = retryCfg || {};
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      // только на 429/5xx пытаемся повторить
      if (![429,500,502,503,504].includes(res.status) || attempt >= retries) return res;
      await sleep(baseDelay * Math.pow(2, attempt));
      attempt++;
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(baseDelay * Math.pow(2, attempt));
      attempt++;
    }
  }
}

// --- Empty / Error components ---
function getEmptyStateHtml(message) {
  const gif = 'https://raw.githubusercontent.com/OshuNik/oshu_vacancies/5325db67878d324810971a262d689ea2ec7ac00f/img/Uploading%20a%20vacancy.%20The%20doggie.gif';
  return `<div class="empty-state"><img src="${gif}" alt="Спящий котик" class="empty-state-gif" /><p class="empty-state-text">${escapeHtml(message)}</p></div>`;
}

function renderEmptyState(container, message){
  if (!container) return;
  container.innerHTML = getEmptyStateHtml(message);
}

function renderError(container, message, onRetry){
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <p class="empty-state-text">Ошибка: ${escapeHtml(message)}</p>
      ${onRetry ? `<div class="load-more-wrap" style="margin-top:16px;"><button class="load-more-btn" id="retry-btn">Повторить</button></div>` : ''}
    </div>`;
  if (onRetry) container.querySelector('#retry-btn')?.addEventListener('click', onRetry);
}

// --- Load more (кнопка всегда внизу контейнера) ---
function ensureLoadMore(container, onClick){
  let wrap = container.querySelector(':scope > .load-more-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'load-more-wrap';
    const btn = document.createElement('button');
    btn.className = 'load-more-btn';
    btn.textContent = 'Загрузить ещё';
    btn.addEventListener('click', onClick);
    wrap.appendChild(btn);
    container.appendChild(wrap);
  } else {
    container.appendChild(wrap); // переносим в самый низ
  }
  const btn = wrap.querySelector('button');
  return {wrap, btn};
}

function updateLoadMore(container, hasMore) {
  const wrap = container.querySelector(':scope > .load-more-wrap');
  if (!wrap) return;
  if (!hasMore) wrap.remove();
  else container.appendChild(wrap); // держим в самом конце
}

// Экспорт в window (простой способ без сборки)
window.utils = {
  tg, escapeHtml, stripTags, debounce, highlightText, safeAlert,
  formatTimestamp, formatSmartTime,
  normalizeUrl, sanitizeUrl, isHttpUrl, openLink,
  containsImageMarker, cleanImageMarkers, pickImageUrl,
  fetchWithRetry, renderEmptyState, renderError,
  getEmptyStateHtml, ensureLoadMore, updateLoadMore
};
