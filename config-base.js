/**
 * ─────────────────────────────────────────────────────────────────
 *  CONFIG-BASE.JS – Gemeinsame Basis-Konfiguration
 * ─────────────────────────────────────────────────────────────────
 *  Diese Datei wird von ALLEN Bestellseiten geteilt.
 *  Sie enthält alles, was überall gleich ist.
 *
 *  Lade-Reihenfolge in jeder HTML:
 *    1. config-base.js   ← diese Datei (gemeinsam)
 *    2. config-PAGE.js   ← seitenspezifisch (z.B. config-lager.js)
 *    3. app-core.js
 *    4. admin.js
 *    5. app.js
 * ─────────────────────────────────────────────────────────────────
 */

window.APP_CONFIG_BASE = Object.freeze({

  // ─── Supabase ──────────────────────────────────────────────────
  SUPABASE: {
    URL:     "https://xltsjtbbbykftmjkhcjm.supabase.co",
    ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsdHNqdGJiYnlrZnRtamtoY2ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NzIyNzAsImV4cCI6MjA5NDM0ODI3MH0.-2f3zJpA-8-KhNrpse5gBBH6wTEa7sR0DN36AOBFkss",
    REST:     "/rest/v1",
    AUTH:     "/auth/v1",
    STORAGE:  "/storage/v1",
  },

  // ─── Owner / Super-Admin ───────────────────────────────────────
  OWNER_ID: "dbeecae7-3b37-4c66-91fd-820fe6e55ac1",

  // ─── Limits (gleich für alle Seiten) ──────────────────────────
  LIMITS: {
    ORDERS_PER_HOUR:       10,
    SESSION_HOURS:          8,
    LOGIN_ATTEMPTS:         5,
    LOCKOUT_MINUTES:       15,
    TOKEN_REFRESH_MINUTES:  5,
    ACCESS_CHECK_MINUTES:   5,
  },

  // ─── Article Sections (Reihenfolge) ───────────────────────────
  SECTION_ORDER: [
    '❄️ TK Ware',
    '🧊 Kühlhaus',
    '🫙 Trockenlager',
    '☕️ Kaffeeartikel',
    '🥤 Getränke',
    '🧹 Hygieneartikel',
  ],

  // ─── Order Status Labels ───────────────────────────────────────
  ORDER_STATUS: {
    offen:      { label: '⏳ Offen',      color: 'orange' },
    bestaetigt: { label: '✅ Bestätigt',  color: 'green'  },
    unterwegs:  { label: '🚚 Unterwegs',  color: 'blue'   },
    angekommen: { label: '✅ Angekommen', color: 'green'  },
    fehler:     { label: '⚠️ Fehlt',      color: 'red'    },
  },

  // ─── Deploy URL ────────────────────────────────────────────────
  DEPLOY_URL: "https://airport-dus-boname.netlify.app",

  // ─── Features (Standard für alle) ─────────────────────────────
  FEATURES: {
    PDF_EXPORT:    true,
    STATS_PAGE:    true,
    DARK_MODE:     true,
    MULTI_LANGUAGE: true,
    DELIVERY_CHECK: true,
  },
});
