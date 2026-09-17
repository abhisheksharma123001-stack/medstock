import './style.css';
import './theme.css';

const TODAY = new Date('2026-09-17T12:00:00');
let alertWindowDays = 30;
let adminName = 'Abhishek Sharma';
let adminRole = 'Administrator';
let pharmacyName = 'Oakfield Pharmacy';
let pharmacyAddress = '12 Oakfield Road, Bristol BS4 2AA';
let pharmacyPhone = '+44 117 555 0192';
let notificationsEnabled = true;
let passwordChangedAt = null;

let batches = [
  { id: 1, medicine: 'Paracetamol 500mg', form: 'Tablets · 16 pack', lot: 'PCM-24091', quantity: 34, expiry: '2026-09-21' },
  { id: 2, medicine: 'Paracetamol 500mg', form: 'Tablets · 16 pack', lot: 'PCM-24118', quantity: 86, expiry: '2027-02-14' },
  { id: 3, medicine: 'Amoxicillin 250mg', form: 'Capsules · 21 pack', lot: 'AMX-88201', quantity: 12, expiry: '2026-10-02' },
  { id: 4, medicine: 'Amoxicillin 250mg', form: 'Capsules · 21 pack', lot: 'AMX-88233', quantity: 44, expiry: '2027-01-30' },
  { id: 5, medicine: 'Cetirizine 10mg', form: 'Tablets · 30 pack', lot: 'CTZ-17044', quantity: 28, expiry: '2026-09-28' },
  { id: 6, medicine: 'Ibuprofen 200mg', form: 'Tablets · 24 pack', lot: 'IBU-99103', quantity: 9, expiry: '2026-08-31' },
  { id: 7, medicine: 'Ibuprofen 200mg', form: 'Tablets · 24 pack', lot: 'IBU-99147', quantity: 53, expiry: '2027-04-08' },
  { id: 8, medicine: 'Salbutamol 100mcg', form: 'Inhaler · 200 doses', lot: 'SLB-51102', quantity: 16, expiry: '2026-11-19' },
  { id: 9, medicine: 'Hydrocortisone 1%', form: 'Cream · 15g', lot: 'HCT-73109', quantity: 18, expiry: '2026-10-25' },
  { id: 10, medicine: 'Hydrocortisone 1%', form: 'Cream · 15g', lot: 'HCT-73117', quantity: 7, expiry: '2027-05-06' },
];

let searchTerm = '';
let activeFilter = 'all';
let modalMode = null;
let selectedMedicine = '';
let toastTimer;
let dispensingLog = [];

const app = document.querySelector('#app');

const daysUntil = (date) => Math.ceil((new Date(`${date}T23:59:59`) - TODAY) / 86400000);
const isExpired = (batch) => daysUntil(batch.expiry) < 0;
const isExpiring = (batch) => !isExpired(batch) && daysUntil(batch.expiry) <= alertWindowDays;
const isReminderDue = (batch) => !isExpired(batch) && daysUntil(batch.expiry) >= 5 && daysUntil(batch.expiry) <= 7;
const formatDate = (date) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
const firstName = () => adminName.trim().split(/\s+/)[0] || 'Admin';
const initials = () => adminName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'AD';
const salutation = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};
const medicines = () => [...new Set(batches.map((batch) => batch.medicine))];
const sellableFor = (medicine) => batches.filter((batch) => batch.medicine === medicine && !isExpired(batch)).reduce((total, batch) => total + batch.quantity, 0);
const getStatus = (batch) => {
  if (isExpired(batch)) return { label: 'Expired', className: 'expired' };
  if (daysUntil(batch.expiry) <= alertWindowDays) return { label: `${daysUntil(batch.expiry)} days left`, className: 'soon' };
  return { label: 'In date', className: 'good' };
};

function render() {
  const filtered = batches
    .filter((batch) => !searchTerm || `${batch.medicine} ${batch.lot}`.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter((batch) => activeFilter === 'all' || (activeFilter === 'attention' && (isExpired(batch) || isExpiring(batch))) || (activeFilter === 'sellable' && !isExpired(batch)) || (activeFilter === 'soon' && isExpiring(batch)) || (activeFilter === 'expired' && isExpired(batch)))
    .sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  const sellableUnits = batches.filter((batch) => !isExpired(batch)).reduce((total, batch) => total + batch.quantity, 0);
  const expiring = batches.filter(isExpiring).sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  const reminderBatches = batches.filter(isReminderDue).sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  const expired = batches.filter(isExpired).sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  const attentionBatches = [...expired, ...expiring];
  const expiredUnits = batches.filter(isExpired).reduce((total, batch) => total + batch.quantity, 0);
  const attentionCount = attentionBatches.length;

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">+</span><span>medstock</span></div>
          <button class="location" data-action="show-location"><span class="status-dot"></span><span>${pharmacyName}</span><span class="chevron">⌄</span></button>
        <nav class="nav" aria-label="Main navigation">
          <button class="nav-item active" data-action="show-inventory"><span class="nav-icon">▦</span> Inventory <span class="nav-count">${batches.length}</span></button>
          <button class="nav-item" data-action="show-alerts"><span class="nav-icon">◌</span> Expiry alerts <span class="nav-count alert-count">${attentionCount}</span></button>
          <button class="nav-item" data-action="show-log"><span class="nav-icon">↗</span> Dispensing log</button>
        </nav>
        <div class="sidebar-bottom">
          <div class="sidebar-note"><strong>FEFO is on</strong><span>Shortest expiry is always selected first.</span></div>
          <button class="nav-item" data-action="open-settings"><span class="nav-icon">⚙</span> Settings</button>
          <button class="profile" data-action="open-settings"><div class="avatar">${initials()}</div><div><strong>${adminName}</strong><span>${adminRole}</span></div><span class="more">•••</span></button>
        </div>
      </aside>

      <main class="main-content">
        <header class="topbar">
          <div class="breadcrumbs"><span>Inventory</span><span>/</span><strong>All medicines</strong></div>
          <div class="top-actions"><span class="sync"><span class="sync-dot"></span> Synced just now</span><button class="icon-button" aria-label="Notifications" data-action="show-alerts">♢${notificationsEnabled ? '<span class="notification-dot"></span>' : ''}</button><button class="top-avatar" data-action="open-settings" aria-label="Open profile settings">${initials()}</button></div>
        </header>
        <section class="page-heading">
          <div><p class="eyebrow">Thursday, 17 September 2026</p><h1>${salutation()}, ${firstName()} <span class="wave">✦</span></h1><p class="subheading">Here’s the stock picture for ${pharmacyName}.</p></div>
          <div class="heading-actions"><span class="control-status"><i></i> FEFO control room</span><button class="primary-button" data-action="open-add"><span>＋</span> Add batch</button></div>
        </section>

        <section class="metric-grid" aria-label="Inventory summary">
          <article class="metric-card highlight"><div class="metric-label"><span>Sellable stock</span><span class="metric-icon teal">◈</span></div><strong>${sellableUnits}</strong><span class="metric-foot">units in date <span class="up">↑ 4.8%</span></span></article>
          <article class="metric-card"><div class="metric-label"><span>Medicines tracked</span><span class="metric-icon blue">⌁</span></div><strong>${medicines().length}</strong><span class="metric-foot">across ${batches.length} batches</span></article>
          <article class="metric-card warning"><div class="metric-label"><span>Expiring soon</span><span class="metric-icon amber">◷</span></div><strong>${expiring.length}</strong><span class="metric-foot">within the next ${alertWindowDays} days <button class="inline-link" data-action="show-alerts">View alerts →</button></span></article>
          <article class="metric-card danger"><div class="metric-label"><span>Quarantined</span><span class="metric-icon red">⊘</span></div><strong>${expiredUnits}</strong><span class="metric-foot">expired units <span class="danger-text">Do not dispense</span></span></article>
        </section>

        <section class="workspace-grid">
          <div class="inventory-panel panel">
            <div class="panel-heading"><div><h2>Batch inventory</h2><p>Stock is ordered by expiry date. Expired units are excluded from sellable stock.</p></div><button class="filter-button" data-action="toggle-filter">Filter <span>⌄</span></button></div>
            <div class="filter-bar ${activeFilter !== 'all' ? 'visible' : ''}"><button class="filter-chip ${activeFilter === 'all' ? 'selected' : ''}" data-filter="all">All batches</button><button class="filter-chip ${activeFilter === 'attention' ? 'selected' : ''}" data-filter="attention">Needs attention</button><button class="filter-chip ${activeFilter === 'sellable' ? 'selected' : ''}" data-filter="sellable">In date</button><button class="filter-chip ${activeFilter === 'soon' ? 'selected' : ''}" data-filter="soon">Expiring soon</button><button class="filter-chip ${activeFilter === 'expired' ? 'selected' : ''}" data-filter="expired">Expired</button></div>
            <div class="table-toolbar"><label class="search-box"><span>⌕</span><input id="search" value="${searchTerm}" placeholder="Search medicine or lot" aria-label="Search medicine or lot" /><kbd>⌘ K</kbd></label><span class="results-count">${filtered.length} ${filtered.length === 1 ? 'batch' : 'batches'}</span></div>
            <div class="table-wrap"><table><thead><tr><th>MEDICINE</th><th>LOT NUMBER</th><th>EXPIRY DATE <span class="sort-arrow">↕</span></th><th>ON HAND</th><th>STATUS</th><th></th></tr></thead><tbody>${filtered.length ? filtered.map(batchRow).join('') : '<tr><td colspan="6"><div class="empty-state"><span>⌕</span><strong>No batches found</strong><p>Try a different medicine or lot number.</p></div></td></tr>'}</tbody></table></div>
          </div>
          <aside class="alerts-panel panel"><div class="panel-heading"><div><h2>Expiry watch</h2><p>Act before stock becomes waste.</p></div><button class="more-button" aria-label="More expiry options" data-action="show-alert-options">•••</button></div><div class="reminder-strip"><span class="reminder-bell">◷</span><div><strong>Expiry reminders</strong><span>${reminderBatches.length ? `${reminderBatches.length} ${reminderBatches.length === 1 ? 'medicine' : 'medicines'} expire in 5–7 days` : 'No medicines expire in 5–7 days'}</span></div><span class="reminder-count">${reminderBatches.length}</span></div><div class="reminder-list">${reminderBatches.map(reminderRow).join('') || '<div class="quiet-state">You’re clear for the next few days.</div>'}</div><div class="alert-summary"><span class="alert-ring">${attentionBatches.length}</span><div><strong>Need attention</strong><span>${attentionBatches.length ? `${expired.length} expired · ${expiring.length} expiring soon` : 'Nothing needs attention'}</span></div></div><div class="alert-list">${attentionBatches.slice(0, 4).map(alertRow).join('') || '<div class="quiet-state">You’re all clear for the next 30 days.</div>'}</div>${attentionBatches.length > 4 ? '<button class="view-all" data-action="show-alerts">View all alerts <span>→</span></button>' : ''}<div class="rule"></div><div class="quarantine"><div class="quarantine-icon">⊘</div><div><strong>Quarantine shelf</strong><span>${expiredUnits} expired units · ${expired.length} batch</span></div><button class="tiny-action" data-filter="expired">View</button></div></aside>
        </section>
        <footer class="footer-note"><span class="lock">▣</span> Inventory is protected by FEFO rules <span class="footer-separator">•</span> Last checked 09:42</footer>
      </main>
    </div>
    ${modalMode ? renderModal() : ''}
    <div class="toast ${toastTimer ? 'show' : ''}" role="status">${toastTimer || ''}</div>
  `;
  bindEvents();
}

function batchRow(batch) {
  const status = getStatus(batch);
  return `<tr class="${status.className === 'expired' ? 'row-expired' : ''}"><td><div class="medicine-name"><span class="medicine-icon ${iconClass(batch.medicine)}">${medicineIcon(batch.medicine)}</span><div><strong>${batch.medicine}</strong><span>${batch.form}</span></div></div></td><td><span class="lot-number">${batch.lot}</span></td><td><strong class="expiry-date">${formatDate(batch.expiry)}</strong><span class="days-label">${isExpired(batch) ? `${Math.abs(daysUntil(batch.expiry))} days ago` : `in ${daysUntil(batch.expiry)} days`}</span></td><td><strong class="quantity ${batch.quantity < 15 && !isExpired(batch) ? 'low' : ''}">${batch.quantity}</strong><span class="units">units</span></td><td><span class="status-pill ${status.className}"><span></span>${status.label}</span></td><td><button class="dispense-button" data-dispense="${batch.medicine}" ${isExpired(batch) || batch.quantity === 0 ? 'disabled' : ''}>Sell</button></td></tr>`;
}

function alertRow(batch) {
  const expired = isExpired(batch);
  return `<div class="alert-row"><span class="alert-medicine-icon ${iconClass(batch.medicine)}">${medicineIcon(batch.medicine)}</span><div><strong>${batch.medicine}</strong><span>${batch.quantity} units · ${batch.lot}</span></div><span class="alert-days ${expired ? 'expired-alert-days' : ''}">${expired ? 'Expired' : `${daysUntil(batch.expiry)}d`}</span></div>`;
}

function reminderRow(batch) {
  return `<div class="reminder-row"><div><strong>${batch.medicine}</strong><span>${batch.quantity} units · ${batch.lot}</span></div><span>${daysUntil(batch.expiry)} days</span></div>`;
}

function iconClass(medicine) {
  return medicine.toLowerCase().includes('paracetamol') ? 'peach' : medicine.toLowerCase().includes('amoxicillin') ? 'lavender' : medicine.toLowerCase().includes('cetirizine') ? 'mint' : medicine.toLowerCase().includes('ibuprofen') ? 'yellow' : 'sky';
}
function medicineIcon(medicine) { return medicine.toLowerCase().includes('inhaler') ? '◉' : medicine.toLowerCase().includes('cream') ? '✦' : '✚'; }

function renderModal() {
  if (modalMode === 'log') {
    return `<div class="modal-backdrop" data-action="close-modal"><div class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onclick="event.stopPropagation()"><button class="close-modal" data-action="close-modal">×</button><span class="modal-kicker">Audit trail</span><h2 id="modal-title">Dispensing log</h2><p class="modal-copy">Every dispense is recorded after sellable stock is removed from the earliest-expiring batch.</p>${dispensingLog.length ? `<div class="log-list">${dispensingLog.map((entry) => `<div class="log-entry"><div class="log-entry-icon">↗</div><div><strong>${entry.quantity} ${entry.medicine}</strong><span>${entry.lot} · ${entry.time}</span></div><b>-${entry.quantity}</b></div>`).join('')}</div>` : '<div class="empty-log"><span>↗</span><strong>No dispensing recorded yet</strong><p>Completed dispenses will appear here.</p></div>'}</div></div>`;
  }
  if (modalMode === 'settings') {
    return `<div class="modal-backdrop settings-modal" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onclick="event.stopPropagation()"><button class="close-modal" data-action="close-modal">×</button><span class="modal-kicker">Workspace preferences</span><h2 id="modal-title">Admin settings</h2><p class="modal-copy">Update your profile, pharmacy details, and account security.</p><section class="settings-section"><div class="settings-section-heading"><div><strong>Profile & pharmacy</strong><span>These details appear across the workspace.</span></div><span class="settings-badge">PROFILE</span></div><form id="settings-form"><div class="form-row"><label class="field-label">Admin name<input name="adminName" required value="${adminName}" /></label><label class="field-label">Role<input name="adminRole" required value="${adminRole}" /></label></div><label class="field-label">Pharmacy name<input name="pharmacyName" required value="${pharmacyName}" /></label><label class="field-label">Pharmacy address<input name="pharmacyAddress" required value="${pharmacyAddress}" /></label><label class="field-label">Phone number<input name="pharmacyPhone" required type="tel" value="${pharmacyPhone}" /></label><label class="field-label">Expiry alert window<input name="alertWindowDays" required type="number" min="1" max="365" value="${alertWindowDays}" /></label><label class="setting-toggle"><input name="notificationsEnabled" type="checkbox" ${notificationsEnabled ? 'checked' : ''} /><span><strong>Expiry notifications</strong><small>Show attention dots and alert counts.</small></span></label><button class="primary-button full-width" type="submit">Save profile</button></form></section><section class="settings-section security-section"><div class="settings-section-heading"><div><strong>Password & security</strong><span>${passwordChangedAt ? `Last changed ${passwordChangedAt}` : 'Keep your administrator account protected.'}</span></div><span class="settings-badge security-badge">SECURITY</span></div><form id="password-form"><label class="field-label">New password<input name="newPassword" required type="password" minlength="8" placeholder="At least 8 characters" /></label><label class="field-label">Confirm new password<input name="confirmPassword" required type="password" minlength="8" placeholder="Repeat new password" /></label><button class="secondary-button full-width" type="submit">Change password</button></form></section></div></div>`;
  }
  if (modalMode === 'location') {
    return `<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onclick="event.stopPropagation()"><button class="close-modal" data-action="close-modal">×</button><span class="modal-kicker">Current workspace</span><h2 id="modal-title">${pharmacyName}</h2><p class="modal-copy">You are viewing the live inventory for this pharmacy location.</p><div class="location-detail"><span class="status-dot"></span><div><strong>${pharmacyAddress}</strong><span>${pharmacyPhone} · Open · Inventory synced just now</span></div></div><button class="primary-button full-width" data-action="close-modal">Done</button></div></div>`;
  }
  if (modalMode === 'alert-options') {
    return `<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onclick="event.stopPropagation()"><button class="close-modal" data-action="close-modal">×</button><span class="modal-kicker">Expiry watch</span><h2 id="modal-title">Alert actions</h2><p class="modal-copy">Your alert window is set to ${alertWindowDays} days.</p><button class="secondary-button full-width" data-action="show-alerts">View expiring batches</button><button class="secondary-button full-width" data-action="open-settings">Change alert settings</button></div></div>`;
  }
  if (modalMode === 'dispense') {
    const available = batches.filter((batch) => batch.medicine === selectedMedicine && !isExpired(batch) && batch.quantity > 0).sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
    const total = available.reduce((sum, batch) => sum + batch.quantity, 0);
    return `<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onclick="event.stopPropagation()"><button class="close-modal" data-action="close-modal">×</button><span class="modal-kicker">Customer sale · FEFO</span><h2 id="modal-title">Sell ${selectedMedicine}</h2><p class="modal-copy">The earliest in-date batch is selected automatically. This medicine has <strong>${total} sellable units</strong> available.</p><div class="next-batch"><span class="medicine-icon peach">✚</span><div><small>Batch leaving first</small><strong>${available[0]?.lot || 'No sellable stock'}</strong><span>Expires ${available[0] ? formatDate(available[0].expiry) : '—'}</span></div><b>${available[0]?.quantity || 0}</b></div><label class="field-label" for="dispense-quantity">Quantity purchased</label><input class="quantity-input" id="dispense-quantity" type="number" min="1" max="${total}" value="1" ${total === 0 ? 'disabled' : ''}/><button class="primary-button full-width" data-action="confirm-dispense" ${total === 0 ? 'disabled' : ''}>Complete sale</button></div></div>`;
  }
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onclick="event.stopPropagation()"><button class="close-modal" data-action="close-modal">×</button><span class="modal-kicker">New inventory</span><h2 id="modal-title">Add a batch</h2><p class="modal-copy">Add stock once. Medstock will place it in the FEFO queue automatically.</p><form id="add-batch-form"><label class="field-label">Medicine<input name="medicine" required placeholder="e.g. Paracetamol 500mg" /></label><label class="field-label">Form and pack<input name="form" required placeholder="e.g. Tablets · 16 pack" /></label><div class="form-row"><label class="field-label">Lot number<input name="lot" required placeholder="e.g. PCM-24120" /></label><label class="field-label">Expiry date<input name="expiry" required type="date" min="2026-09-18" /></label></div><label class="field-label">Quantity<input name="quantity" required type="number" min="1" placeholder="0" /></label><button class="primary-button full-width" type="submit">Add to inventory</button></form></div></div>`;
}

function bindEvents() {
  document.querySelector('#search')?.addEventListener('input', (event) => { searchTerm = event.target.value; render(); document.querySelector('#search')?.focus(); });
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { activeFilter = button.dataset.filter; render(); }));
  document.querySelectorAll('[data-action="open-add"]').forEach((button) => button.addEventListener('click', () => { modalMode = 'add'; render(); }));
  document.querySelectorAll('[data-action="show-inventory"]').forEach((button) => button.addEventListener('click', () => { activeFilter = 'all'; searchTerm = ''; render(); }));
  document.querySelectorAll('[data-action="show-alerts"]').forEach((button) => button.addEventListener('click', () => { modalMode = null; activeFilter = 'attention'; render(); }));
  document.querySelectorAll('[data-action="show-log"]').forEach((button) => button.addEventListener('click', () => { modalMode = 'log'; render(); }));
  document.querySelectorAll('[data-action="open-settings"]').forEach((button) => button.addEventListener('click', () => { modalMode = 'settings'; render(); }));
  document.querySelectorAll('[data-action="show-location"]').forEach((button) => button.addEventListener('click', () => { modalMode = 'location'; render(); }));
  document.querySelectorAll('[data-action="show-alert-options"]').forEach((button) => button.addEventListener('click', () => { modalMode = 'alert-options'; render(); }));
  document.querySelectorAll('[data-action="toggle-filter"]').forEach((button) => button.addEventListener('click', () => { const bar = document.querySelector('.filter-bar'); bar?.classList.toggle('visible'); }));
  document.querySelectorAll('[data-action="close-modal"]').forEach((button) => button.addEventListener('click', () => { modalMode = null; render(); }));
  document.querySelectorAll('[data-dispense]').forEach((button) => button.addEventListener('click', () => { selectedMedicine = button.dataset.dispense; modalMode = 'dispense'; render(); }));
  document.querySelector('[data-action="confirm-dispense"]')?.addEventListener('click', confirmDispense);
  document.querySelector('#add-batch-form')?.addEventListener('submit', addBatch);
  document.querySelector('#settings-form')?.addEventListener('submit', saveSettings);
  document.querySelector('#password-form')?.addEventListener('submit', changePassword);
  document.addEventListener('keydown', keyboardShortcuts);
}

function confirmDispense() {
  const requested = Number(document.querySelector('#dispense-quantity').value);
  const available = batches.filter((batch) => batch.medicine === selectedMedicine && !isExpired(batch) && batch.quantity > 0).sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  const total = available.reduce((sum, batch) => sum + batch.quantity, 0);
  if (!Number.isInteger(requested) || requested < 1 || requested > total) { showToast(`Enter a quantity from 1 to ${total}`); return; }
  const firstBatch = available[0];
  let remaining = requested;
  available.forEach((batch) => { if (remaining > 0) { const used = Math.min(batch.quantity, remaining); batch.quantity -= used; remaining -= used; } });
  dispensingLog.unshift({ quantity: requested, medicine: selectedMedicine, lot: firstBatch?.lot || 'FEFO queue', time: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(TODAY) });
  modalMode = null; showToast(`${requested} ${selectedMedicine} sale recorded · stock updated`); render();
}

function addBatch(event) {
  event.preventDefault();
  const data = new FormData(event.target);
  batches.push({ id: Date.now(), medicine: data.get('medicine'), form: data.get('form'), lot: data.get('lot'), quantity: Number(data.get('quantity')), expiry: data.get('expiry') });
  modalMode = null; showToast('Batch added to the FEFO queue'); render();
}
function saveSettings(event) {
  event.preventDefault();
  const data = new FormData(event.target);
  adminName = data.get('adminName').trim();
  adminRole = data.get('adminRole').trim();
  pharmacyName = data.get('pharmacyName').trim();
  pharmacyAddress = data.get('pharmacyAddress').trim();
  pharmacyPhone = data.get('pharmacyPhone').trim();
  alertWindowDays = Number(data.get('alertWindowDays'));
  notificationsEnabled = data.get('notificationsEnabled') === 'on';
  modalMode = null;
  showToast('Settings saved');
  render();
}
function changePassword(event) {
  event.preventDefault();
  const data = new FormData(event.target);
  const newPassword = String(data.get('newPassword'));
  const confirmPassword = String(data.get('confirmPassword'));
  if (newPassword.length < 8) {
    showToast('Password must be at least 8 characters');
    return;
  }
  if (newPassword !== confirmPassword) {
    showToast('Passwords do not match');
    return;
  }
  passwordChangedAt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(TODAY);
  modalMode = null;
  showToast('Password changed successfully');
  render();
}
function showToast(message) { toastTimer = message; render(); window.clearTimeout(showToast.timeout); showToast.timeout = window.setTimeout(() => { toastTimer = ''; render(); }, 3200); }
function keyboardShortcuts(event) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#search')?.focus(); } }

render();
