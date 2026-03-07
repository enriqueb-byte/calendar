'use strict';

/**
 * Calendar Planner 2.0 — Audit (audit.js)
 * Contract: Expects window.CalendarPlanner with state, savePrefs, getEvents, saveEvents, renderMonths,
 * dateKey, daysInMonth, MONTH_NAMES, getCategory, escapeHtml, debounce.
 * Exposes: getMisogiDateForYear, renderAuditDashboard, auditInit.
 */
var CP = window.CalendarPlanner;
var state = CP.state;
var savePrefs = CP.savePrefs;
var getEvents = CP.getEvents;
var saveEvents = CP.saveEvents;
var dateKey = CP.dateKey;
var daysInMonth = CP.daysInMonth;
var MONTH_NAMES = CP.MONTH_NAMES;
var getCategory = CP.getCategory;
var escapeHtml = CP.escapeHtml;

function callRenderMonths() {
  if (CP.renderMonths) CP.renderMonths();
}

var auditDomCache = {};
var renderAuditDashboardDebounced = CP.debounce ? CP.debounce(function () { renderAuditDashboard(); }, 120) : function () { renderAuditDashboard(); };

var AUDIT_YEAR = new Date().getFullYear();
var lifeBalanceChart = null;
var popoverDateKey = null;
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
      if (list[i].isMisogi === true || list[i].category === 'misogi') return dk;
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
      if (list[i].isMisogi === true || list[i].category === 'misogi') return { dateKey: dk, eventIndex: i, event: list[i] };
    }
  }
  return null;
}

function setMisogiEventTitleForYear(year, title) {
  var info = getMisogiEventForYear(year);
  if (!info) return;
  var list = state.events[info.dateKey].slice();
  var prev = list[info.eventIndex];
  list[info.eventIndex] = { title: title.trim() || prev.title, category: prev.category || (CP.getFirstStandardCategoryId ? CP.getFirstStandardCategoryId() : 'community'), eventId: prev.eventId, isMisogi: true, isWaypost: prev.isWaypost === true };
  state.events[info.dateKey] = list;
  saveEvents(state.events);
}

function isWaypostCategory(cid) {
  return cid === 'winningheat' || cid === '8weekwin';
}
function isWaypostEvent(ev) {
  return ev && (ev.isWaypost === true || isWaypostCategory(ev.category));
}
function isGeneralEvent(ev) {
  if (!ev) return false;
  if (ev.isMisogi === true || ev.category === 'misogi') return false;
  if (isWaypostEvent(ev)) return false;
  return true;
}
function generalEventRowKey(ev, dateKey) {
  return ev.eventId || (dateKey + '|' + (ev.title || '').trim() + '|' + (ev.category || ''));
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
        if (isWaypostEvent(ev)) hasWinning = true;
      });
    }
    if (!hasPersonal && !hasWinning) out.push(MONTH_NAMES[m]);
  }
  return out;
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
    var list = state.events[dk].filter(function (ev) { return ev.isMisogi !== true && ev.category !== 'misogi'; });
    if (list.length === 0) delete state.events[dk];
    else state.events[dk] = list;
  }
  var list = (state.events[dateKeyVal] || []).slice();
  list.push({ title: title, category: 'misogi', eventId: 'misogi_' + year, isMisogi: true });
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
    var list = state.events[dk].filter(function (ev) { return ev.isMisogi !== true && ev.category !== 'misogi'; });
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

function getGeneralEventsData(range) {
  var startDateKey = range.startDateKey;
  var endDateKey = range.endDateKey;
  var byCategory = {};
  var statuses = state.generalEventStatuses || {};
  for (var dk in state.events) {
    if (dk < startDateKey || dk > endDateKey) continue;
    var list = state.events[dk] || [];
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (!isGeneralEvent(ev)) continue;
      var cid = ev.category || '';
      if (!byCategory[cid]) byCategory[cid] = [];
      var rowKey = generalEventRowKey(ev, dk);
      var status = (ev.status && (ev.status === 'pending' || ev.status === 'completed' || ev.status === 'cancelled' || ev.status === 'deleted')) ? ev.status : (statuses[rowKey] || 'pending');
      byCategory[cid].push({ dateKey: dk, eventIndex: i, title: (ev.title || '').trim() || 'Untitled', category: cid, eventId: ev.eventId, rowKey: rowKey, status: status });
    }
  }
  for (var catId in byCategory) {
    var raw = byCategory[catId];
    raw.sort(function (a, b) { return a.dateKey.localeCompare(b.dateKey); });
    var seen = {};
    var deduped = [];
    for (var j = 0; j < raw.length; j++) {
      var it = raw[j];
      var logicalKey = it.eventId || it.rowKey;
      if (seen[logicalKey]) continue;
      seen[logicalKey] = true;
      deduped.push(it);
    }
    byCategory[catId] = deduped;
  }
  var completedCount = 0;
  var totalCount = 0;
  for (var catId in byCategory) {
    var items = byCategory[catId];
    items.forEach(function (it) {
      if (it.status !== 'deleted') totalCount++;
      if (it.status === 'completed') completedCount++;
    });
  }
  return { byCategory: byCategory, completedCount: completedCount, totalCount: totalCount };
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
      if (!isWaypostEvent(ev)) continue;
      var title = (ev.title || 'Mini-Adventure').trim() || 'Mini-Adventure';
      var logicalKey = ev.eventId || (dk + '|' + title);
      if (!byLogicalKey[logicalKey]) {
        byLogicalKey[logicalKey] = { title: title, dateKeys: [], rowKey: ev.eventId || (dk + '|' + title), eventId: ev.eventId, category: ev.category };
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
    var list0 = state.events[w.dateKey] || [];
    w.firstEventIndex = -1;
    var firstEv = null;
    for (var qi = 0; qi < list0.length; qi++) {
      if (!isWaypostEvent(list0[qi])) continue;
      var ev0 = list0[qi];
      if (w.eventId ? ev0.eventId === w.eventId : (ev0.title || '').trim() === w.title) { w.firstEventIndex = qi; firstEv = ev0; break; }
    }
    w.status = (firstEv && firstEv.status && (firstEv.status === 'pending' || firstEv.status === 'completed' || firstEv.status === 'cancelled' || firstEv.status === 'deleted')) ? firstEv.status : ((state.waypostStatuses || {})[w.rowKey] || 'pending');
    w.dayIndexInRange = 1 + Math.round((new Date(w.dateKey) - new Date(startDateKey)) / 86400000);
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
  var title = s === 'pending' ? 'Pending' : s === 'completed' ? 'Completed' : s === 'cancelled' ? 'Cancelled' : s === 'deleted' ? 'Deleted' : 'Pending';
  if (s === 'pending') {
    return '<svg class="w-4 h-4 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" title="' + title + '"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
  }
  if (s === 'completed') {
    return '<svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" title="' + title + '"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
  }
  if (s === 'deleted') {
    return '<svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" title="' + title + '"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>';
  }
  return '<svg class="w-4 h-4 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" title="' + title + '"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
}

function formatMonthDay(dateKeyStr) {
  if (!dateKeyStr || typeof dateKeyStr !== 'string') return '';
  var parts = dateKeyStr.split('-');
  if (parts.length !== 3) return '';
  var monthIdx = parseInt(parts[1], 10) - 1;
  var day = parts[2];
  var monthShort = (MONTH_NAMES[monthIdx] || '').substring(0, 3);
  return monthShort ? monthShort + ' ' + day : '';
}

function buildWaypostCommandLogRow(w) {
  var li = document.createElement('li');
  li.className = 'flex items-center gap-1.5 px-2 py-1.5 text-xs min-h-[2rem] flex-shrink-0 ' + (w.alertRow ? 'bg-red-50 border-l-2 border-red-300' : '');
  var titleCell = document.createElement('span');
  titleCell.className = 'font-medium text-ink-800 min-w-0 flex-1 truncate cursor-pointer hover:bg-ink-50 rounded px-1 -mx-1 py-0.5 -my-0.5';
  titleCell.textContent = w.title;
  titleCell.setAttribute('title', 'Click to edit event');
  titleCell.addEventListener('click', function (e) {
    e.stopPropagation();
    var dk = w.dateKey || (w.dateKeys && w.dateKeys[0]);
    var idx = w.firstEventIndex != null ? w.firstEventIndex : -1;
    if (dk != null && idx >= 0 && CP.openModal) CP.openModal(dk, idx, null);
  });
  li.appendChild(titleCell);
  var firstDateKey = w.dateKey || (w.dateKeys && w.dateKeys[0]);
  var dateLabel = formatMonthDay(firstDateKey);
  if (dateLabel) {
    var dateEl = document.createElement('span');
    dateEl.className = 'flex-shrink-0 text-[10px] text-ink-500 tabular-nums';
    dateEl.textContent = dateLabel;
    li.appendChild(dateEl);
  }
  var statusWrap = document.createElement('span');
  statusWrap.className = 'flex-shrink-0 w-6 h-6 flex items-center justify-center rounded border border-ink-200 bg-ink-50/50';
  statusWrap.setAttribute('title', w.status === 'completed' ? 'Completed' : w.status === 'cancelled' ? 'Cancelled' : w.status === 'deleted' ? 'Deleted' : 'Pending');
  statusWrap.innerHTML = waypostStatusIcon(w.status);
  li.appendChild(statusWrap);
  return li;
}

function buildGeneralEventBubble(item) {
  var span = document.createElement('span');
  var cat = getCategory(item.category || '');
  var softBg = (cat && cat.color) ? (cat.color + '22') : '#f0f0f2';
  span.className = 'general-event-bubble inline-block max-w-full truncate font-medium text-ink-800 text-xs px-2.5 py-1 rounded-full border border-ink-200 cursor-pointer transition-colors' + (item.status === 'deleted' ? ' opacity-60' : '');
  span.style.backgroundColor = softBg;
  if (cat && cat.color) span.style.borderColor = cat.color + '44';
  span.textContent = item.title;
  span.setAttribute('title', 'Click to edit event');
  span.addEventListener('click', function (e) {
    e.stopPropagation();
    var idx = item.eventIndex != null ? item.eventIndex : -1;
    if (item.dateKey != null && idx >= 0 && CP.openModal) CP.openModal(item.dateKey, idx, null);
  });
  return span;
}

function renderGeneralSection() {
  var container = document.getElementById('generalByCategory');
  if (!container) return;
  var range = getCalendarDateRange();
  var data = getGeneralEventsData(range);
  container.innerHTML = '';
  var categoryOrder = (state.categories || []).filter(function (c) { return c.id !== 'misogi' && c.id !== '8weekwin' && c.id !== 'winningheat'; });
  var catIdsOrdered = categoryOrder.map(function (c) { return c.id; });
  var remainingIds = Object.keys(data.byCategory).filter(function (id) { return catIdsOrdered.indexOf(id) === -1; });
  var orderedCatIds = catIdsOrdered.concat(remainingIds);
  var rendered = 0;
  orderedCatIds.forEach(function (catId) {
    var allInCat = data.byCategory[catId] || [];
    if (allInCat.length === 0) return;
    rendered++;
    var block = document.createElement('div');
    block.className = 'border border-ink-200 rounded overflow-hidden';
    var label = document.createElement('h3');
    label.className = 'text-[10px] font-semibold uppercase tracking-wide text-ink-500 bg-ink-50/80 px-2 py-1 border-b border-ink-100';
    var catInfo = getCategory(catId);
    label.textContent = catInfo.label || catId;
    block.appendChild(label);
    var row = document.createElement('div');
    row.className = 'flex flex-wrap gap-1.5 items-center px-2 py-1.5';
    allInCat.forEach(function (item) { row.appendChild(buildGeneralEventBubble(item)); });
    block.appendChild(row);
    container.appendChild(block);
  });
  if (rendered === 0) {
    var empty = document.createElement('p');
    empty.className = 'text-sm text-ink-500';
    empty.textContent = 'No events in the visible date range. Add events on the Plan view.';
    container.appendChild(empty);
  }
}

function renderWaypostCommandLog() {
  var completionEl = document.getElementById('waypostCompletion');
  var longestStretchEl = document.getElementById('waypostLongestStretch');
  var listEl = document.getElementById('waypostCommandLogList');
  if (!listEl) return;
  var range = getCalendarDateRange();
  var data = getWaypostCommandLogData(range);
  if (completionEl) completionEl.textContent = data.completedCount + '/' + data.total;
  if (longestStretchEl) {
    longestStretchEl.textContent = data.total > 0 ? data.longestStretch + ' days' : '—';
    longestStretchEl.className = 'font-semibold text-ink-800';
  }
  var averageStretchEl = document.getElementById('waypostAverageStretch');
  if (averageStretchEl) {
    averageStretchEl.textContent = data.total > 0 ? data.averageStretch + ' days' : '—';
    averageStretchEl.className = 'font-semibold text-ink-800';
  }
  listEl.innerHTML = '';
  var cancelledSection = document.getElementById('waypostCancelledSection');
  var cancelledList = document.getElementById('waypostCancelledList');
  var cancelledExpandable = document.getElementById('waypostCancelledExpandable');
  var cancelledToggle = document.getElementById('waypostCancelledToggle');
  var cancelledLabel = document.getElementById('waypostCancelledToggleLabel');
  var cancelledArrow = document.getElementById('waypostCancelledToggleArrow');

  if (data.wayposts.length === 0) {
    var empty = document.createElement('li');
    empty.className = 'px-3 py-2 text-sm text-ink-500';
    empty.textContent = 'No Mini-Adventures in the visible date range.';
    listEl.appendChild(empty);
    if (cancelledSection) cancelledSection.classList.add('hidden');
    return;
  }

  var active = data.wayposts.filter(function (w) { return w.status !== 'cancelled'; });
  var cancelled = data.wayposts.filter(function (w) { return w.status === 'cancelled'; });

  if (active.length === 0) {
    var emptyActive = document.createElement('li');
    emptyActive.className = 'px-3 py-2 text-sm text-ink-500';
    emptyActive.textContent = 'No active Mini-Adventures in the visible date range.';
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
        return !(isWaypostEvent(ev) && (ev.title || '').trim() === (waypost.title || '').trim());
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
  renderGeneralSection();
  renderMisogiImages();
}

function auditInit() {
  var misogiChallengeInput = document.getElementById('misogiChallengeInput');
  if (misogiChallengeInput) {
    misogiChallengeInput.addEventListener('click', function (e) {
      var year = state.year != null ? state.year : new Date().getFullYear();
      var info = getMisogiEventForYear(year);
      if (info && CP.openModal) {
        e.preventDefault();
        misogiChallengeInput.blur();
        CP.openModal(info.dateKey, info.eventIndex, null);
      } else if (!info && CP.openModal) {
        e.preventDefault();
        misogiChallengeInput.blur();
        var dateInput = document.getElementById('misogiTargetDate');
        var dk = dateInput && dateInput.value && dateInput.value.trim() ? dateInput.value.trim() : (year + '-12-31');
        state.openModalForMisogi = true;
        var typed = misogiChallengeInput.value && misogiChallengeInput.value.trim();
        if (typed) state.openModalMisogiTitle = typed;
        CP.openModal(dk, null, null);
      }
    });
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
  var auditMisogiDescEl = document.getElementById('auditMisogiDescription');
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
  var auditContentEl = document.getElementById('auditContent');
  if (auditContentEl) {
    auditContentEl.addEventListener('change', function (e) {
      if (e.target.classList.contains('preparation-cb')) {
        var i = parseInt(e.target.dataset.index, 10);
        if (!isNaN(i) && state.misogiPreparation[i]) {
          state.misogiPreparation[i].completed = e.target.checked;
          savePrefs();
          renderMisogiPreparationList();
        }
      }
    });
    auditContentEl.addEventListener('blur', function (e) {
      if (e.target.classList.contains('preparation-text')) {
        var i = parseInt(e.target.dataset.index, 10);
        if (!isNaN(i) && state.misogiPreparation[i]) {
          state.misogiPreparation[i].text = e.target.textContent.trim() || 'New goal';
          savePrefs();
        }
      }
    }, true);
    auditContentEl.addEventListener('click', function (e) {
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
  }

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

  var waypostDeleteConfirmBtn = document.getElementById('waypostDeleteConfirmBtn');
  var waypostDeleteConfirmCancelBtn = document.getElementById('waypostDeleteConfirmCancelBtn');
  var waypostDeleteConfirmBackdrop = document.getElementById('waypostDeleteConfirmBackdrop');
  if (waypostDeleteConfirmBtn) waypostDeleteConfirmBtn.addEventListener('click', confirmWaypostDelete);
  if (waypostDeleteConfirmCancelBtn) waypostDeleteConfirmCancelBtn.addEventListener('click', closeWaypostDeleteConfirmModal);
  if (waypostDeleteConfirmBackdrop) waypostDeleteConfirmBackdrop.addEventListener('click', closeWaypostDeleteConfirmModal);
}

function refreshTrackLists() {
  renderWaypostCommandLog();
  renderGeneralSection();
}

if (window.CalendarPlanner) {
  window.CalendarPlanner.getMisogiDateForYear = getMisogiDateForYear;
  window.CalendarPlanner.getMisogiEventForYear = getMisogiEventForYear;
  window.CalendarPlanner.renderAuditDashboard = renderAuditDashboard;
  window.CalendarPlanner.auditInit = auditInit;
  window.CalendarPlanner.closeWaypostDeleteConfirmModal = closeWaypostDeleteConfirmModal;
  window.CalendarPlanner.refreshTrackLists = refreshTrackLists;
}
