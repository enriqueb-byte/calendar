(function () {
  'use strict';

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const CATEGORIES = [
    { id: 'work', label: 'Work', color: '#2563eb', bg: 'bg-blue-500' },
    { id: 'personal', label: 'Personal', color: '#16a34a', bg: 'bg-green-500' },
    { id: 'health', label: 'Health', color: '#dc2626', bg: 'bg-red-500' },
    { id: 'travel', label: 'Travel', color: '#ca8a04', bg: 'bg-amber-500' },
    { id: 'other', label: 'Other', color: '#6b7280', bg: 'bg-gray-500' },
  ];

  const STORAGE_KEY = 'calendar-planner-events';

  let state = {
    year: new Date().getFullYear(),
    events: {},
    selectedDateKey: null,
  };

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
    return `${year}-${m}-${d}`;
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
    for (let i = 0; i < first; i++) cells.push({ empty: true });
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

  function renderMonths() {
    const grid = document.getElementById('monthsGrid');
    const year = state.year;
    document.getElementById('yearTitle').textContent = year;

    grid.innerHTML = MONTH_NAMES.map((name, month) => {
      const cells = buildMonthData(year, month);
      const eventsForMonth = state.events;
      const rows = [];
      for (let i = 0; i < cells.length; i += 7) {
        const week = cells.slice(i, i + 7);
        rows.push(
          '<div class="grid grid-cols-7 gap-0.5 sm:gap-1">' +
          week.map((cell) => {
            if (cell.empty) {
              return '<div class="day-cell empty"></div>';
            }
            const dayEvents = (eventsForMonth[cell.dateKey] || []);
            const todayClass = cell.today ? ' today' : '';
            const dots = dayEvents.slice(0, 3).map((ev) => {
              const cat = CATEGORIES.find((c) => c.id === ev.category) || CATEGORIES[0];
              return `<span class="event-dot" style="background-color:${cat.color}" title="${escapeHtml(ev.title)}"></span>`;
            }).join('');
            return (
              '<div class="day-cell' + todayClass + '" data-date="' + cell.dateKey + '" role="button" tabindex="0">' +
              '<div class="flex items-center justify-between gap-0.5">' +
              '<span class="font-medium">' + cell.day + '</span>' +
              (dots ? '<div class="flex gap-0.5">' + dots + '</div>' : '') +
              '</div></div>'
            );
          }).join('') +
          '</div>'
        );
      }).join('');

      return (
        '<article class="month-card bg-white rounded-xl border border-ink-200 shadow-sm overflow-hidden print:shadow-none print:border-ink-300">' +
        '<div class="px-3 py-2 sm:px-4 sm:py-3 border-b border-ink-200 bg-ink-50/80">' +
        '<h2 class="text-sm sm:text-base font-semibold text-ink-800">' + name + ' ' + year + '</h2>' +
        '</div>' +
        '<div class="p-2 sm:p-3">' +
        '<div class="grid grid-cols-7 gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-ink-500 font-medium mb-1">' +
        WEEKDAYS.map((w) => '<span class="text-center">' + w + '</span>').join('') +
        '</div>' +
        rows +
        '</div></article>'
      );
    }).join('');
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function openModal(dateKey, existingEventIndex) {
    state.selectedDateKey = dateKey;
    document.getElementById('eventDateKey').value = dateKey;
    document.getElementById('modalTitle').textContent = existingEventIndex != null ? 'Edit event' : 'Add event';
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventTitle').focus();

    const eventsOnDay = state.events[dateKey] || [];
    const existing = existingEventIndex != null ? eventsOnDay[existingEventIndex] : null;

    const options = document.getElementById('categoryOptions');
    options.innerHTML = CATEGORIES.map((cat) => {
      const checked = existing && existing.category === cat.id;
      return (
        '<label class="inline-flex items-center gap-1.5 cursor-pointer">' +
        '<input type="radio" name="category" value="' + cat.id + '" ' + (checked ? 'checked' : '') + ' class="rounded-full border-ink-300 text-ink-700 focus:ring-accent-500"/>' +
        '<span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color:' + cat.color + '"></span>' +
        '<span class="text-sm text-ink-700">' + escapeHtml(cat.label) + '</span></label>'
      );
    }).join('');

    if (existing) {
      document.getElementById('eventTitle').value = existing.title;
      document.getElementById('modalDelete').classList.remove('hidden');
    } else {
      document.getElementById('modalDelete').classList.add('hidden');
    }

    document.getElementById('eventModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    document.getElementById('eventModal').classList.add('hidden');
    document.body.style.overflow = '';
    state.selectedDateKey = null;
  }

  function getSelectedCategory() {
    const radio = document.querySelector('input[name="category"]:checked');
    return radio ? radio.value : CATEGORIES[0].id;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const dateKey = document.getElementById('eventDateKey').value;
    const title = document.getElementById('eventTitle').value.trim();
    if (!title) return;
    const category = getSelectedCategory();
    const list = state.events[dateKey] ? [...state.events[dateKey]] : [];
    const isEdit = !document.getElementById('modalDelete').classList.contains('hidden');
    if (isEdit) {
      list[0] = { title, category };
    } else {
      list.push({ title, category });
    }
    state.events[dateKey] = list;
    saveEvents(state.events);
    renderMonths();
    closeModal();
  }

  function handleDelete() {
    const dateKey = document.getElementById('eventDateKey').value;
    delete state.events[dateKey];
    saveEvents(state.events);
    renderMonths();
    closeModal();
  }

  function delegateClick(e) {
    const cell = e.target.closest('.day-cell[data-date]');
    if (!cell || cell.classList.contains('empty')) return;
    const dateKey = cell.getAttribute('data-date');
    const hasEvents = (state.events[dateKey] || []).length > 0;
    openModal(dateKey, hasEvents ? 0 : null);
  }

  function exportLayout(layout) {
    document.body.setAttribute('data-print-layout', String(layout));
    document.getElementById('exportDropdown').classList.add('hidden');
    setTimeout(function () {
      window.print();
    }, 100);
  }

  function initExportDropdown() {
    const btn = document.getElementById('exportBtn');
    const panel = document.getElementById('exportDropdown');
    btn.addEventListener('click', function () {
      panel.classList.toggle('hidden');
    });
    document.querySelectorAll('.export-option').forEach(function (el) {
      el.addEventListener('click', function () {
        exportLayout(Number(this.getAttribute('data-layout')));
      });
    });
    document.addEventListener('click', function (e) {
      if (!document.getElementById('exportDropdownWrap').contains(e.target)) {
        panel.classList.add('hidden');
      }
    });
  }

  function init() {
    state.events = getEvents();
    renderMonths();

    document.getElementById('monthsGrid').addEventListener('click', delegateClick);
    document.getElementById('eventForm').addEventListener('submit', handleSubmit);
    document.getElementById('modalCancel').addEventListener('click', closeModal);
    document.getElementById('modalDelete').addEventListener('click', handleDelete);
    document.getElementById('modalBackdrop').addEventListener('click', closeModal);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    initExportDropdown();
  }

  init();
})();
