const tg = window.Telegram.WebApp;
tg.expand();

const GET_SETTINGS_URL  = 'https://oshunik.ru/webhook/91f2562c-bfad-42d6-90ba-2ca5473c7e7e';
const SAVE_SETTINGS_URL = 'https://oshunik.ru/webhook/8a21566c-baf5-47e1-a84c-b96b464d3713';

const input   = document.getElementById('keywords-input');
const btnSave = document.getElementById('save-button');
const display = document.getElementById('current-keywords-display');

// --- НАША НОВАЯ УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ---
function showNotification(message) {
  // Проверяем, поддерживает ли Telegram новый метод showPopup
  if (tg.isVersionAtLeast('6.2')) {
    tg.showPopup({ message: message });
  } else {
    // Если нет, используем старый метод showAlert
    tg.showAlert(message);
  }
}

async function loadSettings() {
  btnSave.disabled = true; 
  btnSave.textContent = 'Загрузка...';
  
  try {
    const res  = await fetch(GET_SETTINGS_URL);
    const data = await res.json();
    const keywords = data[0]?.json.keywords || '';
    
    input.value = keywords;
    display.textContent = keywords || '-- не заданы --'; 
    
  } catch {
    // Используем новую функцию для показа ошибки
    showNotification('Не удалось загрузить настройки');
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
    // Используем новую функцию для показа уведомления
    showNotification('Настройки сохранены');

  } catch {
    // Используем новую функцию для показа ошибки
    showNotification('Ошибка при сохранении');
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = 'Сохранить';
  }
}

btnSave.addEventListener('click', saveSettings);
loadSettings();
