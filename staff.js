/**
 * ─────────────────────────────────────────────────────────────────
 *  STAFF.JS – Mitarbeiter-Verwaltung
 * ─────────────────────────────────────────────────────────────────
 *  Funktionen:
 *  - Ausstehende Registrierungen anzeigen & freischalten
 *  - Aktive Mitarbeiter anzeigen, Rolle ändern, sperren, löschen
 *  - Nur für Admins zugänglich
 *
 *  DB-Tabellen:
 *  - pending_users  → neue Registrierungen (noch nicht freigeschaltet)
 *  - user_roles     → freigeschaltete User mit Rolle
 *  - admin_users    → Admins (separat, extra Schutz)
 * ─────────────────────────────────────────────────────────────────
 */

(function(){
  'use strict';

  const { Api, Toast, Utils, escapeHTML, getState, config: C } = window.AppCore;
  const $ = id => document.getElementById(id);

  const ROLES = [
    { value: 'airside', label: '✈️ Airside',  color: '#1e40af', bg: '#dbeafe' },
    { value: 'lager',   label: '📦 Lager',    color: '#92400e', bg: '#fef3c7' },
    { value: 'admin',   label: '🔴 Admin',    color: '#991b1b', bg: '#fee2e2' },
  ];

  // ═══════════════════════════════════════════════════════════════
  //  OPEN / CLOSE
  // ═══════════════════════════════════════════════════════════════

  function openStaff(){
    if(!getState().isAdmin){ Toast.warning('Nur für Admins'); return; }
    $('staff-modal').classList.add('on');
    loadStaffData();
  }

  function closeStaff(){
    $('staff-modal').classList.remove('on');
  }

  // ═══════════════════════════════════════════════════════════════
  //  DATEN LADEN
  // ═══════════════════════════════════════════════════════════════

  async function loadStaffData(){
    renderStaffSkeleton();

    // Parallel laden
    const [pending, roles] = await Promise.all([
      Api.get('pending_users', '?order=created_at.desc'),
      Api.get('user_roles',    '?order=created_at.asc'),
    ]);

    // Pending: nur die anzeigen die noch nicht in user_roles sind
    const approvedIds = new Set((roles || []).map(r => r.user_id));
    const pendingFiltered = (pending || []).filter(u => !approvedIds.has(u.user_id));

    // Badge auf Admin-Button setzen
    updatePendingBadge(pendingFiltered.length);

    renderPendingUsers(pendingFiltered);
    renderActiveUsers(roles || []);
  }

  function updatePendingBadge(count){
    // Badge auf dem Mitarbeiter-Button im Admin-Panel
    const badge = $('staff-pending-badge');
    if(!badge) return;
    badge.textContent = count > 0 ? count : '';
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  // ═══════════════════════════════════════════════════════════════
  //  PENDING USERS RENDERN
  // ═══════════════════════════════════════════════════════════════

  function renderPendingUsers(users){
    const el = $('staff-pending-list');
    if(!el) return;

    const header = $('staff-pending-header');
    if(header){
      header.textContent = `⏳ Ausstehend (${users.length})`;
      header.style.color = users.length > 0 ? 'var(--status-warn)' : 'var(--text-secondary)';
    }

    if(!users.length){
      el.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:13px;">✅ Keine ausstehenden Anfragen</div>`;
      return;
    }

    el.innerHTML = '';
    users.forEach(u => el.appendChild(buildPendingRow(u)));
  }

  function buildPendingRow(user){
    const row = document.createElement('div');
    row.className = 'staff-row staff-pending';
    row.dataset.id = user.user_id;

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'staff-avatar pending';
    avatar.textContent = (user.full_name || user.email || '?')[0].toUpperCase();

    // Info
    const info = document.createElement('div');
    info.className = 'staff-info';
    const name = document.createElement('div');
    name.className = 'staff-name';
    name.textContent = user.full_name || '–';
    const email = document.createElement('div');
    email.className = 'staff-meta';
    email.textContent = user.email || '';
    const phone = document.createElement('div');
    phone.className = 'staff-meta';
    phone.textContent = user.phone ? '📞 ' + user.phone : '';
    info.appendChild(name);
    info.appendChild(email);
    if(user.phone) info.appendChild(phone);

    // Rolle-Select
    const roleSelect = document.createElement('select');
    roleSelect.className = 'staff-role-select';
    roleSelect.id = 'role-select-' + user.user_id;
    ROLES.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.value;
      opt.textContent = r.label;
      roleSelect.appendChild(opt);
    });

    // Buttons
    const btns = document.createElement('div');
    btns.className = 'staff-btns';

    const approveBtn = document.createElement('button');
    approveBtn.className = 'btn btn-success btn-sm';
    approveBtn.textContent = '✅ Freischalten';
    approveBtn.onclick = () => approveUser(user.user_id, user.email, roleSelect.value, user.full_name);

    const denyBtn = document.createElement('button');
    denyBtn.className = 'btn btn-danger btn-sm';
    denyBtn.textContent = '🗑️ Ablehnen';
    denyBtn.onclick = () => denyUser(user.user_id, user.full_name || user.email);

    btns.appendChild(approveBtn);
    btns.appendChild(denyBtn);

    row.appendChild(avatar);
    row.appendChild(info);
    row.appendChild(roleSelect);
    row.appendChild(btns);
    return row;
  }

  // ═══════════════════════════════════════════════════════════════
  //  AKTIVE USER RENDERN
  // ═══════════════════════════════════════════════════════════════

  function renderActiveUsers(roles){
    const el = $('staff-active-list');
    if(!el) return;

    // Owner ausblenden
    const visible = roles.filter(u => u.user_id !== C.OWNER_ID);

    const header = $('staff-active-header');
    if(header) header.textContent = `👥 Aktive Mitarbeiter (${visible.length})`;

    if(!visible.length){
      el.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:13px;">Noch keine Mitarbeiter freigeschaltet</div>`;
      return;
    }

    el.innerHTML = '';
    visible.forEach(u => el.appendChild(buildActiveRow(u)));
  }

  function buildActiveRow(user){
    const row = document.createElement('div');
    row.className = 'staff-row';
    row.dataset.id = user.user_id;

    const roleInfo = ROLES.find(r => r.value === user.role) || ROLES[0];

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'staff-avatar active';
    avatar.textContent = (user.email || '?')[0].toUpperCase();

    // Info
    const info = document.createElement('div');
    info.className = 'staff-info';
    const email = document.createElement('div');
    email.className = 'staff-name';
    email.textContent = user.email || user.user_id.substring(0, 12) + '...';
    const roleBadge = document.createElement('span');
    roleBadge.className = 'role-badge';
    roleBadge.style.cssText = `background:${roleInfo.bg};color:${roleInfo.color};`;
    roleBadge.textContent = roleInfo.label;
    info.appendChild(email);
    info.appendChild(roleBadge);

    // Rolle ändern
    const roleSelect = document.createElement('select');
    roleSelect.className = 'staff-role-select';
    ROLES.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.value;
      opt.textContent = r.label;
      if(r.value === user.role) opt.selected = true;
      roleSelect.appendChild(opt);
    });
    roleSelect.onchange = () => changeRole(user.id, roleSelect.value, user.email);

    // Löschen
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger btn-sm';
    delBtn.title = 'Mitarbeiter sperren';
    delBtn.textContent = '🚫 Sperren';
    delBtn.onclick = () => removeUser(user.id, user.user_id, user.email);

    row.appendChild(avatar);
    row.appendChild(info);
    row.appendChild(roleSelect);
    row.appendChild(delBtn);
    return row;
  }

  // ═══════════════════════════════════════════════════════════════
  //  ACTIONS
  // ═══════════════════════════════════════════════════════════════

  async function approveUser(userId, email, role, name){
    if(!getState().isAdmin){ Toast.warning('Keine Rechte'); return; }

    const ok = await Api.post('user_roles', { user_id: userId, role, email });
    if(!ok){ Toast.error('Freischalten fehlgeschlagen'); return; }

    await Api.delete('pending_users', `?user_id=eq.${userId}`);
    Toast.success(`✅ ${name || email} freigeschaltet als ${role}`);
    await loadStaffData();
  }

  async function denyUser(userId, name){
    if(!getState().isAdmin){ Toast.warning('Keine Rechte'); return; }

    showStaffConfirm(
      `Registrierung von "${name}" ablehnen?`,
      'Der User wird aus der Warteliste entfernt. Er kann sich weiterhin registrieren.',
      async () => {
        await Api.delete('pending_users', `?user_id=eq.${userId}`);
        Toast.info(`Registrierung abgelehnt`);
        await loadStaffData();
      }
    );
  }

  async function changeRole(roleId, newRole, email){
    if(!getState().isAdmin){ Toast.warning('Keine Rechte'); return; }

    const ok = await Api.patch('user_roles', `?id=eq.${roleId}`, { role: newRole });
    if(!ok){ Toast.error('Rolle konnte nicht geändert werden'); return; }

    const roleInfo = ROLES.find(r => r.value === newRole);
    Toast.success(`Rolle von ${email} → ${roleInfo?.label || newRole}`);
    await loadStaffData();
  }

  async function removeUser(roleId, userId, email){
    if(!getState().isAdmin){ Toast.warning('Keine Rechte'); return; }

    showStaffConfirm(
      `"${email}" sperren?`,
      'Der Mitarbeiter verliert sofort seinen Zugang. Er kann erneut registriert und freigeschaltet werden.',
      async () => {
        await Api.delete('user_roles', `?id=eq.${roleId}`);
        Toast.success(`${email} gesperrt`);
        await loadStaffData();
      }
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  CONFIRM DIALOG
  // ═══════════════════════════════════════════════════════════════

  function showStaffConfirm(title, message, onConfirm){
    const existing = document.getElementById('staff-confirm-dialog');
    if(existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'staff-confirm-dialog';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';

    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border-radius:16px;padding:24px;max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.4);';

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
    confirmBtn.textContent = 'Bestätigen';
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
  //  SKELETON
  // ═══════════════════════════════════════════════════════════════

  function renderStaffSkeleton(){
    const els = [$('staff-pending-list'), $('staff-active-list')];
    els.forEach(el => {
      if(!el) return;
      el.innerHTML = `
        <div class="admin-skeleton" style="height:64px;margin-bottom:8px;"></div>
        <div class="admin-skeleton" style="height:64px;margin-bottom:8px;"></div>
      `;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  window.Staff = {
    open:   openStaff,
    close:  closeStaff,
    reload: loadStaffData,
  };

})();
