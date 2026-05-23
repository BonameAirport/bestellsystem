/**
 * CONFIG-LAGER.JS – Konfiguration für: Landside → Lager
 * Lädt nach config-base.js und überschreibt APP_CONFIG.
 */
window.APP_CONFIG = Object.freeze(Object.assign({}, window.APP_CONFIG_BASE, {
  APP: {
    TYPE:          "lager",
    NAME:          "Landside → Lager",
    EMOJI:         "🏠",
    HEADER_COLOR:  "linear-gradient(135deg,#052e16,#14532d,#15803d)",
    WHATSAPP_HEADER: "🏠 *LANDSIDE → LAGER 📦*",
    DELIVERY_HEADER: "🏠 *LANDSIDE → LAGER 📦*",
    EMPFAENGER_URL:  "/empfaenger.html",
    OH_KEY:          "opening_hours",
    OH_CACHE_KEY:    "oh_cache",
  },
  // BUGFIX: Original hatte fälschlicherweise ['airside','admin'] → korrekt ist ['lager','admin']
  ALLOWED_ROLES: ['lager', 'admin'],
}));
