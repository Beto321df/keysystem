const crypto=require('crypto');
const admin=require('firebase-admin');
function parseServiceAccount(raw){let s=String(raw||'').trim();const candidates=[s];if((s.startsWith('"')&&s.endsWith('"'))||(s.startsWith("'")&&s.endsWith("'"))){try{const q=s.startsWith('"')?JSON.parse(s):s.slice(1,-1);if(typeof q==='string')candidates.unshift(q)}catch{}}for(const candidate of candidates){try{let o=JSON.parse(candidate);if(typeof o==='string')o=JSON.parse(o);if(o?.project_id&&o?.client_email&&o?.private_key){o.private_key=String(o.private_key).replace(/\\n/g,'\n');return o;}}catch{}}throw new Error('La credencial de Firebase no es válida.');}
function db(){if(admin.apps.length)return admin.app().database();const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSONZ||process.env.FIREBASE_SERVICE_ACCOUNT_JSON,url=process.env.FIREBASE_DATABASE_URL;if(!raw||!url)throw new Error('Firebase del servidor no está configurado.');return admin.initializeApp({credential:admin.credential.cert(parseServiceAccount(raw)),databaseURL:url}).database();}
function json(res,status,payload){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(payload));}
const DEVICE_RE=/^HWID-[A-Z0-9]{24}$/;
const KEY_RE=/^FREE_[A-Z]{9}-[0-9]{4}$/;

module.exports=async(req,res)=>{try{
  if(req.method!=='GET')return json(res,405,{error:'Método no permitido.'});
  const q=new URL(req.url||'/','https://placeholder.local').searchParams;
  const deviceId=String(q.get('deviceId')||'').trim();
  if(!DEVICE_RE.test(deviceId))return json(res,200,{found:false});

  const database=db(),ownerHash=crypto.createHash('sha256').update(deviceId).digest('hex');
  const ownerRef=database.ref(`keyOwners/${ownerHash}`);
  const ownerSnap=await ownerRef.get();
  let key=ownerSnap.exists()?String(ownerSnap.val()?.key||'').trim():'';

  // Recover even if the owner index was lost: the key itself is bound to this HWID.
  if(!KEY_RE.test(key)){
    const byHwid=await database.ref('keys').orderByChild('hwid').equalTo(deviceId).limitToFirst(25).get();
    let bestKey='',bestRecord=null;
    byHwid.forEach(child=>{
      const record=child.val()||{},expiresAt=Number(record.expiresAt||0);
      if(record.status==='active'&&record.hwid===deviceId&&expiresAt>Date.now()&&KEY_RE.test(String(child.key))){
        if(!bestRecord||expiresAt>Number(bestRecord.expiresAt||0)){bestKey=String(child.key);bestRecord=record;}
      }
    });
    if(!bestKey)return json(res,200,{found:false});
    key=bestKey;
    await ownerRef.set({key,expiresAt:Number(bestRecord.expiresAt),updatedAt:Date.now(),recovered:true});
  }

  if(!KEY_RE.test(key))return json(res,200,{found:false});
  const keyRef=database.ref(`keys/${key}`),snap=await keyRef.get();
  if(!snap.exists()){
    await ownerRef.remove();
    return json(res,200,{found:false});
  }

  const record=snap.val()||{},expiresAt=Number(record.expiresAt||0);
  if(record.status==='revoked'){
    await ownerRef.remove();
    return json(res,200,{found:false});
  }
  if(record.hwid!==deviceId){
    // Never delete somebody else's key because an owner index is stale.
    await ownerRef.remove();
    return json(res,200,{found:false});
  }
  if(!expiresAt||expiresAt<=Date.now()){
    await keyRef.remove();
    await ownerRef.remove();
    return json(res,200,{found:false,expired:true});
  }

  // Keep the owner index healthy for future reloads/recovery.
  await ownerRef.set({key,expiresAt,updatedAt:Date.now()});
  return json(res,200,{found:true,key,expiresAt,bound:true});
}catch(e){console.error('key/recover:',e);return json(res,500,{error:e?.message||'Error del servidor.'});}};
