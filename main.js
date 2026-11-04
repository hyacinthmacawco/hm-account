import { createP2P } from "./p2p.js";
const $=id=>document.getElementById(id);
const setup=$("setupView"),choice=$("chatChoice"),chat=$("chat"),qr=$("qrCode"),paste=$("pasteCode");
const messagesEl=$("messages"),composeView=$("composeView"),composeText=$("composeText"),composeButton=$("composeButton"),errorEl=$("error");
let connected=false,chatStarted=false,localCode="",stage="offer",composerOpen=false,messages=[],pendingCharts=[],peer;
const renderedCharts=[];
const pendingChartInstances=[];
let helpCharts=[];
const chartInfo={
 avoidance:{title:"Avoidance",description:"Avoidance means not undertaking or abandoning a loss exposure. Examples include locating a facility outside a flood zone or withdrawing a product with dangerous side effects. It eliminates the exposure where feasible.",style:"radar"},
 lossPrevention:{title:"Loss prevention",description:"Loss prevention reduces the frequency of a particular loss. Examples include driver training, prohibiting alcohol or drug use while driving, and enforcing safety rules.",style:"line"},
 lossReduction:{title:"Loss reduction",description:"Loss reduction reduces the severity of a loss after it occurs. Examples include automatic sprinklers, first-aid equipment, and emergency response procedures.",style:"bar"},
 duplication:{title:"Duplication",description:"Duplication keeps backups or copies of important property or information available if the original is lost. Examples include spare tires and duplicate business records.",style:"doughnut"},
 separation:{title:"Separation",description:"Separation divides assets exposed to loss so one event cannot damage everything at once. For example, fire-resistant factory sections can prevent a fire spreading throughout a facility.",style:"polarArea"},
 diversification:{title:"Diversification",description:"Diversification spreads exposure across different parties, securities, suppliers, or transactions. Using several suppliers reduces dependence on one supplier.",style:"pie"}
};
function setError(v=""){errorEl.textContent=v;}
function legacyChartConfig(c){
 const info=chartInfo[c.type]||chartInfo.avoidance;
 const circular=["pie","doughnut","polarArea","radar"].includes(info.style);
 return {type:info.style,data:{labels:c.labels,datasets:[{label:c.title||info.title,data:c.values,borderWidth:2,tension:.25,backgroundColor:circular?["#1769e0","#4f9bd9","#75b99b","#e8b65b","#a58bd4","#e58b8b"]:"rgba(23,105,224,.65)",borderColor:"#1769e0"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:circular}},scales:circular?{}:{y:{beginAtZero:true}}}};
}
function chartConfig(c){
 const config=JSON.parse(JSON.stringify(c.config));
 config.options={...(config.options||{}),responsive:true,maintainAspectRatio:false};
 return config;
}
function render(){
 setup.hidden=connected;
 choice.hidden=!connected||chatStarted;
 $("toolbar").hidden=!connected||!chatStarted;
 chat.hidden=!connected||!chatStarted;
 composeView.hidden=!composerOpen;
 $("saveChatButton").hidden=!connected||!chatStarted;
 $("saveChatButton").innerHTML=composerOpen?'<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>':'<svg viewBox="0 0 24 24"><path d="M5 3h12l4 4v14H3V3z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/></svg>';
 $("saveChatButton").setAttribute("aria-label",composerOpen?"Cancel compose":"Save chat");
 $("saveChatButton").title=composerOpen?"Cancel compose":"Save chat";
 composeButton.hidden=!connected||!chatStarted;
 composeButton.innerHTML=composerOpen?'<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>':'<svg viewBox="0 0 24 24"><path d="m4 20 4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z"/><path d="m14.5 6.5 3 3"/></svg>';
 composeButton.setAttribute("aria-label",composerOpen?"Send chart message":"Compose chart message");
 composeButton.title=composerOpen?"Send chart message":"Compose chart message";
 $("connectionStatus").textContent=connected?"Connected":"Connecting…";
 renderPendingCharts();renderMessages();
}
function renderPendingCharts(){
 while(pendingChartInstances.length)pendingChartInstances.pop().destroy();
 const holder=$("pendingCharts");holder.replaceChildren();
 pendingCharts.forEach((c,i)=>{
  const card=document.createElement("article");card.className="pending-chart-card";
  const top=document.createElement("div");top.className="pending-chart-heading";
  const name=document.createElement("strong");name.textContent=chartInfo[c.type].title+" — "+c.title;
  const actions=document.createElement("div");actions.className="pending-chart-actions";
  const makeAction=(label,title,disabled,fn)=>{const button=document.createElement("button");button.type="button";button.textContent=label;button.title=title;button.disabled=disabled;button.addEventListener("click",fn);return button;};
  actions.append(
   makeAction("↑","Move chart up",i===0,()=>{[pendingCharts[i-1],pendingCharts[i]]=[pendingCharts[i],pendingCharts[i-1]];renderPendingCharts();}),
   makeAction("↓","Move chart down",i===pendingCharts.length-1,()=>{[pendingCharts[i+1],pendingCharts[i]]=[pendingCharts[i],pendingCharts[i+1]];renderPendingCharts();}),
   makeAction("×","Remove chart",false,()=>{pendingCharts.splice(i,1);renderPendingCharts();})
  );
  top.append(name,actions);
  const title=document.createElement("input");title.type="text";title.maxLength=100;title.placeholder="Chart title";title.value=c.title;title.setAttribute("aria-label","Chart title");
  title.addEventListener("input",()=>{c.title=title.value;name.textContent=chartInfo[c.type].title+" — "+c.title;});
  const context=document.createElement("textarea");context.rows=2;context.placeholder="What does this chart represent?";context.value=c.context||"";context.setAttribute("aria-label","Chart context");
  context.addEventListener("input",()=>{c.context=context.value;});
  const dataLabel=document.createElement("label");dataLabel.className="chart-data-label";dataLabel.textContent="Edit chart data (JSON)";
  const data=document.createElement("textarea");data.className="chart-data-editor";data.rows=7;data.spellcheck=false;data.value=JSON.stringify(c.config.data,null,2);data.setAttribute("aria-label","Chart data JSON");
  const status=document.createElement("p");status.className="chart-edit-error";status.setAttribute("role","status");
  const preview=document.createElement("div");preview.className="inline-chart-preview";const canvas=document.createElement("canvas");canvas.setAttribute("role","img");canvas.setAttribute("aria-label",c.title+" preview");preview.append(canvas);
  let instance;
  try{instance=new Chart(canvas,chartConfig(c));pendingChartInstances.push(instance);}catch(e){status.textContent="Preview error: "+e.message;}
  data.addEventListener("change",()=>{
   try{const parsed=JSON.parse(data.value);if(!parsed||!Array.isArray(parsed.datasets))throw Error("Data must contain a datasets array.");c.config.data=parsed;c.dataError=false;status.textContent="";
    if(instance){instance.destroy();const idx=pendingChartInstances.indexOf(instance);if(idx>=0)pendingChartInstances.splice(idx,1);}
    instance=new Chart(canvas,chartConfig(c));pendingChartInstances.push(instance);
   }catch(e){c.dataError=true;status.textContent="Invalid chart data: "+e.message;}
  });
  card.append(top,title,context,dataLabel,data,status,preview);holder.append(card);
 });
}
function addChartToCompose(key){
 if(!chartInfo[key])return;
 pendingCharts.push({type:key,title:chartInfo[key].title,context:"",config:helpExampleConfig(key)});
 renderPendingCharts();
}
function renderMessages(){
 while(renderedCharts.length)renderedCharts.pop().destroy();
 messagesEl.replaceChildren();
 for(const m of messages){
  const item=document.createElement("article");item.className="message "+(m.mine?"mine":"theirs");
  const meta=document.createElement("div");meta.className="message-meta";meta.textContent=new Date(m.timestamp).toLocaleString();item.append(meta);
  const charts=m.kind==="risk-chart"?(m.charts?.length?m.charts:(m.chart?[m.chart]:[])):[];
  if(charts.length){
   for(const c of charts){
    const card=document.createElement("div");card.className="chart-message";
    const h=document.createElement("h3");h.textContent=c.title||"Risk chart";card.append(h);
    if(c.context){const p=document.createElement("p");p.className="chart-context";p.textContent=c.context;card.append(p);}
    const canvas=document.createElement("canvas");canvas.setAttribute("role","img");canvas.setAttribute("aria-label",(c.title||"Risk")+" chart");card.append(canvas);item.append(card);
    try{renderedCharts.push(new Chart(canvas,c.config?chartConfig(c):legacyChartConfig(c)));}catch(e){const p=document.createElement("p");p.textContent="Chart display error: "+e.message;card.append(p);}
   }
   if(m.caption){const p=document.createElement("p");p.className="message-caption";p.textContent=m.caption;item.append(p);}
  }else{const body=document.createElement("div");body.textContent=m.text||"";item.append(body);}
  messagesEl.append(item);
 }
 messagesEl.scrollTop=messagesEl.scrollHeight;
}
function receive(raw){
 let m;
 try{
  const d=JSON.parse(raw);
  const incoming=d?.charts?.length?d.charts:(d?.chart?[d.chart]:[]);
  if(d?.kind==="risk-chart"&&incoming.length&&incoming.every(c=>c&&Array.isArray(c.labels)&&Array.isArray(c.values)))m={kind:"risk-chart",charts:incoming,caption:typeof d.caption==="string"?d.caption:"",timestamp:Number(d.timestamp)||Date.now(),mine:false};
  else if(d?.kind==="chat-message"&&typeof d.text==="string")m={kind:"text",text:d.text,timestamp:Number(d.timestamp)||Date.now(),mine:false};
  else m={kind:"text",text:String(raw),timestamp:Date.now(),mine:false};
 }catch{m={kind:"text",text:String(raw),timestamp:Date.now(),mine:false};}
 messages.push(m);renderMessages();
}
peer=createP2P({
 onMessage:receive,
 onLocalCode:(code,type)=>{localCode=code;stage=type;renderConnectionCode();},
 onConnectionState:s=>{
  const was=connected;connected=s.connected;
  if(connected&&!was){chatStarted=false;composerOpen=false;pendingCharts=[];}
  if(!connected){chatStarted=false;composerOpen=false;}
  render();
 },
 onError:setError
});
function renderConnectionCode(){
 qr.replaceChildren();
 if(localCode){
  if(typeof QRCode!=="undefined"){
   try{new QRCode(qr,{text:localCode,width:260,height:260,correctLevel:QRCode.CorrectLevel.L});}
   catch(e){setError("Could not display the QR code: "+e.message);}
  }else{
   setError("QR library did not load. You can still copy the connection code.");
  }
 }
 $("copyCode").textContent=stage==="answer"?"Copy Answer":"Copy Request";
 paste.hidden=stage==="answer";$("copyCode").hidden=!localCode;
}
$("copyCode").addEventListener("click",async()=>{
 try{
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(localCode);
  else throw new Error("Clipboard API unavailable");
  $("copyCode").textContent="Copied";
 }catch{
  paste.hidden=false;paste.value=localCode;paste.focus();paste.select();
  setError("Copy is unavailable here. The connection code is selected below for manual copying.");
 }
});
async function processPaste(){
 const value=paste.value.trim();if(!value)return;
 try{await peer.processCode(value,stage);paste.value="";setError("");}
 catch(e){setError(e.message||"Could not process connection code.");}
}
paste.addEventListener("paste",()=>setTimeout(processPaste,100));
paste.addEventListener("input",()=>{if(paste.value.trim().endsWith("}"))processPaste();});

$("newChatButton").addEventListener("click",()=>{
 messages=[];pendingCharts=[];composeText.value="";chatStarted=true;setError("");render();
});
$("loadChatButton").addEventListener("click",()=>$("loadChatFile").click());
$("loadChatFile").addEventListener("change",async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  const data=JSON.parse(await file.text());
  if(!Array.isArray(data.messages))throw Error("Invalid chat file.");
  messages=data.messages.filter(m=>m&&((m.kind==="risk-chart"&&(Array.isArray(m.charts)||m.chart))||typeof m.text==="string")).map(m=>({...m,mine:!!m.mine,timestamp:Number(m.timestamp)||Date.now()}));
  chatStarted=true;render();setError("");
 }catch(err){setError("Could not load chat: "+err.message);}
 finally{e.target.value="";}
});
$("saveChatButton").addEventListener("click",()=>{
 if(composerOpen){
  composerOpen=false;pendingCharts=[];composeText.value="";setError("");render();return;
 }
 const data={format:"hm-account-chat",version:3,messages};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
 const a=document.createElement("a");a.href=url;a.download="hm-account-chat.json";a.click();URL.revokeObjectURL(url);
});

composeButton.addEventListener("click",()=>{
 if(!composerOpen){composerOpen=true;setError("");render();return;}
 if(!pendingCharts.length){setError("Add at least one chart before sending.");return;}
 if(pendingCharts.some(c=>c.dataError)){setError("Fix the invalid chart data before sending.");return;}
 if(!peer.isConnected()){setError("Connection is not open.");return;}
 const message={kind:"risk-chart",charts:pendingCharts.map(c=>({...c,labels:[...c.labels],values:[...c.values]})),caption:composeText.value.trim(),timestamp:Date.now()};
 try{
  peer.sendMessage(JSON.stringify(message));messages.push({...message,mine:true});
  pendingCharts=[];composeText.value="";composerOpen=false;setError("");render();
 }catch(e){setError(e.message||"Message could not be sent.");}
});
document.querySelectorAll(".chart-tool").forEach(b=>b.addEventListener("click",()=>addChartToCompose(b.dataset.chart)));
function closeDialog(d){d.hidden=true;if(d===$("helpDialog"))while(helpCharts.length)helpCharts.pop().destroy();}
document.querySelectorAll(".dialog-close").forEach(b=>b.addEventListener("click",()=>closeDialog(b.closest(".dialog"))));
document.querySelectorAll(".dialog").forEach(d=>d.addEventListener("click",e=>{if(e.target===d)closeDialog(d);}));
function helpExampleConfig(key){
 const examples={
  avoidance:{type:"radar",data:{labels:["Exposure 1","Exposure 2","Exposure 3"],datasets:[{label:"Remaining exposure",data:[1,10,5],backgroundColor:"rgba(23,105,224,.2)",borderColor:"#1769e0"}]},options:{responsive:true,maintainAspectRatio:false}},
  lossPrevention:{type:"bar",data:{labels:["Driver training","No alcohol or drugs","Safety rules"],datasets:[{label:"Before",data:[40,100,30],backgroundColor:"#9bbce9"},{label:"After",data:[20,50,10],backgroundColor:"#1769e0"}]},options:{responsive:true,maintainAspectRatio:false}},
  lossReduction:{type:"doughnut",data:{labels:["Fire damage","Sprinklers","First aid","Fire service"],datasets:[{data:[1,40,30,29],backgroundColor:["#d65a5a","#1769e0","#4f9b78","#e8b65b"]}]},options:{responsive:true,maintainAspectRatio:false}},
  duplication:{type:"scatter",data:{datasets:[{label:"Available spare tires",data:[{x:10,y:20},{x:15,y:20},{x:50,y:40}],backgroundColor:"#1769e0"}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{title:{display:true,text:"Storage location"}},y:{title:{display:true,text:"Availability"}}}}},
  separation:{type:"bar",data:{labels:["January","February","March"],datasets:[{label:"Section 1",data:[40,100,30],backgroundColor:"#1769e0"},{label:"Section 2",data:[20,50,10],backgroundColor:"#8ab2e8"}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{stacked:true},y:{stacked:true}}}},
  diversification:{type:"bubble",data:{datasets:[{label:"Stocks",data:[{x:20,y:10,r:7},{x:22,y:12,r:5}],backgroundColor:"#1769e0"},{label:"Bonds",data:[{x:50,y:40,r:4},{x:60,y:22,r:6}],backgroundColor:"#69a98b"}]},options:{responsive:true,maintainAspectRatio:false}}
 };
 return examples[key];
}
$("helpButton").addEventListener("click",()=>{
 const list=$("chartDescriptions");list.replaceChildren();
 while(helpCharts.length)helpCharts.pop().destroy();
 for(const [key,info] of Object.entries(chartInfo)){
  const article=document.createElement("article"),h=document.createElement("h3"),p=document.createElement("p"),wrap=document.createElement("div"),canvas=document.createElement("canvas");
  h.textContent=info.title;p.textContent=info.description;wrap.className="help-chart-wrap";
  canvas.setAttribute("role","img");canvas.setAttribute("aria-label",info.title+" example chart");
  wrap.append(canvas);article.append(h,p,wrap);list.append(article);
  try{helpCharts.push(new Chart(canvas,helpExampleConfig(key)));}catch(e){const error=document.createElement("p");error.textContent="Example chart unavailable.";article.append(error);}
 }
 $("helpDialog").hidden=false;
});
document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".dialog").forEach(closeDialog);});
render();
if(typeof RTCPeerConnection==="undefined"){setError("WebRTC is not supported in this browser.");}
else peer.createOffer();
