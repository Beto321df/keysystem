const crypto = require('crypto');
const admin = require('firebase-admin');

const REQUIREMENTS = { 6: 1, 12: 2, 24: 3, 30: 4 };
const KEY_RE = /^FREE_[A-Z]{9}-[0-9]{4}$/;
const DEVICE_RE = /^HWID-[A-Z0-9]{24}$/;
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
  for (const candidate of [s, s.startsWith('"') && s.endsWith('"') ? JSON.parse(s) : s]) {
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

function randomLetters(n) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < n; i++) out += chars[crypto.randomInt(chars.length)];
  return out;
}

function randomKey() {
  return `FREE_${randomLetters(9)}-${String(crypto.randomInt(10000)).padStart(4, '0')}`;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 12000) reject(new Error('Solicitud demasiado grande.'));
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
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido.' });

    const body = await readBody(req);
    const sessionId = String(body.sessionId || '').trim();
    const deviceId = String(body.deviceId || '').trim().toUpperCase();

    if (!/^[a-f0-9-]{20,100}$/i.test(sessionId)) return json(res, 400, { error: 'Sesión inválida.' });
    if (!DEVICE_RE.test(deviceId)) return json(res, 400, { error: 'Device ID inválido.' });

    const database = db();
    const sessionRef = database.ref(`sessions/${sessionId}`);
    const snap = await sessionRef.get();
    if (!snap.exists()) return json(res, 404, { error: 'Sesión no encontrada.' });

    const session = snap.val() || {};
    if (String(session.deviceId || '').toUpperCase() !== deviceId) return json(res, 403, { error: 'El dispositivo no coincide con la sesión.' });
    if (Number(session.expiresAt || 0) <= Date.now()) {
      await sessionRef.remove();
      return json(res, 410, { error: 'La sesión expiró.' });
    }

    const hours = Number(session.dur);
    const required = REQUIREMENTS[hours];
    if (!required) return json(res, 400, { error: 'Duración de sesión inválida.' });
    if (Number(session.completedLinks || 0) < required || session.state !== 'complete') {
      return json(res, 409, { error: 'Completa todos los pasos antes de generar la key.' });
    }

    // Turnstile is verified and consumed by /api/linkvertise/verify on the final step.
    // The session timestamp is the server-side proof; asking for the same token again
    // here would reject a valid flow because Turnstile tokens are single-use.
    if (!Number(session.turnstileVerifiedAt || 0)) {
      return json(res, 403, { error: 'La verificación anti-bot no fue válida.' });
    }

    const owner = ownerHash(deviceId);
    const ownerRef = database.ref(`keyOwners/${owner}`);
    const ownerSnap = await ownerRef.get();
    if (ownerSnap.exists()) {
      const old = ownerSnap.val() || {};
      const oldKey = String(old.key || '').toUpperCase();
      if (KEY_RE.test(oldKey) && Number(old.expiresAt || 0) > Date.now()) {
        const accessRef = database.ref(`linkAccess/${owner}`);
        const accessSnap = await accessRef.get();
        if (accessSnap.exists()) {
          const access = accessSnap.val() || {};
          if (access.active === true && String(access.hwid || '').toUpperCase() === deviceId && ACCESS_RE.test(String(access.accessToken || ''))) {
            await accessRef.update({ key: oldKey, expiresAt: Number(old.expiresAt), updatedAt: Date.now() });
          }
        }
        return json(res, 200, { ok: true, key: oldKey, expiresAt: Number(old.expiresAt), existing: true });
      }
    }

    let key = '';
    let expiresAt = 0;
    for (let i = 0; i < 12; i++) {
      const candidate = randomKey();
      const ref = database.ref(`keys/${candidate}`);
      const exists = await ref.get();
      if (exists.exists()) continue;
      key = candidate;
      expiresAt = Date.now() + hours * 60 * 60 * 1000;
      const record = {
        key,
        hwid: deviceId,
        bound: true,
        status: 'active',
        duration: hours,
        createdAt: Date.now(),
        expiresAt,
        ownerHash: owner
      };
      const tx = await ref.transaction(cur => cur == null ? record : undefined);
      if (tx.committed) break;
      key = '';
    }

    if (!key) return json(res, 500, { error: 'No se pudo generar una key única.' });

    await ownerRef.set({ key, expiresAt, updatedAt: Date.now() });

    // El acceso actual queda ligado a esta key y expira exactamente cuando la key.
    // El token no se reemplaza mientras siga activo, así se conserva un único URL.
    const accessRef = database.ref(`linkAccess/${owner}`);
    const accessSnap = await accessRef.get();
    const access = accessSnap.exists() ? accessSnap.val() || {} : {};
    const accessToken = String(access.accessToken || '');
    if (access.active === true && String(access.hwid || '').toUpperCase() === deviceId && ACCESS_RE.test(accessToken)) {
      await accessRef.update({
        key,
        expiresAt,
        status: 'active',
        keyGenerated: true,
        keyGeneratedAt: Date.now(),
        updatedAt: Date.now(),
        accessHash: accessHash(accessToken)
      });
    }

    await sessionRef.update({ keyGenerated: true, key, keyGeneratedAt: Date.now() });

    return json(res, 200, { ok: true, key, expiresAt, duration: hours, hwid: deviceId, existing: false });
  } catch (e) {
    console.error('key/generate:', e);
    return json(res, 500, { error: e?.message || 'Error interno del servidor.' });
  }
};
