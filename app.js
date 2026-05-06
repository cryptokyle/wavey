const DATA_URL="./data/latest_obs.txt";
const LAND=window.GULF_LAND_GEOJSON||null;
const BORDERS=window.GULF_BORDERS_GEOJSON||null;
const THEMES=[["chart","Chart"],["nightwatch","Night"]];
const LABELS=[
  ["Texas",27.7,-96.1],["Louisiana",29.3,-91.6],["Florida",28.4,-84.1],
  ["Mexico",22.7,-96],["Cuba",22.4,-82.2],["Yucatan",21.1,-89.6]
];
const LON_MIN=-98,LON_MAX=-80,LAT_MIN=18,LAT_MAX=31.5;
const $=id=>document.getElementById(id);
const C=$("c"),ctx=C.getContext("2d"),tip=$("tip"),dropZone=$("dropZone");
let rows=[],rawText="",source="No data loaded",loadedAt=null,CW=800,CH=500,newest=null;
let theme=localStorage.getItem("theme")||"chart";
let VIEW={lonMin:LON_MIN,lonMax:LON_MAX,latMin:LAT_MIN,latMax:LAT_MAX,cos:Math.cos(((LAT_MIN+LAT_MAX)/2)*Math.PI/180)};

const miss=v=>v==null||v===""||v==="MM";
const num=v=>miss(v)?null:+v;
const m2ft=m=>m==null?null:m*3.28084;
const ms2kt=s=>s==null?null:s*1.94384;
const c2f=c=>c==null?null:c*9/5+32;
const pad=n=>String(n).padStart(2,"0");
const esc=s=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const css=name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function tzAbbrev(d){
  const part=new Intl.DateTimeFormat(undefined,{timeZoneName:"short"}).formatToParts(d).find(p=>p.type==="timeZoneName");
  return part?.value||"";
}
function fmtLocal(ms){
  if(ms==null) return "--";
  const d=new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${tzAbbrev(d)}`.trim();
}
function tempMode(){
  const t=$("tempUnits").value;
  if(t==="F"||t==="C") return t;
  return $("units").value==="imperial"?"F":"C";
}
function pColor(s){return s<6?"#60a5fa":s<8?"#34d399":s<10?"#fbbf24":s<12?"#fb7185":"#a78bfa";}
function waveText(m){
  if(m==null) return "--";
  const imp=$("units").value==="imperial",v=imp?m2ft(m):m;
  return `${v.toFixed(1)} ${imp?"ft":"m"}`;
}
function windText(ms){
  if(ms==null) return "--";
  const imp=$("units").value==="imperial",v=imp?ms2kt(ms):ms;
  return `${v.toFixed(1)} ${imp?"kt":"m/s"}`;
}
function tempText(c){
  if(c==null) return "--";
  const mode=tempMode(),v=mode==="F"?c2f(c):c;
  return `${v.toFixed(1)} ${mode==="F"?"degF":"degC"}`;
}
function dominantBand(s){
  if(s==null) return "--";
  if(s<6) return "< 6 s";
  if(s<8) return "6-8 s";
  if(s<10) return "8-10 s";
  if(s<12) return "10-12 s";
  return "12 s+";
}
function metric(id,val,sub){$(id).textContent=val;$(`${id}Sub`).textContent=sub;}
function setTheme(next){
  theme=next;document.documentElement.dataset.theme=next;localStorage.setItem("theme",next);
  $("theme").textContent=THEMES.find(t=>t[0]===next)?.[1]||"Theme";draw();
}
function setStatus(msg,tone="neutral",meta=""){
  const box=$("statusBox");
  box.className="statusBox";
  if(tone==="success") box.classList.add("success");
  if(tone==="warn") box.classList.add("warn");
  $("statusText").textContent=msg;
  $("statusMeta").innerHTML=meta||`Expected file: <code>${esc(DATA_URL.replace("./",""))}</code>`;
}

function computeView(){
  const mid=(LAT_MIN+LAT_MAX)/2,cos=Math.cos(mid*Math.PI/180),xSpan=(LON_MAX-LON_MIN)*cos;
  const latSpan=xSpan*(CH/CW);
  let latMin=Math.min(mid-latSpan/2,LAT_MIN),latMax=Math.max(mid+latSpan/2,LAT_MAX);
  VIEW={lonMin:LON_MIN,lonMax:LON_MAX,latMin,latMax,cos};
}
function proj(lat,lon){
  const x=((lon-VIEW.lonMin)*VIEW.cos)/((VIEW.lonMax-VIEW.lonMin)*VIEW.cos)*CW;
  const y=(1-(lat-VIEW.latMin)/(VIEW.latMax-VIEW.latMin))*CH;
  return [x,y];
}
function resize(){
  const r=C.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  CW=r.width;CH=r.height;C.width=Math.max(1,Math.round(CW*dpr));C.height=Math.max(1,Math.round(CH*dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);computeView();draw();
}

function buildRows(text){
  const set=new Set(($("stations").value||"").split(/[\s,]+/).filter(Boolean));
  return (text||"").split(/\r?\n/).filter(l=>l&&l[0]!=="#").map(l=>l.trim().split(/\s+/)).map(f=>{
    const yyyy=+f[3],mo=+f[4],dd=+f[5],hh=+f[6],mm=+f[7];
    return {
      stn:f[0],lat:num(f[1]),lon:num(f[2]),
      t:Number.isFinite(yyyy)&&Number.isFinite(mo)&&Number.isFinite(dd)&&Number.isFinite(hh)&&Number.isFinite(mm)?Date.UTC(yyyy,mo-1,dd,hh,mm):null,
      wdir:num(f[8]),wspd:num(f[9]),gst:num(f[10]),wvht:num(f[11]),dpd:num(f[12]),apd:num(f[13]),mwd:num(f[14]),atmp:num(f[17]),wtmp:num(f[18])
    };
  }).filter(p=>p.lat!=null&&p.lon!=null&&p.lon>=LON_MIN&&p.lon<=LON_MAX&&p.lat>=LAT_MIN&&p.lat<=LAT_MAX).filter(p=>!set.size||set.has(p.stn));
}
function refreshStatus(){
  const times=rows.map(r=>r.t).filter(t=>t!=null);
  newest=times.length?Math.max(...times):null;
  const oldest=times.length?Math.min(...times):null;
  const meta=[`Source: <code>${esc(source)}</code>`,loadedAt?`Loaded: ${esc(fmtLocal(loadedAt))}`:""].filter(Boolean).join(" | ");
  if(!rawText){setStatus("Waiting for a local or imported snapshot.","neutral",meta||`Expected file: <code>${esc(DATA_URL.replace("./",""))}</code>`);return;}
  if(!rows.length){setStatus(($("stations").value||"").trim()?"Snapshot loaded, but no stations matched the current filter.":"Snapshot loaded, but no Gulf stations were found in view.","warn",meta);return;}
  setStatus(`${rows.length} Gulf stations loaded from ${source}.`,"success",`${meta} | Obs range: ${esc(fmtLocal(oldest))} to ${esc(fmtLocal(newest))}`);
}
function updateBadges(){
  if(!rows.length){
    const snap=rawText?"Loaded":"Waiting",src=rawText?esc(source):LAND?"Bundled":"Missing";
    $("badges").innerHTML=`<div class="chip"><span class="chipLabel">Mode</span><span class="chipValue">Static</span></div><div class="chip"><span class="chipLabel">Snapshot</span><span class="chipValue">${snap}</span></div><div class="chip"><span class="chipLabel">${rawText?"Source":"Coastlines"}</span><span class="chipValue">${src}</span></div>`;
    return;
  }
  const report=rows.filter(r=>r.wvht!=null),avg=report.length?report.reduce((a,r)=>a+r.wvht,0)/report.length:null;
  const periods=rows.filter(r=>r.dpd!=null).map(r=>r.dpd),avgP=periods.length?periods.reduce((a,v)=>a+v,0)/periods.length:null;
  $("badges").innerHTML=`<div class="chip"><span class="chipLabel">Stations</span><span class="chipValue">${rows.length}</span></div><div class="chip"><span class="chipLabel">Wave reports</span><span class="chipValue">${report.length}</span></div><div class="chip"><span class="chipLabel">Avg wave</span><span class="chipValue">${esc(waveText(avg))}</span></div><div class="chip"><span class="chipLabel">Period band</span><span class="chipValue">${esc(dominantBand(avgP))}</span></div><div class="chip"><span class="chipLabel">Freshest obs</span><span class="chipValue">${esc(fmtLocal(newest))}</span></div>`;
}
function updateMetrics(){
  if(!rows.length){
    const sub=rawText?"No stations in current view or filter":"Waiting for data";
    metric("mStations",rawText?"0":"--",sub);metric("mWaves",rawText?"0":"--",rawText?"No active observations":"Active observations");metric("mMaxWave","--","Peak sea state");metric("mAvgWave","--","Across reporting stations");
    metric("mWind","--","Fastest sustained wind");metric("mWater","--","Surface water temp");metric("mFresh","--","Newest station timestamp");metric("mOld","--","Earliest station timestamp");return;
  }
  const report=rows.filter(r=>r.wvht!=null),waves=report.map(r=>r.wvht),times=rows.map(r=>r.t).filter(t=>t!=null).sort((a,b)=>a-b);
  const maxWave=waves.length?Math.max(...waves):null,avgWave=waves.length?waves.reduce((a,v)=>a+v,0)/waves.length:null;
  const strong=rows.filter(r=>r.wspd!=null).sort((a,b)=>b.wspd-a.wspd)[0],warm=rows.filter(r=>r.wtmp!=null).sort((a,b)=>b.wtmp-a.wtmp)[0];
  metric("mStations",String(rows.length),"Within the Gulf window");
  metric("mWaves",String(report.length),`${report.length?Math.round(report.length/rows.length*100):0}% with WVHT`);
  metric("mMaxWave",waveText(maxWave),maxWave!=null?"Largest reported wave height":"No wave heights reported");
  metric("mAvgWave",waveText(avgWave),avgWave!=null?"Average across WVHT stations":"No wave heights reported");
  metric("mWind",strong?windText(strong.wspd):"--",strong?`Station ${strong.stn}`:"No wind readings reported");
  metric("mWater",warm?tempText(warm.wtmp):"--",warm?`Station ${warm.stn}`:"No water temps reported");
  metric("mFresh",times.length?fmtLocal(times[times.length-1]):"--",times.length?"Latest station timestamp":"No timestamps reported");
  metric("mOld",times.length?fmtLocal(times[0]):"--",times.length?"Earliest station timestamp":"No timestamps reported");
}
function updatePeriods(){
  const out=[]; for(let lon=LON_MIN;lon<LON_MAX;lon+=0.36){const seg=rows.filter(r=>r.dpd!=null&&r.lon>=lon&&r.lon<lon+.36); if(seg.length) out.push({lon,avg:seg.reduce((a,r)=>a+r.dpd,0)/seg.length,count:seg.length});}
  $("periods").innerHTML=out.map(b=>`<span class="bin" style="background:${pColor(b.avg)}" title="${b.count} stations">${Math.abs(b.lon).toFixed(1)}W ${b.avg.toFixed(1)}s</span>`).join("");
  $("legend").innerHTML=`<span class="sw"><i style="background:#60a5fa"></i>Below 6 s</span><span class="sw"><i style="background:#34d399"></i>6-8 s</span><span class="sw"><i style="background:#fbbf24"></i>8-10 s</span><span class="sw"><i style="background:#fb7185"></i>10-12 s</span><span class="sw"><i style="background:#a78bfa"></i>12 s and above</span><span class="sw"><i style="background:rgba(255,255,255,.72);width:18px;height:18px;border-radius:999px"></i>Marker size = wave height</span>`;
}
function applyText(){rows=buildRows(rawText);refreshStatus();updateBadges();updateMetrics();updatePeriods();draw();}
function setText(text,nextSource){rawText=text||"";source=nextSource||"Imported snapshot";loadedAt=Date.now();applyText();}

function drawPolys(geo,fill,stroke){
  const feats=geo?.type==="FeatureCollection"?geo.features:[]; ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=1.15; ctx.lineJoin="round";
  for(const f of feats){
    const g=f?.geometry,polys=g?.type==="Polygon"?[g.coordinates]:g?.type==="MultiPolygon"?g.coordinates:null; if(!polys) continue;
    for(const poly of polys){
      ctx.beginPath();
      for(const ring of poly){ ring.forEach((pt,i)=>{const [x,y]=proj(pt[1],pt[0]); i?ctx.lineTo(x,y):ctx.moveTo(x,y);}); ctx.closePath(); }
      ctx.fill("evenodd"); ctx.stroke();
    }
  }
}
function drawLines(geo,stroke){
  const feats=geo?.type==="FeatureCollection"?geo.features:[]; ctx.strokeStyle=stroke; ctx.lineWidth=1.05; ctx.lineJoin="round";
  for(const f of feats){
    const g=f?.geometry,lines=g?.type==="LineString"?[g.coordinates]:g?.type==="MultiLineString"?g.coordinates:null; if(!lines) continue;
    for(const line of lines){ ctx.beginPath(); line.forEach((pt,i)=>{const [x,y]=proj(pt[1],pt[0]); i?ctx.lineTo(x,y):ctx.moveTo(x,y);}); ctx.stroke(); }
  }
}
function drawGraticule(){
  ctx.save(); ctx.globalAlpha=.22; ctx.strokeStyle=css("--line2")||"#8fb5c0"; ctx.lineWidth=1;
  for(let lon=Math.ceil(VIEW.lonMin/2)*2;lon<=VIEW.lonMax;lon+=2){
    const [x0,y0]=proj(VIEW.latMin,lon),[x1,y1]=proj(VIEW.latMax,lon);
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
    ctx.globalAlpha=.7; ctx.fillStyle=css("--muted")||"#5a7586"; ctx.font='11px "Avenir Next","Segoe UI Variable Text","Trebuchet MS",sans-serif'; ctx.fillText(`${Math.abs(lon)}W`,x0+5,CH-8); ctx.globalAlpha=.22;
  }
  for(let lat=Math.ceil(VIEW.latMin/2)*2;lat<=VIEW.latMax;lat+=2){
    const [x0,y0]=proj(lat,VIEW.lonMin),[x1,y1]=proj(lat,VIEW.lonMax);
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
    ctx.globalAlpha=.7; ctx.fillStyle=css("--muted")||"#5a7586"; ctx.font='11px "Avenir Next","Segoe UI Variable Text","Trebuchet MS",sans-serif'; ctx.fillText(`${lat.toFixed(0)}N`,7,y0-5); ctx.globalAlpha=.22;
  }
  ctx.restore();
}
function drawLabels(){
  ctx.save(); ctx.fillStyle=css("--label")||"rgba(22,51,70,.62)"; ctx.font='600 13px "Avenir Next","Segoe UI Variable Text","Trebuchet MS",sans-serif'; ctx.textAlign="center";
  LABELS.forEach(([text,lat,lon])=>{ const [x,y]=proj(lat,lon); if(x>=0&&x<=CW&&y>=0&&y<=CH) ctx.fillText(text,x,y); });
  ctx.restore();
}
function radius(p){ return Math.max(3,Math.min(18,(p.wvht||0)*5.5)); }
function drawStations(){
  rows.forEach(p=>{
    const [x,y]=proj(p.lat,p.lon),r=radius(p),col=p.dpd==null?"#93c5fd":pColor(p.dpd);
    const age=newest!=null&&p.t!=null?Math.max(0,(newest-p.t)/3600000):0,alpha=age>6?.55:.92;
    ctx.save(); ctx.globalAlpha=.18*alpha; ctx.beginPath(); ctx.fillStyle="#fff"; ctx.arc(x,y,r+5,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=alpha; ctx.beginPath(); ctx.fillStyle=col; ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; ctx.lineWidth=1.4; ctx.strokeStyle="rgba(8,19,26,.72)"; ctx.stroke();
    ctx.beginPath(); ctx.fillStyle="rgba(255,255,255,.82)"; ctx.arc(x,y,Math.max(1.6,r*.25),0,Math.PI*2); ctx.fill(); ctx.restore();
  });
}
function drawEmpty(){
  ctx.save(); ctx.textAlign="center"; ctx.fillStyle="rgba(255,255,255,.96)"; ctx.font='700 26px "Segoe UI Variable Display","Avenir Next","Trebuchet MS",sans-serif'; ctx.fillText("No observation snapshot loaded",CW/2,CH/2-10);
  ctx.fillStyle="rgba(255,255,255,.78)"; ctx.font='14px "Avenir Next","Segoe UI Variable Text","Trebuchet MS",sans-serif';
  ctx.fillText(location.protocol==="file:"?"Import a NOAA text file, or host this folder statically to auto-load data/latest_obs.txt.":"Reload the local snapshot or drag in a fresh NOAA text file.",CW/2,CH/2+18); ctx.restore();
}
function draw(){
  ctx.clearRect(0,0,CW,CH);
  const grad=ctx.createLinearGradient(0,0,0,CH); grad.addColorStop(0,css("--seaA")||"#d9f5fb"); grad.addColorStop(.55,css("--seaB")||"#7cc7dc"); grad.addColorStop(1,css("--seaC")||"#0b5472");
  ctx.fillStyle=grad; ctx.fillRect(0,0,CW,CH);
  const glow=ctx.createRadialGradient(CW*.78,CH*.1,0,CW*.78,CH*.1,CH*.8); glow.addColorStop(0,"rgba(255,255,255,.18)"); glow.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=glow; ctx.fillRect(0,0,CW,CH);
  drawGraticule();
  if(LAND) drawPolys(LAND,css("--land")||"#e8dbc0",css("--landStroke")||"#917f61");
  if(BORDERS) drawLines(BORDERS,css("--line2")||"#8fb5c0");
  drawLabels();
  rows.length?drawStations():drawEmpty();
}

async function loadSnapshot(){
  if(location.protocol==="file:"){
    setStatus("Direct file mode detected. Auto-loading local text files is limited here.","warn",`Use Import File or drag in a snapshot. Expected file when hosted: <code>${esc(DATA_URL.replace("./",""))}</code>`);
    return;
  }
  setStatus("Loading local snapshot...","neutral",`Reading <code>${esc(DATA_URL.replace("./",""))}</code>`);
  try{
    const r=await fetch(DATA_URL,{cache:"no-store"});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    setText(await r.text(),"Local snapshot");
  }catch{
    setStatus("Could not read the local snapshot file.","warn",`Expected <code>${esc(DATA_URL.replace("./",""))}</code>. Import a NOAA text file instead.`);
    if(!rows.length){ updateBadges(); updateMetrics(); updatePeriods(); draw(); }
  }
}
async function importFile(file){
  if(!file) return;
  setText(await file.text(),file.name||"Imported file");
  $("t").value="";
}
function clearData(){
  rawText=""; source="No data loaded"; loadedAt=null; rows=[]; newest=null; $("t").value="";
  refreshStatus(); updateBadges(); updateMetrics(); updatePeriods(); draw();
}
function showTip(p,x,y){
  const imp=$("units").value==="imperial",mode=tempMode();
  const wv=imp?m2ft(p.wvht):p.wvht,wind=imp?ms2kt(p.wspd):p.wspd,gust=imp?ms2kt(p.gst):p.gst,water=mode==="F"?c2f(p.wtmp):p.wtmp,air=mode==="F"?c2f(p.atmp):p.atmp;
  tip.innerHTML=`<b>Station ${esc(p.stn)}</b><span class="muted">Obs (local):</span> ${esc(fmtLocal(p.t))}<br><span class="muted">WVHT:</span> ${wv==null?"--":wv.toFixed(1)} ${imp?"ft":"m"} <span class="muted">DPD:</span> ${p.dpd==null?"--":p.dpd.toFixed(1)} s<br><span class="muted">Wind:</span> ${wind==null?"--":wind.toFixed(1)} ${imp?"kt":"m/s"}${p.wdir==null?"":` @ ${p.wdir.toFixed(0)} deg`}${gust==null?"":` (gust ${gust.toFixed(1)})`}<br><span class="muted">Water:</span> ${water==null?"--":water.toFixed(1)} ${mode==="F"?"degF":"degC"} <span class="muted">Air:</span> ${air==null?"--":air.toFixed(1)} ${mode==="F"?"degF":"degC"}`;
  tip.style.left=`${x+12}px`; tip.style.top=`${y+12}px`; tip.style.display="block";
}
function bind(){
  window.addEventListener("resize",resize,{passive:true});
  $("theme").onclick=()=>setTheme(theme==="chart"?"nightwatch":"chart");
  $("reload").onclick=loadSnapshot; $("reloadAside").onclick=loadSnapshot;
  $("importBtn").onclick=()=>$("filePicker").click();
  $("filePicker").onchange=async e=>{ await importFile(e.target.files[0]); e.target.value=""; };
  $("clearData").onclick=clearData;
  $("applyFilter").onclick=()=>rawText&&applyText();
  $("resetFilter").onclick=()=>{ $("stations").value=""; rawText&&applyText(); };
  $("stations").onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); rawText&&applyText(); } };
  $("parse").onclick=()=>{ const text=$("t").value.trim(); if(text) setText(text,"Pasted text"); };
  $("units").onchange=()=>{ updateBadges(); updateMetrics(); draw(); };
  $("tempUnits").onchange=()=>{ updateMetrics(); draw(); };
  C.addEventListener("mousemove",e=>{
    if(!rows.length){ tip.style.display="none"; return; }
    const r=C.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top; let best=null,bd=1e9;
    for(const p of rows){ const [x,y]=proj(p.lat,p.lon),d=(x-mx)**2+(y-my)**2; if(d<bd){ bd=d; best=p; } }
    if(!best||bd>650){ tip.style.display="none"; return; }
    showTip(best,e.clientX,e.clientY);
  });
  C.addEventListener("mouseleave",()=>tip.style.display="none");
  ["dragenter","dragover"].forEach(type=>document.addEventListener(type,e=>{ e.preventDefault(); dropZone.classList.add("dragging"); }));
  ["dragleave","dragend","drop"].forEach(type=>document.addEventListener(type,e=>{ e.preventDefault(); if(type!=="drop") dropZone.classList.remove("dragging"); }));
  dropZone.addEventListener("drop",async e=>{ dropZone.classList.remove("dragging"); await importFile(e.dataTransfer?.files?.[0]); });
}
function boot(){
  setTheme(theme); resize(); updateBadges(); updateMetrics(); updatePeriods(); bind();
  if(!LAND) setStatus("Bundled coastline data is missing.","warn","Check <code>data/gulf-map-data.js</code>.");
  loadSnapshot();
}
boot();
