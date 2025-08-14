# Структура проекта Oshu Vacancies

## Основные файлы
- `index.html` - главная страница приложения
- `script.js` - основной JavaScript код
- `style.css` - стили приложения
- `settings.html` - страница настроек
- `settings.js` - логика настроек
- `favorites.html` - страница избранных вакансий
- `favorites.js` - логика избранных вакансий

## Модули и утилиты
- `api-service.js` - сервис для работы с API
- `state-manager.js` - управление состоянием приложения
- `constants.js` - константы приложения
- `utils.js` - вспомогательные функции
- `mcp-manager.js` - менеджер MCP (Model Context Protocol)

## Конфигурация
- `package.json` - конфигурация npm проекта
- `config.js` - конфигурация приложения (исключен из git)
- `.gitignore` - исключения для git

## Документация
- `README.md` - основная документация проекта
- `README_MEMORY_BANK.md` - документация по Memory Bank
- `REFACTORING.md` - документация по рефакторингу

## Папки
- `memory-bank/` - система Memory Bank для управления задачами
- `img/` - изображения и медиафайлы
- `my-files/` - временная документация по исправлениям (исключена из git)

## Исключения из git
- `config.js` - содержит секретные ключи
- `my-files/` - временная документация
- `.env*` - переменные окружения
- IDE файлы (`.vscode/`, `.idea/`, `.cursor/`)
