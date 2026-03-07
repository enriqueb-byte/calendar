'use strict';

/**
 * Calendar Planner — Planner (planner.js)
 * Contract: Expects window.CalendarPlanner with state, getPrefs, savePrefs, getEvents, saveEvents,
 * getCategory, isMindsetCategoryId, dateKey, isToday, daysInMonth, firstDayOfMonth, escapeHtml,
 * MONTH_NAMES, WEEKDAYS_SUN, WEEKDAYS_MON, debounce; getMisogiDateForYear, renderAuditDashboard from audit.
 * Listeners attached: yearSelect, startMonthSelect, viewStyleSelect, durationSelect, hidePastMonthsBtn,
 * hideMonthsPastYearEndBtn, calendarControlsToggle, holidaysSelect, weekStartSelect, addEventToSelectedBtn,
 * clearEventsFromSelectedBtn, clearSelectionBtn, clearEventsCancelBtn, clearEventsBackdrop, clearEventsRemoveBtn,
 * monthsGrid (click, dragstart, dragover, drop), eventForm submit, modalCancel, modalDelete, modalBackdrop,
 * addRangeBtn, eventModal, toggleNewCategoryBtn, addCategoryInModalBtn, document keydown, dateContext*, categoriesModal,
 * settingsBtn, printLegendBtn, manageCategoriesBtn, legendListInner.
 */

var CP = window.CalendarPlanner;
var state = CP.state;
var getPrefs = CP.getPrefs;
var savePrefs = CP.savePrefs;
var getEvents = CP.getEvents;
var saveEvents = CP.saveEvents;
var getCategory = CP.getCategory;
var saveCategories = CP.saveCategories;
var isMindsetCategoryId = CP.isMindsetCategoryId;
var dateKey = CP.dateKey;
var isToday = CP.isToday;
var daysInMonth = CP.daysInMonth;
var firstDayOfMonth = CP.firstDayOfMonth;
var escapeHtml = CP.escapeHtml;
var MONTH_NAMES = CP.MONTH_NAMES;
var WEEKDAYS_SUN = CP.WEEKDAYS_SUN;
var WEEKDAYS_MON = CP.WEEKDAYS_MON;

function getMisogiDateForYearFromAudit(year) {
  return CP.getMisogiDateForYear ? CP.getMisogiDateForYear(year) : null;
}

function callRenderAuditDashboard() {
  if (CP.renderAuditDashboard) CP.renderAuditDashboard();
}

var plannerDomCache = {};
var renderMonthsDebounced = CP.debounce ? CP.debounce(function () { renderMonths(); }, 120) : function () { renderMonths(); };

function buildMonthData(year, month) {
  var days = daysInMonth(year, month);
  var first = firstDayOfMonth(year, month);
  var cells = [];
  var emptyCount = state.weekStart === 1 ? (first + 6) % 7 : first;
  for (var i = 0; i < emptyCount; i++) cells.push({ empty: true });
  for (var d = 1; d <= days; d++) {
    cells.push({
      day: d,
      dateKey: dateKey(year, month, d),
      today: isToday(year, month, d),
      empty: false,
    });
  }
  return cells;
}

function getWeekdays() {
  return state.weekStart === 1 ? WEEKDAYS_MON : WEEKDAYS_SUN;
}

function getDisplayedMonthKeys() {
  var set = {};
  var numMonths = Math.max(1, Math.min(24, state.durationMonths));
  for (var i = 0; i < numMonths; i++) {
    var m = (state.startMonth + i) % 12;
    var y = state.year + Math.floor((state.startMonth + i) / 12);
    var key = y + '-' + String(m + 1).padStart(2, '0');
    set[key] = true;
  }
  return set;
}

function easterSunday(year) {
  var a = year % 19;
  var b = Math.floor(year / 100);
  var c = year % 100;
  var d = Math.floor(b / 4);
  var e = b % 4;
  var g = Math.floor((8 * b + 13) / 25);
  var h = (19 * a + b - d - g + 15) % 30;
  var j = Math.floor(c / 4);
  var k = c % 4;
  var m = Math.floor((a + 11 * h) / 319);
  var r = (2 * e + 2 * j - k - h + m + 32) % 7;
  var n = Math.floor((h - m + r + 90) / 25);
  var p = (h - m + r + n + 19) % 32;
  return { month: n - 1, day: p };
}

function nthWeekdayOfMonth(year, month, n, weekday) {
  var first = new Date(year, month, 1).getDay();
  var offset = (weekday - first + 7) % 7;
  if (offset === 0 && first !== weekday) offset = 7;
  var d = 1 + offset + (n - 1) * 7;
  var daysInMonthVal = new Date(year, month + 1, 0).getDate();
  return d <= daysInMonthVal ? d : null;
}

function lastWeekdayOfMonth(year, month, weekday) {
  var last = new Date(year, month + 1, 0).getDate();
  var lastDayOfWeek = new Date(year, month, last).getDay();
  var diff = (lastDayOfWeek - weekday + 7) % 7;
  return last - diff;
}

function getHolidaysForYear(country, year) {
  var out = [];
  function add(m, d, label) {
    out.push({ dateKey: dateKey(year, m, d), label: label });
  }
  if (country === 'canada') {
    add(0, 1, 'New Year\'s Day');
    var easter = easterSunday(year);
    var goodFriday = new Date(year, easter.month, easter.day - 2);
    add(goodFriday.getMonth(), goodFriday.getDate(), 'Good Friday');
    var may25Dow = new Date(year, 4, 25).getDay();
    var victoriaDay = 25 - ((may25Dow + 6) % 7);
    add(4, victoriaDay, 'Victoria Day');
    add(6, 1, 'Canada Day');
    var aug1 = nthWeekdayOfMonth(year, 7, 1, 1);
    if (aug1 !== null) add(7, aug1, 'Civic Holiday');
    var sep1 = nthWeekdayOfMonth(year, 8, 1, 1);
    if (sep1 !== null) add(8, sep1, 'Labour Day');
    var oct2 = nthWeekdayOfMonth(year, 9, 2, 1);
    if (oct2 !== null) add(9, oct2, 'Thanksgiving');
    add(10, 11, 'Remembrance Day');
    add(11, 25, 'Christmas');
    add(11, 26, 'Boxing Day');
  }
  if (country === 'usa') {
    add(0, 1, 'New Year\'s Day');
    var mlk = nthWeekdayOfMonth(year, 0, 3, 1);
    if (mlk !== null) add(0, mlk, 'Martin Luther King Jr. Day');
    var pres = nthWeekdayOfMonth(year, 1, 3, 1);
    if (pres !== null) add(1, pres, 'Presidents\' Day');
    var mem = lastWeekdayOfMonth(year, 4, 1);
    add(4, mem, 'Memorial Day');
    add(5, 19, 'Juneteenth');
    add(6, 4, 'Independence Day');
    var labor = nthWeekdayOfMonth(year, 8, 1, 1);
    if (labor !== null) add(8, labor, 'Labor Day');
    var col = nthWeekdayOfMonth(year, 9, 2, 1);
    if (col !== null) add(9, col, 'Columbus Day');
    add(10, 11, 'Veterans Day');
    var thx = nthWeekdayOfMonth(year, 10, 4, 4);
    if (thx !== null) add(10, thx, 'Thanksgiving');
    add(11, 25, 'Christmas');
  }
  return out;
}

function renderLegend() {
  var container = document.getElementById('legendListInner');
  if (!container) return;
  container.innerHTML = '';

  function appendCategoryRow(cat) {
    var li = document.createElement('li');
    li.className = 'flex items-center gap-2 mb-3 min-h-[1.25rem]';
    li.innerHTML = '<span class="w-2.5 h-2.5 rounded-full flex-shrink-0 self-center" style="background-color:' + cat.color + '"></span><span class="text-xs text-ink-600 leading-5 self-center">' + escapeHtml(cat.label) + '</span>';
    container.appendChild(li);
  }
  function appendMindsetSeparator(parent) {
    var li = document.createElement('li');
    li.className = 'legend-mindset-separator mt-3 mb-3 border-t-2 border-ink-200';
    li.setAttribute('aria-hidden', 'true');
    parent.appendChild(li);
  }
  var mindsetSeparatorShown = false;
  state.categories.forEach(function (cat) {
    if (isMindsetCategoryId(cat.id) && !mindsetSeparatorShown) {
      appendMindsetSeparator(container);
      mindsetSeparatorShown = true;
    }
    appendCategoryRow(cat);
  });

  if (state.selectedLegendEvents.length > 0) {
    var changeWrap = document.createElement('li');
    changeWrap.className = 'mt-4 pt-3 border-t border-ink-200';
    var changeLabel = document.createElement('label');
    changeLabel.className = 'block text-xs font-medium text-ink-600 mb-2';
    changeLabel.textContent = 'Change category for ' + state.selectedLegendEvents.length + ' selected event' + (state.selectedLegendEvents.length === 1 ? '' : 's');
    changeWrap.appendChild(changeLabel);
    var changeRow = document.createElement('div');
    changeRow.className = 'flex gap-2 items-center';
    var changeSelect = document.createElement('select');
    changeSelect.id = 'legendChangeCategorySelect';
    changeSelect.className = 'flex-1 min-w-0 px-2 py-1.5 text-sm rounded border border-ink-200 bg-white';
    state.categories.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.label;
      changeSelect.appendChild(opt);
    });
    var applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'legend-change-category-btn px-3 py-1.5 rounded-lg bg-accent-500 text-white text-sm font-medium hover:bg-accent-600';
    applyBtn.textContent = 'Apply';
    changeRow.appendChild(changeSelect);
    changeRow.appendChild(applyBtn);
    changeWrap.appendChild(changeRow);
    container.appendChild(changeWrap);
  }
}

function applyLegendEventCategoryChange(newCategoryId) {
  state.selectedLegendEvents.forEach(function (sel) {
    for (var dk in state.events) {
      var list = state.events[dk] || [];
      list.forEach(function (ev) {
        if (ev.title === sel.title && (ev.category || '') === (sel.category || '')) ev.category = newCategoryId;
      });
    }
  });
  state.selectedLegendEvents = [];
  saveEvents(state.events);
  renderLegend();
  renderMonths();
}

function updateMultiSelectBar() {
  var btn = document.getElementById('addEventToSelectedBtn');
  var labelEl = document.getElementById('addEventToSelectedBtnLabel');
  var countEl = document.getElementById('multiSelectCount');
  if (!btn || !labelEl || !countEl) return;
  if (state.selectedDates.length > 0) {
    btn.classList.remove('add-event-btn-empty');
    btn.classList.add('add-event-btn-active');
    labelEl.textContent = 'Add event';
    countEl.textContent = state.selectedDates.length === 1 ? '(1 date selected)' : '(' + state.selectedDates.length + ' dates selected)';
  } else {
    btn.classList.remove('add-event-btn-active');
    btn.classList.add('add-event-btn-empty');
    labelEl.textContent = 'Select date';
    countEl.textContent = '(0 dates selected)';
  }
  var clearSelectionBtn = document.getElementById('clearSelectionBtn');
  if (clearSelectionBtn) clearSelectionBtn.disabled = state.selectedDates.length === 0 && state.selectedMonths.length === 0;
  var deleteEventsBtn = document.getElementById('clearEventsFromSelectedBtn');
  if (deleteEventsBtn) {
    var hasEventOnAnySelected = state.selectedDates.some(function (dk) {
      return (state.events[dk] || []).length > 0;
    });
    deleteEventsBtn.disabled = !hasEventOnAnySelected;
  }
  renderSelectedDateContext();
}

function buildConsolidatedEvents(occurrences) {
  var map = {};
  occurrences.forEach(function (occ) {
    var dk = occ.dateKey;
    var dayEvents = state.events[dk] || [];
    dayEvents.forEach(function (ev, index) {
      var key = (ev.title || '') + '\n' + (ev.category || '');
      if (!map[key]) {
        var cat = getCategory(ev.category);
        map[key] = { title: ev.title || '', categoryId: ev.category || '', color: cat.color, occurrences: [] };
      }
      map[key].occurrences.push({ dateKey: dk, eventIndex: index });
    });
  });
  return Object.keys(map).sort().map(function (k) { return map[k]; });
}

function nextDayDateKey(dateKeyStr) {
  var parts = dateKeyStr.split('-');
  if (parts.length !== 3) return dateKeyStr;
  var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10) - 1, d = parseInt(parts[2], 10);
  var next = new Date(y, m, d + 1);
  return next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0') + '-' + String(next.getDate()).padStart(2, '0');
}

function rangeToDateKeys(startDateKey, endDateKey) {
  if (!startDateKey || !endDateKey) return [];
  if (startDateKey > endDateKey) return rangeToDateKeys(endDateKey, startDateKey);
  var out = [];
  var d = startDateKey;
  while (d <= endDateKey) {
    out.push(d);
    if (d === endDateKey) break;
    d = nextDayDateKey(d);
  }
  return out;
}

function shortDateLabel(dateKeyStr) {
  var parts = dateKeyStr.split('-');
  if (parts.length !== 3) return dateKeyStr;
  var monthIndex = parseInt(parts[1], 10) - 1;
  var day = parseInt(parts[2], 10);
  var monthShort = (MONTH_NAMES[monthIndex] || '').substring(0, 3);
  return monthShort + ' ' + day;
}

function groupIntoContiguousRanges(dateKeys) {
  if (dateKeys.length === 0) return [];
  var sorted = dateKeys.slice().sort();
  var ranges = [];
  var i = 0;
  while (i < sorted.length) {
    var start = sorted[i];
    var end = start;
    i++;
    while (i < sorted.length && sorted[i] === nextDayDateKey(end)) {
      end = sorted[i];
      i++;
    }
    ranges.push({ start: start, end: end });
  }
  return ranges;
}

function formatRangeLabel(range) {
  if (range.start === range.end) return shortDateLabel(range.start);
  var startParts = range.start.split('-');
  var endParts = range.end.split('-');
  var sameMonth = startParts[0] === endParts[0] && startParts[1] === endParts[1];
  var endLabel = sameMonth ? String(parseInt(endParts[2], 10)) : shortDateLabel(range.end);
  return shortDateLabel(range.start) + '-' + endLabel;
}

function renderConsolidatedEventList(consolidated) {
  var html = '';
  consolidated.forEach(function (item) {
    var dateKeys = item.occurrences.map(function (o) { return o.dateKey; });
    var ranges = groupIntoContiguousRanges(dateKeys);
    ranges.forEach(function (range) {
      var firstInRange = item.occurrences.find(function (o) { return o.dateKey === range.start; });
      if (!firstInRange) return;
      var rangeLabel = formatRangeLabel(range);
      html += '<button type="button" class="selected-date-event-row w-full flex flex-col items-stretch gap-0.5 rounded px-2 py-1.5 text-left hover:bg-ink-50 cursor-pointer border-0 bg-transparent" data-date-key="' + escapeHtml(firstInRange.dateKey) + '" data-event-index="' + firstInRange.eventIndex + '">';
      html += '<span class="flex items-center gap-2 min-w-0">';
      html += '<span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color:' + item.color + '"></span>';
      html += '<span class="flex-1 min-w-0 truncate font-medium" title="' + escapeHtml(item.title) + '">' + escapeHtml(item.title) + '</span>';
      html += '</span>';
      html += '<span class="text-xs text-ink-500 pl-[1.125rem]">' + escapeHtml(rangeLabel) + '</span>';
      html += '</button>';
    });
  });
  return html;
}

function renderSelectedDateContext() {
  var panel = document.getElementById('selectedDateContext');
  var listEl = document.getElementById('selectedDateContextList');
  var titleEl = document.getElementById('selectedDateContextTitle');
  if (!panel || !listEl) return;
  if (state.selectedMonths.length > 0) {
    if (titleEl) titleEl.textContent = state.selectedMonths.length === 1
      ? 'Events in ' + MONTH_NAMES[state.selectedMonths[0].month] + ' ' + state.selectedMonths[0].year
      : 'Events in selected month(s)';
    panel.classList.remove('hidden');
    var sorted = state.selectedMonths.slice().sort(function (a, b) {
      return a.year !== b.year ? a.year - b.year : a.month - b.month;
    });
    var dateKeys = [];
    sorted.forEach(function (sm) {
      var days = daysInMonth(sm.year, sm.month);
      for (var d = 1; d <= days; d++) dateKeys.push(dateKey(sm.year, sm.month, d));
    });
    var consolidated = buildConsolidatedEvents(dateKeys.map(function (dk) { return { dateKey: dk }; }));
    var html = consolidated.length === 0
      ? '<p class="text-ink-400 italic text-xs">No events in selected month(s)</p>'
      : '<div class="space-y-1">' + renderConsolidatedEventList(consolidated) + '</div>';
    listEl.innerHTML = html;
    return;
  }
  if (state.selectedDates.length === 0) {
    panel.classList.add('hidden');
    listEl.innerHTML = '';
    if (titleEl) titleEl.textContent = 'Events on selected date(s)';
    return;
  }
  if (titleEl) titleEl.textContent = 'Events on selected date(s)';
  panel.classList.remove('hidden');
  var occurrences = state.selectedDates.map(function (dk) { return { dateKey: dk }; });
  var consolidated = buildConsolidatedEvents(occurrences);
  var html = consolidated.length === 0
    ? '<p class="text-ink-400 italic text-xs">No events</p>'
    : '<div class="space-y-1">' + renderConsolidatedEventList(consolidated) + '</div>';
  listEl.innerHTML = html;
}

function getViewGridCols() {
  var v = Math.min(6, Math.max(1, state.viewStyle));
  return 'grid-cols-' + v;
}

function renderMonth(y, month, weekdays, holidayMap) {
  var name = MONTH_NAMES[month];
  var cells = buildMonthData(y, month);
  var eventsForMonth = state.events;
  var rows = [];
  for (var i = 0; i < cells.length; i += 7) {
    var week = cells.slice(i, i + 7);
    rows.push(
      '<div class="grid grid-cols-7 gap-0.5 sm:gap-1">' +
      week.map(function (cell) {
        if (cell.empty) return '<div class="day-cell empty"></div>';
        var dayEvents = (eventsForMonth[cell.dateKey] || []);
        var todayClass = cell.today ? ' today' : '';
        var selectedClass = state.selectedDates.indexOf(cell.dateKey) !== -1 ? ' selected' : '';
        var canShowChips = state.viewStyle <= 2;
        var chipsHtml = '';
        var dotsHtml = '';
        var overflowBadge = '';
        if (dayEvents.length > 0) {
          var maxVisibleDots = state.viewStyle === 1 ? 8 : state.viewStyle === 2 ? 6 : 4;
          var showDots = dayEvents.slice(0, maxVisibleDots);
          var overflowCountDots = Math.max(0, dayEvents.length - maxVisibleDots);
          var maxVisibleChips = 5;
          var overflowCountChips = canShowChips && dayEvents.length > maxVisibleChips ? dayEvents.length - maxVisibleChips : 0;
          var overflowCount = Math.max(overflowCountDots, overflowCountChips);
          var showOverflow = overflowCount > 0;
          overflowBadge = showOverflow ? '<span class="event-more-badge flex-shrink-0" title="' + overflowCount + ' more event' + (overflowCount === 1 ? '' : 's') + '" aria-label="' + overflowCount + ' more">+</span>' : '';
          dotsHtml = '<div class="event-dots-wrapper flex gap-0.5 flex-shrink-0 flex-wrap w-full min-w-0">' +
            showDots.map(function (ev, idx) {
              var cat = getCategory(ev.category);
              return '<span class="event-dot cursor-grab active:cursor-grabbing" draggable="true" style="background-color:' + cat.color + '" title="' + escapeHtml(ev.title) + ' (drag to move)" data-date="' + escapeHtml(cell.dateKey) + '" data-event-index="' + idx + '"></span>';
            }).join('') + '</div>';
        }
        if (canShowChips && dayEvents.length > 0) {
          var chipsToShow = dayEvents.slice(0, 5);
          chipsHtml = '<div class="event-chips-wrapper flex flex-col gap-0.5 w-full min-w-0 mt-0.5">' +
            chipsToShow.map(function (ev, idx) {
              var cat = getCategory(ev.category);
              return '<span class="event-chip cursor-grab active:cursor-grabbing" draggable="true" style="border-left-color:' + cat.color + ';background-color:' + cat.color + '22" title="' + escapeHtml(ev.title) + ' (drag to move)" data-date="' + escapeHtml(cell.dateKey) + '" data-event-index="' + idx + '">' + escapeHtml(ev.title) + '</span>';
            }).join('') + '</div>';
        }
        var chipFallbackClass = chipsHtml ? ' has-chip-fallback' : '';
        var singleEventDotClass = '';
        var singleEventStyle = '';
        var singleEventDraggable = '';
        if (dayEvents.length === 1) {
          var cat = getCategory(dayEvents[0].category);
          singleEventDotClass = ' has-single-event-dot day-cell-draggable cursor-grab active:cursor-grabbing';
          singleEventStyle = ' style="--single-event-pastel:' + cat.color + '22; --single-event-primary:' + cat.color + ';"';
          singleEventDraggable = ' draggable="true" data-single-event-index="0"';
        }
        var holidayLabel = holidayMap[cell.dateKey] || '';
        var holidayHtml = holidayLabel ? '<div class="day-cell-holiday text-[10px] sm:text-xs text-ink-500 truncate flex-shrink-0 mt-0.5" title="' + escapeHtml(holidayLabel) + '">' + escapeHtml(holidayLabel) + '</div>' : '';
        return '<div class="day-cell' + todayClass + selectedClass + chipFallbackClass + singleEventDotClass + '"' + singleEventStyle + singleEventDraggable + ' data-date="' + cell.dateKey + '" role="button" tabindex="0">' +
          '<div class="day-cell-inner flex flex-col w-full min-w-0">' +
          '<div class="day-cell-date-row flex items-center justify-between gap-1 flex-shrink-0 min-w-0">' +
          '<span class="day-num font-medium min-w-[2ch] tabular-nums flex-shrink-0">' + cell.day + '</span>' + overflowBadge + '</div>' +
          holidayHtml + (dotsHtml ? '<div class="event-dots-row flex-shrink-0 mt-0.5">' + dotsHtml + '</div>' : '') + chipsHtml +
          '</div></div>';
      }).join('') + '</div>'
    );
  }
  var headerSelected = state.selectedMonths.some(function (sm) { return sm.year === y && sm.month === month; });
  return '<article class="month-card bg-white rounded-xl border border-ink-200 shadow-sm overflow-hidden print:shadow-none print:border-ink-300">' +
    '<div class="month-card-header px-3 py-2 sm:px-4 sm:py-3 border-b border-ink-200 bg-ink-50/80 cursor-pointer hover:bg-ink-100 transition-colors select-none rounded-t-xl' + (headerSelected ? ' ring-2 ring-accent-500 ring-inset bg-accent-50' : '') + '" role="button" tabindex="0" data-year="' + y + '" data-month="' + month + '" title="Select month (click a date to switch to date selection)">' +
    '<h2 class="text-sm sm:text-base font-semibold text-ink-800">' + name + ' ' + y + '</h2></div>' +
    '<div class="p-2 sm:p-3">' +
    '<div class="grid grid-cols-7 gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-ink-500 font-medium mb-1">' +
    weekdays.map(function (w) { return '<span class="text-center">' + w + '</span>'; }).join('') +
    '</div>' + rows.join('') + '</div></article>';
}

function renderMonths() {
  if (!plannerDomCache.monthsGrid) plannerDomCache.monthsGrid = document.getElementById('monthsGrid');
  var grid = plannerDomCache.monthsGrid;
  if (!grid) return;
  var year = state.year;
  var weekdays = getWeekdays();
  grid.className = 'months-grid grid gap-4 sm:gap-6 ' + getViewGridCols();
  var viewSelect = document.getElementById('viewStyleSelect');
  if (viewSelect) viewSelect.value = String(state.viewStyle);
  var yearSelect = document.getElementById('yearSelect');
  if (yearSelect && !yearSelect.options.length) {
    var currentYear = new Date().getFullYear();
    for (var y = currentYear - 10; y <= currentYear + 10; y++) {
      var opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    }
  }
  if (yearSelect) yearSelect.value = state.year;

  var startMonthSelect = document.getElementById('startMonthSelect');
  if (startMonthSelect && !startMonthSelect.options.length) {
    MONTH_NAMES.forEach(function (name, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = name;
      startMonthSelect.appendChild(opt);
    });
  }
  if (startMonthSelect) startMonthSelect.value = String(state.startMonth);

  var durationSelect = document.getElementById('durationSelect');
  if (durationSelect && !durationSelect.options.length) {
    for (var d = 1; d <= 24; d++) {
      var opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d + ' month' + (d === 1 ? '' : 's');
      durationSelect.appendChild(opt);
    }
  }
  if (durationSelect) durationSelect.value = String(state.durationMonths);

  var holidaysSelect = document.getElementById('holidaysSelect');
  if (holidaysSelect) holidaysSelect.value = state.holidaySet || 'none';

  var holidayMap = {};
  if (state.holidaySet && state.holidaySet !== 'none') {
    var yearsNeeded = {};
    var numMonths = Math.max(1, Math.min(24, state.durationMonths));
    for (var i = 0; i < numMonths; i++) {
      var ym = state.year + Math.floor((state.startMonth + i) / 12);
      yearsNeeded[ym] = true;
    }
    for (var yr in yearsNeeded) {
      var list = getHolidaysForYear(state.holidaySet, parseInt(yr, 10));
      list.forEach(function (h) { holidayMap[h.dateKey] = h.label; });
    }
  }

  var monthsToShow = [];
  var numMonths = Math.max(1, Math.min(24, state.durationMonths));
  for (var i = 0; i < numMonths; i++) {
    var m = (state.startMonth + i) % 12;
    var y = state.year + Math.floor((state.startMonth + i) / 12);
    monthsToShow.push({ year: y, month: m });
  }
  if (state.hidePastMonths) {
    var now = new Date();
    var currentYear = now.getFullYear();
    var currentMonth = now.getMonth();
    monthsToShow = monthsToShow.filter(function (item) {
      return item.year > currentYear || (item.year === currentYear && item.month >= currentMonth);
    });
    if (monthsToShow.length === 0) monthsToShow.push({ year: currentYear, month: currentMonth });
  }
  if (state.hideMonthsPastYearEnd) {
    monthsToShow = monthsToShow.filter(function (item) { return item.year <= state.year; });
    if (monthsToShow.length === 0) monthsToShow.push({ year: state.year, month: 11 });
  }
  state.selectedMonths = state.selectedMonths.filter(function (sm) {
    return monthsToShow.some(function (item) {
      return item.year === sm.year && item.month === sm.month;
    });
  });

  var hidePastBtn = document.getElementById('hidePastMonthsBtn');
  if (hidePastBtn) {
    hidePastBtn.setAttribute('aria-pressed', state.hidePastMonths ? 'true' : 'false');
    hidePastBtn.classList.toggle('bg-ink-200', state.hidePastMonths);
    hidePastBtn.classList.toggle('border-ink-300', state.hidePastMonths);
  }
  var hidePastYearEndBtn = document.getElementById('hideMonthsPastYearEndBtn');
  if (hidePastYearEndBtn) {
    hidePastYearEndBtn.setAttribute('aria-pressed', state.hideMonthsPastYearEnd ? 'true' : 'false');
    hidePastYearEndBtn.classList.toggle('bg-ink-200', state.hideMonthsPastYearEnd);
    hidePastYearEndBtn.classList.toggle('border-ink-300', state.hideMonthsPastYearEnd);
  }

  grid.innerHTML = monthsToShow.map(function (item) { return renderMonth(item.year, item.month, weekdays, holidayMap); }).join('');
  renderLegend();
  updateMultiSelectBar();
}

function renderModalCategoryOptions(selectedId) {
  var options = document.getElementById('categoryOptions');
  if (!options) return;
  var parts = [];
  var mindsetSeparatorHtml = '<div class="mt-3 mb-3 border-t-2 border-ink-200" aria-hidden="true"></div>';
  var mindsetSeparatorShown = false;
  state.categories.forEach(function (cat) {
    if (isMindsetCategoryId(cat.id) && !mindsetSeparatorShown) {
      parts.push(mindsetSeparatorHtml);
      mindsetSeparatorShown = true;
    }
    var checked = selectedId === cat.id;
    parts.push(
      '<label class="inline-flex items-center gap-1.5 cursor-pointer">' +
      '<input type="radio" name="category" value="' + cat.id + '" ' + (checked ? 'checked' : '') + ' class="rounded-full border-ink-300 text-ink-700 focus:ring-accent-500"/>' +
      '<span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color:' + cat.color + '"></span>' +
      '<span class="text-sm text-ink-700">' + escapeHtml(cat.label) + '</span></label>'
    );
  });
  options.innerHTML = parts.join('');
}

function addCategoryFromModal() {
  var nameEl = document.getElementById('newCategoryInModalName');
  var colorEl = document.getElementById('newCategoryInModalColor');
  var label = nameEl && nameEl.value ? nameEl.value.trim() : '';
  if (!label) return;
  var newCat = { id: 'cat_' + Date.now(), label: label, color: colorEl ? colorEl.value : '#2563eb' };
  state.categories.push(newCat);
  saveCategories();
  renderModalCategoryOptions(newCat.id);
  nameEl.value = '';
  if (colorEl) colorEl.value = '#2563eb';
  var newCatSection = document.getElementById('newCategoryInModalSection');
  var toggleBtn = document.getElementById('toggleNewCategoryBtn');
  if (newCatSection) { newCatSection.classList.add('hidden'); newCatSection.setAttribute('aria-hidden', 'true'); }
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
  renderLegend();
}

function toggleNewCategorySection() {
  var section = document.getElementById('newCategoryInModalSection');
  var btn = document.getElementById('toggleNewCategoryBtn');
  if (!section || !btn) return;
  var isHidden = section.classList.contains('hidden');
  if (isHidden) {
    section.classList.remove('hidden');
    section.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
    document.getElementById('newCategoryInModalName').focus();
  } else {
    section.classList.add('hidden');
    section.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
  }
}

function openModal(dateKeyVal, existingEventIndex, dateKeysMulti) {
  var isMulti = dateKeysMulti && dateKeysMulti.length > 0;
  state.selectedDateKey = isMulti ? null : dateKeyVal;
  document.getElementById('eventDateKey').value = isMulti ? dateKeysMulti.join(',') : dateKeyVal;
  document.getElementById('eventIndex').value = !isMulti && existingEventIndex != null ? String(existingEventIndex) : '';
  var eventIdEl = document.getElementById('eventId');
  if (eventIdEl) {
    var existingEventId = '';
    if (!isMulti && existingEventIndex != null && dateKeyVal) {
      var eventsOnDayForId = state.events[dateKeyVal] || [];
      var evForId = eventsOnDayForId[existingEventIndex];
      if (evForId && evForId.eventId) existingEventId = evForId.eventId;
    }
    eventIdEl.value = existingEventId;
  }
  document.getElementById('modalTitle').textContent = isMulti
    ? 'Add event to ' + dateKeysMulti.length + ' dates'
    : (existingEventIndex != null ? 'Edit event' : 'Add event');
  document.getElementById('eventTitle').value = '';
  document.getElementById('eventTitle').focus();

  var eventsOnDay = isMulti ? [] : (state.events[dateKeyVal] || []);
  var existing = !isMulti && existingEventIndex != null ? eventsOnDay[existingEventIndex] : null;
  var selectedCategoryId = existing && existing.category ? existing.category : (state.categories[0] && state.categories[0].id) || '';
  renderModalCategoryOptions(selectedCategoryId);
  var eventTypeRadios = document.querySelectorAll('input[name="eventType"]');
  eventTypeRadios.forEach(function (r) {
    r.checked = existing && (existing.eventType === 'offensive' || existing.eventType === 'defensive') ? r.value === existing.eventType : false;
  });
  var plannedByErrEl = document.getElementById('eventModalPlannedByError');
  if (plannedByErrEl) { plannedByErrEl.classList.add('hidden'); plannedByErrEl.textContent = ''; }

  var nameEl = document.getElementById('newCategoryInModalName');
  var colorEl = document.getElementById('newCategoryInModalColor');
  if (nameEl) nameEl.value = '';
  if (colorEl) colorEl.value = '#2563eb';

  var newCatSection = document.getElementById('newCategoryInModalSection');
  var toggleBtn = document.getElementById('toggleNewCategoryBtn');
  if (newCatSection) newCatSection.classList.add('hidden');
  if (newCatSection) newCatSection.setAttribute('aria-hidden', 'true');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');

  if (existing && !isMulti && dateKeyVal) {
    document.getElementById('eventTitle').value = existing.title;
    document.getElementById('modalDelete').classList.remove('hidden');
    var existingEventIdVal = eventIdEl && eventIdEl.value ? eventIdEl.value.trim() : '';
    if (existingEventIdVal) {
      var allDates = [];
      for (var dk in state.events) {
        var list = state.events[dk] || [];
        for (var k = 0; k < list.length; k++) {
          if (list[k].eventId === existingEventIdVal) allDates.push(dk);
        }
      }
      allDates.sort();
      var ranges = groupIntoContiguousRanges(allDates);
      renderEventModalRanges(ranges);
    } else {
      renderEventModalRanges([{ start: dateKeyVal, end: dateKeyVal }]);
    }
  } else {
    document.getElementById('modalDelete').classList.add('hidden');
    if (isMulti && dateKeysMulti && dateKeysMulti.length > 0) {
      var sorted = dateKeysMulti.slice().sort();
      var ranges = groupIntoContiguousRanges(sorted);
      renderEventModalRanges(ranges);
    } else if (dateKeyVal) {
      renderEventModalRanges([{ start: dateKeyVal, end: dateKeyVal }]);
    } else {
      renderEventModalRanges([{ start: '', end: '' }]);
    }
  }

  document.getElementById('eventModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('eventModal').classList.add('hidden');
  document.body.style.overflow = '';
  state.selectedDateKey = null;
}

function getDateKeysFromInput() {
  var raw = document.getElementById('eventDateKey').value;
  if (!raw) return [];
  return raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function getDateKeysFromRanges() {
  var rows = document.querySelectorAll('#eventModalRangesContainer .event-range-row');
  var all = [];
  for (var i = 0; i < rows.length; i++) {
    var startInput = rows[i].querySelector('.event-range-start');
    var endInput = rows[i].querySelector('.event-range-end');
    var start = startInput && startInput.value ? startInput.value.trim() : '';
    var end = endInput && endInput.value ? endInput.value.trim() : '';
    if (!start) continue;
    if (!end || end < start) end = start;
    var keys = rangeToDateKeys(start, end);
    keys.forEach(function (k) { all.push(k); });
  }
  all.sort();
  var uniq = [];
  for (var j = 0; j < all.length; j++) {
    if (j === 0 || all[j] !== all[j - 1]) uniq.push(all[j]);
  }
  return uniq;
}

function renderEventModalRanges(ranges) {
  var container = document.getElementById('eventModalRangesContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!ranges || ranges.length === 0) ranges = [{ start: '', end: '' }];
  ranges.forEach(function (r, i) {
    var row = document.createElement('div');
    row.className = 'event-range-row flex flex-wrap items-center gap-2';
    row.innerHTML = '<input type="date" class="event-range-start flex-1 min-w-0 px-3 py-2 rounded-lg border border-ink-200 text-ink-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500" aria-label="Start date" value="' + escapeHtml(r.start || '') + '" />' +
      '<span class="text-ink-400 text-sm">–</span>' +
      '<input type="date" class="event-range-end flex-1 min-w-0 px-3 py-2 rounded-lg border border-ink-200 text-ink-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500" aria-label="End date" value="' + escapeHtml(r.end || '') + '" />' +
      '<button type="button" class="event-range-remove px-2 py-1.5 text-xs text-ink-500 hover:text-red-600 hover:bg-red-50 rounded border border-transparent hover:border-red-200" title="Remove range">Remove</button>';
    container.appendChild(row);
  });
  updateEventRangeRemoveVisibility();
}

function updateEventRangeRemoveVisibility() {
  var rows = document.querySelectorAll('#eventModalRangesContainer .event-range-row');
  rows.forEach(function (row, i) {
    var btn = row.querySelector('.event-range-remove');
    if (btn) btn.classList.toggle('hidden', rows.length <= 1);
  });
}

function addEventModalRangeRow() {
  var container = document.getElementById('eventModalRangesContainer');
  if (!container) return;
  var row = document.createElement('div');
  row.className = 'event-range-row flex flex-wrap items-center gap-2';
  row.innerHTML = '<input type="date" class="event-range-start flex-1 min-w-0 px-3 py-2 rounded-lg border border-ink-200 text-ink-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500" aria-label="Start date" />' +
    '<span class="text-ink-400 text-sm">–</span>' +
    '<input type="date" class="event-range-end flex-1 min-w-0 px-3 py-2 rounded-lg border border-ink-200 text-ink-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500" aria-label="End date" />' +
    '<button type="button" class="event-range-remove px-2 py-1.5 text-xs text-ink-500 hover:text-red-600 hover:bg-red-50 rounded border border-transparent hover:border-red-200" title="Remove range">Remove</button>';
  container.appendChild(row);
  updateEventRangeRemoveVisibility();
}

function getSelectedCategory() {
  const radio = document.querySelector('input[name="category"]:checked');
  return radio ? radio.value : (state.categories[0] && state.categories[0].id) || '';
}

function getSelectedEventType() {
  var radio = document.querySelector('input[name="eventType"]:checked');
  return radio ? radio.value : '';
}

function handleSubmit(e) {
  e.preventDefault();
  var dateKeys = getDateKeysFromRanges();
  var title = document.getElementById('eventTitle').value.trim();
  if (!title || dateKeys.length === 0) return;
  var category = getSelectedCategory();
  var eventType = getSelectedEventType();
  if (eventType !== 'offensive' && eventType !== 'defensive') {
    var plannedByErr = document.getElementById('eventModalPlannedByError');
    if (plannedByErr) {
      plannedByErr.textContent = 'Choose planned by you (Offensive) or by others (Defensive).';
      plannedByErr.classList.remove('hidden');
      var firstRadio = document.querySelector('input[name="eventType"]');
      if (firstRadio) firstRadio.focus();
    }
    return;
  }
  var isEdit = !document.getElementById('modalDelete').classList.contains('hidden');
  if (category === 'misogi' && !isEdit) {
    var year = dateKeys[0].split('-')[0];
    if (getMisogiDateForYearFromAudit(year)) {
      alert('Only one Misogi per year is allowed. Your year already has a Misogi set.');
      return;
    }
  }
  var eventIdInput = document.getElementById('eventId');
  var existingEventId = eventIdInput && eventIdInput.value ? eventIdInput.value.trim() : '';
  if (isEdit && existingEventId) {
    for (var dk in state.events) {
      var list = state.events[dk] || [];
      var filtered = list.filter(function (ev) { return ev.eventId !== existingEventId; });
      if (filtered.length === 0) delete state.events[dk];
      else state.events[dk] = filtered;
    }
    dateKeys.forEach(function (dk) {
      var list = state.events[dk] ? state.events[dk].slice() : [];
      list.push({ title: title, category: category, eventId: existingEventId, eventType: eventType });
      state.events[dk] = list;
    });
  } else if (isEdit) {
    var fromKey = document.getElementById('eventDateKey').value.trim();
    var idx = parseInt(document.getElementById('eventIndex').value, 10);
    var list = state.events[fromKey] || [];
    var prev = idx >= 0 && idx < list.length ? list[idx] : null;
    list = list.slice();
    list.splice(idx, 1);
    if (list.length === 0) delete state.events[fromKey];
    else state.events[fromKey] = list;
    var eventIdToUse = prev && prev.eventId ? prev.eventId : 'ev_' + Date.now();
    dateKeys.forEach(function (dk) {
      var targetList = state.events[dk] ? state.events[dk].slice() : [];
      targetList.push({ title: title, category: category, eventId: eventIdToUse, eventType: eventType });
      state.events[dk] = targetList;
    });
  } else {
    var newEventId = 'ev_' + Date.now();
    dateKeys.forEach(function (dk) {
      var list = state.events[dk] ? state.events[dk].slice() : [];
      list.push({ title: title, category: category, eventId: newEventId, eventType: eventType });
      state.events[dk] = list;
    });
  }
  if (category === 'misogi' && title) {
    state.misogiTitle = title.trim();
    savePrefs();
  }
  saveEvents(state.events);
  state.selectedDates = [];
  renderMonths();
  if (state.viewMode === 'audit') callRenderAuditDashboard();
  closeModal();
}

function handleDelete() {
  var dateKeys = getDateKeysFromInput();
  if (dateKeys.length === 0) return;
  var dk = dateKeys[0];
  var idxEl = document.getElementById('eventIndex');
  var idx = idxEl && idxEl.value !== '' ? parseInt(idxEl.value, 10) : -1;
  var eventIdEl = document.getElementById('eventId');
  var eventId = eventIdEl && eventIdEl.value ? eventIdEl.value.trim() : '';
  var list = state.events[dk];
  if (list && idx >= 0 && idx < list.length) {
    var ev = list[idx];
    var idToRemove = (ev && ev.eventId) || eventId;
    if (idToRemove) {
      for (var d in state.events) {
        var arr = state.events[d].filter(function (e) { return e.eventId !== idToRemove; });
        if (arr.length === 0) delete state.events[d];
        else state.events[d] = arr;
      }
    } else {
      list.splice(idx, 1);
      if (list.length === 0) delete state.events[dk];
      else state.events[dk] = list;
    }
  }
  saveEvents(state.events);
  state.selectedDates = [];
  renderMonths();
  if (state.viewMode === 'audit') callRenderAuditDashboard();
  closeModal();
}

function moveEvent(fromDateKey, eventIndex, toDateKey) {
  if (!fromDateKey || toDateKey === fromDateKey) return false;
  var list = state.events[fromDateKey];
  if (!list || eventIndex < 0 || eventIndex >= list.length) return false;
  var ev = list[eventIndex];
  if (!ev) return false;
  list = list.slice();
  list.splice(eventIndex, 1);
  if (list.length === 0) delete state.events[fromDateKey];
  else state.events[fromDateKey] = list;
  var targetList = (state.events[toDateKey] || []).slice();
  targetList.push(ev);
  state.events[toDateKey] = targetList;
  saveEvents(state.events);
  return true;
}

function formatDateLabel(dateKeyStr) {
  var parts = dateKeyStr.split('-');
  if (parts.length !== 3) return dateKeyStr;
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var m = parseInt(parts[1], 10) - 1;
  return (m >= 0 && m < 12 ? months[m] : parts[1]) + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];
}

function showDateContextPopover(dateKeyVal, anchorEl) {
  window.popoverDateKey = dateKeyVal;
  var popover = document.getElementById('dateContextPopover');
  var backdrop = document.getElementById('dateContextBackdrop');
  var titleEl = document.getElementById('dateContextTitle');
  var listEl = document.getElementById('dateContextEvents');
  var addBtn = document.getElementById('dateContextAddBtn');
  if (!popover || !titleEl || !listEl || !addBtn) return;

  titleEl.textContent = formatDateLabel(dateKeyVal);
  var dayEvents = state.events[dateKeyVal] || [];
  listEl.innerHTML = '';
  if (dayEvents.length === 0) {
    var li = document.createElement('li');
    li.className = 'text-ink-400 italic';
    li.textContent = 'No events';
    listEl.appendChild(li);
  } else {
    dayEvents.forEach(function (ev, index) {
      var cat = getCategory(ev.category);
      var li = document.createElement('li');
      li.className = 'flex items-center gap-2 cursor-pointer rounded px-2 py-1 -mx-2 hover:bg-ink-100';
      li.setAttribute('data-date-key', dateKeyVal);
      li.setAttribute('data-event-index', String(index));
      li.innerHTML = '<span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color:' + cat.color + '"></span><span class="truncate">' + escapeHtml(ev.title) + '</span>';
      listEl.appendChild(li);
    });
  }

  var rect = anchorEl.getBoundingClientRect();
  var popoverBox = popover.querySelector('div');
  var padding = 8;
  var viewH = window.innerHeight;
  var viewW = window.innerWidth;
  var below = rect.bottom + padding;
  var above = rect.top - (popoverBox ? popoverBox.offsetHeight : 200) - padding;
  var left = rect.left;
  var maxRight = viewW - (popoverBox ? popoverBox.offsetWidth : 280) - padding;
  if (left < padding) left = padding;
  if (left > maxRight) left = maxRight;
  var top = below + (popoverBox ? popoverBox.offsetHeight : 0) <= viewH ? below : above;
  popover.style.left = left + 'px';
  popover.style.top = top + 'px';

  popover.classList.remove('hidden');
  backdrop.classList.remove('hidden');
}

function closeDateContextPopover() {
  document.getElementById('dateContextPopover').classList.add('hidden');
  document.getElementById('dateContextBackdrop').classList.add('hidden');
}

function openClearEventsModal() {
  if (state.selectedDates.length === 0) return;
  var seen = {};
  var uniqueEvents = [];
  state.selectedDates.forEach(function (dk) {
    var list = state.events[dk] || [];
    list.forEach(function (ev) {
      var key = (ev.eventId || (ev.title + '\0' + (ev.category || '')));
      if (!seen[key]) {
        seen[key] = true;
        uniqueEvents.push({ title: ev.title, category: ev.category || '', eventId: ev.eventId });
      }
    });
  });

  document.getElementById('clearEventsDateCount').textContent = state.selectedDates.length;
  document.getElementById('clearEventsSubtitle').textContent = state.selectedDates.length === 1 ? '1 date selected' : state.selectedDates.length + ' dates selected';

  var listEl = document.getElementById('clearEventsChecklist');
  var emptyEl = document.getElementById('clearEventsEmpty');
  var removeBtn = document.getElementById('clearEventsRemoveBtn');

  if (uniqueEvents.length === 0) {
    listEl.innerHTML = '';
    listEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    removeBtn.setAttribute('disabled', 'disabled');
  } else {
    listEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    removeBtn.removeAttribute('disabled');
    listEl.innerHTML = uniqueEvents.map(function (ev) {
      var cat = getCategory(ev.category);
      var checked = uniqueEvents.length === 1 ? ' checked' : '';
      var eventIdAttr = ev.eventId ? ' data-event-id="' + escapeHtml(ev.eventId) + '"' : '';
      return (
        '<label class="flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 hover:bg-ink-50">' +
        '<input type="checkbox" class="clear-event-cb rounded border-ink-300 text-ink-700 focus:ring-accent-500" data-title="' + escapeHtml(ev.title) + '" data-category="' + escapeHtml(ev.category) + '"' + eventIdAttr + checked + ' />' +
        '<span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color:' + cat.color + '"></span>' +
        '<span class="text-sm text-ink-800">' + escapeHtml(ev.title) + '</span></label>'
      );
    }).join('');
  }

  document.getElementById('clearEventsModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeClearEventsModal() {
  document.getElementById('clearEventsModal').classList.add('hidden');
  document.body.style.overflow = '';
}

function confirmClearSelectedEvents() {
  var checkboxes = document.querySelectorAll('#clearEventsChecklist input.clear-event-cb:checked');
  if (checkboxes.length === 0) {
    closeClearEventsModal();
    return;
  }
  var toRemove = [];
  checkboxes.forEach(function (cb) {
    toRemove.push({
      title: cb.getAttribute('data-title'),
      category: cb.getAttribute('data-category') || '',
      eventId: cb.getAttribute('data-event-id') || null
    });
  });

  state.selectedDates.forEach(function (dk) {
    var list = state.events[dk];
    if (!list) return;
    var filtered = list.filter(function (ev) {
      return !toRemove.some(function (r) {
        if (r.eventId && ev.eventId) return r.eventId === ev.eventId;
        return r.title === ev.title && (r.category || '') === (ev.category || '');
      });
    });
    if (filtered.length === 0) delete state.events[dk];
    else state.events[dk] = filtered;
  });

  saveEvents(state.events);
  state.selectedDates = [];
  renderMonths();
  closeClearEventsModal();
}

function delegateClick(e) {
  var monthHeader = e.target.closest('.month-card-header');
  if (monthHeader) {
    var y = parseInt(monthHeader.getAttribute('data-year'), 10);
    var m = parseInt(monthHeader.getAttribute('data-month'), 10);
    if (!isNaN(y) && !isNaN(m)) {
      var idx = state.selectedMonths.findIndex(function (sm) { return sm.year === y && sm.month === m; });
      if (idx >= 0) state.selectedMonths.splice(idx, 1);
      else state.selectedMonths.push({ year: y, month: m });
      state.selectedDates = [];
      renderMonths();
    }
    return;
  }
  var eventEl = e.target.closest('.event-dot, .event-chip');
  if (eventEl) {
    var dk = eventEl.getAttribute('data-date');
    var eventIndex = eventEl.getAttribute('data-event-index');
    if (dk != null && eventIndex != null) {
      e.preventDefault();
      e.stopPropagation();
      openModal(dk, parseInt(eventIndex, 10), null);
      return;
    }
  }
  var cell = e.target.closest('.day-cell[data-date]');
  if (!cell || cell.classList.contains('empty')) return;
  state.selectedMonths = [];
  var dk = cell.getAttribute('data-date');
  if (state.multiSelect) {
    var idx = state.selectedDates.indexOf(dk);
    if (idx === -1) state.selectedDates.push(dk);
    else state.selectedDates.splice(idx, 1);
    renderMonths();
    return;
  }
  state.multiSelect = true;
  if (state.selectedDates.indexOf(dk) === -1) state.selectedDates.push(dk);
  renderMonths();
}

function setWeekStart(start) {
  state.weekStart = start;
  savePrefs();
  var weekStartSelect = document.getElementById('weekStartSelect');
  if (weekStartSelect) weekStartSelect.value = String(start);
  renderMonths();
}

function getPrintLegendHTML() {
  var displayedMonths = getDisplayedMonthKeys();
  var byCategory = {};
  state.categories.forEach(function (c) { byCategory[c.id] = []; });
  var seen = {};
  for (var dk in state.events) {
    if (dk.length < 7 || !displayedMonths[dk.slice(0, 7)]) continue;
    var dayEvents = state.events[dk] || [];
    for (var j = 0; j < dayEvents.length; j++) {
      var ev = dayEvents[j];
      var cid = ev.category || (state.categories[0] && state.categories[0].id) || '';
      var key = ev.title + '|' + cid;
      if (seen[key]) continue;
      seen[key] = true;
      if (!byCategory[cid]) byCategory[cid] = [];
      byCategory[cid].push(ev.title);
    }
  }
  var hasAny = Object.keys(byCategory).some(function (cid) { return byCategory[cid].length > 0; });
  var numMonths = Math.max(1, Math.min(24, state.durationMonths));
  var endIdx = state.startMonth + numMonths - 1;
  var endYear = state.year + Math.floor(endIdx / 12);
  var endMonth = endIdx % 12;
  var rangeLabel = MONTH_NAMES[state.startMonth] + ' ' + state.year + ' – ' + MONTH_NAMES[endMonth] + ' ' + endYear;
  var cardStyle = 'background:#fff;border:1px solid #d9d9de;border-radius:0.75rem;overflow:hidden;max-width:32rem;margin:0 auto;';
  var headerStyle = 'padding:0.75rem 1rem;border-bottom:1px solid #d9d9de;background:#f7f7f8;font-size:0.875rem;font-weight:600;color:#3a3a40;';
  var bodyStyle = 'padding:1rem 1.25rem;font-size:0.875rem;';
  var title = '<div style="' + headerStyle + '">Legend – ' + rangeLabel + '</div>';
  if (!hasAny) {
    return '<div style="' + cardStyle + '">' + title + '<div style="' + bodyStyle + ';color:#91919d;font-style:italic;">No events in displayed range.</div></div>';
  }
  var html = '<div style="' + cardStyle + '">' + title + '<div style="' + bodyStyle + '">';
  state.categories.forEach(function (cat) {
    var titles = byCategory[cat.id] || [];
    if (titles.length === 0) return;
    titles.sort(function (a, b) { return a.localeCompare(b); });
    html += '<div style="margin-bottom:1rem;">';
    html += '<div style="display:flex;align-items:center;gap:0.5rem;font-weight:500;color:#3a3a40;margin-bottom:0.375rem;">';
    html += '<span style="width:10px;height:10px;border-radius:9999px;background-color:' + cat.color + ';flex-shrink:0;"></span>';
    html += '<span style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;">' + escapeHtml(cat.label) + '</span>';
    html += '</div>';
    html += '<ul style="margin:0;padding-left:1rem;color:#4d4d56;list-style:disc;">';
    titles.forEach(function (t) {
      html += '<li style="margin-bottom:0.25rem;">' + escapeHtml(t) + '</li>';
    });
    html += '</ul></div>';
  });
  html += '</div></div>';
  return html;
}

function printLegendOnly() {
  document.body.setAttribute('data-print-legend-only', 'true');
  var container = document.getElementById('printLegendOnly');
  if (container) {
    container.innerHTML = '<div style="padding:2rem;min-height:100vh;box-sizing:border-box;display:flex;align-items:flex-start;justify-content:center;">' + getPrintLegendHTML() + '</div>';
  }
  var afterPrint = function () {
    document.body.removeAttribute('data-print-legend-only');
    if (container) container.innerHTML = '';
    window.removeEventListener('afterprint', afterPrint);
  };
  window.addEventListener('afterprint', afterPrint);
  setTimeout(function () { window.print(); }, 100);
}

function moveCategory(id, direction) {
  var idx = state.categories.findIndex(function (c) { return c.id === id; });
  if (idx === -1) return;
  var next = direction === 'up' ? idx - 1 : idx + 1;
  if (next < 0 || next >= state.categories.length) return;
  var arr = state.categories.slice();
  var tmp = arr[idx];
  arr[idx] = arr[next];
  arr[next] = tmp;
  state.categories = arr;
  saveCategories();
  renderCategoriesList();
  renderMonths();
  renderLegend();
}

function renderCategoriesList() {
  var list = document.getElementById('categoriesList');
  if (!list) return;
  var n = state.categories.length;
  list.innerHTML = state.categories.map(function (cat, index) {
    var upDisabled = index === 0;
    var downDisabled = index === n - 1;
    var upClass = upDisabled ? ' category-move-up opacity-40 cursor-not-allowed' : ' category-move-up text-ink-500 hover:bg-ink-100 rounded';
    var downClass = downDisabled ? ' category-move-down opacity-40 cursor-not-allowed' : ' category-move-down text-ink-500 hover:bg-ink-100 rounded';
    return (
      '<li class="flex items-center gap-2 py-2 px-3 rounded-lg border border-ink-100 hover:bg-ink-50">' +
      '<div class="flex flex-col gap-0">' +
      '<button type="button" class="category-move-up p-0.5 leading-none text-sm' + upClass + '" data-id="' + escapeHtml(cat.id) + '" data-dir="up" title="Move up" aria-label="Move up"' + (upDisabled ? ' disabled' : '') + '>↑</button>' +
      '<button type="button" class="category-move-down p-0.5 leading-none text-sm' + downClass + '" data-id="' + escapeHtml(cat.id) + '" data-dir="down" title="Move down" aria-label="Move down"' + (downDisabled ? ' disabled' : '') + '>↓</button>' +
      '</div>' +
      '<input type="color" value="' + cat.color + '" class="category-color-input w-8 h-8 rounded cursor-pointer border border-ink-200" data-id="' + escapeHtml(cat.id) + '" title="Change color"/>' +
      '<input type="text" value="' + escapeHtml(cat.label) + '" class="category-label-input flex-1 min-w-0 px-2 py-1 text-sm rounded border border-ink-200" data-id="' + escapeHtml(cat.id) + '" />' +
      (cat.id === 'misogi' || cat.id === '8weekwin' ? '' : '<button type="button" class="category-delete px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded" data-id="' + escapeHtml(cat.id) + '" title="Delete category">Delete</button>') +
      '</li>'
    );
  }).join('');
}

function openCategoriesModal() {
  state.editingCategoryId = null;
  document.getElementById('newCategoryName').value = '';
  document.getElementById('newCategoryColor').value = '#2563eb';
  document.getElementById('addCategoryBtn').textContent = 'Add';
  renderCategoriesList();
  document.getElementById('categoriesModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeCategoriesModal() {
  document.getElementById('categoriesModal').classList.add('hidden');
  document.body.style.overflow = '';
}

function openSettingsModal() {
  document.getElementById('settingsMenu').classList.remove('hidden');
  document.getElementById('settingsResetPanel').classList.add('hidden');
  document.getElementById('settingsModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
  document.body.style.overflow = '';
}

function showSettingsResetPanel() {
  document.getElementById('settingsMenu').classList.add('hidden');
  document.getElementById('settingsResetPanel').classList.remove('hidden');
}

function showSettingsMenu() {
  document.getElementById('settingsResetPanel').classList.add('hidden');
  document.getElementById('settingsMenu').classList.remove('hidden');
}

function resetToDefaults() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREFS_KEY);
  localStorage.removeItem(CATEGORIES_STORAGE_KEY);
  var now = new Date();
  state.year = now.getFullYear();
  state.startMonth = now.getMonth();
  state.weekStart = 0;
  state.viewStyle = 4;
  state.durationMonths = 12;
  state.hidePastMonths = false;
  state.hideMonthsPastYearEnd = false;
  state.holidaySet = 'none';
  state.title = 'My Year';
  state.misogiTitle = '';
  state.misogiWho = '';
  state.misogiWhere = '';
  state.misogiDescription = '';
  state.misogiWhatSetsApart = '';
  state.misogiPreparation = [];
  state.misogiOutcome = null;
  state.misogiLessons = '';
  state.misogiPhoto = '';
  state.misogiImages = [];
  state.misogiQualified = false;
  state.waypostStatuses = {};
  state.lifeDateOfBirth = '';
  state.lifeGender = 'male';
  state.lifeExpectancyOverride = null;
  state.lifeExpectancyOverrideActive = false;
  state.lifeChildren = [];
  state.lifeHasChildren = false;
  state.lifeParents = [];
  state.lifeHasLivingParents = false;
  state.lifeMilestones = [];
  state.events = {};
  state.categories = DEFAULT_CATEGORIES.slice();
  state.selectedDates = [];
  state.selectedMonths = [];
  state.multiSelect = false;
  state.selectedLegendEvents = [];
  saveCategories();
  savePrefs();
  saveEvents(state.events);
  closeSettingsModal();
  setWeekStart(state.weekStart);
  var titleEl = document.getElementById('appTitle');
  if (titleEl) titleEl.textContent = 'My Year';
  renderMonths();
}

function deleteCategory(id) {
  if (id === 'misogi' || id === '8weekwin') return;
  if (state.categories.length <= 1) return;
  var fallbackId = (state.categories.find(function (c) { return c.id !== id; }) || {}).id;
  if (!fallbackId) return;
  for (var dk in state.events) {
    var list = state.events[dk] || [];
    state.events[dk] = list.map(function (ev) {
      return ev.category === id ? { title: ev.title, category: fallbackId, eventId: ev.eventId } : ev;
    });
  }
  state.categories = state.categories.filter(function (c) { return c.id !== id; });
  saveCategories();
  saveEvents(state.events);
  renderCategoriesList();
  renderMonths();
  renderLegend();
}

function addOrUpdateCategory() {
  var nameEl = document.getElementById('newCategoryName');
  var colorEl = document.getElementById('newCategoryColor');
  var label = nameEl.value.trim();
  if (!label) return;
  if (state.editingCategoryId) {
    var cat = state.categories.find(function (c) { return c.id === state.editingCategoryId; });
    if (cat) { cat.label = label; cat.color = colorEl.value; saveCategories(); }
    state.editingCategoryId = null;
    document.getElementById('addCategoryBtn').textContent = 'Add';
  } else {
    state.categories.push({ id: 'cat_' + Date.now(), label: label, color: colorEl.value });
    saveCategories();
  }
  nameEl.value = '';
  colorEl.value = '#2563eb';
  renderCategoriesList();
  renderMonths();
  renderLegend();
}

function plannerInit() {
  document.getElementById('yearSelect').addEventListener('change', function () {
    state.year = parseInt(this.value, 10);
    savePrefs();
    renderMonthsDebounced();
  });

  document.getElementById('startMonthSelect').addEventListener('change', function () {
    state.startMonth = parseInt(this.value, 10);
    savePrefs();
    renderMonthsDebounced();
  });

  document.getElementById('viewStyleSelect').addEventListener('change', function () {
    state.viewStyle = parseInt(this.value, 10);
    savePrefs();
    if (plannerDomCache.monthsGrid) plannerDomCache.monthsGrid.className = 'months-grid grid gap-4 sm:gap-6 ' + getViewGridCols();
    renderMonthsDebounced();
  });

  document.getElementById('durationSelect').addEventListener('change', function () {
    state.durationMonths = Math.max(1, Math.min(24, parseInt(this.value, 10)));
    savePrefs();
    renderMonthsDebounced();
  });

  document.getElementById('hidePastMonthsBtn').addEventListener('click', function () {
    state.hidePastMonths = !state.hidePastMonths;
    savePrefs();
    renderMonthsDebounced();
  });
  document.getElementById('hideMonthsPastYearEndBtn').addEventListener('click', function () {
    state.hideMonthsPastYearEnd = !state.hideMonthsPastYearEnd;
    savePrefs();
    renderMonthsDebounced();
  });

  document.getElementById('calendarControlsToggle').addEventListener('click', function () {
    var panel = document.getElementById('calendarControlsExpandable');
    var arrow = document.getElementById('calendarControlsToggleArrow');
    var label = document.getElementById('calendarControlsToggleLabel');
    var isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !isHidden);
    this.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
    if (label) label.textContent = isHidden ? 'Fewer options' : 'More options';
  });

  document.getElementById('holidaysSelect').addEventListener('change', function () {
    var v = this.value;
    state.holidaySet = (v === 'canada' || v === 'usa') ? v : 'none';
    savePrefs();
    renderMonthsDebounced();
  });

  document.getElementById('weekStartSelect').addEventListener('change', function () {
    setWeekStart(parseInt(this.value, 10));
  });

  document.getElementById('addEventToSelectedBtn').addEventListener('click', function () {
    if (state.selectedDates.length === 0) return;
    openModal(null, null, state.selectedDates.slice());
  });

  document.getElementById('clearEventsFromSelectedBtn').addEventListener('click', openClearEventsModal);
  document.getElementById('clearSelectionBtn').addEventListener('click', function () {
    state.selectedDates = [];
    state.selectedMonths = [];
    state.multiSelect = false;
    renderMonths();
  });
  document.getElementById('clearEventsCancelBtn').addEventListener('click', closeClearEventsModal);
  document.getElementById('clearEventsBackdrop').addEventListener('click', closeClearEventsModal);
  document.getElementById('clearEventsRemoveBtn').addEventListener('click', confirmClearSelectedEvents);

  if (!plannerDomCache.monthsGrid) plannerDomCache.monthsGrid = document.getElementById('monthsGrid');
  var monthsGridEl = plannerDomCache.monthsGrid;
  if (monthsGridEl) {
    monthsGridEl.addEventListener('click', delegateClick);
    monthsGridEl.addEventListener('dragstart', function (e) {
      var el = e.target.closest('.event-dot, .event-chip');
      var dk, eventIndex;
      if (el) {
        dk = el.getAttribute('data-date');
        eventIndex = el.getAttribute('data-event-index');
      } else {
        var cell = e.target.closest('.day-cell[data-date][data-single-event-index]');
        if (cell) {
          dk = cell.getAttribute('data-date');
          eventIndex = cell.getAttribute('data-single-event-index');
        }
      }
      if (dk == null || eventIndex == null) return;
      e.dataTransfer.setData('application/json', JSON.stringify({ dateKey: dk, eventIndex: parseInt(eventIndex, 10) }));
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dk + ',' + eventIndex);
    });
    monthsGridEl.addEventListener('dragover', function (e) {
      var cell = e.target.closest('.day-cell[data-date]');
      if (!cell || cell.classList.contains('empty')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    monthsGridEl.addEventListener('drop', function (e) {
      e.preventDefault();
      var toCell = e.target.closest('.day-cell[data-date]');
      if (!toCell || toCell.classList.contains('empty')) return;
      var toDateKey = toCell.getAttribute('data-date');
      var raw = e.dataTransfer.getData('application/json');
      if (!raw) raw = e.dataTransfer.getData('text/plain');
      var fromDateKey, eventIndex;
      if (raw) {
        try {
          var parsed = JSON.parse(raw);
          fromDateKey = parsed.dateKey;
          eventIndex = parseInt(parsed.eventIndex, 10);
        } catch (err) {
          var parts = (raw + '').split(',');
          if (parts.length >= 2) {
            fromDateKey = parts[0].trim();
            eventIndex = parseInt(parts[1], 10);
          }
        }
      }
      if (fromDateKey && !isNaN(eventIndex) && moveEvent(fromDateKey, eventIndex, toDateKey)) {
        renderMonths();
        if (state.viewMode === 'audit') renderWaypostCommandLog();
      }
    });
  }
  document.getElementById('eventForm').addEventListener('submit', handleSubmit);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalDelete').addEventListener('click', handleDelete);
  document.getElementById('modalBackdrop').addEventListener('click', closeModal);
  var addRangeBtn = document.getElementById('eventModalAddRange');
  if (addRangeBtn) addRangeBtn.addEventListener('click', addEventModalRangeRow);
  document.getElementById('eventModal').addEventListener('click', function (e) {
    if (e.target.classList.contains('event-range-remove')) {
      var row = e.target.closest('.event-range-row');
      if (row && document.querySelectorAll('#eventModalRangesContainer .event-range-row').length > 1) {
        row.remove();
        updateEventRangeRemoveVisibility();
      }
    }
  });
  document.getElementById('eventModal').addEventListener('change', function (e) {
    if (e.target && e.target.getAttribute('name') === 'eventType') {
      var err = document.getElementById('eventModalPlannedByError');
      if (err) { err.classList.add('hidden'); err.textContent = ''; }
    }
  });
  document.getElementById('toggleNewCategoryBtn').addEventListener('click', toggleNewCategorySection);
  document.getElementById('addCategoryInModalBtn').addEventListener('click', addCategoryFromModal);
  document.getElementById('newCategoryInModalName').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); addCategoryFromModal(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!document.getElementById('settingsModal').classList.contains('hidden')) {
        closeSettingsModal();
      } else if (!document.getElementById('categoriesModal').classList.contains('hidden')) {
        closeCategoriesModal();
      } else if (!document.getElementById('clearEventsModal').classList.contains('hidden')) {
        closeClearEventsModal();
      } else if (!document.getElementById('dateContextPopover').classList.contains('hidden')) {
        closeDateContextPopover();
      } else {
        var waypostModal = document.getElementById('waypostDeleteConfirmModal');
        if (waypostModal && !waypostModal.classList.contains('hidden') && typeof closeWaypostDeleteConfirmModal === 'function') {
          closeWaypostDeleteConfirmModal();
        } else {
          closeModal();
        }
      }
    }
  });

  document.getElementById('dateContextBackdrop').addEventListener('click', closeDateContextPopover);
  document.getElementById('dateContextEvents').addEventListener('click', function (e) {
    var li = e.target.closest('li[data-date-key]');
    if (!li) return;
    closeDateContextPopover();
    openModal(li.getAttribute('data-date-key'), parseInt(li.getAttribute('data-event-index'), 10), null);
  });
  document.getElementById('dateContextAddBtn').addEventListener('click', function () {
    if (typeof window.popoverDateKey !== 'undefined' && window.popoverDateKey != null) {
      closeDateContextPopover();
      openModal(window.popoverDateKey, null, null);
    }
  });
  var dateContextMultiSelectBtn = document.getElementById('dateContextMultiSelectBtn');
  if (dateContextMultiSelectBtn) {
    dateContextMultiSelectBtn.addEventListener('click', function () {
      if (typeof window.popoverDateKey !== 'undefined' && window.popoverDateKey != null) {
        state.multiSelect = true;
        if (state.selectedDates.indexOf(window.popoverDateKey) === -1) state.selectedDates.push(window.popoverDateKey);
        closeDateContextPopover();
        renderMonths();
      }
    });
  }

  var printLegendBtn = document.getElementById('printLegendBtn');
  if (printLegendBtn) printLegendBtn.addEventListener('click', printLegendOnly);

  document.getElementById('manageCategoriesBtn').addEventListener('click', openCategoriesModal);
  document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
  document.getElementById('settingsModalClose').addEventListener('click', closeSettingsModal);
  document.getElementById('settingsBackdrop').addEventListener('click', closeSettingsModal);
  document.getElementById('settingsOptionReset').addEventListener('click', showSettingsResetPanel);
  document.getElementById('settingsResetBack').addEventListener('click', showSettingsMenu);
  document.getElementById('settingsResetCancel').addEventListener('click', showSettingsMenu);
  document.getElementById('settingsResetBtn').addEventListener('click', resetToDefaults);

  document.getElementById('legendList').addEventListener('change', function (e) {
    if (e.target.classList.contains('legend-event-cb')) {
      var title = e.target.getAttribute('data-title');
      var cat = e.target.getAttribute('data-category') || '';
      if (e.target.checked) {
        state.selectedLegendEvents.push({ title: title, category: cat });
      } else {
        state.selectedLegendEvents = state.selectedLegendEvents.filter(function (x) { return x.title !== title || (x.category || '') !== cat; });
      }
      renderLegend();
    }
  });
  document.getElementById('legendList').addEventListener('click', function (e) {
    if (e.target.classList.contains('legend-change-category-btn')) {
      var sel = document.getElementById('legendChangeCategorySelect');
      if (sel && state.selectedLegendEvents.length > 0) {
        applyLegendEventCategoryChange(sel.value);
      }
    }
  });

  document.getElementById('selectedDateContext').addEventListener('click', function (e) {
    var row = e.target.closest('.selected-date-event-row');
    if (row) {
      var dk = row.getAttribute('data-date-key');
      var eventIndex = row.getAttribute('data-event-index');
      if (dk != null && eventIndex != null) openModal(dk, parseInt(eventIndex, 10), null);
    }
  });
  document.getElementById('categoriesModalClose').addEventListener('click', closeCategoriesModal);
  document.getElementById('categoriesBackdrop').addEventListener('click', closeCategoriesModal);
  document.getElementById('addCategoryBtn').addEventListener('click', addOrUpdateCategory);

  document.getElementById('categoriesModal').addEventListener('change', function (e) {
    if (e.target.classList.contains('category-color-input')) {
      var id = e.target.getAttribute('data-id');
      var cat = state.categories.find(function (c) { return c.id === id; });
      if (cat) { cat.color = e.target.value; saveCategories(); renderLegend(); }
    }
  });
  document.getElementById('categoriesModal').addEventListener('blur', function (e) {
    if (e.target.classList.contains('category-label-input')) {
      var id = e.target.getAttribute('data-id');
      var cat = state.categories.find(function (c) { return c.id === id; });
      var val = e.target.value.trim();
      if (cat && val) { cat.label = val; saveCategories(); renderLegend(); }
    }
  }, true);
  document.getElementById('categoriesModal').addEventListener('click', function (e) {
    if (e.target.classList.contains('category-delete')) {
      var id = e.target.getAttribute('data-id');
      deleteCategory(id);
    }
    if (e.target.classList.contains('category-move-up') && !e.target.disabled) {
      var idUp = e.target.getAttribute('data-id');
      moveCategory(idUp, 'up');
    }
    if (e.target.classList.contains('category-move-down') && !e.target.disabled) {
      var idDn = e.target.getAttribute('data-id');
      moveCategory(idDn, 'down');
    }
  });
}

if (window.CalendarPlanner) {
  window.CalendarPlanner.renderMonths = renderMonths;
  window.CalendarPlanner.setWeekStart = setWeekStart;
  window.CalendarPlanner.plannerInit = plannerInit;
  window.CalendarPlanner.getDisplayedMonthKeys = getDisplayedMonthKeys;
}
