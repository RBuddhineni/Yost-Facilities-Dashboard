# Yost Facilities Dashboard

A live dashboard for Yost Facilities staff to monitor facility check-ins across multiple sectors. Data is pulled automatically from Google Sheets — no manual data entry needed on the dashboard side.

---

## Table of Contents

- [For Staff & Management](#for-staff--management)
  - [Changing the Login Password](#changing-the-login-password)
  - [If the Website Goes Down](#if-the-website-goes-down)
  - [Correcting a Bad Form Submission](#correcting-a-bad-form-submission)
- [For Developers](#for-developers)
  - [Where to Find the Code](#where-to-find-the-code)
  - [Project Structure](#project-structure)
  - [Running Locally](#running-locally)
  - [Connecting Google Sheets](#connecting-google-sheets)
  - [Deployment (Vercel)](#deployment-vercel)
  - [Sector Column Mappings](#sector-column-mappings)
  - [Troubleshooting](#troubleshooting)

---

## For Staff & Management

### Changing the Login Password

The dashboard uses a single shared password. To change it:

1. Go to the GitHub repository for this project.
2. Open the file called **`config.js`** (it's in the root folder).
3. On line 5, find this line:
   ```javascript
   loginPassword: "yost-ice-2025",
   ```
4. Replace `"yost-ice-2025"` with your new password (keep the quotes).
5. Save and commit the change. Vercel will automatically redeploy the site within a minute or two.

> **Note:** This is a simple shared password for convenience. It is not a high-security authentication system — do not use it to protect sensitive personal data.

---

### If the Website Goes Down

The dashboard is hosted on **Vercel**. If the site becomes unavailable:

1. Log in to your Vercel account at [vercel.com](https://vercel.com).
2. Find the **Yost Facilities Dashboard** project from your dashboard.
3. Click on the project and go to the **Deployments** tab.
4. Look at the most recent deployment — it will show one of these statuses:
   - **Ready** — the site is live. If it's still not loading, try clearing your browser cache.
   - **Failed** — something went wrong with a recent code change. Click into the deployment to see the error log and share it with your developer.
   - **Paused** — the project was paused, usually due to a free tier limit. Click **Resume** or check your Vercel plan/billing settings.
5. If you cannot resolve it yourself, share a screenshot of the Deployments page with your developer.

---

### Correcting a Bad Form Submission

The dashboard reads directly from Google Sheets in real time. It does **not** store its own copy of the data. This means:

- **To fix incorrect data:** Open the Google Sheet for that sector, find the row with the wrong entry, and edit or delete it directly in the sheet. The dashboard will reflect the correction on its next refresh (within 5 minutes), or immediately if you click the refresh button.
- **To remove a duplicate submission:** Delete the duplicate row from the Google Sheet.

Each sector has a direct link to its Google Sheet — look for the **↗ link** button on the sector card in the dashboard, or find the URLs in `config.js` under each sector's `sheetUrl` field.

> **Tip:** You'll need edit access to the Google Sheet to make changes. If you don't have access, contact whoever manages your Google Workspace.

---

## For Developers

### Where to Find the Code

All code lives in the GitHub repository for this project. The three files you'll work with most are:

| File | What it does |
|------|-------------|
| **`config.js`** | All configuration: password, Google Sheet URLs, KPI definitions, column mappings, refresh interval. **Start here for most changes.** |
| **`main.js`** | All dashboard logic: data fetching, rendering, login handling, KPI calculations. |
| **`index.html`** | The HTML shell and all inline CSS styles. |
| **`api/proxy.js`** | A small Vercel serverless function used to proxy Google Apps Script requests and avoid CORS issues in production. |

---

### Project Structure

```
Yost-Facilities-Dashboard/
├── index.html        # UI shell and styles
├── main.js           # Dashboard logic
├── config.js         # All configuration (edit this for most changes)
└── api/
    └── proxy.js      # Vercel serverless CORS proxy
```

This is a fully **client-side** project — no database, no backend server. The browser fetches data directly from Google Sheets via Google Apps Script web app URLs.

---

### Running Locally

```bash
# Clone the repo
git clone https://github.com/rbuddhineni/yost-facilities-dashboard.git
cd yost-facilities-dashboard

# Serve with Python (recommended — avoids fetch/CORS issues)
python -m http.server 4173
```

Then open `http://localhost:4173` in your browser.

> **Note:** When running locally, the app routes sheet requests through the `/api/proxy` path. This won't work with the Python server — you'll see fetch errors for live data. To test with real data locally, either use the Vercel CLI (`vercel dev`) or temporarily set `corsProxy: null` in `config.js` (only works if the Apps Script URLs have open CORS headers).

---

### Connecting Google Sheets

Each sector on the dashboard maps to one Google Sheet (typically the response sheet from a Google Form). The connection is configured in `config.js` — one entry per sector in the `forms` array.

**When to use this section:**
- Reconnecting a sector whose Apps Script URL has expired or been deleted
- Adding a brand new sector to the dashboard
- Swapping out a sheet because the form was rebuilt

#### Step 1 — Create or open the Google Sheet

This is typically the response sheet from a Google Form. Open it in Google Sheets.

#### Step 2 — Deploy a Google Apps Script web app

1. In the sheet, go to **Extensions → Apps Script**.
2. Delete any existing code and paste the following:

```javascript
function doGet() {
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
      headers.forEach((header, i) => { obj[header] = row[i] || null; });
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

3. Click **Deploy → New deployment**.
4. Set type to **Web app**, execute as **Me**, access to **Anyone**.
5. Click **Deploy** and copy the URL ending in `/exec`.

#### Step 3 — Add or update the sector in `config.js`

Open `config.js` and find the `forms` array. Each object in that array is one sector. To **update an existing sector**, find it by its `id` and replace the relevant fields. To **add a new sector**, copy an existing entry and paste it as a new object at the end of the array (before the closing `]`).

Each sector entry looks like this:

```javascript
{
  id: "your-sector-id",
  label: "Your Sector Label",
  sheetUrl: "https://docs.google.com/spreadsheets/d/...",  // direct link (for the ↗ button)
  sheetJsonUrl: "https://script.google.com/macros/s/.../exec",  // Apps Script URL
  columns: {
    timestamp: "Timestamp",   // key: internal name, value: exact sheet column header
    name: "Name",
    // ... add all columns you want to display or use in KPIs
  },
  kpis: [
    { id: "last-check", label: "Last check", columnKey: "timestamp", format: "timestamp" },
    // format options: "timestamp", "date", "time", "number", "integer", "string"
  ],
}
```

> **Important:** The values in `columns` must exactly match the column headers in your Google Sheet, including capitalization and spacing.

---

### Deployment (Vercel)

The project is deployed on Vercel via GitHub integration. Pushing to the `main` branch triggers an automatic redeploy.

- **To deploy a change:** commit and push to `main` — Vercel handles the rest.
- **To check deployment status:** log in to [vercel.com](https://vercel.com), open the project, and check the **Deployments** tab.
- **Environment:** no environment variables are required. All config is in `config.js`.
- **The `api/proxy.js` function** is automatically deployed as a Vercel serverless function — no extra setup needed.

---

### Sector Column Mappings

Each sector's Google Form writes one row per submission into its response sheet. The dashboard reads those columns via the `columns` map in `config.js`.

To see which columns are currently configured for each sector, open `config.js` and look at each sector's `columns` object — the values on the right side are the exact column headers from the corresponding Google Sheet.

**Key rule:** if a column header ever changes in the Google Sheet (e.g. a form question is renamed), the matching value in `config.js` must be updated to reflect the new header exactly, including capitalization and spacing. The KPIs and table for that sector will stop populating until they match.

---

### Troubleshooting

**"Failed to fetch" or network error on a sector**

1. Open the Apps Script URL for that sector directly in a browser — you should see raw JSON. If you see an error page, the script needs to be redeployed.
2. In Apps Script, go to **Deploy → Manage deployments → Edit** and confirm:
   - Execute as: **Me**
   - Who has access: **Anyone**
3. After any script code changes, you must deploy a **new version** — the URL won't update automatically.
4. Check the browser console (F12 → Console) for detailed error messages.

**Dashboard shows old data**

- The dashboard auto-refreshes every 5 minutes. Click the refresh button in the header to force an immediate update.
- If data is still stale, check that the Apps Script URL in `config.js` is the `/exec` URL (not `/dev`).

**Vercel build failed after a code push**

- Go to the Vercel project → **Deployments** tab → click the failed deployment to read the build log.
- The most common cause is a syntax error in `config.js` or `main.js`. Fix the error, push again, and Vercel will retry automatically.
