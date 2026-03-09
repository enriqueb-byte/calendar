'use strict';

/**
 * Calendar Planner 2.0 — Core (app.js)
 * State, storage (prefs/events/categories), date helpers, switchView, init.
 * View scripts (plan.js, audit.js, reflect.js) attach renderMonths, setWeekStart, planInit, etc.
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

/* Category colours: Community #2563eb (blue), Family #16a34a (green), Health #EA4335 (red), Spirit #7c3aed (purple), Work #6b7280 (grey). */
var DEFAULT_CATEGORIES = [
  { id: 'community', label: 'Community', color: '#2563eb' },
  { id: 'family', label: 'Family', color: '#16a34a' },
  { id: 'health', label: 'Health', color: '#EA4335' },
  { id: 'spirit', label: 'Spirit', color: '#7c3aed' },
  { id: 'work', label: 'Work', color: '#6b7280' }
];

var STORAGE_KEY = 'calendar-planner-events';
var PREFS_KEY = 'calendar-planner-prefs';
var CATEGORIES_STORAGE_KEY = 'calendar-planner-categories';

var state = {
  viewMode: 'plan',
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
  waypostStatuses: {},
  generalEventStatuses: {},
  year: new Date().getFullYear(),
  startMonth: 0,
  weekStart: 0,
  viewStyle: 4,
  durationMonths: 12,
  holidaySet: 'none',
  hidePastMonths: false,
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

function isMindsetCategoryId(id) { return id === 'misogi' || id === '8weekwin' || id === 'winningheat'; }
function getFirstStandardCategoryId() {
  var c = state.categories.find(function (cat) { return !isMindsetCategoryId(cat.id); });
  return c ? c.id : (DEFAULT_CATEGORIES[0] && DEFAULT_CATEGORIES[0].id) || 'community';
}
function migrateEventsToTags() {
  var changed = false;
  var standardId = getFirstStandardCategoryId();
  for (var dk in state.events) {
    var list = state.events[dk];
    if (!list || !list.length) continue;
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (ev.category === 'misogi') {
        ev.isMisogi = true;
        ev.category = standardId;
        changed = true;
      } else if (ev.category === '8weekwin' || ev.category === 'winningheat') {
        ev.isWaypost = true;
        ev.category = standardId;
        changed = true;
      }
    }
  }
  return changed;
}
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
if (c.id === '8weekwin') c.label = 'Mini-Adventure';
    if (c.id === 'winningheat') c.label = 'Mini-Adventure';
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
    var viewMode = (p.viewMode === 'plan' || p.viewMode === 'audit' || p.viewMode === 'reflect') ? p.viewMode : undefined;
    return { weekStart: p.weekStart, viewStyle: p.viewStyle, startMonth: p.startMonth, durationMonths: p.durationMonths, year: p.year, holidaySet: p.holidaySet, hidePastMonths: p.hidePastMonths, title: p.title, misogiTitle: p.misogiTitle, misogiWho: p.misogiWho, misogiWhere: p.misogiWhere, misogiDescription: p.misogiDescription, misogiWhatSetsApart: p.misogiWhatSetsApart, misogiPreparation: p.misogiPreparation, misogiOutcome: p.misogiOutcome, misogiLessons: p.misogiLessons, misogiPhoto: p.misogiPhoto, misogiImages: p.misogiImages, misogiQualified: p.misogiQualified, waypostStatuses: p.waypostStatuses, generalEventStatuses: (p.generalEventStatuses && typeof p.generalEventStatuses === 'object') ? p.generalEventStatuses : {}, lifeDateOfBirth: p.lifeDateOfBirth, lifeGender: p.lifeGender, lifeExpectancyOverride: p.lifeExpectancyOverride, lifeExpectancyOverrideActive: p.lifeExpectancyOverrideActive, lifeChildren: Array.isArray(p.lifeChildren) ? p.lifeChildren.slice() : [], lifeHasChildren: p.lifeHasChildren === true, lifeParents: Array.isArray(p.lifeParents) ? p.lifeParents.slice() : [], lifeHasLivingParents: p.lifeHasLivingParents === true, lifeMilestones: Array.isArray(p.lifeMilestones) ? p.lifeMilestones.slice() : [], viewMode: viewMode };
  } catch (e) {
    return {};
  }
}

function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ weekStart: state.weekStart, viewStyle: state.viewStyle, startMonth: state.startMonth, durationMonths: state.durationMonths, year: state.year, holidaySet: state.holidaySet, hidePastMonths: state.hidePastMonths, title: state.title, misogiTitle: state.misogiTitle, misogiWho: state.misogiWho, misogiWhere: state.misogiWhere, misogiDescription: state.misogiDescription, misogiWhatSetsApart: state.misogiWhatSetsApart, misogiPreparation: state.misogiPreparation, misogiOutcome: state.misogiOutcome, misogiLessons: state.misogiLessons, misogiPhoto: state.misogiPhoto, misogiImages: state.misogiImages, misogiQualified: state.misogiQualified, waypostStatuses: state.waypostStatuses, generalEventStatuses: state.generalEventStatuses, lifeDateOfBirth: state.lifeDateOfBirth, lifeGender: state.lifeGender, lifeExpectancyOverride: state.lifeExpectancyOverride, lifeExpectancyOverrideActive: state.lifeExpectancyOverrideActive, lifeChildren: state.lifeChildren.slice(), lifeHasChildren: state.lifeHasChildren, lifeParents: state.lifeParents.slice(), lifeHasLivingParents: state.lifeHasLivingParents, lifeMilestones: state.lifeMilestones.slice(), viewMode: state.viewMode }));
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

/**
 * Switch active view: show one section, hide the other two; update tab aria-pressed.
 * @param {string} mode - 'plan' | 'audit' | 'reflect'
 */
function switchView(mode) {
  state.viewMode = mode;

  var viewPlan = document.getElementById('view-plan');
  var viewAudit = document.getElementById('view-audit');
  var viewReflect = document.getElementById('view-reflect');
  var btnPlan = document.getElementById('viewTogglePlan');
  var btnAudit = document.getElementById('viewToggleAudit');
  var btnReflect = document.getElementById('viewToggleReflect');

  if (mode !== 'plan') {
    if (typeof CalendarPlanner.closeSidebarDrawer === 'function') CalendarPlanner.closeSidebarDrawer();
    document.body.style.overflow = '';
  }

  if (viewPlan) viewPlan.hidden = mode !== 'plan';
  if (viewAudit) viewAudit.hidden = mode !== 'audit';
  if (viewReflect) viewReflect.hidden = mode !== 'reflect';

  document.body.classList.toggle('view-plan-active', mode === 'plan');

  if (btnPlan) btnPlan.setAttribute('aria-pressed', mode === 'plan' ? 'true' : 'false');
  if (btnAudit) btnAudit.setAttribute('aria-pressed', mode === 'audit' ? 'true' : 'false');
  if (btnReflect) btnReflect.setAttribute('aria-pressed', mode === 'reflect' ? 'true' : 'false');

  if (mode === 'audit' && typeof CalendarPlanner.renderAuditDashboard === 'function') {
    CalendarPlanner.renderAuditDashboard();
  }
  if (mode === 'reflect' && typeof CalendarPlanner.renderReflectDashboard === 'function') {
    CalendarPlanner.renderReflectDashboard();
  }
  if (typeof savePrefs === 'function') savePrefs();
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
  if (prefs.holidaySet !== undefined && (prefs.holidaySet === 'none' || prefs.holidaySet === 'canada' || prefs.holidaySet === 'usa')) state.holidaySet = prefs.holidaySet;
  if (prefs.hidePastMonths !== undefined) state.hidePastMonths = !!prefs.hidePastMonths;
  if (prefs.viewMode === 'plan' || prefs.viewMode === 'audit' || prefs.viewMode === 'reflect') state.viewMode = prefs.viewMode;
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
  if (prefs.waypostStatuses && typeof prefs.waypostStatuses === 'object') {
    state.waypostStatuses = prefs.waypostStatuses;
    for (var rk in state.waypostStatuses) { if (state.waypostStatuses[rk] === 'overridden') state.waypostStatuses[rk] = 'cancelled'; }
  }
  if (prefs.generalEventStatuses && typeof prefs.generalEventStatuses === 'object') state.generalEventStatuses = prefs.generalEventStatuses;
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
  if (migrateEventsToTags()) saveEvents(state.events);

  var appTitle = document.getElementById('appTitle');
  if (appTitle) {
    appTitle.textContent = state.title || 'My Year';
    appTitle.addEventListener('blur', function () {
      var t = this.textContent.trim();
      state.title = t || 'My Year';
      if (!t) this.textContent = 'My Year';
      savePrefs();
    });
    appTitle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
    });
  }

  if (typeof CalendarPlanner.renderMonths === 'function') CalendarPlanner.renderMonths();
  if (typeof CalendarPlanner.setWeekStart === 'function') CalendarPlanner.setWeekStart(state.weekStart);
  switchView(state.viewMode);

  var btnPlan = document.getElementById('viewTogglePlan');
  var btnAudit = document.getElementById('viewToggleAudit');
  var btnReflect = document.getElementById('viewToggleReflect');
  if (btnPlan) btnPlan.addEventListener('click', function () { switchView('plan'); });
  if (btnAudit) btnAudit.addEventListener('click', function () { switchView('audit'); });
  if (btnReflect) btnReflect.addEventListener('click', function () { switchView('reflect'); });

  if (typeof CalendarPlanner.planInit === 'function') CalendarPlanner.planInit();
  if (typeof CalendarPlanner.auditInit === 'function') CalendarPlanner.auditInit();
  if (typeof CalendarPlanner.reflectInit === 'function') CalendarPlanner.reflectInit();
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
CalendarPlanner.getFirstStandardCategoryId = getFirstStandardCategoryId;
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
window.CalendarPlanner = CalendarPlanner;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  setTimeout(init, 0);
}
