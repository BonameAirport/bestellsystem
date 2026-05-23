/**
 * ─────────────────────────────────────────────────────────────────
 *  ADMIN.JS – Admin Panel
 * ─────────────────────────────────────────────────────────────────
 *  Funktionen:
 *  - Artikel anlegen / editieren / löschen (mit Confirm)
 *  - Bild-Upload pro Artikel
 *  - Kategorie anlegen / löschen
 *  - Drag & Drop zum Sortieren
 *  - Artikel als inaktiv markieren statt löschen
 *
 *  Sicherheit:
 *  - Jede Funktion prüft state.isAdmin BEVOR API-Call
 *  - Alle User-Inputs: textContent oder escapeHTML
 *  - Bild-Upload: Typ + Größe validiert
 * ─────────────────────────────────────────────────────────────────
 */

(function(){
  'use strict';

  const { Api, Toast, Utils, escapeHTML, safeHtml, getState, setState, config: C } = window.AppCore;
  const $ = id => document.getElementById(id);

  // ─── Lokaler Admin-State ─────────────────────────────────────
  let adminArticles  = [];   // alle Artikel (inkl. inaktive)
  let adminCategories = [];  // alle Kategorien
  let showInactive   = false;
  let editingId      = null; // welcher Artikel gerade editiert wird
  let dragSrcId      = null; // Drag & Drop: Quell-Artikel

  // ═══════════════════════════════════════════════════════════════
  //  OPEN / CLOSE
  // ═══════════════════════════════════════════════════════════════

  async function openAdmin(){
    if(!getState().isAdmin){
      Toast.warning('Keine Admin-Rechte');
      return;
    }
    $('admin-modal').classList.add('on');
    await loadAdminData();
  }

  function closeAdmin(){
    $('admin-modal').classList.remove('on');
    editingId = null;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DATA LOADING
  // ═══════════════════════════════════════════════════════════════

  async function loadAdminData(){
    renderAdminSkeleton();
    const data = await Api.get('articles', `?type=eq.${C.APP.TYPE}&order=sort_order.asc,section.asc,name.asc`);
    if(!data){ Toast.error('Artikel konnten nicht geladen werden'); return; }

    adminArticles   = data;
    adminCategories = [...new Set(data.map(a => a.section))].filter(Boolean).sort();
    populateCategorySelect();
    renderAdminArticles();
  }

  // ═══════════════════════════════════════════════════════════════
  //  CATEGORY SELECT BEFÜLLEN
  // ═══════════════════════════════════════════════════════════════

  function populateCategorySelect(){
    const sel = $('admin-cat-select');
    if(!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">-- Kategorie wählen --</option>';
    adminCategories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      sel.appendChild(opt);
    });
    // Option: Neue Kategorie
    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '＋ Neue Kategorie anlegen...';
    sel.appendChild(newOpt);
    if(current) sel.value = current;
  }

  function handleCategorySelectChange(){
    const sel = $('admin-cat-select');
    const newCatWrap = $('admin-new-cat-wrap');
    if(sel.value === '__new__'){
      newCatWrap.style.display = 'block';
      $('admin-new-cat-input').focus();
    } else {
      newCatWrap.style.display = 'none';
    }
  }

  function getSelectedCategory(){
    const sel = $('admin-cat-select');
    if(sel.value === '__new__'){
      const name = $('admin-new-cat-input').value.trim();
      if(!name){ Toast.error('Bitte Kategoriename eingeben'); return null; }
      return name;
    }
    if(!sel.value){ Toast.error('Bitte Kategorie wählen'); return null; }
    return sel.value;
  }

  // ═══════════════════════════════════════════════════════════════
  //  ARTIKEL RENDERN
  // ═══════════════════════════════════════════════════════════════

  function renderAdminSkeleton(){
    const el = $('admin-art-list');
    if(!el) return;
    el.innerHTML = `
      <div class="admin-skeleton"></div>
      <div class="admin-skeleton"></div>
      <div class="admin-skeleton"></div>
    `;
  }

  function renderAdminArticles(){
    const el = $('admin-art-list');
    if(!el) return;
    el.innerHTML = '';

    const visible = adminArticles.filter(a => showInactive ? true : a.is_active !== false);
    if(!visible.length){
      el.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">
        ${showInactive ? 'Keine Artikel vorhanden' : 'Keine aktiven Artikel – Toggle "Inaktive anzeigen"'}
      </div>`;
      return;
    }

    // Gruppieren nach Kategorie
    const sections = {};
    visible.forEach(a => {
      const sec = a.section || 'Sonstige';
      if(!sections[sec]) sections[sec] = [];
      sections[sec].push(a);
    });

    Object.entries(sections).forEach(([sec, arts]) => {
      // Sektion-Header
      const header = document.createElement('div');
      header.className = 'admin-section-head';
      header.textContent = sec;
      el.appendChild(header);

      // Artikel in dieser Sektion
      arts.forEach(a => el.appendChild(buildAdminRow(a)));
    });

    // Toggle-Button für inaktive
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn btn-secondary btn-sm btn-block';
    toggleBtn.style.marginTop = '12px';
    toggleBtn.textContent = showInactive ? '👁️ Nur aktive anzeigen' : '👁️ Inaktive auch anzeigen';
    toggleBtn.onclick = () => { showInactive = !showInactive; renderAdminArticles(); };
    el.appendChild(toggleBtn);
  }

  function buildAdminRow(article){
    const row = document.createElement('div');
    row.className = 'admin-art-row' + (article.is_active === false ? ' inactive' : '');
    row.dataset.id = article.id;
    row.draggable = true;

    // Drag handle
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.title = 'Ziehen zum Sortieren';

    // Bild
    const imgWrap = document.createElement('div');
    imgWrap.style.cssText = 'flex-shrink:0;position:relative;';
    if(article.image_url){
      const img = document.createElement('img');
      img.src = article.image_url;
      img.style.cssText = 'width:36px;height:36px;border-radius:8px;object-fit:cover;';
      imgWrap.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.style.cssText = 'width:36px;height:36px;border-radius:8px;background:var(--bg-soft);display:flex;align-items:center;justify-content:center;font-size:16px;border:1.5px dashed var(--border);';
      ph.textContent = '🖼️';
      imgWrap.appendChild(ph);
    }

    // Info
    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';
    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-size:13px;font-weight:700;color:var(--text-primary);';
    nameEl.textContent = article.name;
    const metaEl = document.createElement('div');
    metaEl.style.cssText = 'font-size:11px;color:var(--text-muted);margin-top:1px;';
    metaEl.textContent = article.unit + (article.is_active === false ? ' · ⏸️ Inaktiv' : '');
    info.appendChild(nameEl);
    info.appendChild(metaEl);

    // Buttons
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:4px;flex-shrink:0;';

    // Bild-Upload
    const imgLabel = document.createElement('label');
    imgLabel.className = 'btn btn-secondary btn-sm';
    imgLabel.title = 'Bild hochladen';
    imgLabel.textContent = '📷';
    imgLabel.style.cursor = 'pointer';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => uploadArticleImage(fileInput, article.id, article.name));
    imgLabel.appendChild(fileInput);

    // Edit
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-secondary btn-sm';
    editBtn.title = 'Bearbeiten';
    editBtn.textContent = '✏️';
    editBtn.onclick = () => openEditForm(article);

    // Aktiv/Inaktiv Toggle
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn btn-sm ' + (article.is_active === false ? 'btn-success' : 'btn-warning');
    toggleBtn.title = article.is_active === false ? 'Aktivieren' : 'Deaktivieren';
    toggleBtn.textContent = article.is_active === false ? '▶️' : '⏸️';
    toggleBtn.onclick = () => toggleArticleActive(article.id, article.is_active !== false);

    // Löschen
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger btn-sm';
    delBtn.title = 'Löschen';
    delBtn.textContent = '🗑️';
    delBtn.onclick = () => confirmDeleteArticle(article.id, article.name);

    btns.appendChild(imgLabel);
    btns.appendChild(editBtn);
    btns.appendChild(toggleBtn);
    btns.appendChild(delBtn);

    row.appendChild(handle);
    row.appendChild(imgWrap);
    row.appendChild(info);
    row.appendChild(btns);

    // Drag & Drop Events
    row.addEventListener('dragstart', onDragStart);
    row.addEventListener('dragover',  onDragOver);
    row.addEventListener('drop',      onDrop);
    row.addEventListener('dragend',   onDragEnd);

    return row;
  }

  // ═══════════════════════════════════════════════════════════════
  //  ARTIKEL HINZUFÜGEN
  // ═══════════════════════════════════════════════════════════════

  async function addArticle(){
    if(!getState().isAdmin){ Toast.warning('Keine Admin-Rechte'); return; }

    const name    = $('admin-art-name').value.trim();
    const unit    = $('admin-art-unit').value.trim();
    const section = getSelectedCategory();

    if(!name)    { Toast.error('Bitte Artikelname eingeben'); return; }
    if(!unit)    { Toast.error('Bitte Einheit eingeben (z.B. KG, Karton)'); return; }
    if(!section) { return; } // Fehler bereits in getSelectedCategory()

    const btn = $('admin-add-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Speichern...';

    const result = await Api.post('articles', {
      type: C.APP.TYPE,
      name, unit, section,
      name_en: name, name_tr: name,
      is_active: true,
      sort_order: adminArticles.length,
    });

    btn.disabled = false;
    btn.textContent = '✅ Artikel hinzufügen';

    if(!result){
      Toast.error('Artikel konnte nicht gespeichert werden');
      return;
    }

    // Felder leeren
    $('admin-art-name').value = '';
    $('admin-art-unit').value = '';
    $('admin-cat-select').value = '';
    $('admin-new-cat-wrap').style.display = 'none';
    $('admin-new-cat-input').value = '';

    Toast.success(`"${name}" hinzugefügt`);

    // App-State aktualisieren (damit die Bestellseite sofort den neuen Artikel sieht)
    await loadAdminData();
    await refreshMainArticles();
  }

  // ═══════════════════════════════════════════════════════════════
  //  ARTIKEL EDITIEREN
  // ═══════════════════════════════════════════════════════════════

  function openEditForm(article){
    editingId = article.id;
    $('admin-edit-section').style.display = 'block';
    $('admin-edit-name').value = article.name;
    $('admin-edit-unit').value = article.unit;
    $('admin-edit-title').textContent = `✏️ "${article.name}" bearbeiten`;
    $('admin-edit-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeEditForm(){
    editingId = null;
    $('admin-edit-section').style.display = 'none';
    $('admin-edit-name').value = '';
    $('admin-edit-unit').value = '';
  }

  async function saveEdit(){
    if(!editingId || !getState().isAdmin) return;

    const name = $('admin-edit-name').value.trim();
    const unit = $('admin-edit-unit').value.trim();

    if(!name){ Toast.error('Name darf nicht leer sein'); return; }
    if(!unit){ Toast.error('Einheit darf nicht leer sein'); return; }

    const btn = $('admin-save-edit-btn');
    btn.disabled = true;
    btn.textContent = '⏳...';

    const ok = await Api.patch('articles', `?id=eq.${editingId}`, {
      name, unit, name_en: name, name_tr: name,
    });

    btn.disabled = false;
    btn.textContent = '✅ Speichern';

    if(!ok){ Toast.error('Konnte nicht gespeichert werden'); return; }

    Toast.success('Gespeichert');
    closeEditForm();
    await loadAdminData();
    await refreshMainArticles();
  }

  // ═══════════════════════════════════════════════════════════════
  //  ARTIKEL AKTIV / INAKTIV
  // ═══════════════════════════════════════════════════════════════

  async function toggleArticleActive(id, currentlyActive){
    if(!getState().isAdmin){ Toast.warning('Keine Admin-Rechte'); return; }

    const ok = await Api.patch('articles', `?id=eq.${id}`, {
      is_active: !currentlyActive,
    });
    if(!ok){ Toast.error('Konnte nicht geändert werden'); return; }

    Toast.success(currentlyActive ? 'Artikel deaktiviert' : 'Artikel aktiviert');
    await loadAdminData();
    await refreshMainArticles();
  }

  // ═══════════════════════════════════════════════════════════════
  //  ARTIKEL LÖSCHEN (mit Confirm)
  // ═══════════════════════════════════════════════════════════════

  function confirmDeleteArticle(id, name){
    showConfirmDialog(
      `🗑️ "${name}" wirklich löschen?`,
      'Diese Aktion kann nicht rückgängig gemacht werden. Tipp: Statt löschen kannst du den Artikel auch deaktivieren (⏸️).',
      async () => {
        const ok = await Api.delete('articles', `?id=eq.${id}`);
        if(!ok){ Toast.error('Löschen fehlgeschlagen'); return; }
        Toast.success(`"${name}" gelöscht`);
        await loadAdminData();
        await refreshMainArticles();
      }
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  BILD-UPLOAD
  // ═══════════════════════════════════════════════════════════════

  async function uploadArticleImage(input, articleId, articleName){
    const file = input.files[0];
    if(!file) return;

    // Validierung: nur Bilder
    if(!file.type.startsWith('image/')){
      Toast.error('Nur Bilddateien erlaubt (JPG, PNG, WebP)');
      return;
    }
    // Validierung: max 5MB
    if(file.size > 5 * 1024 * 1024){
      Toast.error('Bild zu groß – maximal 5 MB');
      return;
    }

    Toast.info('Bild wird hochgeladen...');

    const safeName = articleName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const ext = file.name.split('.').pop().toLowerCase();
    const path = `${safeName}_${articleId}_${Date.now()}.${ext}`;

    const url = await Api.uploadImage('artikel-bilder', path, file);
    if(!url){ return; } // Fehler bereits als Toast

    const ok = await Api.patch('articles', `?id=eq.${articleId}`, { image_url: url });
    if(!ok){ Toast.error('Bild-URL konnte nicht gespeichert werden'); return; }

    Toast.success('Bild hochgeladen');
    await loadAdminData();
    await refreshMainArticles();
  }

  // ═══════════════════════════════════════════════════════════════
  //  DRAG & DROP
  // ═══════════════════════════════════════════════════════════════

  function onDragStart(e){
    dragSrcId = parseInt(this.dataset.id);
    this.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e){
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.style.background = 'var(--tint-info)';
  }

  function onDragEnd(){
    this.style.opacity = '1';
    // Alle Highlights entfernen
    document.querySelectorAll('.admin-art-row').forEach(r => r.style.background = '');
  }

  async function onDrop(e){
    e.preventDefault();
    this.style.background = '';

    const dropId = parseInt(this.dataset.id);
    if(!dragSrcId || dragSrcId === dropId) return;

    // Reihenfolge in adminArticles anpassen
    const srcIdx  = adminArticles.findIndex(a => a.id === dragSrcId);
    const dropIdx = adminArticles.findIndex(a => a.id === dropId);
    if(srcIdx === -1 || dropIdx === -1) return;

    // Nur innerhalb derselben Sektion erlaubt
    if(adminArticles[srcIdx].section !== adminArticles[dropIdx].section){
      Toast.warning('Artikel können nur innerhalb einer Kategorie sortiert werden');
      return;
    }

    // Array neu sortieren
    const moved = adminArticles.splice(srcIdx, 1)[0];
    adminArticles.splice(dropIdx, 0, moved);

    // sort_order in DB speichern (parallel für Speed)
    const updates = adminArticles.map((a, i) =>
      Api.patch('articles', `?id=eq.${a.id}`, { sort_order: i })
    );
    await Promise.all(updates);

    Toast.success('Reihenfolge gespeichert');
    renderAdminArticles();
    await refreshMainArticles();
  }

  // ═══════════════════════════════════════════════════════════════
  //  CONFIRM DIALOG (sauber, statt window.confirm)
  // ═══════════════════════════════════════════════════════════════

  function showConfirmDialog(title, message, onConfirm){
    // Altes Dialog entfernen falls da
    const existing = $('confirm-dialog');
    if(existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'confirm-dialog';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.6);
      z-index:9998;display:flex;align-items:center;justify-content:center;padding:24px;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      background:var(--bg-card);border-radius:16px;padding:24px;
      max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.4);
    `;

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:16px;font-weight:800;color:var(--text-primary);margin-bottom:8px;';
    titleEl.textContent = title;

    const msgEl = document.createElement('div');
    msgEl.style.cssText = 'font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.5;';
    msgEl.textContent = message;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.style.flex = '1';
    cancelBtn.textContent = 'Abbrechen';
    cancelBtn.onclick = () => overlay.remove();

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-danger';
    confirmBtn.style.flex = '1';
    confirmBtn.textContent = 'Ja, löschen';
    confirmBtn.onclick = () => { overlay.remove(); onConfirm(); };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    box.appendChild(titleEl);
    box.appendChild(msgEl);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    overlay.addEventListener('click', e => { if(e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // ═══════════════════════════════════════════════════════════════
  //  HAUPT-ARTIKEL AKTUALISIEREN (nach Admin-Änderungen)
  // ═══════════════════════════════════════════════════════════════

  async function refreshMainArticles(){
    // App-State aktualisieren, damit die Bestell-Seite sofort up-to-date ist
    const data = await Api.get('articles', `?type=eq.${C.APP.TYPE}&is_active=eq.true&order=sort_order.asc,section.asc,name.asc`);
    if(data){
      const categories = [...new Set(data.map(a => a.section))].filter(Boolean);
      setState({ articles: data, categories });
      // renderArticles aus app.js aufrufen (globale Funktion, registriert in AppCore)
      if(window._renderArticles) window._renderArticles();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API – wird von app.js genutzt
  // ═══════════════════════════════════════════════════════════════

  window.Admin = {
    open: openAdmin,
    close: closeAdmin,
  };

  window.AdminActions = {
    addArticle,
    saveEdit,
    closeEditForm,
    handleCategorySelectChange,
  };

})();
