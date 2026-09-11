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
  let record=null;

  // Fast path: the normal owner index.
  if(KEY_RE.test(key)){
    const snap=await database.ref(`keys/${key}`).get();
    if(snap.exists())record=snap.val()||{};
  }

  // Recovery path without orderByChild/indexOn: scan existing key records in one read.
  // This avoids requiring Firebase rules to define .indexOn for /keys/hwid.
  if(!record || record.status!=='active' || record.hwid!==deviceId || Number(record.expiresAt||0)<=Date.now()){
    const keysSnap=await database.ref('keys').get();
    let bestKey='',bestRecord=null;
    keysSnap.forEach(child=>{
      const candidateKey=String(child.key||'');
      const candidate=child.val()||{};
      const expiresAt=Number(candidate.expiresAt||0);
      if(KEY_RE.test(candidateKey)&&candidate.status==='active'&&candidate.hwid===deviceId&&expiresAt>Date.now()){
        if(!bestRecord||expiresAt>Number(bestRecord.expiresAt||0)){
          bestKey=candidateKey;
          bestRecord=candidate;
        }
      }
    });
    if(bestKey){
      key=bestKey;
      record=bestRecord;
      await ownerRef.set({key,expiresAt:Number(record.expiresAt),updatedAt:Date.now(),recovered:true});
    }
  }

  if(!KEY_RE.test(key)||!record)return json(res,200,{found:false});

  const expiresAt=Number(record.expiresAt||0);
  if(record.status==='revoked'||record.hwid!==deviceId){
    await ownerRef.remove();
    return json(res,200,{found:false});
  }
  if(!expiresAt||expiresAt<=Date.now()){
    await database.ref(`keys/${key}`).remove();
    await ownerRef.remove();
    return json(res,200,{found:false,expired:true});
  }

  await ownerRef.set({key,expiresAt,updatedAt:Date.now()});
  return json(res,200,{found:true,key,expiresAt,bound:true});
}catch(e){console.error('key/recover:',e);return json(res,500,{error:e?.message||'Error del servidor.'});}};
