'use strict';

/**
 * Calendar Planner — Audit (audit.js)
 * Contract: Expects window.CalendarPlanner with state, savePrefs, getEvents, saveEvents, renderMonths,
 * daysInMonth, dateKey, escapeHtml, MONTH_NAMES, getCategory.
 * Listeners attached: misogiChallengeInput, misogiTargetDate, misogiImagesInput/AddBtn, auditMisogi*,
 * offenceDefenceWeekendsOnly, offenceDefenceShowPct, waypost* (cancelled, longestStretch, delete),
 * auditContent (change for preparation-cb), waypostCommandLogList, waypostDeleteConfirm*, etc.
 */

var CP = window.CalendarPlanner;
var state = CP.state;
var savePrefs = CP.savePrefs;
var getEvents = CP.getEvents;
var saveEvents = CP.saveEvents;
var daysInMonth = CP.daysInMonth;
var dateKey = CP.dateKey;
var escapeHtml = CP.escapeHtml;
var MONTH_NAMES = CP.MONTH_NAMES;
var getCategory = CP.getCategory;

function callRenderMonths() {
  if (CP.renderMonths) CP.renderMonths();
}

var auditDomCache = {};
var renderAuditDashboardDebounced = CP.debounce ? CP.debounce(function () { renderAuditDashboard(); }, 120) : function () { renderAuditDashboard(); };

var AUDIT_YEAR = new Date().getFullYear();
var lifeBalanceChart = null;
var popoverDateKey = null;
var waypostLongestStretchHidden = false;
var waypostDeletePending = null;

var WaypostUtils = {
  DAYS_PER_YEAR: 365,
  dayOfYearFromDateKey: function (dateKeyStr, year) {
    var parts = dateKeyStr.split('-');
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

function getMisogiDateForYear(year) {
  var y = String(year);
  for (var dk in state.events) {
    if (dk.indexOf(y) !== 0) continue;
    var list = state.events[dk] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].category === 'misogi') return dk;
    }
  }
  return null;
}

function getMisogiEventForYear(year) {
  var y = String(year);
  for (var dk in state.events) {
    if (dk.indexOf(y) !== 0) continue;
    var list = state.events[dk] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].category === 'misogi') return { dateKey: dk, eventIndex: i, event: list[i] };
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
  var dateKeyVal = dateInput.value.trim();
  if (!title || !dateKeyVal) return;
  var year = typeof state !== 'undefined' && state.year != null ? state.year : new Date().getFullYear();
  AUDIT_YEAR = year;
  var y = String(year);
  for (var dk in state.events) {
    if (dk.indexOf(y) !== 0) continue;
    var list = state.events[dk].filter(function (ev) { return ev.category !== 'misogi'; });
    if (list.length === 0) delete state.events[dk];
    else state.events[dk] = list;
  }
  var list = (state.events[dateKeyVal] || []).slice();
  list.push({ title: title, category: 'misogi', eventId: 'misogi_' + year, eventType: 'offensive' });
  state.events[dateKeyVal] = list;
  state.misogiTitle = title;
  state.misogiQualified = true;
  saveEvents(state.events);
  savePrefs();
  renderAuditDashboard();
  callRenderMonths();
}

function resetMisogi() {
  state.misogiQualified = false;
  var y = String(AUDIT_YEAR);
  for (var dk in state.events) {
    if (dk.indexOf(y) !== 0) continue;
    var list = state.events[dk].filter(function (ev) { return ev.category !== 'misogi'; });
    if (list.length === 0) delete state.events[dk];
    else state.events[dk] = list;
  }
  saveEvents(state.events);
  savePrefs();
  renderAuditDashboard();
  callRenderMonths();
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

function addDaysToDateKey(dateKeyStr, days) {
  var parts = dateKeyStr.split('-');
  var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getWaypostCommandLogData(range) {
  var startDateKey = range.startDateKey;
  var endDateKey = range.endDateKey;
  var daysInRange = range.daysInRange;
  var byLogicalKey = {};
  for (var dk in state.events) {
    if (dk < startDateKey || dk > endDateKey) continue;
    var list = state.events[dk] || [];
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if ((ev.category || '') !== '8weekwin') continue;
      var title = (ev.title || 'Waypost').trim() || 'Waypost';
      var logicalKey = ev.eventId || (dk + '|' + title);
      if (!byLogicalKey[logicalKey]) {
        byLogicalKey[logicalKey] = { title: title, dateKeys: [], rowKey: ev.eventId || (dk + '|' + title), eventId: ev.eventId };
      }
      if (byLogicalKey[logicalKey].dateKeys.indexOf(dk) === -1) {
        byLogicalKey[logicalKey].dateKeys.push(dk);
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
  callRenderMonths();
}

function renderAuditDashboard() {
  AUDIT_YEAR = state.year;
  var misogiInfo = getMisogiEventForYear(AUDIT_YEAR);
  var misogiDateKey = misogiInfo ? misogiInfo.dateKey : null;
  if (!auditDomCache.auditContent) auditDomCache.auditContent = document.getElementById('auditContent');
  var auditRoot = auditDomCache.auditContent;
  var countdownBigEl = auditRoot ? auditRoot.querySelector('#misogiCountdownBig') : document.getElementById('misogiCountdownBig');
  var challengeInput = auditRoot ? auditRoot.querySelector('#misogiChallengeInput') : document.getElementById('misogiChallengeInput');
  var targetDateInput = auditRoot ? auditRoot.querySelector('#misogiTargetDate') : document.getElementById('misogiTargetDate');

  if (challengeInput) {
    if (misogiInfo && misogiInfo.event && misogiInfo.event.title) challengeInput.value = misogiInfo.event.title;
    else if (state.misogiTitle) challengeInput.value = state.misogiTitle;
  }
  if (targetDateInput) {
    if (misogiDateKey) targetDateInput.value = misogiDateKey;
    else if (!targetDateInput.value) targetDateInput.value = state.year + '-12-31';
  }
  var descInput = auditRoot ? auditRoot.querySelector('#auditMisogiDescription') : document.getElementById('auditMisogiDescription');
  if (descInput) descInput.value = state.misogiDescription || '';
  var whatSetsApartInput = auditRoot ? auditRoot.querySelector('#auditMisogiWhatSetsApart') : document.getElementById('auditMisogiWhatSetsApart');
  if (whatSetsApartInput) whatSetsApartInput.value = state.misogiWhatSetsApart || '';
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
  var weekendsOnlyCb = auditRoot ? auditRoot.querySelector('#offenceDefenceWeekendsOnly') : document.getElementById('offenceDefenceWeekendsOnly');
  if (weekendsOnlyCb) weekendsOnlyCb.checked = state.offenceDefenceWeekendsOnly;
  var showPctCb = auditRoot ? auditRoot.querySelector('#offenceDefenceShowPct') : document.getElementById('offenceDefenceShowPct');
  if (showPctCb) showPctCb.checked = state.offenceDefenceShowPct;
  renderOffenceDefenceStrip();
}

function auditInit() {
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
      renderAuditDashboardDebounced();
    });
  }
  if (auditMisogiDescEl) {
    auditMisogiDescEl.addEventListener('blur', function () {
      state.misogiDescription = this.value.trim();
      savePrefs();
    });
  }
  var auditMisogiWhatSetsApartEl = document.getElementById('auditMisogiWhatSetsApart');
  if (auditMisogiWhatSetsApartEl) {
    auditMisogiWhatSetsApartEl.addEventListener('blur', function () {
      state.misogiWhatSetsApart = this.value.trim();
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
        renderAuditDashboardDebounced();
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
      renderAuditDashboardDebounced();
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

  document.getElementById('waypostDeleteConfirmBtn').addEventListener('click', function () {
    confirmWaypostDelete();
  });
  document.getElementById('waypostDeleteConfirmCancelBtn').addEventListener('click', closeWaypostDeleteConfirmModal);
  document.getElementById('waypostDeleteConfirmBackdrop').addEventListener('click', closeWaypostDeleteConfirmModal);
}

if (window.CalendarPlanner) {
  window.CalendarPlanner.getMisogiDateForYear = getMisogiDateForYear;
  window.CalendarPlanner.renderAuditDashboard = renderAuditDashboard;
  window.CalendarPlanner.auditInit = auditInit;
}
