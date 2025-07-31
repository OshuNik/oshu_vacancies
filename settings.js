const tg = window.Telegram.WebApp;
tg.expand();

const GET_SETTINGS_URL  = 'https://oshunik.ru/webhook/91f2562c-bfad-42d6-90ba-2ca5473c7e7e';
const SAVE_SETTINGS_URL = 'https://oshunik.ru/webhook/8a21566c-baf5-47e1-a84c-b96b464d3713';

const input   = document.getElementById('keywords-input');
const btnSave = document.getElementById('save-button');
const display = document.getElementById('current-keywords-display');

function showNotification(message) {
  if (tg.showPopup) {
    tg.showPopup({ message: message });
  } else {
    tg.showAlert(message);
  }
}

async function loadSettings() {
  btnSave.disabled = true; 
  btnSave.textContent = 'Загрузка...';
  
  try {
    const response = await fetch(GET_SETTINGS_URL);
    const data = await response.json();
    let keywords = '';

    // ИЗМЕНЕНИЕ ЗДЕСЬ: Убрали .json, так как данные приходят напрямую
    if (data && data.length > 0 && data[0].keywords) {
        keywords = data[0].keywords;
    }
    
    input.value = keywords;
    display.textContent = keywords || '-- не заданы --'; 
    
  } catch (error) {
    showNotification(`Ошибка загрузки: ${error.message}`);
    display.textContent = 'Ошибка загрузки';
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = 'Сохранить';
  }
}

async function saveSettings() {
  const kws = input.value.trim();
  btnSave.disabled = true;
  btnSave.textContent = 'Сохранение...';
  
  try {
    await fetch(SAVE_SETTINGS_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ keywords:kws })
    });
    
    display.textContent = kws || '-- не заданы --'; 
    showNotification('Настройки сохранены');

  } catch (error) {
    showNotification(`Ошибка при сохранении: ${error.message}`);
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = 'Сохранить';
  }
}

btnSave.addEventListener('click', saveSettings);
loadSettings();
