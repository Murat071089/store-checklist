// ============================================
// API модуль — связь с Supabase REST API
// Тот же паттерн, что и в проекте «сайт магазина»:
// прямые fetch-запросы с anon key, без SDK
// + Telegram-уведомления владельцу
// ============================================

const API = {

  // --- Supabase-хелперы ---

  _baseUrl() {
    return (CONFIG.SUPABASE_URL || '').replace(/\/+$/, '');
  },

  _anonKey() {
    return CONFIG.SUPABASE_ANON_KEY || '';
  },

  _isConfigured() {
    return Boolean(this._baseUrl() && this._anonKey());
  },

  _headers(extra) {
    const key = this._anonKey();
    return Object.assign({
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json'
    }, extra || {});
  },

  // --- Дата / время ---

  _todayKey() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: CONFIG.TIMEZONE });
  },

  _nowTimeStr() {
    return new Date().toLocaleTimeString('ru-RU', {
      timeZone: CONFIG.TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  },

  _currentHour() {
    return parseInt(new Date().toLocaleTimeString('en-US', {
      timeZone: CONFIG.TIMEZONE,
      hour: '2-digit',
      hour12: false
    }));
  },

  // --- localStorage (офлайн-кэш) ---

  _storageKey(date)   { return 'checklist_data_' + date; },
  _customersKey(date) { return 'checklist_customers_' + date; },

  _getLocalData(date) {
    try {
      const raw = localStorage.getItem(this._storageKey(date));
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  },

  _saveLocalData(date, data) {
    try { localStorage.setItem(this._storageKey(date), JSON.stringify(data)); } catch (e) {}
  },

  _getLocalCustomers(date) {
    try {
      const raw = localStorage.getItem(this._customersKey(date));
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  },

  _saveLocalCustomers(date, data) {
    try { localStorage.setItem(this._customersKey(date), JSON.stringify(data)); } catch (e) {}
  },

  // --- Telegram-уведомления ---

  async _sendTelegram(text) {
    if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_OWNER_CHAT_ID) {
      console.warn('Telegram не настроен в CONFIG');
      return;
    }
    const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CONFIG.TELEGRAM_OWNER_CHAT_ID,
          text: text,
          parse_mode: 'HTML'
        })
      });
    } catch (e) {
      console.error('Ошибка отправки уведомления в Telegram:', e);
    }
  },

  // --- Основные API-методы ---

  /**
   * Проверить PIN-код пользователя
   * @param {string} username - Имя пользователя (Агнесса / Оксана / Владелец)
   * @param {string} pin - Введённый PIN-код
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async verifyPin(username, pin) {
    // Внутренняя проверка по конфигурации приложения
    const expectedPin = CONFIG.PINS[username];
    if (!expectedPin) {
      return { success: false, error: 'Пользователь не найден' };
    }
    if (expectedPin === pin) {
      return { success: true };
    } else {
      return { success: false, error: 'Неверный PIN-код' };
    }
  },

  /**
   * Получить все данные чек-листа и посетителей за определённую дату
   * @param {string} date - Дата в формате YYYY-MM-DD
   * @returns {Promise<{ tasks: object, customersLog: array }>}
   */
  async getDayData(date) {
    const localTasks = this._getLocalData(date);
    const localCustomers = this._getLocalCustomers(date);

    if (!this._isConfigured()) {
      return { tasks: localTasks, customersLog: localCustomers };
    }

    try {
      // 1. Запрос выполненных задач
      const tasksUrl = `${this._baseUrl()}/rest/v1/checklist_entries?date=eq.${date}`;
      const tasksResponse = await fetch(tasksUrl, {
        method: 'GET',
        headers: this._headers()
      });

      let tasks = {};
      if (tasksResponse.ok) {
        const entries = await tasksResponse.json();
        entries.forEach(entry => {
          const key = entry.employee + '_' + entry.task_id;
          tasks[key] = {
            employee: entry.employee,
            completedAt: entry.completed_at || entry.created_at,
            isLate: entry.is_late,
            isFailed: entry.status === 'failed',
            reason: entry.reason,
            timeStr: entry.time_str,
            section: entry.section,
            taskName: entry.task_name
          };
        });
        this._saveLocalData(date, tasks);
      } else {
        console.warn('Ошибка получения задач с сервера, используем локальный кэш');
        tasks = localTasks;
      }

      // 2. Запрос логов посетителей
      const customersUrl = `${this._baseUrl()}/rest/v1/checklist_customers_log?date=eq.${date}`;
      const customersResponse = await fetch(customersUrl, {
        method: 'GET',
        headers: this._headers()
      });

      let customersLog = [];
      if (customersResponse.ok) {
        const logs = await customersResponse.json();
        customersLog = logs.map(l => ({
          employee: l.employee,
          timestamp: l.event_time || l.created_at,
          timeStr: l.time_str
        }));
        this._saveLocalCustomers(date, customersLog);
      } else {
        console.warn('Ошибка получения лога посетителей, используем локальный кэш');
        customersLog = localCustomers;
      }

      return { tasks, customersLog };

    } catch (err) {
      console.error('Ошибка сети при получении данных дня:', err);
      // Возвращаем локальный кэш при ошибке сети
      return { tasks: localTasks, customersLog: localCustomers };
    }
  },

  /**
   * Проверить завершённость секции и отправить групповое уведомление в Telegram
   */
  _checkAndSendSectionNotification(employee, section, date) {
    if (section === 'daytime') return;

    const sectionTasks = TASKS[section];
    if (!sectionTasks) return;

    const data = this._getLocalData(date);
    
    // Подсчитываем выполненные и проваленные задачи сотрудника в этой секции
    const completedList = [];
    const failedList = [];
    sectionTasks.forEach(task => {
      const compositeKey = employee + '_' + task.id;
      const entry = data[compositeKey];
      if (entry) {
        if (entry.isFailed) {
          failedList.push(entry);
        } else {
          completedList.push(entry);
        }
      }
    });

    const totalInSection = sectionTasks.length;
    const completedCount = completedList.length;
    const failedCount = failedList.length;
    const totalDone = completedCount + failedCount;

    if (totalDone === totalInSection) {
      const isMorning = section === 'morning';
      const timeStr = this._nowTimeStr();
      
      let msg = `${isMorning ? '🌅' : '🌆'} <b>${isMorning ? 'Утренний' : 'Вечерний'} чек-лист завершён!</b>\n`;
      msg += `👤 <b>Сотрудник:</b> ${employee}\n`;
      msg += `🕒 <b>Время завершения:</b> ${timeStr}\n`;
      msg += `✅ Выполнено задач: <b>${completedCount}</b>\n`;
      msg += `❌ Не выполнено: <b>${failedCount}</b>\n`;
      
      if (failedCount > 0) {
        msg += `\n<b>Невыполненные пункты:</b>\n`;
        failedList.forEach(item => {
          msg += `• ${item.taskName} (Причина: <i>${item.reason || 'не указана'}</i>)\n`;
        });
      }

      this._sendTelegram(msg);
    }
  },

  /**
   * Отметить задачу как выполненную
   */
  async completeTask(employee, taskId, taskName, section) {
    const date = this._todayKey();
    const timeStr = this._nowTimeStr();
    const completedAt = new Date().toISOString();

    // Проверяем опоздание по часам
    let isLate = false;
    const currentHour = this._currentHour();
    if (section === 'morning' && currentHour >= CONFIG.DEADLINES.morning) {
      isLate = true;
    } else if (section === 'evening' && currentHour >= CONFIG.DEADLINES.evening) {
      isLate = true;
    }

    // Сохраняем в localStorage (всегда, как кэш) — ключ по сотруднику
    const data = this._getLocalData(date);
    const compositeKey = employee + '_' + taskId;
    data[compositeKey] = { employee, completedAt, isLate, section, taskName, timeStr };
    this._saveLocalData(date, data);

    let serverSuccess = false;
    if (this._isConfigured()) {
      try {
        const payload = {
          date,
          employee,
          task_id: taskId,
          task_name: taskName,
          section,
          status: 'completed',
          is_late: isLate,
          time_str: timeStr,
          completed_at: completedAt
        };

        const response = await fetch(`${this._baseUrl()}/rest/v1/checklist_entries`, {
          method: 'POST',
          headers: this._headers({ 'Prefer': 'resolution=merge-duplicates' }),
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          serverSuccess = true;
        } else {
          console.warn('Сервер не принял запись задачи:', response.status);
        }
      } catch (err) {
        console.error('Ошибка отправки выполнения на сервер:', err);
      }
    }

    // Уведомление в Telegram:
    // Дневные задачи отправляем сразу. Утренние/вечерние — только когда закрыта вся секция.
    if (section === 'daytime') {
      let msg = `${isLate ? '⚠️' : '✅'} <b>Выполнено:</b> ${taskName}\n`;
      msg += `👤 <b>Сотрудник:</b> ${employee}\n`;
      msg += `🕒 <b>Время:</b> ${timeStr}\n`;
      if (isLate) {
        msg += `🔴 <i>Внимание: выполнено после дедлайна (${CONFIG.DEADLINES[section]}:00)!</i>`;
      }
      this._sendTelegram(msg);
    } else {
      this._checkAndSendSectionNotification(employee, section, date);
    }

    return { success: true, isLate, timeStr };
  },

  /**
   * Отменить выполнение задачи
   */
  async undoTask(employee, taskId, section) {
    const date = this._todayKey();
    const compositeKey = employee + '_' + taskId;

    const localData = this._getLocalData(date);
    const taskEntry = localData[compositeKey];
    const taskName = taskEntry ? taskEntry.taskName : taskId;

    // Удаляем из localStorage
    const data = this._getLocalData(date);
    delete data[compositeKey];
    this._saveLocalData(date, data);

    if (this._isConfigured()) {
      try {
        const url = `${this._baseUrl()}/rest/v1/checklist_entries?date=eq.${date}&employee=eq.${encodeURIComponent(employee)}&task_id=eq.${encodeURIComponent(taskId)}`;
        await fetch(url, {
          method: 'DELETE',
          headers: this._headers()
        });
      } catch (err) {
        console.error('Ошибка удаления записи с сервера:', err);
      }
    }

    // Для утренней и вечерней секций не шлём спам-отмены в Telegram, только для дневных задач
    if (section === 'daytime') {
      let msg = `↩️ <b>Отмена выполнения:</b> ${taskName}\n`;
      msg += `👤 <b>Сотрудник:</b> ${employee}\n`;
      msg += `🕒 <b>Время отмены:</b> ${this._nowTimeStr()}`;
      this._sendTelegram(msg);
    }

    return { success: true };
  },

  /**
   * Отметить задачу как НЕвыполненную (с указанием причины)
   */
  async failTask(employee, taskId, taskName, section, reason) {
    const date = this._todayKey();
    const timeStr = this._nowTimeStr();
    const completedAt = new Date().toISOString();

    // Сохраняем в localStorage
    const data = this._getLocalData(date);
    const compositeKey = employee + '_' + taskId;
    data[compositeKey] = { employee, completedAt, isLate: false, isFailed: true, reason, section, taskName, timeStr };
    this._saveLocalData(date, data);

    if (this._isConfigured()) {
      try {
        const payload = {
          date,
          employee,
          task_id: taskId,
          task_name: taskName,
          section,
          status: 'failed',
          is_late: false,
          reason: reason || '',
          time_str: timeStr,
          completed_at: completedAt
        };

        await fetch(`${this._baseUrl()}/rest/v1/checklist_entries`, {
          method: 'POST',
          headers: this._headers({ 'Prefer': 'resolution=merge-duplicates' }),
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error('Ошибка отправки проваленной задачи на сервер:', err);
      }
    }

    // Уведомление в Telegram:
    // Дневные задачи отправляем сразу. Утренние/вечерние — только когда закрыта вся секция.
    if (section === 'daytime') {
      let msg = `❌ <b>Не выполнено:</b> ${taskName}\n`;
      msg += `👤 <b>Сотрудник:</b> ${employee}\n`;
      msg += `🕒 <b>Время:</b> ${timeStr}\n`;
      msg += `💬 <b>Причина:</b> ${reason || 'не указана'}`;
      this._sendTelegram(msg);
    } else {
      this._checkAndSendSectionNotification(employee, section, date);
    }

    return { success: true, timeStr };
  },

  /**
   * Залогировать посетителя
   */
  async logCustomersEvent(employee) {
    const date = this._todayKey();
    const timeStr = this._nowTimeStr();
    const eventTime = new Date().toISOString();

    // Сохраняем локально
    const localCustomers = this._getLocalCustomers(date);
    localCustomers.push({ employee, timestamp: eventTime, timeStr });
    this._saveLocalCustomers(date, localCustomers);

    if (this._isConfigured()) {
      try {
        const payload = {
          date,
          employee,
          time_str: timeStr,
          event_time: eventTime
        };

        await fetch(`${this._baseUrl()}/rest/v1/checklist_customers_log`, {
          method: 'POST',
          headers: this._headers(),
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error('Ошибка отправки лога покупателей на сервер:', err);
      }
    }

    return { success: true, timeStr };
  }
};