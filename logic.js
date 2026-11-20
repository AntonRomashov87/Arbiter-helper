'use strict';
const FILES='abcdefgh';
function sqName(i){return FILES[i%8]+(8-Math.floor(i/8));}
function isLightSq(i){const f=i%8,r=8-Math.floor(i/8);return ((f+1)+r)%2===1;}
function colorOf(ch){return ch===ch.toUpperCase()?'w':'b';}
function fenToArr(fen){
  const part=String(fen||'').trim().split(/\s+/)[0];const rows=part.split('/');
  if(rows.length!==8)return null;const arr=[];
  for(const r of rows){let n=0;
    for(const ch of r){
      if(/[1-8]/.test(ch)){for(let i=0;i<+ch;i++)arr.push('');n+=+ch;}
      else if(/[prnbqkPRNBQK]/.test(ch)){arr.push(ch);n++;}
      else return null;}
    if(n!==8)return null;}
  return arr;
}
function arrToFen(arr,turn){
  const rows=[];
  for(let r=0;r<8;r++){let s='',e=0;
    for(let f=0;f<8;f++){const ch=arr[r*8+f];if(!ch)e++;else{if(e){s+=e;e=0;}s+=ch;}}
    if(e)s+=e;rows.push(s);}
  return rows.join('/')+' '+(turn||'w')+' - - 0 1';
}
function countMaterial(arr){
  const z=()=>({P:0,N:0,B:0,R:0,Q:0,K:0,bl:0,bd:0});const m={w:z(),b:z()};
  arr.forEach((ch,i)=>{if(!ch)return;const c=colorOf(ch),t=ch.toUpperCase();m[c][t]++;
    if(t==='B'){if(isLightSq(i))m[c].bl++;else m[c].bd++;}});
  return m;
}
function attackedBy(arr,sq,by){
  const f=sq%8,r=Math.floor(sq/8);
  const pr=by==='w'?r+1:r-1;
  if(pr>=0&&pr<8)for(const df of[-1,1]){const pf=f+df;if(pf>=0&&pf<8&&arr[pr*8+pf]===(by==='w'?'P':'p'))return true;}
  for(const[dr,df]of[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]){
    const nr=r+dr,nf=f+df;if(nr>=0&&nr<8&&nf>=0&&nf<8&&arr[nr*8+nf]===(by==='w'?'N':'n'))return true;}
  for(let dr=-1;dr<=1;dr++)for(let df=-1;df<=1;df++){if(!dr&&!df)continue;
    const nr=r+dr,nf=f+df;if(nr>=0&&nr<8&&nf>=0&&nf<8&&arr[nr*8+nf]===(by==='w'?'K':'k'))return true;}
  const dirs=[[1,0,'RQ'],[-1,0,'RQ'],[0,1,'RQ'],[0,-1,'RQ'],[1,1,'BQ'],[1,-1,'BQ'],[-1,1,'BQ'],[-1,-1,'BQ']];
  for(const[dr,df,set]of dirs){let nr=r+dr,nf=f+df;
    while(nr>=0&&nr<8&&nf>=0&&nf<8){const p=arr[nr*8+nf];
      if(p){if(colorOf(p)===by&&set.includes(p.toUpperCase()))return true;break;}
      nr+=dr;nf+=df;}}
  return false;
}
function validatePosition(arr,turn){
  const issues=[];const m=countMaterial(arr);
  for(const c of['w','b']){const nm=c==='w'?'білих':'чорних';
    if(m[c].K!==1)issues.push({lvl:'err',t:'У '+nm+' має бути рівно один король (зараз '+m[c].K+').'});
    if(m[c].P>8)issues.push({lvl:'err',t:'У '+nm+' понад 8 пішаків.'});
    const extra=Math.max(0,m[c].Q-1)+Math.max(0,m[c].R-2)+Math.max(0,m[c].B-2)+Math.max(0,m[c].N-2);
    if(m[c].P+extra>8)issues.push({lvl:'err',t:'У '+nm+' забагато фігур: разом із пішаками вийшло б понад 16 (з урахуванням перетворень).'});}
  arr.forEach((ch,i)=>{if((ch==='P'||ch==='p')&&(i<8||i>55))issues.push({lvl:'err',t:'Пішак на '+sqName(i)+' — на першій/останній горизонталі пішака бути не може.'});});
  if(m.w.K===1&&m.b.K===1){
    const other=turn==='w'?'b':'w';const ks=arr.indexOf(other==='w'?'K':'k');
    if(attackedBy(arr,ks,turn))issues.push({lvl:'err',t:'Король '+(other==='w'?'білих':'чорних')+' під шахом, хоча хід '+(turn==='w'?'білих':'чорних')+' — позиція неможлива (перевірте розпізнавання або «чий хід»).'});
  }
  return issues;
}
/* Чи існує серія легальних ходів, що веде до мату «att» (допомога супротивника враховується).
   Правила матеріалу звірено повним перебором усіх розстановок (див. тест-набір). */
function canMate(att,m){
  const a=m[att],d=m[att==='w'?'b':'w'];
  if(a.P||a.R||a.Q)return{can:true};
  if(a.N+a.B===0)return{can:false,why:'самотній король мат поставити не може'};
  if(a.N>=2||(a.N>=1&&a.B>=1))return{can:true};
  const oppB=(col)=>col==='light'?d.bd:d.bl;
  if(a.B>=2){
    if(a.bl>0&&a.bd>0)return{can:true};
    const col=a.bl>0?'light':'dark';
    return (d.P+d.N+oppB(col))>0?{can:true}:{can:false,why:'слони одного кольору не ставлять мат, якщо в суперника немає пішака, коня чи різнопольного слона'};
  }
  if(a.N===1){
    return (d.P+d.N+d.B+d.R)>0?{can:true}:{can:false,shaky:d.Q>=2,why:d.Q?'один кінь проти короля й ферзя(ів) — мат неможливий':'один кінь проти «голого» короля — мат неможливий'};
  }
  const col=a.bl>0?'light':'dark';
  return (d.P+d.N+oppB(col))>0?{can:true}:{can:false,shaky:d.Q>=1&&d.R+d.Q>=2,why:d.R||d.Q?'один слон проти короля з турою/ферзем — мат неможливий':'один слон проти «голого» короля чи слона того ж кольору — мат неможливий'};
}
function onlyKP(arr){return arr.every(ch=>!ch||/[KkPp]/.test(ch));}
function allPawnsBlocked(arr){
  for(let i=0;i<64;i++){const ch=arr[i];if(ch!=='P'&&ch!=='p')continue;
    const fwd=i+(ch==='P'?-8:8);if(fwd<0||fwd>63)continue;if(!arr[fwd])return false;
    const f=i%8;for(const df of[-1,1]){const nf=f+df;if(nf<0||nf>7)continue;
      const tgt=arr[Math.floor(fwd/8)*8+nf];if(tgt&&colorOf(tgt)!==colorOf(ch))return false;}}
  return true;
}
const NOM={w:'Білі',b:'Чорні'},GEN={w:'білих',b:'чорних'};
function analyze(arr,turn,flag){
  const out={issues:validatePosition(arr,turn),info:[],verdict:null,fen:arrToFen(arr,turn)};
  if(out.issues.some(i=>i.lvl==='err')){
    out.verdict={cls:'bad',title:'Позицію неможливо оцінити',text:'Виправте помилки розпізнавання/розстановки — потім отримаєте рішення.',art:''};return out;}
  const m=countMaterial(arr);out.m=m;
  let status='normal';
  if(typeof Chess==='function'){
    const c=new Chess();
    if(c.load(out.fen)){
      if(c.in_checkmate())status='mate';else if(c.in_stalemate())status='stalemate';else if(c.in_check())status='check';
    }else out.issues.push({lvl:'warn',t:'Бібліотека не прийняла FEN — мат/пат не перевірено.'});
  }else out.issues.push({lvl:'warn',t:'Бібліотека chess.js не завантажилась — мат/пат не перевіряються (потрібен інтернет).'});
  out.status=status;
  const cw=canMate('w',m),cb=canMate('b',m);out.canMate={w:cw,b:cb};
  out.info.push('Білі можуть теоретично поставити мат: '+(cw.can?'так':'ні'+(cw.why?' ('+cw.why+')':'')));
  out.info.push('Чорні можуть теоретично поставити мат: '+(cb.can?'так':'ні'+(cb.why?' ('+cb.why+')':'')));
  if(status==='check')out.info.push('Король '+GEN[turn]+' під шахом.');
  const dead=!cw.can&&!cb.can;out.dead=dead;
  const uncertain=onlyKP(arr)&&allPawnsBlocked(arr);
  const R=(w)=>w==='w'?'1-0':'0-1';
  if(status==='mate'){const win=turn==='w'?'b':'w';
    out.verdict={cls:'ok',title:'Мат: перемога '+GEN[win],res:R(win),art:'5.1.1',
      text:'Король '+GEN[turn]+' під матом. Мат ходом, зробленим за правилами ст. 3 і 4.2–4.7, закінчує партію негайно — тож якщо хід зроблено до падіння прапорця, прапорець уже не має значення.'};}
  else if(status==='stalemate'){
    out.verdict={cls:'ok',title:'Пат: нічия',res:'½-½',art:'5.2.1',
      text:'У гравця, чий хід, немає легального ходу, а король не під шахом. Пат закінчує партію негайно (ст. 5.2.1) і має перевагу над падінням прапорця, що настало пізніше.'};}
  else if(dead){
    out.verdict={cls:'ok',title:'Мертва позиція: нічия',res:'½-½',art:'5.2.2',
      text:'Жоден із гравців не може поставити мат за жодної серії легальних ходів. Партія закінчується нічиєю негайно (ст. 5.2.2), навіть якщо час когось уже вийшов пізніше.'};}
  else if(flag){
    const opp=flag==='w'?'b':'w',cm=canMate(opp,m);
    if(uncertain||cm.shaky){
      out.verdict={cls:'warn',title:'Потрібна ручна перевірка',res:'?',art:'5.2.2, 6.9',
        text:(uncertain?'На дошці лише королі та пішаки, і пішаки заблоковані. Чи можливий мат за будь-якої серії легальних ходів — залежить від того, чи можуть королі знищити/обійти пішаків.':'Рідкісне співвідношення матеріалу, яке програма не може вирішити однозначно.')+' Перевірте вручну: якщо мат неможливий — нічия, якщо можливий — перемога '+GEN[opp]+'.'};}
    else if(cm.can){
      out.verdict={cls:'bad',title:'Час '+GEN[flag]+' вичерпано: перемога '+GEN[opp],res:R(opp),art:'6.9',
        text:'Гравець, у якого впав прапорець, програє. Виняток із ст. 6.9 не діє: у '+GEN[opp]+' є матеріал, з яким мат теоретично можливий за якоїсь серії легальних ходів (допомога супротивника теж враховується). Прапорець має бути зафіксований арбітром або обґрунтовано заявлений (6.8).'};}
    else{
      out.verdict={cls:'ok',title:'Час '+GEN[flag]+' вичерпано, але мат неможливий: нічия',res:'½-½',art:'6.9',
        text:'Виняток зі ст. 6.9: якщо '+GEN[opp]+' не можуть поставити мат жодною серією легальних ходів ('+cm.why+'), партія закінчується нічиєю.'};}
  }else{
    out.verdict={cls:'info',title:'Партія триває',res:'',art:'',
      text:'Мату, пату чи мертвої позиції на дошці немає. Якщо спір про падіння прапорця — позначте, у кого впав. Якщо про повторення чи 50 ходів — це не видно з фото: потрібні бланки (9.2, 9.3).'};
    if(uncertain)out.info.push('Лише королі та заблоковані пішаки: можлива мертва позиція — перевірте вручну.');
  }
  return out;
}
function checkMove(arr,turn,str){
  if(typeof Chess!=='function')return{err:'Бібліотека chess.js недоступна.'};
  const c=new Chess();if(!c.load(arrToFen(arr,turn)))return{err:'Позиція некоректна.'};
  const mv=c.move(String(str).trim(),{sloppy:true});
  if(!mv)return{legal:false,count:c.moves().length};
  return{legal:true,san:mv.san};
}


/* ---------- Аналіз запису партії (PGN / бланк) ---------- */
function pgnTokens(text){
  let t=String(text||'');
  t=t.replace(/\[[^\]]*\]/g,' ').replace(/\{[^}]*\}/g,' ').replace(/;[^\n]*/g,' ');
  let prev;do{prev=t;t=t.replace(/\([^()]*\)/g,' ');}while(t!==prev);
  t=t.replace(/\$\d+/g,' ').replace(/(1-0|0-1|1\/2-1\/2|½-½)(?=\s|$)/g,' ').replace(/\*/g,' ');
  t=t.replace(/\d+\s*\.(\s*\.\.)?/g,' ');
  return t.split(/\s+/).map(x=>x.replace(/[!?]+$/,'').replace(/^0-0-0$/,'O-O-O').replace(/^0-0$/,'O-O')).filter(Boolean);
}
function posKey(c){
  const f=c.fen().split(' ');let ep=f[3];
  if(ep!=='-'&&!c.moves({verbose:true}).some(m=>m.flags.indexOf('e')>=0))ep='-';
  return f[0]+' '+f[1]+' '+f[2]+' '+ep;
}
function analyzeGame(text){
  if(typeof Chess!=='function')return{err:'Бібліотека chess.js недоступна.'};
  const c=new Chess();const fm=/\[FEN\s+"([^"]+)"\]/.exec(String(text||''));
  if(fm&&!c.load(fm[1]))return{err:'Некоректний FEN у заголовку.'};
  const toks=pgnTokens(text);
  const out={n:0,illegal:null,events:[],moves:[],tokens:toks.length,final:null,startFen:fm?fm[1]:null};
  const seen={};seen[posKey(c)]=1;
  for(let i=0;i<toks.length;i++){
    const turnBefore=c.turn();
    const mv=c.move(toks[i],{sloppy:true});
    if(!mv){out.illegal={ply:i+1,num:Math.floor(i/2)+1,white:turnBefore==='w',tok:toks[i],legal:c.moves(),over:c.game_over(),fen:c.fen()};break;}
    out.n++;out.moves.push(mv.san);
    const k=posKey(c);seen[k]=(seen[k]||0)+1;
    const label=Math.floor(i/2)+1+(mv.color==='w'?'.':'...')+mv.san;
    const mover=mv.color,next=mover==='w'?'b':'w';
    const ev=t=>out.events.push({t,ply:i+1,label,mover,next});
    if(seen[k]===3)ev('rep3');
    if(seen[k]===5)ev('rep5');
    const hm=+c.fen().split(' ')[4];
    if(hm===100)ev('m50');
    if(hm===150)ev('m75');
  }
  const f=c.fen().split(' ');
  out.final={fen:c.fen(),turn:c.turn(),mate:c.in_checkmate(),stale:c.in_stalemate(),check:c.in_check(),hm:+f[4],rep:seen[posKey(c)]||1};
  return out;
}
