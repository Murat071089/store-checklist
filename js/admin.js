// ============================================
// Логика админ-панели
// ============================================

(function() {
  'use strict';

  // --- Состояние ---
  let currentUser = null;
  let selectedDate = null; // YYYY-MM-DD
  let dayData = { tasks: {}, customersLog: [] };
  let refreshTimer = null;

  // Сотрудники
  const EMPLOYEES = ['Агнеса', 'Оксана'];

  // --- Утилиты ---

  function formatDateDisplay(date) {
    return date.toLocaleDateString('ru-RU', {
      timeZone: CONFIG.TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  function formatDateAPI(date) {
    return date.toLocaleDateString('sv-SE', { timeZone: CONFIG.TIMEZONE });
  }

  function getTodayStr() {
    return formatDateAPI(new Date());
  }

  function getYesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatDateAPI(d);
  }

  function extractTime(isoString) {
    try {
      return new Date(isoString).toLocaleTimeString('ru-RU', {
        timeZone: CONFIG.TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return '';
    }
  }

  function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast visible ' + type;
    setTimeout(() => toast.classList.remove('visible'), 2500);
  }

  // --- Загрузка данных ---

  async function loadDayData(date) {
    if (date) selectedDate = date;

    const loading = document.getElementById('loading');
    loading.style.display = 'flex';

    try {
      const data = await API.getDayData(selectedDate);
      dayData = {
        tasks: data.tasks || {},
        customersLog: data.customersLog || []
      };
    } catch (err) {
      console.error('Ошибка загрузки:', err);
      showToast('Ошибка загрузки данных', 'error');
    }

    loading.style.display = 'none';
    renderAll();
  }

  // --- Рендеринг ---

  function renderAll() {
    renderOverallStatus();
    EMPLOYEES.forEach(emp => renderEmployeeCard(emp));
    renderCustomersJournal();
  }

  /**
   * Отрисовать общий статус дня (все задачи, независимо от сотрудника)
   */
  function renderOverallStatus() {
    const sections = ['morning', 'daytime', 'evening'];
    let grandTotal = 0;

    sections.forEach(section => {
      const stats = getSectionStats(section);
      grandTotal += stats.completed;

      const bar = document.getElementById(`overall-${section}-bar`);
      const text = document.getElementById(`overall-${section}-text`);

      if (bar && text) {
        const pct = stats.total > 0 ? (stats.completed / stats.total * 100) : 0;
        bar.style.width = pct + '%';
        bar.className = 'section-progress-fill';
        if (pct === 0) bar.classList.add('empty');
        else if (pct < 100) bar.classList.add('partial');
        text.textContent = `${stats.completed}/${stats.total}`;
      }
    });

    const totalEl = document.getElementById('overall-total');
    if (totalEl) {
      totalEl.textContent = `${grandTotal}/${TOTAL_TASKS}`;
      totalEl.className = 'total-number';
      if (grandTotal < TOTAL_TASKS) totalEl.classList.add('incomplete');
    }
  }

  /**
   * Посчитать выполненные задачи в секции (задачи общие — выполняет любой сотрудник)
   */
  function getSectionStats(section) {
    const tasks = TASKS[section];
    let completed = 0;
    let lateCount = 0;
    const incompleteTasks = [];
    const completedList = [];

    tasks.forEach(task => {
      // Проверяем композитные ключи для каждого сотрудника
      let found = false;
      for (const emp of EMPLOYEES) {
        const compositeKey = emp + '_' + task.id;
        const data = dayData.tasks[compositeKey];
        if (data) {
          completed++;
          if (data.isLate) lateCount++;
          completedList.push({ ...task, ...data });
          found = true;
          break; // Считаем один раз для общего статуса
        }
      }
      if (!found) {
        incompleteTasks.push(task);
      }
    });

    return {
      total: tasks.length,
      completed,
      lateCount,
      incompleteTasks,
      completedList
    };
  }

  /**
   * Посчитать задачи, выполненные конкретным сотрудником в секции
   */
  function getEmployeeSectionStats(employee, section) {
    const tasks = TASKS[section];
    let completed = 0;
    let lateCount = 0;
    const incompleteTasks = [];
    const completedList = [];

    tasks.forEach(task => {
      const compositeKey = employee + '_' + task.id;
      const data = dayData.tasks[compositeKey];
      if (data) {
        completed++;
        if (data.isLate) lateCount++;
        completedList.push({ ...task, ...data });
      } else {
        incompleteTasks.push(task);
      }
    });

    return {
      total: tasks.length,
      completed,
      lateCount,
      incompleteTasks,
      completedList
    };
  }

  function renderEmployeeCard(employee) {
    const key = employee === 'Агнеса' ? 'agnesa' : 'oksana';

    const sections = ['morning', 'daytime', 'evening'];
    let totalCompleted = 0;

    sections.forEach(section => {
      const stats = getEmployeeSectionStats(employee, section);
      totalCompleted += stats.completed;

      // Прогресс-бар
      const bar = document.getElementById(`${key}-${section}-bar`);
      const text = document.getElementById(`${key}-${section}-text`);

      if (bar && text) {
        const pct = stats.total > 0 ? (stats.completed / stats.total * 100) : 0;
        bar.style.width = pct + '%';

        // Цвет в зависимости от заполненности
        bar.className = 'section-progress-fill';
        if (pct === 0) bar.classList.add('empty');
        else if (pct < 100) bar.classList.add('partial');

        text.textContent = `${stats.completed}/${stats.total}`;
      }
    });

    // Общий прогресс
    const totalEl = document.getElementById(`${key}-total`);
    if (totalEl) {
      totalEl.textContent = `${totalCompleted}/${TOTAL_TASKS}`;
      totalEl.className = 'total-number';
      if (totalCompleted < TOTAL_TASKS) totalEl.classList.add('incomplete');
    }

    // Невыполненные задачи
    const incompleteEl = document.getElementById(`${key}-incomplete`);
    if (incompleteEl) {
      const allIncomplete = [];
      sections.forEach(section => {
        const stats = getEmployeeSectionStats(employee, section);
        stats.incompleteTasks.forEach(task => {
          // Проверяем, может другой сотрудник выполнил
          const data = dayData.tasks[task.id];
          if (!data) {
            allIncomplete.push(task);
          }
        });
      });

      if (allIncomplete.length > 0) {
        incompleteEl.innerHTML = `
          <div class="incomplete-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
            Невыполненные задачи (${allIncomplete.length}):
          </div>
          ${allIncomplete.map(t => `<div class="incomplete-item">${t.name}</div>`).join('')}
        `;
      } else {
        incompleteEl.innerHTML = `
          <div class="incomplete-header" style="color: #22c55e;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;stroke:#22c55e;"><polyline points="20 6 9 17 4 12"/></svg>
            Все задачи выполнены!
          </div>
        `;
      }
    }

    // Обработчик клика для детализации
    const card = document.getElementById(`${key}-card`);
    if (card) {
      // Удаляем старый обработчик
      card.onclick = () => showDetailModal(employee);
    }
  }

  function renderCustomersJournal() {
    const journalEl = document.getElementById('customers-journal');

    if (dayData.customersLog.length === 0) {
      journalEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:32px;height:32px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
          </div>
          <p>Записей пока нет</p>
        </div>
      `;
      return;
    }

    // Сортируем по времени (новые сверху)
    const sorted = [...dayData.customersLog].reverse();

    journalEl.innerHTML = sorted.map(entry => {
      const time = entry.timeStr || extractTime(entry.timestamp);
      return `
        <div class="journal-entry">
          <span class="journal-employee" style="display:flex;align-items:center;gap:6px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;stroke:var(--accent-bright);"><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></svg>
            ${entry.employee}
          </span>
          <span class="journal-time">${time}</span>
        </div>
      `;
    }).join('');
  }

  // --- Модальное окно деталей ---

  function showDetailModal(employee) {
    const modal = document.getElementById('detail-modal');
    const title = document.getElementById('detail-title');
    const tasksContainer = document.getElementById('detail-tasks');

    title.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;display:inline-block;vertical-align:-3px;margin-right:6px;stroke:var(--accent-bright);"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 10h6M9 14h6M9 8h2" /></svg>
      <span>${employee} — ${formatDateForPicker(selectedDate)}</span>
    `;

    const sectionNames = {
      morning: '🌅 До 10:00',
      daytime: '☀️ В течение дня',
      evening: '🌙 До 20:00'
    };

    let html = '';

    ['morning', 'daytime', 'evening'].forEach(section => {
      html += `<div class="detail-section-title">${sectionNames[section]}</div>`;

      TASKS[section].forEach(task => {
        const compositeKey = employee + '_' + task.id;
        const data = dayData.tasks[compositeKey];
        let icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--text-disabled);"><circle cx="12" cy="12" r="10"/></svg>`;
        let meta = '';
        let statusClass = '';

        if (data) {
          if (data.isFailed) {
            icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--error-critical);"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>`;
            statusClass = ' style="color: var(--error);"';
          } else if (data.isLate) {
            icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--error-bright);"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" /></svg>`;
            statusClass = ' style="color: var(--error-bright);"';
          } else {
            icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--success);"><polyline points="20 6 9 17 4 12" /></svg>`;
          }
          const time = data.timeStr || extractTime(data.completedAt);
          meta = `${data.employee} · ${time}`;
          if (data.isFailed) {
            meta += ' · <span class="late-badge" style="background: var(--error); color: #080706;">НЕ ВЫПОЛНЕНО</span>';
            if (data.reason) meta += `<br><small style="color: var(--error);">Причина: ${data.reason}</small>`;
          } else if (data.isLate) {
            meta += ' · <span class="late-badge">ОПОЗДАНИЕ</span>';
          }
        } else {
          meta = 'Не выполнено';
        }

        html += `
          <div class="detail-task">
            <span class="detail-status-icon">${icon}</span>
            <div class="detail-task-info">
              <div class="detail-task-name"${statusClass}>${task.name}</div>
              <div class="detail-task-meta">${meta}</div>
            </div>
          </div>
        `;
      });
    });

    tasksContainer.innerHTML = html;
    modal.classList.add('active');
    history.pushState({ modal: 'detail' }, '');
  }

  function formatDateForPicker(dateStr) {
    const parts = dateStr.split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }

  // --- Навигация по датам ---

  function updateDateDisplay() {
    const display = document.getElementById('selected-date');
    display.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:6px;stroke:var(--accent-bright);"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
      <span>${formatDateForPicker(selectedDate)}</span>
    `;

    // Обновляем активные кнопки
    const todayBtn = document.getElementById('today-btn');
    const yesterdayBtn = document.getElementById('yesterday-btn');
    const datePicker = document.getElementById('date-picker');

    todayBtn.classList.toggle('active', selectedDate === getTodayStr());
    yesterdayBtn.classList.toggle('active', selectedDate === getYesterdayStr());
    datePicker.value = selectedDate;
  }

  function handleDateChange(newDate) {
    selectedDate = newDate;
    updateDateDisplay();
    loadDayData();
  }

  // --- Инициализация ---

  document.addEventListener('DOMContentLoaded', () => {
    // Проверка авторизации
    currentUser = Auth.requireAuth('admin');
    if (!currentUser) return;

    // Устанавливаем сегодняшнюю дату
    selectedDate = getTodayStr();
    updateDateDisplay();

    // Навигация по датам
    document.getElementById('today-btn').addEventListener('click', () => {
      handleDateChange(getTodayStr());
    });

    document.getElementById('yesterday-btn').addEventListener('click', () => {
      handleDateChange(getYesterdayStr());
    });

    document.getElementById('date-picker').addEventListener('change', (e) => {
      if (e.target.value) {
        handleDateChange(e.target.value);
      }
    });

    // Кнопка выхода
    document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());

    // Закрытие модального окна
    const closeDetail = () => {
      const m = document.getElementById('detail-modal');
      if (m.classList.contains('active')) {
        m.classList.remove('active');
        return true;
      }
      return false;
    };

    document.getElementById('detail-close').addEventListener('click', () => {
      if (closeDetail() && history.state && history.state.modal === 'detail') history.back();
    });

    document.getElementById('detail-modal').addEventListener('click', (e) => {
      if (e.target.id === 'detail-modal') {
        if (closeDetail() && history.state && history.state.modal === 'detail') history.back();
      }
    });

    // Отслеживание сети
    window.addEventListener('online', () => {
      document.getElementById('offline-banner').classList.remove('visible');
    });
    window.addEventListener('offline', () => {
      document.getElementById('offline-banner').classList.add('visible');
    });

    // Загрузка данных
    loadDayData();

    // Автообновление каждые 2 минуты
    refreshTimer = setInterval(() => loadDayData(), CONFIG.ADMIN_REFRESH_INTERVAL);

    // History API — кнопка «Назад»
    history.replaceState({ page: 'admin' }, '');

    window.addEventListener('popstate', (e) => {
      if (closeDetail()) return;
      Auth.logout();
    });
  });

})();
