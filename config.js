// Simple configuration for Google Sheets-backed forms and KPIs.
// You can edit this file to add/remove forms, change KPI names,
// and update column mappings without touching the main app logic.

export const APP_CONFIG = {
  // Hardcoded shared password for the simple login gate.
  // Change this to whatever you like.
  loginPassword: "yost-ice-2025",

  // How often to refresh data (in milliseconds)
  refreshIntervalMs: 3 * 60 * 1000, // 3 minutes

  // List of Google Forms / Sheets "sources" that drive the dashboard.
  forms: [
    {
      id: "daily-ops",
      label: "Daily Operations",
      // Replace this with your published Google Sheet JSON endpoint.
      // For development you can leave as null and the app will show mock data.
      sheetJsonUrl: null,

      // Column mappings: keys used by the dashboard -> column header in the Sheet
      columns: {
        timestamp: "Timestamp",
        iceTemperature: "Ice Temperature (°F)",
        attendance: "Attendance",
        eventsScheduled: "Events Scheduled",
        maintenanceStatus: "Maintenance Status",
        notes: "Notes",
      },

      // KPI cards to show for this form. You can add/remove items here.
      kpis: [
        {
          id: "ice-temperature",
          label: "Ice Temperature",
          columnKey: "iceTemperature",
          unit: "°F",
          format: "number",
          decimals: 1,
          goodRange: { min: 20, max: 24 },
        },
        {
          id: "attendance",
          label: "Attendance",
          columnKey: "attendance",
          unit: "people",
          format: "integer",
        },
        {
          id: "events",
          label: "Events Scheduled",
          columnKey: "eventsScheduled",
          unit: "",
          format: "integer",
        },
        {
          id: "maintenance",
          label: "Maintenance Status",
          columnKey: "maintenanceStatus",
          format: "string",
        },
      ],
    },
    {
      id: "tournaments",
      label: "Tournaments & Special Events",
      sheetJsonUrl: null,
      columns: {
        timestamp: "Timestamp",
        eventName: "Event Name",
        rink: "Rink",
        startTime: "Start Time",
        endTime: "End Time",
        expectedAttendance: "Expected Attendance",
        notes: "Notes",
      },
      kpis: [
        {
          id: "events-today",
          label: "Events Today",
          columnKey: "eventName",
          unit: "",
          format: "count",
        },
        {
          id: "expected-attendance",
          label: "Expected Attendance",
          columnKey: "expectedAttendance",
          unit: "people",
          format: "integer",
        },
      ],
    },
  ],
};

