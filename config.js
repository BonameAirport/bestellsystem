/**
 * ─────────────────────────────────────────────────────────────────
 *  CONFIG.JS – Zentrale Konfiguration
 * ─────────────────────────────────────────────────────────────────
 *  Hier liegen ALLE Konstanten und Einstellungen.
 *  Wenn du etwas änderst (URL, Limits, etc.), dann NUR hier.
 *
 *  WICHTIG: Der ANON_KEY ist absichtlich öffentlich –
 *  Supabase ist so designt. Die echte Sicherheit kommt von
 *  RLS-Policies in der Datenbank, nicht vom Verstecken des Keys.
 * ─────────────────────────────────────────────────────────────────
 */

window.APP_CONFIG = Object.freeze({
  // ─── Supabase ──────────────────────────────────────────────────
  SUPABASE: {
    URL: "https://xltsjtbbbykftmjkhcjm.supabase.co",
    ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsdHNqdGJiYnlrZnRtamtoY2ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NzIyNzAsImV4cCI6MjA5NDM0ODI3MH0.-2f3zJpA-8-KhNrpse5gBBH6wTEa7sR0DN36AOBFkss",
    REST: "/rest/v1",
    AUTH: "/auth/v1",
    STORAGE: "/storage/v1",
  },

  // ─── App Identity ──────────────────────────────────────────────
  APP: {
    TYPE: "airside_lager",        // Welcher Bestellfluss
    NAME: "Airside → Lager",
    EMOJI: "✈️",
    DEPLOY_URL: "https://airport-dus-boname.netlify.app",
  },

  // ─── Owner / Super-Admin ───────────────────────────────────────
  // Dies ist der Account, der IMMER Zugriff hat (du).
  // Du findest deine User-ID in Supabase → Authentication → Users
  OWNER_ID: "dbeecae7-3b37-4c66-91fd-820fe6e55ac1",

  // ─── Limits ────────────────────────────────────────────────────
  LIMITS: {
    ORDERS_PER_HOUR: 10,          // Rate-Limit für Bestellungen
    SESSION_HOURS: 8,             // Wie lange bleibt User eingeloggt
    LOGIN_ATTEMPTS: 5,            // Max. Login-Versuche
    LOCKOUT_MINUTES: 15,          // Wie lange gesperrt nach zu vielen Versuchen
    TOKEN_REFRESH_MINUTES: 5,     // Token erneuern wenn weniger als X Minuten gültig
    ACCESS_CHECK_MINUTES: 5,      // Wie oft prüfen ob Zugriff noch da ist
  },

  // ─── Article Sections (Reihenfolge wichtig!) ───────────────────
  SECTION_ORDER: [
    '❄️ TK Ware',
    '🧊 Kühlhaus',
    '🫙 Trockenlager',
    '☕️ Kaffeeartikel',
    '🥤 Getränke',
    '🧹 Hygieneartikel',
  ],

  // ─── Order Status ──────────────────────────────────────────────
  ORDER_STATUS: {
    offen:       { label: '⏳ Offen',       color: 'orange' },
    bestaetigt:  { label: '✅ Bestätigt',   color: 'green'  },
    unterwegs:   { label: '🚚 Unterwegs',   color: 'blue'   },
    angekommen:  { label: '✅ Angekommen',  color: 'green'  },
    fehler:      { label: '⚠️ Fehlt',       color: 'red'    },
  },

  // ─── Roles ─────────────────────────────────────────────────────
  // Welche Rollen darf dieser Bestellfluss?
  ALLOWED_ROLES: ['airside', 'admin'],

  // ─── Feature Flags ─────────────────────────────────────────────
  FEATURES: {
    PDF_EXPORT: true,
    STATS_PAGE: true,
    DARK_MODE: true,
    MULTI_LANGUAGE: true,
    DELIVERY_CHECK: true,
  },
});
