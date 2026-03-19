## Yost Facilities Dashboard

A lightweight, client-only dashboard for Yost Facilities staff to monitor facility check-ins. It aggregates data from four sectors (Ice Quality Reports, Softball Therapy Pool Checks, Fisher Therapy Pool Checks, Yost Ice Depth Checks) via published Google Sheets JSON endpoints; no backend or database is required.

### Features

- **Login gate**: Single shared password, stored only in the front-end config.
- **Main dashboard**: Header with branding, last refresh time, and logout button.
- **KPI cards**: Config-driven KPIs mapped to Google Sheet columns.
- **Recent logs table**: Shows the latest submissions for each form.
- **Four sectors**: Switch between Ice Quality Reports, Softball Therapy Pool, Fisher Therapy Pool, and Yost Ice Depth Checks.
- **Auto-refresh**: Periodic data refresh (configured in `config.js`).

### Getting Started

1. **Open the dashboard**
   - You can simply open `index.html` directly in a modern browser, or
   - Serve the folder with a small static server (recommended for fetch security):

```bash
cd /path/to/Yost-Facilities-Dashboard
python -m http.server 4173
```

Then visit `http://localhost:4173` in your browser.

2. **Login**
   - Default shared password is set in `config.js` under `loginPassword`.
   - Change this value to whatever you prefer.

### Connecting Your Google Sheets to Each Sector

The dashboard **pulls from Google Sheets** (each sheet is usually the response sheet of a Google Form). The browser cannot read a Sheet directly, so you expose each sheet as JSON via a **Google Apps Script** web app, then paste that URL into `config.js`.

| Sector | In `config.js` set `sheetJsonUrl` for this form |
|--------|--------------------------------------------------|
| Ice Quality Reports | `ice-quality-reports` |
| Softball Therapy Pool Checks | `softball-therapy-pool` |
| Fisher Therapy Pool Checks | `fisher-therapy-pool` |
| Yost Ice Depth Checks | `yost-ice-depth` |

**For each of the four sectors:**

1. Have a **Google Sheet** for that sector (e.g. the response sheet of a Google Form).
2. In that sheet: **Extensions → Apps Script**, add the script below, then **Deploy → New deployment → Web app** (Execute as: **Me**, Who has access: **Anyone**). Copy the **Web app URL** (ends in `/exec`).
3. In this project, open **`config.js`**, find the sector in the `forms` array, and set **`sheetJsonUrl`** to that URL.

Example for Ice Quality Reports:

```javascript
{
  id: "ice-quality-reports",
  label: "Ice Quality Reports",
  sheetJsonUrl: "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec",  // ← paste your URL here
  columns: { timestamp: "Timestamp", notes: "Notes" },  // ← match your sheet’s column headers
  kpis: [ /* ... */ ],
}
```

**Important:** The `columns` keys in `config.js` must match your sheet’s **exact column headers** (e.g. if the header is "Timestamp", use `timestamp: "Timestamp"`). After you add the URLs and column mappings, refresh the dashboard to see live data.

### Metrics by sector (form → sheet)

Each sector’s Google Form writes one row per submission into its Google Sheet. The dashboard reads that sheet via the Apps Script URL and maps these columns into KPIs and the recent-logs table. Below is the **list of metrics (column headers)** stored in each sheet and how they’re used.

| Sector | Sheet column (form field) | Statistic / use on dashboard |
|--------|---------------------------|------------------------------|
| **Ice Quality Reports** | Timestamp | Last submission time |
| | Date | Report date |
| | Name | Who submitted |
| | Humidity | % — KPI |
| | Air Temperature | °F — KPI |
| | Surface Temperature | °F — KPI |
| | Water Temp | Setpoint / system |
| | Set Point | Target temp |
| | Slab Temperature | Sub-surface |
| | Supply Temperature | Chiller supply |
| | Return Temperature | Chiller return |
| | Notes | Free text — KPI |
| | Time | Time of reading |
| | Outside Air Temp | Ambient |
| | Outside Relative Humidity | Ambient |
| | Avg Ice Surface Temp | Computed average |
| | Avg Humidity | Computed average |
| | Avg Air Temp | Computed average |
| | Diff slab and surface temp | Slab vs surface delta |
| | Dew Point (ideal is 35-40) | Dew point |
| | AVG Dew Point per Month | Monthly average |
| **Softball Therapy Pool Checks** | Timestamp | Last check — KPI |
| | DATE | Date of check |
| | TIME | Time of check |
| | Name | Who checked |
| | Chlorine (Hot Tub) | ppm — KPI |
| | Chlorine (Cold Tub) | ppm — KPI |
| | pH (Hot Tub) | — KPI |
| | pH (Cold Tub) | — KPI |
| | Alkalinity (Hot Tub) | |
| | Alkalinity (Cold Tub) | |
| | Calcium Hardness (Hot Tub) | |
| | Calcium Hardness (Cold Tub) | |
| | Temperature (Hot Tub) | °F |
| | Temperature (Cold Tub) | °F |
| | ORP (mV) (Hot Tub) | Oxidation-reduction |
| | ORP (mV) (Cold Tub) | Oxidation-reduction |
| | TDS Level (Hot Tub) | Total dissolved solids |
| | TDS Level (Cold Tub) | Total dissolved solids |
| | Readings | Source (e.g. “From Reader”) |
| | Shock? (trailing space in sheet) | Yes/No |
| | Drain/Clean? | Yes/No |
| | Comments | Free text — KPI |
| **Fisher Therapy Pool Checks** | Same structure as Softball Therapy Pool | Same metrics (Chlorine, pH, temps, ORP, TDS, Shock?, Drain/Clean?, Comments). If your form uses different headers, update `config.js` columns to match. |
| **Yost Ice Depth Checks** | Timestamp | Last check — KPI |
| | (blank header) | Date value |
| | Name | Who checked — KPI |
| | 1 (Threshold) | Depth at threshold (in) |
| | 2 (South Goal) … 19 (NE Corner) | Depth at each grid point (19 positions) |
| | AVG | Average depth — KPI |
| | AVG (w/o corners) | Average excluding corners — KPI |

The dashboard shows a **last check** time and a few **KPIs** per sector (e.g. surface temp, chlorine, avg depth), plus a **recent logs** table with the columns defined in `config.js` for that sector.

### Configuring Google Sheets (full steps)

**Yes, this is a template!** You can customize everything in `config.js`:
- Add/remove forms
- Change KPI names, units, and ranges
- Update column mappings
- Adjust refresh intervals

#### Step-by-Step: Setting Up Google Forms → Google Sheets → Dashboard

1. **Create a Google Form**
   - Go to [Google Forms](https://forms.google.com)
   - Create your form (e.g., "Ice Quality Report" or "Yost Ice Depth Check")
   - Add questions matching what you want to track (e.g., "Ice Temperature", "Attendance", "Maintenance Status")
   - Google will automatically create a response Sheet

2. **Get Your Sheet ID**
   - Open the response Sheet (click "Responses" tab → "Link to Sheets")
   - Look at the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`
   - Copy the `SHEET_ID_HERE` part

3. **Create a JSON Endpoint Using Google Apps Script**
   - In your Sheet, go to **Extensions → Apps Script**
   - Delete any default code and paste this:

```javascript
function doGet() {
  // Enable CORS for cross-origin requests
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length === 0) {
      output.setContent(JSON.stringify([]));
      return output;
    }
    
    const headers = data[0];
    const rows = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i] || null;
      });
      return obj;
    });
    
    output.setContent(JSON.stringify(rows));
    return output;
  } catch (error) {
    output.setContent(JSON.stringify({ error: error.toString() }));
    return output;
  }
}
```

   - Click **Deploy → New deployment**
   - Choose type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (or "Anyone with Google account" if you want some protection)
   - Click **Deploy**
   - Copy the **Web app URL** (looks like `https://script.google.com/macros/s/.../exec`)

4. **Update `config.js`**
   - Open `config.js`
   - Find the sector you want to configure (e.g., `"ice-quality-reports"`, `"yost-ice-depth"`)
   - Set `sheetJsonUrl` to your Apps Script URL from step 3
   - **Important**: Make sure `columns` keys match your Sheet's exact header names:
     ```javascript
     columns: {
       timestamp: "Timestamp",  // Must match Sheet header exactly
       iceTemperature: "Ice Temperature (°F)",
       // ... etc
     }
     ```
   - Customize `kpis` to match your columns and add/remove as needed

5. **Test It!**
   - Submit a test entry via your Google Form
   - Wait a few seconds for the form to process
   - Refresh your dashboard (or wait for auto-refresh)
   - You should see your real data!

**Note**: If `sheetJsonUrl` is left as `null`, the dashboard will show mock data so you can test the UI without setting up Sheets first.

### Troubleshooting "Failed to Fetch" Errors

If you see a "Failed to fetch" or network error:

1. **Check the URL format**
   - Production deployments use `/exec` at the end: `.../macros/s/.../exec`
   - Development URLs use `/dev`: `.../macros/s/.../dev`
   - Both should work, but `/exec` is recommended for production

2. **Verify deployment settings**
   - Go back to Apps Script → **Deploy → Manage deployments**
   - Click the pencil icon to edit
   - Make sure **Who has access** is set to **"Anyone"** (not "Anyone with Google account")
   - Click **Deploy** again if you changed it

3. **Test the URL directly**
   - Open your Apps Script URL in a browser
   - You should see JSON data (or an empty array `[]` if the sheet is empty)
   - If you see an error page, the script isn't deployed correctly

4. **Check browser console**
   - Open browser DevTools (F12) → Console tab
   - Look for detailed error messages that will help diagnose the issue

5. **Redeploy after script changes**
   - After updating your Apps Script code, you must **Deploy → Manage deployments → Edit → Deploy** again
   - The script won't update automatically

### Auto-Refresh

- The refresh interval is controlled by `APP_CONFIG.refreshIntervalMs` in `config.js`.
- Default is 5 minutes. Adjust as needed.

### Notes

- Everything runs client-side; there is no backend.
- The login is a simple password gate for convenience, not a secure authentication system.

