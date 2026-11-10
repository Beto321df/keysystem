const crypto = require('crypto');
const admin = require('firebase-admin');

const KEY_RE = /^Premium_[A-Z0-9]{9}-[0-9]{4}$/;
const MAX_SECONDS = 365 * 24 * 60 * 60;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function db() {
  if (admin.apps.length) return admin.app().database();
  let raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSONZ || process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  let service;
  try {
    service = JSON.parse(raw);
    if (typeof service === 'string') service = JSON.parse(service);
    if (!service?.project_id || !service?.client_email || !service?.private_key) throw new Error();
    service.private_key = String(service.private_key).replace(/\\n/g, '\n');
  } catch { throw new Error('La credencial de Firebase no es válida.'); }
  const url = process.env.FIREBASE_DATABASE_URL;
  if (!url) throw new Error('FIREBASE_DATABASE_URL no está configurado.');
  return admin.initializeApp({ credential: admin.credential.cert(service), databaseURL: url }).database();
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function authorized(req, secret) {
  const header = String(req.headers?.authorization || '');
  return Boolean(secret) && header.startsWith('Bearer ') && safeEqual(header.slice(7), secret);
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 4096) reject(new Error('Solicitud demasiado grande.')); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('JSON inválido.')); } });
    req.on('error', reject);
  });
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newKey() {
  const random = (count) => Array.from({ length: count }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
  return `Premium_${random(9)}-${String(crypto.randomInt(10000)).padStart(4, '0')}`;
}

async function cleanupExpired(database) {
  const now = Date.now();
  const snap = await database.ref('keys').get();
  const updates = {};
  snap.forEach((child) => {
    const value = child.val() || {};
    if (!Number(value.expiresAt) || Number(value.expiresAt) > now) return;
    updates[`keys/${child.key}`] = null;
    if (value.ownerHash) {
      const ownerRef = database.ref(`keyOwners/${value.ownerHash}`);
      const ownerSnap = await ownerRef.get();
      if (String(ownerSnap.val()?.key || '') === String(child.key)) updates[`keyOwners/${value.ownerHash}`] = null;
    }
  });
  if (Object.keys(updates).length) await database.ref().update(updates);
  return Object.keys(updates).filter((path) => path.startsWith('keys/')).length;
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'https://placeholder.local');
    const isCron = url.searchParams.get('cleanup') === '1';
    if (isCron) {
      if (req.method !== 'GET' || !authorized(req, process.env.CRON_SECRET)) return json(res, 401, { error: 'No autorizado.' });
      const deleted = await cleanupExpired(db());
      return json(res, 200, { ok: true, deleted });
    }
    if (!authorized(req, process.env.ADMIN_API_SECRET)) return json(res, 401, { error: 'Clave de administración inválida.' });
    const database = db();
    await cleanupExpired(database);

    if (req.method === 'GET') {
      const snap = await database.ref('keys').get();
      const keys = [];
      snap.forEach((child) => {
        const record = child.val() || {};
        if (KEY_RE.test(String(child.key)) && Number(record.expiresAt) > Date.now() && record.status !== 'revoked') {
          keys.push({ key: child.key, createdAt: Number(record.createdAt) || 0, expiresAt: Number(record.expiresAt), durationSeconds: Number(record.durationSeconds) || Math.max(1, Math.floor((Number(record.expiresAt) - Number(record.createdAt)) / 1000)), bound: record.bound === true, hwid: record.bound === true ? String(record.hwid || '') : '' });
        }
      });
      keys.sort((a, b) => b.createdAt - a.createdAt);
      return json(res, 200, { keys });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const durationSeconds = Number(body.durationSeconds);
      if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > MAX_SECONDS) return json(res, 400, { error: 'La duración debe ser de 1 segundo a 1 año.' });
      const createdAt = Date.now();
      const record = { createdAt, expiresAt: createdAt + durationSeconds * 1000, durationSeconds, status: 'active', bound: false, hwid: null, formatVersion: 3 };
      let key = '';
      for (let i = 0; i < 16; i++) {
        const candidate = newKey();
        const tx = await database.ref(`keys/${candidate}`).transaction((current) => current == null ? record : undefined);
        if (tx.committed) { key = candidate; break; }
      }
      if (!key) return json(res, 503, { error: 'No se pudo reservar una key única.' });
      return json(res, 201, { key, ...record });
    }

    if (req.method === 'DELETE') {
      const key = String(url.searchParams.get('key') || '');
      if (!KEY_RE.test(key)) return json(res, 400, { error: 'Formato de key inválido.' });
      const ref = database.ref(`keys/${key}`);
      const snap = await ref.get();
      if (!snap.exists()) return json(res, 404, { error: 'La key ya no existe.' });
      const record = snap.val() || {};
      const updates = { [`keys/${key}`]: null };
      if (record.ownerHash) {
        const ownerRef = database.ref(`keyOwners/${record.ownerHash}`);
        const ownerSnap = await ownerRef.get();
        if (String(ownerSnap.val()?.key || '') === key) updates[`keyOwners/${record.ownerHash}`] = null;
      }
      await database.ref().update(updates);
      return json(res, 200, { ok: true, deleted: key });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return json(res, 405, { error: 'Método no permitido.' });
  } catch (error) {
    console.error('admin/keys:', error);
    return json(res, 500, { error: error?.message || 'Error interno del servidor.' });
  }
};
