const HWID_RE = /^HWID-[A-Z0-9]{24}$/;
const HASH_RE = /^[A-Za-z0-9]{64}$/;

export default function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname === '/' || pathname === '/index.html') {
    const hwid = String(url.searchParams.get('hwid') || '').trim().toUpperCase();
    const hash = String(url.searchParams.get('hash') || '').trim();

    // Linkvertise returns to the hash URL, so that return URL must remain
    // accessible. The backend still requires the valid server ticket/session
    // before accepting the hash, so a copied hash cannot complete the flow.
    const validLaunch = HWID_RE.test(hwid);
    const validReturn = HASH_RE.test(hash);

    if (!validLaunch && !validReturn) {
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
<p>Este sistema solo puede abrirse desde el enlace generado por el script.</p>
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
  }

  return;
}

export const config = {
  matcher: ['/', '/index.html']
};
