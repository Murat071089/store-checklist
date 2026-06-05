// ============================================
// PWA Установка — Android / iOS логика
// ============================================

(function () {
  let deferredPrompt = null;
  const installBtn = document.getElementById('pwa-install-btn');
  const iosModal = document.getElementById('ios-install-modal');
  const iosCloseBtn = document.getElementById('ios-install-close');

  // Проверка платформы
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

  // Инициализация при загрузке
  window.addEventListener('load', () => {
    if (isStandalone) {
      console.log('[PWA] Запущено в режиме приложения (standalone)');
      if (installBtn) installBtn.style.display = 'none';
      return;
    }

    // Если iOS и запущено в обычном браузере, показываем кнопку
    if (isIOS) {
      console.log('[PWA] Обнаружено устройство iOS');
      if (installBtn) {
        installBtn.style.display = 'flex';
      }
    }
  });

  // Ловим нативный prompt на Android / Chrome
  window.addEventListener('beforeinstallprompt', (e) => {
    // Предотвращаем стандартный баннер Chrome
    e.preventDefault();
    // Сохраняем событие
    deferredPrompt = e;
    console.log('[PWA] beforeinstallprompt сработал');
    
    // Показываем кнопку установки (если не standalone)
    if (!isStandalone && installBtn) {
      installBtn.style.display = 'flex';
    }
  });

  // Обработка клика по кнопке установки
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (isIOS) {
        // На iOS показываем модалку с инструкцией
        if (iosModal) {
          iosModal.classList.add('active');
          history.pushState({ modal: 'ios-install' }, '');
        }
      } else if (deferredPrompt) {
        // На Android / Chrome запускаем нативный диалог
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`[PWA] Ответ пользователя на установку: ${outcome}`);
        deferredPrompt = null;
        installBtn.style.display = 'none';
      } else {
        // Фолбэк для других платформ, если prompt ещё не пойман
        alert('Для установки приложения используйте функцию браузера: "Добавить на главный экран"');
      }
    });
  }

  // Закрытие iOS модалки
  if (iosCloseBtn && iosModal) {
    iosCloseBtn.addEventListener('click', () => {
      iosModal.classList.remove('active');
      if (history.state && history.state.modal === 'ios-install') {
        history.back();
      }
    });
  }

  // Закрытие по кнопке "Назад" на телефонах (History API)
  window.addEventListener('popstate', (event) => {
    if (iosModal && iosModal.classList.contains('active')) {
      iosModal.classList.remove('active');
    }
  });

  // Событие успешной установки
  window.addEventListener('appinstalled', (evt) => {
    console.log('[PWA] Приложение успешно установлено');
    if (installBtn) installBtn.style.display = 'none';
  });
})();
