// ============================================
// Google Apps Script — Бэкенд чек-листа магазина
// ============================================
// Скопируйте этот код в Google Apps Script
// (Google Sheets → Расширения → Apps Script)
// ============================================

// --- Определение задач (для проверки завершения секций) ---
var TASK_COUNTS = {
  morning: ['m1','m2','m3','m4','m5','m6','m7','m8','m9'],
  daytime: ['d1','d2'],
  evening: ['e1','e2','e3','e4','e5','e6','e7','e8']
};

var SECTION_NAMES = {
  morning: 'Утренний чек-лист',
  daytime: 'Дневной чек-лист',
  evening: 'Вечерний чек-лист'
};

var TASK_NAMES = {
  'm1': 'Открыть переднюю дверь магазина',
  'm2': 'Открыть заднюю дверь магазина',
  'm3': 'Убрать колонку от телевизора',
  'm4': 'Убрать зарядку, блок питания и провод от колонки',
  'm5': 'Проверить, чтобы возле телевизора не было лишних проводов',
  'm6': 'Включить телевизор',
  'm7': 'Подключить колонку по Bluetooth',
  'm8': 'Включить музыку',
  'm9': 'Отправить / подтвердить утренний чек-лист до 10:00',
  'd1': 'При входе покупателей убрать телефоны',
  'd2': 'При входе покупателей быть внимательными к людям в магазине',
  'e1': 'Поставить реакции на посты в Instagram',
  'e2': 'Поставить реакции на посты в Telegram',
  'e3': 'Поставить реакции на посты в WhatsApp',
  'e4': 'Выключить телевизор',
  'e5': 'Выключить весь свет',
  'e6': 'Проверить санузел',
  'e7': 'Проверить магазин перед уходом',
  'e8': 'Отправить / подтвердить вечерний чек-лист до 20:00'
};

var EMPLOYEES = ['Агнеса', 'Оксана'];

// ============================================
// ОБРАБОТКА ЗАПРОСОВ
// ============================================

/**
 * Обработка GET-запросов (получение данных)
 */
function doGet(e) {
  try {
    var action = e.parameter.action;
    var result = {};

    if (action === 'getDayData') {
      var date = e.parameter.date;
      result = getDayData(date);
    } else {
      result = { error: 'Неизвестное действие: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Обработка POST-запросов (запись данных)
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    var result = {};

    switch (action) {
      case 'completeTask':
        result = completeTask(data);
        break;
      case 'undoTask':
        result = undoTask(data);
        break;
      case 'failTask':
        result = failTask(data);
        break;
      case 'logCustomers':
        result = logCustomersEvent(data);
        break;
      case 'verifyPin':
        result = verifyPin(data);
        break;
      default:
        result = { success: false, error: 'Неизвестное действие: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================

/**
 * Записать выполнение задачи
 */
function completeTask(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('tasks');

  // Добавляем строку
  sheet.appendRow([
    data.date,
    data.employee,
    data.section,
    data.taskId,
    data.taskName || TASK_NAMES[data.taskId] || '',
    data.completedAt,
    data.isLate ? 'TRUE' : 'FALSE',
    'FALSE' // undone
  ]);

  // Формируем время для уведомления
  var time = Utilities.formatDate(new Date(data.completedAt), 'Europe/Moscow', 'HH:mm:ss');

  // Отправляем уведомление в Telegram
  if (data.isLate) {
    sendTelegram('⚠️ ' + data.employee + ' отметила с опозданием: "' + (data.taskName || data.taskId) + '"\n🕐 Время: ' + time);
  } else {
    sendTelegram('✅ ' + data.employee + ' отметила: "' + (data.taskName || data.taskId) + '"\n🕐 Время: ' + time);
  }

  // Проверяем, завершена ли вся секция
  checkSectionComplete(data.employee, data.section, data.date, time);

  return { success: true };
}

/**
 * Отменить выполнение задачи
 */
function undoTask(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('tasks');
  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();

  // Ищем строку с этой задачей (не отменённую)
  for (var i = values.length - 1; i >= 1; i--) {
    if (values[i][0] == data.date &&
        values[i][1] == data.employee &&
        values[i][3] == data.taskId &&
        values[i][7] != 'TRUE' && values[i][7] !== true) {
      // Отмечаем как отменённую
      sheet.getRange(i + 1, 8).setValue('TRUE');
      break;
    }
  }

  return { success: true };
}

/**
 * Записать задачу как «Не выполнено» с причиной
 */
function failTask(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('tasks');

  sheet.appendRow([
    data.date,
    data.employee,
    data.section,
    data.taskId,
    data.taskName || TASK_NAMES[data.taskId] || '',
    data.completedAt,
    'FALSE',  // isLate
    'FALSE',  // undone
    'TRUE',   // isFailed
    data.reason || ''
  ]);

  var time = Utilities.formatDate(new Date(data.completedAt), 'Europe/Moscow', 'HH:mm:ss');
  var reasonText = data.reason ? '\n📝 Причина: ' + data.reason : '';
  sendTelegram('❌ ' + data.employee + ' не выполнила: "' + (data.taskName || data.taskId) + '"\n🕐 Время: ' + time + reasonText);

  return { success: true };
}

/**
 * Записать событие «Покупатели зашли»
 */
function logCustomersEvent(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('customers_log');

  sheet.appendRow([
    data.date,
    data.employee,
    data.timestamp
  ]);

  return { success: true };
}

/**
 * Проверить PIN-код
 */
function verifyPin(data) {
  var pinKey = '';
  if (data.user === 'Агнеса') pinKey = 'pin_agnesa';
  else if (data.user === 'Оксана') pinKey = 'pin_oksana';
  else if (data.user === 'Владелец') pinKey = 'pin_owner';
  else return { success: false, error: 'Неизвестный пользователь' };

  var storedPin = getConfigValue(pinKey);
  if (storedPin && storedPin == data.pin) {
    return { success: true };
  }

  return { success: false, error: 'Неверный PIN-код' };
}

/**
 * Получить данные за день
 */
function getDayData(date) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Получаем задачи
  var tasksSheet = ss.getSheetByName('tasks');
  var tasksData = tasksSheet.getDataRange().getValues();
  var tasks = {};

  for (var i = 1; i < tasksData.length; i++) {
    var row = tasksData[i];
    var rowDate = row[0];

    // Нормализуем дату
    if (rowDate instanceof Date) {
      rowDate = Utilities.formatDate(rowDate, 'Europe/Moscow', 'yyyy-MM-dd');
    }

    if (rowDate == date && row[7] != 'TRUE' && row[7] !== true) {
      var taskId = row[3];
      tasks[taskId] = {
        employee: row[1],
        section: row[2],
        taskName: row[4],
        completedAt: row[5],
        isLate: row[6] === 'TRUE' || row[6] === true,
        isFailed: (row.length > 8 && (row[8] === 'TRUE' || row[8] === true)) || false,
        reason: (row.length > 9 && row[9]) ? String(row[9]) : '',
        timeStr: ''
      };

      // Извлекаем время
      try {
        var d = new Date(row[5]);
        tasks[taskId].timeStr = Utilities.formatDate(d, 'Europe/Moscow', 'HH:mm:ss');
      } catch (e) {}
    }
  }

  // Получаем журнал покупателей
  var customersSheet = ss.getSheetByName('customers_log');
  var customersData = customersSheet.getDataRange().getValues();
  var customersLog = [];

  for (var j = 1; j < customersData.length; j++) {
    var cRow = customersData[j];
    var cDate = cRow[0];

    if (cDate instanceof Date) {
      cDate = Utilities.formatDate(cDate, 'Europe/Moscow', 'yyyy-MM-dd');
    }

    if (cDate == date) {
      var timeStr = '';
      try {
        timeStr = Utilities.formatDate(new Date(cRow[2]), 'Europe/Moscow', 'HH:mm:ss');
      } catch (e) {}

      customersLog.push({
        employee: cRow[1],
        timestamp: cRow[2],
        timeStr: timeStr
      });
    }
  }

  return { tasks: tasks, customersLog: customersLog };
}

// ============================================
// ПРОВЕРКИ И УВЕДОМЛЕНИЯ
// ============================================

/**
 * Проверить, завершена ли секция целиком для сотрудника
 */
function checkSectionComplete(employee, section, date, time) {
  var taskIds = TASK_COUNTS[section];
  if (!taskIds) return;

  var dayData = getDayData(date);

  var allDone = true;
  for (var i = 0; i < taskIds.length; i++) {
    var taskData = dayData.tasks[taskIds[i]];
    if (!taskData || taskData.employee !== employee) {
      allDone = false;
      break;
    }
  }

  if (allDone) {
    sendTelegram('🎉 ' + employee + ' завершила ' + SECTION_NAMES[section] + '!\n🕐 Время: ' + time);
  }
}

/**
 * Проверка утреннего дедлайна (триггер в 10:05)
 */
function checkMorningDeadline() {
  checkDeadline('morning', '10:00');
}

/**
 * Проверка вечернего дедлайна (триггер в 20:05)
 */
function checkEveningDeadline() {
  checkDeadline('evening', '20:00');
}

/**
 * Общая проверка дедлайна
 */
function checkDeadline(section, deadlineStr) {
  var today = Utilities.formatDate(new Date(), 'Europe/Moscow', 'yyyy-MM-dd');
  var dayData = getDayData(today);
  var taskIds = TASK_COUNTS[section];
  var hasIncomplete = false;
  var messages = [];

  for (var e = 0; e < EMPLOYEES.length; e++) {
    var emp = EMPLOYEES[e];
    var incomplete = [];

    for (var i = 0; i < taskIds.length; i++) {
      var taskData = dayData.tasks[taskIds[i]];
      if (!taskData || taskData.employee !== emp) {
        incomplete.push(TASK_NAMES[taskIds[i]] || taskIds[i]);
      }
    }

    if (incomplete.length > 0) {
      hasIncomplete = true;
      messages.push('• ' + emp + ': ' + incomplete.join(', '));
    } else {
      messages.push('• ' + emp + ': все выполнено ✅');
    }
  }

  if (hasIncomplete) {
    sendTelegram('❌ ' + SECTION_NAMES[section] + ' не завершён до ' + deadlineStr + '\n\nНевыполненные пункты:\n' + messages.join('\n'));
  }
}

/**
 * Напоминание в 09:30
 */
function sendMorningReminder930() {
  sendReminder('morning', '10:00', 30);
}

/**
 * Напоминание в 09:50
 */
function sendMorningReminder950() {
  sendReminder('morning', '10:00', 10);
}

/**
 * Напоминание в 19:30
 */
function sendEveningReminder1930() {
  sendReminder('evening', '20:00', 30);
}

/**
 * Напоминание в 19:50
 */
function sendEveningReminder1950() {
  sendReminder('evening', '20:00', 10);
}

/**
 * Отправка напоминания (если есть незавершённые задачи)
 */
function sendReminder(section, deadlineStr, minutesLeft) {
  var today = Utilities.formatDate(new Date(), 'Europe/Moscow', 'yyyy-MM-dd');
  var dayData = getDayData(today);
  var taskIds = TASK_COUNTS[section];
  var hasIncomplete = false;
  var details = [];

  for (var e = 0; e < EMPLOYEES.length; e++) {
    var emp = EMPLOYEES[e];
    var count = 0;

    for (var i = 0; i < taskIds.length; i++) {
      var taskData = dayData.tasks[taskIds[i]];
      if (!taskData || taskData.employee !== emp) {
        count++;
      }
    }

    if (count > 0) {
      hasIncomplete = true;
      details.push('• ' + emp + ': ' + count + ' задач не выполнено');
    }
  }

  if (hasIncomplete) {
    sendTelegram('⏰ Напоминание: до ' + deadlineStr + ' осталось ' + minutesLeft + ' минут\n\n' + details.join('\n'));
  }
}

// ============================================
// TELEGRAM
// ============================================

/**
 * Отправить сообщение в Telegram
 */
function sendTelegram(message) {
  try {
    var token = getConfigValue('telegram_bot_token');
    var chatId = getConfigValue('telegram_chat_id');

    if (!token || !chatId) {
      Logger.log('Telegram не настроен. Сообщение: ' + message);
      return;
    }

    var url = 'https://api.telegram.org/bot' + token + '/sendMessage';

    var payload = {
      'chat_id': chatId,
      'text': message,
      'parse_mode': 'HTML'
    };

    var options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    };

    UrlFetchApp.fetch(url, options);
  } catch (err) {
    Logger.log('Ошибка Telegram: ' + err.message);
  }
}

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

/**
 * Получить значение из листа config
 */
function getConfigValue(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('config');
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == key) {
      return String(data[i][1]);
    }
  }
  return null;
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ (запустить один раз вручную)
// ============================================

/**
 * Создать листы и заполнить начальные данные
 */
function initializeSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Лист tasks
  var tasksSheet = ss.getSheetByName('tasks');
  if (!tasksSheet) {
    tasksSheet = ss.insertSheet('tasks');
    tasksSheet.appendRow(['date', 'employee', 'section', 'taskId', 'taskName', 'completedAt', 'isLate', 'undone', 'isFailed', 'reason']);
    tasksSheet.setFrozenRows(1);
    tasksSheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#d9e2f3');
  }

  // Лист customers_log
  var customersSheet = ss.getSheetByName('customers_log');
  if (!customersSheet) {
    customersSheet = ss.insertSheet('customers_log');
    customersSheet.appendRow(['date', 'employee', 'timestamp']);
    customersSheet.setFrozenRows(1);
    customersSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#d9e2f3');
  }

  // Лист config
  var configSheet = ss.getSheetByName('config');
  if (!configSheet) {
    configSheet = ss.insertSheet('config');
    configSheet.appendRow(['key', 'value']);
    configSheet.appendRow(['telegram_bot_token', 'ВСТАВЬТЕ_ТОКЕН_БОТА']);
    configSheet.appendRow(['telegram_chat_id', 'ВСТАВЬТЕ_CHAT_ID']);
    configSheet.appendRow(['pin_agnesa', '1111']);
    configSheet.appendRow(['pin_oksana', '2222']);
    configSheet.appendRow(['pin_owner', '0000']);
    configSheet.setFrozenRows(1);
    configSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#d9e2f3');
    configSheet.setColumnWidth(1, 200);
    configSheet.setColumnWidth(2, 400);
  }

  Logger.log('✅ Листы инициализированы!');
}

/**
 * Настроить триггеры по времени (запустить один раз вручную)
 */
function setupTriggers() {
  // Удаляем все существующие триггеры
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }

  // Проверка утреннего дедлайна — 10:05
  ScriptApp.newTrigger('checkMorningDeadline')
    .timeBased()
    .everyDays(1)
    .atHour(10)
    .nearMinute(5)
    .inTimezone('Europe/Moscow')
    .create();

  // Проверка вечернего дедлайна — 20:05
  ScriptApp.newTrigger('checkEveningDeadline')
    .timeBased()
    .everyDays(1)
    .atHour(20)
    .nearMinute(5)
    .inTimezone('Europe/Moscow')
    .create();

  // Напоминание 09:30
  ScriptApp.newTrigger('sendMorningReminder930')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .nearMinute(30)
    .inTimezone('Europe/Moscow')
    .create();

  // Напоминание 09:50
  ScriptApp.newTrigger('sendMorningReminder950')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .nearMinute(50)
    .inTimezone('Europe/Moscow')
    .create();

  // Напоминание 19:30
  ScriptApp.newTrigger('sendEveningReminder1930')
    .timeBased()
    .everyDays(1)
    .atHour(19)
    .nearMinute(30)
    .inTimezone('Europe/Moscow')
    .create();

  // Напоминание 19:50
  ScriptApp.newTrigger('sendEveningReminder1950')
    .timeBased()
    .everyDays(1)
    .atHour(19)
    .nearMinute(50)
    .inTimezone('Europe/Moscow')
    .create();

  Logger.log('✅ Триггеры настроены!');
}

/**
 * Тест отправки в Telegram (для проверки)
 */
function testTelegram() {
  sendTelegram('🧪 Тестовое сообщение из чек-листа магазина!\nЕсли вы видите это — Telegram настроен верно.');
}
