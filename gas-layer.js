/* ---- スプレッドシートに保存（合言葉ごと） ---- */
const hasGas=typeof google!=="undefined"&&google.script&&google.script.run;
let me={name:store.get("eiken-pass",null)};
let queue=[], flushing=false, flushTimer=null, sync=hasGas?"loading":"local";
const K=k=>"eiken-"+k+"-"+(me.name||"");
function api(fn,...a){
  return new Promise((res,rej)=>{
    if(!hasGas)return rej(new Error("offline"));
    google.script.run.withSuccessHandler(res).withFailureHandler(rej)[fn](...a);
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
