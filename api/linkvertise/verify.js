const crypto = require('crypto');
const admin = require('firebase-admin');

const REQUIREMENTS = { 6: 1, 12: 2, 24: 3, 30: 4 };
const MIN_DWELL_PER_LINK_MS = 6 * 1000;
const DEVICE_RE = /^HWID-[A-Z0-9]{24}$/;
const HOSTNAME = String(process.env.TURNSTILE_HOSTNAME || 'zkeysystem.vercel.app').trim().toLowerCase();

function json(res,status,payload){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(payload));}
function parseServiceAccount(raw){let s=String(raw||'').trim(),c=[s];if((s.startsWith('"')&&s.endsWith('"'))||(s.startsWith("'")&&s.endsWith("'"))){try{const q=s.startsWith('"')?JSON.parse(s):s.slice(1,-1);if(typeof q==='string')c.unshift(q)}catch{}}for(const x of c){try{let o=JSON.parse(x);if(typeof o==='string')o=JSON.parse(o);if(o&&o.project_id&&o.client_email&&o.private_key){o.private_key=String(o.private_key).replace(/\\n/g,'\n');return o}}catch{}}throw new Error('La credencial de Firebase no es válida.');}
function db(){if(admin.apps.length)return admin.app().database();const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSONZ||process.env.FIREBASE_SERVICE_ACCOUNT_JSON,url=process.env.FIREBASE_DATABASE_URL;if(!raw||!url)throw new Error('Firebase del servidor no está configurado.');return admin.initializeApp({credential:admin.credential.cert(parseServiceAccount(raw)),databaseURL:url}).database();}
function cookie(req,name){const raw=String(req.headers?.cookie||'');for(const p of raw.split(';')){const [k,...r]=p.trim().split('=');if(k===name)return r.join('=')}return '';}
function equal(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function body(req){if(req.body&&typeof req.body==='object')return Promise.resolve(req.body);return new Promise((resolve,reject)=>{let r='';req.on('data',c=>{r+=c;if(r.length>12000)reject(new Error('Solicitud demasiado grande.'))});req.on('end',()=>{if(!r)return resolve({});try{resolve(JSON.parse(r))}catch{reject(new Error('JSON inválido.'))}});req.on('error',reject)})}
async function verifyHuman(token,req){
  const secret=String(process.env.TURNSTILE_SECRET_KEY||'').trim();
  if(!secret)throw Object.assign(new Error('TURNSTILE_SECRET_KEY no está configurada en Vercel.'),{status:500});
  if(!token||token.length>2048)throw Object.assign(new Error('Completa la verificación humana.'),{status:403});
  const remote=String(req.headers?.['cf-connecting-ip']||req.headers?.['x-forwarded-for']||'').split(',')[0].trim();
  const payload={secret,response:token,idempotency_key:crypto.randomUUID()};if(remote)payload.remoteip=remote;
  const ac=new AbortController(),tm=setTimeout(()=>ac.abort(),7000);let r,d;try{r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload),signal:ac.signal,cache:'no-store'});d=await r.json()}finally{clearTimeout(tm)}
  if(!r.ok||!d?.success)throw Object.assign(new Error('La verificación humana fue rechazada. Completa Turnstile de nuevo.'),{status:403});
  if(String(d.action||'').trim()!=='keyverify')throw Object.assign(new Error('La verificación no corresponde a este acceso.'),{status:403});
  if(HOSTNAME&&String(d.hostname||'').trim().toLowerCase()!==HOSTNAME)throw Object.assign(new Error('Host de verificación inválido.'),{status:403});
  return d;
}

module.exports=async(req,res)=>{try{
  if(req.method!=='POST')return json(res,405,{error:'Método no permitido.'});
  const x=await body(req),sessionId=String(x.sessionId||'').trim(),hash=String(x.hash||'').trim(),link=Number(x.link),deviceId=String(x.deviceId||'').trim(),turnstileToken=String(x.turnstileToken||'').trim();
  if(!/^[a-f0-9-]{20,100}$/i.test(sessionId))return json(res,400,{error:'Sesión inválida.'});
  if(!/^[A-Za-z0-9]{64}$/.test(hash))return json(res,400,{error:'Comprobante inválido.'});
  if(!Number.isInteger(link)||link<1||link>4)return json(res,400,{error:'Paso inválido.'});
  if(!DEVICE_RE.test(deviceId))return json(res,400,{error:'Device ID inválido.'});

  const ref=db().ref(`sessions/${sessionId}`),snap=await ref.get();
  if(!snap.exists())return json(res,404,{error:'Sesión no encontrada.'});
  let s=snap.val()||{};
  const required=REQUIREMENTS[Number(s.dur)];
  if(!required)return json(res,400,{error:'Duración de sesión inválida.'});
  if(link>required)return json(res,409,{error:'Ese paso no es necesario para esta duración.'});
  if(String(s.deviceId||'')!==deviceId)return json(res,403,{error:'El dispositivo no coincide con la sesión.'});
  if(Number(s.expiresAt||0)<=Date.now()){await ref.remove();return json(res,410,{error:'La sesión expiró.'});}
  if(s.state!=='awaiting_external_return'||Number(s.link)!==link)return json(res,409,{error:'Ese paso no está pendiente.'});
  if(s.verificationUsed===true)return json(res,409,{error:'Este intento ya fue procesado.'});

  const ticket=cookie(req,'__Host-znexus_ticket'),ticketHash=crypto.createHash('sha256').update(ticket).digest('hex');
  if(!ticket||!s.ticketHash||!equal(ticketHash,s.ticketHash))return json(res,403,{error:'Pase de navegador inválido. Regresa usando el flujo normal.'});
  if(Number(s.ticketExpiresAt||0)<=Date.now())return json(res,403,{error:'El pase de navegador expiró. Inicia el paso de nuevo.'});

  const now=Date.now(),stepStart=Number(s.externalStartedAt||0),stepElapsed=stepStart?Math.max(0,now-stepStart):0,totalDwell=Number(s.totalExternalMs||0)+stepElapsed;
  if(!stepStart)return json(res,403,{error:'No se detectó el inicio del paso.'});
  const minTotal=required*MIN_DWELL_PER_LINK_MS;
  if(totalDwell<minTotal)return json(res,403,{error:`Proceso demasiado rápido. Completa los ${required} anuncio(s) antes de verificar.`,code:'FLOW_TOO_FAST'});

  const completed=Math.min(required,Number(s.completedLinks||0)+1),next=Number(s.link)<required?Number(s.link)+1:Number(s.link),state=completed>=required?'complete':'ready';
  if(completed===required)await verifyHuman(turnstileToken,req);

  const latest=await ref.get();
  if(!latest.exists())return json(res,404,{error:'La sesión ya no está disponible.'});
  s=latest.val()||{};
  if(String(s.deviceId||'')!==deviceId||s.state!=='awaiting_external_return'||Number(s.link)!==link||s.verificationUsed===true)return json(res,409,{error:'Ese paso ya fue procesado.'});
  if(!s.ticketHash||!equal(String(s.ticketHash),crypto.createHash('sha256').update(ticket).digest('hex')))return json(res,403,{error:'El pase de navegador ya no es válido.'});

  await ref.update({link:next,completedLinks:completed,totalLinks:required,state,totalExternalMs:totalDwell,lastVerifiedAt:now,lastVerifiedHash:hash,verificationUsed:true,verificationConsumedAt:now,turnstileVerifiedAt:completed===required?now:null,ticketHash:null,verificationNonce:null,ticketIssuedAt:null,ticketExpiresAt:null,externalStartedAt:null});
  res.setHeader('Set-Cookie','__Host-znexus_ticket=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  return json(res,200,{session:{id:s.id,dur:Number(s.dur),link:next,state,createdAt:Number(s.createdAt),expiresAt:Number(s.expiresAt)}});
}catch(e){console.error('linkvertise/verify:',e);return json(res,Number(e?.status)||500,{error:e?.name==='AbortError'?'Turnstile tardó demasiado en responder.':(typeof e?.message==='string'?e.message:'Error interno del servidor.')});}};
