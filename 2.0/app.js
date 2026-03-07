'use strict';

/**
 * Calendar Planner — Core (app.js)
 * Contract: Provides state, storage (prefs/events/categories), date helpers, escapeHtml,
 * switchView, init. Expects CalendarPlanner.renderMonths, setWeekStart, plannerInit,
 * auditInit, perspectiveInit, renderAuditDashboard, renderLifeDashboard to be attached
 * by planner.js, audit.js, perspective.js (load order).
 */

var CalendarPlanner = window.CalendarPlanner || {};

function debounce(fn, ms) {
  var t = null;
  return function () {
    var a = arguments;
    if (t) clearTimeout(t);
    t = setTimeout(function () { fn.apply(null, a); }, ms);
  };
}

var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var WEEKDAYS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

var DEFAULT_CATEGORIES = [
  { id: 'community', label: 'Community', color: '#673AB7' },
  { id: 'family', label: 'Family', color: '#E91E63' },
  { id: 'health', label: 'Health', color: '#34A853' },
  { id: 'spirit', label: 'Spirit', color: '#00ACC1' },
  { id: 'work', label: 'Work', color: '#EA4335' },
  { id: 'misogi', label: 'Misogi', color: '#FABB05' },
  { id: '8weekwin', label: 'Waypost', color: '#1A73E8' }
];

var STORAGE_KEY = 'calendar-planner-events';
var PREFS_KEY = 'calendar-planner-prefs';
var CATEGORIES_STORAGE_KEY = 'calendar-planner-categories';

var state = {
  viewMode: 'planner',
  title: 'My Year',
  misogiTitle: '',
  misogiWho: '',
  misogiWhere: '',
  misogiDescription: '',
  misogiWhatSetsApart: '',
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
  lifeDateOfBirth: '',
  lifeGender: 'male',
  lifeExpectancyOverride: null,
  lifeExpectancyOverrideActive: false,
  lifeChildren: [],
  lifeHasChildren: false,
  lifeParents: [],
  lifeHasLivingParents: false,
  lifeMilestones: [],
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
  } catch (e) {
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
    var raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    var p = JSON.parse(raw);
    return { weekStart: p.weekStart, viewStyle: p.viewStyle, startMonth: p.startMonth, durationMonths: p.durationMonths, year: p.year, hidePastMonths: p.hidePastMonths, hideMonthsPastYearEnd: p.hideMonthsPastYearEnd, holidaySet: p.holidaySet, title: p.title, misogiTitle: p.misogiTitle, misogiWho: p.misogiWho, misogiWhere: p.misogiWhere, misogiDescription: p.misogiDescription, misogiWhatSetsApart: p.misogiWhatSetsApart, misogiPreparation: p.misogiPreparation, misogiOutcome: p.misogiOutcome, misogiLessons: p.misogiLessons, misogiPhoto: p.misogiPhoto, misogiImages: p.misogiImages, misogiQualified: p.misogiQualified, offenceDefenceWeekendsOnly: p.offenceDefenceWeekendsOnly, offenceDefenceShowPct: p.offenceDefenceShowPct, waypostStatuses: p.waypostStatuses, lifeDateOfBirth: p.lifeDateOfBirth, lifeGender: p.lifeGender, lifeExpectancyOverride: p.lifeExpectancyOverride, lifeExpectancyOverrideActive: p.lifeExpectancyOverrideActive, lifeChildren: Array.isArray(p.lifeChildren) ? p.lifeChildren.slice() : [], lifeHasChildren: p.lifeHasChildren === true, lifeParents: Array.isArray(p.lifeParents) ? p.lifeParents.slice() : [], lifeHasLivingParents: p.lifeHasLivingParents === true, lifeMilestones: Array.isArray(p.lifeMilestones) ? p.lifeMilestones.slice() : [] };
  } catch (e) {
    return {};
  }
}

function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ weekStart: state.weekStart, viewStyle: state.viewStyle, startMonth: state.startMonth, durationMonths: state.durationMonths, year: state.year, hidePastMonths: state.hidePastMonths, hideMonthsPastYearEnd: state.hideMonthsPastYearEnd, holidaySet: state.holidaySet, title: state.title, misogiTitle: state.misogiTitle, misogiWho: state.misogiWho, misogiWhere: state.misogiWhere, misogiDescription: state.misogiDescription, misogiWhatSetsApart: state.misogiWhatSetsApart, misogiPreparation: state.misogiPreparation, misogiOutcome: state.misogiOutcome, misogiLessons: state.misogiLessons, misogiPhoto: state.misogiPhoto, misogiImages: state.misogiImages, misogiQualified: state.misogiQualified, offenceDefenceWeekendsOnly: state.offenceDefenceWeekendsOnly, offenceDefenceShowPct: state.offenceDefenceShowPct, waypostStatuses: state.waypostStatuses, lifeDateOfBirth: state.lifeDateOfBirth, lifeGender: state.lifeGender, lifeExpectancyOverride: state.lifeExpectancyOverride, lifeExpectancyOverrideActive: state.lifeExpectancyOverrideActive, lifeChildren: state.lifeChildren.slice(), lifeHasChildren: state.lifeHasChildren, lifeParents: state.lifeParents.slice(), lifeHasLivingParents: state.lifeHasLivingParents, lifeMilestones: state.lifeMilestones.slice() }));
}

function getEvents() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveEvents(events) {
  state.events = events;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function dateKey(year, month, day) {
  var m = String(month + 1).padStart(2, '0');
  var d = String(day).padStart(2, '0');
  return year + '-' + m + '-' + d;
}

function isToday(year, month, day) {
  var t = new Date();
  return t.getFullYear() === year && t.getMonth() === month && t.getDate() === day;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

function escapeHtml(s) {
  var div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

var domCache = {};

function switchView(mode) {
  var planner = domCache.plannerContent || document.getElementById('plannerContent');
  var audit = domCache.auditContent || document.getElementById('auditContent');
  var life = domCache.lifeContent || document.getElementById('lifeContent');
  var btnPlanner = domCache.viewTogglePlanner || document.getElementById('viewTogglePlanner');
  var btnAudit = domCache.viewToggleAudit || document.getElementById('viewToggleAudit');
  var btnLife = domCache.viewToggleLife || document.getElementById('viewToggleLife');
  var wrapper = document.getElementById('viewSwitchWrapper');
  if (mode === 'audit') {
    if (audit) {
      audit.style.setProperty('overflow-y', 'visible', 'important');
      audit.style.setProperty('max-height', 'none', 'important');
    }
    if (wrapper) wrapper.style.setProperty('overflow-y', 'visible', 'important');
    if (audit) audit.classList.add('view-block-audit-visible');
    if (audit) audit.classList.remove('view-block-audit-off');
    if (planner) planner.classList.add('view-block-planner-off');
    if (life) life.classList.remove('view-block-life-visible');
    if (wrapper && audit) {
      void wrapper.offsetHeight;
      void audit.offsetHeight;
    }
  } else if (mode === 'life') {
    if (life) {
      life.style.setProperty('overflow-y', 'visible', 'important');
      life.style.setProperty('max-height', 'none', 'important');
    }
    if (wrapper) wrapper.style.setProperty('overflow-y', 'visible', 'important');
    if (life) life.classList.add('view-block-life-visible');
    if (audit) audit.classList.remove('view-block-audit-visible');
    if (audit) audit.classList.add('view-block-audit-off');
    if (planner) planner.classList.add('view-block-planner-off');
  } else {
    if (planner) planner.classList.remove('view-block-planner-off');
    if (audit) audit.classList.remove('view-block-audit-visible');
    if (audit) audit.classList.remove('view-block-audit-off');
    if (life) life.classList.remove('view-block-life-visible');
  }
  if (btnPlanner) btnPlanner.setAttribute('aria-pressed', mode === 'planner' ? 'true' : 'false');
  if (btnAudit) btnAudit.setAttribute('aria-pressed', mode === 'audit' ? 'true' : 'false');
  if (btnLife) btnLife.setAttribute('aria-pressed', mode === 'life' ? 'true' : 'false');
  if (mode === 'audit' && typeof CalendarPlanner.renderAuditDashboard === 'function') CalendarPlanner.renderAuditDashboard();
  if (mode === 'life' && typeof CalendarPlanner.renderLifeDashboard === 'function') CalendarPlanner.renderLifeDashboard();
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
  if (typeof prefs.misogiWhatSetsApart === 'string') state.misogiWhatSetsApart = prefs.misogiWhatSetsApart;
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
  if (typeof prefs.lifeDateOfBirth === 'string') state.lifeDateOfBirth = prefs.lifeDateOfBirth;
  if (prefs.lifeGender === 'female' || prefs.lifeGender === 'male') state.lifeGender = prefs.lifeGender;
  if (prefs.lifeExpectancyOverride != null && typeof prefs.lifeExpectancyOverride === 'number' && prefs.lifeExpectancyOverride >= 1 && prefs.lifeExpectancyOverride <= 120) {
    state.lifeExpectancyOverride = prefs.lifeExpectancyOverride;
    state.lifeExpectancyOverrideActive = true;
  }
  if (prefs.lifeExpectancyOverrideActive === true) state.lifeExpectancyOverrideActive = true;
  if (Array.isArray(prefs.lifeChildren)) state.lifeChildren = prefs.lifeChildren.slice();
  if (prefs.lifeHasChildren === true) state.lifeHasChildren = true;
  if (Array.isArray(prefs.lifeParents)) state.lifeParents = prefs.lifeParents.slice();
  if (prefs.lifeHasLivingParents === true) state.lifeHasLivingParents = true;
  if (Array.isArray(prefs.lifeMilestones)) {
    state.lifeMilestones = prefs.lifeMilestones.slice().map(function (m) {
      return { id: m.id || 'milestone-' + Date.now() + '-' + Math.random().toString(36).slice(2), description: typeof m.description === 'string' ? m.description : '', date: typeof m.date === 'string' ? m.date : '' };
    });
  }
  state.categories = getCategories();
  state.events = getEvents();

  domCache.appTitle = document.getElementById('appTitle');
  domCache.viewTogglePlanner = document.getElementById('viewTogglePlanner');
  domCache.viewToggleAudit = document.getElementById('viewToggleAudit');
  domCache.viewToggleLife = document.getElementById('viewToggleLife');
  domCache.plannerContent = document.getElementById('plannerContent');
  domCache.auditContent = document.getElementById('auditContent');
  domCache.lifeContent = document.getElementById('lifeContent');

  if (domCache.appTitle) {
    domCache.appTitle.textContent = state.title || 'My Year';
    domCache.appTitle.addEventListener('blur', function () {
      var t = this.textContent.trim();
      state.title = t || 'My Year';
      if (!t) this.textContent = 'My Year';
      savePrefs();
    });
    domCache.appTitle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
    });
  }

  if (typeof CalendarPlanner.renderMonths === 'function') CalendarPlanner.renderMonths();
  if (typeof CalendarPlanner.setWeekStart === 'function') CalendarPlanner.setWeekStart(state.weekStart);
  switchView('planner');

  if (domCache.viewTogglePlanner) domCache.viewTogglePlanner.addEventListener('click', function () { switchView('planner'); });
  if (domCache.viewToggleAudit) domCache.viewToggleAudit.addEventListener('click', function () { switchView('audit'); });
  if (domCache.viewToggleLife) domCache.viewToggleLife.addEventListener('click', function () { switchView('life'); });

  if (typeof CalendarPlanner.plannerInit === 'function') CalendarPlanner.plannerInit();
  if (typeof CalendarPlanner.auditInit === 'function') CalendarPlanner.auditInit();
  if (typeof CalendarPlanner.perspectiveInit === 'function') CalendarPlanner.perspectiveInit();
}

CalendarPlanner.debounce = debounce;
CalendarPlanner.state = state;
CalendarPlanner.getPrefs = getPrefs;
CalendarPlanner.savePrefs = savePrefs;
CalendarPlanner.getEvents = getEvents;
CalendarPlanner.saveEvents = saveEvents;
CalendarPlanner.getCategories = getCategories;
CalendarPlanner.saveCategories = saveCategories;
CalendarPlanner.getCategory = getCategory;
CalendarPlanner.isMindsetCategoryId = isMindsetCategoryId;
CalendarPlanner.dateKey = dateKey;
CalendarPlanner.isToday = isToday;
CalendarPlanner.daysInMonth = daysInMonth;
CalendarPlanner.firstDayOfMonth = firstDayOfMonth;
CalendarPlanner.escapeHtml = escapeHtml;
CalendarPlanner.switchView = switchView;
CalendarPlanner.init = init;
CalendarPlanner.MONTH_NAMES = MONTH_NAMES;
CalendarPlanner.WEEKDAYS_SUN = WEEKDAYS_SUN;
CalendarPlanner.WEEKDAYS_MON = WEEKDAYS_MON;
CalendarPlanner.STORAGE_KEY = STORAGE_KEY;
CalendarPlanner.PREFS_KEY = PREFS_KEY;
CalendarPlanner.CATEGORIES_STORAGE_KEY = CATEGORIES_STORAGE_KEY;
CalendarPlanner.DEFAULT_CATEGORIES = DEFAULT_CATEGORIES;
CalendarPlanner._dom = domCache;

window.CalendarPlanner = CalendarPlanner;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
