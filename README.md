# Calendar Planner 2.0

## How to run

- **Option 1:** Open `index.html` in a browser (double-click or drag into the window).
- **Option 2:** Serve the 2.0 folder with a local server (e.g. `npx serve .` or your editor’s “Live Server”) and open the URL in a browser.

## Data and compatibility

2.0 uses the **same localStorage keys** as 1.0:

- `calendar-planner-events` — events and calendar data  
- `calendar-planner-prefs` — preferences (week start, view style, Misogi, waypost statuses, life facts, etc.)  
- `calendar-planner-categories` — event categories and colors  

You can switch between 1.0 and 2.0 in the same browser; both read and write the same data.

## What 2.0 is

2.0 is a **restructure** of the original Calendar Planner (1.0): same features and behaviour, with a **single-scroll layout** and **simplified view switching**. Plan, Track, and Reflect are shown by toggling visibility (no sliding/transform), and the whole page scrolls as one document. UX and behaviour match 1.0 except for this layout and view-switch behaviour.
