const STN={1:"かんたん",2:"ふつう",3:"むずかしい"};
const ALL=[];
[["5",[S5_1,S5_2,S5_3]],["4",[S4_1,S4_2,S4_3]]].forEach(([lv,sets])=>sets.forEach((set,si)=>set.forEach((q,i)=>
  ALL.push({id:`s${lv}-${si+1}-${i}`,kind:"s",lv,st:si+1,ja:q[0],en:q[1]}))));
[["5",W5],["4",W4]].forEach(([lv,list])=>list.forEach((w,i)=>
  ALL.push({id:`w${lv}-${i}`,kind:"w",lv,cat:w[2],en:w[0],ja:w[1]})));
const byId=Object.fromEntries(ALL.map(q=>[q.id,q]));

const store={
  get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
};
let settings=Object.assign({kind:"s",lv:"5",st:"1",mode:"je",n:10},store.get("eiken-settings",{}));
if(!STN[settings.st]&&settings.st!=="mix")settings.st="1";
let weak=store.get("eiken-weak",[]).filter(id=>byId[id]);
let log=store.get("eiken-log",[]);          // 1回ごとの練習記録
let stats=store.get("eiken-stats",{});      // 問題ごとの ○回数・△×回数・最後にまちがえた日
let stickers=store.get("eiken-stickers",[]);
let run=null, calMonth=null, recTab="cal", view="home";

/* ---- スプレッドシートに保存（合言葉ごと） ---- */
const API_URL="https://script.google.com/macros/s/AKfycbyS1oORtcQ57bNaRWuSuMupDtxEYR6bDpw51cpsfg7UuiXbAQthCJmnAHnBwFZnDLsQ/exec";
const inGas=typeof google!=="undefined"&&google.script&&google.script.run;
const hasGas=inGas||!!API_URL;
let me={name:store.get("eiken-pass",null)};
let queue=[], flushing=false, flushTimer=null, sync=hasGas?"loading":"local";
const K=k=>"eiken-"+k+"-"+(me.name||"");
function api(fn,...a){
  return new Promise((res,rej)=>{
    if(inGas)return google.script.run.withSuccessHandler(res).withFailureHandler(rej)[fn](...a);
    fetch(API_URL,{method:"POST",credentials:"omit",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({fn,args:a})})
      .then(r=>r.json()).then(j=>j.ok?res(j.result):rej(new Error(j.error))).catch(rej);
  });
}
function loadCache(){
  stats=store.get(K("stats"),{});weak=store.get(K("weak"),[]).filter(id=>byId[id]);
  log=store.get(K("log"),[]);stickers=store.get(K("stickers"),[]);queue=store.get(K("queue"),[]);
}
function cache(){
  store.set(K("stats"),stats);store.set(K("weak"),weak);store.set(K("log"),log);
  store.set(K("stickers"),stickers);store.set(K("queue"),queue);
}
function enqueue(op){queue.push(op);cache();clearTimeout(flushTimer);flushTimer=setTimeout(flush,700)}
async function flush(){
  if(flushing||!queue.length||!hasGas)return;
  flushing=true;
  const batch=queue.slice();
  try{await api("apply",me.name,batch);queue=queue.slice(batch.length);sync="cloud"}
  catch(e){sync="offline"}
  cache();flushing=false;
  if(queue.length&&sync==="cloud")flush();
  refresh();
}
async function pull(){
  if(!hasGas||!me.name)return;
  sync="loading";refresh();
  await flush();
  if(queue.length){refresh();return}
  try{
    const r=await api("loadAll",me.name);
    stats=r.stats||{};weak=(r.weak||[]).filter(id=>byId[id]);
    stickers=r.stickers||[];log=(r.log||[]).sort((a,b)=>a.t-b.t);
    sync="cloud";cache();
  }catch(e){
    if(String(e&&e.message).includes("合言葉")){store.set("eiken-pass",null);me.name=null;return passScreen("合言葉がちがいます。もう一度入れてください。")}
    sync="offline";
  }
  refresh();
}
function refresh(){
  if(view==="home")home(true);
  else if(view==="records")records(undefined,true);
}
function syncNote(){
  return {cloud:"記録はスプレッドシートに保存しています。どのスマホでも同じ記録です。",
    loading:"記録を読みこんでいます…",
    offline:"いまはつながらないので、記録をこのスマホにためています。つながったら自動で送ります。",
    local:"記録はこのスマホの中に保存しています。"}[sync];
}
function passScreen(msg){
  view="pass";run=null;
  app.innerHTML=`
  <div><h1><span class="ribbon">🎀</span> 英検 口頭カード</h1>
  <p class="lead">合言葉を入れてね。合言葉ごとに、べつべつの記録になります。</p></div>
  <form class="card group" id="passForm">
    <label class="label" for="pass">合言葉</label>
    <input id="pass" autocomplete="off" autocapitalize="off" enterkeyhint="go"
      style="font:inherit;font-size:22px;font-weight:700;padding:12px 16px;border-radius:16px;border:2px solid var(--line);background:var(--paper);color:var(--ink);width:100%;box-sizing:border-box">
    <p class="note" id="passMsg" style="color:var(--ng);font-weight:700">${msg?esc(msg):""}</p>
    <button class="btn" type="submit">はじめる</button>
  </form>`;
  const f=document.getElementById("passForm"),inp=document.getElementById("pass"),m=document.getElementById("passMsg");
  f.onsubmit=async ev=>{
    ev.preventDefault();
    const v=inp.value.trim();if(!v)return;
    m.textContent="たしかめています…";m.style.color="var(--sub)";
    try{ if(hasGas)await api("login",v); }
    catch(e){m.textContent="合言葉がちがいます。";m.style.color="var(--ng)";return}
    me.name=v;store.set("eiken-pass",v);loadCache();home();pull();
  };
  setTimeout(()=>inp.focus(),50);
}
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&me.name&&!run)pull()});
function boot(){if(!me.name)return passScreen();loadCache();home();pull()}

const STK=["🍓","🐰","🌸","🎀","🦄","🍰","🐱","🌈","🍭","🐼","🦋","🌷","🍩","🐣","🍒","🐶","🧁","🐹","🌻","🍑","🐨","🎈","🍦","🦢"];
const RARE=["👑","💎","🌟","🦄","🎀","💖"];

const pad=n=>String(n).padStart(2,"0");
const dstr=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today=()=>dstr(new Date());
const md=s=>{const [,m,d]=s.split("-");return `${+m}/${+d}`};

/* ---- 読み上げ ---- */
let voices={};
function pickVoices(){
  if(!("speechSynthesis" in window))return;
  const vs=speechSynthesis.getVoices();
  const en=vs.filter(v=>/^en[-_]US/i.test(v.lang));
  voices.en=en.find(v=>/Samantha/i.test(v.name))||en.find(v=>v.localService)||en[0]||vs.find(v=>/^en/i.test(v.lang));
  const ja=vs.filter(v=>/^ja/i.test(v.lang));
  voices.ja=ja.find(v=>/Kyoko/i.test(v.name))||ja[0];
}
if("speechSynthesis" in window){pickVoices();speechSynthesis.onvoiceschanged=pickVoices}
function speak(text,lang,slow){
  if(!("speechSynthesis" in window))return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.lang=lang==="en"?"en-US":"ja-JP";
  if(voices[lang])u.voice=voices[lang];
  u.rate=slow?0.6:(lang==="en"?0.9:1);
  speechSynthesis.speak(u);
}
const canSpeak="speechSynthesis" in window;
const calm=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- 花丸 ---- */
function hanamaru(size=80){
  const c=50,R=33,N=9;let p="";
  for(let i=0;i<=N;i++){
    const a=-Math.PI/2+i*2*Math.PI/N,x=(c+R*Math.cos(a)).toFixed(1),y=(c+R*Math.sin(a)).toFixed(1);
    p+=i?` A11 11 0 0 1 ${x} ${y}`:`M${x} ${y}`;
  }
  let s="";
  for(let t=0;t<=4.2*Math.PI;t+=0.25){const r=2+t*1.55;s+=`${t?"L":"M"}${(c+r*Math.cos(t)).toFixed(1)} ${(c+r*Math.sin(t)).toFixed(1)} `}
  return `<svg class="hana" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="var(--hana)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="${p}"/><path d="${s}"/></svg>`;
}

/* ---- 演出 ---- */
function burst(el){
  if(calm||!el)return;
  const r=el.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  const ch=["♥","✦","♥","★","♡"];
  for(let i=0;i<14;i++){
    const s=document.createElement("span");s.className="pt";s.textContent=ch[i%ch.length];
    const a=Math.random()*Math.PI*2,d=60+Math.random()*90;
    s.style.left=cx+"px";s.style.top=cy+"px";
    s.style.setProperty("--dx",Math.cos(a)*d+"px");s.style.setProperty("--dy",Math.sin(a)*d-40+"px");
    s.style.setProperty("--r",(Math.random()*360-180)+"deg");
    if(i%3===1)s.style.color="var(--gold)";
    document.body.appendChild(s);setTimeout(()=>s.remove(),950);
  }
}
function toast(text){
  document.querySelectorAll(".toast").forEach(t=>t.remove());
  const t=document.createElement("div");t.className="toast";t.textContent=text;
  document.body.appendChild(t);setTimeout(()=>t.remove(),1250);
}

/* ---- 共通 ---- */
const app=document.getElementById("app");
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function spkBtn(text,lang,label,cls=""){
  return `<button class="spk ${cls}" data-say="${esc(text)}" data-lang="${lang}" data-slow="${label.includes("ゆっくり")?1:0}">${SPK}${label}</button>`;
}
function bindSpk(){app.querySelectorAll("[data-say]").forEach(b=>b.onclick=()=>speak(b.dataset.say,b.dataset.lang,b.dataset.slow==="1"))}
function pool(){
  return ALL.filter(q=>q.kind===settings.kind
    &&(settings.lv==="mix"||q.lv===settings.lv)
    &&(settings.kind==="w"||settings.st==="mix"||String(q.st)===settings.st));
}
function tags(q){return [q.lv+"級",q.kind==="s"?STN[q.st]:q.cat]}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function practiceDays(){return new Set(log.map(e=>e.d))}
function streak(){
  const days=practiceDays();const d=new Date();
  if(!days.has(dstr(d)))d.setDate(d.getDate()-1);
  let n=0;while(days.has(dstr(d))){n++;d.setDate(d.getDate()-1)}
  return n;
}
function sessionLabel(e){
  if(e.src==="weak")return `${e.kind==="w"?"単語":"例文"} にがて`;
  if(e.src==="miss")return "まちがえた問題";
  const lv=e.lv==="mix"?"5・4級":e.lv+"級";
  return e.kind==="w"?`単語 ${lv}`:`例文 ${lv} ${e.st==="mix"?"まぜる":STN[e.st]}`;
}

/* ---- さいしょの画面 ---- */
function home(keep){
  run=null;view="home";
  const isW=settings.kind==="w";
  const seg=(key,opts,cls="")=>`<div class="seg ${cls}">${opts.map(([v,t,s])=>`<button data-set="${key}" data-val="${v}" aria-pressed="${String(settings[key])===String(v)}">${t}${s?`<small>${s}</small>`:""}</button>`).join("")}</div>`;
  const weakN=weak.filter(id=>byId[id].kind===settings.kind).length;
  app.innerHTML=`
  <div class="top" style="align-items:flex-start">
    <div><h1><span class="ribbon">🎀</span> 英検 口頭カード</h1>
    <p class="lead">おうちの人が問題を読んで、口で答えてね。</p></div>
    <div class="group" style="gap:6px;align-items:flex-end"><button class="pill" id="rec">きろく</button><button class="back" id="who">${esc(me.name||"")} ▸ きりかえ</button></div>
  </div>
  <div class="status"><span>れんぞく <b>${streak()}</b> 日</span><span>シール <b>${stickers.length}</b> まい</span><span>きょう <b>${log.filter(e=>e.d===today()).length}</b> 回</span></div>
  ${seg("kind",[["s","例文"],["w","単語"]],"two")}
  <div class="card group">
    <div class="label">級</div>
    ${seg("lv",[["5","5級"],["4","4級"],["mix","まぜる","5級＋4級"]])}
    ${isW?"":`<div class="label" style="margin-top:8px">レベル</div>
    ${seg("st",[["1","かんたん","短い文"],["2","ふつう","〜しない・〜できる など"],["3","むずかしい","疑問文"],["mix","まぜる","3つ全部"]],"two")}`}
    <div class="label" style="margin-top:8px">やり方</div>
    ${seg("mode",[["je","日本語 → 英語",isW?"意味を聞いて英単語を言う":"日本語を聞いて英語で言う"],["ej","英語 → 日本語",isW?"英単語を聞いて意味を言う":"英語を聞いて日本語で言う"]],"two")}
    <div class="label" style="margin-top:8px">問題の数</div>
    ${seg("n",[[5,"5問"],[10,"10問"],[20,"20問"]])}
    <p class="note">この組み合わせの問題は全部で${pool().length}問。毎回ランダムに出ます。</p>
  </div>
  <button class="btn" id="start">はじめる！</button>
  <button class="btn ghost" id="weak" ${weakN?"":"disabled"}>にがてな${isW?"単語":"例文"}だけ（${weakN}問）</button>
  <p class="note">最後までやるとシールが1まいもらえます。全部○ならキラキラのシール！<br>△と×の問題は「にがて」に入り、にがての練習で○をとると消えます。${esc(syncNote())}${canSpeak?"":"<br>この画面では読み上げが使えません。英語はおうちの人が読んでください。"}</p>`;
  app.querySelectorAll("[data-set]").forEach(b=>b.onclick=()=>{
    const k=b.dataset.set;settings[k]=k==="n"?Number(b.dataset.val):b.dataset.val;store.set("eiken-settings",settings);home();
  });
  document.getElementById("rec").onclick=()=>records();
  document.getElementById("who").onclick=()=>{store.set("eiken-pass",null);me.name=null;passScreen()};
  document.getElementById("start").onclick=()=>start(shuffle(pool()).slice(0,settings.n),"normal");
  document.getElementById("weak").onclick=()=>start(shuffle(weak.filter(id=>byId[id].kind===settings.kind).map(id=>byId[id])).slice(0,20),"weak");
  if(!keep)window.scrollTo(0,0);
}

/* ---- 問題 ---- */
function start(list,src){
  if(!list.length)return;
  view="quiz";
  run={list,i:0,res:[],src,mode:settings.mode,shown:false,showEn:false,combo:0,best:0,saved:false,
       meta:{kind:list[0].kind,lv:settings.lv,st:settings.st}};
  question();
}

function question(){
  const q=run.list[run.i],n=run.list.length,je=run.mode==="je",isW=q.kind==="w";
  const jaCls=isW?'class="ja" style="font-size:36px"':'class="ja"';
  const enCls=isW?'class="en" style="font-size:40px"':'class="en"';
  const prompt=je
    ? `<p class="say">おうちの人が読んでください</p><p ${jaCls}>${esc(q.ja)}</p>
       <div class="row" style="margin-top:10px">${canSpeak?spkBtn(q.ja,"ja","日本語を流す"):""}</div>`
    : `<p class="say">英語を流して、日本語で答えてもらいます</p>
       ${canSpeak?`<div class="row">${spkBtn(q.en,"en","英語を流す","big")}${spkBtn(q.en,"en","ゆっくり")}</div>`:""}
       <div style="margin-top:12px">${run.showEn||!canSpeak?`<p ${enCls}>${esc(q.en)}</p>`:`<button class="back" id="showEn" style="color:var(--accent-deep)">英語を見る（おうちの人が読むとき）</button>`}</div>`;
  const ans=!run.shown?"":je
    ? `<div class="answer"><div class="label">答え</div><p ${enCls}>${esc(q.en)}</p>
       ${canSpeak?`<div class="row">${spkBtn(q.en,"en","英語を聞く")}${spkBtn(q.en,"en","ゆっくり")}</div>`:""}</div>`
    : `<div class="answer"><div class="label">答え</div>${run.showEn||!canSpeak?"":`<p ${enCls}>${esc(q.en)}</p>`}<p class="ja" style="font-size:${isW?30:21}px">${esc(q.ja)}</p></div>`;
  app.innerHTML=`
  <div class="top"><button class="back" id="quit">← やめる</button><span class="prog">${run.i+1} / ${n}</span></div>
  <div class="bar"><i style="width:${run.i/n*100}%"></i></div>
  <p class="combo">${run.combo>=2?`♥ ${run.combo}れんぞく○ ♥`:""}</p>
  <div class="card">
    <div class="tagline">${tags(q).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}<span class="chip">${je?"日本語 → 英語":"英語 → 日本語"}</span>${run.src==="weak"?'<span class="chip">にがて</span>':""}</div>
    ${prompt}${ans}
  </div>
  ${run.shown
    ? `<div class="judge">
        <button class="j-ok" data-j="ok"><b>○</b><span>できた</span></button>
        <button class="j-mid" data-j="mid"><b>△</b><span>おしい</span></button>
        <button class="j-ng" data-j="ng"><b>×</b><span>もう一回</span></button></div>
       <p class="hint">${isW?"意味が合っていれば、ちがう言い方でも○でOKです。":"言い方が少しちがっても、意味が合っていれば○でOKです。"}</p>`
    : `<button class="btn" id="reveal">答えを見る</button>`}`;
  bindSpk();
  document.getElementById("quit").onclick=()=>run.res.length?result(false):home();
  const se=document.getElementById("showEn");if(se)se.onclick=()=>{run.showEn=true;question()};
  const rv=document.getElementById("reveal");if(rv)rv.onclick=()=>{run.shown=true;question()};
  app.querySelectorAll("[data-j]").forEach(b=>b.onclick=()=>judge(b.dataset.j,b));
  window.scrollTo(0,0);
}

function judge(j,btn){
  const q=run.list[run.i],t=today();
  run.res.push({id:q.id,j});
  const s=stats[q.id]||{c:0,w:0};
  if(j==="ok"){
    s.c++;run.combo++;run.best=Math.max(run.best,run.combo);
    burst(btn);
    if(run.combo>=3)toast(`${run.combo}れんぞく！`);
    if(run.src==="weak")weak=weak.filter(x=>x!==q.id);
  }else{
    s.w++;s.lw=t;run.combo=0;
    if(!weak.includes(q.id))weak.push(q.id);
  }
  stats[q.id]=s;
  enqueue({type:"judge",id:q.id,kind:q.kind,ja:q.ja,en:q.en,ok:j==="ok",d:t,weak:weak.includes(q.id)});
  run.i++;run.shown=false;run.showEn=false;
  if(canSpeak)speechSynthesis.cancel();
  run.i<run.list.length?question():result(true);
}

/* ---- けっか ---- */
function result(done){
  const ok=run.res.filter(r=>r.j==="ok").length,n=run.res.length;
  const miss=run.res.filter(r=>r.j!=="ok");
  let got=null;
  view="result";
  if(!run.saved){
    run.saved=true;
    const entry={d:today(),t:Date.now(),kind:run.meta.kind,lv:run.meta.lv,st:run.meta.st,mode:run.mode,src:run.src,n,ok};
    log.push(entry);
    if(done&&n>=5){
      const rare=ok===n;
      got={e:(rare?RARE:STK)[Math.floor(Math.random()*(rare?RARE:STK).length)],rare,d:today()};
      stickers.push(got);
    }
    enqueue({type:"session",entry,label:sessionLabel(entry),sticker:got});
  }
  const r=ok/n;
  const praise=r===1?"天才！":r>=0.8?"すごい！":r>=0.6?"よくできました":"がんばったね";
  app.innerHTML=`
  <div class="card" style="text-align:center">
    ${r>=0.6?hanamaru(110):""}
    <p class="praise">${praise}</p>
    <div class="score">${ok}<small> / ${n}</small></div>
    ${run.best>=3?`<p class="note">さいこう ${run.best}れんぞく○</p>`:""}
  </div>
  ${got?`<div class="card" style="text-align:center"><div class="label">${got.rare?"キラキラシールをゲット！":"シールをゲット！"}</div>
    <div class="sticker big ${got.rare?"rare":""}" style="margin-top:10px">${got.e}</div>
    <p class="note" style="margin-top:10px">シール帳に ${stickers.length} まいめ</p></div>`:""}
  ${miss.length?`<div class="card group"><div class="label">△・×だった問題</div><ul class="list">
    ${miss.map(r=>{const q=byId[r.id];return `<li><span><span class="m ${r.j==="mid"?"j-mid":"j-ng"}">${r.j==="mid"?"△":"×"}</span>${esc(q.ja)}</span>
      <span class="row"><span class="e">${esc(q.en)}</span>${canSpeak?spkBtn(q.en,"en","聞く"):""}</span></li>`}).join("")}
  </ul></div>
  <button class="btn" id="again">△・×だった問題をもう一回</button>`:""}
  <button class="btn ghost" id="home">さいしょの画面へ</button>`;
  bindSpk();
  if(r===1&&!calm)setTimeout(()=>burst(app.querySelector(".score")),200);
  const a=document.getElementById("again");
  if(a)a.onclick=()=>start(shuffle(miss.map(r=>byId[r.id])),run.src==="weak"?"weak":"miss");
  document.getElementById("home").onclick=home;
  window.scrollTo(0,0);
}

/* ---- きろく ---- */
function records(tab,keep){
  if(tab)recTab=tab;view="records";
  const tabs=[["cal","カレンダー"],["stk","シール"],["score","せいせき"],["miss","まちがい"]];
  let body="";
  if(recTab==="cal")body=calView();
  if(recTab==="stk")body=stickerView();
  if(recTab==="score")body=scoreView();
  if(recTab==="miss")body=missView();
  app.innerHTML=`
  <div class="top"><button class="back" id="back">← もどる</button><h2>きろく</h2><span style="width:48px"></span></div>
  <div class="seg four">${tabs.map(([k,t])=>`<button data-tab="${k}" aria-pressed="${recTab===k}">${t}</button>`).join("")}</div>
  ${body}`;
  document.getElementById("back").onclick=home;
  app.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>records(b.dataset.tab));
  app.querySelectorAll("[data-cal]").forEach(b=>b.onclick=()=>{calMonth.setMonth(calMonth.getMonth()+Number(b.dataset.cal));records()});
  const pm=document.getElementById("practiceMiss");
  if(pm)pm.onclick=()=>start(shuffle(missItems()).slice(0,20),"miss");
  bindSpk();
}

function calView(){
  if(!calMonth){calMonth=new Date();calMonth.setDate(1)}
  const y=calMonth.getFullYear(),m=calMonth.getMonth();
  const days=practiceDays(),cnt={};log.forEach(e=>cnt[e.d]=(cnt[e.d]||0)+1);
  const first=new Date(y,m,1).getDay(),last=new Date(y,m+1,0).getDate(),t=today();
  let cells=["日","月","火","水","木","金","土"].map(w=>`<div class="wd">${w}</div>`).join("");
  for(let i=0;i<first;i++)cells+="<div></div>";
  for(let d=1;d<=last;d++){
    const k=`${y}-${pad(m+1)}-${pad(d)}`,has=days.has(k);
    cells+=`<div class="d ${has?"has":""} ${k===t?"today":""}" ${has?`aria-label="${d}日 ${cnt[k]}回練習"`:""}>${has?hanamaru():""}<span>${d}</span></div>`;
  }
  const monthDays=[...days].filter(k=>k.startsWith(`${y}-${pad(m+1)}`)).length;
  return `
  <div class="big-num"><div><b>${streak()}</b><span>れんぞく日数</span></div><div><b>${days.size}</b><span>ぜんぶの日数</span></div><div><b>${monthDays}</b><span>${m+1}月の日数</span></div></div>
  <div class="card group">
    <div class="top"><button class="pill" data-cal="-1" aria-label="前の月">‹</button><h2 style="font-family:var(--en)">${y}年 ${m+1}月</h2><button class="pill" data-cal="1" aria-label="次の月">›</button></div>
    <div class="cal">${cells}</div>
    <p class="note">練習した日に花丸がつきます。</p>
  </div>`;
}

function stickerView(){
  const slots=Math.max(20,Math.ceil((stickers.length+1)/20)*20);
  let g="";
  for(let i=0;i<slots;i++){const s=stickers[i];g+=s?`<div class="sticker ${s.rare?"rare":""}" title="${md(s.d)}">${s.e}</div>`:`<div class="sticker empty"></div>`}
  const rare=stickers.filter(s=>s.rare).length;
  return `
  <div class="big-num"><div><b>${stickers.length}</b><span>シール</span></div><div><b>${rare}</b><span>キラキラ</span></div></div>
  <div class="card group"><div class="sgrid">${g}</div>
  <p class="note">5問以上を最後までやると1まい。全部○ならキラキラシール。</p></div>`;
}

function scoreView(){
  if(!log.length)return `<div class="card"><p class="note">まだ記録がありません。練習すると、ここに点数が出ます。</p></div>`;
  const sorted=[...log].sort((a,b)=>a.t-b.t),recent=sorted.slice(-14);
  const W=320,H=150,L=30,B=22,T=12,bw=(W-L-6)/14;
  let svg=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="さいきんの正解の割合">`;
  [0,50,100].forEach(v=>{const yy=T+(H-T-B)*(1-v/100);svg+=`<line x1="${L}" x2="${W-4}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-width="1"/><text x="${L-6}" y="${yy+4}" text-anchor="end" font-size="10" fill="var(--sub)">${v}%</text>`});
  recent.forEach((e,i)=>{
    const p=e.ok/e.n,h=(H-T-B)*p,x=L+4+i*bw,yy=H-B-h;
    svg+=`<rect x="${x}" y="${yy}" width="${bw-6}" height="${Math.max(h,1.5)}" rx="4" fill="${p===1?"var(--hana)":"var(--accent)"}" opacity="${p===1?1:.75}"/>`;
    svg+=`<text x="${x+(bw-6)/2}" y="${H-7}" text-anchor="middle" font-size="9" fill="var(--sub)">${md(e.d)}</text>`;
  });
  svg+="</svg>";
  const groups={};
  Object.entries(stats).forEach(([id,s])=>{const q=byId[id];if(!q)return;
    const k=q.kind==="w"?`単語 ${q.lv}級`:`例文 ${q.lv}級 ${STN[q.st]}`;
    const g=groups[k]||(groups[k]={c:0,t:0});g.c+=s.c;g.t+=s.c+s.w});
  const order=["例文 5級 かんたん","例文 5級 ふつう","例文 5級 むずかしい","例文 4級 かんたん","例文 4級 ふつう","例文 4級 むずかしい","単語 5級","単語 4級"];
  const rows=order.filter(k=>groups[k]).map(k=>{const g=groups[k],p=Math.round(g.c/g.t*100);
    return `<tr><td>${k}<div class="meter"><i style="width:${p}%"></i></div></td><td>${p}%<br><span class="note">${g.c}/${g.t}</span></td></tr>`}).join("");
  const list=sorted.reverse().slice(0,40).map(e=>`<li><span style="display:flex;justify-content:space-between;gap:8px"><span>${sessionLabel(e)}</span><b style="font-family:var(--en)">${e.ok}/${e.n}</b></span>
    <span class="meta"><span>${md(e.d)}</span><span>${e.mode==="je"?"日本語 → 英語":"英語 → 日本語"}</span>${e.ok===e.n?"<span>全部○</span>":""}</span></li>`).join("");
  return `
  <div class="card group"><div class="label">さいきんの正解の割合（最大14回）</div>${svg}</div>
  <div class="card group"><div class="label">レベルごとの正解の割合</div><table class="acc">${rows}</table></div>
  <div class="card group"><div class="label">練習のきろく（新しい順）</div><ul class="list">${list}</ul></div>`;
}

function missItems(){
  return Object.entries(stats).filter(([id,s])=>s.w>0&&byId[id])
    .sort((a,b)=>b[1].w-a[1].w||String(b[1].lw).localeCompare(String(a[1].lw))).map(([id])=>byId[id]);
}
function missView(){
  const items=missItems();
  if(!items.length)return `<div class="card"><p class="note">まだまちがえた問題はありません。△か×をつけると、ここに残ります。</p></div>`;
  const li=items.slice(0,100).map(q=>{const s=stats[q.id];return `<li>
    <span>${esc(q.ja)}</span>
    <span class="row"><span class="e">${esc(q.en)}</span>${canSpeak?spkBtn(q.en,"en","聞く"):""}</span>
    <span class="meta"><span class="j-ng" style="font-weight:900">まちがい ${s.w}回</span><span>○ ${s.c}回</span><span>さいご ${md(s.lw)}</span><span>${tags(q).join("・")}</span></span></li>`}).join("");
  return `
  <button class="btn" id="practiceMiss">まちがいが多い順に練習（20問）</button>
  <div class="card group"><div class="label">まちがえた問題（多い順・${items.length}問）</div><ul class="list">${li}</ul>
  <p class="note">「にがて」とちがい、○をとってもここからは消えません。何回まちがえたかが残ります。</p></div>`;
}

boot();
</script>
