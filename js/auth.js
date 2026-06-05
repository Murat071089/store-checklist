// ============================================
// Модуль авторизации
// ============================================

const Auth = {

  // Ключи localStorage для сессии
  KEYS: {
    userKey: 'checklist_user_key',
    userName: 'checklist_user_name',
    userRole: 'checklist_user_role'
  },

  /**
   * Получить текущего пользователя
   * @returns {{ key: string, name: string, role: string } | null}
   */
  getCurrentUser() {
    const key = localStorage.getItem(this.KEYS.userKey);
    const name = localStorage.getItem(this.KEYS.userName);
    const role = localStorage.getItem(this.KEYS.userRole);
    if (key && name && role) {
      return { key, name, role };
    }
    return null;
  },

  /**
   * Войти в систему
   * @param {string} userKey - Ключ пользователя (agnesa/oksana/owner)
   * @param {string} pin - PIN-код
   * @returns {{ success: boolean, error?: string }}
   */
  async login(userKey, pin) {
    const userConfig = CONFIG.USERS[userKey];
    if (!userConfig) {
      return { success: false, error: 'Пользователь не найден' };
    }

    // Проверяем PIN
    const result = await API.verifyPin(userConfig.name, pin);
    if (!result.success) {
      return { success: false, error: result.error || 'Неверный PIN-код' };
    }

    // Сохраняем сессию
    localStorage.setItem(this.KEYS.userKey, userKey);
    localStorage.setItem(this.KEYS.userName, userConfig.name);
    localStorage.setItem(this.KEYS.userRole, userConfig.role);

    // Перенаправляем
    if (userConfig.role === 'admin') {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'employee.html';
    }

    return { success: true };
  },

  /**
   * Выйти из системы
   */
  logout() {
    localStorage.removeItem(this.KEYS.userKey);
    localStorage.removeItem(this.KEYS.userName);
    localStorage.removeItem(this.KEYS.userRole);
    window.location.href = 'index.html';
  },

  /**
   * Проверить авторизацию, перенаправить если не авторизован
   * @param {string} requiredRole - 'employee' или 'admin'
   * @returns {{ key: string, name: string, role: string } | null}
   */
  requireAuth(requiredRole) {
    const user = this.getCurrentUser();
    if (!user) {
      window.location.href = 'index.html';
      return null;
    }
    if (requiredRole && user.role !== requiredRole) {
      window.location.href = 'index.html';
      return null;
    }
    return user;
  },

  /**
   * Проверить существующую сессию на странице входа
   * Если уже авторизован — перенаправить
   */
  checkExistingSession() {
    const user = this.getCurrentUser();
    if (user) {
      if (user.role === 'admin') {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'employee.html';
      }
      return;
    }

    // Настраиваем страницу входа
    this._setupLoginPage();
  },

  /**
   * Инициализация страницы входа (обработчики кнопок)
   */
  _setupLoginPage() {
    let selectedUserKey = null;

    const pinModal = document.getElementById('pin-modal');
    const pinModalContent = document.getElementById('pin-modal-content');
    const pinInput = document.getElementById('pin-input');
    const pinError = document.getElementById('pin-error');
    const pinUserName = document.getElementById('pin-user-name');
    const pinSubmit = document.getElementById('pin-submit');
    const pinClose = document.getElementById('pin-close');

    if (!pinModal) return; // Не на странице входа

    // Обновление точек-индикаторов
    const updateDots = () => {
      const len = pinInput.value.length;
      const dots = document.querySelectorAll('.pin-dot');
      dots.forEach((dot, idx) => {
        if (idx < len) {
          dot.classList.add('filled');
        } else {
          dot.classList.remove('filled');
        }
      });
    };

    // Кнопки выбора пользователя
    document.querySelectorAll('.user-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedUserKey = btn.dataset.user;
        const userConfig = CONFIG.USERS[selectedUserKey];
        if (userConfig) {
          pinUserName.textContent = userConfig.name;
          pinInput.value = '';
          updateDots();
          pinError.classList.remove('visible');
          pinModal.classList.add('active');
          history.pushState({ modal: 'pin' }, '');
          setTimeout(() => pinInput.focus(), 100);
        }
      });
    });

    // Закрыть модалку PIN
    const closePin = () => {
      if (pinModal.classList.contains('active')) {
        pinModal.classList.remove('active');
        selectedUserKey = null;
      }
    };

    pinClose.addEventListener('click', () => {
      closePin();
      if (history.state && history.state.modal === 'pin') history.back();
    });

    pinModal.addEventListener('click', (e) => {
      if (e.target === pinModal) {
        closePin();
        if (history.state && history.state.modal === 'pin') history.back();
      }
    });

    // Аппаратная кнопка «Назад»
    window.addEventListener('popstate', (e) => {
      closePin();
    });

    // Отправка PIN
    const submitPin = async () => {
      const pin = pinInput.value.trim();
      if (pin.length !== 4) {
        pinError.textContent = 'Введите 4 цифры';
        pinError.classList.add('visible');
        return;
      }

      pinSubmit.disabled = true;
      pinSubmit.textContent = '⏳';

      const result = await Auth.login(selectedUserKey, pin);

      if (!result.success) {
        pinError.textContent = result.error;
        pinError.classList.add('visible');
        pinInput.value = '';
        updateDots();
        
        // Shake-анимация при ошибке
        if (pinModalContent) {
          pinModalContent.classList.add('shake-error');
          setTimeout(() => {
            pinModalContent.classList.remove('shake-error');
          }, 400);
        }

        pinInput.focus();
        pinSubmit.disabled = false;
        pinSubmit.textContent = 'Войти';
      }
    };

    pinSubmit.addEventListener('click', submitPin);

    // Enter для отправки
    pinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        submitPin();
      }
    });

    // Автоматическая отправка при вводе 4 цифр
    pinInput.addEventListener('input', () => {
      pinError.classList.remove('visible');
      updateDots();
      if (pinInput.value.length === 4) {
        submitPin();
      }
    });

    // Обработка нажатий на экранную клавиатуру PIN-пада
    document.querySelectorAll('.keypad-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        if (!val) return;

        if (val === 'clear') {
          pinInput.value = '';
        } else if (val === 'backspace') {
          pinInput.value = pinInput.value.slice(0, -1);
        } else if (pinInput.value.length < 4) {
          pinInput.value += val;
        }

        pinError.classList.remove('visible');
        updateDots();

        // Инициируем событие input на скрытом поле
        pinInput.dispatchEvent(new Event('input'));
      });
    });

    // Поддержка аппаратной клавиатуры
    window.addEventListener('keydown', (e) => {
      if (!pinModal.classList.contains('active')) return;
      
      // Игнорируем если фокус в инпуте и это не Enter/Backspace
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        if (pinInput.value.length < 4) {
          pinInput.value += e.key;
          pinInput.dispatchEvent(new Event('input'));
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        pinInput.value = pinInput.value.slice(0, -1);
        pinInput.dispatchEvent(new Event('input'));
      }
    });
  }
};
