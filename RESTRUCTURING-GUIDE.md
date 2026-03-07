# Calendar Planner 2.0 — Restructuring Guide

This document describes how to build a new, improved version of the Calendar Planner app from scratch. It is intended for implementation in the **2.0** folder. The existing app is preserved in **1.0** and should not be modified when building 2.0.

---

## 1. Purpose and scope

- **Goal:** A cleaner, more maintainable app that preserves all user-facing features of 1.0 while fixing structural issues (scroll, view switching, layout).
- **Out of scope:** Changing feature set or product behaviour; the 2.0 app should feel the same to users, with fewer bugs and a simpler codebase.
- **Reference:** Use the 1.0 files in `../1.0/` as the source of truth for behaviour, copy, and persistence keys. This guide defines **structure and architecture**; 1.0 defines **what** the app does.

---

## 2. Current state (1.0) — assessment

### 2.1 File layout (1.0)

| File        | Role |
|------------|------|
| `index.html` | Single HTML file: header, view switch wrapper, Plan/Audit/Reflect blocks, modals, inline Tailwind config and a large `<style>` block. |
| `app.js`     | Core: state object, localStorage (events, prefs, categories), date helpers, `switchView()`, `init()`, DOM cache. |
| `planner.js` | Plan tab: month grid render, events, date selection, legend, categories, print, settings. Attaches to `CalendarPlanner`. |
| `audit.js`   | Audit tab: Misogi, Wayposts. Attaches to `CalendarPlanner`. |
| `perspective.js` | Reflect tab: Facts, Horizons (life grid), Seasons, Milestones. Attaches to `CalendarPlanner`. |

Script load order: `app.js` → `planner.js` → `audit.js` → `perspective.js`.

### 2.2 Pain points in 1.0

- **Scroll and overflow**
  - Plan, Audit, and Reflect were at different times given their own scroll (e.g. `#viewSwitchWrapper` with fixed height, `#auditContent` / `#lifeContent` with `overflow-y: auto`). Aligning on “one page scroll” required many CSS and JS overrides and led to a brief inner scrollbar flash when switching from Plan to Audit and to layout shifts when hiding scrollbars.
  - **Root cause:** Layout was not designed from the start for a single scrolling document; scroll behaviour was patched per view.

- **View switching**
  - Three blocks (planner, audit, life) use a mix of `position: absolute` / `position: relative` and `transform: translateX(…)`. Visibility is controlled by classes: `view-block-planner-off`, `view-block-audit-visible`, `view-block-audit-off`, `view-block-life-visible`.
  - Adding the wrong class (e.g. `view-block-audit-off` when on Plan) caused the whole page to slide on refresh because it triggered a 500ms transform transition on load.
  - **Root cause:** Multiple overlapping concepts (off-screen left, off-screen right, visible) and easy to mis-wire.

- **Monolithic HTML**
  - One large `index.html` with inline config, all three views in one DOM, and a large `<style>` block. Hard to see the “shape” of each view and to change one without risking another.

- **Tight coupling**
  - Shared global `state` and `domCache`, init order dependencies, and modules attaching methods to `window.CalendarPlanner`. Works but makes isolated changes and testing harder.

### 2.3 What to keep from 1.0

- **Features:** Plan (calendar grid, sidebar, legend, multi-select, events, categories, print, settings), Audit (Misogi, Wayposts), Reflect (Facts, Horizons, Seasons, Milestones).
- **Persistence:** Same localStorage keys (`calendar-planner-events`, `calendar-planner-prefs`, `calendar-planner-categories`) and data shape so 2.0 can read 1.0 data.
- **Look and feel:** Same Tailwind theme (ink, accent, Montserrat), same high-level layout (header + view area), same modals and patterns.
- **Print:** Keep a dedicated print section and behaviour; treat it as a first-class “mode” in the new structure.

---

## 3. Recommended structure for 2.0

### 3.1 File layout

Build the new app **inside the 2.0 folder** with this layout:

```
calendar-planner/
  1.0/                    # Existing app (do not modify)
    index.html
    README.md
    app.js
    planner.js
    audit.js
    perspective.js
  2.0/
    RESTRUCTURING-GUIDE.md   # This file
    index.html               # New: single entry; minimal inline CSS
    css/
      layout.css             # Page structure, scroll container, view area
      views.css              # Plan / Audit / Reflect view-specific (optional split later)
      components.css         # Day cells, cards, modals, shared UI
    js/
      app.js                 # State, storage, init, switchView only
      plan.js                # Plan view: grid, events, legend, print
      audit.js               # Audit view: Misogi, Wayposts
      reflect.js             # Reflect view: Facts, Horizons, Seasons, Milestones
    README.md                # How to run 2.0, how it differs from 1.0
```

- **Optional:** If you prefer to keep a single CSS file at first, use `css/app.css` and split later. The important part is to separate **layout/scroll** from **component** styles.

### 3.2 HTML shape

- **One scrolling document.** No fixed-height “viewport” wrapper that gets its own scrollbar.
- **Header:** Sticky; title, Plan / Audit / Reflect tabs, Settings. Same as 1.0.
- **Main content area:** A single block that contains the three views. Only one view is “active” at a time; the other two are **hidden** (e.g. `hidden` or `display: none`), not moved off-screen with transforms. This avoids transform-based transitions on load and wrong-class bugs.
- **Structure sketch:**

```html
<body>
  <header>...</header>
  <main id="app-main" class="...">
    <section id="view-plan" role="region" aria-label="Plan">...</section>
    <section id="view-audit" role="region" aria-label="Audit" hidden>...</section>
    <section id="view-reflect" role="region" aria-label="Reflect" hidden>...</section>
  </main>
  <!-- Modals (same as 1.0) -->
</body>
```

- **Scroll:** Only `body` (or the root layout) scrolls. No `overflow-y: auto` or `max-height` on `#app-main` or on the view sections. Padding at bottom/right for the main content is fine (e.g. for calendar edge).

### 3.3 Layout and scroll (CSS)

- **layout.css** (or the layout section of a single CSS file):
  - Root: `html { scrollbar-gutter: stable; }` to avoid horizontal jump when scrollbar appears (keep from 1.0).
  - `#app-main`: no fixed height, no overflow; it grows with the active view’s content.
  - View sections: `#view-plan`, `#view-audit`, `#view-reflect` are block-level; only one is visible. Use `[hidden]` or a single class e.g. `.view-visible` so that the visible view has `display: block` (or flex/grid as needed) and the others `display: none`. Do **not** use `position: absolute` + `transform` for view switching.
  - No `overflow-y: auto` or `max-height: calc(100vh - …)` on the view container or on individual views.

- **Result:** One scrollbar (the window’s). No inner scrollbar, no flash on tab switch, no slide on refresh.

### 3.4 View switching (JS)

- **Single source of truth:** One variable or property, e.g. `state.viewMode` = `'plan' | 'audit' | 'reflect'`.
- **Single function:** e.g. `switchView(mode)`. It:
  1. Sets `state.viewMode = mode`.
  2. Shows the corresponding section (remove `hidden` or add `.view-visible`) and hides the other two.
  3. Updates tab button `aria-pressed` (and classes if needed).
  4. Calls any view-specific render if needed (e.g. `renderAuditDashboard()` when switching to Audit).

- **No transforms for visibility.** Use display or visibility so there is nothing to “animate” on load; if you add transitions later, they should be optional (e.g. fade) and not affect layout.

### 3.5 State and init

- Keep a single `state` object and the same localStorage keys so 2.0 can replace 1.0 without data migration.
- **Init order:** Load `app.js` first (state, storage, `switchView`, `init`). Then load view scripts (`plan.js`, `audit.js`, `reflect.js`). In `init()`:
  1. Restore prefs and events from localStorage.
  2. Call `switchView('plan')` (or the default view) so the correct section is visible from the first paint.
  3. Attach tab button listeners that call `switchView(…)`.
  4. Call plan/audit/reflect init functions (e.g. render calendar, attach event listeners). View scripts can register themselves so `init()` doesn’t depend on global names if you prefer.

- **DOM:** Prefer a small number of stable IDs for the view sections and tab buttons; avoid a large shared DOM cache if you can, or keep it minimal and document it.

### 3.6 Naming conventions

- **Views:** Prefer `plan` / `audit` / `reflect` in code and IDs (e.g. `#view-plan`) to match the UI. Use the same labels in the UI as 1.0 (Plan, Audit, Reflect).
- **Sections:** `#view-plan`, `#view-audit`, `#view-reflect` instead of `#plannerContent`, `#auditContent`, `#lifeContent` to avoid “planner” vs “plan” and “life” vs “reflect” confusion.
- **Visibility:** One concept, e.g. “visible view”. Avoid “planner-off”, “audit-visible”, “audit-off” as separate concepts; use “which view is active” and show/hide by that.

---

## 4. Step-by-step build instructions

Implement in this order so layout and view switching are correct before adding feature detail.

### Phase 1: Shell and layout

1. **Create 2.0 folder structure** (if not already): `2.0/`, `2.0/css/`, `2.0/js/`.
2. **Create `2.0/index.html`:**
   - Doctype, `<html>`, `<head>` (meta, title, Tailwind CDN, font link).
   - Inline Tailwind config (same theme as 1.0: ink, accent, Montserrat) or link a small config if you prefer.
   - Link `css/layout.css` (and optionally `components.css` if you split).
   - `<body>`: sticky header with title + Plan / Audit / Reflect buttons + Settings.
   - `<main id="app-main">` with three `<section>`s: `#view-plan`, `#view-audit`, `#view-reflect`. Put placeholder content in each (e.g. “Plan view”, “Audit view”, “Reflect view”). Set `hidden` on audit and reflect.
   - No modals yet.
   - Scripts at end of body: `js/app.js` then `js/plan.js`, `js/audit.js`, `js/reflect.js`.
3. **Create `2.0/css/layout.css`:**
   - `html { scrollbar-gutter: stable; }`.
   - `#app-main`: no height/overflow; margin/padding as needed.
   - Rules so that the non-hidden view is visible and the hidden ones are not (e.g. `section[hidden] { display: none !important; }` and ensure the visible section is not `hidden`).
4. **Create `2.0/js/app.js`:**
   - Minimal: `state = { viewMode: 'plan', ... }`, `switchView(mode)` that toggles `hidden` on the three sections and `aria-pressed` on the three buttons, and `init()` that calls `switchView('plan')` and attaches button listeners.
5. **Open `2.0/index.html` in the browser.** Confirm: one scrollbar; switching tabs only shows/hides content; no slide on refresh.

### Phase 2: Plan view

1. Copy the Plan view markup from 1.0 `index.html` (sidebar + main calendar area) into `#view-plan` in 2.0 `index.html`. Adjust IDs/classes to match 2.0 naming if you like; keep structure.
2. Copy day-cell and calendar-related styles from 1.0 into `2.0/css/components.css` (or single `app.css`).
3. In `2.0/js/plan.js`: implement calendar render, event handling, legend, categories, and any Plan-specific state. Use the same storage keys and data shape as 1.0. Expose an init function that `app.js` calls after `switchView('plan')` if needed.
4. Test: events, legend, multi-select, categories, settings. Persistence should work with 1.0 data.

### Phase 3: Audit view

1. Copy the Audit view markup from 1.0 into `#view-audit` in 2.0.
2. Copy Audit-related styles into 2.0 CSS.
3. In `2.0/js/audit.js`: implement Misogi, Wayposts. Same persistence and behaviour as 1.0. Register an init/render and call it when switching to Audit.
4. Test: Audit tab, all sections, persistence.

### Phase 4: Reflect view

1. Copy the Reflect view markup from 1.0 into `#view-reflect` in 2.0.
2. Copy Reflect-related styles (Facts, Horizons, Seasons, Milestones) into 2.0 CSS.
3. In `2.0/js/reflect.js`: implement Facts, Horizons (life grid), Seasons, Milestones. Same persistence and behaviour as 1.0. Register init/render; call when switching to Reflect.
4. Test: Reflect tab, all sections, persistence.

### Phase 5: Modals and print

1. Copy modal markup from 1.0 (event modal, categories, settings, date context, etc.) into 2.0 `index.html`.
2. Copy modal and print styles from 1.0 into 2.0 CSS. Keep print `@media print` rules and structure.
3. Wire modal open/close and form handlers in the appropriate view scripts (or a small shared modal helper). Ensure print flow still works (e.g. print layout uses the same data as 1.0).
4. Test: all modals, print/PDF.

### Phase 6: Polish and README

1. Remove any placeholder content; ensure 2.0 matches 1.0 behaviour and UX (except for the fixed scroll and view switching).
2. Add `2.0/README.md`: how to run (open `index.html` or use a local server), that 2.0 uses the same localStorage keys as 1.0, and a short note that 2.0 is a restructure of 1.0 with a single-scroll layout and simplified view switching.

---

## 5. What to avoid in 2.0

- Do **not** use `position: absolute` + `transform: translateX(…)` to hide/show the three views. Use `hidden` or a single visibility class and `display: none` / block (or flex/grid).
- Do **not** add a fixed height or `overflow-y: auto` to the main content wrapper or to individual view sections. Keep one document scroll.
- Do **not** add a “transition” for view visibility until the basic show/hide is stable; if you do add one, use opacity or a short fade, not transform, so refresh never triggers a slide.
- Do **not** change localStorage key names or the shape of stored data if you want 2.0 to read 1.0 data without migration.

---

## 6. Using this guide in Cursor

- Keep this file in `2.0/RESTRUCTURING-GUIDE.md`.
- For each phase, in Cursor Chat reference the guide: e.g. *“Following @RESTRUCTURING-GUIDE.md Phase 1, create the 2.0 shell and layout.”*
- Build one phase at a time; confirm scroll and tab behaviour at the end of Phase 1 before adding Plan/Audit/Reflect content.
- If something is ambiguous, ask: *“The guide says X; for 2.0 should I do Y or Z?”* and adjust the guide or the implementation accordingly.

---

*End of restructuring guide. Implement the new app in the 2.0 folder; do not modify the 1.0 app.*
