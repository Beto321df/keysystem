const crypto = require('crypto');
const admin = require('firebase-admin');

const DEVICE_RE = /^HWID-[A-Z0-9]{24}$/;
const KEY_RE = /^FREE_[A-Z]{9}-[0-9]{4}$/;

function json(res,status,payload){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify(payload));
}
function parseServiceAccount(raw){
  let s=String(raw||'').trim();
  const candidates=[s];
  if((s.startsWith('"')&&s.endsWith('"'))||(s.startsWith("'")&&s.endsWith("'"))){
    try{const q=s.startsWith('"')?JSON.parse(s):s.slice(1,-1);if(typeof q==='string')candidates.unshift(q)}catch{}
  }
  for(const candidate of candidates){
    try{let o=JSON.parse(candidate);if(typeof o==='string')o=JSON.parse(o);if(o?.project_id&&o?.client_email&&o?.private_key){o.private_key=String(o.private_key).replace(/\\n/g,'\n');return o}}catch{}
  }
  throw new Error('La credencial de Firebase no es válida.');
}
function db(){
  if(admin.apps.length)return admin.app().database();
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSONZ||process.env.FIREBASE_SERVICE_ACCOUNT_JSON,url=process.env.FIREBASE_DATABASE_URL;
  if(!raw||!url)throw new Error('Firebase del servidor no está configurado.');
  return admin.initializeApp({credential:admin.credential.cert(parseServiceAccount(raw)),databaseURL:url}).database();
}
function canonicalHwid(raw){
  const s=String(raw||'').trim().toUpperCase();
  if(DEVICE_RE.test(s))return s;
  const clean=s.replace(/[^A-F0-9]/g,'');
  return clean.length>=24?'HWID-'+clean.slice(0,24):'';
}
function ownerHash(hwid){return crypto.createHash('sha256').update(String(hwid)).digest('hex');}
module.exports=async(req,res)=>{try{
  if(req.method!=='GET')return json(res,405,{error:'Método no permitido.'});
  const q=new URL(req.url||'/','https://placeholder.local').searchParams;
  const hwid=canonicalHwid(q.get('deviceId'));
  if(!hwid)return json(res,200,{found:false});
  const database=db(),ownerRef=database.ref(`keyOwners/${ownerHash(hwid)}`),ownerSnap=await ownerRef.get();
  let key=ownerSnap.exists()?String(ownerSnap.val()?.key||'').trim().toUpperCase():'';

  const usable=async candidateKey=>{
    if(!KEY_RE.test(candidateKey))return null;
    const ref=database.ref(`keys/${candidateKey}`),snap=await ref.get();
    if(!snap.exists())return null;
    const record=snap.val()||{},expiresAt=Number(record.expiresAt||0),stored=canonicalHwid(record.hwid);
    if(record.status!=='active'||expiresAt<=Date.now()||stored!==hwid)return null;
    return{candidateKey,record,expiresAt,stored};
  };
  let found=await usable(key);

  // Legacy/stale owner-index recovery. No orderByChild is used, so Firebase
  // rules do not need .indexOn for /keys/hwid.
  if(!found){
    const all=await database.ref('keys').get();
    let best=null;
    all.forEach(child=>{
      const candidateKey=String(child.key||'').toUpperCase(),record=child.val()||{},expiresAt=Number(record.expiresAt||0),stored=canonicalHwid(record.hwid);
      if(candidateKey&&KEY_RE.test(candidateKey)&&record.status==='active'&&expiresAt>Date.now()&&stored===hwid){
        if(!best||expiresAt>best.expiresAt)best={candidateKey,record,expiresAt,stored};
      }
    });
    found=best;
  }

  if(!found){if(key)await ownerRef.remove();return json(res,200,{found:false});}
  await database.ref(`keys/${found.candidateKey}`).update({hwid:hwid,bound:true,ownerHash:ownerHash(hwid)});
  await ownerRef.set({key:found.candidateKey,expiresAt:found.expiresAt,updatedAt:Date.now(),migrated:true});
  return json(res,200,{found:true,key:found.candidateKey,expiresAt:found.expiresAt,bound:true,hwid});
}catch(e){console.error('key/recover:',e);return json(res,500,{error:e?.message||'Error del servidor.'});}};
