const HWID_RE = /^HWID-[A-Z0-9]{24}$/;
const HASH_RE = /^[A-Za-z0-9]{64}$/;
const ACCESS_RE = /^[A-Fa-f0-9]{64}$/;

export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname === '/' || pathname === '/index.html') {
    const hwid = String(url.searchParams.get('hwid') || '').trim().toUpperCase();
    const access = String(url.searchParams.get('access') || '').trim();
    const hash = String(url.searchParams.get('hash') || '').trim();

    // Link de lanzamiento: requiere HWID + token registrado en Firebase.
    if (HWID_RE.test(hwid) && ACCESS_RE.test(access)) {
      try {
        const checkUrl = new URL('/api/link/access', request.url);
        checkUrl.searchParams.set('hwid', hwid);
        checkUrl.searchParams.set('access', access);

        const check = await fetch(checkUrl.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store'
        });

        if (check.ok) return;
      } catch (e) {
        console.error('middleware access check:', e);
      }
    }

    // Linkvertise devuelve a la URL con hash. El backend verifica el ticket
    // HttpOnly + sesión + dispositivo antes de permitir completar el flujo.
    // Aquí solo dejamos pasar el formato correcto para que el frontend pueda
    // ejecutar esa validación server-side.
    if (HASH_RE.test(hash)) return;

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
<body>
<div class="box">
<h1>Access required</h1>
<p>Este enlace ya no es válido. Ejecuta nuevamente el script para obtener un enlace nuevo.</p>
</div>
</body>
</html>`, {
      status: 403,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }

  return;
}

export const config = {
  matcher: ['/', '/index.html']
};
