// ============================================
// Тема оформления (День / Ночь)
// Загружается в <head> для предотвращения вспышек
// ============================================

(function () {
  const THEME_KEY = 'app-theme';
  
  function applyTheme(theme) {
    const isLight = theme === 'light';
    document.documentElement.classList.toggle('light-theme', isLight);
    
    // Синхронизируем иконки переключателей
    const toggles = document.querySelectorAll('#theme-toggle');
    toggles.forEach(toggle => {
      const sunIcon = toggle.querySelector('.sun-icon');
      const moonIcon = toggle.querySelector('.moon-icon');
      if (sunIcon && moonIcon) {
        if (isLight) {
          sunIcon.style.display = 'none';
          moonIcon.style.display = 'block';
        } else {
          sunIcon.style.display = 'block';
          moonIcon.style.display = 'none';
        }
      }
    });
  }

  // Считываем сохраненную тему (по умолчанию темная)
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(savedTheme);

  // Настройка после загрузки DOM
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(savedTheme);

    // Слушаем клики по переключателю
    document.addEventListener('click', (e) => {
      const toggle = e.target.closest('#theme-toggle');
      if (toggle) {
        const currentTheme = document.documentElement.classList.contains('light-theme') ? 'light' : 'dark';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        localStorage.setItem(THEME_KEY, newTheme);
        applyTheme(newTheme);
      }
    });
  });
})();
