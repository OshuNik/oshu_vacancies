// Инициализируем API Телеграма
const tg = window.Telegram.WebApp;
tg.expand();

// Ваши URL-адреса для API настроек
const GET_SETTINGS_API_URL = 'https://oshunik.ru/webhook/91f2562c-bfad-42d6-90ba-2ca5473c7e7e';
const SAVE_SETTINGS_API_URL = 'https://oshunik.ru/webhook/8a21566c-baf5-47e1-a84c-b96b464d3713';

// Находим элементы на странице
const keywordsInput = document.getElementById('keywords-input');
const saveButton = document.getElementById('save-button');

// Функция для загрузки текущих настроек
async function loadSettings() {
    try {
        saveButton.classList.add('button-loading');
        saveButton.textContent = 'Загрузка...';

        const response = await fetch(GET_SETTINGS_API_URL + '?cache_buster=' + new Date().getTime());
        const data = await response.json();
        
        // n8n возвращает массив, нам нужен первый элемент и его поле 'json'
        const settings = data[0].json;
        
        if (settings.keywords) {
            keywordsInput.value = settings.keywords;
        }

    } catch (error) {
        console.error('Ошибка при загрузке настроек:', error);
        tg.showAlert('Не удалось загрузить текущие настройки.');
    } finally {
        saveButton.classList.remove('button-loading');
        saveButton.textContent = 'Сохранить';
    }
}

// Функция для сохранения новых настроек
async function saveSettings() {
    const newKeywords = keywordsInput.value;
    
    saveButton.classList.add('button-loading');
    saveButton.textContent = 'Сохранение...';

    try {
        await fetch(SAVE_SETTINGS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords: newKeywords })
        });
        
        tg.showAlert('Настройки успешно сохранены! Парсер начнет использовать их при следующем запуске.');

    } catch (error) {
        console.error('Ошибка при сохранении настроек:', error);
        tg.showAlert('Не удалось сохранить настройки.');
    } finally {
        saveButton.classList.remove('button-loading');
        saveButton.textContent = 'Сохранить';
    }
}

// Привязываем функцию сохранения к кнопке
saveButton.addEventListener('click', saveSettings);

// Загружаем настройки при открытии страницы
loadSettings();