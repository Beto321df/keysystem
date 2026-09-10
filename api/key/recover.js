const crypto = require('crypto');
const admin = require('firebase-admin');

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
      if (o && typeof o === 'object' && o.project_id && o.client_email && o.private_key) return o;
    } catch {}
  }
  throw new Error('FIREBASE_SERVICE_ACCOUNT_JSONZ no contiene un JSON de Service Account válido.');
}

function db() {
  if (admin.apps.length) return admin.app().database();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSONZ;
  const url = process.env.FIREBASE_DATABASE_URL;
  if (!raw || !url) throw new Error('Firebase del servidor no está configurado.');
  return admin.initializeApp({
    credential: admin.credential.cert(parseServiceAccount(raw)),
    databaseURL: url
  }).database();
}

function json(res, status, payload) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Método no permitido.' });

    const origin = String(req.headers?.origin || '');
    if (origin === 'https://zkeysystem.vercel.app' || origin === 'null') {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    const q = new URL(req.url || '/', 'https://placeholder.local').searchParams;
    const deviceId = String(q.get('deviceId') || '');
    if (!/^HWID-[A-Z0-9]{24}$/.test(deviceId)) return json(res, 200, { found: false });

    const key = 'ZNEXUS-' + crypto.createHash('sha256').update(deviceId).digest('hex').toUpperCase().slice(0, 9);
    const ref = db().ref(`keys/${key}`);
    const snap = await ref.get();
    if (!snap.exists()) return json(res, 200, { found: false });

    const record = snap.val() || {};
    const expiresAt = Number(record.expiresAt || 0);
    if (record.status === 'revoked') return json(res, 200, { found: false, revoked: true });
    if (!expiresAt || expiresAt <= Date.now()) {
      await ref.remove();
      return json(res, 200, { found: false, expired: true });
    }

    return json(res, 200, { found: true, key, expiresAt });
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : 'Error del servidor.' });
  }
};
