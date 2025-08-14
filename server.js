/**
 * Express сервер для oshu-vacancies с улучшенной CSP
 */

const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware для настройки CSP заголовков
app.use((req, res, next) => {
  // Убираем CSP из мета-тегов, так как теперь используем HTTP-заголовки
  res.setHeader('Content-Security-Policy', `
    default-src 'self';
    script-src 'self' https://telegram.org;
    style-src 'self' 'unsafe-inline' fonts.googleapis.com;
    font-src 'self' fonts.gstatic.com;
    img-src 'self' raw.githubusercontent.com;
    connect-src 'self' *.supabase.co;
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    worker-src 'self';
    report-uri https://your-report-collector.example/csp-reports;
  `.replace(/\s+/g, ' ').trim());
  
  // Дополнительные заголовки безопасности
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
});

// Статические файлы
app.use(express.static('.'));

// Маршрут для главной страницы
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Маршрут для страницы избранного
app.get('/favorites', (req, res) => {
  res.sendFile(path.join(__dirname, 'favorites.html'));
});

// Маршрут для страницы настроек
app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'settings.html'));
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер oshu-vacancies запущен на порту ${PORT}`);
  console.log(`📱 Откройте http://localhost:${PORT} в браузере`);
  console.log(`🔒 CSP настроена через HTTP-заголовки`);
  console.log(`📊 Мониторинг нарушений CSP: report-uri настроен`);
});
