const tg = window.Telegram.WebApp;
tg.expand();

// --- ЭЛЕМЕНТЫ ДЛЯ ВКЛАДОК ---
const settingsTabButtons = document.querySelectorAll('.settings-tab-button');
const settingsTabContents = document.querySelectorAll('.settings-tab-content');

// --- ЭЛЕМЕНТЫ ДЛЯ КЛЮЧЕВЫХ СЛОВ ---
const GET_KEYWORDS_URL  = 'https://oshunik.ru/webhook/91f2c-bfad-42d6-90ba-2ca5473c7e7e';
const SAVE_KEYWORDS_URL = 'https://oshunik.ru/webhook/8a21566c-baf5-47e1-a84c-b96b464d3713';
const keywordsInput   = document.getElementById('keywords-input');
const keywordsDisplay = document.getElementById('current-keywords-display');
const saveBtn = document.getElementById('save-button');

// --- ЛОГИКА ПЕРЕКЛЮЧЕНИЯ ВКЛАДОК ---
settingsTabButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Убираем класс active у всех кнопок и контента
        settingsTabButtons.forEach(btn => btn.classList.remove('active'));
        settingsTabContents.forEach(content => content.classList.remove('active'));

        // Добавляем класс active к нажатой кнопке и соответствующему контенту
        button.classList.add('active');
        document.getElementById(button.dataset.target).classList.add('active');
    });
});

// --- ЛОГИКА ДЛЯ КЛЮЧЕВЫХ СЛОВ ---
async function loadKeywords() {
  saveBtn.disabled = true;
  try {
    const response = await fetch(GET_KEYWORDS_URL);
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
    
    keywordsInput.value = keywords;
    keywordsDisplay.textContent = keywords || '-- не заданы --'; 
    
  } catch (error) {
    console.error('Ошибка загрузки ключевых слов:', error);
    keywordsDisplay.textContent = 'Ошибка загрузки';
  } finally {
    saveBtn.disabled = false;
  }
}

async function saveKeywords() {
  const kws = keywordsInput.value.trim();
  saveBtn.disabled = true;
  
  try {
    await fetch(SAVE_KEYWORDS_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ keywords:kws })
    });
    
    keywordsDisplay.textContent = kws || '-- не заданы --'; 
    if (tg.showPopup) {
        tg.showPopup({ message: 'Ключевые слова сохранены' });
    } else {
        tg.showAlert('Ключевые слова сохранены');
    }

  } catch (error) {
    console.error('Ошибка при сохранении ключевых слов:', error);
  } finally {
    saveBtn.disabled = false;
  }
}

// --- ОБЩИЙ СОХРАНЯЮЩИЙ ОБРАБОТЧИК ---
saveBtn.addEventListener('click', () => {
    const activeTab = document.querySelector('.settings-tab-content.active');
    if (activeTab.id === 'tab-keywords') {
        saveKeywords();
    } else if (activeTab.id === 'tab-channels') {
        // Логику сохранения каналов добавим позже
        console.log('Сохранение каналов...');
        if (tg.showPopup) {
            tg.showPopup({ message: 'Функция сохранения каналов в разработке' });
        } else {
            tg.showAlert('Функция сохранения каналов в разработке');
        }
    }
});

// --- НАЧАЛЬНАЯ ЗАГРУЗКА ---
loadKeywords();
