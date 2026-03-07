'use strict';

/**
 * Calendar Planner 2.0 — Reflect (reflect.js)
 * Contract: Expects window.CalendarPlanner with state, savePrefs, escapeHtml, debounce.
 * Exposes: renderReflectDashboard, reflectInit.
 */
var CP = window.CalendarPlanner;
var state = CP.state;
var savePrefs = CP.savePrefs;

function lifeEscapeHtml(s) {
  if (s == null) return '';
  if (CP.escapeHtml && typeof CP.escapeHtml === 'function') return CP.escapeHtml(s);
  var div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

var reflectDomCache = {};
var renderLifeDashboardDebounced = CP.debounce ? CP.debounce(function () { renderLifeDashboard(); }, 120) : function () { renderLifeDashboard(); };

function getLifeExpectancyYears(gender) {
  return gender === 'female' ? 81 : 76;
}

function getEffectiveLifeExpectancyYears(gender) {
  if (state.lifeExpectancyOverrideActive) {
    var ov = state.lifeExpectancyOverride;
    if (ov != null && typeof ov === 'number' && ov >= 1 && ov <= 120) return Math.floor(ov);
  }
  return getLifeExpectancyYears(gender);
}

function weeksLived(dobStr) {
  if (!dobStr || dobStr.length < 10) return 0;
  var birth = new Date(dobStr);
  if (isNaN(birth.getTime())) return 0;
  var now = new Date();
  if (birth >= now) return 0;
  var ms = now - birth;
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

function weeksRemaining(dobStr, gender) {
  if (!dobStr || dobStr.length < 10) return null;
  var birth = new Date(dobStr);
  if (isNaN(birth.getTime())) return null;
  var expectYears = getEffectiveLifeExpectancyYears(gender);
  var death = new Date(birth);
  death.setFullYear(death.getFullYear() + expectYears);
  var now = new Date();
  if (now >= death) return 0;
  var ms = death - now;
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

function summersLeft(dobStr, gender) {
  var rem = weeksRemaining(dobStr, gender);
  if (rem == null) return null;
  return Math.floor(rem / 52);
}

function currentAgeYears(dob) {
  if (!dob || dob.length < 10) return null;
  var birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  var now = new Date();
  var age = now.getFullYear() - birth.getFullYear();
  var m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age < 0 ? 0 : age;
}

function getYoungestChildDob() {
  if (!state.lifeHasChildren) return null;
  var list = state.lifeChildren || [];
  if (list.length === 0) return null;
  var valid = list.filter(function (d) { return d && d.length >= 10; });
  if (valid.length === 0) return null;
  return valid.reduce(function (a, b) { return a > b ? a : b; });
}

function getSummersWithParentsUntil80() {
  var list = state.lifeParents || [];
  if (list.length === 0) return null;
  var now = new Date();
  var minSummers = null;
  for (var i = 0; i < list.length; i++) {
    var d = list[i];
    if (!d || d.length < 10) continue;
    var birth = new Date(d);
    if (isNaN(birth.getTime())) continue;
    var age = now.getFullYear() - birth.getFullYear();
    var m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    var summers = 80 - age;
    if (summers < 0) summers = 0;
    if (minSummers === null || summers < minSummers) minSummers = summers;
  }
  return minSummers;
}

function monthsLived(dob) {
  if (!dob || dob.length < 10) return -1;
  var birth = new Date(dob);
  if (isNaN(birth.getTime())) return -1;
  var now = new Date();
  return (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
}

function monthsRemaining(dob, gender) {
  if (!dob || dob.length < 10) return null;
  var birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  var expectYears = getEffectiveLifeExpectancyYears(gender);
  var totalMonths = expectYears * 12;
  var lived = monthsLived(dob);
  if (lived < 0) return null;
  var remaining = totalMonths - lived;
  return remaining < 0 ? 0 : remaining;
}

function renderSeasonsDashboard() {
  var dob = state.lifeDateOfBirth || '';
  var age = dob ? currentAgeYears(dob) : null;
  var youngestChildDob = getYoungestChildDob();
  var childAgeYears = null;
  if (youngestChildDob) {
    var childBirth = new Date(youngestChildDob);
    if (!isNaN(childBirth.getTime())) {
      var now = new Date();
      childAgeYears = now.getFullYear() - childBirth.getFullYear();
      var m = now.getMonth() - childBirth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < childBirth.getDate())) childAgeYears--;
    }
  }
  var peakStatus = age == null ? 'inactive' : age < 25 ? 'onTheWay' : age <= 55 ? 'active' : 'inactive';
  var superheroStatus = !state.lifeHasChildren ? 'inactive' : !youngestChildDob ? 'onTheWay' : childAgeYears == null ? 'inactive' : childAgeYears < 12 ? 'active' : 'inactive';
  var explorerStatus = age == null ? 'inactive' : age < 70 ? 'active' : 'inactive';
  var wisdomStatus = age == null ? 'inactive' : age >= 60 ? 'active' : 'onTheWay';
  var summersWithParents = state.lifeHasLivingParents ? getSummersWithParentsUntil80() : null;
  var multiGenStatus = !state.lifeHasLivingParents || summersWithParents === null ? 'inactive' : summersWithParents > 0 ? 'active' : 'inactive';
  var highImpactStatus = age == null ? 'inactive' : age < 50 ? 'active' : 'inactive';
  var neuroPlasticStatus = age == null ? 'inactive' : age < 45 ? 'active' : 'inactive';

  function setSeasonRow(descEl, valueEl, description, value) {
    if (descEl) descEl.textContent = description;
    if (valueEl) valueEl.textContent = value;
  }
  var peakEl = document.getElementById('seasonsPeakOutput');
  var peakVal = document.getElementById('seasonsPeakValue');
  if (peakEl || peakVal) {
    if (age == null) {
      setSeasonRow(peakEl, peakVal, 'Enter your date of birth in Facts.', '—');
    } else if (age < 25) {
      setSeasonRow(peakEl, peakVal, 'Your 30-year peak work and physical output window (ages 25–55).', String(25 - age) + ' yr');
    } else if (age <= 55) {
      setSeasonRow(peakEl, peakVal, 'Your peak work and physical output window.', String(55 - age) + ' yr');
    } else {
      setSeasonRow(peakEl, peakVal, 'You have passed the Peak Output window (25–55).', '—');
    }
  }

  var superheroEl = document.getElementById('seasonsSuperhero');
  var superheroVal = document.getElementById('seasonsSuperheroValue');
  if (superheroEl || superheroVal) {
    if (!state.lifeHasChildren) {
      setSeasonRow(superheroEl, superheroVal, 'If you have children, add your youngest\'s birth date in Facts to see this window.', '—');
    } else if (!youngestChildDob) {
      setSeasonRow(superheroEl, superheroVal, 'Add your youngest child\'s birth date in Facts.', '—');
    } else {
      var childBirth = new Date(youngestChildDob);
      if (isNaN(childBirth.getTime())) {
        setSeasonRow(superheroEl, superheroVal, 'Add your youngest child\'s birth date in Facts.', '—');
      } else {
        var now = new Date();
        var childAgeYearsVal = now.getFullYear() - childBirth.getFullYear();
        var m = now.getMonth() - childBirth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < childBirth.getDate())) childAgeYearsVal--;
        if (childAgeYearsVal >= 12) {
          setSeasonRow(superheroEl, superheroVal, 'The Superhero Phase (0–12) is complete for your youngest.', '—');
        } else {
          var yearsLeft = 12 - childAgeYearsVal;
          setSeasonRow(superheroEl, superheroVal, 'Years with young kids (0–12). Make them count.', String(yearsLeft) + ' yr');
        }
      }
    }
  }

  var explorerEl = document.getElementById('seasonsExplorer');
  var explorerVal = document.getElementById('seasonsExplorerValue');
  if (explorerEl || explorerVal) {
    if (age == null) {
      setSeasonRow(explorerEl, explorerVal, 'Enter your date of birth in Facts.', '—');
    } else {
      var yearsTo70 = 70 - age;
      if (yearsTo70 < 0) yearsTo70 = 0;
      setSeasonRow(explorerEl, explorerVal, 'Full-mobility travel window.', String(yearsTo70) + ' yr');
    }
  }

  var wisdomEl = document.getElementById('seasonsWisdom');
  var wisdomVal = document.getElementById('seasonsWisdomValue');
  if (wisdomEl || wisdomVal) {
    if (age == null) {
      setSeasonRow(wisdomEl, wisdomVal, 'Enter your date of birth in Facts.', '—');
    } else if (age < 60) {
      setSeasonRow(wisdomEl, wisdomVal, 'Mentorship and legacy phase ahead.', String(60 - age) + ' yr');
    } else {
      setSeasonRow(wisdomEl, wisdomVal, 'You are in the Wisdom Transition (mentorship & legacy).', 'Now');
    }
  }

  var multiGenEl = document.getElementById('seasonsMultiGen');
  var multiGenVal = document.getElementById('seasonsMultiGenValue');
  if (multiGenEl || multiGenVal) {
    if (!state.lifeHasLivingParents) {
      setSeasonRow(multiGenEl, multiGenVal, 'If you have living parents, check the box in Facts and add their birth dates to see this window.', '—');
    } else if (summersWithParents === null) {
      setSeasonRow(multiGenEl, multiGenVal, 'Add at least one parent birth date in Facts.', '—');
    } else if (summersWithParents === 0) {
      setSeasonRow(multiGenEl, multiGenVal, 'Shared-mobility window (to 80) complete for your parents.', '—');
    } else {
      setSeasonRow(multiGenEl, multiGenVal, 'Estimated years of shared mobility with your parents.', String(summersWithParents) + ' yr');
    }
  }

  var highImpactEl = document.getElementById('seasonsHighImpact');
  var highImpactVal = document.getElementById('seasonsHighImpactValue');
  if (highImpactEl || highImpactVal) {
    if (age == null) {
      setSeasonRow(highImpactEl, highImpactVal, 'Enter your date of birth in Facts.', '—');
    } else if (age < 50) {
      setSeasonRow(highImpactEl, highImpactVal, 'Peak joint integrity. Do the hard stuff now.', String(50 - age) + ' yr');
    } else {
      setSeasonRow(highImpactEl, highImpactVal, 'You\'ve passed the peak joint integrity window (50).', '—');
    }
  }

  var neuroPlasticEl = document.getElementById('seasonsNeuroPlastic');
  var neuroPlasticVal = document.getElementById('seasonsNeuroPlasticValue');
  if (neuroPlasticEl || neuroPlasticVal) {
    if (age == null) {
      setSeasonRow(neuroPlasticEl, neuroPlasticVal, 'Enter your date of birth in Facts.', '—');
    } else if (age < 45) {
      var yearsLeft = 45 - age;
      setSeasonRow(neuroPlasticEl, neuroPlasticVal, 'Peak new-skill acquisition. Don\'t waste the bandwidth.', String(yearsLeft) + ' yr');
    } else {
      setSeasonRow(neuroPlasticEl, neuroPlasticVal, 'You\'ve passed the Neuro-Plastic Window (45).', '—');
    }
  }

  var cards = [
    document.getElementById('seasonsCardPeak'),
    document.getElementById('seasonsCardSuperhero'),
    document.getElementById('seasonsCardExplorer'),
    document.getElementById('seasonsCardWisdom'),
    document.getElementById('seasonsCardMultiGen'),
    document.getElementById('seasonsCardHighImpact'),
    document.getElementById('seasonsCardNeuroPlastic')
  ];
  var statuses = [peakStatus, superheroStatus, explorerStatus, wisdomStatus, multiGenStatus, highImpactStatus, neuroPlasticStatus];
  var vitalityBlock = document.getElementById('seasonsActiveVitalityBlock');
  var connectionBlock = document.getElementById('seasonsActiveConnectionBlock');
  var growthBlock = document.getElementById('seasonsActiveGrowthBlock');
  var vitalitySection = document.getElementById('seasonsActiveVitality');
  var connectionSection = document.getElementById('seasonsActiveConnection');
  var growthSection = document.getElementById('seasonsActiveGrowth');
  var inactiveContent = document.getElementById('seasonsInactiveContent');
  var activeSection = document.getElementById('seasonsActiveSection');
  var inactiveSection = document.getElementById('seasonsInactiveSection');
  var inactiveLabel = document.getElementById('seasonsInactiveLabel');
  var activeCount = 0;
  var inactiveTotalCount = 0;
  var vitalityOrder = [0, 5, 2];
  var connectionOrder = [1, 4];
  var growthOrder = [6, 3];
  var i, card, status;
  for (i = 0; i < cards.length; i++) {
    card = cards[i];
    if (!card) continue;
    status = statuses[i];
    card.classList.remove('season-active', 'season-inactive', 'season-on-the-way');
    if (status === 'active') {
      card.classList.add('season-active');
      activeCount++;
    } else {
      if (status === 'onTheWay') card.classList.add('season-on-the-way');
      else card.classList.add('season-inactive');
      if (inactiveContent) inactiveContent.appendChild(card);
      inactiveTotalCount++;
    }
  }
  if (vitalityBlock) {
    for (i = 0; i < vitalityOrder.length; i++) {
      var idx = vitalityOrder[i];
      if (cards[idx] && statuses[idx] === 'active') vitalityBlock.appendChild(cards[idx]);
    }
    if (vitalitySection) vitalitySection.classList.toggle('hidden', vitalityBlock.children.length === 0);
  }
  if (connectionBlock) {
    for (i = 0; i < connectionOrder.length; i++) {
      idx = connectionOrder[i];
      if (cards[idx] && statuses[idx] === 'active') connectionBlock.appendChild(cards[idx]);
    }
    if (connectionSection) connectionSection.classList.toggle('hidden', connectionBlock.children.length === 0);
  }
  if (growthBlock) {
    for (i = 0; i < growthOrder.length; i++) {
      idx = growthOrder[i];
      if (cards[idx] && statuses[idx] === 'active') growthBlock.appendChild(cards[idx]);
    }
    if (growthSection) growthSection.classList.toggle('hidden', growthBlock.children.length === 0);
  }
  if (activeSection) activeSection.classList.toggle('hidden', activeCount === 0);
  if (inactiveSection) {
    inactiveSection.classList.toggle('hidden', inactiveTotalCount === 0);
    if (inactiveLabel) inactiveLabel.textContent = inactiveTotalCount > 0 ? 'Inactive (' + inactiveTotalCount + ')' : 'Inactive';
  }
}

function renderLifeChildren() {
  var listEl = document.getElementById('lifeChildrenList');
  if (!listEl) return;
  var list = state.lifeChildren || [];
  var html = [];
  for (var i = 0; i < list.length; i++) {
    var val = list[i] || '';
    var safeVal = lifeEscapeHtml(val);
    var valueAttr = val ? ' value="' + safeVal + '"' : '';
    html.push('<div class="flex flex-wrap items-end gap-2" data-child-index="' + i + '"><div class="min-w-0 flex-1" style="min-width: 7rem;"><label class="block text-xs font-medium text-ink-700 mb-0.5">Birthday</label><input type="date" class="life-child-dob w-full px-2 py-1.5 rounded border border-ink-200 text-ink-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500" data-child-index="' + i + '"' + valueAttr + ' aria-label="Child ' + (i + 1) + ' birthday" /></div><button type="button" class="life-remove-child text-xs text-ink-500 hover:text-red-600 px-2 py-1 rounded" data-remove-index="' + i + '" aria-label="Remove child ' + (i + 1) + '">Remove</button></div>');
  }
  listEl.innerHTML = html.join('');
}

function renderLifeParents() {
  var listEl = document.getElementById('lifeParentsList');
  if (!listEl) return;
  var list = state.lifeParents || [];
  var html = [];
  for (var i = 0; i < list.length; i++) {
    var val = list[i] || '';
    var safeVal = lifeEscapeHtml(val);
    var valueAttr = val ? ' value="' + safeVal + '"' : '';
    html.push('<div class="flex flex-wrap items-end gap-2" data-parent-index="' + i + '"><div class="min-w-0 flex-1" style="min-width: 7rem;"><label class="block text-xs font-medium text-ink-700 mb-0.5">Birthday</label><input type="date" class="life-parent-dob w-full px-2 py-1.5 rounded border border-ink-200 text-ink-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500" data-parent-index="' + i + '"' + valueAttr + ' aria-label="Parent ' + (i + 1) + ' birthday" /></div><button type="button" class="life-remove-parent text-xs text-ink-500 hover:text-red-600 px-2 py-1 rounded" data-remove-index="' + i + '" aria-label="Remove parent ' + (i + 1) + '">Remove</button></div>');
  }
  listEl.innerHTML = html.join('');
}

function renderLifeMilestones() {
  var listEl = document.getElementById('lifeMilestonesList');
  if (!listEl) return;
  var list = state.lifeMilestones || [];
  var sorted = list.slice().sort(function (a, b) {
    var da = (a.date || '').trim();
    var db = (b.date || '').trim();
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db.localeCompare(da); /* newest first (YYYY-MM-DD string compare) */
  });
  var html = [];
  for (var i = 0; i < sorted.length; i++) {
    var m = sorted[i];
    var id = m.id || 'milestone-' + i;
    var desc = (m.description || '').trim();
    var dateVal = (m.date || '').trim();
    var safeDesc = lifeEscapeHtml(desc);
    var safeDate = lifeEscapeHtml(dateVal);
    html.push(
      '<li class="flex flex-wrap items-center gap-2" data-milestone-id="' + lifeEscapeHtml(id) + '">' +
      '<input type="text" class="life-milestone-desc flex-1 min-w-0 px-2 py-1 rounded border border-ink-200 text-ink-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500" placeholder="Description" value="' + safeDesc + '" aria-label="Milestone description" />' +
      '<input type="date" class="life-milestone-date w-36 px-2 py-1 rounded border border-ink-200 text-ink-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500" value="' + safeDate + '" aria-label="Milestone date" />' +
      '<button type="button" class="life-remove-milestone text-xs text-ink-500 hover:text-red-600 px-2 py-1 rounded" data-milestone-id="' + lifeEscapeHtml(id) + '" aria-label="Remove milestone">Remove</button>' +
      '</li>'
    );
  }
  listEl.innerHTML = html.join('');
}

function getLifeMonthTooltip(dob, monthIndex) {
  if (!dob || monthIndex < 0) return '';
  var birth = new Date(dob);
  if (isNaN(birth.getTime())) return '';
  var d = new Date(birth.getFullYear(), birth.getMonth() + monthIndex, 1);
  var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return monthNames[d.getMonth()] + ' ' + d.getFullYear();
}

function renderLifeDashboard() {
  if (!reflectDomCache.lifeContent) reflectDomCache.lifeContent = document.getElementById('lifeContent');
  var lifeContent = reflectDomCache.lifeContent;
  if (!lifeContent) return;
  var dobInput = lifeContent.querySelector('#lifeDateOfBirth');
  var genderSelect = lifeContent.querySelector('#lifeGender');
  var clockEl = lifeContent.querySelector('#lifeClock');
  var scarcityEl = lifeContent.querySelector('#lifeScarcityNote');
  var wrapper = lifeContent.querySelector('#lifeGridWrapper');
  if (dobInput) dobInput.value = (state && state.lifeDateOfBirth) ? state.lifeDateOfBirth : '';
  if (genderSelect) genderSelect.value = (state && state.lifeGender) ? state.lifeGender : 'male';
  var expectancyInput = lifeContent.querySelector('#lifeExpectancyInput');
  var expectancyOverrideCheck = lifeContent.querySelector('#lifeExpectancyOverrideCheck');
  if (expectancyInput) {
    var active = state && state.lifeExpectancyOverrideActive;
    expectancyInput.disabled = !active;
    if (active) {
      expectancyInput.value = (state && state.lifeExpectancyOverride != null) ? String(state.lifeExpectancyOverride) : '';
    } else {
      expectancyInput.value = String(getLifeExpectancyYears((state && state.lifeGender) || 'male'));
    }
  }
  if (expectancyOverrideCheck) expectancyOverrideCheck.checked = !!(state && state.lifeExpectancyOverrideActive);
  var hasChildrenCheck = lifeContent.querySelector('#lifeHasChildrenCheck');
  var childrenBlock = lifeContent.querySelector('#lifeChildrenBlock');
  if (hasChildrenCheck) hasChildrenCheck.checked = !!(state && state.lifeHasChildren);
  if (childrenBlock) childrenBlock.classList.toggle('hidden', !(state && state.lifeHasChildren));
  var hasLivingParentsCheck = lifeContent.querySelector('#lifeHasLivingParentsCheck');
  var parentsBlock = lifeContent.querySelector('#lifeParentsBlock');
  if (hasLivingParentsCheck) hasLivingParentsCheck.checked = !!(state && state.lifeHasLivingParents);
  if (parentsBlock) parentsBlock.classList.toggle('hidden', !(state && state.lifeHasLivingParents));
  try {
    renderLifeChildren();
    renderLifeParents();
    renderLifeMilestones();
    renderSeasonsDashboard();
  } catch (e) {
    if (typeof console !== 'undefined' && console.error) console.error('Reflect: render error', e);
  }
  var dob = (state && state.lifeDateOfBirth) ? state.lifeDateOfBirth : '';
  var gender = (state && state.lifeGender) ? state.lifeGender : 'male';
  var monthsLivedVal = dob ? monthsLived(dob) : -1;
  var monthsRemainingVal = dob ? monthsRemaining(dob, gender) : null;
  var summers = summersLeft(dob, gender);
  if (clockEl) {
    if (dob && monthsLivedVal >= 0) {
      clockEl.textContent = (monthsRemainingVal != null)
        ? monthsLivedVal.toLocaleString() + ' Months Lived | ' + monthsRemainingVal.toLocaleString() + ' Months Remaining'
        : monthsLivedVal.toLocaleString() + ' Months Lived | — Months Remaining';
    } else {
      clockEl.textContent = '— Months Lived | — Months Remaining';
    }
  }
  if (scarcityEl) {
    if (summers != null && summers >= 0) {
      scarcityEl.textContent = 'You have roughly ' + summers + ' summers left. Make this year\'s Misogi count.';
    } else {
      scarcityEl.textContent = 'Enter your date of birth to see your life in months.';
    }
  }
  if (!wrapper) return;
  var currentMonthIndex = monthsLivedVal;
  var maxYears = 120;
  var expectYears = getEffectiveLifeExpectancyYears(gender);
  var totalMonths = Math.min(expectYears * 12, maxYears * 12);
  var numRows = Math.max(1, Math.ceil(totalMonths / 36));
  var cells = [];
  for (var i = 0; i < totalMonths; i++) {
    var className = 'life-month-cell';
    if (i < currentMonthIndex) className += ' lived';
    else if (i === currentMonthIndex) className += ' current';
    var title = getLifeMonthTooltip(dob, i);
    var titleAttr = title ? ' title="' + lifeEscapeHtml(title) + '"' : '';
    cells.push('<div class="' + className + '" role="presentation" data-month="' + i + '"' + titleAttr + '></div>');
  }
  wrapper.innerHTML = '<div class="life-months-grid" style="grid-template-rows: repeat(' + numRows + ', 1fr); aspect-ratio: 36/' + numRows + '">' + cells.join('') + '</div>';
  var progressBar = lifeContent.querySelector('#lifeHorizonProgressBar');
  var progressPct = lifeContent.querySelector('#lifeHorizonProgressPct');
  if (progressBar && progressPct) {
    if (totalMonths > 0 && currentMonthIndex >= 0) {
      var pct = Math.min(100, (currentMonthIndex / totalMonths) * 100);
      progressBar.style.width = pct.toFixed(1) + '%';
      progressPct.textContent = pct.toFixed(0) + '% complete';
    } else {
      progressBar.style.width = '0%';
      progressPct.textContent = '—%';
    }
  }
}

function reflectInit() {
  var lifeFactsToggle = document.getElementById('lifeFactsToggle');
  if (lifeFactsToggle) {
    lifeFactsToggle.addEventListener('click', function () {
      var content = document.getElementById('lifeFactsContent');
      var label = document.getElementById('lifeFactsToggleLabel');
      var expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      if (content) content.classList.toggle('hidden', expanded);
      if (label) label.textContent = expanded ? 'Show inputs' : 'Hide inputs';
    });
  }
  var lifeDob = document.getElementById('lifeDateOfBirth');
  var lifeGenderEl = document.getElementById('lifeGender');
  if (lifeDob) {
    lifeDob.addEventListener('change', function () {
      state.lifeDateOfBirth = this.value.trim();
      savePrefs();
      renderLifeDashboardDebounced();
    });
    lifeDob.addEventListener('blur', function () {
      state.lifeDateOfBirth = this.value.trim();
      savePrefs();
      renderLifeDashboardDebounced();
    });
  }
  if (lifeGenderEl) {
    lifeGenderEl.addEventListener('change', function () {
      state.lifeGender = this.value === 'female' ? 'female' : 'male';
      savePrefs();
      renderLifeDashboardDebounced();
    });
  }
  var lifeExpectancyOverrideCheckEl = document.getElementById('lifeExpectancyOverrideCheck');
  if (lifeExpectancyOverrideCheckEl) {
    lifeExpectancyOverrideCheckEl.addEventListener('change', function () {
      state.lifeExpectancyOverrideActive = this.checked;
      state.lifeExpectancyOverride = null;
      savePrefs();
      renderLifeDashboardDebounced();
    });
  }
  var lifeExpectancyInputEl = document.getElementById('lifeExpectancyInput');
  if (lifeExpectancyInputEl) {
    lifeExpectancyInputEl.addEventListener('change', function () {
      if (!state.lifeExpectancyOverrideActive) return;
      var val = this.value.trim();
      if (val === '') { state.lifeExpectancyOverride = null; } else {
        var n = parseInt(val, 10);
        state.lifeExpectancyOverride = (n >= 1 && n <= 120) ? n : null;
      }
      savePrefs();
      renderLifeDashboardDebounced();
    });
    lifeExpectancyInputEl.addEventListener('blur', function () {
      if (!state.lifeExpectancyOverrideActive) return;
      var val = this.value.trim();
      if (val === '') { state.lifeExpectancyOverride = null; } else {
        var n = parseInt(val, 10);
        state.lifeExpectancyOverride = (n >= 1 && n <= 120) ? n : null;
      }
      savePrefs();
      renderLifeDashboardDebounced();
    });
  }

  var lifeHasChildrenCheck = document.getElementById('lifeHasChildrenCheck');
  if (lifeHasChildrenCheck) {
    lifeHasChildrenCheck.addEventListener('change', function () {
      state.lifeHasChildren = this.checked;
      savePrefs();
      var block = document.getElementById('lifeChildrenBlock');
      if (block) block.classList.toggle('hidden', !state.lifeHasChildren);
      renderLifeDashboardDebounced();
    });
  }
  var lifeAddChildBtn = document.getElementById('lifeAddChildBtn');
  if (lifeAddChildBtn) {
    lifeAddChildBtn.addEventListener('click', function () {
      state.lifeChildren = (state.lifeChildren || []).concat('');
      savePrefs();
      renderLifeChildren();
      renderLifeDashboardDebounced();
    });
  }
  var lifeChildrenListEl = document.getElementById('lifeChildrenList');
  if (lifeChildrenListEl) {
    lifeChildrenListEl.addEventListener('change', function (e) {
      var input = e.target.closest('.life-child-dob');
      if (!input) return;
      var i = parseInt(input.getAttribute('data-child-index'), 10);
      if (isNaN(i) || i < 0) return;
      state.lifeChildren = state.lifeChildren || [];
      if (i >= state.lifeChildren.length) return;
      state.lifeChildren[i] = input.value.trim();
      savePrefs();
      renderLifeDashboardDebounced();
    });
    lifeChildrenListEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.life-remove-child');
      if (!btn) return;
      var i = parseInt(btn.getAttribute('data-remove-index'), 10);
      if (isNaN(i) || i < 0) return;
      state.lifeChildren = state.lifeChildren || [];
      state.lifeChildren.splice(i, 1);
      savePrefs();
      renderLifeChildren();
      renderLifeDashboardDebounced();
    });
  }
  var lifeHasLivingParentsCheck = document.getElementById('lifeHasLivingParentsCheck');
  if (lifeHasLivingParentsCheck) {
    lifeHasLivingParentsCheck.addEventListener('change', function () {
      state.lifeHasLivingParents = this.checked;
      savePrefs();
      var block = document.getElementById('lifeParentsBlock');
      if (block) block.classList.toggle('hidden', !state.lifeHasLivingParents);
      renderLifeDashboardDebounced();
    });
  }
  var lifeAddParentBtn = document.getElementById('lifeAddParentBtn');
  if (lifeAddParentBtn) {
    lifeAddParentBtn.addEventListener('click', function () {
      state.lifeParents = (state.lifeParents || []).concat('');
      savePrefs();
      renderLifeParents();
      renderLifeDashboardDebounced();
    });
  }
  var lifeParentsListEl = document.getElementById('lifeParentsList');
  if (lifeParentsListEl) {
    lifeParentsListEl.addEventListener('change', function (e) {
      var input = e.target.closest('.life-parent-dob');
      if (!input) return;
      var i = parseInt(input.getAttribute('data-parent-index'), 10);
      if (isNaN(i) || i < 0) return;
      state.lifeParents = state.lifeParents || [];
      if (i >= state.lifeParents.length) return;
      state.lifeParents[i] = input.value.trim();
      savePrefs();
      renderLifeDashboardDebounced();
    });
    lifeParentsListEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.life-remove-parent');
      if (!btn) return;
      var i = parseInt(btn.getAttribute('data-remove-index'), 10);
      if (isNaN(i) || i < 0) return;
      state.lifeParents = state.lifeParents || [];
      state.lifeParents.splice(i, 1);
      savePrefs();
      renderLifeParents();
      renderLifeDashboardDebounced();
    });
  }
  var lifeAddMilestoneBtn = document.getElementById('lifeAddMilestoneBtn');
  if (lifeAddMilestoneBtn) {
    lifeAddMilestoneBtn.addEventListener('click', function () {
      state.lifeMilestones = state.lifeMilestones || [];
      state.lifeMilestones.push({ id: 'milestone-' + Date.now() + '-' + Math.random().toString(36).slice(2), description: '', date: '' });
      savePrefs();
      renderLifeMilestones();
      renderLifeDashboardDebounced();
    });
  }
  var lifeMilestonesListEl = document.getElementById('lifeMilestonesList');
  if (lifeMilestonesListEl) {
    lifeMilestonesListEl.addEventListener('change', function (e) {
      var descInput = e.target.closest('.life-milestone-desc');
      var dateInput = e.target.closest('.life-milestone-date');
      var row = (descInput || dateInput) && (descInput || dateInput).closest('li');
      if (!row) return;
      var id = row.getAttribute('data-milestone-id');
      if (!id) return;
      var m = (state.lifeMilestones || []).find(function (x) { return x.id === id; });
      if (!m) return;
      if (descInput) m.description = descInput.value.trim();
      if (dateInput) m.date = dateInput.value.trim();
      savePrefs();
      /* Do not re-render on change: replacing the list DOM destroys the date input and steals focus. Re-render on blur so list re-sorts by date after user leaves the field. */
    });
    lifeMilestonesListEl.addEventListener('blur', function (e) {
      var descInput = e.target.closest('.life-milestone-desc');
      var dateInput = e.target.closest('.life-milestone-date');
      if (!descInput && !dateInput) return;
      var row = (descInput || dateInput).closest('li');
      if (!row) return;
      var id = row.getAttribute('data-milestone-id');
      if (!id) return;
      var m = (state.lifeMilestones || []).find(function (x) { return x.id === id; });
      if (!m) return;
      var descEl = row.querySelector('.life-milestone-desc');
      var dateEl = row.querySelector('.life-milestone-date');
      if (descEl) m.description = descEl.value.trim();
      if (dateEl) m.date = dateEl.value.trim();
      savePrefs();
      renderLifeMilestones();
    }, true);
    lifeMilestonesListEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.life-remove-milestone');
      if (!btn) return;
      var id = btn.getAttribute('data-milestone-id');
      if (!id) return;
      state.lifeMilestones = (state.lifeMilestones || []).filter(function (m) { return m.id !== id; });
      savePrefs();
      renderLifeMilestones();
      renderLifeDashboardDebounced();
    });
  }
  var seasonsInactiveToggle = document.getElementById('seasonsInactiveToggle');
  if (seasonsInactiveToggle) {
    seasonsInactiveToggle.addEventListener('click', function () {
      var content = document.getElementById('seasonsInactiveContent');
      var expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      if (content) content.classList.toggle('hidden', expanded);
    });
  }
}

if (window.CalendarPlanner) {
  window.CalendarPlanner.renderReflectDashboard = renderLifeDashboard;
  window.CalendarPlanner.reflectInit = reflectInit;
}
