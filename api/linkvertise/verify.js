const crypto=require('crypto');
const admin=require('firebase-admin');

const REQUIREMENTS={6:1,12:2,24:3,30:4};
const DEVICE_RE=/^HWID-[A-Z0-9]{24}$/;
const MIN_DWELL_MS=8000;

function parseServiceAccount(raw){let s=String(raw||'').trim();const candidates=[s];if((s.startsWith('"')&&s.endsWith('"'))||(s.startsWith("'")&&s.endsWith("'"))){try{const q=s.startsWith('"')?JSON.parse(s):s.slice(1,-1);if(typeof q==='string')candidates.unshift(q)}catch{}}for(const candidate of candidates){try{let o=JSON.parse(candidate);if(typeof o==='string')o=JSON.parse(o);if(o&&o.project_id&&o.client_email&&o.private_key){o.private_key=String(o.private_key).replace(/\\n/g,'\n');return o}}catch{}}throw new Error('La credencial de Firebase no es válida.');}
function app(){if(admin.apps.length)return admin.app();const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSONZ||process.env.FIREBASE_SERVICE_ACCOUNT_JSON,url=process.env.FIREBASE_DATABASE_URL;if(!raw||!url)throw new Error('Firebase del servidor no está configurado.');return admin.initializeApp({credential:admin.credential.cert(parseServiceAccount(raw)),databaseURL:url});}
function json(res,status,payload){res.status(status);res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(payload));}
function validDevice(id){return DEVICE_RE.test(String(id||''));}
function pub(s){return{id:s.id,dur:Number(s.dur),link:Number(s.link),state:s.state,createdAt:Number(s.createdAt),expiresAt:Number(s.expiresAt)};}
function getCookie(req,name){const raw=String(req.headers?.cookie||'');for(const part of raw.split(';')){const [k,...rest]=part.trim().split('=');if(k===name)return rest.join('=');}return '';}
function safeEqual(a,b){const aa=Buffer.from(String(a||''));const bb=Buffer.from(String(b||''));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function normalizeLinkvertiseResponse(raw){let v=String(raw??'').replace(/^\uFEFF/,'').trim();if(!v)return'';try{const parsed=JSON.parse(v);if(typeof parsed==='string')return parsed.trim();if(typeof parsed==='boolean')return parsed?'TRUE':'FALSE';if(parsed&&typeof parsed==='object'){for(const key of ['response','result','status','message','data']){const x=parsed[key];if(typeof x==='string'&&(x.trim()==='TRUE'||x.trim()==='FALSE'||x.trim()==='Invalid token.'))return x.trim();if(typeof x==='boolean'&&['result','status','success'].includes(key))return x?'TRUE':'FALSE';}}}catch{}return v;}
async function body(req){if(req.body&&typeof req.body==='object')return req.body;return await new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>10000)reject(new Error('Solicitud demasiado grande.'));});req.on('end',()=>{if(!raw)return resolve({});try{resolve(JSON.parse(raw));}catch{reject(new Error('JSON inválido.'));}});req.on('error',reject);});}

module.exports=async(req,res)=>{try{
  if(req.method==='OPTIONS'){res.status(204).end();return;}
  if(req.method!=='POST')return json(res,405,{error:'Método no permitido.'});
  const data=await body(req),sessionId=String(data.sessionId||'').trim(),hash=String(data.hash||'').trim(),link=Number(data.link),deviceId=String(data.deviceId||'').trim();
  if(!/^[a-f0-9-]{20,100}$/i.test(sessionId))return json(res,400,{error:'Sesión inválida.'});
  if(!/^[A-Za-z0-9]{64}$/.test(hash))return json(res,400,{error:'Comprobante inválido.'});
  if(!Number.isInteger(link)||link<1||link>4)return json(res,400,{error:'Paso inválido.'});
  if(!validDevice(deviceId))return json(res,400,{error:'Device ID inválido.'});

  const db=app().database(),ref=db.ref(`sessions/${sessionId}`),snap=await ref.get();
  if(!snap.exists())return json(res,404,{error:'Sesión no encontrada.'});
  let s=snap.val()||{};
  if(String(s.deviceId||'')!==deviceId)return json(res,403,{error:'El dispositivo no coincide con la sesión.'});
  if(Number(s.expiresAt||0)<=Date.now()){await ref.remove();return json(res,410,{error:'La sesión expiró.'});}
  if(s.state!=='awaiting_external_return')return json(res,409,{error:'Ese paso no está pendiente.'});
  if(Number(s.link)!==link)return json(res,409,{error:'Ese paso no corresponde a esta sesión.'});
  if(s.verificationUsed===true)return json(res,409,{error:'Este comprobante ya fue utilizado.'});

  const ticket=getCookie(req,'__Host-znexus_ticket');
  if(!ticket||!s.ticketHash||!safeEqual(crypto.createHash('sha256').update(ticket).digest('hex'),String(s.ticketHash)))return json(res,403,{error:'Falta el pase seguro del navegador. Abre el enlace desde el botón del sistema.'});
  if(Number(s.ticketExpiresAt||0)<=Date.now())return json(res,403,{error:'El pase seguro expiró. Inicia el enlace otra vez.'});

  const started=Number(s.externalStartedAt||0),elapsed=Date.now()-started;
  if(!started||elapsed<MIN_DWELL_MS)return json(res,403,{error:`Verificación demasiado rápida. Espera ${Math.max(1,Math.ceil((MIN_DWELL_MS-Math.max(0,elapsed))/1000))}s y vuelve desde Linkvertise.`,code:'DWELL_REQUIRED'});

  const token=String(process.env.LINKVERTISE_ANTI_BYPASS_TOKEN||'').trim();
  if(!token)return json(res,500,{error:'Falta LINKVERTISE_ANTI_BYPASS_TOKEN en Vercel.'});
  if(!/^[A-Za-z0-9]{64}$/.test(token))return json(res,500,{error:'El token Anti-Bypassing no tiene el formato esperado.'});

  const u=new URL('https://publisher.linkvertise.com/api/v1/anti_bypassing');u.searchParams.set('token',token);u.searchParams.set('hash',hash);
  const ac=new AbortController(),tm=setTimeout(()=>ac.abort(),5000);let lv,result;try{lv=await fetch(u,{method:'POST',headers:{Accept:'text/plain, */*','User-Agent':'ZNexus-Key-System/2026'},signal:ac.signal,cache:'no-store'});result=normalizeLinkvertiseResponse(await lv.text());}finally{clearTimeout(tm)}
  if(result==='Invalid token.')return json(res,500,{error:'El token Anti-Bypassing configurado en Vercel no es válido para Linkvertise.'});
  if(result!=='TRUE')return json(res,403,{error:'Linkvertise no confirmó este comprobante. Regresa desde el mismo enlace y verifica de nuevo.'});

  const latest=await ref.get();
  if(!latest.exists())return json(res,404,{error:'La sesión ya no está disponible.'});
  s=latest.val()||{};
  if(String(s.deviceId||'')!==deviceId)return json(res,403,{error:'El dispositivo no coincide con la sesión.'});
  if(Number(s.expiresAt||0)<=Date.now()){await ref.remove();return json(res,410,{error:'La sesión expiró durante la verificación.'});}
  if(s.state!=='awaiting_external_return'||Number(s.link)!==link||s.verificationUsed===true)return json(res,409,{error:'Ese paso ya fue procesado.'});
  if(!s.ticketHash||!safeEqual(String(s.ticketHash),crypto.createHash('sha256').update(ticket).digest('hex')))return json(res,403,{error:'El pase seguro ya no es válido.'});

  const total=REQUIREMENTS[Number(s.dur)];
  if(!total)return json(res,400,{error:'Duración de sesión inválida.'});
  const completed=Math.min(total,Number(s.completedLinks||0)+1),next=Number(s.link)<total?Number(s.link)+1:Number(s.link),state=completed>=total?'complete':'ready',now=Date.now();
  await ref.update({link:next,completedLinks:completed,state,lastVerifiedAt:now,lastVerifiedHash:hash,verificationUsed:true,verificationConsumedAt:now,ticketHash:null,verificationNonce:null,ticketIssuedAt:null,ticketExpiresAt:null});
  res.setHeader('Set-Cookie','__Host-znexus_ticket=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  const saved=await ref.get();
  if(!saved.exists())return json(res,404,{error:'La sesión desapareció después de verificar.'});
  return json(res,200,{session:pub(saved.val())});
}catch(e){console.error(e);return json(res,500,{error:e?.name==='AbortError'?'Linkvertise tardó demasiado en responder.':(typeof e?.message==='string'?e.message:'Error interno del servidor.')});}};
