// ============================================
// Логика страницы сотрудника
// ============================================

(function() {
  'use strict';

  // --- Состояние ---
  let currentUser = null;
  let completedTasks = {};
  let customersLog = [];
  let undoTimers = new Map(); // taskId -> { timerId, expireAt }
  let refreshTimer = null;

  // Иконки задач (Кастомные SVG-строки)
  const TASK_ICONS = {
    m1: `<svg viewBox="0 0 24 24"><path d="M5 3H19V21H5V3Z" /><path d="M14 12H15" /><path d="M2 21H22" /></svg>`, // передняя дверь
    m2: `<svg viewBox="0 0 24 24"><path d="M5 3H19V21H5V3Z" /><path d="M14 12H15" /><path d="M2 21H22" /></svg>`, // задняя дверь
    m3: `<svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2" /><circle cx="12" cy="7" r="2" /><circle cx="12" cy="15" r="4" /></svg>`, // колонка
    m4: `<svg viewBox="0 0 24 24"><path d="M18 10V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v4a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4Z" /><path d="M12 14v4a2 2 0 0 0 2 2h4" /><path d="M9 2v2" /><path d="M15 2v2" /></svg>`, // зарядка
    m5: `<svg viewBox="0 0 24 24"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM5 16l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" /></svg>`, // лишние провода
    m6: `<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="13" rx="2" /><path d="M12 16v4M8 20h8M7 3l4 4M17 3l-4 4" /></svg>`, // включить тв
    m7: `<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11L12 22V2l5.5 4.5-11 11" /></svg>`, // Bluetooth
    m8: `<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>`, // музыка
    m9: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 10h6M9 14h6M9 8h2" /></svg>`, // утренний чек-лист
    d1: `<svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01M1 1l22 22" /></svg>`, // убрать телефоны
    d2: `<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>`, // быть внимательными
    e1: `<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37zM17.5 6.5h.01" /></svg>`, // Instagram
    e2: `<svg viewBox="0 0 24 24"><path d="M21.5 2L1.5 9.75l7.5 3.25 3.25 7.5zM9 13l4-4" /></svg>`, // Telegram
    e3: `<svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>`, // WhatsApp
    e4: `<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="13" rx="2" /><path d="M12 16v4M8 20h8M7 3l4 4M17 3l-4 4" /></svg>`, // выключить тв
    e5: `<svg viewBox="0 0 24 24"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .6 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5h6zM9 18h6M10 22h4" /></svg>`, // выключить свет
    e6: `<svg viewBox="0 0 24 24"><path d="M10 22V12H7V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4h-3v10M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" /></svg>`, // санузел
    e7: `<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>`, // проверить магазин
    e8: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 10h6M9 14h6M9 8h2" /></svg>` // вечерний чек-лист
  };

  // --- Утилиты ---

  /** Получить текущую дату в московском часовом поясе (DD.MM.YYYY) */
  function formatDateDisplay(date) {
    return date.toLocaleDateString('ru-RU', {
      timeZone: CONFIG.TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  /** Получить дату для API (YYYY-MM-DD) */
  function formatDateAPI(date) {
    return date.toLocaleDateString('sv-SE', { timeZone: CONFIG.TIMEZONE });
  }

  /** Получить текущее время HH:MM */
  function getCurrentTime() {
    return new Date().toLocaleTimeString('ru-RU', {
      timeZone: CONFIG.TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /** Получить текущий час (число) */
  function getCurrentHour() {
    return parseInt(new Date().toLocaleTimeString('en-US', {
      timeZone: CONFIG.TIMEZONE,
      hour: '2-digit',
      hour12: false
    }));
  }

  /** Проверка: сейчас после дедлайна секции? */
  function isPastDeadline(section) {
    const hour = getCurrentHour();
    if (section === 'morning') return hour >= CONFIG.DEADLINES.morning;
    if (section === 'evening') return hour >= CONFIG.DEADLINES.evening;
    return false; // daytime — без дедлайна
  }

  /** Извлечь время HH:MM из ISO-строки */
  function extractTime(isoString) {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('ru-RU', {
        timeZone: CONFIG.TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return '';
    }
  }

  /** Показать toast-уведомление */
  function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast visible ' + type;
    setTimeout(() => {
      toast.classList.remove('visible');
    }, 2500);
  }

  // --- Загрузка данных ---

  async function loadDayData() {
    const today = formatDateAPI(new Date());
    try {
      const data = await API.getDayData(today);
      completedTasks = data.tasks || {};
      customersLog = data.customersLog || [];
    } catch (err) {
      console.error('Ошибка загрузки данных:', err);
      // Используем локальные данные
    }
    renderAll();
  }

  // --- Рендеринг ---

  function renderAll() {
    renderSection('morning', TASKS.morning, document.getElementById('morning-tasks'));
    renderSection('daytime', TASKS.daytime, document.getElementById('daytime-tasks'));
    renderSection('evening', TASKS.evening, document.getElementById('evening-tasks'));
    updateProgress();
    updateSectionCounts();
    renderCustomersLog();
  }

  function renderSection(section, tasks, container) {
    container.innerHTML = '';
    tasks.forEach(task => {
      const compositeKey = currentUser.name + '_' + task.id;
      const completion = completedTasks[compositeKey];
      const card = createTaskCard(task, section, completion);
      container.appendChild(card);
    });
  }

  function createTaskCard(task, section, completion) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.id = 'task-' + task.id;
    const icon = TASK_ICONS[task.id] || `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>`;

    if (completion) {
      if (completion.isFailed) {
        card.classList.add('failed');
      } else {
        card.classList.add(completion.isLate ? 'late' : 'completed');
      }

      const timeDisplay = completion.timeStr || extractTime(completion.completedAt);
      const employeeDisplay = completion.employee || currentUser.name;

      let statusIconHTML, statusText;
      if (completion.isFailed) {
        statusIconHTML = `<span class="status-icon danger"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg></span>`;
        statusText = `Не выполнено · ${employeeDisplay} · ${timeDisplay}`;
      } else if (completion.isLate) {
        statusIconHTML = `<span class="status-icon warning"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" /></svg></span>`;
        statusText = `${employeeDisplay} · ${timeDisplay}`;
      } else {
        statusIconHTML = `<span class="status-icon success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>`;
        statusText = `${employeeDisplay} · ${timeDisplay}`;
      }

      let contentHTML = `
        <div class="task-name">${task.name}</div>
        <div class="task-status">
          ${statusIconHTML}
          <span>${statusText}</span>
          ${completion.isLate ? '<span class="late-badge">ОПОЗДАНИЕ</span>' : ''}
        </div>
      `;

      if (completion.isFailed && completion.reason) {
        contentHTML += `<div class="task-reason"><strong>Причина:</strong> ${completion.reason}</div>`;
      }

      const undoInfo = undoTimers.get(task.id);
      if (undoInfo && Date.now() < undoInfo.expireAt) {
        const secondsLeft = Math.ceil((undoInfo.expireAt - Date.now()) / 1000);
        contentHTML += `<div class="task-actions"><button class="undo-btn" data-task-id="${task.id}" data-section="${section}">↩ Отменить (${secondsLeft}с)</button></div>`;
      }

      card.innerHTML = `<div class="task-icon">${icon}</div><div class="task-content">${contentHTML}</div>`;

      const undoBtn = card.querySelector('.undo-btn');
      if (undoBtn) undoBtn.addEventListener('click', () => handleUndoTask(task.id, section));

    } else {
      card.innerHTML = `
        <div class="task-icon">${icon}</div>
        <div class="task-content"><div class="task-name">${task.name}</div></div>
        <div class="task-actions task-actions-two">
          <button class="complete-btn" data-task-id="${task.id}" data-section="${section}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><polyline points="20 6 9 17 4 12" /></svg>
          </button>
          <button class="fail-btn" data-task-id="${task.id}" data-section="${section}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      `;

      card.querySelector('.complete-btn').addEventListener('click', () => handleCompleteTask(task.id, task.name, section));
      card.querySelector('.fail-btn').addEventListener('click', () => showFailModal(task.id, task.name, section));
    }

    return card;
  }

  function updateProgress() {
    let completed = 0;
    const allTasks = [...TASKS.morning, ...TASKS.daytime, ...TASKS.evening];
    allTasks.forEach(task => {
      const compositeKey = currentUser.name + '_' + task.id;
      if (completedTasks[compositeKey]) completed++;
    });

    const progressText = document.getElementById('progress-text');
    const progressNumber = document.getElementById('progress-number');
    const ring = document.getElementById('progress-ring');

    if (progressText) progressText.textContent = `${completed} из ${TOTAL_TASKS} задач выполнено`;
    if (progressNumber) progressNumber.textContent = completed;

    // Circular SVG progress
    if (ring) {
      const circumference = 2 * Math.PI * 52;
      const offset = circumference - (completed / TOTAL_TASKS) * circumference;
      ring.style.strokeDasharray = circumference;
      ring.style.strokeDashoffset = offset;
    }

    // Legacy bar fallback
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) progressBar.style.width = `${(completed / TOTAL_TASKS) * 100}%`;
  }

  function updateSectionCounts() {
    ['morning', 'daytime', 'evening'].forEach(section => {
      const tasks = TASKS[section];
      let done = 0;
      tasks.forEach(t => {
        const compositeKey = currentUser.name + '_' + t.id;
        if (completedTasks[compositeKey]) done++;
      });
      const countEl = document.getElementById(section + '-count');
      if (countEl) {
        countEl.textContent = `${done}/${tasks.length}`;
        countEl.classList.toggle('done', done === tasks.length);
      }
    });
  }

  function renderCustomersLog() {
    const countEl = document.getElementById('customers-count');
    const logEl = document.getElementById('customers-log');

    if (customersLog.length === 0) {
      countEl.textContent = '';
      logEl.innerHTML = '';
      return;
    }

    countEl.textContent = `Нажато сегодня: ${customersLog.length} раз`;

    // Показываем последние 20 записей (новые сверху)
    const recent = [...customersLog].reverse().slice(0, 20);
    logEl.innerHTML = recent.map(entry => {
      const time = entry.timeStr || extractTime(entry.timestamp);
      return `
        <div class="customers-log-entry">
          <span style="display:flex;align-items:center;gap:6px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;stroke:var(--accent-bright);"><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></svg>
            ${entry.employee}
          </span>
          <span class="log-time">${time}</span>
        </div>
      `;
    }).join('');
  }

  // --- Обработчики ---

  async function handleCompleteTask(taskId, taskName, section) {
    // Блокируем кнопку
    const card = document.getElementById('task-' + taskId);
    const btn = card?.querySelector('.complete-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳';
    }

    try {
      const result = await API.completeTask(currentUser.name, taskId, taskName, section);

      if (result.success) {
        // Обновляем локальное состояние
        const compositeKey = currentUser.name + '_' + taskId;
        completedTasks[compositeKey] = {
          employee: currentUser.name,
          completedAt: new Date().toISOString(),
          isLate: result.isLate,
          timeStr: result.timeStr,
          section,
          taskName
        };

        // Запускаем таймер отмены (60 секунд)
        const expireAt = Date.now() + CONFIG.UNDO_TIMEOUT;
        const timerId = setTimeout(() => {
          undoTimers.delete(taskId);
          const taskDef = findTask(taskId);
          if (taskDef) {
            const container = card.parentElement;
            const curCard = document.getElementById('task-' + taskId);
            if (curCard && container) {
              const newCard = createTaskCard(taskDef, section, completedTasks[compositeKey]);
              container.replaceChild(newCard, curCard);
            }
          }
        }, CONFIG.UNDO_TIMEOUT);

        undoTimers.set(taskId, { timerId, expireAt });

        renderAll();

        const message = result.isLate
          ? `⚠️ Отмечено с опозданием: ${taskName}`
          : `✅ Выполнено: ${taskName}`;
        showToast(message, result.isLate ? 'warning' : 'success');
      }
    } catch (err) {
      console.error('Ошибка:', err);
      showToast('Ошибка сохранения', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><polyline points="20 6 9 17 4 12" /></svg>`;
      }
    }
  }

  async function handleUndoTask(taskId, section) {
    try {
      await API.undoTask(currentUser.name, taskId, section);

      const compositeKey = currentUser.name + '_' + taskId;
      delete completedTasks[compositeKey];

      const undoInfo = undoTimers.get(taskId);
      if (undoInfo) {
        clearTimeout(undoInfo.timerId);
        undoTimers.delete(taskId);
      }

      renderAll();
      showToast('↩ Отмена выполнена', 'success');
    } catch (err) {
      console.error('Ошибка отмены:', err);
      showToast('Ошибка при отмене', 'error');
    }
  }

  async function handleCustomersEvent() {
    const btn = document.getElementById('customers-btn');
    btn.disabled = true;

    try {
      const result = await API.logCustomersEvent(currentUser.name);
      if (result.success) {
        customersLog.push({
          employee: currentUser.name,
          timestamp: new Date().toISOString(),
          timeStr: result.timeStr
        });
        renderCustomersLog();
        showToast('📱 Записано!', 'success');
      }
    } catch (err) {
      showToast('Ошибка записи', 'error');
    }

    setTimeout(() => { btn.disabled = false; }, 1000);
  }

  /** Показать модалку «Не выполнено» с полем для причины */
  function showFailModal(taskId, taskName, section) {
    // Создаём модалку, если её ещё нет
    let modal = document.getElementById('fail-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'fail-modal';
      modal.className = 'pin-modal';
      modal.innerHTML = `
        <div class="pin-modal-content">
          <button class="pin-close" id="fail-close">←</button>
          <h2>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            Не выполнено
          </h2>
          <p id="fail-task-name"></p>
          <label>Причина (необязательно):</label>
          <textarea id="fail-reason" rows="3" placeholder="Напишите причину..."></textarea>
          <button id="fail-submit" class="pin-submit">Подтвердить</button>
        </div>
      `;
      document.body.appendChild(modal);

      // Закрытие модалки
      document.getElementById('fail-close').addEventListener('click', () => {
        modal.classList.remove('active');
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    }

    // Заполняем данные
    document.getElementById('fail-task-name').textContent = taskName;
    document.getElementById('fail-reason').value = '';

    // Устанавливаем обработчик
    const submitBtn = document.getElementById('fail-submit');
    const newSubmit = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmit, submitBtn);

    newSubmit.addEventListener('click', async () => {
      const reason = document.getElementById('fail-reason').value.trim();
      newSubmit.disabled = true;
      newSubmit.textContent = '⏳';

      await handleFailTask(taskId, taskName, section, reason);

      modal.classList.remove('active');
      newSubmit.disabled = false;
      newSubmit.textContent = 'Подтвердить';
    });

    modal.classList.add('active');
    history.pushState({ modal: 'fail' }, '');
    setTimeout(() => document.getElementById('fail-reason').focus(), 100);
  }

  async function handleFailTask(taskId, taskName, section, reason) {
    try {
      const result = await API.failTask(currentUser.name, taskId, taskName, section, reason);

      if (result.success) {
        const compositeKey = currentUser.name + '_' + taskId;
        completedTasks[compositeKey] = {
          employee: currentUser.name,
          completedAt: new Date().toISOString(),
          isLate: false,
          isFailed: true,
          reason: reason || '',
          timeStr: result.timeStr,
          section,
          taskName
        };

        const expireAt = Date.now() + CONFIG.UNDO_TIMEOUT;
        const timerId = setTimeout(() => {
          undoTimers.delete(taskId);
          renderAll();
        }, CONFIG.UNDO_TIMEOUT);
        undoTimers.set(taskId, { timerId, expireAt });

        renderAll();
        showToast(`❌ Отмечено: ${taskName}`, 'error');
      }
    } catch (err) {
      console.error('Ошибка:', err);
      showToast('Ошибка сохранения', 'error');
    }
  }

  /** Найти задачу по ID */
  function findTask(taskId) {
    for (const section of ['morning', 'daytime', 'evening']) {
      const found = TASKS[section].find(t => t.id === taskId);
      if (found) return found;
    }
    return null;
  }

  // --- Инициализация ---

  document.addEventListener('DOMContentLoaded', () => {
    // Проверка авторизации
    currentUser = Auth.requireAuth('employee');
    if (!currentUser) return;

    // Устанавливаем дату и имя
    document.getElementById('current-date').innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:6px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>${formatDateDisplay(new Date())}`;
    document.getElementById('employee-name').textContent = currentUser.name;

    // Кнопка выхода
    document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());

    // Кнопка «Покупатели зашли»
    document.getElementById('customers-btn').addEventListener('click', handleCustomersEvent);

    // Отслеживание сети
    window.addEventListener('online', () => {
      document.getElementById('offline-banner').classList.remove('visible');
    });
    window.addEventListener('offline', () => {
      document.getElementById('offline-banner').classList.add('visible');
    });

    // Загрузка данных
    loadDayData();

    // Автообновление каждые 5 минут
    refreshTimer = setInterval(loadDayData, CONFIG.REFRESH_INTERVAL);

    // History API — кнопка «Назад»
    history.replaceState({ page: 'employee' }, '');

    window.addEventListener('popstate', (e) => {
      // Закрыть модалку fail если открыта
      const failModal = document.getElementById('fail-modal');
      if (failModal && failModal.classList.contains('active')) {
        failModal.classList.remove('active');
        return;
      }
      // Иначе — вернуться на экран входа
      Auth.logout();
    });
  });

})();
