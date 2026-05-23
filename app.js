/**
 * ─────────────────────────────────────────────────────────────────
 *  APP.JS – Die App-Logik für Airside → Lager
 * ─────────────────────────────────────────────────────────────────
 *  Diese Datei nutzt AppCore (Auth, API, State, Toast).
 *  Sie ist organisiert in klar getrennte Module:
 *  - Init: App-Start
 *  - Render: UI-Rendering (alles über safeHtml = XSS-sicher)
 *  - Handlers: Event-Handler (clicks, inputs)
 *  - Actions: Daten-Aktionen (load, save, send)
 * ─────────────────────────────────────────────────────────────────
 */

(function(){
  'use strict';

  const { Auth, Api, Toast, Utils, escapeHTML, safeHtml, getState, setState, subscribe, config: C } = window.AppCore;

  // Kürzel für DOM-Zugriff
  const $ = (id) => document.getElementById(id);
  const $$ = (selector) => document.querySelectorAll(selector);


  // ═══════════════════════════════════════════════════════════════
  //  INIT – Was beim App-Start passiert
  // ═══════════════════════════════════════════════════════════════

  async function init(){
    // 1. Dark Mode aus localStorage wiederherstellen
    if(localStorage.getItem('dark') === '1'){
      document.body.classList.add('dark');
      $('dark-btn').textContent = '☀️';
      setState({ darkMode: true });
    }

    // 2. Online/Offline Detection
    setState({ isOnline: navigator.onLine });
    window.addEventListener('online',  () => { setState({ isOnline: true });  $('offline-bar').classList.remove('on'); });
    window.addEventListener('offline', () => { setState({ isOnline: false }); $('offline-bar').classList.add('on'); });

    // 3. Event-Listener registrieren (NICHT inline onclick mehr!)
    attachEventListeners();

    // 4. State-Subscriber für UI-Updates registrieren
    subscribe(syncUIFromState);

    // 5. Token-Auto-Refresh starten
    Auth.startAutoRefresh();

    // 6. Login-Status prüfen
    const token = Auth.getToken();
    if(token && !Auth.isTokenExpiringSoon()){
      await onLoginSuccess();
    } else if(token){
      // Token läuft ab – Refresh versuchen
      const refreshed = await Auth.refreshToken();
      if(refreshed) await onLoginSuccess();
      else showLogin();
    } else {
      showLogin();
    }
  }


  // ═══════════════════════════════════════════════════════════════
  //  EVENT LISTENERS – Zentral angebracht
  // ═══════════════════════════════════════════════════════════════
  //  Statt onclick="" im HTML registrieren wir hier alle Events.
  //  Vorteil: HTML bleibt sauber, alles ist an einer Stelle,
  //  und es funktioniert auch wenn DOM später ergänzt wird (Event-Delegation).
  // ═══════════════════════════════════════════════════════════════

  function attachEventListeners(){
    // Login
    $('login-submit-btn').addEventListener('click', handleLogin);
    $('login-password').addEventListener('keydown', (e) => { if(e.key === 'Enter') handleLogin(); });

    // Dark Mode
    $('dark-btn').addEventListener('click', toggleDarkMode);

    // Admin
    $('admin-btn').addEventListener('click', handleAdminClick);

    // Tabs
    $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    // Recipient collapse
    $('recipient-toggle').addEventListener('click', toggleRecipientCollapse);

    // Add contact
    $('add-contact-toggle').addEventListener('click', () => {
      const form = $('add-contact-form');
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
    $('save-contact-btn').addEventListener('click', saveContact);

    // Search (debounced!)
    $('search-input').addEventListener('input', Utils.debounce((e) => {
      setState({ searchQuery: e.target.value });
      renderArticles();
    }, 200));
    $('search-clear-btn').addEventListener('click', () => {
      $('search-input').value = '';
      $('search-clear-btn').style.display = 'none';
      setState({ searchQuery: '' });
      renderArticles();
    });

    // Cart
    $('cart-btn').addEventListener('click', openCart);
    $('cart-close-btn').addEventListener('click', closeCart);
    $('cart-modal').addEventListener('click', (e) => {
      if(e.target.id === 'cart-modal') closeCart();
    });
    $('send-order-btn').addEventListener('click', sendOrder);

    // Event-Delegation für dynamische Buttons (Artikel-Plus/Minus, Kontakt-Auswahl, etc.)
    document.body.addEventListener('click', handleDelegatedClicks);
  }

  /**
   * Event-Delegation: Ein Listener für alle dynamisch erzeugten Buttons.
   * Statt für jeden Button ein onclick, hängen wir EINE Funktion an document.body
   * und schauen anhand von data-action was zu tun ist.
   */
  function handleDelegatedClicks(e){
    const target = e.target.closest('[data-action]');
    if(!target) return;

    const action = target.dataset.action;
    const id = target.dataset.id;

    switch(action){
      case 'qty-plus':       changeArticleQty(parseInt(id), 1); break;
      case 'qty-minus':      changeArticleQty(parseInt(id), -1); break;
      case 'cart-qty-plus':  changeCartQty(parseInt(id), 1); break;
      case 'cart-qty-minus': changeCartQty(parseInt(id), -1); break;
      case 'cart-remove':    removeFromCart(parseInt(id)); break;
      case 'contact-toggle': toggleContactSelection(target.dataset.phone); break;
      case 'contact-delete': deleteContact(parseInt(id), target.dataset.phone, e); break;
      case 'order-expand':   target.nextElementSibling?.classList.toggle('on'); break;
    }
  }


  // ═══════════════════════════════════════════════════════════════
  //  LOGIN HANDLING
  // ═══════════════════════════════════════════════════════════════

  function showLogin(){
    $('login-screen').style.display = 'flex';
    $('main-wrap').style.display = 'none';
  }

  function hideLogin(){
    $('login-screen').style.display = 'none';
    $('main-wrap').style.display = 'block';
  }

  async function handleLogin(){
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    const errEl = $('login-error');
    const btn = $('login-submit-btn');

    errEl.textContent = '';

    if(!email || !password){
      errEl.textContent = '❌ Email und Passwort eingeben';
      return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Anmeldung läuft...';

    const result = await Auth.login(email, password);

    btn.disabled = false;
    btn.textContent = '🔐 Anmelden';

    if(!result.success){
      errEl.textContent = '❌ ' + result.error;
      return;
    }

    await onLoginSuccess();
  }

  async function onLoginSuccess(){
    hideLogin();
    Toast.success('Willkommen!');
    await loadAppData();
  }


  // ═══════════════════════════════════════════════════════════════
  //  DATA LOADING
  // ═══════════════════════════════════════════════════════════════

  async function loadAppData(){
    // Wiederherstellen: Name aus Cookie
    const savedName = Utils.getCookie('uname') || localStorage.getItem('uname');
    if(savedName) $('orderer-name').value = savedName;

    // Parallel laden für Speed
    const [contacts, articles] = await Promise.all([
      Api.get('contacts', `?type=eq.${C.APP.TYPE}&order=created_at.asc`),
      Api.get('articles', `?type=eq.${C.APP.TYPE}&order=section.asc,name.asc`),
    ]);

    const categories = articles ? [...new Set(articles.map(a => a.section))].filter(Boolean) : [];

    setState({
      contacts: contacts || [],
      articles: articles || [],
      categories,
    });

    renderContacts();
    renderArticles();

    // Admin-spezifische UI freischalten
    const { isAdmin } = getState();
    if(isAdmin){
      $('tab-stats').style.display = 'flex';
    }
  }


  // ═══════════════════════════════════════════════════════════════
  //  TAB SWITCHING
  // ═══════════════════════════════════════════════════════════════

  function switchTab(tab){
    setState({ currentTab: tab });
    $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
    $$('.page').forEach(p => p.classList.toggle('on', p.id === 'page-' + tab));

    if(tab === 'history') loadOrders();
    if(tab === 'stats') loadStats();
  }


  // ═══════════════════════════════════════════════════════════════
  //  DARK MODE
  // ═══════════════════════════════════════════════════════════════

  function toggleDarkMode(){
    const dark = !getState().darkMode;
    document.body.classList.toggle('dark', dark);
    $('dark-btn').textContent = dark ? '☀️' : '🌙';
    localStorage.setItem('dark', dark ? '1' : '0');
    setState({ darkMode: dark });
  }


  // ═══════════════════════════════════════════════════════════════
  //  CONTACTS RENDERING (XSS-SICHER!)
  // ═══════════════════════════════════════════════════════════════

  function renderContacts(){
    const { contacts, selectedContacts } = getState();
    const el = $('contact-list');

    if(!contacts.length){
      el.innerHTML = `<div class="empty-state" style="padding:20px;"><div class="desc">Noch keine Kontakte angelegt</div></div>`;
      return;
    }

    // ⭐ WICHTIG: Wir bauen die HTML mit safeHtml = jeder Wert wird AUTOMATISCH escaped.
    // KEIN ${userInput} mehr ohne Escape!
    el.innerHTML = contacts.map(c => {
      const isOn = selectedContacts.includes(c.phone);
      return safeHtml`
        <div class="contact-item ${isOn ? 'on' : ''}"
             data-action="contact-toggle"
             data-phone="${c.phone}">
          <div class="chk"><div class="chk-dot"></div></div>
          <div style="flex:1;">
            <div class="cname">${c.name}</div>
            <div class="cphone">+${c.phone}</div>
          </div>
          <button class="btn btn-danger btn-sm"
                  data-action="contact-delete"
                  data-id="${c.id}"
                  data-phone="${c.phone}">✕</button>
        </div>
      `;
    }).join('');

    updateRecipientSummary();
  }

  function toggleContactSelection(phone){
    const { selectedContacts } = getState();
    const newSelected = selectedContacts.includes(phone)
      ? selectedContacts.filter(p => p !== phone)
      : [...selectedContacts, phone];
    setState({ selectedContacts: newSelected });
    renderContacts();
  }

  async function deleteContact(id, phone, event){
    event.stopPropagation();
    if(!confirm('Kontakt löschen?')) return;

    const success = await Api.delete('contacts', `?id=eq.${id}`);
    if(success){
      const { contacts, selectedContacts } = getState();
      setState({
        contacts: contacts.filter(c => c.id !== id),
        selectedContacts: selectedContacts.filter(p => p !== phone),
      });
      renderContacts();
      Toast.success('Kontakt gelöscht');
    }
  }

  async function saveContact(){
    const name = $('new-contact-name').value.trim();
    const phone = $('new-contact-phone').value.replace(/[\s+\-()]/g, '');

    if(!name || phone.length < 6){
      Toast.error('Bitte Name und gültige Nummer eingeben');
      return;
    }

    const saved = await Api.post('contacts', { type: C.APP.TYPE, name, phone });
    if(saved){
      const newContact = Array.isArray(saved) ? saved[0] : saved;
      setState({ contacts: [...getState().contacts, newContact] });
      $('new-contact-name').value = '';
      $('new-contact-phone').value = '';
      $('add-contact-form').style.display = 'none';
      renderContacts();
      Toast.success('Kontakt gespeichert');
    }
  }

  function toggleRecipientCollapse(){
    const body = $('recipient-body');
    const arrow = $('recipient-arrow');
    const collapsed = body.classList.toggle('collapsed');
    arrow.textContent = collapsed ? '▼' : '▲';
    updateRecipientSummary();
  }

  function updateRecipientSummary(){
    const summary = $('recipient-summary');
    const body = $('recipient-body');
    const { contacts, selectedContacts } = getState();
    const selected = contacts.filter(c => selectedContacts.includes(c.phone));

    if(body.classList.contains('collapsed') && selected.length){
      summary.style.display = 'block';
      // SICHER: escapeHTML statt direkter Interpolation
      summary.textContent = '✅ ' + selected.map(c => c.name).join(', ');
    } else {
      summary.style.display = 'none';
    }
  }


  // ═══════════════════════════════════════════════════════════════
  //  ARTICLES RENDERING (XSS-SICHER!)
  // ═══════════════════════════════════════════════════════════════

  function renderArticles(){
    const { articles, cart, searchQuery } = getState();
    const el = $('article-list');

    // Filter (Suche)
    let filtered = articles;
    if(searchQuery.trim()){
      const q = searchQuery.toLowerCase();
      filtered = articles.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.section && a.section.toLowerCase().includes(q))
      );
    }

    // Search-Clear-Button
    $('search-clear-btn').style.display = searchQuery ? 'block' : 'none';

    if(!filtered.length){
      el.innerHTML = `
        <div class="empty-state">
          <div class="icon">${searchQuery ? '🔍' : '📦'}</div>
          <div class="title">${searchQuery ? 'Nichts gefunden' : 'Keine Artikel'}</div>
          <div class="desc">${searchQuery ? 'Versuche einen anderen Suchbegriff' : 'Admin muss Artikel anlegen'}</div>
        </div>`;
      return;
    }

    // Nach Sections gruppieren
    const sections = {};
    filtered.forEach(a => {
      const sec = a.section || 'Sonstige';
      if(!sections[sec]) sections[sec] = [];
      sections[sec].push(a);
    });

    // Sortieren nach Config-Reihenfolge
    const sortedSections = Object.keys(sections).sort((a, b) => {
      const ai = C.SECTION_ORDER.indexOf(a);
      const bi = C.SECTION_ORDER.indexOf(b);
      if(ai === -1 && bi === -1) return a.localeCompare(b);
      if(ai === -1) return 1;
      if(bi === -1) return -1;
      return ai - bi;
    });

    // Build HTML mit DOM-API (XSS-sicher)
    el.innerHTML = '';
    sortedSections.forEach(sec => {
      const header = document.createElement('div');
      header.className = 'section-head';
      header.textContent = sec;  // textContent = sicher!
      el.appendChild(header);

      const body = document.createElement('div');
      body.className = 'section-body';
      sections[sec].forEach(a => {
        body.appendChild(buildArticleRowElement(a, cart[a.id]?.qty || 0));
      });
      el.appendChild(body);
    });
  }

  /**
   * Erzeugt eine Artikel-Zeile als DOM-Element (XSS-sicher).
   * Wir benutzen createElement und textContent statt innerHTML mit Interpolation.
   */
  function buildArticleRowElement(article, qty){
    const row = document.createElement('div');
    row.className = 'article-row';
    row.dataset.id = article.id;

    // Bild oder Placeholder
    if(article.image_url){
      const img = document.createElement('img');
      img.className = 'article-img';
      img.src = article.image_url;
      img.alt = '';
      img.loading = 'lazy';
      row.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'article-img-placeholder';
      ph.textContent = '🖼️';
      row.appendChild(ph);
    }

    // Info (Name, Unit)
    const info = document.createElement('div');
    info.className = 'article-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'article-name';
    nameEl.textContent = article.name;  // SICHER!
    const unitEl = document.createElement('div');
    unitEl.className = 'article-unit';
    unitEl.textContent = article.unit;  // SICHER!
    info.appendChild(nameEl);
    info.appendChild(unitEl);
    row.appendChild(info);

    // Quantity Stepper
    const stepper = document.createElement('div');
    stepper.className = 'qty-stepper';

    const plusBtn = document.createElement('button');
    plusBtn.className = 'qty-btn';
    plusBtn.textContent = '+';
    plusBtn.dataset.action = 'qty-plus';
    plusBtn.dataset.id = article.id;

    const qtyInput = document.createElement('input');
    qtyInput.type = 'tel';
    qtyInput.inputMode = 'numeric';
    qtyInput.id = 'qty-' + article.id;
    qtyInput.className = 'qty-input' + (qty > 0 ? ' active' : '');
    qtyInput.value = qty;
    qtyInput.addEventListener('click', () => qtyInput.select());
    qtyInput.addEventListener('change', () => setArticleQty(article.id, qtyInput.value));

    const minusBtn = document.createElement('button');
    minusBtn.className = 'qty-btn';
    minusBtn.textContent = '−';
    minusBtn.dataset.action = 'qty-minus';
    minusBtn.dataset.id = article.id;

    stepper.appendChild(plusBtn);
    stepper.appendChild(qtyInput);
    stepper.appendChild(minusBtn);
    row.appendChild(stepper);

    return row;
  }


  // ═══════════════════════════════════════════════════════════════
  //  CART LOGIC
  // ═══════════════════════════════════════════════════════════════

  function changeArticleQty(articleId, delta){
    const { articles, cart } = getState();
    const article = articles.find(a => a.id === articleId);
    if(!article) return;

    const newCart = { ...cart };
    if(!newCart[articleId]){
      newCart[articleId] = {
        id: article.id, name: article.name, unit: article.unit,
        section: article.section || '', qty: 0,
      };
    }
    newCart[articleId].qty = Math.max(0, newCart[articleId].qty + delta);
    if(newCart[articleId].qty === 0) delete newCart[articleId];

    setState({ cart: newCart });
    updateQtyDisplay(articleId);
    updateCartButton();
  }

  function setArticleQty(articleId, value){
    const qty = Math.max(0, parseInt(value) || 0);
    const { articles, cart } = getState();
    const article = articles.find(a => a.id === articleId);
    if(!article) return;

    const newCart = { ...cart };
    if(qty > 0){
      newCart[articleId] = {
        id: article.id, name: article.name, unit: article.unit,
        section: article.section || '', qty,
      };
    } else {
      delete newCart[articleId];
    }

    setState({ cart: newCart });
    updateQtyDisplay(articleId);
    updateCartButton();
  }

  function updateQtyDisplay(articleId){
    const { cart } = getState();
    const input = $('qty-' + articleId);
    if(!input) return;
    const qty = cart[articleId]?.qty || 0;
    input.value = qty;
    input.classList.toggle('active', qty > 0);
  }

  function updateCartButton(){
    const { cart } = getState();
    const totalItems = Object.values(cart).reduce((s, i) => s + i.qty, 0);
    const itemCount = Object.keys(cart).length;
    $('cart-badge').textContent = totalItems;
    $('cart-btn').disabled = itemCount === 0;
  }

  function openCart(){
    renderCart();
    $('cart-modal').classList.add('on');
  }
  function closeCart(){
    $('cart-modal').classList.remove('on');
  }

  function renderCart(){
    const { cart, articles } = getState();
    const items = Object.values(cart);
    const el = $('cart-items');

    if(!items.length){
      el.innerHTML = `<div class="empty-state"><div class="icon">🛒</div><div class="title">Warenkorb ist leer</div></div>`;
      return;
    }

    el.innerHTML = '';
    items.forEach(item => {
      const article = articles.find(a => a.id === item.id);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--border);gap:10px;';

      // Bild
      if(article?.image_url){
        const img = document.createElement('img');
        img.src = article.image_url;
        img.style.cssText = 'width:44px;height:44px;border-radius:10px;object-fit:cover;flex-shrink:0;';
        row.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.style.cssText = 'width:44px;height:44px;border-radius:10px;background:var(--bg-soft);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;';
        ph.textContent = '🖼️';
        row.appendChild(ph);
      }

      // Info (XSS-sicher mit textContent)
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      const nameDiv = document.createElement('div');
      nameDiv.style.cssText = 'font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:2px;';
      nameDiv.textContent = item.name;
      const unitDiv = document.createElement('div');
      unitDiv.style.cssText = 'font-size:12px;color:var(--text-secondary);';
      unitDiv.textContent = item.unit;
      info.appendChild(nameDiv);
      info.appendChild(unitDiv);
      row.appendChild(info);

      // Controls
      const ctrls = document.createElement('div');
      ctrls.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';
      ctrls.innerHTML = safeHtml`
        <button class="btn btn-secondary btn-icon" data-action="cart-qty-minus" data-id="${item.id}">−</button>
        <span style="min-width:32px;text-align:center;font-weight:800;">${item.qty}</span>
        <button class="btn btn-success btn-icon" data-action="cart-qty-plus" data-id="${item.id}">+</button>
        <button class="btn btn-danger btn-icon" data-action="cart-remove" data-id="${item.id}">✕</button>
      `;
      row.appendChild(ctrls);
      el.appendChild(row);
    });
  }

  function changeCartQty(articleId, delta){
    const { cart } = getState();
    if(!cart[articleId]) return;
    const newCart = { ...cart };
    newCart[articleId] = { ...newCart[articleId], qty: newCart[articleId].qty + delta };
    if(newCart[articleId].qty <= 0) delete newCart[articleId];
    setState({ cart: newCart });
    renderCart();
    updateCartButton();
    updateQtyDisplay(articleId);
  }

  function removeFromCart(articleId){
    const { cart } = getState();
    const newCart = { ...cart };
    delete newCart[articleId];
    setState({ cart: newCart });
    renderCart();
    updateCartButton();
    updateQtyDisplay(articleId);
  }


  // ═══════════════════════════════════════════════════════════════
  //  SEND ORDER
  // ═══════════════════════════════════════════════════════════════

  async function sendOrder(){
    if(!Utils.checkOrderRateLimit()) return;

    const name = $('orderer-name').value.trim();
    if(!name){
      Toast.error('Bitte Namen eintragen');
      return;
    }

    const { selectedContacts, contacts, cart } = getState();
    const selected = contacts.filter(c => selectedContacts.includes(c.phone));

    if(!selected.length){
      Toast.warning('Bitte mindestens einen Empfänger auswählen');
      closeCart();
      $('recipient-body').classList.remove('collapsed');
      $('recipient-arrow').textContent = '▲';
      $('recipient-toggle').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const items = Object.values(cart).map(i => ({
      item: i.name, qty: String(i.qty), unit: i.unit,
      delivered: '', section: i.section || '',
    }));

    if(!items.length){
      Toast.error('Warenkorb ist leer');
      return;
    }

    const note = $('order-note').value.trim();
    const now = Utils.formatDate();

    // Bestellung in DB speichern
    const sendBtn = $('send-order-btn');
    sendBtn.disabled = true;
    sendBtn.textContent = '⏳ Senden...';

    const result = await Api.post('orders', {
      type: C.APP.TYPE,
      orderer: name,
      items, note, date: now, status: 'offen',
      contacts: selected.map(c => ({ name: c.name, phone: c.phone })),
      status_time: '',
    });

    sendBtn.disabled = false;
    sendBtn.textContent = '📤 Bestellung senden';

    if(!result){
      Toast.error('Bestellung konnte nicht gespeichert werden');
      return;
    }

    // WhatsApp-Nachricht bauen
    let msg = `🍽️ *NEUE BESTELLUNG*\n━━━━━━━━━━━━━━━━━━━━\n${C.APP.EMOJI} *${C.APP.NAME.toUpperCase()}*\n👤 *${name}*\n📅 ${now}\n━━━━━━━━━━━━━━━━━━━━\n\n*ARTIKEL:*\n`;
    items.forEach(i => msg += `▸ ${i.item}: *${i.qty} ${i.unit}*\n`);
    if(note) msg += `\n📝 ${note}\n`;
    msg += `\n━━━━━━━━━━━━━━━━━━━━\nBitte bestätigen ✅`;

    // Reset
    closeCart();
    setState({ cart: {} });
    $('order-note').value = '';
    updateCartButton();
    renderArticles();
    Utils.setCookie('uname', name);
    localStorage.setItem('uname', name);

    Toast.success('Bestellung gesendet!', 4000);

    // WhatsApp öffnen (gestaffelt)
    selected.forEach((c, i) => {
      setTimeout(() => {
        window.open(`https://wa.me/${c.phone}?text=${encodeURIComponent(msg)}`, '_blank');
      }, i * 800);
    });
  }


  // ═══════════════════════════════════════════════════════════════
  //  ORDERS (HISTORY)
  // ═══════════════════════════════════════════════════════════════

  async function loadOrders(){
    const el = $('order-list');
    el.innerHTML = `<div class="empty-state"><div class="icon">⏳</div><div class="title">Lädt...</div></div>`;

    const data = await Api.get('orders', `?type=eq.${C.APP.TYPE}&order=created_at.desc&limit=50`);
    if(!data || !data.length){
      el.innerHTML = `<div class="empty-state"><div class="icon">📭</div><div class="title">Keine Bestellungen</div><div class="desc">Bestellungen erscheinen hier nach dem Senden</div></div>`;
      return;
    }

    setState({ orders: data });
    el.innerHTML = '';

    data.forEach(order => {
      const statusInfo = C.ORDER_STATUS[order.status] || C.ORDER_STATUS.offen;
      const card = document.createElement('div');
      card.className = 'order-card';

      // Header (clickable to expand)
      const head = document.createElement('div');
      head.className = 'order-head';
      head.dataset.action = 'order-expand';
      head.innerHTML = safeHtml`
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span class="order-name">${order.orderer}</span>
          <span class="order-status ${statusInfo.color}">${statusInfo.label}</span>
        </div>
        <div class="order-date">${order.date}</div>
      `;
      card.appendChild(head);

      // Body
      const body = document.createElement('div');
      body.className = 'order-body';

      const itemsDiv = document.createElement('div');
      itemsDiv.style.marginBottom = '8px';
      order.items.forEach(i => {
        const pill = document.createElement('span');
        pill.className = 'item-pill';
        pill.textContent = `${i.item}: ${i.qty} ${i.unit || ''}`;
        itemsDiv.appendChild(pill);
      });
      body.appendChild(itemsDiv);

      if(order.note){
        const note = document.createElement('div');
        note.style.cssText = 'background:var(--tint-warn);border-radius:8px;padding:8px;font-size:13px;color:#78350f;';
        note.textContent = '📝 ' + order.note;
        body.appendChild(note);
      }

      card.appendChild(body);
      el.appendChild(card);
    });
  }


  // ═══════════════════════════════════════════════════════════════
  //  STATS (Admin only)
  // ═══════════════════════════════════════════════════════════════

  async function loadStats(){
    const el = $('stats-content');
    el.innerHTML = `<div class="empty-state"><div class="icon">⏳</div><div class="title">Lädt...</div></div>`;

    const data = await Api.get('orders', `?type=eq.${C.APP.TYPE}&order=created_at.desc`) || [];
    const { statFilter } = getState();
    const now = new Date();

    const filtered = data.filter(o => {
      if(!o.date) return true;
      const parts = o.date.split(', ');
      if(!parts[0]) return true;
      const [d, m, y] = parts[0].split('.');
      const dt = new Date(`${y}-${m}-${d}`);
      if(statFilter === 'week') return dt >= new Date(now - 7 * 864e5);
      if(statFilter === 'month') return dt >= new Date(now - 30 * 864e5);
      return true;
    });

    const totals = {};
    filtered.forEach(o => o.items.forEach(i => {
      if(!totals[i.item]) totals[i.item] = { name: i.item, qty: 0, unit: i.unit || '' };
      totals[i.item].qty += parseFloat(i.qty) || 0;
    }));

    const sorted = Object.values(totals).sort((a, b) => b.qty - a.qty);
    const maxQty = sorted[0]?.qty || 1;

    if(!sorted.length){
      el.innerHTML = `<div class="empty-state"><div class="icon">📊</div><div class="title">Keine Daten</div></div>`;
      return;
    }

    // Render (XSS-sicher mit DOM-API)
    el.innerHTML = '';

    // Filter buttons
    const filterBar = document.createElement('div');
    filterBar.style.cssText = 'display:flex;gap:6px;margin-bottom:16px;';
    ['week', 'month', 'all'].forEach(f => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (statFilter === f ? 'btn-primary' : 'btn-secondary');
      btn.style.flex = '1';
      btn.textContent = { week: 'Woche', month: 'Monat', all: 'Alles' }[f];
      btn.onclick = () => { setState({ statFilter: f }); loadStats(); };
      filterBar.appendChild(btn);
    });
    el.appendChild(filterBar);

    // Summary
    const summary = document.createElement('div');
    summary.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;';
    summary.innerHTML = safeHtml`
      <div class="card" style="text-align:center;">
        <div style="font-size:24px;font-weight:800;color:var(--brand-secondary);">${filtered.length}</div>
        <div style="font-size:12px;color:var(--text-secondary);">Bestellungen</div>
      </div>
      <div class="card" style="text-align:center;">
        <div style="font-size:24px;font-weight:800;color:var(--brand-secondary);">${sorted.length}</div>
        <div style="font-size:12px;color:var(--text-secondary);">Artikel</div>
      </div>
    `;
    el.appendChild(summary);

    // Items list
    const list = document.createElement('div');
    list.className = 'card';
    const listTitle = document.createElement('div');
    listTitle.style.cssText = 'font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:12px;';
    listTitle.textContent = '📦 Bestellte Artikel';
    list.appendChild(listTitle);

    sorted.forEach(item => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:13px;';
      const name = document.createElement('span');
      name.style.cssText = 'flex:1;color:var(--text-primary);';
      name.textContent = item.name;
      const bar = document.createElement('div');
      bar.style.cssText = 'width:80px;height:6px;background:var(--bg-soft);border-radius:3px;overflow:hidden;';
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;width:${(item.qty / maxQty * 100)}%;background:var(--brand-secondary);`;
      bar.appendChild(fill);
      const qty = document.createElement('span');
      qty.style.cssText = 'min-width:40px;text-align:right;font-weight:800;color:var(--text-primary);';
      qty.textContent = item.qty;
      row.appendChild(name);
      row.appendChild(bar);
      row.appendChild(qty);
      list.appendChild(row);
    });
    el.appendChild(list);
  }


  // ═══════════════════════════════════════════════════════════════
  //  ADMIN
  // ═══════════════════════════════════════════════════════════════

  function handleAdminClick(){
    const { isAdmin, isAuthenticated } = getState();
    if(!isAuthenticated){
      Toast.warning('Bitte zuerst anmelden');
      return;
    }
    if(isAdmin){
      Toast.info('Admin-Panel öffnen (TODO: in v3 implementieren)');
    } else {
      Toast.warning('Keine Admin-Rechte – Account muss als Admin freigeschaltet werden');
    }
  }


  // ═══════════════════════════════════════════════════════════════
  //  STATE → UI SYNC
  // ═══════════════════════════════════════════════════════════════
  //  Wenn sich State ändert, wird das hier reflektiert.
  //  (Bisher klein, kann ausgebaut werden)
  // ═══════════════════════════════════════════════════════════════

  function syncUIFromState(state){
    // Online-Bar
    $('offline-bar').classList.toggle('on', !state.isOnline);
  }


  // ═══════════════════════════════════════════════════════════════
  //  START
  // ═══════════════════════════════════════════════════════════════

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
