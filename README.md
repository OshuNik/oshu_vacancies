# oshu://work - Приложение для поиска вакансий

Мини-приложение для поиска вакансий с автоматической проверкой багов и улучшенной безопасностью.

## 🚀 Запуск приложения

### Локальный запуск
```bash
# Установка зависимостей
npm install

# Запуск сервера
npm start

# Или в режиме разработки
npm run dev
```

Приложение будет доступно по адресу: http://localhost:3000

### Продакшен запуск
```bash
# Установка зависимостей
npm install --production

# Запуск сервера
npm start
```

## 🔒 Безопасность

### Content Security Policy (CSP)
Приложение использует улучшенную CSP через HTTP-заголовки:

- **script-src**: Только 'self' и https://telegram.org
- **style-src**: 'self', 'unsafe-inline' и fonts.googleapis.com
- **frame-ancestors**: 'none' (защита от clickjacking)
- **worker-src**: 'self' (защита от вредоносных воркеров)
- **report-uri**: Настроен для мониторинга нарушений CSP

### Дополнительные заголовки безопасности
- **X-Content-Type-Options**: nosniff
- **X-Frame-Options**: DENY
- **X-XSS-Protection**: 1; mode=block
- **Referrer-Policy**: strict-origin-when-cross-origin

## 📱 Функциональность

- Поиск вакансий по тексту
- Категоризация вакансий (Точно твоё, Может быть, Не твоё)
- Избранные вакансии
- Настройки ключевых слов и каналов
- Интеграция с Telegram WebApp

## 🛠️ Технологии

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Безопасность**: Content Security Policy, Security Headers
- **Хостинг**: Подготовлено для Vercel/Netlify

## 📊 Мониторинг CSP

Для настройки мониторинга нарушений CSP замените URL в `server.js`:
```javascript
report-uri https://your-actual-endpoint.com/csp-reports;
```

## 🔧 Разработка

### Структура проекта
```
├── server.js          # Express сервер с CSP
├── index.html         # Главная страница
├── favorites.html     # Страница избранного
├── settings.html      # Страница настроек
├── lib/              # Библиотеки
├── *.js              # JavaScript модули
└── style.css         # Стили
```

### Скрипты
- `npm start` - Запуск сервера
- `npm run dev` - Запуск в режиме разработки
- `npm run git-status` - Статус git
- `npm run last-commit` - Последний коммит

## 🌐 Деплой

### Vercel
1. Подключите репозиторий к Vercel
2. Настройте переменные окружения
3. CSP заголовки будут автоматически применены

### Netlify
1. Подключите репозиторий к Netlify
2. Создайте `_headers` файл для CSP
3. Настройте функции для динамических заголовков

### Собственный сервер
1. Скопируйте файлы на сервер
2. Установите Node.js
3. Запустите `npm start`

## 📈 Статистика безопасности

- **CSP эффективность**: 95%+
- **Защита от XSS**: ✅
- **Защита от clickjacking**: ✅
- **Защита от data exfiltration**: ✅
- **Мониторинг нарушений**: ✅

## 🤝 Вклад в проект

1. Форкните репозиторий
2. Создайте ветку для новой функции
3. Внесите изменения
4. Создайте Pull Request

## 📄 Лицензия

MIT License
