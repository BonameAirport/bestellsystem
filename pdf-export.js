/**
 * ─────────────────────────────────────────────────────────────────
 *  PDF-EXPORT.JS – Bestellbericht exportieren
 * ─────────────────────────────────────────────────────────────────
 *  Nur für Admins sichtbar.
 *  Zeiträume: Heute, 7 Tage, Monat, Jahr, Custom
 *  Funktioniert für alle 3 Bestellseiten (liest APP_CONFIG.APP.TYPE)
 *
 *  Technik: Öffnet ein Print-Fenster mit professionellem HTML-Layout.
 *  Kein externes PDF-Library nötig – Browser-Print = PDF.
 * ─────────────────────────────────────────────────────────────────
 */

(function(){
  'use strict';

  const { Api, Toast, getState, config: C } = window.AppCore;
  const $ = id => document.getElementById(id);

  // ═══════════════════════════════════════════════════════════════
  //  MODAL ÖFFNEN / SCHLIESSEN
  // ═══════════════════════════════════════════════════════════════

  function openPdfExport(){
    if(!getState().isAdmin){
      Toast.warning('Nur für Admins verfügbar');
      return;
    }
    $('pdf-modal').classList.add('on');
    // Custom-Datum auf heute vorsetzen
    const today = new Date().toISOString().split('T')[0];
    if($('pdf-custom-from')) $('pdf-custom-from').value = today;
    if($('pdf-custom-to'))   $('pdf-custom-to').value   = today;
  }

  function closePdfExport(){
    $('pdf-modal').classList.remove('on');
  }

  // ═══════════════════════════════════════════════════════════════
  //  PERIODE BERECHNEN
  // ═══════════════════════════════════════════════════════════════

  function getPeriodRange(period){
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch(period){
      case 'day':
        return {
          start: today,
          label: 'Heute, ' + today.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }),
        };
      case 'week':
        return {
          start: new Date(today - 6 * 864e5),
          label: 'Letzte 7 Tage (' + new Date(today - 6*864e5).toLocaleDateString('de-DE') + ' – ' + today.toLocaleDateString('de-DE') + ')',
        };
      case 'month':
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          label: now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
        };
      case 'year':
        return {
          start: new Date(now.getFullYear(), 0, 1),
          label: 'Jahr ' + now.getFullYear(),
        };
      case 'custom': {
        const from = $('pdf-custom-from')?.value;
        const to   = $('pdf-custom-to')?.value;
        if(!from || !to){ Toast.error('Bitte Start- und Enddatum wählen'); return null; }
        if(from > to){ Toast.error('Startdatum muss vor dem Enddatum liegen'); return null; }
        return {
          start: new Date(from),
          end:   new Date(to + 'T23:59:59'),
          label: new Date(from).toLocaleDateString('de-DE') + ' bis ' + new Date(to).toLocaleDateString('de-DE'),
        };
      }
      default:
        return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  DATEN LADEN & FILTERN
  // ═══════════════════════════════════════════════════════════════

  function parseOrderDate(dateStr){
    // Format: "23.05.2026, 14:30" → Date
    if(!dateStr) return null;
    const parts = dateStr.split(', ');
    if(!parts[0]) return null;
    const [d, m, y] = parts[0].split('.');
    if(!d || !m || !y) return null;
    return new Date(`${y}-${m}-${d}`);
  }

  function filterOrdersByRange(orders, range){
    return orders.filter(o => {
      const dt = parseOrderDate(o.date);
      if(!dt) return false;
      if(dt < range.start) return false;
      if(range.end && dt > range.end) return false;
      return true;
    });
  }

  function aggregateItems(orders){
    // Summiert alle Artikel über alle Bestellungen
    // Gibt zurück: [{name, unit, qty, orderCount, section}]
    const map = {};
    orders.forEach(o => {
      o.items.forEach(i => {
        const key = i.item;
        if(!map[key]) map[key] = { name: i.item, unit: i.unit || '', qty: 0, orderCount: 0, section: i.section || '' };
        map[key].qty += parseFloat(i.qty) || 0;
        map[key].orderCount++;
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }

  // ═══════════════════════════════════════════════════════════════
  //  PDF GENERIEREN
  // ═══════════════════════════════════════════════════════════════

  async function generatePdf(period){
    const range = getPeriodRange(period);
    if(!range) return;

    const btn = $('pdf-gen-btn');
    if(btn){ btn.disabled = true; btn.textContent = '⏳ Lädt...'; }

    // Alle Bestellungen laden
    const data = await Api.get('orders', `?type=eq.${C.APP.TYPE}&order=created_at.desc`);

    if(btn){ btn.disabled = false; btn.textContent = '📄 PDF erstellen'; }

    if(!data){
      Toast.error('Bestellungen konnten nicht geladen werden');
      return;
    }

    const filtered = filterOrdersByRange(data, range);

    if(!filtered.length){
      Toast.warning('Keine Bestellungen für diesen Zeitraum');
      return;
    }

    const items     = aggregateItems(filtered);
    const totalQty  = items.reduce((s, i) => s + i.qty, 0);
    const now       = new Date().toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

    // Kategorien gruppieren für Tabelle
    const sections = {};
    items.forEach(i => {
      const sec = i.section || 'Sonstige';
      if(!sections[sec]) sections[sec] = [];
      sections[sec].push(i);
    });

    // Einzelne Bestellungen (kompakt)
    const orderRows = filtered.map(o => `
      <tr>
        <td>${o.date || '–'}</td>
        <td><strong>${escHTML(o.orderer || '–')}</strong></td>
        <td>${o.items.map(i => `${escHTML(i.item)}: ${i.qty} ${escHTML(i.unit||'')}`).join('<br>')}</td>
        <td><span class="status-badge status-${o.status || 'offen'}">${statusLabel(o.status)}</span></td>
      </tr>
    `).join('');

    // Artikel-Tabelle nach Kategorie
    const itemRows = Object.entries(sections).map(([sec, arts]) => `
      <tr class="section-row"><td colspan="3">${escHTML(sec)}</td></tr>
      ${arts.map(a => `
        <tr>
          <td>${escHTML(a.name)}</td>
          <td style="text-align:right;font-weight:700;">${a.qty}</td>
          <td>${escHTML(a.unit)}</td>
        </tr>
      `).join('')}
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8"/>
<title>Bestellbericht – ${escHTML(C.APP.NAME)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0f172a; background: white; font-size: 12px; }

  /* ── Print Layout ── */
  @page { margin: 20mm 15mm; }
  @media print { .no-print { display: none !important; } body { font-size: 11px; } }

  /* ── Header ── */
  .report-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding-bottom: 16px;
    border-bottom: 3px solid #14532d;
    margin-bottom: 20px;
  }
  .report-title { font-size: 22px; font-weight: 800; color: #0f172a; }
  .report-meta  { font-size: 11px; color: #64748b; margin-top: 4px; }
  .report-badge {
    background: #14532d; color: white;
    padding: 6px 14px; border-radius: 6px;
    font-size: 12px; font-weight: 700;
    text-align: right;
  }

  /* ── Summary Cards ── */
  .summary {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 10px; margin-bottom: 24px;
  }
  .sum-card {
    background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 8px; padding: 12px; text-align: center;
  }
  .sum-num { font-size: 26px; font-weight: 800; color: #14532d; }
  .sum-lbl { font-size: 10px; color: #64748b; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }

  /* ── Section ── */
  .section-title {
    font-size: 13px; font-weight: 700; color: #0f172a;
    border-bottom: 2px solid #14532d;
    padding-bottom: 5px; margin: 24px 0 10px;
  }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { background: #14532d; color: white; padding: 7px 10px; text-align: left; font-size: 11px; font-weight: 700; }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  tr.section-row td { background: #e2e8f0; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; padding: 5px 10px; }

  /* ── Status ── */
  .status-badge { padding: 2px 7px; border-radius: 10px; font-size: 10px; font-weight: 700; }
  .status-offen      { background: #fef3c7; color: #b45309; }
  .status-bestaetigt { background: #d1fae5; color: #065f46; }
  .status-unterwegs  { background: #dbeafe; color: #1e40af; }
  .status-angekommen { background: #d1fae5; color: #065f46; }
  .status-fehler     { background: #fee2e2; color: #991b1b; }

  /* ── Footer ── */
  .report-footer {
    margin-top: 24px; padding-top: 10px;
    border-top: 1px solid #e2e8f0;
    display: flex; justify-content: space-between;
    font-size: 10px; color: #94a3b8;
  }

  /* ── Print Button ── */
  .print-btn {
    display: block; margin: 20px auto 0;
    background: #14532d; color: white;
    border: none; border-radius: 8px;
    padding: 12px 28px; font-size: 14px; font-weight: 700;
    cursor: pointer; font-family: inherit;
  }
</style>
</head>
<body>

<div class="report-header">
  <div>
    <div class="report-title">📦 Bestellbericht</div>
    <div class="report-meta">${escHTML(C.APP.NAME)} · bona'me × Lagardère · Düsseldorf</div>
    <div class="report-meta" style="margin-top:3px;">Zeitraum: <strong>${escHTML(range.label)}</strong></div>
  </div>
  <div class="report-badge">
    Erstellt<br>${now}
  </div>
</div>

<div class="summary">
  <div class="sum-card">
    <div class="sum-num">${filtered.length}</div>
    <div class="sum-lbl">Bestellungen</div>
  </div>
  <div class="sum-card">
    <div class="sum-num">${items.length}</div>
    <div class="sum-lbl">Artikel</div>
  </div>
  <div class="sum-card">
    <div class="sum-num">${totalQty}</div>
    <div class="sum-lbl">Einheiten gesamt</div>
  </div>
</div>

<div class="section-title">📦 Bestellte Artikel (Zusammenfassung)</div>
<table>
  <thead>
    <tr>
      <th>Artikel</th>
      <th style="text-align:right;width:80px;">Menge</th>
      <th style="width:80px;">Einheit</th>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
</table>

<div class="section-title">📋 Alle Bestellungen</div>
<table>
  <thead>
    <tr>
      <th style="width:130px;">Datum</th>
      <th style="width:120px;">Besteller</th>
      <th>Artikel</th>
      <th style="width:100px;">Status</th>
    </tr>
  </thead>
  <tbody>${orderRows}</tbody>
</table>

<div class="report-footer">
  <span>bona'me × Lagardère · Flughafen Düsseldorf</span>
  <span>Bestellsystem · ${now}</span>
</div>

<button class="print-btn no-print" onclick="window.print()">🖨️ Drucken / Als PDF speichern</button>

</body>
</html>`;

    // Neues Fenster öffnen
    const win = window.open('', '_blank', 'width=900,height=700');
    if(!win){
      Toast.error('Popup blockiert – bitte Popups für diese Seite erlauben');
      return;
    }
    win.document.write(html);
    win.document.close();
    closePdfExport();
  }

  // ═══════════════════════════════════════════════════════════════
  //  HELPER
  // ═══════════════════════════════════════════════════════════════

  function escHTML(str){
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function statusLabel(s){
    const map = { offen:'⏳ Offen', bestaetigt:'✅ Bestätigt', unterwegs:'🚚 Unterwegs', angekommen:'✅ Angekommen', fehler:'⚠️ Fehlt' };
    return map[s] || s || 'Offen';
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  window.PdfExport = {
    open:  openPdfExport,
    close: closePdfExport,
    generate: generatePdf,
  };

})();
