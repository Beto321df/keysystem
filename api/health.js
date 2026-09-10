const admin = require('firebase-admin');

module.exports = async function (req, res) {
  const out = {
    ok: true,
    service: 'znexus-api',
    version: '2026.9-free',
    firebaseConfigured: Boolean((process.env.FIREBASE_SERVICE_ACCOUNT_JSONZ || process.env.FIREBASE_SERVICE_ACCOUNT_JSON) && process.env.FIREBASE_DATABASE_URL),
    linkvertiseConfigured: Boolean(process.env.LINKVERTISE_ANTI_BYPASS_TOKEN),
    firebaseRuntime: false
  };

  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSONZ || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const url = process.env.FIREBASE_DATABASE_URL;
    if (!raw || !url) throw new Error('Faltan variables de Firebase.');
    let service;
    const s = String(raw).trim();
    try {
      service = JSON.parse(s);
      if (typeof service === 'string') service = JSON.parse(service);
    } catch {
      throw new Error('El JSON de Firebase no se puede interpretar.');
    }
    if (!service?.project_id || !service?.client_email || !service?.private_key) {
      throw new Error('El Service Account no tiene project_id, client_email o private_key.');
    }
    const app = admin.apps.length ? admin.app() : admin.initializeApp({
      credential: admin.credential.cert(service),
      databaseURL: url
    });
    const snap = await app.database().ref('.info/connected').get();
    out.firebaseRuntime = true;
    out.firebaseConnected = Boolean(snap.val());
  } catch (e) {
    out.firebaseError = typeof e?.message === 'string' ? e.message : 'Error de Firebase.';
  }

  res.status(200);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(out));
};
