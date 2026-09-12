const crypto = require('crypto');
const admin = require('firebase-admin');

const DEVICE_RE = /^HWID-[A-Z0-9]{24}$/;
const KEY_RE = /^FREE_[A-Z]{9}-[0-9]{4}$/;
const ACCESS_RE = /^[A-Fa-f0-9]{64}$/;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function parseServiceAccount(raw) {
  let s = String(raw || '').trim();
  const candidates = [s];
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try {
      const q = s.startsWith('"') ? JSON.parse(s) : s.slice(1, -1);
      if (typeof q === 'string') candidates.unshift(q);
    } catch {}
  }
  for (const candidate of candidates) {
    try {
      let o = JSON.parse(candidate);
      if (typeof o === 'string') o = JSON.parse(o);
      if (o?.project_id && o?.client_email && o?.private_key) {
        o.private_key = String(o.private_key).replace(/\\n/g, '\n');
        return o;
      }
    } catch {}
  }
  throw new Error('La credencial de Firebase no es válida.');
}

function db() {
  if (admin.apps.length) return admin.app().database();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSONZ || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const url = process.env.FIREBASE_DATABASE_URL;
  if (!raw || !url) throw new Error('Firebase del servidor no está configurado.');
  return admin.initializeApp({
    credential: admin.credential.cert(parseServiceAccount(raw)),
    databaseURL: url
  }).database();
}

function ownerHash(deviceId) {
  return crypto.createHash('sha256').update(String(deviceId)).digest('hex');
}

function accessHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function cookie(req, name) {
  const raw = String(req.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return '';
}

async function activeKeyFor(database, deviceId) {
  const owner = ownerHash(deviceId);
  const ownerRef = database.ref(`keyOwners/${owner}`);
  const ownerSnap = await ownerRef.get();
  if (!ownerSnap.exists()) return null;

  const ownerData = ownerSnap.val() || {};
  const key = String(ownerData.key || '').toUpperCase();
  const expiresAt = Number(ownerData.expiresAt || 0);

  if (!KEY_RE.test(key) || !expiresAt || expiresAt <= Date.now()) {
    if (key) await database.ref(`keys/${key}`).remove();
    await ownerRef.remove();
    return null;
  }

  const keySnap = await database.ref(`keys/${key}`).get();
  if (!keySnap.exists()) {
    await ownerRef.remove();
    return null;
  }

  const record = keySnap.val() || {};
  if (
    record.status !== 'active' ||
    Number(record.expiresAt || 0) <= Date.now() ||
    String(record.hwid || '').toUpperCase() !== deviceId
  ) {
    await database.ref(`keys/${key}`).remove();
    await ownerRef.remove();
    return null;
  }

  return { key, expiresAt: Number(record.expiresAt) };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 10000) reject(new Error('Solicitud demasiado grande.'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  try {
    const method = String(req.method || 'GET').toUpperCase();
    const q = new URL(req.url || '/', 'https://placeholder.local').searchParams;
    const body = method === 'POST' ? await readBody(req) : {};
    const deviceId = String(body.deviceId || q.get('hwid') || '').trim().toUpperCase();

    if (!DEVICE_RE.test(deviceId)) return json(res, 400, { error: 'Device ID inválido.' });

    const database = db();
    const owner = ownerHash(deviceId);
    const accessRef = database.ref(`linkAccess/${owner}`);

    if (method === 'POST') {
      const action = String(body.action || 'activate').trim().toLowerCase();
      if (action !== 'activate') return json(res, 400, { error: 'Acción inválida.' });

      const key = await activeKeyFor(database, deviceId);
      const existingSnap = await accessRef.get();
      const existing = existingSnap.exists() ? existingSnap.val() || {} : {};

      // Mientras exista una key activa, se conserva el mismo enlace.
      if (key && existing.active === true && existing.hwid === deviceId && ACCESS_RE.test(String(existing.accessToken || ''))) {
        return json(res, 200, {
          active: true,
          hwid: deviceId,
          accessToken: String(existing.accessToken),
          url: `https://zkeysystem.vercel.app/?hwid=${encodeURIComponent(deviceId)}&access=${encodeURIComponent(existing.accessToken)}`,
          expiresAt: key.expiresAt,
          existing: true
        });
      }

      // Si la key anterior expiró, activeKeyFor() ya limpió key/keyOwner.
      // Se crea un token nuevo para que el enlace anterior quede muerto.
      const accessToken = crypto.randomBytes(32).toString('hex');
      const now = Date.now();
      await accessRef.set({
        active: true,
        hwid: deviceId,
        accessToken,
        accessHash: accessHash(accessToken),
        activatedAt: now,
        updatedAt: now
      });

      return json(res, 200, {
        active: true,
        hwid: deviceId,
        accessToken,
        url: `https://zkeysystem.vercel.app/?hwid=${encodeURIComponent(deviceId)}&access=${encodeURIComponent(accessToken)}`,
        existing: false
      });
    }

    if (method !== 'GET') return json(res, 405, { error: 'Método no permitido.' });

    const hash = String(q.get('hash') || '').trim();
    if (hash) {
      if (!/^[A-Za-z0-9]{64}$/.test(hash)) return json(res, 403, { allowed: false });
      const ticket = cookie(req, '__Host-znexus_ticket');
      if (!ticket) return json(res, 403, { allowed: false });
      const ticketHash = crypto.createHash('sha256').update(ticket).digest('hex');
      const snap = await database.ref(`sessionTickets/${ticketHash}`).get();
      if (!snap.exists()) return json(res, 403, { allowed: false });
      const t = snap.val() || {};
      const allowed = t.used !== true && Number(t.expiresAt || 0) > Date.now() && String(t.deviceId || '').toUpperCase() === deviceId;
      return json(res, allowed ? 200 : 403, { allowed });
    }

    const accessToken = String(q.get('access') || '').trim();
    if (!ACCESS_RE.test(accessToken)) return json(res, 403, { allowed: false, reason: 'invalid_access' });

    const accessSnap = await accessRef.get();
    const access = accessSnap.exists() ? accessSnap.val() || {} : {};
    const storedToken = String(access.accessToken || '');
    const validToken = storedToken === accessToken && accessHash(accessToken) === String(access.accessHash || '');

    if (access.active !== true || String(access.hwid || '').toUpperCase() !== deviceId || !validToken) {
      return json(res, 403, { allowed: false, reason: 'link_inactive' });
    }

    const key = await activeKeyFor(database, deviceId);
    if (!key) {
      await accessRef.update({ active: false, revokedAt: Date.now(), reason: 'key_expired' });
      return json(res, 403, { allowed: false, reason: 'key_expired' });
    }

    return json(res, 200, { allowed: true, expiresAt: key.expiresAt });
  } catch (e) {
    console.error('link/access:', e);
    return json(res, 500, { error: e?.message || 'Error interno del servidor.' });
  }
};
