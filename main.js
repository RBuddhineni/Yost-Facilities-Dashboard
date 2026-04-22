import { APP_CONFIG } from "./config.js";

const STORAGE_KEYS = {
  session: "yost-dashboard-session",
};

/** @type {HTMLElement | null} */
const rootEl = document.getElementById("app-root");

let appState = {
  isAuthenticated: false,
  activeSectorId: null,  // null = overview, string = sector detail view
  timeFilter: "recent3", // "recent3"
  lastRefresh: null,
  loading: false,
  error: null,
  errorsByForm: {},
  dataByForm: {},
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
  appState.activeSectorId = null;
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

function formatDateOnly(isoOrValue) {
  if (!isoOrValue) return "—";
  const date = new Date(isoOrValue);
  if (Number.isNaN(date.getTime())) return String(isoOrValue);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeOnly(isoOrValue) {
  if (!isoOrValue) return "—";
  const date = new Date(isoOrValue);
  if (Number.isNaN(date.getTime())) return String(isoOrValue);
  return date.toLocaleTimeString(undefined, {
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
  // Build a trimmed-key index so headers with accidental leading/trailing
  // spaces (common in Google Forms sheets) still match our config labels.
  const trimmedRaw = {};
  for (const rawKey of Object.keys(rawRow)) {
    trimmedRaw[String(rawKey).trim()] = rawRow[rawKey];
  }
  function resolveColumnValue(columnLabel, key) {
    const labels = Array.isArray(columnLabel) ? columnLabel : [columnLabel];
    for (const label of labels) {
      const trimmedLabel = String(label).trim();
      const value = rawRow[label] ?? trimmedRaw[trimmedLabel];
      if (value != null && value !== "") return value;
    }
    return rawRow[key] ?? null;
  }
  const result = {};
  for (const [key, columnLabel] of Object.entries(columns)) {
    result[key] = resolveColumnValue(columnLabel, key);
  }
  return result;
}

function getManualRows(formConfig) {
  if (!Array.isArray(formConfig.manualRows)) return [];
  return formConfig.manualRows.map((row) => coerceSheetRow(row, formConfig.columns));
}

/**
 * Normalizes various Google Sheets JSON formats into a consistent array of row objects.
 */
function normalizeSheetData(json) {
  if (Array.isArray(json)) {
    if (json.length > 0 && Array.isArray(json[0])) {
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
    return json;
  }

  if (json && typeof json === "object") {
    if (Array.isArray(json.rows)) return json.rows;
    if (Array.isArray(json.values)) {
      const [headers, ...dataRows] = json.values;
      if (!headers || !Array.isArray(headers)) return [];
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
    if (Array.isArray(json.data)) return json.data;
    if (json.feed && json.feed.entry) return [];
  }

  return [];
}

async function fetchSheet(formConfig) {
  if (!formConfig.sheetJsonUrl) {
    const manualRows = getManualRows(formConfig);
    if (manualRows.length > 0) return manualRows;
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

  const proxyUrl = formConfig.corsProxy ?? APP_CONFIG.corsProxy;

  async function request(url) {
    return fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-cache",
    });
  }

  async function fetchWithFallback() {
    if (!proxyUrl) return request(formConfig.sheetJsonUrl);

    const proxiedUrl = proxyUrl + encodeURIComponent(formConfig.sheetJsonUrl);
    try {
      const proxiedResp = await request(proxiedUrl);
      // Static local servers (e.g. python -m http.server) do not serve /api/proxy.
      // If that endpoint is missing, fall back to direct Apps Script request.
      if (proxiedResp.status === 404) {
        return request(formConfig.sheetJsonUrl);
      }
      return proxiedResp;
    } catch {
      // Proxy network failure: try direct fetch before surfacing an error.
      return request(formConfig.sheetJsonUrl);
    }
  }

  let resp;
  try {
    resp = await fetchWithFallback();
  } catch (err) {
    const manualRows = getManualRows(formConfig);
    if (manualRows.length > 0) return manualRows;
    const suggestion = APP_CONFIG.corsProxy
      ? " Proxy/direct fetch failed. Ensure Apps Script allows public access and returns CORS headers (Access-Control-Allow-Origin: *), or run with vercel dev."
      : " Set config.corsProxy to 'https://corsproxy.io/?' to use a CORS proxy, or add .setHeader('Access-Control-Allow-Origin','*') in your Apps Script doGet.";
    throw new Error(`[${formConfig.label}] Fetch failed: ${err.message}.${suggestion}`);
  }

  const text = await resp.text();
  if (!resp.ok) {
    const manualRows = getManualRows(formConfig);
    if (manualRows.length > 0) return manualRows;
    const snippet = text.length > 200 ? text.slice(0, 200) + "…" : text;
    const extraHelp =
      resp.status === 403
        ? " This Apps Script URL is returning 403 (forbidden). That means the Web App is NOT publicly accessible. In Apps Script: Deploy → Manage deployments → Edit → set 'Who has access' to 'Anyone' AND 'Execute as' to 'Me', then Deploy and use the updated /exec URL."
        : "";
    throw new Error(
      `[${formConfig.label}] HTTP ${resp.status}. Response: ${snippet.replace(/\s+/g, " ")}.${extraHelp}`
    );
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    const manualRows = getManualRows(formConfig);
    if (manualRows.length > 0) return manualRows;
    const isHtml = /^\s*</.test(text) || text.includes("<!DOCTYPE") || text.includes("<html");
    const hint = isHtml
      ? " Server returned HTML instead of JSON. In Apps Script: check for errors in the script editor, ensure doGet() returns JSON, and add .setHeader('Access-Control-Allow-Origin','*') on the response."
      : ` Response: ${text.slice(0, 150)}…`;
    throw new Error(`[${formConfig.label}] Invalid JSON.${hint}`);
  }

  const normalizedRows = normalizeSheetData(json);
  const mappedRows = normalizedRows.map((row) => coerceSheetRow(row, formConfig.columns));

  if (mappedRows.length > 0) {
    mappedRows.sort((a, b) => {
      const timeA = new Date(a.timestamp ?? a.date).getTime();
      const timeB = new Date(b.timestamp ?? b.date).getTime();
      return timeB - timeA;
    });
  }

  // Return up to 50 rows so time-filtered views have enough data
  return mappedRows.slice(0, 50);
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
  if (refreshTimerId != null) clearInterval(refreshTimerId);
  refreshTimerId = window.setInterval(refreshAllData, APP_CONFIG.refreshIntervalMs);
}

function stopAutoRefresh() {
  if (refreshTimerId != null) {
    clearInterval(refreshTimerId);
    refreshTimerId = null;
  }
}

// --- Data helpers ---

function filterRowsByTime(rows, filter) {
  if (!Array.isArray(rows)) return [];
  if (filter === "recent3") return rows.slice(0, 3);
  return rows;
}

function computeStats(values) {
  const nums = values
    .filter((v) => v != null && v !== "")
    .map(Number)
    .filter((n) => !isNaN(n));
  if (nums.length === 0) return null;
  nums.sort((a, b) => a - b);
  const mid = Math.floor(nums.length / 2);
  const median = nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
  return { median, min: nums[0], max: nums[nums.length - 1], count: nums.length };
}

function getMostRecentRowWithValue(rows, columnKey) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.find((row) => {
    const value = row?.[columnKey];
    return value != null && value !== "";
  }) ?? null;
}

function formatKpiRawValue(kpi, raw) {
  switch (kpi.format) {
    case "integer":
      return formatNumber(raw, 0);
    case "number":
      return formatNumber(raw, kpi.decimals ?? 2);
    case "timestamp":
      return raw == null || raw === "" ? "—" : formatTimestamp(raw);
    case "date":
      return raw == null || raw === "" ? "—" : formatDateOnly(raw);
    case "time":
      return raw == null || raw === "" ? "—" : formatTimeOnly(raw);
    case "string":
      return raw == null || raw === "" ? "—" : String(raw);
    default:
      return String(raw ?? "—");
  }
}

function getRowsForKpi(kpi, rows) {
  if (!Array.isArray(rows)) return [];
  if (!kpi.filterBy) return rows;
  const filterVal = String(kpi.filterBy.value).toLowerCase();
  return rows.filter(
    (row) => String(row[kpi.filterBy.columnKey] ?? "").toLowerCase() === filterVal
  );
}

function getKpiRecentEntries(kpi, rows, limit = 3) {
  const rowsForKpi = getRowsForKpi(kpi, rows);
  return rowsForKpi
    .filter((row) => row?.[kpi.columnKey] != null && row?.[kpi.columnKey] !== "")
    .slice(0, limit)
    .map((row) => ({
      timestamp: row.timestamp,
      displayValue: formatKpiRawValue(kpi, row[kpi.columnKey]),
    }));
}

function computeKpiValue(kpi, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { display: "—", badge: null };
  }

  const workingRows = getRowsForKpi(kpi, rows);
  const latest = getMostRecentRowWithValue(workingRows, kpi.columnKey);
  const raw = latest?.[kpi.columnKey] ?? null;

  if (kpi.format === "count") {
    return { display: String(workingRows.length), badge: null };
  }
  return { display: formatKpiRawValue(kpi, raw), badge: null };
}

function getKpiBadge(kpi, rows) {
  if (!kpi.goodRange || !Array.isArray(rows) || rows.length === 0) return null;
  const latest = rows[0];
  const raw = latest[kpi.columnKey];
  const value = Number(raw);
  if (Number.isNaN(value)) return null;
  const { min, max } = kpi.goodRange;
  if (value >= min && value <= max) return { kind: "good", label: "Within target" };
  return { kind: "bad", label: "Out of target" };
}

// --- Shared UI fragments ---

function buildTimeFilterHtml() {
  const opts = [
    { key: "recent3", label: "Three most recent entries" },
  ];
  return `
    <div class="time-filter">
      ${opts
        .map(
          (o) =>
            `<button class="filter-btn ${appState.timeFilter === o.key ? "active" : ""}" data-filter="${o.key}">${o.label}</button>`
        )
        .join("")}
    </div>
  `;
}

function attachTimeFilterListeners() {
  rootEl.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setState({ timeFilter: btn.getAttribute("data-filter") });
    });
  });
}

function buildTableHtml(form, rows) {
  const cols = form.columns;
  const order = Object.keys(cols).filter((key) => cols[key] !== "");
  const headers = order.map((key) => { const col = cols[key]; return `<th>${Array.isArray(col) ? col[0] : col}</th>`; }).join("");

  const bodyRows =
    rows.length === 0
      ? `<tr><td colspan="99" class="logs-empty">No entries in this time period.</td></tr>`
      : rows
          .slice(0, 25)
          .map((row) => {
            const cells = order
              .map((key) => {
                let value = row[key];
                if (key === "timestamp") value = formatTimestamp(value);
                else if (key === "date") value = formatDateOnly(value);
                else if (key === "time") value = formatTimeOnly(value);
                if (value != null && value !== "" && typeof value === "number") {
                  value = formatNumber(value, 2);
                }
                if (value == null || value === "") value = "—";
                return `<td>${value}</td>`;
              })
              .join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");

  return `
    <table class="logs-table">
      <thead><tr>${headers}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

// --- Views ---

function renderLogin() {
  if (!rootEl) return;
  rootEl.innerHTML = `
    <div class="app-shell">
      <div class="app-container">
        <div class="login-wrapper">
          <div class="brand-mark">Y</div>
          <div class="login-title">Yost/Wilpon Facilities</div>
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
            For Yost/Wilpon Facilities staff use only.
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("login-form")?.addEventListener("submit", handleLoginSubmit);
}

function renderOverview() {
  if (!rootEl) return;

  const filterLabel = "three most recent entries";

  const sectorCardsHtml = APP_CONFIG.forms
    .map((form) => {
      const rows = appState.dataByForm[form.id] ?? [];
      const filteredRows = filterRowsByTime(rows, appState.timeFilter);
      const latestRow = rows[0] ?? null;
      const hasError = !!(appState.errorsByForm?.[form.id]);

      const lastCheck = latestRow?.timestamp
        ? formatTimestamp(latestRow.timestamp)
        : "No recent entries";

      const kpiRows = form.latestRowOnlyForKpis ? rows.slice(0, 1) : rows;
      const kpiMinis = form.kpis
        .map((kpi) => {
          const { display } = computeKpiValue(kpi, kpiRows);
          return `
            <div class="bubble-kpi">
              <span class="bubble-kpi-label">${kpi.label}</span>
              <span class="bubble-kpi-value">${display}</span>
            </div>`;
        })
        .join("");

      const countText =
        filteredRows.length > 0
          ? `${filteredRows.length} entr${filteredRows.length === 1 ? "y" : "ies"} in ${filterLabel}`
          : `No entries in ${filterLabel}`;

      return `
        <div class="sector-bubble" data-sector-id="${form.id}">
          <div class="bubble-top">
            <div class="bubble-title">${form.label}</div>
            ${hasError ? `<span class="bubble-error-badge">⚠ Error</span>` : ""}
          </div>
          <div class="bubble-last-check">Last check: ${lastCheck}</div>
          <div class="bubble-kpis">
            ${kpiMinis || '<span class="muted" style="font-size:12px;">No data loaded</span>'}
          </div>
          <div class="bubble-footer">
            <span class="bubble-count ${filteredRows.length === 0 ? "muted" : ""}">${countText}</span>
            <a class="sheet-link" href="${form.sheetUrl ?? "#"}" target="_blank" rel="noopener" onclick="event.stopPropagation()">(link here) ↗</a>
          </div>
          <button class="view-details-btn">View Details →</button>
        </div>
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
              <div class="header-title">Yost/Wilpon Facilities</div>
              <div class="header-subtitle">Facilities Dashboard</div>
            </div>
          </div>
          <div class="header-meta">
            <div class="timestamp-pill">
              <span class="status-dot"></span>
              <span>${
                appState.lastRefresh
                  ? `Updated ${formatTimestamp(appState.lastRefresh)}`
                  : "Waiting for first refresh"
              }</span>
            </div>
            <div class="flex-row">
              <button class="secondary-button" data-action="manual-refresh">&#x21bb; Refresh now</button>
              <button class="secondary-button" data-action="logout">&#x274C; Log out</button>
            </div>
          </div>
        </header>

        <main class="dashboard-body">
          <section>
            <div class="section-header">
              <div>
                <div class="section-title">Dashboard Overview</div>
                <div class="section-subtitle">Click a sector card to view details and logs</div>
              </div>
              ${buildTimeFilterHtml()}
            </div>
            <div class="sector-grid">
              ${sectorCardsHtml}
            </div>
          </section>
        </main>
      </div>
    </div>
  `;

  rootEl.querySelector("[data-action='logout']")?.addEventListener("click", handleLogout);
  rootEl.querySelector("[data-action='manual-refresh']")?.addEventListener("click", refreshAllData);
  attachTimeFilterListeners();

  rootEl.querySelectorAll(".sector-bubble").forEach((bubble) => {
    bubble.addEventListener("click", (e) => {
      if (e.target.closest(".sheet-link")) return;
      const sectorId = bubble.getAttribute("data-sector-id");
      if (sectorId) setState({ activeSectorId: sectorId });
    });
  });
}

function renderSectorDetail() {
  if (!rootEl) return;

  const form = APP_CONFIG.forms.find((f) => f.id === appState.activeSectorId);
  if (!form) {
    setState({ activeSectorId: null });
    return;
  }

  const allRows = appState.dataByForm[form.id] ?? [];
  const filteredRows = filterRowsByTime(allRows, appState.timeFilter);
  const kpiRows = form.latestRowOnlyForKpis ? allRows.slice(0, 1) : allRows;
  const hasError = !!(appState.errorsByForm?.[form.id]);

  // KPI cards
  const kpiCardsHtml = form.kpis
    .map((kpi) => {
      const { display } = computeKpiValue(kpi, kpiRows);
      const badge = getKpiBadge(kpi, kpiRows);
      const rowsForTimestamp = getRowsForKpi(kpi, kpiRows);
      const latestRow = getMostRecentRowWithValue(rowsForTimestamp, kpi.columnKey) ?? rowsForTimestamp[0] ?? null;
      const timestampDisplay = latestRow?.timestamp
        ? formatTimestamp(latestRow.timestamp)
        : "No recent entries";
      const recentEntries = getKpiRecentEntries(kpi, kpiRows, 3);
      const recentEntriesJson = encodeURIComponent(JSON.stringify(recentEntries));
      const badgeHtml = badge
        ? `<span class="kpi-badge ${badge.kind === "bad" ? "bad" : ""}">${badge.label}</span>`
        : "";
      return `
        <button class="kpi-card clickable-kpi" data-kpi-label="${kpi.label}" data-kpi-entries="${recentEntriesJson}" type="button">
          <div class="kpi-label">${kpi.label}</div>
          <div class="kpi-value-row">
            <div class="kpi-value">${display}</div>
            ${badgeHtml}
          </div>
          <div class="kpi-meta">Latest entry: ${timestampDisplay}</div>
        </button>
      `;
    })
    .join("");

  // Stats section — only for numeric KPIs and when there are ≥2 filtered rows
  const numericKpis = form.kpis.filter(
    (k) => k.format === "number" || k.format === "integer"
  );
  const statsRows = filteredRows.length >= 2 ? filteredRows : [];
  const statsHtml =
    numericKpis.length > 0 && statsRows.length >= 2
      ? `
        <section>
          <div class="section-header">
            <div>
              <div class="section-title">Statistics</div>
              <div class="section-subtitle">
                Over ${statsRows.length} entr${statsRows.length === 1 ? "y" : "ies"} in the selected period
              </div>
            </div>
          </div>
          <div class="stats-grid">
            ${numericKpis
              .map((kpi) => {
                const values = statsRows.map((r) => r[kpi.columnKey]);
                const stats = computeStats(values);
                if (!stats) return "";
                return `
                  <div class="stat-card">
                    <div class="stat-label">${kpi.label}</div>
                    <div class="stat-row">
                      <div class="stat-item">
                        <div class="stat-item-label">Median</div>
                        <div class="stat-item-value">${formatNumber(stats.median, kpi.decimals ?? 2)}</div>
                      </div>
                      <div class="stat-item">
                        <div class="stat-item-label">Min</div>
                        <div class="stat-item-value">${formatNumber(stats.min, kpi.decimals ?? 2)}</div>
                      </div>
                      <div class="stat-item">
                        <div class="stat-item-label">Max</div>
                        <div class="stat-item-value">${formatNumber(stats.max, kpi.decimals ?? 2)}</div>
                      </div>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </section>
      `
      : "";

  const errorBanner = hasError
    ? `<div class="logs-empty" style="background:#fef2f2;color:#991b1b;border-bottom:1px solid #fecaca;padding:16px;margin-bottom:16px;border-radius:8px;">
         <strong>⚠️ Error loading data for ${form.label}:</strong><br>
         ${appState.errorsByForm[form.id]}
       </div>`
    : "";

  rootEl.innerHTML = `
    <div class="app-shell">
      <div class="app-container">
        <header class="dashboard-header">
          <div class="header-left">
            <div class="brand-mark">Y</div>
            <div class="header-title-group">
              <div class="header-title">Yost/Wilpon Facilities</div>
              <div class="header-subtitle">${form.label}</div>
            </div>
          </div>
          <div class="header-meta">
            <div class="flex-row">
              <button class="secondary-button" data-action="back">← Overview</button>
              <a href="${form.sheetUrl ?? "#"}" target="_blank" rel="noopener" class="secondary-button sheet-link-btn">(link here) ↗</a>
              <button class="secondary-button" data-action="logout">&#x274C; Log out</button>
            </div>
          </div>
        </header>

        <main class="dashboard-body">
          <section>
            <div class="section-header">
              <div>
                <div class="section-title">Key Metrics</div>
                <div class="section-subtitle">Most recent values in selected period</div>
              </div>
              ${buildTimeFilterHtml()}
            </div>
            <div class="kpi-grid">${kpiCardsHtml}</div>
            <div class="kpi-modal" data-kpi-modal hidden>
              <div class="kpi-modal-backdrop" data-kpi-close></div>
              <div class="kpi-modal-panel">
                <div class="kpi-modal-header">
                  <div class="kpi-modal-title" data-kpi-title></div>
                  <button class="secondary-button" data-kpi-close type="button">Close</button>
                </div>
                <div class="kpi-modal-subtitle">Last three entries for this metric</div>
                <div class="kpi-modal-list" data-kpi-list></div>
              </div>
            </div>
          </section>

          ${statsHtml}

          <section>
            <div class="section-header" style="margin-top:8px;">
              <div>
                <div class="section-title">Recent Logs</div>
                <div class="section-subtitle">
                  From <span class="pill">${form.label}</span>
                </div>
              </div>
              <div class="chip">
                Showing
                <span class="muted" style="margin-left:4px;">
                  ${Math.min(filteredRows.length, 25)} of ${filteredRows.length}
                </span>
              </div>
            </div>
            <div class="table-container">
              ${errorBanner}
              ${buildTableHtml(form, filteredRows)}
            </div>
          </section>
        </main>
      </div>
    </div>
  `;

  rootEl
    .querySelector("[data-action='back']")
    ?.addEventListener("click", () => setState({ activeSectorId: null }));
  rootEl.querySelector("[data-action='logout']")?.addEventListener("click", handleLogout);
  attachTimeFilterListeners();

  const modalEl = rootEl.querySelector("[data-kpi-modal]");
  const titleEl = rootEl.querySelector("[data-kpi-title]");
  const listEl = rootEl.querySelector("[data-kpi-list]");
  const closeModal = () => {
    if (!modalEl) return;
    modalEl.setAttribute("hidden", "");
  };
  rootEl.querySelectorAll("[data-kpi-close]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });
  rootEl.querySelectorAll(".clickable-kpi").forEach((card) => {
    card.addEventListener("click", () => {
      if (!modalEl || !titleEl || !listEl) return;
      const label = card.getAttribute("data-kpi-label") ?? "Metric";
      const encoded = card.getAttribute("data-kpi-entries") ?? "";
      let entries = [];
      try {
        entries = JSON.parse(decodeURIComponent(encoded));
      } catch {
        entries = [];
      }
      titleEl.textContent = label;
      listEl.innerHTML =
        entries.length === 0
          ? `<div class="logs-empty">No recent entries for this metric.</div>`
          : entries
              .map(
                (entry) => `
                  <div class="kpi-modal-item">
                    <div class="kpi-modal-item-value">${entry.displayValue}</div>
                    <div class="kpi-modal-item-time">${entry.timestamp ? formatTimestamp(entry.timestamp) : "No timestamp"}</div>
                  </div>
                `
              )
              .join("");
      modalEl.removeAttribute("hidden");
    });
  });
}

function renderApp() {
  if (!appState.isAuthenticated) {
    renderLogin();
  } else if (appState.activeSectorId) {
    renderSectorDetail();
  } else {
    renderOverview();
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
