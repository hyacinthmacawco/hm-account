import { createP2P } from "./p2p.js";
const $=id=>document.getElementById(id);
const setup=$("setupView"),chat=$("chat"),qr=$("qrCode"),paste=$("pasteCode");
const messagesEl=$("messages"),composeView=$("composeView"),composeButton=$("composeButton"),errorEl=$("error");
let connected=false,chatStarted=false,localCode="",stage="offer",composerOpen=false,messages=[],pendingCharts=[],peer,chats=[],activeChatId=null;
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
function chatId(){return "chat-"+Date.now()+"-"+Math.random().toString(36).slice(2,8);}
function activeChat(){return chats.find(c=>c.id===activeChatId)||null;}
function syncActiveChat(){const c=activeChat();if(c)c.messages=messages;}
function startNewChat(){syncActiveChat();const c={id:chatId(),title:"New chat",createdAt:Date.now(),messages:[]};chats.unshift(c);activeChatId=c.id;messages=c.messages;chatStarted=true;composerOpen=false;pendingCharts=[];setError("");render();}
function renderChatList(){const list=$("chatList");list.replaceChildren();chats.forEach(c=>{const row=document.createElement("div");row.className="chat-list-item"+(c.id===activeChatId?" active":"");const label=document.createElement("button");label.type="button";label.className="chat-list-name";const first=c.messages?.find(m=>m.kind==="text"&&m.text)||c.messages?.find(m=>m.kind==="risk-chart");label.textContent=c.title||(first?.kind==="text"?first.text.slice(0,34):(first?.charts?.[0]?.title||first?.chart?.title||"New chat"));label.title=label.textContent;label.addEventListener("click",()=>{syncActiveChat();activeChatId=c.id;messages=c.messages||[];chatStarted=true;composerOpen=false;pendingCharts=[];$("chatMenu").hidden=true;render();});const edit=document.createElement("button");edit.type="button";edit.className="chat-list-action";edit.title="Rename chat";edit.setAttribute("aria-label","Rename chat");edit.innerHTML='<svg viewBox="0 0 24 24"><path d="m4 16-.8 4.8L8 20l11-11-4-4z"/><path d="m13.5 6.5 4 4"/></svg>';edit.addEventListener("click",()=>{const next=prompt("Chat name",c.title||label.textContent);if(next!==null&&next.trim()){c.title=next.trim();renderChatList();}});const remove=document.createElement("button");remove.type="button";remove.className="chat-list-action";remove.title="Remove chat";remove.setAttribute("aria-label","Remove chat");remove.innerHTML='<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg>';remove.addEventListener("click",()=>{if(!confirm("Remove this chat?"))return;const index=chats.findIndex(x=>x.id===c.id);chats.splice(index,1);if(activeChatId===c.id){const next=chats[0];activeChatId=next?.id||null;messages=next?.messages||[];if(!next)startNewChat();}render();});row.append(label,edit,remove);list.append(row);});}
function render(){setup.hidden=connected;$("topbar").hidden=!connected||!chatStarted;$("toolbar").hidden=!connected||!chatStarted;chat.hidden=!connected||!chatStarted;composeView.hidden=!composerOpen;$("cancelComposeButton").hidden=!composerOpen;composeButton.hidden=!connected||!chatStarted;composeButton.innerHTML=composerOpen?'<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>':'<svg viewBox="0 0 24 24"><path d="m4 20 4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z"/><path d="m14.5 6.5 3 3"/></svg>';composeButton.setAttribute("aria-label",composerOpen?"Send chart message":"Compose chart message");composeButton.title=composerOpen?"Send chart message":"Compose chart message";renderChatList();renderPendingCharts();renderMessages();}
function renderPendingCharts(){
 while(pendingChartInstances.length)pendingChartInstances.pop().destroy();const holder=$("pendingCharts");holder.replaceChildren();
 pendingCharts.forEach((c,i)=>{
  const card=document.createElement("article");card.className="pending-chart-card";const top=document.createElement("div");top.className="pending-chart-heading";const name=document.createElement("strong");name.textContent=chartInfo[c.type].title+(c.title?" — "+c.title:"");const actions=document.createElement("div");actions.className="pending-chart-actions";
  const action=(symbol,label,disabled,fn)=>{const b=document.createElement("button");b.type="button";b.textContent=symbol;b.title=label;b.setAttribute("aria-label",label);b.disabled=disabled;b.addEventListener("click",fn);return b;};
  actions.append(action("↑","Move chart up",i===0,()=>{[pendingCharts[i-1],pendingCharts[i]]=[pendingCharts[i],pendingCharts[i-1]];renderPendingCharts();}),action("↓","Move chart down",i===pendingCharts.length-1,()=>{[pendingCharts[i+1],pendingCharts[i]]=[pendingCharts[i],pendingCharts[i+1]];renderPendingCharts();}),action("×","Remove chart",false,()=>{pendingCharts.splice(i,1);renderPendingCharts();}));top.append(name,actions);
  const title=document.createElement("input");title.type="text";title.maxLength=100;title.placeholder="Chart title";title.value=c.title||"";title.setAttribute("aria-label","Chart title");
  const editor=document.createElement("div");editor.className="chart-data-fields";const status=document.createElement("p");status.className="chart-edit-error";status.setAttribute("role","status");const preview=document.createElement("div");preview.className="inline-chart-preview";const canvas=document.createElement("canvas");canvas.setAttribute("role","img");canvas.setAttribute("aria-label",chartInfo[c.type].title+" preview");preview.append(canvas);const datasets=c.config.data.datasets;
  const field=(value,placeholder,change,type="text")=>{const input=document.createElement("input");input.type=type;input.value=value??"";input.placeholder=placeholder;input.addEventListener("input",()=>change(type==="number"?(input.value===""?null:Number(input.value)):input.value));return input;};
  const update=()=>{try{if(!datasets.length||datasets.some(ds=>!ds.data?.length))throw Error("Each series must contain at least one data point.");const old=pendingChartInstances.find(x=>x.canvas===canvas);if(old){old.destroy();pendingChartInstances.splice(pendingChartInstances.indexOf(old),1);}pendingChartInstances.push(new Chart(canvas,chartConfig(c)));c.dataError=false;status.textContent="";}catch(err){c.dataError=true;status.textContent=err.message;}};
  title.addEventListener("input",()=>{c.title=title.value;if(c.type==="duplication")datasets[0].label=title.value;name.textContent=chartInfo[c.type].title+(c.title?" — "+c.title:"");update();});
  if(["avoidance","lossPrevention","lossReduction","separation"].includes(c.type)){
   const labels=c.config.data.labels||[],rows=document.createElement("div");rows.className="chart-data-rows";const head=document.createElement("div");head.className="chart-data-row chart-data-row-head";["Category",...datasets.map(ds=>ds.label||"Value")," "].forEach(t=>{const span=document.createElement("span");span.textContent=t;head.append(span);});rows.append(head);
   labels.forEach((_,index)=>{const row=document.createElement("div");row.className="chart-data-row";row.append(field(labels[index],c.type==="separation"?"Time period "+(index+1):"Exposure "+(index+1),v=>{labels[index]=v;update();}));datasets.forEach(ds=>row.append(field(ds.data[index],"Value",v=>{ds.data[index]=v;update();},"number")));row.append(action("×","Remove row",labels.length<=1,()=>{labels.splice(index,1);datasets.forEach(ds=>ds.data.splice(index,1));renderPendingCharts();}));rows.append(row);});
   rows.append(action("+","Add row",false,()=>{labels.push("");datasets.forEach(ds=>ds.data.push(null));renderPendingCharts();}));editor.append(rows);
  }else if(c.type==="duplication"){
   const ds=datasets[0],rows=document.createElement("div");rows.className="chart-data-rows";const head=document.createElement("div");head.className="chart-data-row chart-data-row-head";["Category","X value","Y value"," "].forEach(t=>{const span=document.createElement("span");span.textContent=t;head.append(span);});rows.append(head);
   ds.data.forEach((point,pi)=>{const row=document.createElement("div");row.className="chart-data-row duplication-row";row.append(field(point.category,"Duplicate "+(pi+1),v=>{point.category=v;update();}),field(point.x,"X value",v=>{point.x=v;update();},"number"),field(point.y,"Y value",v=>{point.y=v;update();},"number"),action("×","Remove row",ds.data.length<=1,()=>{ds.data.splice(pi,1);renderPendingCharts();}));rows.append(row);});
   rows.append(action("+","Add duplicate",false,()=>{ds.data.push({x:null,y:null,category:""});renderPendingCharts();}));editor.append(rows);
  }else if(c.type==="diversification"){
   datasets.forEach((ds,di)=>{const section=document.createElement("section");section.className="chart-series";section.append(field(ds.label,"Series "+(di+1),v=>{ds.label=v;update();}));const removeSeries=action("×","Remove series",datasets.length<=1,()=>{datasets.splice(di,1);renderPendingCharts();});removeSeries.className="chart-row-action";section.append(removeSeries);const rows=document.createElement("div");rows.className="chart-data-rows";const head=document.createElement("div");head.className="chart-data-row chart-data-row-head";["X value","Y value","Size"," "].forEach(t=>{const span=document.createElement("span");span.textContent=t;head.append(span);});rows.append(head);ds.data.forEach((point,pi)=>{const row=document.createElement("div");row.className="chart-data-row";["x","y","r"].forEach(k=>row.append(field(point[k],k==="r"?"Size":k.toUpperCase(),v=>{point[k]=v;update();},"number")));row.append(action("×","Remove point",ds.data.length<=1,()=>{ds.data.splice(pi,1);renderPendingCharts();}));rows.append(row);});section.append(rows);editor.append(section);});
   const addSeries=action("+","Add series",false,()=>{datasets.push({label:"",data:[{x:null,y:null,r:null}],backgroundColor:["#1769e0","#69a98b","#e8b65b","#a58bd4"][datasets.length%4]});renderPendingCharts();});addSeries.className="chart-row-action";editor.append(addSeries);
  }
  card.append(top,title,editor,status,preview);holder.append(card);update();
 });
}
function addChartToCompose(key){
 if(!chartInfo[key])return;
 pendingCharts.push({type:key,title:"",config:composerChartConfig(key)});
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
    const h=document.createElement("h3");h.textContent=c.title||chartInfo[c.type]?.title||"Risk chart";card.append(h);
    
    const canvas=document.createElement("canvas");canvas.setAttribute("role","img");canvas.setAttribute("aria-label",(c.title||"Risk")+" chart");card.append(canvas);item.append(card);
    try{renderedCharts.push(new Chart(canvas,c.config?chartConfig(c):legacyChartConfig(c)));}catch(e){const p=document.createElement("p");p.textContent="Chart display error: "+e.message;card.append(p);}
   }
   
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
  if(d?.kind==="risk-chart"&&incoming.length&&incoming.every(c=>c&&(c.config?.type||Array.isArray(c.labels))))m={kind:"risk-chart",charts:incoming,caption:typeof d.caption==="string"?d.caption:"",timestamp:Number(d.timestamp)||Date.now(),mine:false};
  else if(d?.kind==="chat-message"&&typeof d.text==="string")m={kind:"text",text:d.text,timestamp:Number(d.timestamp)||Date.now(),mine:false};
  else m={kind:"text",text:String(raw),timestamp:Date.now(),mine:false};
 }catch{m={kind:"text",text:String(raw),timestamp:Date.now(),mine:false};}
 messages.push(m);renderMessages();renderChatList();
}
peer=createP2P({
 onMessage:receive,
 onLocalCode:(code,type)=>{localCode=code;stage=type;renderConnectionCode();},
 onConnectionState:s=>{
  const was=connected;connected=s.connected;
  if(connected&&!was){chatStarted=false;composerOpen=false;pendingCharts=[];startNewChat();}
  if(!connected){chatStarted=false;composerOpen=false;$("chatMenu").hidden=true;}
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

$("newChatTopButton").addEventListener("click",startNewChat);
$("openChatButton").addEventListener("click",()=>$("loadChatFile").click());
$("chatMenuButton").addEventListener("click",()=>{$("chatMenu").hidden=!$("chatMenu").hidden;});
document.addEventListener("click",e=>{if(!$("chatMenu").contains(e.target)&&!$("chatMenuButton").contains(e.target))$("chatMenu").hidden=true;});
$("cancelComposeButton").addEventListener("click",()=>{composerOpen=false;setError("");render();});
$("loadChatFile").addEventListener("change",async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  const data=JSON.parse(await file.text());
  const validMessages=items=>items.filter(m=>m&&((m.kind==="risk-chart"&&(Array.isArray(m.charts)||m.chart))||typeof m.text==="string")).map(m=>({...m,mine:!!m.mine,timestamp:Number(m.timestamp)||Date.now()}));
  if(Array.isArray(data.chats)){chats=data.chats.filter(c=>c&&Array.isArray(c.messages)).map((c,i)=>({...c,id:c.id||chatId(),title:c.title||"Chat "+(i+1),messages:validMessages(c.messages)}));if(!chats.length)throw Error("No chats found in this file.");activeChatId=chats.some(c=>c.id===data.activeChatId)?data.activeChatId:chats[0].id;messages=activeChat().messages;}
  else if(Array.isArray(data.messages)){messages=validMessages(data.messages);chats=[{id:chatId(),title:"Imported chat",createdAt:Date.now(),messages}];activeChatId=chats[0].id;}
  else throw Error("Invalid chat file.");
  chatStarted=true;render();setError("");
 }catch(err){setError("Could not load chat: "+err.message);}
 finally{e.target.value="";}
});
$("saveChatButton").addEventListener("click",()=>{syncActiveChat();const data={format:"hm-account-chat",version:4,activeChatId,chats};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="hm-account-chats.json";a.click();URL.revokeObjectURL(url);});

composeButton.addEventListener("click",()=>{
 if(!composerOpen){composerOpen=true;setError("");render();return;}
 if(!pendingCharts.length){setError("Add at least one chart before sending.");return;}
 if(pendingCharts.some(c=>c.dataError)){setError("Fix the invalid chart data before sending.");return;}
 if(!peer.isConnected()){setError("Connection is not open.");return;}
 const message={kind:"risk-chart",charts:pendingCharts.map(c=>({...c,config:JSON.parse(JSON.stringify(c.config))})),timestamp:Date.now()};
 try{
  peer.sendMessage(JSON.stringify(message));messages.push({...message,mine:true});
  pendingCharts=[];composerOpen=false;setError("");render();
 }catch(e){setError(e.message||"Message could not be sent.");}
});
document.querySelectorAll(".chart-tool").forEach(b=>b.addEventListener("click",()=>addChartToCompose(b.dataset.chart)));
function closeDialog(d){d.hidden=true;if(d===$("helpDialog"))while(helpCharts.length)helpCharts.pop().destroy();}
document.querySelectorAll(".dialog-close").forEach(b=>b.addEventListener("click",()=>closeDialog(b.closest(".dialog"))));
document.querySelectorAll(".dialog").forEach(d=>d.addEventListener("click",e=>{if(e.target===d)closeDialog(d);}));
function composerChartConfig(key){
 const examples={
  avoidance:{type:"radar",data:{labels:["","",""],datasets:[{label:"Remaining exposure",data:[null,null,null],backgroundColor:"rgba(23,105,224,.2)",borderColor:"#1769e0"}]},options:{responsive:true,maintainAspectRatio:false}},
  lossPrevention:{type:"bar",data:{labels:[""],datasets:[{label:"Before",data:[null],backgroundColor:"#9bbce9"},{label:"After",data:[null],backgroundColor:"#1769e0"}]},options:{responsive:true,maintainAspectRatio:false}},
  lossReduction:{type:"doughnut",data:{labels:["",""],datasets:[{label:"Loss reduction",data:[null,null],backgroundColor:["#d65a5a","#1769e0"]}]},options:{responsive:true,maintainAspectRatio:false}},
  duplication:{type:"scatter",data:{datasets:[{label:"",data:[{x:null,y:null,category:""}],backgroundColor:"#1769e0"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:ctx=>ctx.raw.category||("("+ctx.raw.x+", "+ctx.raw.y+")")}}},scales:{x:{title:{display:true,text:"X value"}},y:{title:{display:true,text:"Y value"}}}}},
  separation:{type:"bar",data:{labels:[""],datasets:[{label:"Section 1",data:[null],backgroundColor:"#1769e0"},{label:"Section 2",data:[null],backgroundColor:"#8ab2e8"}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{stacked:true},y:{stacked:true}}}},
  diversification:{type:"bubble",data:{datasets:[{label:"",data:[{x:null,y:null,r:null}],backgroundColor:"#1769e0"},{label:"",data:[{x:null,y:null,r:null}],backgroundColor:"#69a98b"}]},options:{responsive:true,maintainAspectRatio:false}}
 };return examples[key];
}
function helpExampleConfig(key){
 const examples={
  avoidance:{type:"radar",data:{labels:["Flood exposure","Hazardous inventory","Unsafe location"],datasets:[{label:"Exposure eliminated",data:[85,70,95],backgroundColor:"rgba(23,105,224,.2)",borderColor:"#1769e0"}]},options:{responsive:true,maintainAspectRatio:false,scales:{r:{beginAtZero:true,max:100}}}},
  lossPrevention:{type:"bar",data:{labels:["Driver training","No alcohol or drugs","Safety rules"],datasets:[{label:"Before",data:[80,90,65],backgroundColor:"#9bbce9"},{label:"After",data:[35,20,30],backgroundColor:"#1769e0"}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true}}}},
  lossReduction:{type:"doughnut",data:{labels:["Fire damage","Sprinklers","First aid","Fire service"],datasets:[{label:"Loss severity share",data:[30,25,20,25],backgroundColor:["#d65a5a","#1769e0","#4f9b78","#e8b65b"]}]},options:{responsive:true,maintainAspectRatio:false}},
  duplication:{type:"scatter",data:{datasets:[{label:"Backup availability",data:[{x:10,y:20},{x:15,y:20},{x:50,y:40},{x:65,y:70}],backgroundColor:"#1769e0"}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{title:{display:true,text:"Storage location"}},y:{title:{display:true,text:"Availability"}}}}},
  separation:{type:"bar",data:{labels:["January","February","March"],datasets:[{label:"Section 1",data:[40,100,30],backgroundColor:"#1769e0"},{label:"Section 2",data:[20,50,10],backgroundColor:"#8ab2e8"}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{stacked:true},y:{stacked:true}}}},
  diversification:{type:"bubble",data:{datasets:[{label:"Stocks",data:[{x:20,y:10,r:7},{x:22,y:12,r:5}],backgroundColor:"#1769e0"},{label:"Bonds",data:[{x:50,y:40,r:4},{x:60,y:22,r:6}],backgroundColor:"#69a98b"}]},options:{responsive:true,maintainAspectRatio:false}}
 };return examples[key];
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
