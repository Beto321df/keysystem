const crypto = require('crypto');
const admin = require('firebase-admin');

const AD_PROVIDER_BASE_URL = process.env.AD_PROVIDER_BASE_URL || 'https://link-hub.net/6768455/XHZ48dyFzfQL';
const DEVICE_RE = /^HWID-[A-Z0-9]{24}$/;
const SESSION_TTL = 15 * 60 * 1000;

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
  if (!raw || !databaseURL) throw new Error('Firebase del servidor no está configurado.');
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

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

module.exports = async function handler(req, res) {
  try {
    if (String(req.method || 'GET').toUpperCase() !== 'POST') return json(res, 405, { error: 'Método no permitido.' });

    const data = await readBody(req);
    const sessionId = String(data.sessionId || '').trim();
    const link = Number(data.link);
    const deviceId = String(data.deviceId || '').trim();
    if (!/^[a-f0-9-]{20,100}$/i.test(sessionId)) return json(res, 400, { error: 'Sesión inválida.' });
    if (!Number.isInteger(link) || link < 1 || link > 4) return json(res, 400, { error: 'Paso inválido.' });
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
    if (!['ready', 'awaiting_external_return'].includes(String(s.state)) || link !== Number(s.link)) {
      return json(res, 409, { error: 'El enlace no está autorizado en este estado.' });
    }

    const ticket = crypto.randomBytes(32).toString('base64url');
    const ticketHash = sha256(ticket);
    const now = Date.now();
    const ticketExpiresAt = Math.min(Number(s.expiresAt || 0), now + SESSION_TTL);
    const userAgentHash = sha256(req.headers?.['user-agent'] || '');
    const acceptLanguageHash = sha256(req.headers?.['accept-language'] || '');
    let providerHost = 'link-hub.net';
    try { providerHost = new URL(AD_PROVIDER_BASE_URL).hostname.toLowerCase(); } catch (_) {}

    await ref.update({
      state: 'awaiting_external_return',
      externalStartedAt: now,
      attempts: Number(s.attempts || 0) + 1,
      verificationNonce: crypto.randomBytes(24).toString('hex'),
      ticketHash,
      ticketIssuedAt: now,
      ticketExpiresAt,
      ticketUserAgentHash: userAgentHash,
      ticketAcceptLanguageHash: acceptLanguageHash,
      ticketProviderHost: providerHost,
      verificationUsed: false
    });

    await database.ref(`sessionTickets/${ticketHash}`).set({
      sessionId: s.id,
      dur: Number(s.dur),
      link: Number(s.link),
      deviceId,
      createdAt: now,
      expiresAt: ticketExpiresAt,
      used: false,
      userAgentHash,
      acceptLanguageHash,
      providerHost
    });

    res.setHeader('Set-Cookie', `__Host-znexus_ticket=${ticket}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(1, Math.ceil((ticketExpiresAt - now) / 1000))}`);
    return json(res, 200, {
      session: {
        id: s.id,
        dur: Number(s.dur),
        link: Number(s.link),
        state: 'awaiting_external_return',
        createdAt: Number(s.createdAt),
        expiresAt: Number(s.expiresAt)
      },
      redirectUrl: AD_PROVIDER_BASE_URL
    });
  } catch (e) {
    console.error('session/prepare-link:', e);
    return json(res, 500, { error: e && e.message ? String(e.message) : 'Error interno del servidor.', code: e && e.code ? String(e.code) : 'PREPARE_LINK_FAILED' });
  }
};
