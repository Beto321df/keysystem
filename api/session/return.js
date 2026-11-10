const crypto=require('crypto');
const admin=require('firebase-admin');
const REQUIREMENTS={6:1,12:2,24:3,30:4};
function app(){if(admin.apps.length)return admin.app();return admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),databaseURL:process.env.FIREBASE_DATABASE_URL})}
function json(res,s,d){res.status(s);res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(d))}
function pub(s){return{id:s.id,dur:Number(s.dur),link:Number(s.link),state:s.state,createdAt:Number(s.createdAt),expiresAt:Number(s.expiresAt),returnToken:s.returnToken}}
function isDuplicate(s,link,total){return(s.state==='complete'&&link===total)||(s.state==='ready'&&Number(s.link)===link+1)}
module.exports=async(req,res)=>{try{
 if(req.method==='OPTIONS'){res.status(204).end();return}
 if(req.method!=='POST')return json(res,405,{error:'Método no permitido.'});
 const b=req.body&&typeof req.body==='object'?req.body:{},id=String(b.sessionId||''),deviceId=String(b.deviceId||''),token=String(b.returnToken||''),link=Number(b.link);
 if(!/^[a-f0-9-]{20,100}$/i.test(id)||!/^HWID-[A-Z0-9]{24}$/.test(deviceId)||!Number.isInteger(link)||link<1)return json(res,400,{error:'Datos de sesión inválidos.'});
 const ref=app().database().ref(`sessions/${id}`),snap=await ref.get();
 if(!snap.exists())return json(res,404,{error:'Sesión no encontrada.'});
 let s=snap.val(),now=Date.now(),total=REQUIREMENTS[Number(s.dur)];
 if(Number(s.expiresAt)<=now){await ref.remove();return json(res,410,{error:'La sesión expiró.'})}
 if(s.deviceId!==deviceId)return json(res,403,{error:'El dispositivo no coincide con la sesión.'});
 if(!total)return json(res,400,{error:'Duración de sesión inválida.'});
 if(isDuplicate(s,link,total)&&now-Number(s.lastReturnedAt||0)<120000)return json(res,200,{session:pub(s),compatibility:true,idempotent:true});
 if(s.state==='verifying_return'){if(Number(s.link)!==link)return json(res,409,{error:'Ese paso ya fue procesado o está siendo procesado.'});if(now-Number(s.externalStartedAt||0)<2500)return json(res,409,{error:'El regreso todavía no está listo. Espera un momento y vuelve a intentar.'});s={...s,state:'awaiting_external_return'};}
 if(s.state!=='awaiting_external_return'||Number(s.link)!==link)return json(res,409,{error:'Ese paso no está pendiente.'});
 if(now-Number(s.externalStartedAt||0)<2500)return json(res,409,{error:'El regreso todavía no está listo. Espera un momento y vuelve a intentar.'});
 if(token&&token!==String(s.returnToken||''))return json(res,400,{error:'Retorno de sesión inválido.'});
 const expectedCompleted=Number(s.completedLinks||0),nextCompleted=Math.min(total,expectedCompleted+1),nextLink=Number(s.link)<total?Number(s.link)+1:Number(s.link),nextState=nextCompleted>=total?'complete':'ready',newToken=crypto.randomBytes(24).toString('hex');
 const completedRef=ref.child('completedLinks');
 const tx=await completedRef.transaction(current=>{
   const n=current==null?expectedCompleted:Number(current);
   if(n!==expectedCompleted)return;
   return nextCompleted;
 });
 let current=(await ref.get()).val();
 if(!current)return json(res,404,{error:'Sesión no encontrada.'});
 if(isDuplicate(current,link,total))return json(res,200,{session:pub(current),compatibility:true,idempotent:!tx.committed});
 if(Number(current.link)!==link)return json(res,409,{error:'Ese paso ya fue procesado o está siendo procesado.'});
 if(Number(current.completedLinks||0)!==nextCompleted)return json(res,409,{error:'No se pudo reservar el regreso. Intenta nuevamente.'});
 if(current.state!=='awaiting_external_return'&&current.state!=='verifying_return')return json(res,409,{error:'Ese paso ya fue procesado o está siendo procesado.'});
 if(token&&String(current.returnToken||'')!==token)return json(res,400,{error:'Retorno de sesión inválido.'});
 await ref.update({link:nextLink,state:nextState,lastReturnedAt:Date.now(),returnToken:newToken});
 current=(await ref.get()).val();
 return json(res,200,{session:pub(current),compatibility:true,idempotent:!tx.committed});
}catch(e){console.error(e);return json(res,500,{error:e.message||'Error interno del servidor.'})}};
