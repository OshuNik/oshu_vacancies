#!/usr/bin/env node

/**
 * Скрипт для автоматической проверки fix коммитов
 * Интегрируется с Cursor и MCP GitHub для анализа изменений
 */

const fs = require('fs');
const { execSync } = require('child_process');

// Получаем последний коммит
function getLastCommit() {
    try {
        const commitMsg = execSync('git log -1 --pretty=format:"%s"', { encoding: 'utf8' });
        const commitHash = execSync('git log -1 --pretty=format:"%h"', { encoding: 'utf8' });
        const commitFiles = execSync('git diff-tree --no-commit-id --name-only -r HEAD', { encoding: 'utf8' }).split('\n').filter(f => f);
        
        return { msg: commitMsg, hash: commitHash, files: commitFiles };
    } catch (error) {
        console.error('Ошибка получения коммита:', error.message);
        return null;
    }
}

// Проверяем, является ли коммит исправлением бага
function isFixCommit(commitMsg) {
    const fixKeywords = ['fix:', 'Fix:', 'исправл', 'баг', 'bug', '🔧', 'починил', 'восстановлен'];
    return fixKeywords.some(keyword => commitMsg.toLowerCase().includes(keyword.toLowerCase()));
}

// Анализируем изменённые файлы
function analyzeChangedFiles(files) {
    const categories = {
        js: files.filter(f => f.endsWith('.js')),
        html: files.filter(f => f.endsWith('.html')),
        css: files.filter(f => f.endsWith('.css'))
    };
    
    return categories;
}

// Создаём отчёт для проверки
function generateCheckReport(commit, fileCategories) {
    const report = `
🔍 АВТОМАТИЧЕСКИЙ АНАЛИЗ FIX КОММИТА
==========================================

📋 Информация о коммите:
• Hash: ${commit.hash}
• Сообщение: "${commit.msg}"

📁 Изменённые файлы:
${commit.files.map(f => `• ${f}`).join('\n')}

🎯 ТРЕБУЕТСЯ ПРОВЕРКА:

${fileCategories.js.length > 0 ? `
🟡 JavaScript файлы (${fileCategories.js.length}):
${fileCategories.js.map(f => `   • ${f} - проверить логику и события`).join('\n')}
` : ''}

${fileCategories.html.length > 0 ? `
🟢 HTML файлы (${fileCategories.html.length}):
${fileCategories.html.map(f => `   • ${f} - проверить отображение элементов`).join('\n')}
` : ''}

${fileCategories.css.length > 0 ? `
🔵 CSS файлы (${fileCategories.css.length}):
${fileCategories.css.map(f => `   • ${f} - проверить стили и анимации`).join('\n')}
` : ''}

💬 Скажите мне в Cursor:
"Проверь исправился ли баг после коммита ${commit.hash}"

Или просто: "Тест после последнего fix коммита"
==========================================
`;

    return report;
}

// Основная функция
function main() {
    console.log('🔍 Проверка последнего коммита на предмет исправлений...\n');
    
    const commit = getLastCommit();
    if (!commit) {
        console.log('❌ Не удалось получить информацию о коммите');
        return;
    }
    
    if (!isFixCommit(commit.msg)) {
        console.log('ℹ️ Последний коммит не является исправлением бага');
        console.log(`Коммит: "${commit.msg}"`);
        return;
    }
    
    console.log('🔧 ОБНАРУЖЕН FIX КОММИТ!');
    
    const fileCategories = analyzeChangedFiles(commit.files);
    const report = generateCheckReport(commit, fileCategories);
    
    console.log(report);
    
    // Сохраняем отчёт в файл для Cursor
    fs.writeFileSync('last-fix-check.md', report);
    console.log('📄 Отчёт сохранён в last-fix-check.md\n');
    
    console.log('💡 Для проверки в Cursor откройте этот файл и скажите мне проверить изменения!');
}

if (require.main === module) {
    main();
}
