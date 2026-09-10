module.exports = function (req, res) {
  res.status(200);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify({
    ok: true,
    service: 'znexus-api',
    version: '2026.9-free',
    firebaseConfigured: Boolean((process.env.FIREBASE_SERVICE_ACCOUNT_JSONZ || process.env.FIREBASE_SERVICE_ACCOUNT_JSON) && process.env.FIREBASE_DATABASE_URL),
    linkvertiseConfigured: Boolean(process.env.LINKVERTISE_ANTI_BYPASS_TOKEN)
  }));
};
