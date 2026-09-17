const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_REORDER_THRESHOLD = 20;
const SEED_DATE = '2026-09-17';

const state = {
  today: SEED_DATE,
  nextId: 11,
  reorderThreshold: DEFAULT_REORDER_THRESHOLD,
  batches: [
    { id: 1, medicine: 'Paracetamol 500mg', form: 'Tablets · 16 pack', lot: 'PCM-24091', quantity: 34, expiry: '2026-09-21', quarantined: false, flagged: false },
    { id: 2, medicine: 'Paracetamol 500mg', form: 'Tablets · 16 pack', lot: 'PCM-24118', quantity: 86, expiry: '2027-02-14', quarantined: false, flagged: false },
    { id: 3, medicine: 'Amoxicillin 250mg', form: 'Capsules · 21 pack', lot: 'AMX-88201', quantity: 12, expiry: '2026-10-02', quarantined: false, flagged: false },
    { id: 4, medicine: 'Amoxicillin 250mg', form: 'Capsules · 21 pack', lot: 'AMX-88233', quantity: 44, expiry: '2027-01-30', quarantined: false, flagged: false },
    { id: 5, medicine: 'Cetirizine 10mg', form: 'Tablets · 30 pack', lot: 'CTZ-17044', quantity: 28, expiry: '2026-09-28', quarantined: false, flagged: false },
    { id: 6, medicine: 'Ibuprofen 200mg', form: 'Tablets · 24 pack', lot: 'IBU-99103', quantity: 9, expiry: '2026-08-31', quarantined: false, flagged: false },
    { id: 7, medicine: 'Ibuprofen 200mg', form: 'Tablets · 24 pack', lot: 'IBU-99147', quantity: 53, expiry: '2027-04-08', quarantined: false, flagged: false },
    { id: 8, medicine: 'Salbutamol 100mcg', form: 'Inhaler · 200 doses', lot: 'SLB-51102', quantity: 16, expiry: '2026-11-19', quarantined: false, flagged: false },
    { id: 9, medicine: 'Hydrocortisone 1%', form: 'Cream · 15g', lot: 'HCT-73109', quantity: 18, expiry: '2026-10-25', quarantined: false, flagged: false },
    { id: 10, medicine: 'Hydrocortisone 1%', form: 'Cream · 15g', lot: 'HCT-73117', quantity: 7, expiry: '2027-05-06', quarantined: false, flagged: false },
  ],
  outbox: [],
  lowStockNotified: new Set(),
  previousStock: new Map(),
};

function json(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function dateOnly(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (!match) match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!match) match = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const year = match[1].length === 4 ? Number(match[1]) : Number(match[3]);
  const month = match[1].length === 4 ? Number(match[2]) : Number(match[2]);
  const day = match[1].length === 4 ? Number(match[3]) : Number(match[1]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function daysBetween(later, earlier) {
  return Math.floor((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86400000);
}

function isExpired(batch) {
  return batch.expiry < state.today;
}

function isExpiringSoon(batch) {
  const days = daysBetween(batch.expiry, state.today);
  return !isExpired(batch) && days >= 0 && days <= 7;
}

function sellableStock(medicine) {
  return state.batches
    .filter((batch) => batch.medicine.toLowerCase() === medicine.toLowerCase() && !isExpired(batch) && !batch.quarantined)
    .reduce((total, batch) => total + batch.quantity, 0);
}

function queueReorderIfNeeded(medicine, threshold = state.reorderThreshold) {
  const stock = sellableStock(medicine);
  const key = medicine.toLowerCase();
  const previous = state.previousStock.get(key);
  state.previousStock.set(key, stock);
  if (stock < threshold && previous !== undefined && previous >= threshold && !state.lowStockNotified.has(key)) {
    const message = {
      id: crypto.randomUUID(),
      service: 'Notification Service',
      type: 'REORDER_ALERT',
      createdAt: new Date(`${state.today}T00:00:00Z`).toISOString(),
      payload: { medicine, sellableStock: stock, threshold },
    };
    state.outbox.push(message);
    state.lowStockNotified.add(key);
    return message;
  }
  if (stock >= threshold) state.lowStockNotified.delete(key);
  return null;
}

function processClock(requestedDate) {
  const nextDate = dateOnly(requestedDate) || state.today;
  if (nextDate < state.today) throw new Error('Clock cannot move backwards');
  state.today = nextDate;
  let flagged = 0;
  let quarantined = 0;
  for (const batch of state.batches) {
    if (isExpired(batch)) {
      if (!batch.quarantined) {
        batch.quarantined = true;
        quarantined += 1;
      }
      continue;
    }
    if (isExpiringSoon(batch) && !batch.flagged) {
      batch.flagged = true;
      flagged += 1;
    }
  }
  const medicines = [...new Set(state.batches.map((batch) => batch.medicine))];
  medicines.forEach((medicine) => queueReorderIfNeeded(medicine));
  return {
    date: state.today,
    flagged,
    flaggedCount: flagged,
    quarantined,
    quarantinedCount: quarantined,
    expiringSoon: state.batches.filter(isExpiringSoon).length,
    expired: state.batches.filter(isExpired).length,
    sellableUnits: state.batches.filter((batch) => !isExpired(batch) && !batch.quarantined).reduce((sum, batch) => sum + batch.quantity, 0),
  };
}

function firstValue(row, names) {
  for (const name of names) {
    if (row && row[name] !== undefined && row[name] !== null) return row[name];
  }
  return null;
}

function normalizeQuantity(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^([0-9]+)(?:\.[0-9]+)?\s*(?:units?|packs?|items?)?$/i);
  const quantity = match ? Number(match[1]) : NaN;
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
}

function normalizeBatch(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { error: 'row is not an object' };
  const medicineValue = firstValue(row, ['medicine', 'name', 'drug', 'product']);
  const lotValue = firstValue(row, ['lot', 'lotNumber', 'batch', 'batchNumber', 'id']);
  const expiryValue = firstValue(row, ['expiry', 'expiryDate', 'expires', 'expiration']);
  const quantityValue = firstValue(row, ['quantity', 'units', 'stock', 'onHand']);
  const medicine = typeof medicineValue === 'string' ? medicineValue.trim() : '';
  const lot = typeof lotValue === 'string' || typeof lotValue === 'number' ? String(lotValue).trim() : '';
  const expiry = dateOnly(expiryValue);
  const quantity = normalizeQuantity(quantityValue);
  if (!medicine) return { error: 'medicine is required' };
  if (!lot) return { error: 'lot is required' };
  if (!expiry) return { error: 'expiry must be ISO or dd/mm/yyyy' };
  if (!quantity) return { error: 'quantity must be a positive whole number' };
  return {
    batch: {
      id: state.nextId++,
      medicine,
      form: String(firstValue(row, ['form', 'pack', 'presentation']) || 'Imported stock').trim(),
      lot,
      quantity,
      expiry,
      quarantined: expiry < state.today,
      flagged: false,
    },
  };
}

function importBatches(input) {
  const rows = Array.isArray(input) ? input : input && (input.batches || input.rows || input.data);
  if (!Array.isArray(rows)) throw new Error('Expected an array or an object with a batches array');
  const seen = new Set();
  const report = { imported: 0, deduped: 0, rejected: 0, rejectedRows: [] };
  for (const row of rows) {
    const normalized = normalizeBatch(row);
    if (normalized.error) {
      report.rejected += 1;
      report.rejectedRows.push({ row, reason: normalized.error });
      continue;
    }
    const batch = normalized.batch;
    const key = `${batch.medicine.toLowerCase()}|${batch.lot.toLowerCase()}|${batch.expiry}`;
    if (seen.has(key) || state.batches.some((existing) => `${existing.medicine.toLowerCase()}|${existing.lot.toLowerCase()}|${existing.expiry}` === key)) {
      report.deduped += 1;
      continue;
    }
    seen.add(key);
    state.batches.push(batch);
    report.imported += 1;
  }
  [...new Set(state.batches.map((batch) => batch.medicine))].forEach((medicine) => state.previousStock.set(medicine.toLowerCase(), sellableStock(medicine)));
  return report;
}

function dispense(medicineValue, quantityValue, thresholdValue) {
  const medicine = typeof medicineValue === 'string' ? medicineValue.trim() : '';
  const quantity = normalizeQuantity(quantityValue);
  const threshold = thresholdValue === undefined ? state.reorderThreshold : normalizeQuantity(thresholdValue);
  if (!medicine || !quantity || !threshold) throw new Error('medicine, positive quantity, and threshold are required');
  const available = state.batches
    .filter((batch) => batch.medicine.toLowerCase() === medicine.toLowerCase() && !isExpired(batch) && !batch.quarantined && batch.quantity > 0)
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  const total = available.reduce((sum, batch) => sum + batch.quantity, 0);
  if (quantity > total) throw new Error(`Only ${total} sellable units are available`);
  let remaining = quantity;
  const used = [];
  for (const batch of available) {
    if (remaining === 0) break;
    const amount = Math.min(remaining, batch.quantity);
    batch.quantity -= amount;
    remaining -= amount;
    used.push({ lot: batch.lot, expiry: batch.expiry, quantity: amount });
  }
  state.reorderThreshold = threshold;
  const notification = queueReorderIfNeeded(medicine, threshold);
  return { medicine, quantity, used, sellableStock: sellableStock(medicine), reorderAlertQueued: Boolean(notification) };
}

function publicState() {
  return {
    today: state.today,
    reorderThreshold: state.reorderThreshold,
    batches: state.batches,
    outboxCount: state.outbox.length,
  };
}

function serveStatic(request, response) {
  const relative = request.url === '/' ? 'index.html' : request.url.replace(/^\//, '');
  const filePath = path.resolve(process.cwd(), relative);
  if (!filePath.startsWith(path.resolve(process.cwd())) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const contentType = filePath.endsWith('.html') ? 'text/html' : filePath.endsWith('.css') ? 'text/css' : 'application/javascript';
  response.writeHead(200, { 'Content-Type': `${contentType}; charset=utf-8` });
  response.end(fs.readFileSync(filePath));
  return true;
}

for (const medicine of [...new Set(state.batches.map((batch) => batch.medicine))]) {
  state.previousStock.set(medicine.toLowerCase(), sellableStock(medicine));
}

async function body(request) {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('Request body must be valid JSON'); }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { ok: true, today: state.today });
    if (request.method === 'GET' && (url.pathname === '/batches' || url.pathname === '/api/batches')) return json(response, 200, publicState());
    if (request.method === 'POST' && ['/clock', '/api/clock'].includes(url.pathname)) {
      const payload = await body(request);
      const advanceDays = Number(payload.advanceDays ?? payload.days);
      const requestedDate = payload.date || payload.today || payload.now || (Number.isInteger(advanceDays) ? new Date(Date.parse(`${state.today}T00:00:00Z`) + advanceDays * 86400000).toISOString().slice(0, 10) : state.today);
      return json(response, 200, processClock(requestedDate));
    }
    if (request.method === 'POST' && ['/batches/import', '/import', '/api/import', '/api/batches/import'].includes(url.pathname)) return json(response, 200, importBatches(await body(request)));
    if (request.method === 'POST' && ['/dispense', '/api/dispense'].includes(url.pathname)) {
      const payload = await body(request);
      return json(response, 200, dispense(payload.medicine || payload.name, payload.quantity || payload.units, payload.threshold));
    }
    if (request.method === 'GET' && ['/outbox', '/api/outbox'].includes(url.pathname)) return json(response, 200, { messages: state.outbox, outbox: state.outbox, count: state.outbox.length });
    if (request.method === 'DELETE' && ['/outbox', '/api/outbox'].includes(url.pathname)) { state.outbox.length = 0; return json(response, 200, { messages: [], count: 0 }); }
    if (request.method === 'GET' && serveStatic(request, response)) return undefined;
    return json(response, 404, { error: 'Not found' });
  } catch (error) {
    return json(response, 400, { error: error.message });
  }
});

server.listen(PORT, () => console.log(`Medstock API listening on http://localhost:${PORT}`));
