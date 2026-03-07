# Yearly Calendar Planner

A minimal yearly calendar planner with events, categories, and print/export.

## Features

- **Home**: All 12 months of the current year in a responsive grid
- **Events**: Click any day to add an event (title + color category: Work, Personal, Health, Travel, Other)
- **Edit**: Click a day that already has events to edit the first one or add more
- **Persistence**: Events are saved in `localStorage` and survive refresh
- **Print/Export**: Choose layout — 1, 3, 6, or 12 months per page — then use the browser’s “Print” or “Save as PDF”

## Run locally

Open `index.html` in a browser (double-click or use a local server):

```bash
# From project folder
python3 -m http.server 8080
# Then open http://localhost:8080
```

Or open `index.html` directly in Chrome/Firefox/Safari.

## Tech

- Vanilla JS, Tailwind CSS (CDN), no build step.
