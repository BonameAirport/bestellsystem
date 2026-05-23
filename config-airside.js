/**
 * CONFIG-AIRSIDE.JS – Konfiguration für: Airside → Landside
 * Lädt nach config-base.js und überschreibt APP_CONFIG.
 */
window.APP_CONFIG = Object.freeze(Object.assign({}, window.APP_CONFIG_BASE, {
  APP: {
    TYPE:          "airside",
    NAME:          "Airside → Landside",
    EMOJI:         "✈️",
    HEADER_COLOR:  "linear-gradient(135deg,#0f2d52,#1a3a6b,#1e40af)",
    WHATSAPP_HEADER: "✈️ *AIRSIDE → LANDSIDE 🏠*",
    DELIVERY_HEADER: "✈️ *AIRSIDE → LANDSIDE 🏠*",
    EMPFAENGER_URL:  "/airside-empfaenger.html",
    OH_KEY:          "opening_hours_airside",
    OH_CACHE_KEY:    "oh_cache_airside",
  },
  ALLOWED_ROLES: ['airside', 'admin'],
}));
