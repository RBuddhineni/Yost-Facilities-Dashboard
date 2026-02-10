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
      sheetJsonUrl: "https://script.google.com/macros/library/d/1hqYC3aRr04AlGKXqtPX6H4oZMd-ZtpskfXTNxi63VyBUvi_iobpz3m4Q/1",

      // Column mappings: keys used by the dashboard -> column header in the Sheet
      columns: {
        timestamp: "Timestamp",
        iceTemperature: "Ice Temperature",
        iceDepth: "Ice Depth",
        eventattendance: "Event Attendance",
        therapyPoolSum: "Therapy Pool Summary",
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
          id: "ice-depth",
          label: "Ice Depth",
          columnKey: "iceDepth",
          unit: "inches",
          format: "number",
          decimals: 1,
        },
        {
          id: "event-attendance",
          label: "Event Attendance",
          columnKey: "eventattendance",
          unit: "people",
          format: "integer",
        },
        {
          id: "therapy-pool",
          label: "Therapy Pool Summary",
          columnKey: "therapyPoolSum",
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

