## Yost Facilities — Ice Rink Dashboard

A lightweight, client-only dashboard for Yost Facilities staff to monitor ice rink operations. Data is pulled directly from published Google Sheets JSON endpoints; no backend or database is required.

### Features

- **Login gate**: Single shared password, stored only in the front-end config.
- **Main dashboard**: Header with branding, last refresh time, and logout button.
- **KPI cards**: Config-driven KPIs mapped to Google Sheet columns.
- **Recent logs table**: Shows the latest submissions for each form.
- **Multi-form support**: Switch between multiple Google Sheets sources.
- **Auto-refresh**: Periodic data refresh (configured in `config.js`).

### Getting Started

1. **Open the dashboard**
   - You can simply open `index.html` directly in a modern browser, or
   - Serve the folder with a small static server (recommended for fetch security):

```bash
cd /Users/raghu/YostDashboard/Yost-Facilities-Dashboard
python -m http.server 4173
```

Then visit `http://localhost:4173` in your browser.

2. **Login**
   - Default shared password is set in `config.js` under `loginPassword`.
   - Change this value to whatever you prefer.

### Configuring Google Sheets

1. **Set up your Google Form and Sheet**
   - Create a Google Form for rink staff.
   - Let Google create the response sheet automatically.

2. **Publish the Sheet as JSON**
   - Use your preferred method or add-on to expose the Sheet as a JSON endpoint.
   - Copy the JSON URL.

3. **Update `config.js`**
   - Locate the form configuration under `APP_CONFIG.forms`.
   - Set `sheetJsonUrl` to your JSON endpoint.
   - Ensure `columns` entries match the exact header names in your Sheet.
   - Customize `kpis` (labels, column keys, units, and optional good ranges).

If `sheetJsonUrl` is left as `null`, the dashboard will fall back to mock data so you can still see the UI.

### Auto-Refresh

- The refresh interval is controlled by `APP_CONFIG.refreshIntervalMs` in `config.js`.
- Default is 3 minutes. Adjust as needed.

### Notes

- Everything runs client-side; there is no backend.
- The login is a simple password gate for convenience, not a secure authentication system.

