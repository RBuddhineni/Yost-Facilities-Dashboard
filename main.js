import { APP_CONFIG } from "./config.js";

const STORAGE_KEYS = {
  session: "yost-dashboard-session",
};

/** @type {HTMLElement | null} */
const rootEl = document.getElementById("app-root");
//app state
let appState = {
  isAuthenticated: false,
  activeFormId: APP_CONFIG.forms[0]?.id ?? null,
  lastRefresh: null,
  loading: false,
  error: null,
  // Map<formId, string> for per-sector errors
  errorsByForm: {},
  // Map<formId, array of rows>
  dataByForm: {},
  // KPI detail view state
  viewingKpiId: null, // When set, shows detail view for this KPI
};

function loadSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.session);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.authenticated === true) {
      appState.isAuthenticated = true;
    }
  } catch {
    // ignore
  }
}

function saveSession() {
  try {
    window.localStorage.setItem(
      STORAGE_KEYS.session,
      JSON.stringify({ authenticated: appState.isAuthenticated })
    );
  } catch {
    // ignore
  }
}

function setState(partial) {
  appState = { ...appState, ...partial };
  renderApp();
}

function handleLoginSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const input = form.querySelector("input[type='password']");
  const errorEl = form.querySelector("[data-error]");
  if (!input) return;

  const value = input.value.trim();
  if (value === APP_CONFIG.loginPassword) {
    appState.isAuthenticated = true;
    appState.error = null;
    saveSession();
    renderApp();
    refreshAllData();
    ensureAutoRefresh();
  } else {
    if (errorEl) {
      errorEl.textContent = "Incorrect password. Please try again.";
    }
  }
}

function handleLogout() {
  stopAutoRefresh();
  appState.isAuthenticated = false;
  appState.dataByForm = {};
  appState.lastRefresh = null;
  appState.loading = false;
  appState.error = null;
  appState.viewingKpiId = null;
  saveSession();
  renderApp();
}

function formatTimestamp(isoOrValue) {
  if (!isoOrValue) return "—";
  const date = new Date(isoOrValue);
  if (Number.isNaN(date.getTime())) return String(isoOrValue);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value, decimals) {
  if (value == null || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  const places = decimals ?? 2;
  return num.toFixed(places);
}

function coerceSheetRow(rawRow, columns) {
  const result = {};
  for (const [key, columnLabel] of Object.entries(columns)) {
    result[key] = rawRow[columnLabel] ?? rawRow[key] ?? null;
  }
  return result;
}

/**
 * Normalizes various Google Sheets JSON formats into a consistent array of row objects.
 * Handles multiple common formats:
 * - Direct array of objects: [{col1: val1, col2: val2}, ...]
 * - Object with rows: {rows: [{col1: val1}, ...]}
 * - Object with values (2D array): {values: [["header1", "header2"], ["val1", "val2"], ...]}
 * - CSV-like array of arrays: [["header1", "header2"], ["val1", "val2"], ...]
 * - Object with feed (older format): {feed: {...}}
 */
function normalizeSheetData(json) {
  // Case 1: Already an array
  if (Array.isArray(json)) {
    // Check if it's an array of arrays (CSV-like format)
    if (json.length > 0 && Array.isArray(json[0])) {
      // First row is headers, rest are data rows
      const [headers, ...dataRows] = json;
      return dataRows.map((row) => {
        const obj = {};
        headers.forEach((header, idx) => {
          if (header != null && header !== "") {
            obj[String(header).trim()] = row[idx] ?? null;
          }
        });
        return obj;
      });
    }
    // Array of objects - return as-is
    return json;
  }

  // Case 2: Object with various properties
  if (json && typeof json === "object") {
    // Try common property names
    if (Array.isArray(json.rows)) {
      return json.rows;
    }
    if (Array.isArray(json.values)) {
      // Google Sheets API format: 2D array where first row is headers
      const [headers, ...dataRows] = json.values;
      if (!headers || !Array.isArray(headers)) {
        return [];
      }
      return dataRows.map((row) => {
        const obj = {};
        headers.forEach((header, idx) => {
          if (header != null && header !== "") {
            obj[String(header).trim()] = row?.[idx] ?? null;
          }
        });
        return obj;
      });
    }
    if (Array.isArray(json.data)) {
      return json.data;
    }
    if (json.feed && json.feed.entry) {
      // Older Google Sheets format - would need more parsing, but return empty for now
      // You can extend this if needed
      return [];
    }
  }

  // Fallback: empty array
  return [];
}

async function fetchSheet(formConfig) {
  if (!formConfig.sheetJsonUrl) {
    // Placeholder when no sheet is linked yet; replace sheetJsonUrl in config when ready.
    const now = new Date();
    const sectorIds = [
      "ice-quality-reports",
      "softball-therapy-pool",
      "fisher-therapy-pool",
      "yost-ice-depth",
    ];
    if (sectorIds.includes(formConfig.id)) {
      return [
        {
          timestamp: now.toISOString(),
          notes: "Connect a Google Sheet in config.js to see real data.",
        },
      ];
    }
    return [];
  }

  const urlToFetch = APP_CONFIG.corsProxy
    ? APP_CONFIG.corsProxy + encodeURIComponent(formConfig.sheetJsonUrl)
    : formConfig.sheetJsonUrl;

  let resp;
  try {
    resp = await fetch(urlToFetch, {
      method: "GET",
      mode: "cors",
      cache: "no-cache",
    });
  } catch (err) {
    const suggestion = APP_CONFIG.corsProxy
      ? " CORS proxy may be down; try again or set config.corsProxy to null and add .setHeader('Access-Control-Allow-Origin','*') in your Apps Script doGet."
      : " Set config.corsProxy to 'https://corsproxy.io/?' to use a CORS proxy, or add .setHeader('Access-Control-Allow-Origin','*') in your Apps Script doGet.";
    throw new Error(`[${formConfig.label}] Fetch failed: ${err.message}.${suggestion}`);
  }

  const text = await resp.text();
  if (!resp.ok) {
    const snippet = text.length > 200 ? text.slice(0, 200) + "…" : text;
    const extraHelp =
      resp.status === 403
        ? " This Apps Script URL is returning 403 (forbidden). That means the Web App is NOT publicly accessible. In Apps Script: Deploy → Manage deployments → Edit → set 'Who has access' to 'Anyone' AND 'Execute as' to 'Me', then Deploy and use the updated /exec URL. If your org blocks 'Anyone', you'll need an internal proxy/backend instead."
        : "";
    throw new Error(
      `[${formConfig.label}] HTTP ${resp.status}. Response: ${snippet.replace(/\s+/g, " ")}.${extraHelp}`
    );
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    const isHtml = /^\s*</.test(text) || text.includes("<!DOCTYPE") || text.includes("<html");
    const hint = isHtml
      ? " Server returned HTML instead of JSON. In Apps Script: check for errors in the script editor, ensure doGet() returns JSON, and add .setHeader('Access-Control-Allow-Origin','*') on the response."
      : ` Response: ${text.slice(0, 150)}…`;
    throw new Error(`[${formConfig.label}] Invalid JSON.${hint}`);
  }

  // Normalize the JSON into a consistent array of row objects
  const normalizedRows = normalizeSheetData(json);
  
  // Map column names from the sheet to our internal keys using the config
  const mappedRows = normalizedRows.map((row) => coerceSheetRow(row, formConfig.columns));
  
  // Sort by timestamp descending (newest first), then keep only the 5 most recent
  if (mappedRows.length > 0 && mappedRows[0].timestamp) {
    mappedRows.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });
  }

  return mappedRows.slice(0, 5);
}

async function refreshAllData() {
  if (!appState.isAuthenticated) return;
  setState({ loading: true, error: null, errorsByForm: {} });
  const results = {};
  const errors = [];
  const errorsByForm = {};
  const settled = await Promise.allSettled(
    APP_CONFIG.forms.map(async (form) => {
      const rows = await fetchSheet(form);
      return { form, rows };
    })
  );
  for (let i = 0; i < settled.length; i++) {
    const form = APP_CONFIG.forms[i];
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      results[form.id] = outcome.value.rows;
    } else {
      results[form.id] = [];
      const msg = outcome.reason?.message ?? String(outcome.reason);
      errors.push(`${form.label}: ${msg}`);
      errorsByForm[form.id] = msg;
      console.error(`[${form.label}]`, outcome.reason);
    }
  }
  const errorMessage =
    errors.length > 0
      ? errors.length === APP_CONFIG.forms.length
        ? "All sectors failed to load. " + errors[0]
        : `Some sectors failed (${errors.length}/${APP_CONFIG.forms.length}): ${errors.join("; ")}`
      : null;
  setState({
    dataByForm: results,
    lastRefresh: new Date().toISOString(),
    loading: false,
    error: errorMessage,
    errorsByForm,
  });
}

let refreshTimerId = null;

function ensureAutoRefresh() {
  if (refreshTimerId != null) {
    clearInterval(refreshTimerId);
  }
  refreshTimerId = window.setInterval(
    refreshAllData,
    APP_CONFIG.refreshIntervalMs
  );
}

function stopAutoRefresh() {
  if (refreshTimerId != null) {
    clearInterval(refreshTimerId);
    refreshTimerId = null;
  }
}

function computeKpiValue(kpi, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { display: "—", badge: null };
  }

  const latest = rows[0];
  const raw = latest[kpi.columnKey];

  switch (kpi.format) {
    case "integer":
      return { display: formatNumber(raw, 0), badge: null };
    case "number":
      return { display: formatNumber(raw, kpi.decimals ?? 2), badge: null };
    case "count": {
      return { display: String(rows.length), badge: null };
    }
    case "string": {
      const text = raw == null || raw === "" ? "—" : String(raw);
      return { display: text, badge: null };
    }
    default:
      return { display: String(raw ?? "—"), badge: null };
  }
}

function getKpiBadge(kpi, rows) {
  if (!kpi.goodRange || !Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  const latest = rows[0];
  const raw = latest[kpi.columnKey];
  const value = Number(raw);
  if (Number.isNaN(value)) return null;

  const { min, max } = kpi.goodRange;
  if (value >= min && value <= max) {
    return { kind: "good", label: "Within target" };
  }
  return { kind: "bad", label: "Out of target" };
}

function renderLogin() {
  if (!rootEl) return;
  rootEl.innerHTML = `
    <div class="app-shell">
      <div class="app-container">
        <div class="login-wrapper">
          <div class="brand-mark">Y</div>
          <div class="login-title">Yost Facilities</div>
          <div class="login-subtitle">Facilities Dashboard</div>

          <form id="login-form">
            <div class="form-field">
              <label class="form-label" for="password-input">
                Access Password
              </label>
              <input
                id="password-input"
                class="text-input"
                type="password"
                autocomplete="current-password"
                placeholder="Enter shared staff password"
                required
              />
              <div class="error-text" data-error></div>
            </div>

            <button type="submit" class="primary-button">
              <span>Enter Dashboard</span>
            </button>
          </form>

          <div class="login-footnote">
            For Yost Facilities staff use only.
          </div>
        </div>
      </div>
    </div>
  `;

  const form = document.getElementById("login-form");
  if (form) {
    form.addEventListener("submit", handleLoginSubmit);
  }
}

function renderDashboard() {
  if (!rootEl) return;

  const activeForm =
    APP_CONFIG.forms.find((f) => f.id === appState.activeFormId) ??
    APP_CONFIG.forms[0];
  const activeFormRows = appState.dataByForm[activeForm?.id] ?? [];
  const latestRow = activeFormRows[0] ?? null;

  const actionsHtml = `
    <div class="header-meta">
      <div class="timestamp-pill">
        <span class="status-dot"></span>
        <span>
          ${
            appState.lastRefresh
              ? `Updated ${formatTimestamp(appState.lastRefresh)}`
              : "Waiting for first refresh"
          }
        </span>
      </div>
      <div class="flex-row">
        <button class="secondary-button" data-action="manual-refresh">
          &#x21bb; Refresh now
        </button>
        <button class="secondary-button" data-action="logout">
          &#x274C; Log out
        </button>
      </div>
    </div>
  `;

  const formSwitcherHtml = `
    <div class="form-switcher">
      ${APP_CONFIG.forms
        .map((form) => {
          const active = form.id === activeForm.id;
          return `<button
            class="form-switch-button ${active ? "active" : ""}"
            data-form-id="${form.id}"
          >
            ${form.label}
          </button>`;
        })
        .join("")}
    </div>
  `;

  const kpiCardsHtml = activeForm.kpis
    .map((kpi) => {
      const { display } = computeKpiValue(kpi, activeFormRows);
      const badge = getKpiBadge(kpi, activeFormRows);
      const timestampDisplay = latestRow?.timestamp
        ? formatTimestamp(latestRow.timestamp)
        : "No recent entries";

      const badgeHtml = badge
        ? `<span class="kpi-badge ${badge.kind === "bad" ? "bad" : ""}">
            ${badge.label}
          </span>`
        : "";

      const unitHtml = kpi.unit
        ? `<span class="kpi-unit">${kpi.unit}</span>`
        : "";

      return `
        <div class="kpi-card" data-kpi-id="${kpi.id}" style="cursor: pointer;" title="Click to view historical data">
          <div class="kpi-label">${kpi.label}</div>
          <div class="kpi-value-row">
            <div class="kpi-value">
              ${display}${unitHtml}
            </div>
            ${badgeHtml}
          </div>
          <div class="kpi-meta">
            Latest entry: ${timestampDisplay}
          </div>
        </div>
      `;
    })
    .join("");

  const tableHeaders = (() => {
    const cols = activeForm.columns;
    const order = Object.keys(cols);
    return order
      .map((key) => `<th>${cols[key]}</th>`)
      .join("");
  })();

  const tableRowsHtml = (() => {
    if (!Array.isArray(activeFormRows) || activeFormRows.length === 0) {
      return `<tr><td colspan="99" class="logs-empty">No recent submissions found.</td></tr>`;
    }
    const cols = activeForm.columns;
    const order = Object.keys(cols);

    return activeFormRows
      .slice(0, 5)
      .map((row) => {
        const cells = order
          .map((key) => {
            let value = row[key];
            if (key === "timestamp") {
              value = formatTimestamp(value);
            }
            // For numeric sheet values, format to 2 decimal places to match sheet display
            if (value != null && value !== "" && typeof value === "number") {
              value = formatNumber(value, 2);
            }
            if (value == null || value === "") {
              value = "—";
            }
            return `<td>${value}</td>`;
          })
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");
  })();

  const activeFormError =
    appState.errorsByForm && activeForm ? appState.errorsByForm[activeForm.id] : null;
  const errorBanner = activeFormError
    ? `<div class="logs-empty" style="background:#fef2f2;color:#991b1b;border-bottom:1px solid #fecaca;padding:16px;margin-bottom:16px;border-radius:8px;">
         <strong>⚠️ Error loading data for ${activeForm.label}:</strong><br>
         ${activeFormError}
       </div>`
    : "";

  rootEl.innerHTML = `
    <div class="app-shell">
      <div class="app-container">
        <header class="dashboard-header">
          <div class="header-left">
            <div class="brand-mark">Y</div>
            <div class="header-title-group">
              <div class="header-title">Yost Facilities</div>
              <div class="header-subtitle">
                Facilities Dashboard
              </div>
            </div>
          </div>
          ${actionsHtml}
        </header>

        <main class="dashboard-body">
          <section>
            <div class="section-header">
              <div>
                <div class="section-title">Key Metrics</div>
                <div class="section-subtitle">
                  5 most recent submissions per sector
                </div>
              </div>
              ${formSwitcherHtml}
            </div>
            <div class="kpi-grid">
              ${kpiCardsHtml}
            </div>
          </section>

          <section>
            <div class="section-header" style="margin-top:10px;">
              <div>
                <div class="section-title">Recent Logs</div>
                <div class="section-subtitle">
                  Last 25 form submissions from
                  <span class="pill">${activeForm.label}</span>
                </div>
              </div>
              <div class="chip">
                Showing
                <span class="muted" style="margin-left:4px;">
                  ${
                    Array.isArray(activeFormRows)
                      ? `${Math.min(
                          activeFormRows.length,
                          25
                        )} of ${activeFormRows.length}`
                      : "0"
                  }
                </span>
              </div>
            </div>
            <div class="table-container">
              ${errorBanner}
              <table class="logs-table">
                <thead>
                  <tr>
                    ${tableHeaders}
                  </tr>
                </thead>
                <tbody>
                  ${tableRowsHtml}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  `;

  rootEl
    .querySelectorAll("[data-form-id]")
    .forEach((el) =>
      el.addEventListener("click", () => {
        const formId = el.getAttribute("data-form-id");
        if (formId && formId !== appState.activeFormId) {
          setState({ activeFormId: formId, viewingKpiId: null });
        }
      })
    );

  const logoutBtn = rootEl.querySelector("[data-action='logout']");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }
  const refreshBtn = rootEl.querySelector("[data-action='manual-refresh']");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      refreshAllData();
    });
  }

  // Add click handlers for KPI cards
  rootEl
    .querySelectorAll("[data-kpi-id]")
    .forEach((el) =>
      el.addEventListener("click", () => {
        const kpiId = el.getAttribute("data-kpi-id");
        if (kpiId) {
          setState({ viewingKpiId: kpiId });
        }
      })
    );
}

function renderKpiDetail() {
  if (!rootEl) return;

  const activeForm =
    APP_CONFIG.forms.find((f) => f.id === appState.activeFormId) ??
    APP_CONFIG.forms[0];
  const activeFormRows = appState.dataByForm[activeForm?.id] ?? [];
  const kpi = activeForm.kpis.find((k) => k.id === appState.viewingKpiId);

  if (!kpi) {
    // KPI not found, go back to dashboard
    setState({ viewingKpiId: null });
    return;
  }

  // Extract all values for this KPI with timestamps
  const kpiHistory = activeFormRows
    .map((row) => {
      const value = row[kpi.columnKey];
      const timestamp = row.timestamp;
      return { value, timestamp };
    })
    .filter((entry) => entry.timestamp != null); // Only include entries with timestamps

  // Format values based on KPI format
  const formatValue = (val) => {
    if (val == null || val === "") return "—";
    switch (kpi.format) {
      case "integer":
        return formatNumber(val, 0);
      case "number":
        return formatNumber(val, kpi.decimals ?? 2);
      case "string":
        return String(val);
      default:
        return String(val);
    }
  };

  const unitHtml = kpi.unit ? ` <span class="kpi-unit" style="font-size:0.9em;opacity:0.7;">${kpi.unit}</span>` : "";

  const historyRowsHtml =
    kpiHistory.length === 0
      ? `<tr><td colspan="2" class="logs-empty">No historical data available.</td></tr>`
      : kpiHistory
          .map((entry) => {
            const formattedValue = formatValue(entry.value);
            const badgeHtml =
              kpi.goodRange && !Number.isNaN(Number(entry.value))
                ? (() => {
                    const num = Number(entry.value);
                    const inRange =
                      num >= kpi.goodRange.min && num <= kpi.goodRange.max;
                    return inRange
                      ? '<span class="kpi-badge" style="margin-left:8px;">Within target</span>'
                      : '<span class="kpi-badge bad" style="margin-left:8px;">Out of target</span>';
                  })()
                : "";
            return `
              <tr>
                <td>${formatTimestamp(entry.timestamp)}</td>
                <td style="font-weight:500;">
                  ${formattedValue}${unitHtml}${badgeHtml}
                </td>
              </tr>
            `;
          })
          .join("");

  rootEl.innerHTML = `
    <div class="app-shell">
      <div class="app-container">
        <header class="dashboard-header">
          <div class="header-left">
            <div class="brand-mark">Y</div>
            <div class="header-title-group">
              <div class="header-title">Yost Facilities</div>
              <div class="header-subtitle">
                ${kpi.label} - Historical Data
              </div>
            </div>
          </div>
          <div class="header-meta">
            <button class="secondary-button" data-action="back-to-dashboard">
              ← Back to Dashboard
            </button>
            <button class="secondary-button" data-action="logout">
              &#x274C; Log out
            </button>
          </div>
        </header>

        <main class="dashboard-body">
          <section>
            <div class="section-header">
              <div>
                <div class="section-title">${kpi.label}</div>
                <div class="section-subtitle">
                  Historical values from ${activeForm.label}
                </div>
              </div>
              <div class="chip">
                Showing
                <span class="muted" style="margin-left:4px;">
                  ${kpiHistory.length} ${kpiHistory.length === 1 ? "entry" : "entries"}
                </span>
              </div>
            </div>
            <div class="table-container">
              <table class="logs-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  ${historyRowsHtml}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  `;

  const backBtn = rootEl.querySelector("[data-action='back-to-dashboard']");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      setState({ viewingKpiId: null });
    });
  }

  const logoutBtn = rootEl.querySelector("[data-action='logout']");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }
}

function renderApp() {
  if (!appState.isAuthenticated) {
    renderLogin();
  } else if (appState.viewingKpiId) {
    renderKpiDetail();
  } else {
    renderDashboard();
  }
}

function bootstrap() {
  loadSession();
  renderApp();
  if (appState.isAuthenticated) {
    refreshAllData();
    ensureAutoRefresh();
  }
}

window.addEventListener("DOMContentLoaded", bootstrap);

