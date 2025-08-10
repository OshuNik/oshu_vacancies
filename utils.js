// ==================================
// utils.js — утилиты и сетевой помощник
// ==================================

(function(){
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  if (tg) tg.expand();

  const debounce = (fn, delay = 250) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; };
  const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const stripTags = (html = '') => { const tmp=document.createElement('div'); tmp.innerHTML = html; return tmp.textContent || tmp.innerText || ''; };

  // Поисковая подсветка (под ваш стиль)
  function highlightText(text = '', q = '') {
    if (!q) return escapeHtml(text);
    const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, 'gi');
    return escapeHtml(text).replace(rx, '<mark class="hl-token">$1</mark>');
  }

  function formatTimestamp(isoString){
    if (!isoString) return '';
    const d=new Date(isoString), now=new Date();
    const diffSec = Math.floor((now-d)/1000), diffMin = Math.floor(diffSec/60);
    const pad=n=>n.toString().padStart(2,'0');
    const months=['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
    const isSame = now.toDateString()===d.toDateString();
    const y=new Date(now); y.setDate(now.getDate()-1);
    const isY = y.toDateString()===d.toDateString();
    if (diffSec<30) return 'только что';
    if (diffMin<60 && diffMin>=1) return `${diffMin} мин назад`;
    if (isSame) return `сегодня, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (isY) return `вчера, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${d.getDate().toString().padStart(2,'0')} ${months[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // URL helpers
  function normalizeUrl(raw=''){
    let s=String(raw).trim(); if (!s) return '';
    if (/^(t\.me|telegram\.me)\//i.test(s)) s='https://'+s;
    if (/^([a-z0-9-]+)\.[a-z]{2,}/i.test(s) && !/^https?:\/\//i.test(s)) s='https://'+s;
    try { return new URL(s, window.location.origin).href; } catch { return ''; }
  }
  const isHttpUrl = (u='') => /^https?:\/\//i.test(u);
  const sanitizeUrl = (raw='') => { const u=normalizeUrl(raw); return isHttpUrl(u)?u:''; };

  // Картинки в постах (вернули вашу логику)
  function containsImageMarker(text=''){
    return /(\[\s*изображени[ея]\s*\]|\b(изображени[ея]|фото|картинк\w|скрин)\b)/i.test(text);
  }
  function cleanImageMarkers(text=''){
    return String(text).replace(/\[\s*изображени[ея]\s*\]/gi,'').replace(/\s{2,}/g,' ').trim();
  }
  function pickImageUrl(v, detailsText=''){
    const msg=sanitizeUrl(v.message_link||'');
    const img=sanitizeUrl(v.image_link||'');
    const allow=(v.has_image===true)||containsImageMarker(detailsText)||containsImageMarker(v.reason||'');
    if (!allow) return '';
    if (msg) return msg; if (img) return img; return '';
  }

  // Прогресс-бар (совместимость с вашим DOM)
  const progressBar = document.getElementById('progress-bar');
  const setProgress = (pct=0)=>{ if (progressBar) progressBar.style.width = Math.max(0,Math.min(100,pct))+'%'; };
  const startProgress = ()=> setProgress(5);
  const finishProgress = ()=> setTimeout(()=>setProgress(100),0);
  const resetProgress = ()=> setTimeout(()=>setProgress(0),200);

  // Кастомное подтверждение (совместимо с вашим HTML)
  function showCustomConfirm(message, onResult){
    const overlay=document.getElementById('custom-confirm-overlay');
    if (!overlay){ onResult(true); return; }
    const textEl=document.getElementById('custom-confirm-text');
    const okBtn=document.getElementById('confirm-btn-ok');
    const cancelBtn=document.getElementById('confirm-btn-cancel');
    textEl.textContent=message; overlay.classList.remove('hidden');
    const clean=()=>overlay.classList.add('hidden');
    okBtn.onclick=()=>{ clean(); onResult(true); };
    cancelBtn.onclick=()=>{ clean(); onResult(false); };
  }

  // Надёжный builder для URL Supabase
  function buildSupabaseUrl(baseUrl, resource, { select, filters={}, order }={}){
    const url = new URL(`${baseUrl}/rest/v1/${resource}`);
    if (select && select.length) url.searchParams.set('select', select.join(','));
    Object.entries(filters).forEach(([k,v])=> url.searchParams.set(k, v));
    if (order) url.searchParams.set('order', order);
    return url.toString();
  }

  // Сетевой помощник с ретраями
  async function fetchWithRetry(url, { retries=0, backoffMs=400, ...options }={}){
    let lastErr;
    for (let i=0; i<=retries; i++){
      try {
        const r = await fetch(url, options);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r;
      } catch (e){
        lastErr = e;
        if (i<retries) await new Promise(res=>setTimeout(res, backoffMs));
      }
    }
    throw lastErr;
  }

  window.utils = {
    tg, debounce, escapeHtml, stripTags, highlightText, formatTimestamp,
    normalizeUrl, isHttpUrl, sanitizeUrl,
    containsImageMarker, cleanImageMarkers, pickImageUrl,
    setProgress, startProgress, finishProgress, resetProgress,
    showCustomConfirm,
    buildSupabaseUrl, fetchWithRetry
  };
})();
