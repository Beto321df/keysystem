const admin = require('firebase-admin');

const DEVICE_RE = /^HWID-[A-Z0-9]{24}$/;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(JSON.stringify(payload));
}

function parseServiceAccount(raw) {
  let s = String(raw || '').trim();
  const candidates = [s];
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try {
      const q = s.startsWith('"') ? JSON.parse(s) : s.slice(1, -1);
      if (typeof q === 'string') candidates.unshift(q);
    } catch (_) {}
  }
  for (const candidate of candidates) {
    try {
      let obj = JSON.parse(candidate);
      if (typeof obj === 'string') obj = JSON.parse(obj);
      if (obj && obj.project_id && obj.client_email && obj.private_key) {
        obj.private_key = String(obj.private_key).replace(/\\n/g, '\n');
        return obj;
      }
    } catch (_) {}
  }
  throw new Error('La credencial de Firebase no es un Service Account JSON válido.');
}

function getDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSONZ || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  if (!raw || !databaseURL) throw new Error('Firebase del servidor no está configurado. Falta FIREBASE_DATABASE_URL o la credencial.');
  const app = admin.apps.length ? admin.app() : admin.initializeApp({
    credential: admin.credential.cert(parseServiceAccount(raw)),
    databaseURL
  });
  return app.database();
}

module.exports = async function handler(req, res) {
  try {
    if (String(req.method || 'GET').toUpperCase() !== 'GET') return json(res, 405, { error: 'Método no permitido.' });
    const q = new URL(req.url || '/', 'https://placeholder.local').searchParams;
    const sessionId = String(q.get('sessionId') || '').trim();
    const deviceId = String(q.get('deviceId') || '').trim();
    if (!/^[a-f0-9-]{20,100}$/i.test(sessionId)) return json(res, 400, { error: 'Sesión inválida.' });
    if (!DEVICE_RE.test(deviceId)) return json(res, 400, { error: 'Device ID inválido.' });

    const database = getDb();
    const ref = database.ref(`sessions/${sessionId}`);
    const snap = await ref.get();
    if (!snap.exists()) return json(res, 404, { error: 'Sesión no encontrada.' });

    const s = snap.val() || {};
    if (String(s.deviceId || '') !== deviceId) return json(res, 403, { error: 'El dispositivo no coincide con la sesión.' });
    if (Number(s.expiresAt || 0) <= Date.now()) {
      await ref.remove();
      return json(res, 410, { error: 'La sesión expiró.' });
    }

    return json(res, 200, { session: {
      id: s.id,
      dur: Number(s.dur),
      link: Number(s.link),
      state: s.state,
      createdAt: Number(s.createdAt),
      expiresAt: Number(s.expiresAt)
    }});
  } catch (e) {
    console.error('session/get:', e);
    return json(res, 500, { error: e && e.message ? String(e.message) : 'Error interno del servidor.', code: e && e.code ? String(e.code) : 'SESSION_GET_FAILED' });
  }
};
