const crypto = require('crypto');
const admin = require('firebase-admin');

const KEY_RE = /^FREE_[A-Z]{9}-[0-9]{4}$/;
const DEVICE_RE = /^HWID-[A-Z0-9]{24}$/;

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
    try{
      const q=s.startsWith('"')?JSON.parse(s):s.slice(1,-1);
      if(typeof q==='string')candidates.unshift(q);
    }catch{}
  }
  for(const candidate of candidates){
    try{
      let o=JSON.parse(candidate);
      if(typeof o==='string')o=JSON.parse(o);
      if(o?.project_id&&o?.client_email&&o?.private_key){
        o.private_key=String(o.private_key).replace(/\\n/g,'\n');
        return o;
      }
    }catch{}
  }
  throw new Error('La credencial de Firebase no es válida.');
}

function db(){
  if(admin.apps.length)return admin.app().database();
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSONZ||process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const url=process.env.FIREBASE_DATABASE_URL;
  if(!raw||!url)throw new Error('Firebase del servidor no está configurado.');
  return admin.initializeApp({credential:admin.credential.cert(parseServiceAccount(raw)),databaseURL:url}).database();
}

function canonicalHwid(raw){
  const s=String(raw||'').trim().toUpperCase();
  if(DEVICE_RE.test(s))return s;
  const clean=s.replace(/[^A-F0-9]/g,'');
  if(clean.length>=24)return 'HWID-'+clean.slice(0,24);
  return '';
}

function ownerHash(hwid){return crypto.createHash('sha256').update(String(hwid)).digest('hex');}

module.exports=async(req,res)=>{
  try{
    if(req.method!=='GET')return json(res,405,{error:'Método no permitido.'});
    const q=new URL(req.url||'/','https://placeholder.local').searchParams;
    const key=String(q.get('key')||'').trim().toUpperCase();
    const incoming=canonicalHwid(q.get('deviceId'));
    if(!KEY_RE.test(key)||!incoming)return json(res,200,{valid:false});

    const database=db();
    const ref=database.ref(`keys/${key}`),snap=await ref.get();
    if(!snap.exists())return json(res,200,{valid:false});
    const record=snap.val()||{};
    const expiresAt=Number(record.expiresAt||0);
    const stored=canonicalHwid(record.hwid);

    if(record.status==='revoked')return json(res,200,{valid:false});
    if(!expiresAt||expiresAt<=Date.now()){
      await ref.remove();
      if(record.ownerHash)await database.ref(`keyOwners/${record.ownerHash}`).remove();
      if(stored)await database.ref(`keyOwners/${ownerHash(stored)}`).remove();
      return json(res,200,{valid:false,expired:true});
    }
    if(!stored||stored!==incoming)return json(res,200,{valid:false,reason:'device_mismatch'});

    // Normalize legacy records so keys created before the HWID hardening still verify.
    const updates={};
    if(String(record.hwid||'')!==stored)updates.hwid=stored;
    if(record.ownerHash!==ownerHash(stored))updates.ownerHash=ownerHash(stored);
    updates.bound=true;
    if(Object.keys(updates).length)await ref.update(updates);
    await database.ref(`keyOwners/${ownerHash(stored)}`).set({key,expiresAt,updatedAt:Date.now(),migrated:true});

    return json(res,200,{valid:true,expiresAt,bound:true,hwid:stored});
  }catch(e){
    console.error('key/validate:',e);
    return json(res,500,{error:e?.message||'Error del servidor.'});
  }
};
