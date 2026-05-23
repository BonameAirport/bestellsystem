/**
 * CONFIG-AIRSIDE-LAGER.JS – Konfiguration für: Airside → Lager
 * Lädt nach config-base.js und überschreibt APP_CONFIG.
 */
window.APP_CONFIG = Object.freeze(Object.assign({}, window.APP_CONFIG_BASE, {
  APP: {
    TYPE:          "airside_lager",
    NAME:          "Airside → Lager",
    EMOJI:         "✈️",
    HEADER_COLOR:  "linear-gradient(135deg,#1e1b4b,#3730a3,#4f46e5)",
    WHATSAPP_HEADER: "✈️ *AIRSIDE → LAGER*",
    DELIVERY_HEADER: "✈️ *AIRSIDE → LAGER*",
    EMPFAENGER_URL:  "/empfaenger.html",
    OH_KEY:          "opening_hours",
    OH_CACHE_KEY:    "oh_cache",
  },
  ALLOWED_ROLES: ['airside', 'admin'],
}));
