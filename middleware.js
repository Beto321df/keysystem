const HWID_RE = /^HWID-[A-Z0-9]{24}$/;
const HASH_RE = /^[A-Za-z0-9]{64}$/;

function blocked(message) {
  return new Response(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Access required</title>
<style>
html,body{margin:0;min-height:100%;background:#050508;color:#fff;font-family:Inter,system-ui,sans-serif}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
.box{width:min(430px,100%);padding:32px;border:1px solid #292941;border-radius:24px;background:linear-gradient(145deg,#171724,#09090f);text-align:center;box-shadow:0 30px 100px rgba(0,0,0,.55)}
h1{font-size:22px;margin:0 0 10px}p{color:#8b8b9a;font-size:13px;line-height:1.6;margin:0}
</style>
</head>
<body><div class="box"><h1>Access required</h1><p>${message}</p></div></body>
</html>`, {
    status: 403,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname !== '/' && pathname !== '/index.html') return;

  const hwid = String(url.searchParams.get('hwid') || '').trim().toUpperCase();
  const hash = String(url.searchParams.get('hash') || '').trim();

  if (hash) {
    if (!HASH_RE.test(hash)) return blocked('El comprobante de acceso no es válido.');

    // Linkvertise return URLs are allowed only while the one-time browser
    // ticket created by the server is still valid.
    try {
      const checkUrl = new URL('/api/link/access', request.url);
      checkUrl.searchParams.set('hash', hash);
      const response = await fetch(checkUrl, {
        method: 'GET',
        headers: { cookie: request.headers.get('cookie') || '' },
        cache: 'no-store'
      });
      if (!response.ok) return blocked('El pase de acceso ya no es válido. Regresa usando el enlace generado por el script.');
      const data = await response.json();
      if (data?.allowed !== true) return blocked('El pase de acceso ya no es válido. Regresa usando el enlace generado por el script.');
    } catch {
      return blocked('No se pudo comprobar el acceso. Inténtalo de nuevo desde el script.');
    }
    return;
  }

  if (!HWID_RE.test(hwid)) {
    return blocked('Este sistema solo puede abrirse desde el enlace generado por el script.');
  }

  // A HWID URL is valid only while its server-side link grant and key are
  // active. After key expiration the grant is automatically revoked.
  try {
    const checkUrl = new URL('/api/link/access', request.url);
    checkUrl.searchParams.set('hwid', hwid);
    const response = await fetch(checkUrl, { method: 'GET', cache: 'no-store' });
    if (!response.ok) return blocked('Este enlace ya expiró. Obtén un enlace nuevo desde el script.');
    const data = await response.json();
    if (data?.allowed !== true) return blocked('Este enlace ya expiró. Obtén un enlace nuevo desde el script.');
  } catch {
    return blocked('No se pudo comprobar el acceso. Inténtalo de nuevo desde el script.');
  }
}

export const config = {
  matcher: ['/', '/index.html']
};
