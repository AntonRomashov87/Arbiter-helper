'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mdl=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>');
const pieceImg=ch=>'https://lichess1.org/assets/piece/cburnett/'+(ch===ch.toUpperCase()?'w':'b')+ch.toUpperCase()+'.svg';
const LOG={
  raw:()=>store.get('arb_log',[]),
  get:()=>LOG.raw().filter(x=>!x.deleted),
  put:rec=>{const L=LOG.raw();rec.upd=Date.now();const i=L.findIndex(x=>x.id===rec.id);if(i>=0)L[i]=rec;else L.unshift(rec);store.set('arb_log',L);syncSoon();},
  remove:id=>{const L=LOG.raw();const i=L.findIndex(x=>x.id===id);if(i>=0){L[i]={id:id,deleted:true,upd:Date.now(),ts:L[i].ts};store.set('arb_log',L);syncSoon();}},
  merge:list=>{const m=new Map(LOG.raw().map(x=>[String(x.id),x]));let ch=0;
    list.forEach(r=>{if(!r||r.id==null)return;const k=String(r.id),l=m.get(k);if(!l||(r.upd||0)>(l.upd||0)){m.set(k,r);ch++;}});
    store.set('arb_log',[...m.values()].sort((a,b)=>String(b.ts).localeCompare(String(a.ts))));return ch;}
};
const FMT={classic:'Класика',rapid:'Рапід',blitz:'Бліц'};
const EV={
  get:()=>Object.assign({name:'',fmt:'classic',pen:2,def:0,noDraw:false,arb:'',pairs:{},upd:0},store.get('arb_ev',{})),
  set:v=>{v.upd=Date.now();store.set('arb_ev',v);syncSoon();}
};
const SYNC=()=>Object.assign({url:'',room:'',auto:true},store.get('arb_sync',{}));
function evNote(art){
  art=art||'';const e=EV.get();let n='';
  if(art.indexOf('7.5')>=0)n+='⏱ За налаштуванням турніру ('+FMT[e.fmt]+') штраф за 1-й завершений нелегальний хід: +'+e.pen+' хв суперникові.';
  if(art.indexOf('9.1')>=0&&e.noDraw)n+=(n?'<br>':'')+'⚠ У вашому турнірі пропозиції нічиєї заборонені регламентом (9.1.1) — діє регламент.';
  if(art.indexOf('6.7')>=0)n+=(n?'<br>':'')+'⏰ Час запізнення за налаштуванням турніру: '+e.def+' хв.';
  return n?'<div class="sm" style="margin-top:8px">'+n+'</div>':'';
}
const GLY={K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟'};
function pieceHTML(ch){return '<img data-p="'+ch+'" alt="" src="'+pieceImg(ch)+'" onerror="pieceFallback(this)">';}
function pieceFallback(img){const ch=img.dataset.p;const s=document.createElement('span');s.className='gl '+(ch===ch.toUpperCase()?'w':'b');s.textContent=GLY[ch.toUpperCase()];img.replaceWith(s);}


/* вкладки */
function showTab(t){$$('.tab').forEach(x=>x.classList.toggle('active',x.id==='tab-'+t));$$('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));window.scrollTo(0,0);}
$$('#nav button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

/* налаштування */
const cfg=()=>store.get('arb_cfg',{key:'',model:'gemini-3.6-flash',proxy:''});
$('#btnSet').onclick=()=>{const c=cfg();$('#cfgKey').value=c.key||'';$('#cfgModel').value=c.model||'';$('#cfgProxy').value=c.proxy||'';$('#dlg').showModal();};
$('#cfgClose').onclick=()=>$('#dlg').close();
$('#cfgEv').onclick=()=>{$('#dlg').close();openEv();};
$('#cfgSave').onclick=()=>{store.set('arb_cfg',{key:$('#cfgKey').value.trim(),model:$('#cfgModel').value.trim()||'gemini-3.6-flash',proxy:$('#cfgProxy').value.trim()});$('#dlg').close();};
const aiReady=()=>{const c=cfg();return !!(c.key||c.proxy);};
const DEF_MODEL='gemini-3.6-flash';
async function listModels(key){
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key='+encodeURIComponent(key));
  if(!r.ok)throw new Error('ListModels HTTP '+r.status);
  const j=await r.json();
  const c=(j.models||[]).filter(m=>(m.supportedGenerationMethods||[]).indexOf('generateContent')>=0).map(m=>m.name.replace(/^models\//,'')).filter(n=>/^gemini-[\d.]+-flash(-lite)?$/.test(n));
  c.sort((x,y)=>parseFloat(y.split('-')[1])-parseFloat(x.split('-')[1])||(/lite/.test(x)?1:0)-(/lite/.test(y)?1:0));
  if(!c.length)throw new Error('Немає доступної моделі Gemini Flash для цього ключа');return c;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function gemCall(c,model,body,ms){
  const url=c.proxy||('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent(c.key));
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),ms);
  try{return await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c.proxy?Object.assign({model},body):body),signal:ac.signal});}
  catch(e){if(e.name==='AbortError')return{ok:false,status:504,text:async()=>'timeout'};throw e;}
  finally{clearTimeout(t);}
}
async function gemini(body){
  const c=cfg();if(!aiReady())throw new Error('NOKEY');
  const t0=Date.now(),LIM=45000;let model=c.model||DEF_MODEL,tried=[],extra=null,r,tx='';
  for(let n=0;n<3;n++){
    tried.push(model);
    for(let k=0;k<2;k++){
      const left=LIM-(Date.now()-t0);if(left<4000)break;
      r=await gemCall(c,model,body,Math.min(20000,left));
      if(r.ok||![429,500,503,504].includes(r.status))break;
      if(k<1)await sleep(1500);
    }
    if(!r||r.ok)break;
    tx=await r.text();
    if(c.proxy||![404,429,500,503,504].includes(r.status)||Date.now()-t0>LIM-4000)break;
    if(!extra)extra=await listModels(c.key).catch(()=>[]);
    const next=extra.find(m=>tried.indexOf(m)<0);
    if(!next)break;
    model=next;
    if(r.status===404)store.set('arb_cfg',Object.assign({},c,{model:next}));
  }
  if(!r||!r.ok){
    const st=r?r.status:0;
    const hint=[503,429,504,0].includes(st)?' Сервери Google перевантажені або не відповідають — спробуйте за хвилину.':'';
    throw new Error('HTTP '+st+'.'+hint+' '+tx.slice(0,140));}
  const j=await r.json();const t=j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts;
  if(!t)throw new Error('Порожня відповідь моделі');return t.map(p=>p.text||'').join('');
}

/* ===== БОТ ===== */
const SYSTEM='Ти — досвідчений шаховий арбітр рівня ФІДЕ й наставник для підготовки до атестації арбітрів. Відповідай українською, коротко й структуровано: **Вердикт**, **Обґрунтування** (стаття Законів шахів ФІДЕ, редакція 2023), **Що зафіксувати/перевірити**. Якщо даних бракує — спершу постав 1–3 уточнювальні питання: формат (класика/рапід/бліц), чи натиснуто годинник, чи є арбітр на партію, положення регламенту. Посилайся лише на статті, у яких упевнений; якщо не впевнений — скажи прямо й порадь перевірити текст, номерів не вигадуй. Нагадуй, що остаточне рішення — за арбітром турніру та регламентом змагання.\nОпорні норми: 4.2.1 поправляю (j’adoube) лише перед торканням; 4.2.2 інший контакт = намір ходити; 4.3 торкнув-ходи; 4.3.2 торкнута фігура суперника — бити; 4.4.1 король, потім тура — рокіруватися; 4.4.2 тура, потім король — рокіровка заборонена; 4.4.4 вибір фігури при перетворенні остаточний після торкання поля; 4.5 якщо торкнуті фігури не можуть ходити — будь-який легальний хід; 5.1.1 мат; 5.1.2 здача (нічия, якщо суперник не може поставити мат); 5.2.1 пат; 5.2.2 мертва позиція; 6.7.1 час запізнення за регламентом, інакше нуль; 6.8 прапорець упав, коли арбітр помітив або є обґрунтована заява; 6.9 програш за часом, але нічия, якщо суперник не може поставити мат жодною серією легальних ходів; 6.10 показання годинника остаточні без очевидної несправності; 6.12.2 заява лише за монітором недопустима; 7.2.1 хибна початкова розстановка — нова партія; 7.2.2 хибна орієнтація дошки — перенести позицію; 7.3 кольори переплутано: <10 ходів — нова партія; 7.4 збиті фігури — відновлює порушник на своєму часі; 7.5.1 нелегальний хід завершений після натискання годинника, позицію відновлюють; 7.5.2 пішак без заміни — ферзь; 7.5.3 годинник без ходу — нелегальний; 7.5.4 дві руки — нелегальний; 7.5.5 перший нелегальний: +2 хв суперникові, другий: поразка (нічия, якщо суперник не може поставити мат); 8.4 звільнення від запису (<5 хв, без додавання ≥30 с); 8.5 неповні бланки; 9.1.2.1 пропозиція нічиєї після ходу, до годинника; 9.2 триразове повторення — заявляє гравець на ході; 9.3 50 ходів; 9.5.3 хибна заявка +2 хв суперникові; 9.6 автоматична нічия (5 повторень, 75 ходів; мат має пріоритет); 11.3.2 електронний пристрій при собі — поразка (регламент може пом’якшити); 11.5 відволікання; 12.6 арбітр не підказує про хід/годинник; 12.9 перелік санкцій; Додаток A.3 у рапіді штрафи 1 хв замість 2; A.5.2 нелегальний хід у рапіді заявляють до наступного ходу; A.5.5 арбітр фіксує падіння прапорця. Якщо надано «ДАНІ ДОШКИ» — це результат програмної перевірки: спирайся на нього.';
const hist=[];
function evCtx(){const e=EV.get();return '\n\nКОНТЕКСТ ТУРНІРУ: '+(e.name||'без назви')+'; формат: '+FMT[e.fmt]+'; штраф за нелегальний хід/хибну заявку: '+e.pen+' хв; час запізнення: '+e.def+' хв; пропозиції нічиї '+(e.noDraw?'ЗАБОРОНЕНІ регламентом':'дозволені')+'. Враховуй це у відповіді.';}
function addMsg(role,html){const d=document.createElement('div');d.className='msg '+role;d.innerHTML=html;$('#msgs').appendChild(d);d.scrollIntoView({block:'end',behavior:'smooth'});return d;}
const CHIPS=['Гравець торкнувся фігури, потім пішов іншою','Нелегальний хід: що робити?','Впав прапорець: король+кінь проти короля','Заявка на триразове повторення','У гравця задзвонив телефон'];
$('#botChips').innerHTML=CHIPS.map(c=>'<span class="chip">'+esc(c)+'</span>').join('');
$('#botChips').onclick=e=>{if(e.target.classList.contains('chip')){$('#chatIn').value=e.target.textContent;sendChat();}};
const KW=[[/торк|поправ|j.?adoube|рокір/i,'touch1','Торкання фігури'],[/нелегал|шах|не той хід|двома руками/i,'ill1','Нелегальний хід'],[/прапор|час |годинник/i,'flag1','Падіння прапорця'],[/нічи|повтор|50 ход|75 ход/i,'draw1','Нічия'],[/телефон|електрон/i,'phone','Телефон'],[/бланк|запис/i,'score1','Запис ходів'],[/запізн/i,'late','Запізнення'],[/рапід|бліц/i,'rapid1','Рапід']];
async function sendChat(extra){
  const text=(extra||$('#chatIn').value).trim();if(!text)return;$('#chatIn').value='';
  addMsg('user',mdl(text));
  if(!aiReady()){
    const hits=KW.filter(k=>k[0].test(text));
    let h='ШІ-режим вимкнено: додайте ключ Gemini у ⚙️. Тим часом відкрийте готовий сценарій:';
    h+='<div class="chips">'+(hits.length?hits:[[0,'start','Усі сценарії']]).map(k=>'<span class="chip" data-wiz="'+k[1]+'">'+esc(k[2])+'</span>').join('')+'</div>';
    addMsg('bot',h);return;}
  hist.push({role:'user',parts:[{text}]});
  const wait=addMsg('bot','<span class="spin"></span> Думаю…');
  try{
    const prec=precedents(text);
    const ans=await gemini({systemInstruction:{parts:[{text:SYSTEM+evCtx()+(prec.text?'\n\n'+prec.text:'')}]},contents:hist.slice(-12),generationConfig:{temperature:0.2}});
    hist.push({role:'model',parts:[{text:ans}]});
    wait.innerHTML=mdl(ans)+(prec.n?'<div class="sm muted" style="margin-top:8px">📒 Враховано схожих випадків із журналу: '+prec.n+'</div>':'')+'<div class="row" style="margin-top:8px"><button class="b" data-save="1">💾 В журнал</button></div>';
    wait._qa={q:text,a:ans};
  }catch(e){wait.innerHTML='Помилка: '+esc(e.message)+'<br><span class="muted sm">Перевірте ключ/модель у ⚙️ або скористайтесь вкладкою «Спори».</span>';hist.pop();}
}
$('#chatSend').onclick=()=>sendChat();
$('#chatIn').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();}});
$('#msgs').onclick=e=>{const w=e.target.dataset&&e.target.dataset.wiz;if(w){showTab('wiz');wizGo(w,true);return;}
  if(e.target.dataset&&e.target.dataset.save){const m=e.target.closest('.msg');if(!m||!m._qa)return;const q=m._qa.q,fm=/FEN:\s*(\S+)\s+([wb])/.exec(q);
    openCase({src:'bot',title:q.length>90?q.slice(0,90)+'…':q.replace(/\n/g,' '),res:'',art:'',text:m._qa.a,q:q,fen:fm?fm[1]+' '+fm[2]+' - - 0 1':'',turn:fm?fm[2]:''});}};
addMsg('sys','Привіт! Опишіть ситуацію за дошкою — я назву статтю й рішення. Для розбору позиції відкрийте «Дошка» та сфотографуйте її.');

/* ===== СПОРИ ===== */
let wizPath=['start'];
function wizGo(id,reset){if(reset)wizPath=[];if(id.startsWith('tab:')){showTab(id.slice(4));return;}wizPath.push(id);wizRender();}
function wizRender(){
  const id=wizPath[wizPath.length-1],n=TREE[id],el=$('#wiz');let h='';
  if(wizPath.length>1)h+='<div class="crumb">Крок '+wizPath.length+'</div>';
  if(n.q){h+='<div class="card"><h2>'+esc(n.q)+'</h2>'+n.o.map((o,i)=>'<button class="b opt" data-i="'+i+'">'+esc(o[0])+'</button>').join('')+'</div>';}
  else{const v=n.v;h+='<div class="verdict '+v.cls+'"><h3>'+esc(v.title)+'</h3><div>'+esc(v.text)+'</div>'+(v.art?'<div class="art">Ст. '+esc(v.art)+'</div>':'')+evNote(v.art)+simHint(v.art)+'</div>';}
  h+='<div class="row">'+(wizPath.length>1?'<button class="b" id="wBack">← Назад</button>':'')+'<button class="b" id="wRe">↺ Спочатку</button>'+(n.v?'<button class="b" id="wSave">💾 В журнал</button><button class="b" id="wAsk">🤖 Запитати бота</button>':'')+'</div>';
  el.innerHTML=h;
  el.querySelectorAll('.opt').forEach(b=>b.onclick=()=>wizGo(n.o[+b.dataset.i][1]));
  const bb=$('#wBack');if(bb)bb.onclick=()=>{wizPath.pop();wizRender();};
  $('#wRe').onclick=()=>{wizPath=['start'];wizRender();};
  const bs=$('#wSave');if(bs)bs.onclick=()=>{const path=wizPath.slice(0,-1).map((id,i)=>{const o=TREE[id].o.find(x=>x[1]===wizPath[i+1]);return o?o[0]:'';}).filter(Boolean).join(' → ');
    openCase({src:'wizard',title:n.v.title,res:'',art:n.v.art,text:n.v.text,q:path});};
  const ba=$('#wAsk');if(ba)ba.onclick=()=>{showTab('bot');sendChat('Сценарій: «'+n.v.title+'» ('+n.v.art+'). Поясни детальніше, які нюанси перевірити арбітру та як це записати в протокол.');};
}
wizRender();

/* ===== ДОШКА ===== */
const B={arr:fenToArr('8/8/8/8/8/8/8/8'),turn:'w',flag:'',flip:false,tool:null,unc:new Set(),last:null};
function drawBoard(){
  let h='';for(let i=0;i<64;i++){const idx=B.flip?63-i:i;const f=idx%8,r=8-Math.floor(idx/8);const ch=B.arr[idx];
    const showR=(i%8===0),showF=(Math.floor(i/8)===7);
    h+='<div class="sq '+(isLightSq(idx)?'l':'d')+(B.unc.has(idx)?' unc':'')+'" data-i="'+idx+'">'+(ch?pieceHTML(ch):'')+(showR?'<span class="c r">'+r+'</span>':'')+(showF?'<span class="c f">'+FILES[f]+'</span>':'')+'</div>';}
  $('#bd').innerHTML='<div class="board" id="boardEl">'+h+'</div>';
  $('#boardEl').onclick=e=>{const s=e.target.closest('.sq');if(!s)return;const i=+s.dataset.i;
    if(B.tool===null)return;B.arr[i]=B.tool==='x'?'':B.tool;B.unc.delete(i);drawBoard();};
}
function drawPal(){
  const ps=['K','Q','R','B','N','P','k','q','r','b','n','p'];
  $('#pal').innerHTML=ps.map(p=>'<button data-p="'+p+'" class="'+(B.tool===p?'sel':'')+'">'+pieceHTML(p)+'</button>').join('')+'<button data-p="x" class="'+(B.tool==='x'?'sel':'')+'">🗑</button>';
}
$('#pal').onclick=e=>{const b=e.target.closest('button');if(!b)return;B.tool=B.tool===b.dataset.p?null:b.dataset.p;drawPal();};
$('#bStart').onclick=()=>{B.arr=fenToArr('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');B.unc.clear();drawBoard();};
$('#bClear').onclick=()=>{B.arr=fenToArr('8/8/8/8/8/8/8/8');B.unc.clear();drawBoard();$('#judge').innerHTML='';};
$('#bFlip').onclick=()=>{B.flip=!B.flip;drawBoard();};
$('#fenGo').onclick=()=>{const a=fenToArr($('#fenIn').value);if(!a){$('#recoStatus').textContent='FEN не розпізнано.';return;}B.arr=a;const t=$('#fenIn').value.trim().split(/\s+/)[1];if(t==='b'||t==='w')setSeg('#segTurn',t,'turn');B.unc.clear();drawBoard();};
function setSeg(sel,v,key){B[key]=v;$$(sel+' button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));}
$('#segTurn').onclick=e=>{const b=e.target.closest('button');if(b)setSeg('#segTurn',b.dataset.v,'turn');};
$('#segFlag').onclick=e=>{const b=e.target.closest('button');if(b)setSeg('#segFlag',b.dataset.v,'flag');};

function renderVerdict(a){
  let h='';
  a.issues.forEach(i=>{h+='<div class="issue '+i.lvl+'">'+(i.lvl==='err'?'✖ ':'⚠ ')+esc(i.t)+'</div>';});
  const v=a.verdict;
  h+='<div class="verdict '+v.cls+'"><h3>'+esc(v.title)+(v.res?'<span class="res">'+esc(v.res)+'</span>':'')+'</h3><div>'+esc(v.text)+'</div>'+(v.art?'<div class="art">Ст. '+esc(v.art)+'</div>':'')+simHint(v.art)+'</div>';
  if(a.info&&a.info.length)h+='<div class="card sm">'+a.info.map(esc).join('<br>')+'</div>';
  h+='<div class="card sm muted">Програмна перевірка за матеріалом і правилами. Тривалі/позиційні нюанси (блоковані позиції, повторення, 50 ходів) — за бланками й оцінкою арбітра.</div>';
  return h;
}
$('#bJudge').onclick=()=>{const a=analyze(B.arr,B.turn,B.flag||null);B.last=a;
  $('#judge').innerHTML=renderVerdict(a)+'<div class="row"><button class="b pri" id="bSave">💾 В журнал</button></div>';
  $('#bSave').onclick=()=>{const v=a.verdict;openCase({src:'board',title:v.title,res:v.res,art:v.art,text:v.text,fen:a.fen,turn:B.turn,flag:B.flag,q:'Позиція: '+a.fen+'; хід '+(B.turn==='w'?'білих':'чорних')+(B.flag?'; прапорець у '+GEN[B.flag]:'')});};
  $('#judge').scrollIntoView({behavior:'smooth'});};
$('#mvGo').onclick=()=>{
  const s=$('#mvIn').value.trim();if(!s)return;const iss=validatePosition(B.arr,B.turn).filter(i=>i.lvl==='err');
  let h;
  if(iss.length)h='<div class="verdict bad"><h3>Спершу виправте позицію</h3><div>'+iss.map(i=>esc(i.t)).join('<br>')+'</div></div>';
  else{const r=checkMove(B.arr,B.turn,s);
    if(r.err)h='<div class="verdict warn"><h3>'+esc(r.err)+'</h3></div>';
    else if(r.legal)h='<div class="verdict ok"><h3>Хід «'+esc(r.san)+'» легальний</h3><div>Нелегальності немає.</div></div>';
    else h='<div class="verdict warn"><h3>Хід «'+esc(s)+'» нелегальний у цій позиції</h3><div>Легальних ходів у позиції: '+r.count+'. Якщо годинник уже натиснуто — завершений нелегальний хід: відновити позицію, +2 хв суперникові (перший), поразка (другий; нічия, якщо суперник не може поставити мат). Якщо ні — хід не завершено, діє «торкнув — ходи».</div><div class="art">Ст. 7.5.1, 7.5.5, 4.3</div></div>';}
  $('#judge').innerHTML=h;$('#judge').scrollIntoView({behavior:'smooth'});
};
$('#bAsk').onclick=()=>{
  const a=analyze(B.arr,B.turn,B.flag||null);
  const msg='ДАНІ ДОШКИ\nFEN: '+a.fen+'\nЧий хід: '+(B.turn==='w'?'білі':'чорні')+'\nПрапорець упав: '+(B.flag?(B.flag==='w'?'у білих':'у чорних'):'ні')+'\nПрограмний висновок: '+a.verdict.title+(a.verdict.res?' ('+a.verdict.res+')':'')+(a.verdict.art?', ст. '+a.verdict.art:'')+'\nДодатково: '+a.info.join('; ')+'\n\nСформулюй рішення арбітра для протоколу та поясни гравцям.';
  showTab('bot');sendChat(msg);
};

/* розпізнавання фото */
function fileToJpeg(file,max){return new Promise((res,rej)=>{const img=new Image();const u=URL.createObjectURL(file);
  img.onload=()=>{const k=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(u);res(c.toDataURL('image/jpeg',0.85).split(',')[1]);};
  img.onerror=()=>rej(new Error('Не вдалося прочитати зображення'));img.src=u;});}
const PROMPT='На зображенні — шахова позиція (фото дошки з фігурами або діаграма). Розпізнай розташування фігур. Відповідай ЛИШЕ JSON без пояснень: {"board":"<розстановка у форматі FEN, 8 рядків через /, від 8-ї горизонталі до 1-ї, білі — великі літери, порожні клітинки — цифри>","uncertain":["e4"],"notes":"коротко"}. Нормалізуй до орієнтації «білі знизу», якщо можеш її визначити. Поля, у яких сумніваєшся, перелічи в uncertain. Нічого не вигадуй: краще порожня клітинка в uncertain, ніж хибна фігура.';
async function recognize(file){
  const st=$('#recoStatus');
  if(!aiReady()){st.innerHTML='Для розпізнавання фото потрібен ключ Gemini (⚙️). Поки що розставте позицію вручну паллетою або вставте FEN.';return;}
  st.innerHTML='<span class="spin"></span> Розпізнаю позицію…';
  try{
    const b64=await fileToJpeg(file,1280);
    const t=await gemini({contents:[{role:'user',parts:[{text:PROMPT},{inline_data:{mime_type:'image/jpeg',data:b64}}]}],generationConfig:{temperature:0,responseMimeType:'application/json'}});
    const j=JSON.parse(t.replace(/^```json|```$/g,'').trim());const a=fenToArr(j.board);
    if(!a)throw new Error('Модель повернула некоректну розстановку: '+esc(String(j.board)));
    B.arr=a;B.unc=new Set();const mp={};
    (j.uncertain||[]).forEach(s=>{const m=/^([a-h])([1-8])$/.exec(String(s).toLowerCase());if(m)B.unc.add((8-+m[2])*8+FILES.indexOf(m[1]));});
    drawBoard();
    st.innerHTML='Розпізнано. '+(B.unc.size?'Сумнівні клітинки підсвічені жовтим: перевірте та виправте. ':'')+esc(j.notes||'')+'<br>Обов’язково звірте розстановку з реальною дошкою, вкажіть «чий хід» і прапорець.';
  }catch(e){st.textContent='Помилка розпізнавання: '+e.message;}
}
['#fileCam','#fileGal'].forEach(s=>$(s).onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)recognize(f);});
drawBoard();drawPal();

/* ===== ТРЕНАЖЕР ===== */
const QSX=QS.map((q,i)=>Object.assign({idx:i},q));
let trTick=null;
const T={list:[],i:0,score:0,wrong:[],mode:null,done:false};
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
function genFlagQ(){
  const cfgx=FLAG_CFGS[Math.floor(Math.random()*FLAG_CFGS.length)];const flag=Math.random()<.5?'w':'b';
  const a=analyze(fenToArr(cfgx.fen),'w',flag);const res=a.verdict.res;const opts=['1-0','0-1','½-½'];
  return{gen:true,q:'Прапорець упав у '+GEN[flag]+'. Матеріал: '+cfgx.name+'. Який результат?',fen:cfgx.fen,o:opts,a:opts.indexOf(res),e:a.verdict.text,art:a.verdict.art};
}
function trStats(){const s=store.get('arb_stats',{n:0,ok:0});$('#trStats').textContent='Усього відповідей: '+s.n+(s.n?' · правильних: '+Math.round(100*s.ok/s.n)+'%':'')+' · питань у базі: '+QS.length+' + генератор «прапорець»';}
function trStart(mode){
  T.mode=mode;T.i=0;T.score=0;T.wrong=[];T.done=false;
  clearInterval(trTick);$('#trTimer').textContent='';
  if(mode==='exam'){T.list=shuffle(QSX).slice(0,10);T.dl=Date.now()+600000;trTick=setInterval(()=>{const left=Math.max(0,T.dl-Date.now());$('#trTimer').textContent='⏳ '+Math.floor(left/60000)+':'+String(Math.floor(left/1000)%60).padStart(2,'0');if(!left){clearInterval(trTick);T.i=T.list.length;trShow();}},500);}
  else if(mode==='wrong'){const w=store.get('arb_wrong',[]);T.list=shuffle(QSX.filter(q=>w.indexOf(q.idx)>=0)).slice(0,10);if(!T.list.length){$('#tr').innerHTML='<div class="card">Помилок поки немає — так тримати!</div>';return;}}
  else if(mode==='flag')T.list=Array.from({length:8},genFlagQ);
  else T.list=[Math.random()<.25?genFlagQ():QSX[Math.floor(Math.random()*QSX.length)]];
  trShow();
}
function trShow(){
  const el=$('#tr');
  if(T.i>=T.list.length){clearInterval(trTick);
    if(T.mode==='rand'){trStart('rand');return;}
    let h='<div class="card"><h2>Результат: '+T.score+' / '+T.list.length+'</h2><div class="prog"><i style="width:'+Math.round(100*T.score/T.list.length)+'%"></i></div>';
    if(T.wrong.length)h+='<h3>Повторіть:</h3>'+T.wrong.map(q=>'<div class="sm" style="margin:6px 0">• '+esc(q.q)+'<br><span class="muted">'+esc(q.o[q.a])+' — ст. '+esc(q.art)+'</span></div>').join('');
    h+='<button class="b pri" id="trAgain">Ще раз</button></div>';el.innerHTML=h;$('#trAgain').onclick=()=>trStart(T.mode);return;}
  const q=T.list[T.i];const order=q.gen?q.o.map((_,i)=>i):shuffle(q.o.map((_,i)=>i));
  let h='<div class="card">';
  if(T.mode!=='rand')h+='<div class="prog"><i style="width:'+Math.round(100*T.i/T.list.length)+'%"></i></div><div class="sm muted">Питання '+(T.i+1)+' з '+T.list.length+'</div>';
  h+='<h2>'+esc(q.q)+'</h2>';
  if(q.fen){h+='<div class="board" style="max-width:300px">'+boardStatic(q.fen)+'</div>';}
  h+=order.map(i=>'<button class="b ans" data-i="'+i+'">'+esc(q.o[i])+'</button>').join('')+'<div id="trFb"></div></div>';
  el.innerHTML=h;
  el.querySelectorAll('.ans').forEach(b=>b.onclick=()=>{
    const pick=+b.dataset.i,ok=pick===q.a;
    el.querySelectorAll('.ans').forEach(x=>{x.disabled=true;if(+x.dataset.i===q.a)x.classList.add('right');});
    if(!ok)b.classList.add('wrong');
    const s=store.get('arb_stats',{n:0,ok:0});s.n++;if(ok)s.ok++;store.set('arb_stats',s);trStats();
    if(ok)T.score++;else T.wrong.push(q);
    if(q.idx!=null){let w=store.get('arb_wrong',[]);w=w.filter(x=>x!==q.idx);if(!ok)w.push(q.idx);store.set('arb_wrong',w);}
    $('#trFb').innerHTML='<div class="verdict '+(ok?'ok':'bad')+'"><h3>'+(ok?'Вірно':'Невірно')+'</h3><div>'+esc(q.e)+'</div><div class="art">Ст. '+esc(q.art)+'</div></div><button class="b pri" id="trNext">Далі →</button>';
    $('#trNext').onclick=()=>{T.i++;if(T.mode==='rand')T.list=[Math.random()<.25?genFlagQ():QSX[Math.floor(Math.random()*QSX.length)]],T.i=0;trShow();};
  });
}
function boardStatic(fen){const a=fenToArr(fen);let h='';for(let i=0;i<64;i++){const ch=a[i];h+='<div class="sq '+(isLightSq(i)?'l':'d')+'">'+(ch?pieceHTML(ch):'')+'</div>';}return h;}
$$('[data-tr]').forEach(b=>b.onclick=()=>trStart(b.dataset.tr));
trStats();

/* ===== АТЕСТАЦІЯ ===== */
function certRender(){
  const done=store.get('arb_cert',{});let total=0,ok=0;
  let h='';CERT.forEach((g,gi)=>{h+='<div class="card"><h3>'+esc(g.g)+'</h3>'+g.items.map((it,ii)=>{const k=gi+'-'+ii;total++;if(done[k])ok++;return '<label class="chk"><input type="checkbox" data-k="'+k+'" '+(done[k]?'checked':'')+'><span>'+esc(it)+'</span></label>';}).join('')+'</div>';});
  h+='<div class="card"><h3>Поради арбітру</h3><ul style="margin:6px 0 0 18px;padding:0">'+TIPS.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul></div>';
  $('#cert').innerHTML=h;$('#certBar').style.width=Math.round(100*ok/total)+'%';$('#certTxt').textContent='Виконано '+ok+' з '+total;
  $('#cert').onchange=e=>{const k=e.target.dataset.k;if(k==null)return;const d=store.get('arb_cert',{});d[k]=e.target.checked;store.set('arb_cert',d);certRender();};
}
certRender();

/* ===== ЖУРНАЛ ===== */
let pendingCase=null,editId=null;
const SRC={board:'♟ Дошка',wizard:'⚖️ Спір',bot:'💬 Бот',manual:'✍️ Вручну'};
function openCase(data,id){
  const old=id?LOG.get().find(x=>x.id===id):null;pendingCase=old||data;editId=id||null;
  const m=pendingCase;$('#caseH').textContent=id?'Редагувати запис':'Зберегти в журнал';
  $('#cTitle').value=m.title||'';$('#cRes').value=m.res||'';$('#cTour').value=m.tour||lastTour();$('#cRound').value=m.round||'';$('#cBoard').value=m.board||'';$('#cPlayers').value=m.players||'';$('#cNotes').value=m.notes||'';
  $('#tourList').innerHTML=[...new Set(LOG.get().map(x=>x.tour).filter(Boolean))].map(t=>'<option value="'+esc(t)+'">').join('');
  $('#dlgCase').showModal();
}
function lastTour(){const x=LOG.get().find(r=>r.tour);return x?x.tour:'';}
$('#cCancel').onclick=()=>$('#dlgCase').close();
$('#cSave').onclick=()=>{
  const f={title:$('#cTitle').value.trim()||'Без назви',res:$('#cRes').value.trim(),tour:$('#cTour').value.trim(),round:$('#cRound').value.trim(),board:$('#cBoard').value.trim(),players:$('#cPlayers').value.trim(),notes:$('#cNotes').value.trim()};
  if(editId){const o=LOG.get().find(x=>x.id===editId);if(o)LOG.put(Object.assign({},o,f));}
  else LOG.put(Object.assign({},pendingCase,f,{id:Date.now(),ts:new Date().toISOString()}));
  $('#dlgCase').close();logRender();
};
$('#cPrint').onclick=()=>{const f={title:$('#cTitle').value.trim(),res:$('#cRes').value.trim(),tour:$('#cTour').value.trim(),round:$('#cRound').value.trim(),board:$('#cBoard').value.trim(),players:$('#cPlayers').value.trim(),notes:$('#cNotes').value};printCase(Object.assign({ts:new Date().toISOString(),art:'',text:''},pendingCase,f));};
function simHint(art){
  if(!art)return '';const key=art.split(',')[0].trim();const n=LOG.get().filter(x=>x.art&&x.art.indexOf(key)>=0).length;
  return n?'<div class="sm" style="margin-top:8px">📒 Схожих випадків у журналі: <a href="#" data-logq="'+esc(key)+'">'+n+' (показати)</a></div>':'';
}
document.body.addEventListener('click',e=>{const a=e.target.closest('[data-logq]');if(!a)return;e.preventDefault();$('#logQ').value=a.dataset.logq;logRender();showTab('log');});
function precedents(text){
  const words=(text.toLowerCase().match(/[a-zа-яіїєґ0-9]{4,}/g)||[]).slice(0,40);const L=LOG.get();
  const sc=L.map(x=>{const hay=[x.title,x.text,x.art,x.notes,x.q].join(' ').toLowerCase();return{x,s:words.filter(w=>hay.indexOf(w)>=0).length};}).filter(o=>o.s>=2).sort((a,b)=>b.s-a.s).slice(0,4);
  if(!sc.length)return{text:'',n:0};
  return{n:sc.length,text:'ПРЕЦЕДЕНТИ З ЖУРНАЛУ ЦЬОГО АРБІТРА (враховуй для узгодженості практики; але все одно перевіряй за текстом Законів шахів і вказуй, якщо прецедент суперечить статті):\n'+sc.map((o,i)=>(i+1)+') '+[new Date(o.x.ts).toLocaleDateString('uk-UA'),o.x.tour].filter(Boolean).join(', ')+': '+o.x.title+(o.x.res?' — '+o.x.res:'')+(o.x.art?', ст. '+o.x.art:'')+(o.x.notes?'. Нотатки арбітра: '+o.x.notes:'')).join('\n')};
}
function logRender(){
  const q=$('#logQ').value.trim().toLowerCase();const L=LOG.get();
  const f=L.filter(x=>!q||[x.title,x.text,x.art,x.tour,x.players,x.notes,x.res,x.round,x.board,x.q,SRC[x.src]].join(' ').toLowerCase().indexOf(q)>=0);
  $('#logStat').textContent='Записів: '+L.length+(q?' · знайдено '+f.length:'');
  $('#logList').innerHTML=f.length?f.map(x=>{
    const meta=[x.tour,x.round?'тур '+x.round:'',x.board?'дошка '+x.board:'',x.players].filter(Boolean).map(esc).join(' · ');
    return '<div class="card" data-id="'+x.id+'"><div class="sm muted">'+esc(new Date(x.ts).toLocaleString('uk-UA',{dateStyle:'short',timeStyle:'short'}))+' · '+esc(SRC[x.src]||'')+'</div>'
     +'<h3 style="margin:4px 0">'+esc(x.title)+(x.res?'<span class="res">'+esc(x.res)+'</span>':'')+'</h3>'
     +(meta?'<div class="sm">'+meta+'</div>':'')+(x.art?'<div class="art">Ст. '+esc(x.art)+'</div>':'')
     +(x.notes?'<div class="sm" style="margin-top:6px">📝 '+esc(x.notes)+'</div>':'')
     +((x.text||x.q)?'<details class="sm" style="margin-top:6px"><summary class="muted">Деталі</summary>'+(x.q?'<div style="margin:6px 0"><b>Ситуація:</b> '+mdl(x.q)+'</div>':'')+(x.text?'<div>'+mdl(x.text)+'</div>':'')+'</details>':'')
     +(x.fen?'<div class="board" style="max-width:170px;margin:8px 0">'+boardStatic(x.fen)+'</div>':'')
     +'<div class="row" style="margin-top:6px">'+(x.fen?'<button class="b" data-act="open">♟ На дошку</button>':'')+'<button class="b" data-act="ask">🤖 Бот</button><button class="b" data-act="edit">✏️</button><button class="b" data-act="del">🗑</button></div></div>';
  }).join(''):'<div class="card muted">'+(L.length?'Нічого не знайдено.':'Поки порожньо. Зберігайте рішення кнопкою «💾 В журнал» на вкладках Бот, Спори, Дошка або додайте запис вручну.')+'</div>';
}
$('#logQ').oninput=logRender;
$('#logNew').onclick=()=>openCase({src:'manual',title:'',res:'',art:'',text:''});
$('#logList').onclick=e=>{
  const b=e.target.closest('[data-act]');if(!b)return;const id=+b.closest('.card').dataset.id;const L=LOG.get(),x=L.find(r=>r.id===id);if(!x)return;
  const act=b.dataset.act;
  if(act==='edit')openCase(x,id);
  else if(act==='del'){if(b.dataset.sure){LOG.remove(id);logRender();}else{b.dataset.sure='1';b.textContent='Точно видалити?';setTimeout(()=>{if(b.isConnected){delete b.dataset.sure;b.textContent='🗑';}},3500);}}
  else if(act==='open'){const a=fenToArr(x.fen);if(!a)return;B.arr=a;B.unc.clear();setSeg('#segTurn',x.turn||'w','turn');setSeg('#segFlag',x.flag||'','flag');drawBoard();$('#judge').innerHTML='';$('#recoStatus').textContent='Завантажено з журналу: '+x.title;showTab('board');}
  else if(act==='ask'){showTab('bot');sendChat('Випадок із журналу ('+(x.tour||'без турніру')+'): '+x.title+(x.res?' — '+x.res:'')+(x.art?', ст. '+x.art:'')+'. '+(x.q?'Ситуація: '+x.q+'. ':'')+(x.notes?'Мої нотатки: '+x.notes+'. ':'')+'Перевір, чи рішення відповідає Законам шахів, і підкажи, що ще зафіксувати в протоколі.');}
};
function download(name,mime,data){const u=URL.createObjectURL(new Blob([data],{type:mime}));const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);}
const stamp=()=>new Date().toISOString().slice(0,10);
$('#logExp').onclick=()=>download('arbitr-journal-'+stamp()+'.json','application/json',JSON.stringify(LOG.get(),null,1));
$('#logCsv').onclick=()=>{
  const cell=v=>'"'+String(v==null?'':v).replace(/"/g,'""').replace(/\r?\n/g,' ')+'"';
  const rows=[['Дата','Турнір','Тур','Дошка','Гравці','Ситуація','Результат','Стаття','Нотатки']].concat(LOG.get().map(x=>[x.ts,x.tour,x.round,x.board,x.players,x.title,x.res,x.art,x.notes]));
  download('arbitr-journal-'+stamp()+'.csv','text/csv;charset=utf-8','\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n'));
};
$('#logImp').onchange=e=>{const f=e.target.files[0];e.target.value='';if(!f)return;const r=new FileReader();
  r.onload=()=>{try{const arr=JSON.parse(r.result);if(!Array.isArray(arr))throw 0;const n=LOG.merge(arr.filter(x=>x&&x.id&&(x.title||x.deleted)).map(x=>Object.assign({upd:Date.parse(x.ts)||1},x)));logRender();$('#logStat').textContent='Імпортовано/оновлено записів: '+n+' · разом '+LOG.get().length;syncSoon();}
    catch(err){$('#logStat').textContent='Не вдалося прочитати файл журналу.';}};r.readAsText(f);};
logRender();

/* ================= НОВЕ: швидкий режим, порушення, запис, турнір, синхронізація ================= */
SRC.viol='🚨 Порушення';
const AFTER_TOUR=()=>EV.get().name||lastTour();
function curCtx(){const e=EV.get();return {tour:e.name||lastTour(),round:store.get('arb_ctx',{}).round||'',board:store.get('arb_ctx',{}).board||''};}

/* --- налаштування турніру --- */
function parsePairs(text){
  const out={};
  String(text||'').split(/\r?\n/).forEach(l=>{
    l=l.trim();if(!l)return;
    let m=/^(\d+)\s*[;\t]\s*([^;\t]+?)\s*[;\t]\s*([^;\t]+?)\s*$/.exec(l);
    if(!m)m=/^(\d+)\s*[.)]?\s+(.+?)\s+[-–—]\s+(.+?)\s*$/.exec(l);
    if(m)out['b'+m[1]]={w:m[2],b:m[3]};
  });
  return out;
}
function pairsToText(p){return Object.keys(p||{}).map(k=>+k.slice(1)).sort((a,b)=>a-b).map(n=>n+';'+p['b'+n].w+';'+p['b'+n].b).join('\n');}
function evBar(){
  const e=EV.get();const c=store.get('arb_ctx',{});
  $('#evBar').innerHTML='<b>'+esc(e.name||'Турнір не задано')+'</b> · '+FMT[e.fmt]+' · штраф +'+e.pen+' хв'+(e.def?' · запізнення '+e.def+' хв':'')+(e.noDraw?' · нічиї заборонені':'')+(c.round?' · тур '+esc(c.round):'')+' <a href="#" id="evEdit">змінити</a>';
  $('#evEdit').onclick=ev=>{ev.preventDefault();openEv();};
}
function openEv(){
  const e=EV.get(),s=SYNC();
  $('#evName').value=e.name;$('#evPen').value=e.pen;$('#evDef').value=e.def;$('#evNoDraw').checked=!!e.noDraw;$('#evArb').value=e.arb;
  $$('#segFmt button').forEach(b=>b.classList.toggle('on',b.dataset.v===e.fmt));
  $('#evPairs').value=pairsToText(e.pairs);$('#evUrl').value=s.url;$('#evRoom').value=s.room;
  $('#dlgEv').showModal();
}
$('#segFmt').onclick=ev=>{const b=ev.target.closest('button');if(!b)return;$$('#segFmt button').forEach(x=>x.classList.toggle('on',x===b));
  $('#evPen').value=b.dataset.v==='classic'?2:1;};
$('#evCancel').onclick=()=>$('#dlgEv').close();
$('#evSave').onclick=()=>{
  const fmt=($('#segFmt .on')||{dataset:{v:'classic'}}).dataset.v;
  const pen=Math.max(0,Math.min(60,+$('#evPen').value||(fmt==='classic'?2:1)));
  EV.set({name:$('#evName').value.trim(),fmt,pen,def:Math.max(0,+$('#evDef').value||0),noDraw:$('#evNoDraw').checked,arb:$('#evArb').value.trim(),pairs:parsePairs($('#evPairs').value),upd:0});
  store.set('arb_sync',{url:$('#evUrl').value.trim().replace(/\/+$/,''),room:$('#evRoom').value.trim().replace(/[^\w-]/g,''),auto:true});
  $('#dlgEv').close();evBar();syncSoon();syncStatus();
};

/* --- швидкий режим --- */
const QEN={
 vAdj:'Adjusting is permitted only by the player on move, after saying "I adjust" or "J\'adoube" first.',
 vMust:'You touched the piece deliberately, so you must move it (Article 4.3).',
 vFree:'None of the touched pieces can legally move or capture, so you may make any legal move (4.3.c).',
 vCap:'You touched your opponent\'s piece, so you must capture it if legally possible (4.3.b).',
 vCK:'You touched the king first, then the rook: you must castle on that side if legal (4.4.1).',
 vCR:'You deliberately touched the rook first: castling is not permitted this move; another legal move must be made (4.4.2).',
 vIllNo:'The move is not completed until the clock is pressed. Restore the position and make a legal move with the touched piece.',
 vIll1:'This is your first completed illegal move. I restore the position and add {pen} minute(s) to your opponent\'s time (7.5.5).',
 vIllLoss:'This is your second completed illegal move. You lose the game (7.5.5).',
 vIllDraw:'Second illegal move, but your opponent cannot checkmate by any series of legal moves: the game is drawn (7.5.5).',
 vIllPromo:'The pawn is replaced by a queen of the same colour; the illegal-move penalty applies (7.5.5).',
 vIllNoMove:'Pressing the clock without making a move is treated as an illegal move (7.5.3).',
 vFlagArb:'I noted the fallen flag. The result is decided under Article 6.9.',
 vMon:'A claim based only on a monitor or display is not accepted; the arbiter judges the clock directly.',
 vC3:'I will check the position and the scoresheet. If the repetition is confirmed, the game is drawn (9.2).',
 vC50:'I will check the scoresheets. If the claim is correct, the game is drawn (9.3).',
 vAuto:'The game is drawn automatically (9.6).',
 vBad:'Your claim is incorrect. I add {pen} minute(s) to your opponent\'s time (9.2.4 / 9.3.4).',
 phone:'A mobile phone or electronic device sounded/was found on you. Under Article 11.3.2 you lose the game, unless your tournament regulations say otherwise.',
 late:'You are late. Under the tournament regulations the default time applies; after it you lose the game (6.7).',
 conduct:'Please stop distracting your opponent (11.5). Further violations lead to penalties under 12.9.',
 vClk2:'I stop the clock and correct it, then the game continues.',
 vClk1:'The clock readings are final unless an obvious defect is found (6.11).',
 vSet1:'The game is annulled and a new one is played (7.2).',
 vSet2:'The game continues on the correct board (7.2.2).',
 vR1:'In rapid and blitz the penalty is one minute (Appendix A.3).'
};
const QCATS=[
 {k:'touch',ic:'✋',n:'Торкання',items:['vAdj','vMust','vFree','vCap','vCK','vCR']},
 {k:'ill',ic:'⛔',n:'Нелегальний хід',items:['vIllNo','vIll1','vIllLoss','vIllDraw','vIllPromo','vIllNoMove']},
 {k:'flag',ic:'⏱',n:'Прапорець',items:['flag1','vFlagArb','vMon','vFMate','vFStale']},
 {k:'draw',ic:'🤝',n:'Нічия',items:['vC3','vC50','vAuto','vBad','vC3Late']},
 {k:'phone',ic:'📱',n:'Телефон',items:['phone']},
 {k:'oth',ic:'🧩',n:'Інше',items:['late','conduct','vClk2','vClk1','vSet1','vSet2','vR1']}
];
let QCUR=null,QNODE=null;
function qPen(s){return String(s||'').replace(/\{pen\}/g,EV.get().pen);}
function qTitle(id){const n=TREE[id];return n.v?n.v.title:n.q;}
function qHtml(){
  $('#qCats').innerHTML=QCATS.map(c=>'<button class="b qcat'+(QCUR===c.k?' sel':'')+'" data-k="'+c.k+'"><span>'+c.ic+'</span>'+c.n+'</button>').join('');
  const c=QCATS.find(x=>x.k===QCUR);
  $('#qItems').innerHTML=c?c.items.map(id=>'<button class="b ans" data-id="'+id+'">'+esc(qTitle(id))+(TREE[id].q?' ›':'')+'</button>').join(''):'';
}
function qShow(id){
  const n=TREE[id];
  if(n.q){showTab('wiz');wizGo(id,true);return;}
  QNODE=id;const v=n.v;const en=qPen(QEN[id]||'');const e=EV.get();
  let ua=v.title+'. '+v.text;if(id==='vIll1')ua='Перший завершений нелегальний хід. Позицію відновлюю, суперникові додається '+e.pen+' хв (ст. 7.5.5).';
  $('#qOut').innerHTML='<div class="verdict '+v.cls+'"><h3>'+esc(v.title)+'</h3><div>'+esc(id==='vIll1'?ua:v.text)+'</div>'+(v.art?'<div class="art">Ст. '+esc(v.art)+'</div>':'')+evNote(v.art)+simHint(v.art)+'</div>'
   +'<div class="card"><h3>🇺🇦 Фраза гравцям</h3><div id="qUa">'+esc(ua)+'</div><button class="b" data-cp="qUa">📋 Копіювати</button>'
   +(en?'<h3>🇬🇧 Phrase for the players</h3><div id="qEn">'+esc(en)+'</div><button class="b" data-cp="qEn">📋 Copy</button>':'')+'</div>'
   +'<div class="row"><button class="b pri" id="qSave">💾 В журнал</button><button class="b" id="qAsk">🤖 Запитати бота</button></div>';
  $('#qOut').scrollIntoView({behavior:'smooth',block:'nearest'});
}
$('#qCats').onclick=e=>{const b=e.target.closest('.qcat');if(!b)return;QCUR=b.dataset.k;qHtml();
  const c=QCATS.find(x=>x.k===QCUR);if(c.items.length===1)qShow(c.items[0]);};
$('#qItems').onclick=e=>{const b=e.target.closest('[data-id]');if(b)qShow(b.dataset.id);};
$('#qOut').onclick=e=>{
  const cp=e.target.closest('[data-cp]');
  if(cp){const t=$('#'+cp.dataset.cp).textContent;const done=()=>{cp.textContent='✓ Скопійовано';setTimeout(()=>{cp.textContent=cp.dataset.cp==='qEn'?'📋 Copy':'📋 Копіювати';},1500);};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(done,()=>{});else{const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done();}catch(x){}ta.remove();}return;}
  if(e.target.id==='qSave'&&QNODE){const v=TREE[QNODE].v,c=curCtx();openCase({src:'wizard',title:v.title,res:'',art:v.art,text:v.text,q:'Швидкий режим',tour:c.tour,round:c.round,board:c.board});}
  if(e.target.id==='qAsk'&&QNODE){const v=TREE[QNODE].v;showTab('bot');sendChat('Сценарій: «'+v.title+'» ('+v.art+'). Поясни нюанси та як записати в протокол.');}
};

/* --- лічильник порушень --- */
let VCOL='w';
const VTYPES={ill:'Нелегальний хід',warn:'Попередження',oth:'Інше'};
function playersOf(board,col){const p=(EV.get().pairs||{})['b'+board];return p?(col==='w'?p.w:p.b):'';}
function vSeg(sel,key,val){$$(sel+' button').forEach(b=>b.classList.toggle('on',b.dataset.v===val));}
$('#vCol').onclick=e=>{const b=e.target.closest('button');if(!b)return;VCOL=b.dataset.v;vSeg('#vCol','',VCOL);vHint();};
function vHint(){
  const bd=$('#vBoard').value.trim();const p=bd?playersOf(bd,'w')+' — '+playersOf(bd,'b'):'';
  $('#vPl').textContent=(p&&p!==' — ')?p:'';
}
$('#vBoard').oninput=vHint;
function vCount(round,board,col){return LOG.get().filter(x=>x.src==='viol'&&x.vtype==='ill'&&String(x.round||'')===String(round||'')&&String(x.board||'')===String(board||'')&&x.color===col&&(x.tour||'')===(EV.get().name||'')).length;}
function vAdd(type){
  const round=$('#vRound').value.trim(),board=$('#vBoard').value.trim();
  if(!board){$('#vRes').innerHTML='<div class="verdict warn"><h3>Вкажіть номер дошки</h3></div>';return;}
  store.set('arb_ctx',{round,board});evBar();
  const e=EV.get();const col=VCOL;const who=(col==='w'?'Білі':'Чорні');const name=playersOf(board,col);
  let res='',text='',title='',cls='info';
  if(type==='ill'){
    const n=vCount(round,board,col)+1;
    if(n===1){res='+'+e.pen+' хв';cls='warn';title='1-й нелегальний хід: '+who;text='Відновити позицію; суперникові додати '+e.pen+' хв (7.5.5).';}
    else{res='ПОРАЗКА';cls='bad';title=n+'-й нелегальний хід: '+who;text='Гравець програє партію (7.5.5), але якщо суперник не може поставити мат жодною серією легальних ходів — нічия. Перевірте матеріал на дошці.';}
  }else if(type==='warn'){res='Попередження';title='Попередження: '+who;text='Усне/письмове попередження; наступне порушення — санкція за 12.9.';}
  else{res='';title='Інше порушення: '+who;text='Опишіть у нотатках.';}
  const rec={id:Date.now(),ts:new Date().toISOString(),src:'viol',vtype:type,color:col,title:title+(name?' ('+name+')':''),res,art:type==='ill'?'7.5.5':'12.9',text,tour:e.name,round,board,players:playersOf(board,'w')?playersOf(board,'w')+' — '+playersOf(board,'b'):'',notes:''};
  LOG.put(rec);vRender(rec,cls);
}
function vRender(rec,cls){
  $('#vRes').innerHTML=rec?'<div class="verdict '+(cls||'info')+'"><h3>'+esc(rec.title)+(rec.res?'<span class="res">'+esc(rec.res)+'</span>':'')+'</h3><div>'+esc(rec.text)+'</div></div>':'';
  const today=new Date().toISOString().slice(0,10);
  const L=LOG.get().filter(x=>x.src==='viol'&&String(x.ts).slice(0,10)===today);
  $('#vList').innerHTML=L.length?'<h3>Сьогодні ('+L.length+')</h3>'+L.map(x=>'<div class="sm vrow" data-id="'+x.id+'">'+esc((x.round?'т.'+x.round+' ':'')+'д.'+x.board+' · '+x.title+(x.res?' → '+x.res:''))+' <a href="#" data-vdel="'+x.id+'">🗑</a></div>').join(''):'';
}
$('#vBtns').onclick=e=>{const b=e.target.closest('[data-vt]');if(b)vAdd(b.dataset.vt);};
$('#vList').onclick=e=>{const a=e.target.closest('[data-vdel]');if(!a)return;e.preventDefault();LOG.remove(+a.dataset.vdel);vRender(null);logRender();};

/* --- перевірка за записом --- */
let RECG=null;
function recGameBoard(fen){return '<div class="board" style="max-width:220px;margin:8px 0">'+boardStatic(fen)+'</div>';}
function recRun(){
  const text=$('#recIn').value;const r=analyzeGame(text);RECG=r;
  if(r.err){$('#recOut').innerHTML='<div class="verdict bad"><h3>'+esc(r.err)+'</h3></div>';return;}
  let h='';
  const plyLabel=(ply)=>Math.ceil(ply/2)+(ply%2?'.':'…');
  if(r.illegal){const i=r.illegal;
    h+='<div class="verdict bad"><h3>Нелегальний хід: '+esc(plyLabel(i.ply))+' '+esc(i.tok)+'</h3><div>Хід №'+i.num+' ('+(i.white?'білі':'чорні')+') неможливий у позиції. Можливі ходи: '+esc((i.legal||[]).slice(0,30).join(' '))+((i.legal||[]).length>30?'…':'')+'.<br>Це може бути і помилка запису — звірте з бланком суперника.</div>'+recGameBoard(i.fen)+'<button class="b" data-open="'+esc(i.fen)+'">♟ На дошку</button></div>';}
  r.events.forEach(ev=>{const cls=ev.t==='rep5'||ev.t==='m75'?'bad':'warn';
    const art={rep3:'9.2',rep5:'9.6.1',m50:'9.3',m75:'9.6.2'}[ev.t];
    const ttl={rep3:'Триразове повторення (можна заявити нічию)',rep5:'П’ятикратне повторення — нічия автоматично',m50:'50 ходів без взяття й ходу пішака (можна заявити)',m75:'75 ходів — нічия автоматично'}[ev.t];
    h+='<div class="verdict '+cls+'"><h3>'+ttl+'</h3><div>Після '+esc(plyLabel(ev.ply))+' ('+esc(ev.label||'')+')'+'</div><div class="art">Ст. '+art+'</div></div>';});
  const f=r.final;
  if(f){h+='<div class="card"><h3>Кінцева позиція ('+r.plies+' півходів)</h3>'+recGameBoard(f.fen)+'<div class="sm">'+(f.mate?'Мат. ':f.stale?'Пат. ':f.check?'Шах. ':'')+'Хід '+(f.turn==='w'?'білих':'чорних')+' · лічильник 50 ходів: '+Math.floor(f.hm/2)+'</div><div class="row" style="margin-top:6px"><button class="b" data-open="'+esc(f.fen)+'">♟ На дошку</button><button class="b" id="recSave">💾 В журнал</button></div></div>';}
  if(!h)h='<div class="verdict ok"><h3>Порушень не знайдено</h3></div>';
  $('#recOut').innerHTML=h;
}
$('#recGo').onclick=recRun;
$('#recOut').onclick=e=>{
  const o=e.target.closest('[data-open]');
  if(o){const a=fenToArr(o.dataset.open);if(!a)return;const parts=o.dataset.open.split(' ');B.arr=a;B.unc.clear();setSeg('#segTurn',parts[1]||'w','turn');drawBoard();$('#judge').innerHTML='';showTab('board');return;}
  if(e.target.id==='recSave'&&RECG){const c=curCtx();const bad=RECG.illegal?'нелегальний хід '+RECG.illegal.tok:(RECG.events.length?RECG.events.map(x=>x.t).join(','):'порушень немає');
    openCase({src:'board',title:'Перевірка запису: '+bad,res:'',art:RECG.illegal?'7.5':'9.2, 9.3',text:$('#recIn').value.slice(0,1500),fen:RECG.final&&RECG.final.fen,turn:RECG.final&&RECG.final.turn,tour:c.tour,round:c.round,board:c.board});}
};
$('#recPhoto').onchange=async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  if(!aiReady()){$('#recSt').textContent='Для розпізнавання фото потрібен ключ Gemini (⚙️). Можна вставити PGN вручну.';return;}
  $('#recSt').innerHTML='<span class="spin"></span> Читаю бланк…';
  try{
    const b64=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=no;r.readAsDataURL(f);});
    const prompt='Це фото шахового бланка. Випиши ходи в стандартній алгебраїчній нотації (англійські літери фігур K Q R B N, рокіровка O-O). НЕ виправляй і не вгадуй: якщо хід нечіткий — залиш як прочитав і додай номер ходу в uncertain. Поверни ЛИШЕ JSON: {"moves":"1. e4 e5 2. Nf3 ...","uncertain":[номери ходів],"notes":"коротко"}';
    const ans=await gemini({contents:[{role:'user',parts:[{text:prompt},{inline_data:{mime_type:f.type||'image/jpeg',data:b64}}]}],generationConfig:{temperature:0,responseMimeType:'application/json'}});
    const m=/\{[\s\S]*\}/.exec(ans);const j=JSON.parse(m?m[0]:ans);
    $('#recIn').value=j.moves||'';$('#recSt').textContent='Розпізнано. '+(j.uncertain&&j.uncertain.length?'Нечіткі ходи №: '+j.uncertain.join(', ')+'. ':'')+(j.notes||'')+' Перевірте текст і натисніть «Перевірити».';
  }catch(err){$('#recSt').textContent='Помилка: '+err.message;}
};

/* --- друк протоколу --- */
function printCase(x){
  const e=EV.get();
  $('#printArea').innerHTML='<h1>Протокол інциденту</h1><table>'
   +[['Турнір',x.tour||e.name],['Дата/час',new Date(x.ts).toLocaleString('uk-UA')],['Тур / дошка',(x.round||'—')+' / '+(x.board||'—')],['Гравці',x.players],['Ситуація',x.title],['Рішення',x.res],['Стаття Законів шахів',x.art],['Опис',x.text],['Нотатки арбітра',x.notes]].map(r=>'<tr><th>'+r[0]+'</th><td>'+esc(r[1]||'').replace(/\n/g,'<br>')+'</td></tr>').join('')
   +'</table><div class="sign"><div>Арбітр'+(e.arb?': '+esc(e.arb):'')+'<br><br>____________________</div><div>Білі<br><br>____________________</div><div>Чорні<br><br>____________________</div></div>';
  document.body.classList.add('printing');window.print();setTimeout(()=>document.body.classList.remove('printing'),500);
}

/* --- підсумок турніру --- */
function summaryText(){
  const e=EV.get();const L=LOG.get().filter(x=>!e.name||x.tour===e.name||!x.tour);
  const by=(f)=>{const m={};L.forEach(x=>{const k=f(x);if(k)m[k]=(m[k]||0)+1;});return Object.entries(m).sort((a,b)=>b[1]-a[1]);};
  let t='Звіт арбітра: '+(e.name||'турнір')+'\nФормат: '+FMT[e.fmt]+(e.arb?'\nАрбітр: '+e.arb:'')+'\nУсього інцидентів: '+L.length+'\n';
  const ill=L.filter(x=>x.src==='viol'&&x.vtype==='ill').length,w=L.filter(x=>x.src==='viol'&&x.vtype==='warn').length;
  t+='Нелегальних ходів зафіксовано: '+ill+'; попереджень: '+w+'\n';
  const arts=by(x=>(x.art||'').split(',')[0].trim()).slice(0,5);if(arts.length)t+='Найчастіші статті: '+arts.map(a=>'ст. '+a[0]+' ×'+a[1]).join('; ')+'\n';
  const rounds=by(x=>x.round?'тур '+x.round:'');if(rounds.length)t+='За турами: '+rounds.map(a=>a[0]+' — '+a[1]).join('; ')+'\n';
  t+='\nПерелік:\n'+L.slice().reverse().map((x,i)=>(i+1)+') '+[x.round?'т.'+x.round:'',x.board?'д.'+x.board:'',x.players,x.title,x.res?'→ '+x.res:'',x.art?'(ст. '+x.art+')':''].filter(Boolean).join(' ')+(x.notes?' — '+x.notes:'')).join('\n');
  return t;
}
$('#logSum').onclick=()=>{$('#sumTxt').value=summaryText();$('#dlgSum').showModal();};
$('#sumClose').onclick=()=>$('#dlgSum').close();
$('#sumCopy').onclick=()=>{const t=$('#sumTxt');t.select();try{document.execCommand('copy');}catch(x){}if(navigator.clipboard)navigator.clipboard.writeText(t.value).catch(()=>{});$('#sumCopy').textContent='✓ Скопійовано';};
$('#sumPrint').onclick=()=>{$('#printArea').innerHTML='<h1>Звіт арбітра</h1><pre>'+esc($('#sumTxt').value)+'</pre>';document.body.classList.add('printing');window.print();setTimeout(()=>document.body.classList.remove('printing'),500);};

/* --- синхронізація Firebase RTDB (REST) --- */
let syncT=null,syncBusy=false;
function syncCfg(){const s=SYNC();return(s.url&&s.room&&/^https?:\/\//.test(s.url))?s:null;}
function syncStatus(m){const el=$('#syncSt');if(!el)return;el.textContent=m||(syncCfg()?'☁ синхронізація: кімната '+SYNC().room:'');}
function syncSoon(){if(!syncCfg()||!SYNC().auto)return;clearTimeout(syncT);syncT=setTimeout(syncNow,1500);}
async function fbReq(path,method,body){
  const s=SYNC();const r=await fetch(s.url+'/arbitr/'+s.room+'/'+path+'.json',{method,headers:{'Content-Type':'application/json'},body:body==null?undefined:JSON.stringify(body)});
  if(!r.ok)throw new Error('HTTP '+r.status);return r.json();
}
async function syncNow(){
  const s=syncCfg();if(!s||syncBusy)return;syncBusy=true;syncStatus('☁ синхронізація…');
  try{
    const remote=await fbReq('log','GET')||{};
    const list=Object.keys(remote).map(k=>remote[k]);const ch=LOG.merge(list);
    const rm=new Map(list.map(r=>[String(r.id),r]));const up={};
    LOG.raw().forEach(x=>{const r=rm.get(String(x.id));if(!r||(x.upd||0)>(r.upd||0))up['r'+x.id]=x;});
    if(Object.keys(up).length)await fbReq('log','PATCH',up);
    const rev=await fbReq('ev','GET');const le=store.get('arb_ev',{});
    if(rev&&(rev.upd||0)>(le.upd||0)){store.set('arb_ev',rev);evBar();}
    else if(!rev||(le.upd||0)>(rev.upd||0))await fbReq('ev','PUT',EV.get());
    syncStatus('☁ синхронізовано '+new Date().toLocaleTimeString('uk-UA',{timeStyle:'short'}));
    if(ch)logRender();
  }catch(e){syncStatus('☁ помилка: '+e.message);}
  syncBusy=false;
}
$('#syncNow').onclick=syncNow;
window.addEventListener('online',syncSoon);

/* --- навчання: перемикач, помилки, іспит --- */
$('#segLearn').onclick=e=>{const b=e.target.closest('button');if(!b)return;vSeg('#segLearn','',b.dataset.v);$('#paneTr').hidden=b.dataset.v!=='tr';$('#paneCert').hidden=b.dataset.v!=='cert';};

/* --- голосовий ввід --- */
(function(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;const mic=$('#chatMic');
  if(!SR){mic.hidden=true;return;}
  let rec=null,on=false;
  mic.onclick=()=>{
    if(on&&rec){rec.stop();return;}
    rec=new SR();rec.lang='uk-UA';rec.interimResults=false;rec.continuous=false;
    rec.onresult=ev=>{const t=[...ev.results].map(r=>r[0].transcript).join(' ');$('#chatIn').value=($('#chatIn').value+' '+t).trim();};
    rec.onend=()=>{on=false;mic.classList.remove('rec');};rec.onerror=()=>{on=false;mic.classList.remove('rec');};
    try{rec.start();on=true;mic.classList.add('rec');}catch(x){}
  };
})();

/* --- PWA --- */
if('serviceWorker' in navigator&&/^https?:/.test(location.protocol)){window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));}

qHtml();evBar();vRender(null);vHint();syncStatus();if(syncCfg())setTimeout(syncNow,800);
