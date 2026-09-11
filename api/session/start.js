const crypto = require('crypto');
const admin = require('firebase-admin');

const REQUIREMENTS = { 6: 1, 12: 2, 24: 3, 30: 4 };
const SESSION_TTL = 15 * 60 * 1000;
const DEVICE_RE = /^HWID-[A-Z0-9]{24}$/;

function json(res, status, payload) {
  try {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.end(JSON.stringify(payload));
  } catch (e) {
    console.error('response error:', e);
    return res.end(JSON.stringify({ error: 'Error al responder.' }));
  }
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
      try { resolve(JSON.parse(raw)); } catch (_) { reject(new Error('JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  try {
    if (String(req.method || 'GET').toUpperCase() !== 'POST') return json(res, 405, { error: 'Método no permitido.' });
    const data = await readBody(req);
    const hours = Number(data.hours);
    const deviceId = String(data.deviceId || '').trim();
    if (!REQUIREMENTS[hours]) return json(res, 400, { error: 'Duración inválida.' });
    if (!DEVICE_RE.test(deviceId)) return json(res, 400, { error: 'Device ID inválido.' });

    const database = getDb();
    const now = Date.now();
    const id = crypto.randomUUID();
    const totalLinks = REQUIREMENTS[hours];
    const session = { id, dur: hours, link: 1, state: 'ready', createdAt: now, expiresAt: now + SESSION_TTL, deviceId, completedLinks: 0, attempts: 0, totalLinks };
    await database.ref(`sessions/${id}`).set(session);

    return json(res, 200, { session: {
      id: session.id, dur: session.dur, link: session.link, state: session.state,
      createdAt: session.createdAt, expiresAt: session.expiresAt
    }});
  } catch (e) {
    console.error('session/start:', e);
    return json(res, 500, {
      error: e && e.message ? String(e.message) : 'Error interno del servidor.',
      code: e && e.code ? String(e.code) : 'SESSION_START_FAILED'
    });
  }
};
