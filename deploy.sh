#!/bin/bash

echo "🚀 Начинаем деплой oshu-vacancies приложения..."

# Проверяем статус git
echo "📊 Проверяем статус git..."
git status

# Добавляем все изменения
echo "➕ Добавляем изменения..."
git add .

# Создаем коммит
echo "💾 Создаем коммит..."
git commit -m "🚀 Деплой: исправления и настройки GitHub Pages"

# Отправляем на GitHub
echo "📤 Отправляем на GitHub..."
git push origin main

echo "✅ Деплой завершен!"
echo "🌐 Приложение будет доступно на GitHub Pages через несколько минут"
echo "🔗 Ссылка: https://oshunik.github.io/oshu_vacancies/"
echo ""
echo "📋 Для настройки GitHub Pages:"
echo "1. Перейдите в Settings репозитория"
echo "2. Выберите Pages в левом меню"
echo "3. Source: Deploy from a branch"
echo "4. Branch: gh-pages"
echo "5. Folder: / (root)"
echo "6. Нажмите Save"
