(function () {
  'use strict';

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  var DEFAULT_CATEGORIES = [
    { id: 'community', label: 'Community', color: '#673AB7' },
    { id: 'family', label: 'Family', color: '#E91E63' },
    { id: 'health', label: 'Health', color: '#34A853' },
    { id: 'spirit', label: 'Spirit', color: '#00ACC1' },
    { id: 'work', label: 'Work', color: '#EA4335' },
    { id: 'misogi', label: 'Misogi', color: '#FABB05' },
    { id: '8weekwin', label: 'Waypost', color: '#1A73E8' }
  ];
  var AUDIT_YEAR = new Date().getFullYear();
  var lifeBalanceChart = null;
  var popoverDateKey = null;
  var waypostLongestStretchHidden = false;
  var waypostDeletePending = null;

  const WaypostUtils = {
    DAYS_PER_YEAR: 365,
    dayOfYearFromDateKey: function (dateKey, year) {
      var parts = dateKey.split('-');
      if (parseInt(parts[0], 10) !== year) return -1;
      var d = new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      var start = new Date(year, 0, 0);
      return Math.floor((d - start) / (24 * 60 * 60 * 1000));
    },
    idealCadence: function (n) { return n > 0 ? Math.round(this.DAYS_PER_YEAR / n) : 0; },
    computeDeviations: function (wayposts) {
      var ideal = this.idealCadence(wayposts.length);
      var deviations = [];
      for (var j = 0; j < wayposts.length; j++) {
        var w = wayposts[j];
        var daysSinceLast = j === 0 ? w.dayOfYear - 1 : w.dayOfYear - wayposts[j - 1].dayOfYear;
        w.daysSinceLast = daysSinceLast;
        w.actualInterval = daysSinceLast;
        w.deviation = ideal > 0 ? daysSinceLast - ideal : 0;
        if (j > 0 || ideal > 0) deviations.push(w.deviation);
      }
      var avg = deviations.length > 0 ? Math.round(deviations.reduce(function (a, b) { return a + b; }, 0) / deviations.length) : 0;
      return { idealCadence: ideal, averageDeviation: avg };
    }
  };

  const STORAGE_KEY = 'calendar-planner-events';
  const PREFS_KEY = 'calendar-planner-prefs';
  const CATEGORIES_STORAGE_KEY = 'calendar-planner-categories';

  let state = {
    viewMode: 'planner',
    title: 'My Year',
    misogiTitle: '',
    misogiWho: '',
    misogiWhere: '',
    misogiDescription: '',
    misogiPreparation: [],
    misogiOutcome: null,
    misogiLessons: '',
    misogiPhoto: '',
    misogiImages: [],
    misogiQualified: false,
    offenceDefenceWeekendsOnly: false,
    offenceDefenceShowPct: true,
    waypostStatuses: {},
    year: new Date().getFullYear(),
    startMonth: 0,
    weekStart: 0,
    viewStyle: 4,
    durationMonths: 12,
    hidePastMonths: false,
    hideMonthsPastYearEnd: false,
    holidaySet: 'none',
    events: {},
    categories: [],
    selectedDateKey: null,
    selectedDates: [],
    selectedMonths: [],
    multiSelect: false,
    editingCategoryId: null,
    selectedLegendEvents: [],
  };

  function isMindsetCategoryId(id) { return id === 'misogi' || id === '8weekwin'; }
  function getCategories() {
    try {
      var raw = localStorage.getItem(CATEGORIES_STORAGE_KEY);
      var list = !raw ? [] : JSON.parse(raw);
      if (!Array.isArray(list) || list.length === 0) list = DEFAULT_CATEGORIES.slice();
      list = list.slice().sort(function (a, b) {
        var aMindset = isMindsetCategoryId(a.id);
        var bMindset = isMindsetCategoryId(b.id);
        if (aMindset !== bMindset) return aMindset ? 1 : -1;
        return (a.label || '').localeCompare(b.label || '');
      });
      list.forEach(function (c) {
        if (c.id === '8weekwin') c.label = 'Waypost';
        if (c.id === 'winningheat') c.label = 'Waypost';
      });
      return list;
    } catch {
      return DEFAULT_CATEGORIES.slice();
    }
  }

  function saveCategories() {
    state.categories = state.categories.slice();
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(state.categories));
  }

  function getCategory(id) {
    if (!id) return state.categories[0] || { id: '', label: 'Other', color: '#6b7280' };
    var c = state.categories.find(function (x) { return x.id === id; });
    return c || state.categories[0] || { id: id, label: id, color: '#6b7280' };
  }

  function getPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return {};
      var p = JSON.parse(raw);
      return { weekStart: p.weekStart, viewStyle: p.viewStyle, startMonth: p.startMonth, durationMonths: p.durationMonths, year: p.year, hidePastMonths: p.hidePastMonths, hideMonthsPastYearEnd: p.hideMonthsPastYearEnd, holidaySet: p.holidaySet, title: p.title, misogiTitle: p.misogiTitle, misogiWho: p.misogiWho, misogiWhere: p.misogiWhere, misogiDescription: p.misogiDescription, misogiPreparation: p.misogiPreparation, misogiOutcome: p.misogiOutcome, misogiLessons: p.misogiLessons, misogiPhoto: p.misogiPhoto, misogiImages: p.misogiImages, misogiQualified: p.misogiQualified, offenceDefenceWeekendsOnly: p.offenceDefenceWeekendsOnly, offenceDefenceShowPct: p.offenceDefenceShowPct, waypostStatuses: p.waypostStatuses };
    } catch {
      return {};
    }
  }

  function savePrefs() {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ weekStart: state.weekStart, viewStyle: state.viewStyle, startMonth: state.startMonth, durationMonths: state.durationMonths, year: state.year, hidePastMonths: state.hidePastMonths, hideMonthsPastYearEnd: state.hideMonthsPastYearEnd, holidaySet: state.holidaySet, title: state.title, misogiTitle: state.misogiTitle, misogiWho: state.misogiWho, misogiWhere: state.misogiWhere, misogiDescription: state.misogiDescription, misogiPreparation: state.misogiPreparation, misogiOutcome: state.misogiOutcome, misogiLessons: state.misogiLessons, misogiPhoto: state.misogiPhoto, misogiImages: state.misogiImages, misogiQualified: state.misogiQualified, offenceDefenceWeekendsOnly: state.offenceDefenceWeekendsOnly, offenceDefenceShowPct: state.offenceDefenceShowPct, waypostStatuses: state.waypostStatuses }));
  }

  function getEvents() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveEvents(events) {
    state.events = events;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }

  function dateKey(year, month, day) {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return year + '-' + m + '-' + d;
  }

  function isToday(year, month, day) {
    const t = new Date();
    return t.getFullYear() === year && t.getMonth() === month && t.getDate() === day;
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function firstDayOfMonth(year, month) {
    return new Date(year, month, 1).getDay();
  }

  function buildMonthData(year, month) {
    const days = daysInMonth(year, month);
    const first = firstDayOfMonth(year, month);
    const cells = [];
    var emptyCount = state.weekStart === 1 ? (first + 6) % 7 : first;
    for (var i = 0; i < emptyCount; i++) cells.push({ empty: true });
    for (let d = 1; d <= days; d++) {
      cells.push({
        day: d,
        dateKey: dateKey(year, month, d),
        today: isToday(year, month, d),
        empty: false,
      });
    }
    return cells;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
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
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    return d <= daysInMonth ? d : null;
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
      for (var dateKey in state.events) {
        var list = state.events[dateKey] || [];
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
      var hasEventOnAnySelected = state.selectedDates.some(function (dateKey) {
        return (state.events[dateKey] || []).length > 0;
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

  function nextDayDateKey(dateKey) {
    var parts = dateKey.split('-');
    if (parts.length !== 3) return dateKey;
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

  function shortDateLabel(dateKey) {
    var parts = dateKey.split('-');
    if (parts.length !== 3) return dateKey;
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
    const grid = document.getElementById('monthsGrid');
    const year = state.year;
    const weekdays = getWeekdays();
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

  function openModal(dateKey, existingEventIndex, dateKeysMulti) {
    var isMulti = dateKeysMulti && dateKeysMulti.length > 0;
    state.selectedDateKey = isMulti ? null : dateKey;
    document.getElementById('eventDateKey').value = isMulti ? dateKeysMulti.join(',') : dateKey;
    document.getElementById('eventIndex').value = !isMulti && existingEventIndex != null ? String(existingEventIndex) : '';
    var eventIdEl = document.getElementById('eventId');
    if (eventIdEl) {
      var existingEventId = '';
      if (!isMulti && existingEventIndex != null && dateKey) {
        var eventsOnDayForId = state.events[dateKey] || [];
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

    var eventsOnDay = isMulti ? [] : (state.events[dateKey] || []);
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

    if (existing && !isMulti && dateKey) {
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
        renderEventModalRanges([{ start: dateKey, end: dateKey }]);
      }
    } else {
      document.getElementById('modalDelete').classList.add('hidden');
      if (isMulti && dateKeysMulti && dateKeysMulti.length > 0) {
        var sorted = dateKeysMulti.slice().sort();
        var ranges = groupIntoContiguousRanges(sorted);
        renderEventModalRanges(ranges);
      } else if (dateKey) {
        renderEventModalRanges([{ start: dateKey, end: dateKey }]);
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
      if (getMisogiDateForYear(year)) {
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
      dateKeys.forEach(function (dateKey) {
        var list = state.events[dateKey] ? state.events[dateKey].slice() : [];
        list.push({ title: title, category: category, eventId: existingEventId, eventType: eventType });
        state.events[dateKey] = list;
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
      dateKeys.forEach(function (dateKey) {
        var targetList = state.events[dateKey] ? state.events[dateKey].slice() : [];
        targetList.push({ title: title, category: category, eventId: eventIdToUse, eventType: eventType });
        state.events[dateKey] = targetList;
      });
    } else {
      var newEventId = 'ev_' + Date.now();
      dateKeys.forEach(function (dateKey) {
        var list = state.events[dateKey] ? state.events[dateKey].slice() : [];
        list.push({ title: title, category: category, eventId: newEventId, eventType: eventType });
        state.events[dateKey] = list;
      });
    }
    if (category === 'misogi' && title) {
      state.misogiTitle = title.trim();
      savePrefs();
    }
    saveEvents(state.events);
    state.selectedDates = [];
    renderMonths();
    if (state.viewMode === 'audit') renderAuditDashboard();
    closeModal();
  }

  function handleDelete() {
    var dateKeys = getDateKeysFromInput();
    if (dateKeys.length === 0) return;
    var dateKey = dateKeys[0];
    var idxEl = document.getElementById('eventIndex');
    var idx = idxEl && idxEl.value !== '' ? parseInt(idxEl.value, 10) : -1;
    var eventIdEl = document.getElementById('eventId');
    var eventId = eventIdEl && eventIdEl.value ? eventIdEl.value.trim() : '';
    var list = state.events[dateKey];
    if (list && idx >= 0 && idx < list.length) {
      var ev = list[idx];
      var idToRemove = (ev && ev.eventId) || eventId;
      if (idToRemove) {
        for (var dk in state.events) {
          var arr = state.events[dk].filter(function (e) { return e.eventId !== idToRemove; });
          if (arr.length === 0) delete state.events[dk];
          else state.events[dk] = arr;
        }
      } else {
        list.splice(idx, 1);
        if (list.length === 0) delete state.events[dateKey];
        else state.events[dateKey] = list;
      }
    }
    saveEvents(state.events);
    state.selectedDates = [];
    renderMonths();
    if (state.viewMode === 'audit') renderAuditDashboard();
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

  function formatDateLabel(dateKey) {
    var parts = dateKey.split('-');
    if (parts.length !== 3) return dateKey;
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var m = parseInt(parts[1], 10) - 1;
    return (m >= 0 && m < 12 ? months[m] : parts[1]) + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];
  }

  function showDateContextPopover(dateKey, anchorEl) {
    popoverDateKey = dateKey;
    var popover = document.getElementById('dateContextPopover');
    var backdrop = document.getElementById('dateContextBackdrop');
    var titleEl = document.getElementById('dateContextTitle');
    var listEl = document.getElementById('dateContextEvents');
    var addBtn = document.getElementById('dateContextAddBtn');
    if (!popover || !titleEl || !listEl || !addBtn) return;

    titleEl.textContent = formatDateLabel(dateKey);
    var dayEvents = state.events[dateKey] || [];
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
        li.setAttribute('data-date-key', dateKey);
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
    state.selectedDates.forEach(function (dateKey) {
      var list = state.events[dateKey] || [];
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

    state.selectedDates.forEach(function (dateKey) {
      var list = state.events[dateKey];
      if (!list) return;
      var filtered = list.filter(function (ev) {
        return !toRemove.some(function (r) {
          if (r.eventId && ev.eventId) return r.eventId === ev.eventId;
          return r.title === ev.title && (r.category || '') === (ev.category || '');
        });
      });
      if (filtered.length === 0) delete state.events[dateKey];
      else state.events[dateKey] = filtered;
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
      var dateKey = eventEl.getAttribute('data-date');
      var eventIndex = eventEl.getAttribute('data-event-index');
      if (dateKey != null && eventIndex != null) {
        e.preventDefault();
        e.stopPropagation();
        openModal(dateKey, parseInt(eventIndex, 10), null);
        return;
      }
    }
    var cell = e.target.closest('.day-cell[data-date]');
    if (!cell || cell.classList.contains('empty')) return;
    state.selectedMonths = [];
    var dateKey = cell.getAttribute('data-date');
    if (state.multiSelect) {
      var idx = state.selectedDates.indexOf(dateKey);
      if (idx === -1) state.selectedDates.push(dateKey);
      else state.selectedDates.splice(idx, 1);
      renderMonths();
      return;
    }
    state.multiSelect = true;
    if (state.selectedDates.indexOf(dateKey) === -1) state.selectedDates.push(dateKey);
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
    for (var dateKey in state.events) {
      if (dateKey.length < 7 || !displayedMonths[dateKey.slice(0, 7)]) continue;
      var dayEvents = state.events[dateKey] || [];
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
    state.misogiPreparation = [];
    state.misogiOutcome = null;
    state.misogiLessons = '';
    state.misogiPhoto = '';
    state.misogiImages = [];
    state.misogiQualified = false;
    state.waypostStatuses = {};
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
    for (var dateKey in state.events) {
      var list = state.events[dateKey] || [];
      state.events[dateKey] = list.map(function (ev) {
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

  function switchView(mode) {
    state.viewMode = mode;
    var planner = document.getElementById('plannerContent');
    var audit = document.getElementById('auditContent');
    var wrapper = document.getElementById('viewSwitchWrapper');
    var btnPlanner = document.getElementById('viewTogglePlanner');
    var btnAudit = document.getElementById('viewToggleAudit');
    if (mode === 'planner') {
      planner.classList.remove('view-block-planner-off');
      audit.classList.remove('view-block-audit-visible');
      if (btnPlanner) btnPlanner.setAttribute('aria-pressed', 'true');
      if (btnAudit) btnAudit.setAttribute('aria-pressed', 'false');
    } else {
      planner.classList.add('view-block-planner-off');
      audit.classList.add('view-block-audit-visible');
      if (btnPlanner) btnPlanner.setAttribute('aria-pressed', 'false');
      if (btnAudit) btnAudit.setAttribute('aria-pressed', 'true');
      renderAuditDashboard();
    }
  }

  function getMisogiDateForYear(year) {
    var y = String(year);
    for (var dateKey in state.events) {
      if (dateKey.indexOf(y) !== 0) continue;
      var list = state.events[dateKey] || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].category === 'misogi') return dateKey;
      }
    }
    return null;
  }

  function getMisogiEventForYear(year) {
    var y = String(year);
    for (var dateKey in state.events) {
      if (dateKey.indexOf(y) !== 0) continue;
      var list = state.events[dateKey] || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].category === 'misogi') return { dateKey: dateKey, eventIndex: i, event: list[i] };
      }
    }
    return null;
  }

  function setMisogiEventTitleForYear(year, title) {
    var info = getMisogiEventForYear(year);
    if (!info) return;
    var list = state.events[info.dateKey].slice();
    var prev = list[info.eventIndex];
    list[info.eventIndex] = { title: title.trim() || prev.title, category: 'misogi', eventId: prev.eventId };
    state.events[info.dateKey] = list;
    saveEvents(state.events);
  }

  function isWaypostCategory(cid) {
    return cid === 'winningheat' || cid === '8weekwin';
  }

  function getCategoryDistribution() {
    var counts = {};
    state.categories.forEach(function (cat) { counts[cat.id] = 0; });
    for (var dk in state.events) {
      if (dk.indexOf(String(AUDIT_YEAR)) !== 0) continue;
      var list = state.events[dk] || [];
      list.forEach(function (ev) {
        var c = ev.category || '';
        if (counts[c] !== undefined) counts[c]++;
        else counts[c] = (counts[c] || 0) + 1;
      });
    }
    return counts;
  }

  function getDeadSpaceMonths() {
    var out = [];
    for (var m = 0; m < 12; m++) {
      var hasPersonal = false, hasWinning = false;
      var days = daysInMonth(AUDIT_YEAR, m);
      for (var d = 1; d <= days; d++) {
        var dk = dateKey(AUDIT_YEAR, m, d);
        var list = state.events[dk] || [];
        list.forEach(function (ev) {
          if (ev.category === 'family' || ev.category === 'personal') hasPersonal = true;
          if (isWaypostCategory(ev.category)) hasWinning = true;
        });
      }
      if (!hasPersonal && !hasWinning) out.push(MONTH_NAMES[m]);
    }
    return out;
  }

  function getOffenceDefenceMonthData(year, weekendsOnly) {
    var out = [];
    for (var m = 0; m < 12; m++) {
      var total = 0;
      var whitespace = 0;
      var defence = 0;
      var offence = 0;
      var days = daysInMonth(year, m);
      for (var d = 1; d <= days; d++) {
        var dt = new Date(year, m, d);
        var dayOfWeek = dt.getDay();
        if (weekendsOnly && dayOfWeek !== 0 && dayOfWeek !== 6) continue;
        total++;
        var dk = dateKey(year, m, d);
        var list = state.events[dk] || [];
        var hasOffensive = list.some(function (ev) { return ev.eventType === 'offensive'; });
        var hasAny = list.length > 0;
        if (!hasAny) whitespace++;
        else if (hasOffensive) offence++;
        else defence++;
      }
      out.push({ year: year, month: m, total: total, whitespace: whitespace, defence: defence, offence: offence });
    }
    return out;
  }

  function renderOffenceDefenceStrip() {
    var stripEl = document.getElementById('offenceDefenceMonthStrip');
    var weekendsOnlyEl = document.getElementById('offenceDefenceWeekendsOnly');
    if (!stripEl) return;
    var weekendsOnly = weekendsOnlyEl ? weekendsOnlyEl.checked : state.offenceDefenceWeekendsOnly;
    state.offenceDefenceWeekendsOnly = weekendsOnly;
    var showPctEl = document.getElementById('offenceDefenceShowPct');
    var showPct = showPctEl ? showPctEl.checked : state.offenceDefenceShowPct;
    state.offenceDefenceShowPct = showPct;
    var year = AUDIT_YEAR;
    var data = getOffenceDefenceMonthData(year, weekendsOnly);
    var barHeight = 56;
    var yearTotal = 0, yearWhitespace = 0, yearDefence = 0, yearOffence = 0;
    data.forEach(function (item) {
      yearTotal += item.total;
      yearWhitespace += item.whitespace;
      yearDefence += item.defence;
      yearOffence += item.offence;
    });
    var yearWPct = yearTotal > 0 ? (yearWhitespace / yearTotal) * 100 : 100;
    var yearDPct = yearTotal > 0 ? (yearDefence / yearTotal) * 100 : 0;
    var yearOPct = yearTotal > 0 ? (yearOffence / yearTotal) * 100 : 0;
    function pctStr(p) { return p == null || isNaN(p) ? '—' : Math.round(p) + '%'; }
    var monthBars = data.map(function (item) {
      var total = item.total;
      var w = item.whitespace, d = item.defence, o = item.offence;
      var wPct = total > 0 ? (w / total) * 100 : 100;
      var dPct = total > 0 ? (d / total) * 100 : 0;
      var oPct = total > 0 ? (o / total) * 100 : 0;
      var shortLabel = (MONTH_NAMES[item.month] || '').substring(0, 3).toUpperCase();
      var labels = showPct && total > 0
        ? '<span class="text-[10px] text-ink-500">' + pctStr(wPct) + '</span><span class="text-[10px] text-green-600">' + pctStr(dPct) + '</span><span class="text-[10px] text-blue-600">' + pctStr(oPct) + '</span>'
        : showPct ? '<span class="text-[10px] text-ink-500">—</span>' : '';
      return '<div class="flex-1 min-w-[2rem] flex flex-col items-center gap-0.5">' +
        (labels ? '<div class="flex flex-col items-center gap-px text-[10px] font-medium leading-tight">' + labels + '</div>' : '<div class="min-h-[2.5rem]"></div>') +
        '<div class="w-full max-w-[1.25rem] flex flex-col justify-end rounded overflow-hidden border border-ink-200" style="height:' + barHeight + 'px">' +
        '<div class="w-full bg-ink-100 flex-shrink-0" style="height:' + wPct + '%" title="' + w + ' no plans"></div>' +
        '<div class="w-full bg-green-400 flex-shrink-0" style="height:' + dPct + '%" title="' + d + ' defence"></div>' +
        '<div class="w-full bg-blue-500 flex-shrink-0" style="height:' + oPct + '%" title="' + o + ' offence"></div>' +
        '</div>' +
        '<span class="text-[10px] font-medium text-ink-500">' + escapeHtml(shortLabel) + '</span>' +
        '</div>';
    }).join('');
    var avgLabels = showPct && yearTotal > 0
      ? '<span class="text-[10px] text-ink-500">' + pctStr(yearWPct) + '</span><span class="text-[10px] text-green-600">' + pctStr(yearDPct) + '</span><span class="text-[10px] text-blue-600">' + pctStr(yearOPct) + '</span>'
      : showPct ? '<span class="text-[10px] text-ink-500">—</span>' : '';
    var avgBar = '<div class="flex-1 min-w-[2rem] flex flex-col items-center gap-0.5 pl-2 border-l border-ink-200">' +
      (avgLabels ? '<div class="flex flex-col items-center gap-px text-[10px] font-medium leading-tight">' + avgLabels + '</div>' : '<div class="min-h-[2.5rem]"></div>') +
      '<div class="w-full max-w-[1.25rem] flex flex-col justify-end rounded overflow-hidden border border-ink-200" style="height:' + barHeight + 'px">' +
      '<div class="w-full bg-ink-100 flex-shrink-0" style="height:' + yearWPct + '%"></div>' +
      '<div class="w-full bg-green-400 flex-shrink-0" style="height:' + yearDPct + '%"></div>' +
      '<div class="w-full bg-blue-500 flex-shrink-0" style="height:' + yearOPct + '%"></div>' +
      '</div>' +
      '<span class="text-[10px] font-semibold text-ink-600">Avg</span>' +
      '</div>';
    stripEl.innerHTML = monthBars + avgBar;
  }

  function commitMisogi() {
    var input = document.getElementById('misogiChallengeInput');
    var dateInput = document.getElementById('misogiTargetDate');
    if (!input || !dateInput) return;
    var title = input.value.trim();
    var dateKey = dateInput.value.trim();
    if (!title || !dateKey) return;
    var year = typeof state !== 'undefined' && state.year != null ? state.year : new Date().getFullYear();
    AUDIT_YEAR = year;
    var y = String(year);
    for (var dk in state.events) {
      if (dk.indexOf(y) !== 0) continue;
      var list = state.events[dk].filter(function (ev) { return ev.category !== 'misogi'; });
      if (list.length === 0) delete state.events[dk];
      else state.events[dk] = list;
    }
    var list = (state.events[dateKey] || []).slice();
    list.push({ title: title, category: 'misogi', eventId: 'misogi_' + year, eventType: 'offensive' });
    state.events[dateKey] = list;
    state.misogiTitle = title;
    state.misogiQualified = true;
    saveEvents(state.events);
    savePrefs();
    renderAuditDashboard();
    renderMonths();
  }

  function resetMisogi() {
    state.misogiQualified = false;
    var y = String(AUDIT_YEAR);
    for (var dateKey in state.events) {
      if (dateKey.indexOf(y) !== 0) continue;
      var list = state.events[dateKey].filter(function (ev) { return ev.category !== 'misogi'; });
      if (list.length === 0) delete state.events[dateKey];
      else state.events[dateKey] = list;
    }
    saveEvents(state.events);
    savePrefs();
    renderAuditDashboard();
    renderMonths();
  }

  function renderMisogiImages() {
    var container = document.getElementById('misogiImagesPreview');
    var addBtn = document.getElementById('misogiImagesAddBtn');
    if (!container) return;
    var list = state.misogiImages || [];
    container.innerHTML = '';
    if (list.length === 0) {
      container.classList.remove('grid');
      container.classList.add('flex', 'items-center', 'justify-center', 'min-h-[4rem]');
      return;
    }
    container.classList.remove('flex', 'items-center', 'justify-center');
    container.classList.add('grid', 'gap-2', 'overflow-hidden', 'rounded-lg', 'border', 'border-ink-200', 'bg-ink-50/30');
    var cols = list.length === 1 ? 1 : list.length;
    container.style.gridTemplateColumns = cols === 1 ? '1fr' : 'repeat(' + cols + ', 1fr)';
    list.forEach(function (dataUrl, index) {
      var wrap = document.createElement('div');
      wrap.className = 'group relative overflow-hidden rounded bg-ink-100 aspect-video';
      var img = document.createElement('img');
      img.src = dataUrl;
      img.alt = 'Misogi image ' + (index + 1);
      img.className = 'w-full h-full object-cover';
      wrap.appendChild(img);
      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'absolute top-1 right-1 w-6 h-6 rounded-full bg-ink-800/80 text-white text-sm leading-none flex items-center justify-center hover:bg-ink-800 opacity-0 group-hover:opacity-100 transition-opacity';
      removeBtn.textContent = '×';
      removeBtn.dataset.index = String(index);
      removeBtn.setAttribute('aria-label', 'Remove image');
      wrap.appendChild(removeBtn);
      removeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var i = parseInt(this.dataset.index, 10);
        state.misogiImages = (state.misogiImages || []).slice();
        state.misogiImages.splice(i, 1);
        savePrefs();
        renderMisogiImages();
      });
      container.appendChild(wrap);
    });
    if (addBtn) {
      addBtn.disabled = list.length >= 3;
      addBtn.classList.toggle('hidden', list.length >= 3);
      addBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      if (list.length < 3) addBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      else addBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
  }

  function renderMisogiPreparationList() {
    var listEl = document.getElementById('auditMisogiPreparationList');
    if (!listEl) return;
    listEl.innerHTML = '';
    (state.misogiPreparation || []).forEach(function (item, index) {
      var li = document.createElement('li');
      li.className = 'flex items-center gap-2 group';
      li.dataset.index = String(index);
      li.dataset.id = item.id || '';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!item.completed;
      checkbox.className = 'rounded border-ink-300 text-accent-600 focus:ring-accent-500 preparation-cb shrink-0';
      checkbox.dataset.index = String(index);
      var span = document.createElement('span');
      span.contentEditable = 'true';
      span.className = 'flex-1 min-w-0 text-sm outline-none preparation-text ' + (item.completed ? 'line-through text-ink-400' : 'text-ink-700');
      span.textContent = item.text || '';
      span.dataset.index = String(index);
      var wrap = document.createElement('div');
      wrap.className = 'flex items-center gap-2 flex-1 min-w-0';
      wrap.appendChild(checkbox);
      wrap.appendChild(span);
      var moves = document.createElement('span');
      moves.className = 'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity';
      var upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'p-1.5 text-ink-400 hover:text-ink-600 text-base leading-none';
      upBtn.textContent = '↑';
      upBtn.dataset.index = String(index);
      upBtn.dataset.dir = 'up';
      var downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'p-1.5 text-ink-400 hover:text-ink-600 text-base leading-none';
      downBtn.textContent = '↓';
      downBtn.dataset.index = String(index);
      downBtn.dataset.dir = 'down';
      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'p-1.5 text-red-500 hover:text-red-700 text-base leading-none';
      delBtn.textContent = '×';
      delBtn.dataset.index = String(index);
      moves.appendChild(upBtn);
      moves.appendChild(downBtn);
      moves.appendChild(delBtn);
      li.appendChild(wrap);
      li.appendChild(moves);
      listEl.appendChild(li);
    });
  }

  function getCalendarDateRange() {
    var numMonths = Math.max(1, Math.min(24, state.durationMonths));
    var monthsToShow = [];
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
    var first = monthsToShow[0];
    var last = monthsToShow[monthsToShow.length - 1];
    var startDateKey = dateKey(first.year, first.month, 1);
    var lastDayNum = daysInMonth(last.year, last.month);
    var endDateKey = dateKey(last.year, last.month, lastDayNum);
    var daysInRange = 1 + Math.round((new Date(endDateKey) - new Date(startDateKey)) / 86400000);
    return { startDateKey: startDateKey, endDateKey: endDateKey, daysInRange: Math.max(1, daysInRange), monthsInRange: monthsToShow };
  }

  function addDaysToDateKey(dateKey, days) {
    var parts = dateKey.split('-');
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getWaypostCommandLogData(range) {
    var startDateKey = range.startDateKey;
    var endDateKey = range.endDateKey;
    var daysInRange = range.daysInRange;
    var byLogicalKey = {};
    for (var dateKey in state.events) {
      if (dateKey < startDateKey || dateKey > endDateKey) continue;
      var list = state.events[dateKey] || [];
      for (var i = 0; i < list.length; i++) {
        var ev = list[i];
        if ((ev.category || '') !== '8weekwin') continue;
        var title = (ev.title || 'Waypost').trim() || 'Waypost';
        var logicalKey = ev.eventId || (dateKey + '|' + title);
        if (!byLogicalKey[logicalKey]) {
          byLogicalKey[logicalKey] = { title: title, dateKeys: [], rowKey: ev.eventId || (dateKey + '|' + title), eventId: ev.eventId };
        }
        if (byLogicalKey[logicalKey].dateKeys.indexOf(dateKey) === -1) {
          byLogicalKey[logicalKey].dateKeys.push(dateKey);
        }
      }
    }
    var wayposts = [];
    for (var k in byLogicalKey) {
      var w = byLogicalKey[k];
      w.dateKeys = w.dateKeys.filter(function (dk) { return dk >= startDateKey && dk <= endDateKey; }).sort();
      if (w.dateKeys.length === 0) continue;
      w.dateKey = w.dateKeys[0];
      w.dayIndexInRange = 1 + Math.round((new Date(w.dateKey) - new Date(startDateKey)) / 86400000);
      w.status = (state.waypostStatuses || {})[w.rowKey] || 'pending';
      wayposts.push(w);
    }
    wayposts.sort(function (a, b) { return a.dayIndexInRange - b.dayIndexInRange; });
    var targetMaxStretch = 70;
    for (var i = 0; i < wayposts.length; i++) {
      var daysSinceLast = i === 0 ? wayposts[i].dayIndexInRange - 1 : wayposts[i].dayIndexInRange - wayposts[i - 1].dayIndexInRange;
      wayposts[i].daysSinceLast = daysSinceLast;
    }
    var averageStretch = wayposts.length > 0 ? Math.round(wayposts.reduce(function (s, w) { return s + w.daysSinceLast; }, 0) / wayposts.length) : 0;
    var averageNet = wayposts.length > 0 ? Math.round(averageStretch - targetMaxStretch) : 0;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var todayKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    wayposts.forEach(function (w) {
      var lastDate = w.dateKeys[w.dateKeys.length - 1];
      w.isPast = lastDate < todayKey;
      w.alertRow = w.isPast && w.status !== 'completed';
    });
    var completedCount = wayposts.filter(function (w) { return w.status === 'completed'; }).length;
    var longestStretch = 0;
    var longestStretchStartDateKey = '';
    var longestStretchEndDateKey = '';
    if (wayposts.length > 0) {
      var gap = wayposts[0].dayIndexInRange - 1;
      if (gap > longestStretch) {
        longestStretch = gap;
        longestStretchStartDateKey = startDateKey;
        longestStretchEndDateKey = gap > 0 ? addDaysToDateKey(startDateKey, gap - 1) : startDateKey;
      }
      for (var i = 1; i < wayposts.length; i++) {
        gap = wayposts[i].dayIndexInRange - wayposts[i - 1].dayIndexInRange - 1;
        if (gap > longestStretch) {
          longestStretch = gap;
          longestStretchStartDateKey = addDaysToDateKey(startDateKey, wayposts[i - 1].dayIndexInRange);
          longestStretchEndDateKey = addDaysToDateKey(startDateKey, wayposts[i].dayIndexInRange - 2);
        }
      }
      gap = daysInRange - wayposts[wayposts.length - 1].dayIndexInRange;
      if (gap > longestStretch) {
        longestStretch = gap;
        longestStretchStartDateKey = addDaysToDateKey(startDateKey, wayposts[wayposts.length - 1].dayIndexInRange);
        longestStretchEndDateKey = endDateKey;
      }
    }
    return { wayposts: wayposts, targetMaxStretch: targetMaxStretch, averageStretch: averageStretch, averageNet: averageNet, total: wayposts.length, completedCount: completedCount, longestStretch: longestStretch, longestStretchStartDateKey: longestStretchStartDateKey, longestStretchEndDateKey: longestStretchEndDateKey };
  }

  function formatWaypostDateRange(dateKeys) {
    if (!dateKeys || dateKeys.length === 0) return '';
    if (dateKeys.length === 1) return dateKeys[0];
    return dateKeys[0] + ' – ' + dateKeys[dateKeys.length - 1];
  }

  function waypostStatusIcon(status) {
    var s = status === 'overridden' ? 'cancelled' : status;
    var title = s === 'pending' ? 'Pending' : s === 'completed' ? 'Completed' : 'Cancelled';
    if (s === 'pending') {
      return '<svg class="w-5 h-5 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" title="' + title + '"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
    }
    if (s === 'completed') {
      return '<svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" title="' + title + '"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
    }
    return '<svg class="w-5 h-5 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" title="' + title + '"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
  }

  function buildWaypostCommandLogRow(w) {
    var li = document.createElement('li');
    li.className = 'flex flex-wrap items-center gap-2 px-3 py-2 text-sm ' + (w.alertRow ? 'bg-red-50 border-l-2 border-red-300' : '');
    var statusVal = w.status === 'overridden' ? 'cancelled' : w.status;
    var wrap = document.createElement('div');
    wrap.className = 'waypost-status-wrap relative flex-shrink-0 w-8 h-8 flex items-center justify-center rounded border border-ink-200 bg-ink-50/50';
    wrap.innerHTML = waypostStatusIcon(w.status);
    var statusSelect = document.createElement('select');
    statusSelect.className = 'absolute inset-0 w-full h-full opacity-0 cursor-pointer';
    statusSelect.dataset.rowKey = w.rowKey;
    statusSelect.setAttribute('aria-label', 'Waypost status');
    statusSelect.innerHTML = '<option value="pending"' + (statusVal === 'pending' ? ' selected' : '') + '>Pending</option><option value="completed"' + (statusVal === 'completed' ? ' selected' : '') + '>Completed</option><option value="cancelled"' + (statusVal === 'cancelled' ? ' selected' : '') + '>Cancelled</option><option value="delete">Delete</option>';
    wrap.appendChild(statusSelect);
    var titleCell = document.createElement('span');
    titleCell.className = 'font-medium text-ink-800 min-w-0 flex-1 truncate';
    titleCell.textContent = w.title;
    var datesSpan = document.createElement('span');
    datesSpan.className = 'text-ink-500 text-sm shrink-0';
    datesSpan.textContent = formatWaypostDateRange(w.dateKeys);
    var sep = document.createElement('span');
    sep.className = 'text-ink-300 shrink-0 mx-1';
    sep.textContent = '|';
    var rightGroup = document.createElement('div');
    rightGroup.className = 'flex items-center justify-end shrink-0 gap-1';
    rightGroup.appendChild(datesSpan);
    rightGroup.appendChild(sep);
    rightGroup.appendChild(wrap);
    li.appendChild(titleCell);
    li.appendChild(rightGroup);
    return li;
  }

  function renderWaypostCommandLog() {
    var completionEl = document.getElementById('waypostCompletion');
    var longestStretchEl = document.getElementById('waypostLongestStretch');
    var targetMaxStretchEl = document.getElementById('waypostTargetMaxStretch');
    var netEl = document.getElementById('waypostNet');
    var listEl = document.getElementById('waypostCommandLogList');
    if (!listEl) return;
    var range = getCalendarDateRange();
    var data = getWaypostCommandLogData(range);
    if (completionEl) completionEl.textContent = data.completedCount + '/' + data.total;
    if (targetMaxStretchEl) targetMaxStretchEl.textContent = data.targetMaxStretch;
    if (longestStretchEl) {
      longestStretchEl.textContent = data.total > 0 ? data.longestStretch + ' days' : '—';
      longestStretchEl.className = 'font-semibold ' + (data.total === 0 ? 'text-ink-800' : (data.longestStretch <= data.targetMaxStretch ? 'text-emerald-600' : 'text-red-600'));
    }
    var averageStretchEl = document.getElementById('waypostAverageStretch');
    if (averageStretchEl) {
      averageStretchEl.textContent = data.total > 0 ? data.averageStretch + ' days' : '—';
      averageStretchEl.className = 'font-semibold ' + (data.total === 0 ? 'text-ink-800' : (data.averageStretch <= data.targetMaxStretch ? 'text-emerald-600' : 'text-red-600'));
    }
    var longestWindowEl = document.getElementById('waypostLongestStretchWindow');
    var longestWindowDatesEl = document.getElementById('waypostLongestStretchWindowDates');
    if (longestWindowEl && longestWindowDatesEl) {
      var longestStretchShowEl = document.getElementById('waypostLongestStretchShow');
      if (data.total > 0 && data.longestStretch > data.targetMaxStretch && data.longestStretchStartDateKey && data.longestStretchEndDateKey) {
        longestWindowDatesEl.textContent = data.longestStretchStartDateKey === data.longestStretchEndDateKey ? data.longestStretchStartDateKey : data.longestStretchStartDateKey + ' – ' + data.longestStretchEndDateKey;
        if (waypostLongestStretchHidden) {
          longestWindowEl.classList.add('hidden');
          if (longestStretchShowEl) longestStretchShowEl.classList.remove('hidden');
        } else {
          longestWindowEl.classList.remove('hidden');
          if (longestStretchShowEl) longestStretchShowEl.classList.add('hidden');
        }
      } else {
        longestWindowEl.classList.add('hidden');
        if (longestStretchShowEl) longestStretchShowEl.classList.add('hidden');
      }
    }
    if (netEl) {
      if (data.total === 0) {
        netEl.textContent = '—';
        netEl.className = 'font-semibold text-ink-800';
      } else {
        netEl.textContent = (data.averageNet >= 0 ? '+' : '') + data.averageNet + ' days';
        netEl.className = 'font-semibold ' + (data.averageNet <= 0 ? 'text-emerald-600' : 'text-red-600');
      }
    }
    listEl.innerHTML = '';
    var stripEl = document.getElementById('waypostMonthStrip');
    var cancelledSection = document.getElementById('waypostCancelledSection');
    var cancelledList = document.getElementById('waypostCancelledList');
    var cancelledExpandable = document.getElementById('waypostCancelledExpandable');
    var cancelledToggle = document.getElementById('waypostCancelledToggle');
    var cancelledLabel = document.getElementById('waypostCancelledToggleLabel');
    var cancelledArrow = document.getElementById('waypostCancelledToggleArrow');

    if (data.wayposts.length === 0) {
      var empty = document.createElement('li');
      empty.className = 'px-3 py-2 text-sm text-ink-500';
      empty.textContent = 'No Wayposts in the visible date range.';
      listEl.appendChild(empty);
      if (cancelledSection) cancelledSection.classList.add('hidden');
      if (stripEl) stripEl.innerHTML = '';
      return;
    }

    var active = data.wayposts.filter(function (w) { return w.status !== 'cancelled'; });
    var cancelled = data.wayposts.filter(function (w) { return w.status === 'cancelled'; });

    if (active.length === 0) {
      var emptyActive = document.createElement('li');
      emptyActive.className = 'px-3 py-2 text-sm text-ink-500';
      emptyActive.textContent = 'No active Wayposts in the visible date range.';
      listEl.appendChild(emptyActive);
    } else {
      active.forEach(function (w) { listEl.appendChild(buildWaypostCommandLogRow(w)); });
    }

    if (cancelled.length > 0 && cancelledSection && cancelledList && cancelledToggle && cancelledLabel && cancelledArrow) {
      cancelledSection.classList.remove('hidden');
      cancelledLabel.textContent = 'Cancelled (' + cancelled.length + ')';
      cancelledExpandable.classList.add('hidden');
      cancelledToggle.setAttribute('aria-expanded', 'false');
      cancelledArrow.textContent = '▼';
      cancelledList.innerHTML = '';
      cancelled.forEach(function (w) { cancelledList.appendChild(buildWaypostCommandLogRow(w)); });
    } else if (cancelledSection) {
      cancelledSection.classList.add('hidden');
    }

    if (stripEl && range.monthsInRange && range.monthsInRange.length > 0) {
      var countByMonth = {};
      data.wayposts.forEach(function (w) {
        var dateKeys = w.dateKeys || [];
        if (dateKeys.length === 0) return;
        var firstDateKey = dateKeys[0];
        var parts = firstDateKey.split('-');
        if (parts.length !== 3) return;
        var y = parseInt(parts[0], 10);
        var m = parseInt(parts[1], 10) - 1;
        var key = y + '-' + m;
        countByMonth[key] = (countByMonth[key] || 0) + 1;
      });
      var waypostCat = getCategory('8weekwin');
      var dotColor = waypostCat ? waypostCat.color : '#1A73E8';
      stripEl.innerHTML = '<div class="flex flex-wrap items-start gap-x-2 gap-y-2 w-full">' +
        range.monthsInRange.map(function (item) {
          var key = item.year + '-' + item.month;
          var count = countByMonth[key] || 0;
          var shortLabel = (MONTH_NAMES[item.month] || '').substring(0, 3).toUpperCase();
          var dotsHtml = count > 0
            ? '<div class="event-dots-wrapper flex gap-0.5 flex-shrink-0 flex-wrap justify-center">' +
              Array(count).fill(0).map(function () {
                return '<span class="event-dot" style="background-color:' + dotColor + '" aria-hidden="true"></span>';
              }).join('') + '</div>'
            : '';
          return '<div class="flex-1 min-w-[2.5rem] flex flex-col items-center gap-0.5">' +
            '<span class="text-[10px] sm:text-xs font-medium text-ink-500">' + escapeHtml(shortLabel) + '</span>' +
            (dotsHtml ? '<div class="flex justify-center">' + dotsHtml + '</div>' : '') +
            '</div>';
        }).join('') +
        '</div>';
    } else if (stripEl) {
      stripEl.innerHTML = '';
    }
  }

  function renderAuditDashboard() {
    AUDIT_YEAR = state.year;
    var misogiInfo = getMisogiEventForYear(AUDIT_YEAR);
    var misogiDateKey = misogiInfo ? misogiInfo.dateKey : null;
    var countdownBigEl = document.getElementById('misogiCountdownBig');
    var challengeInput = document.getElementById('misogiChallengeInput');
    var targetDateInput = document.getElementById('misogiTargetDate');

    if (challengeInput) {
      if (misogiInfo && misogiInfo.event && misogiInfo.event.title) challengeInput.value = misogiInfo.event.title;
      else if (state.misogiTitle) challengeInput.value = state.misogiTitle;
    }
    if (targetDateInput) {
      if (misogiDateKey) targetDateInput.value = misogiDateKey;
      else if (!targetDateInput.value) targetDateInput.value = state.year + '-12-31';
    }
    var descInput = document.getElementById('auditMisogiDescription');
    if (descInput) descInput.value = state.misogiDescription || '';
    var diff = 0;
    if (misogiDateKey) {
      var parts = misogiDateKey.split('-');
      var misogiDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      misogiDate.setHours(0, 0, 0, 0);
      diff = Math.ceil((misogiDate - today) / (1000 * 60 * 60 * 24));
    }
    if (countdownBigEl) {
      if (misogiDateKey) {
        if (diff > 0) countdownBigEl.textContent = diff + ' Day' + (diff === 1 ? '' : 's');
        else if (diff === 0) countdownBigEl.textContent = 'Today';
        else countdownBigEl.textContent = 'Complete';
      } else countdownBigEl.textContent = '— Days';
    }

    renderWaypostCommandLog();
    renderMisogiImages();
    var weekendsOnlyCb = document.getElementById('offenceDefenceWeekendsOnly');
    if (weekendsOnlyCb) weekendsOnlyCb.checked = state.offenceDefenceWeekendsOnly;
    var showPctCb = document.getElementById('offenceDefenceShowPct');
    if (showPctCb) showPctCb.checked = state.offenceDefenceShowPct;
    renderOffenceDefenceStrip();
  }

  function init() {
    var prefs = getPrefs();
    if (prefs.weekStart !== undefined) state.weekStart = prefs.weekStart;
    if (prefs.viewStyle !== undefined) {
      var v = prefs.viewStyle;
      state.viewStyle = (v === 12 ? 4 : (v >= 1 && v <= 6 ? v : 4));
    }
    if (prefs.year !== undefined) state.year = prefs.year;
    if (prefs.startMonth !== undefined) state.startMonth = Math.max(0, Math.min(11, prefs.startMonth));
    if (prefs.durationMonths !== undefined) state.durationMonths = Math.max(1, Math.min(24, prefs.durationMonths));
    if (prefs.hidePastMonths !== undefined) state.hidePastMonths = !!prefs.hidePastMonths;
    if (prefs.hideMonthsPastYearEnd !== undefined) state.hideMonthsPastYearEnd = !!prefs.hideMonthsPastYearEnd;
    if (prefs.holidaySet !== undefined && (prefs.holidaySet === 'none' || prefs.holidaySet === 'canada' || prefs.holidaySet === 'usa')) state.holidaySet = prefs.holidaySet;
    if (typeof prefs.title === 'string' && prefs.title.trim() !== '') state.title = prefs.title.trim();
    if (typeof prefs.misogiTitle === 'string') state.misogiTitle = prefs.misogiTitle;
    if (typeof prefs.misogiWho === 'string') state.misogiWho = prefs.misogiWho;
    if (typeof prefs.misogiWhere === 'string') state.misogiWhere = prefs.misogiWhere;
    if (typeof prefs.misogiDescription === 'string') state.misogiDescription = prefs.misogiDescription;
    if (Array.isArray(prefs.misogiPreparation)) {
      state.misogiPreparation = prefs.misogiPreparation.map(function (p, idx) {
        return { id: p.id || 'prep_' + idx, text: typeof p.text === 'string' ? p.text : 'New goal', completed: !!p.completed };
      });
    }
    if (prefs.misogiOutcome === 'success' || prefs.misogiOutcome === 'failure') state.misogiOutcome = prefs.misogiOutcome;
    if (typeof prefs.misogiLessons === 'string') state.misogiLessons = prefs.misogiLessons;
    if (typeof prefs.misogiPhoto === 'string') state.misogiPhoto = prefs.misogiPhoto;
    if (Array.isArray(prefs.misogiImages)) state.misogiImages = prefs.misogiImages.filter(function (s) { return typeof s === 'string'; }).slice(0, 3);
    if (prefs.misogiQualified !== undefined) state.misogiQualified = !!prefs.misogiQualified;
    if (prefs.offenceDefenceWeekendsOnly !== undefined) state.offenceDefenceWeekendsOnly = !!prefs.offenceDefenceWeekendsOnly;
    if (prefs.offenceDefenceShowPct !== undefined) state.offenceDefenceShowPct = !!prefs.offenceDefenceShowPct;
    if (prefs.waypostStatuses && typeof prefs.waypostStatuses === 'object') {
      state.waypostStatuses = prefs.waypostStatuses;
      for (var rk in state.waypostStatuses) { if (state.waypostStatuses[rk] === 'overridden') state.waypostStatuses[rk] = 'cancelled'; }
    }

    state.categories = getCategories();
    state.events = getEvents();

    var titleEl = document.getElementById('appTitle');
    if (titleEl) {
      titleEl.textContent = state.title || 'My Year';
      titleEl.addEventListener('blur', function () {
        var t = this.textContent.trim();
        state.title = t || 'My Year';
        if (!t) this.textContent = 'My Year';
        savePrefs();
      });
      titleEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
      });
    }

    renderMonths();
    setWeekStart(state.weekStart);
    switchView('planner');

    document.getElementById('viewTogglePlanner').addEventListener('click', function () { switchView('planner'); });
    document.getElementById('viewToggleAudit').addEventListener('click', function () { switchView('audit'); });

    var misogiChallengeInput = document.getElementById('misogiChallengeInput');
    if (misogiChallengeInput) {
      misogiChallengeInput.addEventListener('blur', function () { commitMisogi(); });
    }
    var misogiTargetDateEl = document.getElementById('misogiTargetDate');
    if (misogiTargetDateEl) {
      misogiTargetDateEl.addEventListener('change', function () { commitMisogi(); });
      misogiTargetDateEl.addEventListener('input', function () { commitMisogi(); });
    }
    var misogiImagesInput = document.getElementById('misogiImagesInput');
    var misogiImagesAddBtn = document.getElementById('misogiImagesAddBtn');
    if (misogiImagesAddBtn && misogiImagesInput) {
      misogiImagesAddBtn.addEventListener('click', function () {
        if ((state.misogiImages || []).length >= 3) return;
        misogiImagesInput.click();
      });
    }
    if (misogiImagesInput) {
      misogiImagesInput.addEventListener('change', function () {
        var files = this.files;
        if (!files || files.length === 0) return;
        var current = (state.misogiImages || []).slice();
        var remaining = Math.max(0, 3 - current.length);
        if (remaining === 0) { this.value = ''; return; }
        var toAdd = Math.min(remaining, files.length);
        var added = 0;
        function readNext() {
          if (added >= toAdd) {
            state.misogiImages = current;
            savePrefs();
            renderMisogiImages();
            misogiImagesInput.value = '';
            return;
          }
          var file = files[added];
          if (!file.type.startsWith('image/')) { added++; readNext(); return; }
          var reader = new FileReader();
          reader.onload = function () {
            current.push(reader.result);
            added++;
            readNext();
          };
          reader.readAsDataURL(file);
        }
        readNext();
      });
    }
    var auditMisogiTitleEl = document.getElementById('auditMisogiTitle');
    var auditMisogiDescEl = document.getElementById('auditMisogiDescription');
    if (auditMisogiTitleEl) {
      auditMisogiTitleEl.addEventListener('blur', function () {
        state.misogiTitle = this.value.trim();
        setMisogiEventTitleForYear(state.year, state.misogiTitle);
        savePrefs();
        renderAuditDashboard();
      });
    }
    if (auditMisogiDescEl) {
      auditMisogiDescEl.addEventListener('blur', function () {
        state.misogiDescription = this.value.trim();
        savePrefs();
      });
    }
    var auditMisogiWhoEl = document.getElementById('auditMisogiWho');
    if (auditMisogiWhoEl) auditMisogiWhoEl.addEventListener('blur', function () { state.misogiWho = this.value.trim(); savePrefs(); });
    var auditMisogiWhereEl = document.getElementById('auditMisogiWhere');
    if (auditMisogiWhereEl) auditMisogiWhereEl.addEventListener('blur', function () { state.misogiWhere = this.value.trim(); savePrefs(); });
    var auditMisogiPhotoInputEl = document.getElementById('auditMisogiPhotoInput');
    if (auditMisogiPhotoInputEl) {
      auditMisogiPhotoInputEl.addEventListener('change', function () {
        var file = this.files && this.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        var reader = new FileReader();
        reader.onload = function () {
          state.misogiPhoto = reader.result;
          savePrefs();
          renderAuditDashboard();
        };
        reader.readAsDataURL(file);
        this.value = '';
      });
    }
    var auditMisogiPhotoPreviewWrap = document.getElementById('auditMisogiPhotoPreviewWrap');
    if (auditMisogiPhotoPreviewWrap) {
      auditMisogiPhotoPreviewWrap.addEventListener('click', function (e) {
        if (e.target.id === 'auditMisogiPhotoRemove') return;
        var inputEl = document.getElementById('auditMisogiPhotoInput');
        if (inputEl) inputEl.click();
      });
    }
    var auditMisogiPhotoRemoveBtn = document.getElementById('auditMisogiPhotoRemove');
    if (auditMisogiPhotoRemoveBtn) {
      auditMisogiPhotoRemoveBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        state.misogiPhoto = '';
        savePrefs();
        var inputEl = document.getElementById('auditMisogiPhotoInput');
        if (inputEl) inputEl.value = '';
        renderAuditDashboard();
      });
    }
    var auditMisogiOutcomeEl = document.getElementById('auditMisogiOutcome');
    if (auditMisogiOutcomeEl) auditMisogiOutcomeEl.addEventListener('change', function () { state.misogiOutcome = this.value || null; savePrefs(); });
    var auditMisogiLessonsEl = document.getElementById('auditMisogiLessons');
    if (auditMisogiLessonsEl) auditMisogiLessonsEl.addEventListener('blur', function () { state.misogiLessons = this.value.trim(); savePrefs(); });
    var auditMisogiPreparationAddBtn = document.getElementById('auditMisogiPreparationAdd');
    if (auditMisogiPreparationAddBtn) {
      auditMisogiPreparationAddBtn.addEventListener('click', function () {
        state.misogiPreparation = state.misogiPreparation || [];
        state.misogiPreparation.push({ id: 'prep_' + Date.now(), text: 'New goal', completed: false });
        savePrefs();
        renderMisogiPreparationList();
      });
    }
    document.getElementById('auditContent').addEventListener('change', function (e) {
      if (e.target.classList.contains('preparation-cb')) {
        var i = parseInt(e.target.dataset.index, 10);
        if (!isNaN(i) && state.misogiPreparation[i]) {
          state.misogiPreparation[i].completed = e.target.checked;
          savePrefs();
          renderMisogiPreparationList();
        }
      }
    });
    document.getElementById('auditContent').addEventListener('blur', function (e) {
      if (e.target.classList.contains('preparation-text')) {
        var i = parseInt(e.target.dataset.index, 10);
        if (!isNaN(i) && state.misogiPreparation[i]) {
          state.misogiPreparation[i].text = e.target.textContent.trim() || 'New goal';
          savePrefs();
        }
      }
    }, true);
    document.getElementById('auditContent').addEventListener('click', function (e) {
      var listEl = document.getElementById('auditMisogiPreparationList');
      if (!listEl || !listEl.contains(e.target)) return;
      var i = parseInt(e.target.dataset.index, 10);
      if (isNaN(i) || !state.misogiPreparation[i]) return;
      if (e.target.dataset.dir === 'up') {
        if (i > 0) {
          var arr = state.misogiPreparation.slice();
          var item = arr[i];
          arr.splice(i, 1);
          arr.splice(i - 1, 0, item);
          state.misogiPreparation = arr;
          savePrefs();
          renderMisogiPreparationList();
        }
      } else if (e.target.dataset.dir === 'down') {
        if (i < state.misogiPreparation.length - 1) {
          var arr = state.misogiPreparation.slice();
          var item = arr[i];
          arr.splice(i, 1);
          arr.splice(i + 1, 0, item);
          state.misogiPreparation = arr;
          savePrefs();
          renderMisogiPreparationList();
        }
      } else if (e.target.textContent === '×') {
        state.misogiPreparation.splice(i, 1);
        savePrefs();
        renderMisogiPreparationList();
      }
    });

    document.getElementById('yearSelect').addEventListener('change', function () {
      state.year = parseInt(this.value, 10);
      savePrefs();
      renderMonths();
    });

    document.getElementById('startMonthSelect').addEventListener('change', function () {
      state.startMonth = parseInt(this.value, 10);
      savePrefs();
      renderMonths();
    });

    document.getElementById('viewStyleSelect').addEventListener('change', function () {
      state.viewStyle = parseInt(this.value, 10);
      savePrefs();
      var grid = document.getElementById('monthsGrid');
      if (grid) grid.className = 'months-grid grid gap-4 sm:gap-6 ' + getViewGridCols();
      renderMonths();
    });

    document.getElementById('durationSelect').addEventListener('change', function () {
      state.durationMonths = Math.max(1, Math.min(24, parseInt(this.value, 10)));
      savePrefs();
      renderMonths();
    });

    document.getElementById('hidePastMonthsBtn').addEventListener('click', function () {
      state.hidePastMonths = !state.hidePastMonths;
      savePrefs();
      renderMonths();
    });
    document.getElementById('hideMonthsPastYearEndBtn').addEventListener('click', function () {
      state.hideMonthsPastYearEnd = !state.hideMonthsPastYearEnd;
      savePrefs();
      renderMonths();
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

    var waypostCancelledToggleEl = document.getElementById('waypostCancelledToggle');
    if (waypostCancelledToggleEl) {
      waypostCancelledToggleEl.addEventListener('click', function () {
        var panel = document.getElementById('waypostCancelledExpandable');
        var arrow = document.getElementById('waypostCancelledToggleArrow');
        if (!panel) return;
        var isHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !isHidden);
        this.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
        if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
      });
    }

    document.getElementById('holidaysSelect').addEventListener('change', function () {
      var v = this.value;
      state.holidaySet = (v === 'canada' || v === 'usa') ? v : 'none';
      savePrefs();
      renderMonths();
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

    var monthsGridEl = document.getElementById('monthsGrid');
    if (monthsGridEl) {
      monthsGridEl.addEventListener('click', delegateClick);
      monthsGridEl.addEventListener('dragstart', function (e) {
        var el = e.target.closest('.event-dot, .event-chip');
        var dateKey, eventIndex;
        if (el) {
          dateKey = el.getAttribute('data-date');
          eventIndex = el.getAttribute('data-event-index');
        } else {
          var cell = e.target.closest('.day-cell[data-date][data-single-event-index]');
          if (cell) {
            dateKey = cell.getAttribute('data-date');
            eventIndex = cell.getAttribute('data-single-event-index');
          }
        }
        if (dateKey == null || eventIndex == null) return;
        e.dataTransfer.setData('application/json', JSON.stringify({ dateKey: dateKey, eventIndex: parseInt(eventIndex, 10) }));
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dateKey + ',' + eventIndex);
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
        } else if (!document.getElementById('waypostDeleteConfirmModal').classList.contains('hidden')) {
          closeWaypostDeleteConfirmModal();
        } else {
          closeModal();
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
      if (popoverDateKey != null) {
        closeDateContextPopover();
        openModal(popoverDateKey, null, null);
      }
    });
    var dateContextMultiSelectBtn = document.getElementById('dateContextMultiSelectBtn');
    if (dateContextMultiSelectBtn) {
      dateContextMultiSelectBtn.addEventListener('click', function () {
        if (popoverDateKey != null) {
          state.multiSelect = true;
          if (state.selectedDates.indexOf(popoverDateKey) === -1) state.selectedDates.push(popoverDateKey);
          closeDateContextPopover();
          renderMonths();
        }
      });
    }

    var waypostLongestStretchHideBtn = document.getElementById('waypostLongestStretchHide');
    if (waypostLongestStretchHideBtn) {
      waypostLongestStretchHideBtn.addEventListener('click', function () {
        waypostLongestStretchHidden = true;
        var w = document.getElementById('waypostLongestStretchWindow');
        var s = document.getElementById('waypostLongestStretchShow');
        if (w) w.classList.add('hidden');
        if (s) s.classList.remove('hidden');
      });
    }
    var waypostLongestStretchShowBtn = document.getElementById('waypostLongestStretchShowBtn');
    if (waypostLongestStretchShowBtn) {
      waypostLongestStretchShowBtn.addEventListener('click', function () {
        waypostLongestStretchHidden = false;
        var w = document.getElementById('waypostLongestStretchWindow');
        var s = document.getElementById('waypostLongestStretchShow');
        if (w) w.classList.remove('hidden');
        if (s) s.classList.add('hidden');
      });
    }
    var offenceDefenceWeekendsOnlyEl = document.getElementById('offenceDefenceWeekendsOnly');
    if (offenceDefenceWeekendsOnlyEl) {
      offenceDefenceWeekendsOnlyEl.addEventListener('change', function () {
        state.offenceDefenceWeekendsOnly = this.checked;
        savePrefs();
        renderOffenceDefenceStrip();
      });
    }
    var offenceDefenceShowPctEl = document.getElementById('offenceDefenceShowPct');
    if (offenceDefenceShowPctEl) {
      offenceDefenceShowPctEl.addEventListener('change', function () {
        state.offenceDefenceShowPct = this.checked;
        savePrefs();
        renderOffenceDefenceStrip();
      });
    }
    var waypostCommandLogEl = document.getElementById('waypostCommandLog');
    if (waypostCommandLogEl) {
      waypostCommandLogEl.addEventListener('change', function (e) {
        if (e.target.matches && e.target.matches('select[data-row-key]')) {
          var key = e.target.dataset.rowKey;
          var val = e.target.value;
          if (val === 'completed' || val === 'pending' || val === 'cancelled') {
            state.waypostStatuses = state.waypostStatuses || {};
            state.waypostStatuses[key] = val;
            savePrefs();
            renderWaypostCommandLog();
          } else if (val === 'delete') {
            var range = getCalendarDateRange();
            var data = getWaypostCommandLogData(range);
            var waypost = data.wayposts.filter(function (w) { return w.rowKey === key; })[0];
            if (!waypost) {
              renderWaypostCommandLog();
              return;
            }
            waypostDeletePending = waypost;
            document.getElementById('waypostDeleteConfirmModal').classList.remove('hidden');
            document.getElementById('waypostDeleteConfirmModal').setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            renderWaypostCommandLog();
          }
        }
      });
    }

    function closeWaypostDeleteConfirmModal() {
      waypostDeletePending = null;
      var modal = document.getElementById('waypostDeleteConfirmModal');
      if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
      }
      document.body.style.overflow = '';
    }

    function confirmWaypostDelete() {
      var waypost = waypostDeletePending;
      if (!waypost) {
        closeWaypostDeleteConfirmModal();
        return;
      }
      if (waypost.eventId) {
        for (var dk in state.events) {
          var list = state.events[dk].filter(function (ev) { return ev.eventId !== waypost.eventId; });
          if (list.length === 0) delete state.events[dk];
          else state.events[dk] = list;
        }
      } else {
        (waypost.dateKeys || []).forEach(function (dk) {
          var list = (state.events[dk] || []).filter(function (ev) {
            return !(ev.category === '8weekwin' && (ev.title || '').trim() === (waypost.title || '').trim());
          });
          if (list.length === 0) delete state.events[dk];
          else state.events[dk] = list;
        });
      }
      if (state.waypostStatuses && state.waypostStatuses[waypost.rowKey] !== undefined) {
        delete state.waypostStatuses[waypost.rowKey];
        savePrefs();
      }
      saveEvents(state.events);
      closeWaypostDeleteConfirmModal();
      renderWaypostCommandLog();
      renderMonths();
    }

    document.getElementById('waypostDeleteConfirmBtn').addEventListener('click', function () {
      confirmWaypostDelete();
    });
    document.getElementById('waypostDeleteConfirmCancelBtn').addEventListener('click', closeWaypostDeleteConfirmModal);
    document.getElementById('waypostDeleteConfirmBackdrop').addEventListener('click', closeWaypostDeleteConfirmModal);

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
        var dateKey = row.getAttribute('data-date-key');
        var eventIndex = row.getAttribute('data-event-index');
        if (dateKey != null && eventIndex != null) openModal(dateKey, parseInt(eventIndex, 10), null);
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

  init();
})();
