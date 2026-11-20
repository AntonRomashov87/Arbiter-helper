const V='arbitr-v2';
const CORE=['./','./index.html','./style.css','./chess.js','./logic.js','./data.js','./ui.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const PIECES=['wK','wQ','wR','wB','wN','wP','bK','bQ','bR','bB','bN','bP'].map(p=>'https://lichess1.org/assets/piece/cburnett/'+p+'.svg');
self.addEventListener('install',e=>{e.waitUntil((async()=>{const c=await caches.open(V);await c.addAll(CORE);await Promise.all(PIECES.map(u=>fetch(u,{mode:'no-cors'}).then(r=>c.put(u,r)).catch(()=>{})));self.skipWaiting();})());});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||/generativelanguage|firebaseio|netlify\/functions|\.netlify/.test(u.href))return;
  if(r.mode==='navigate'){e.respondWith(fetch(r).then(x=>{const cp=x.clone();caches.open(V).then(c=>c.put('./index.html','./style.css','./chess.js','./logic.js','./data.js','./ui.js',cp));return x;}).catch(()=>caches.match('./index.html')));return;}
  e.respondWith(caches.match(r).then(h=>h||fetch(r).then(x=>{if(x&&(x.ok||x.type==='opaque')){const cp=x.clone();caches.open(V).then(c=>c.put(r,cp));}return x;})));
});
