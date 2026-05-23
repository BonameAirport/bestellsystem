/**
 * ─────────────────────────────────────────────────────────────────
 *  APP-CORE.JS – Das Fundament
 * ─────────────────────────────────────────────────────────────────
 *  Hier liegen die WICHTIGEN Bausteine:
 *  - State Management (eine Quelle der Wahrheit)
 *  - Auth (Login, Token, Refresh)
 *  - API Helper (mit Error-Handling)
 *  - Sicherheit (XSS-Schutz, Escape-Funktionen)
 *  - Toast-Notifications (statt alert)
 *
 *  Diese Datei ist WIEDERVERWENDBAR für alle deine Bestellseiten.
 * ─────────────────────────────────────────────────────────────────
 */

(function(global){
  'use strict';

  const C = global.APP_CONFIG;
  if(!C) throw new Error('APP_CONFIG nicht geladen! config.js muss VOR app-core.js eingebunden werden.');

  // ═══════════════════════════════════════════════════════════════
  //  1. STATE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════
  //  Statt 15 globaler Variablen haben wir EIN State-Objekt.
  //  Änderungen gehen IMMER durch setState() – das triggert
  //  automatisch ein Re-Render.
  // ═══════════════════════════════════════════════════════════════

  const state = {
    // User & Auth
    user: null,              // {id, email, role} oder null
    isAdmin: false,          // ist der eingeloggte User Admin?
    isAuthenticated: false,

    // Daten
    articles: [],            // alle Artikel aus DB
    contacts: [],            // alle Kontakte
    orders: [],              // letzte Bestellungen
    categories: [],          // alle Sections

    // UI-Zustand
    cart: {},                // {articleId: {id, name, qty, unit, section}}
    selectedContacts: [],    // welche Empfänger ausgewählt
    currentTab: 'order',     // 'order' | 'history' | 'stats'
    currentLang: 'de',       // 'de' | 'en' | 'tr'
    darkMode: false,
    searchQuery: '',
    statFilter: 'week',      // 'week' | 'month' | 'all'

    // Online/Offline
    isOnline: navigator.onLine,
  };

  // Listener für State-Änderungen
  const listeners = new Set();

  function getState(){ return state; }

  function setState(updates){
    Object.assign(state, updates);
    // Alle Listener benachrichtigen
    listeners.forEach(fn => {
      try { fn(state); } catch(e) { console.error('Listener error:', e); }
    });
  }

  function subscribe(fn){
    listeners.add(fn);
    return () => listeners.delete(fn);
  }


  // ═══════════════════════════════════════════════════════════════
  //  2. SICHERHEIT – XSS-Schutz
  // ═══════════════════════════════════════════════════════════════
  //  Die GRÖSSTE Schwachstelle in der alten Datei war innerHTML
  //  mit unescapten User-Daten. Hier kommen die Helper.
  // ═══════════════════════════════════════════════════════════════

  /**
   * Macht User-Input sicher für innerHTML.
   * Verwandelt <script>alert(1)</script> in harmlosen Text.
   */
  function escapeHTML(str){
    if(str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Sichere Attribut-Werte (für href, src, etc.)
   */
  function escapeAttr(str){
    return escapeHTML(str).replace(/`/g, '&#96;');
  }

  /**
   * Tagged Template Literal für sicheres HTML.
   * Nutze es so: safeHtml`<div>${userInput}</div>`
   * Alle ${} werden AUTOMATISCH escaped.
   */
  function safeHtml(strings, ...values){
    let result = '';
    strings.forEach((str, i) => {
      result += str;
      if(i < values.length){
        result += escapeHTML(values[i]);
      }
    });
    return result;
  }


  // ═══════════════════════════════════════════════════════════════
  //  3. AUTH MODULE
  // ═══════════════════════════════════════════════════════════════
  //  Saubere Auth-Verwaltung mit Auto-Refresh.
  // ═══════════════════════════════════════════════════════════════

  const SB_URL = C.SUPABASE.URL;
  const SB_KEY = C.SUPABASE.ANON_KEY;

  const Auth = {
    getToken(){ return localStorage.getItem('sb_token'); },
    getRefreshToken(){ return localStorage.getItem('sb_refresh'); },

    saveSession(data){
      if(data.access_token) localStorage.setItem('sb_token', data.access_token);
      if(data.refresh_token) localStorage.setItem('sb_refresh', data.refresh_token);
      if(data.expires_in){
        localStorage.setItem('sb_expires', (Date.now() + data.expires_in * 1000).toString());
      }
    },

    clearSession(){
      ['sb_token', 'sb_refresh', 'sb_expires', 'app_session', 'is_admin'].forEach(k => {
        localStorage.removeItem(k);
      });
      setState({ user: null, isAdmin: false, isAuthenticated: false });
    },

    isTokenExpiringSoon(){
      const exp = parseInt(localStorage.getItem('sb_expires') || '0');
      return exp > 0 && (exp - Date.now()) < C.LIMITS.TOKEN_REFRESH_MINUTES * 60 * 1000;
    },

    /**
     * Login mit Email/Passwort.
     * Gibt {success: true} oder {success: false, error: '...'} zurück.
     */
    async login(email, password){
      // Rate-Limiting (Lockout nach zu vielen Versuchen)
      const attempts = parseInt(localStorage.getItem('login_attempts') || '0');
      const lockUntil = parseInt(localStorage.getItem('lock_until') || '0');
      if(lockUntil > Date.now()){
        const minutes = Math.ceil((lockUntil - Date.now()) / 60000);
        return { success: false, error: `Zu viele Fehlversuche. Bitte warte ${minutes} Minuten.` };
      }

      try {
        const r = await fetch(`${SB_URL}${C.SUPABASE.AUTH}/token?grant_type=password`, {
          method: 'POST',
          headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await r.json();

        if(!data.access_token){
          // Fehlversuch zählen
          const newAttempts = attempts + 1;
          localStorage.setItem('login_attempts', newAttempts.toString());
          if(newAttempts >= C.LIMITS.LOGIN_ATTEMPTS){
            localStorage.setItem('lock_until', (Date.now() + C.LIMITS.LOCKOUT_MINUTES * 60000).toString());
            localStorage.setItem('login_attempts', '0');
            return { success: false, error: `Konto für ${C.LIMITS.LOCKOUT_MINUTES} Min. gesperrt.` };
          }
          return { success: false, error: data.error_description || 'Login fehlgeschlagen' };
        }

        // Erfolg
        this.saveSession(data);
        localStorage.setItem('login_attempts', '0');
        localStorage.removeItem('lock_until');

        // User-Info dekodieren
        const payload = this.decodeToken(data.access_token);
        setState({
          user: { id: payload.sub, email: payload.email },
          isAuthenticated: true,
        });

        // Admin-Check
        await this.checkAdminStatus();

        return { success: true };
      } catch(e){
        return { success: false, error: 'Netzwerkfehler. Versuche es erneut.' };
      }
    },

    /**
     * Token erneuern. Wird automatisch im Hintergrund gemacht.
     */
    async refreshToken(){
      const refresh = this.getRefreshToken();
      if(!refresh) return false;
      try {
        const r = await fetch(`${SB_URL}${C.SUPABASE.AUTH}/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        const data = await r.json();
        if(data.access_token){
          this.saveSession(data);
          return true;
        }
        return false;
      } catch(e){
        return false;
      }
    },

    async getValidToken(){
      if(this.isTokenExpiringSoon()){
        const ok = await this.refreshToken();
        if(!ok){
          this.clearSession();
          return null;
        }
      }
      return this.getToken();
    },

    /**
     * JWT-Token dekodieren (sicher).
     */
    decodeToken(token){
      try {
        return JSON.parse(atob(token.split('.')[1]));
      } catch(e){
        return null;
      }
    },

    /**
     * Prüft ob der eingeloggte User Admin ist.
     * NEU: Checkt die admin_users Tabelle in Supabase,
     * NICHT mehr einen hardcoded PIN!
     */
    async checkAdminStatus(){
      const token = this.getToken();
      if(!token){ setState({ isAdmin: false }); return false; }

      const payload = this.decodeToken(token);
      if(!payload){ setState({ isAdmin: false }); return false; }

      // Owner ist IMMER Admin
      if(payload.sub === C.OWNER_ID){
        setState({ isAdmin: true });
        return true;
      }

      try {
        const r = await fetch(`${SB_URL}${C.SUPABASE.REST}/admin_users?user_id=eq.${payload.sub}&select=user_id`, {
          headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + token },
        });
        const data = await r.json();
        const isAdmin = Array.isArray(data) && data.length > 0;
        setState({ isAdmin });
        return isAdmin;
      } catch(e){
        setState({ isAdmin: false });
        return false;
      }
    },

    logout(){
      this.clearSession();
      location.reload();
    },

    /**
     * Startet die automatische Token-Erneuerung im Hintergrund.
     */
    startAutoRefresh(){
      setInterval(async () => {
        if(this.getToken() && this.isTokenExpiringSoon()){
          await this.refreshToken();
        }
      }, C.LIMITS.TOKEN_REFRESH_MINUTES * 60 * 1000);
    },
  };


  // ═══════════════════════════════════════════════════════════════
  //  4. API HELPER (mit Error-Handling)
  // ═══════════════════════════════════════════════════════════════
  //  Wrapper um fetch() der ALLES richtig macht:
  //  - Auth-Token automatisch anhängen
  //  - Token erneuern wenn nötig
  //  - Errors mit User-Feedback
  // ═══════════════════════════════════════════════════════════════

  const Api = {
    /**
     * Generischer REST-Call. Macht alles automatisch:
     * Auth, Refresh, Error-Handling.
     */
    async call(method, table, query = '', body = null){
      const token = await Auth.getValidToken();
      if(!token){
        Toast.error('Bitte erneut anmelden');
        return null;
      }

      const headers = {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      };
      if(method === 'POST') headers['Prefer'] = 'return=representation';

      const options = { method, headers };
      if(body) options.body = JSON.stringify(body);

      try {
        const r = await fetch(`${SB_URL}${C.SUPABASE.REST}/${table}${query}`, options);

        if(!r.ok){
          // Häufige Fehler verständlich machen
          if(r.status === 401){
            Toast.error('Sitzung abgelaufen, bitte neu anmelden');
            Auth.clearSession();
            setTimeout(() => location.reload(), 1500);
            return null;
          }
          if(r.status === 403){
            Toast.error('Keine Berechtigung für diese Aktion');
            return null;
          }
          if(r.status === 429){
            Toast.error('Zu viele Anfragen, bitte kurz warten');
            return null;
          }
          // Sonstige Fehler
          const text = await r.text().catch(() => '');
          console.error(`API ${method} ${table} failed (${r.status}):`, text);
          Toast.error(`Fehler ${r.status} – bitte erneut versuchen`);
          return null;
        }

        if(method === 'DELETE' || method === 'PATCH') return true;
        return await r.json();
      } catch(e){
        console.error('API network error:', e);
        Toast.error('Netzwerkfehler – Internet prüfen');
        return null;
      }
    },

    // Convenience-Wrapper
    get(table, query)    { return this.call('GET',    table, query); },
    post(table, body)    { return this.call('POST',   table, '', body); },
    patch(table, query, body) { return this.call('PATCH', table, query, body); },
    delete(table, query) { return this.call('DELETE', table, query); },

    /**
     * Storage: Bild hochladen
     */
    async uploadImage(bucket, path, file){
      const token = await Auth.getValidToken();
      if(!token){ Toast.error('Bitte erneut anmelden'); return null; }

      try {
        const r = await fetch(`${SB_URL}${C.SUPABASE.STORAGE}/object/${bucket}/${path}`, {
          method: 'POST',
          headers: {
            'apikey': SB_KEY,
            'Authorization': 'Bearer ' + token,
            'Content-Type': file.type,
          },
          body: file,
        });
        if(!r.ok){
          Toast.error('Bild-Upload fehlgeschlagen');
          return null;
        }
        return `${SB_URL}${C.SUPABASE.STORAGE}/object/public/${bucket}/${path}`;
      } catch(e){
        Toast.error('Upload-Fehler – Internet prüfen');
        return null;
      }
    },
  };


  // ═══════════════════════════════════════════════════════════════
  //  5. TOAST-NOTIFICATIONS (statt alert!)
  // ═══════════════════════════════════════════════════════════════
  //  alert() blockiert die UI und ist hässlich. Toasts sind besser.
  // ═══════════════════════════════════════════════════════════════

  const Toast = {
    container: null,

    init(){
      if(this.container) return;
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.setAttribute('aria-live', 'polite');
      this.container.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:10000;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:90vw;';
      document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration = 3500){
      this.init();
      const colors = {
        success: { bg: '#16a34a', text: 'white' },
        error:   { bg: '#dc2626', text: 'white' },
        warning: { bg: '#f59e0b', text: 'white' },
        info:    { bg: '#0f172a', text: 'white' },
      };
      const c = colors[type] || colors.info;
      const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

      const toast = document.createElement('div');
      toast.style.cssText = `
        background: ${c.bg};
        color: ${c.text};
        padding: 12px 18px;
        border-radius: 12px;
        font-family: inherit;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        pointer-events: auto;
        cursor: pointer;
        animation: toastIn 0.3s ease-out;
        max-width: 400px;
        display: flex;
        align-items: center;
        gap: 8px;
      `;
      // XSS-Safe: escapeHTML benutzen!
      toast.innerHTML = `<span>${icons[type]}</span><span>${escapeHTML(message)}</span>`;
      toast.onclick = () => toast.remove();
      this.container.appendChild(toast);

      setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },

    success(msg, dur){ this.show(msg, 'success', dur); },
    error(msg, dur){ this.show(msg, 'error', dur); },
    warning(msg, dur){ this.show(msg, 'warning', dur); },
    info(msg, dur){ this.show(msg, 'info', dur); },
  };


  // ═══════════════════════════════════════════════════════════════
  //  6. UTILITIES
  // ═══════════════════════════════════════════════════════════════

  const Utils = {
    /**
     * Rate-Limit für Bestellungen (clientseitig).
     * SICHERHEITSHINWEIS: Das ist nur ein UX-Schutz.
     * Für echte Sicherheit muss serverseitig (Supabase Edge Function) gerate-limitet werden.
     */
    checkOrderRateLimit(){
      const now = Date.now();
      const times = JSON.parse(localStorage.getItem('order_times') || '[]');
      const recent = times.filter(t => now - t < 3600000);
      if(recent.length >= C.LIMITS.ORDERS_PER_HOUR){
        Toast.warning(`Maximal ${C.LIMITS.ORDERS_PER_HOUR} Bestellungen pro Stunde`);
        return false;
      }
      recent.push(now);
      localStorage.setItem('order_times', JSON.stringify(recent));
      return true;
    },

    /**
     * Deutsches Datumsformat
     */
    formatDate(date = new Date()){
      return date.toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    },

    /**
     * Cookies
     */
    getCookie(name){
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return match ? decodeURIComponent(match[2]) : null;
    },

    setCookie(name, value, days = 365){
      const expires = new Date(Date.now() + days * 864e5).toUTCString();
      document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
    },

    /**
     * Debounce (für Search-Inputs etc.)
     */
    debounce(fn, delay = 250){
      let timer;
      return function(...args){
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    },
  };


  // ═══════════════════════════════════════════════════════════════
  //  7. PUBLIC API
  // ═══════════════════════════════════════════════════════════════
  //  Das hier ist, was nach außen sichtbar wird.
  //  Auf der HTML-Seite nutzt du z.B. AppCore.Auth.login(...)
  // ═══════════════════════════════════════════════════════════════

  global.AppCore = {
    // State
    getState,
    setState,
    subscribe,

    // Module
    Auth,
    Api,
    Toast,
    Utils,

    // Security helpers
    escapeHTML,
    escapeAttr,
    safeHtml,

    // Config (read-only access)
    config: C,
  };

})(window);
