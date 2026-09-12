const crypto = require('crypto');
const admin = require('firebase-admin');

const DEVICE_RE = /^HWID-[A-Z0-9]{24}$/;
const KEY_RE = /^FREE_[A-Z]{9}-[0-9]{4}$/;
const ACCESS_RE = /^[A-Fa-f0-9]{64}$/;
const PENDING_TTL = 15 * 60 * 1000;
const BASE_URL = 'https://zkeysystem.vercel.app/';

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

function accessUrl(deviceId, token) {
  return `${BASE_URL}?hwid=${encodeURIComponent(deviceId)}&access=${encodeURIComponent(token)}`;
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

      const now = Date.now();
      const currentKey = await activeKeyFor(database, deviceId);
      const existingSnap = await accessRef.get();
      const existing = existingSnap.exists() ? existingSnap.val() || {} : {};
      const existingToken = String(existing.accessToken || '');
      const existingExpiry = Number(existing.expiresAt || 0);
      const existingPending = existing.active === true && String(existing.hwid || '').toUpperCase() === deviceId && ACCESS_RE.test(existingToken) && (!existingExpiry || existingExpiry > now);

      // Mientras exista una key activa, o un ciclo pendiente de 15 minutos,
      // siempre devolvemos el mismo enlace. Esto evita duplicados por spam de clicks.
      if ((currentKey || existingPending) && existingPending) {
        const expiresAt = currentKey ? currentKey.expiresAt : existingExpiry;
        const patch = currentKey && Number(existing.expiresAt || 0) !== currentKey.expiresAt
          ? { expiresAt: currentKey.expiresAt, key: currentKey.key, updatedAt: now }
          : null;
        if (patch) await accessRef.update(patch);
        return json(res, 200, {
          active: true,
          pendingKey: !currentKey,
          hwid: deviceId,
          accessToken: existingToken,
          url: accessUrl(deviceId, existingToken),
          expiresAt,
          existing: true
        });
      }

      // Si la key anterior expiró, activeKeyFor() ya la limpió. El token viejo
      // no se reutiliza: al reemplazar el registro, el URL anterior queda muerto.
      const accessToken = crypto.randomBytes(32).toString('hex');
      const record = {
        active: true,
        hwid: deviceId,
        accessToken,
        accessHash: accessHash(accessToken),
        key: currentKey?.key || null,
        activatedAt: now,
        updatedAt: now,
        expiresAt: currentKey?.expiresAt || now + PENDING_TTL
      };

      // Firebase transaction makes the "one active URL per HWID" rule atomic.
      const tx = await accessRef.transaction(current => {
        const v = current || {};
        const token = String(v.accessToken || '');
        const exp = Number(v.expiresAt || 0);
        const active = v.active === true && String(v.hwid || '').toUpperCase() === deviceId && ACCESS_RE.test(token) && (!exp || exp > now);
        if (active) return v;
        return record;
      });

      const final = tx.snapshot?.val ? (tx.snapshot.val() || {}) : record;
      const finalToken = String(final.accessToken || accessToken);
      const finalExpiry = Number(final.expiresAt || record.expiresAt);
      const finalKey = currentKey || (KEY_RE.test(String(final.key || '')) && finalExpiry > now ? { key: String(final.key), expiresAt: finalExpiry } : null);
      return json(res, 200, {
        active: true,
        pendingKey: !finalKey,
        hwid: deviceId,
        accessToken: finalToken,
        url: accessUrl(deviceId, finalToken),
        ...(finalKey ? { expiresAt: finalKey.expiresAt } : {}),
        existing: tx.committed === false || finalToken !== accessToken
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

    const accessExpiresAt = Number(access.expiresAt || 0);
    if (accessExpiresAt && accessExpiresAt <= Date.now()) {
      await accessRef.update({ active: false, status: 'expired', expiredAt: Date.now(), revokedAt: Date.now() });
      return json(res, 410, { allowed: false, reason: 'link_expired' });
    }

    const key = await activeKeyFor(database, deviceId);

    if (!key) {
      // Antes de tener key, el token solo dura lo necesario para completar
      // el ciclo de anuncios + Turnstile.
      return json(res, 200, { allowed: true, hwid: deviceId, pendingKey: true });
    }

    if (key.expiresAt <= Date.now()) {
      await accessRef.update({ active: false, status: 'expired', expiredAt: Date.now(), revokedAt: Date.now() });
      return json(res, 410, { allowed: false, reason: 'link_expired' });
    }

    // La key es la fuente de verdad para la expiración del enlace.
    if (accessExpiresAt !== key.expiresAt || String(access.key || '') !== key.key) {
      await accessRef.update({ expiresAt: key.expiresAt, key: key.key, updatedAt: Date.now() });
    }

    return json(res, 200, { allowed: true, expiresAt: key.expiresAt, key: key.key });
  } catch (e) {
    console.error('link/access:', e);
    return json(res, 500, { error: e?.message || 'Error interno del servidor.' });
  }
};
