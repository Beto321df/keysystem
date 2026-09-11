const SITE_KEY = String(process.env.TURNSTILE_SITE_KEY || '').trim();

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Método no permitido.' }));
  }

  if (!SITE_KEY) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: 'TURNSTILE_SITE_KEY no está configurada en Vercel.' }));
  }

  res.statusCode = 200;
  return res.end(JSON.stringify({ siteKey: SITE_KEY }));
};
