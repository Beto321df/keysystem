const admin=require('firebase-admin');

const REQUIREMENTS={6:1,12:2,24:3,30:4};

function app(){
  if(admin.apps.length)return admin.app();
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const url=process.env.FIREBASE_DATABASE_URL;
  if(!raw||!url)throw new Error('Firebase del servidor no está configurado.');
  return admin.initializeApp({credential:admin.credential.cert(JSON.parse(raw)),databaseURL:url});
}

function json(res,status,payload){
  res.status(status);
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify(payload));
}

function validDevice(id){return /^HWID-[A-Z0-9]{24}$/.test(String(id||''));}
function pub(s){return{id:s.id,dur:Number(s.dur),link:Number(s.link),state:s.state,createdAt:Number(s.createdAt),expiresAt:Number(s.expiresAt)};}

function normalizeLinkvertiseResponse(raw){
  let v=String(raw??'').replace(/^\uFEFF/,'').trim();
  if(!v)return {value:'',shape:'empty'};
  try{
    const parsed=JSON.parse(v);
    if(typeof parsed==='string')return {value:parsed.trim(),shape:'json-string'};
    if(typeof parsed==='boolean')return {value:parsed?'TRUE':'FALSE',shape:'json-boolean'};
    if(parsed&&typeof parsed==='object'){
      for(const key of ['response','result','status','message','data']){
        const x=parsed[key];
        if(typeof x==='string'){
          const t=x.trim();
          if(t==='TRUE'||t==='FALSE'||t==='Invalid token.')return {value:t,shape:`json-${key}`};
        }
        if(typeof x==='boolean'&&(key==='result'||key==='status'||key==='success'))return {value:x?'TRUE':'FALSE',shape:`json-${key}-boolean`};
      }
    }
  }catch{}
  return {value:v,shape:'text'};
}

module.exports=async(req,res)=>{
  try{
    if(req.method==='OPTIONS'){res.status(204).end();return;}
    if(req.method!=='POST')return json(res,405,{error:'Método no permitido.'});

    const body=typeof req.body==='object'&&req.body?req.body:{};
    const sessionId=String(body.sessionId||'');
    const hash=String(body.hash||'').trim();
    const link=Number(body.link);
    const deviceId=String(body.deviceId||'');

    if(!/^[a-f0-9-]{20,100}$/i.test(sessionId))return json(res,400,{error:'Sesión inválida.'});
    if(!/^[A-Za-z0-9]{64}$/.test(hash))return json(res,400,{error:'Comprobante inválido.'});
    if(!validDevice(deviceId))return json(res,400,{error:'Device ID inválido.'});

    const db=app().database();
    const ref=db.ref(`sessions/${sessionId}`);
    const snap=await ref.get();
    if(!snap.exists())return json(res,404,{error:'Sesión no encontrada.'});
    let s=snap.val();

    if(s.deviceId!==deviceId)return json(res,403,{error:'El dispositivo no coincide con la sesión.'});
    if(Number(s.expiresAt)<=Date.now()){await ref.remove();return json(res,410,{error:'La sesión expiró.'});}
    if(s.lastVerifiedHash===hash)return json(res,200,{session:pub(s),deduplicated:true});
    if(s.state==='complete')return json(res,200,{session:pub(s),deduplicated:true});
    if(s.state!=='awaiting_external_return'||Number(s.link)!==link)return json(res,409,{error:'Ese paso ya fue procesado o no está pendiente.'});

    const token=String(process.env.LINKVERTISE_ANTI_BYPASS_TOKEN||'').trim();
    if(!token)return json(res,500,{error:'Falta LINKVERTISE_ANTI_BYPASS_TOKEN en Vercel.'});
    if(!/^[A-Za-z0-9]{64}$/.test(token))return json(res,500,{error:'El token Anti-Bypassing de Vercel no tiene el formato de 64 caracteres requerido por Linkvertise.'});

    // Linkvertise stores the hash for only a few seconds, so verify immediately.
    const u=new URL('https://publisher.linkvertise.com/api/v1/anti_bypassing');
    u.searchParams.set('token',token);
    u.searchParams.set('hash',hash);
    const ac=new AbortController();
    const tm=setTimeout(()=>ac.abort(),5000);
    let lv,parsed;
    try{
      lv=await fetch(u,{method:'POST',headers:{Accept:'text/plain, */*','User-Agent':'ZNexus-Key-System/2026'},signal:ac.signal,cache:'no-store'});
      parsed=normalizeLinkvertiseResponse(await lv.text());
    }finally{clearTimeout(tm)}

    const result=parsed.value;
    if(result==='Invalid token.')return json(res,500,{error:'El token Anti-Bypassing configurado en Vercel no es válido para Linkvertise.'});
    if(result==='FALSE'){
      const latest=await ref.get();
      if(latest.exists()){
        const x=latest.val();
        if(x.lastVerifiedHash===hash||x.state==='complete')return json(res,200,{session:pub(x),deduplicated:true});
      }
      return json(res,403,{error:'Linkvertise recibió el token, pero no encontró este comprobante. El hash expiró, ya fue usado o pertenece a otro enlace/configuración Anti-Bypassing. Regresa desde el mismo enlace y verifica inmediatamente.'});
    }
    if(result!=='TRUE'){
      console.error('Linkvertise unexpected response',{status:lv.status,contentType:lv.headers.get('content-type')||'',length:result.length,shape:parsed.shape,prefix:result.slice(0,24)});
      return json(res,502,{error:`Linkvertise respondió de forma inesperada (HTTP ${lv.status}, formato ${parsed.shape}).`});
    }

    // Linkvertise has now consumed this hash. Avoid a Firebase transaction race
    // here: only the request that received TRUE can persist this hash.
    const latest=await ref.get();
    if(!latest.exists())return json(res,404,{error:'La sesión ya no está disponible después de verificar el comprobante.'});
    s=latest.val();

    if(s.deviceId!==deviceId)return json(res,403,{error:'El dispositivo no coincide con la sesión.'});
    if(Number(s.expiresAt)<=Date.now()){await ref.remove();return json(res,410,{error:'La sesión expiró durante la verificación.'});}
    if(s.lastVerifiedHash===hash||s.state==='complete')return json(res,200,{session:pub(s),deduplicated:true});
    if(s.state!=='awaiting_external_return'||Number(s.link)!==link){
      // The hash is already consumed, so return the current session rather than
      // asking the user to redo an already completed external step.
      return json(res,200,{session:pub(s),deduplicated:true});
    }

    const total=REQUIREMENTS[Number(s.dur)];
    if(!total)return json(res,400,{error:'Duración de sesión inválida.'});
    const completed=Math.min(total,Number(s.completedLinks||0)+1);
    const next=Number(s.link)<total?Number(s.link)+1:Number(s.link);
    const state=completed>=total?'complete':'ready';

    await ref.update({
      link:next,
      completedLinks:completed,
      state,
      lastVerifiedAt:Date.now(),
      lastVerifiedHash:hash
    });

    const saved=await ref.get();
    if(!saved.exists())return json(res,404,{error:'La sesión desapareció después de guardar la verificación.'});
    return json(res,200,{session:pub(saved.val())});
  }catch(e){
    console.error(e);
    return json(res,500,{error:e?.name==='AbortError'?'Linkvertise tardó demasiado en responder. Inténtalo de nuevo con un comprobante nuevo.':(typeof e?.message==='string'?e.message:'Error interno del servidor.')});
  }
};
