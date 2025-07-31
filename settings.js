const tg = window.Telegram.WebApp;
tg.expand();

const GET_SETTINGS_URL  = 'https://oshunik.ru/webhook/91f2562c-bfad-42d6-90ba-2ca5473c7e7e';
const SAVE_SETTINGS_URL = 'https://oshunik.ru/webhook/8a21566c-baf5-47e1-a84c-b96b464d3713';

const input   = document.getElementById('keywords-input');
const btnSave = document.getElementById('save-button');
const display = document.getElementById('current-keywords-display');

async function loadSettings() {
  btnSave.disabled = true; // Делаем кнопку неактивной
  
  try {
    const response = await fetch(GET_SETTINGS_URL);
    const data = await response.json();
    let keywords = '';

    if (data && data.length > 0) {
        if (data[0].keywords) {
            keywords = data[0].keywords;
        } 
        else if (data[0].json && data[0].json.keywords) {
            keywords = data[0].json.keywords;
        }
    }
    
    input.value = keywords;
    display.textContent = keywords || '-- не заданы --'; 
    
  } catch (error) {
    console.error('Ошибка загрузки:', error);
    display.textContent = 'Ошибка загрузки';
  } finally {
    btnSave.disabled = false; // Делаем кнопку снова активной
  }
}

async function saveSettings() {
  const kws = input.value.trim();
  btnSave.disabled = true; // Делаем кнопку неактивной
  
  try {
    await fetch(SAVE_SETTINGS_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ keywords:kws })
    });
    
    display.textContent = kws || '-- не заданы --'; 
    input.blur();

  } catch (error) {
    console.error('Ошибка при сохранении:', error);
  } finally {
    btnSave.disabled = false; // Делаем кнопку снова активной
  }
}

btnSave.addEventListener('click', saveSettings);
loadSettings();
