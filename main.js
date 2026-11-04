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
function setVisible(element,visible){
 element.hidden=!visible;
 element.style.display=visible?"":"none";
}
function setError(v=""){
 errorEl.textContent=v;
 const workspaceError=$("workspaceError");
 if(workspaceError){workspaceError.textContent=v;setVisible(workspaceError,!!v&&connected);}
}
function syncChartTheme(){
 if(typeof Chart==="undefined")return;
 const styles=getComputedStyle(document.body);
 const ink=styles.getPropertyValue("--p-text-primary").trim();
 const separator=styles.getPropertyValue("--p-separator").trim();
 Chart.defaults.color=ink|| (matchMedia("(prefers-color-scheme: dark)").matches?"#f5f5f5":"#1a1a1a");
 Chart.defaults.borderColor=separator||(matchMedia("(prefers-color-scheme: dark)").matches?"rgba(255,255,255,.16)":"rgba(0,0,0,.12)");
 if(Chart.defaults.scale?.grid)Chart.defaults.scale.grid.color=Chart.defaults.borderColor;
}

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
function renderChatList(){
 const list=$("chatList");list.replaceChildren();
 chats.forEach(c=>{
  const row=document.createElement("div");row.className="p-sidebar-row";row.tabIndex=0;row.setAttribute("role","button");
  if(c.id===activeChatId){row.classList.add("p-selected");row.setAttribute("aria-current","page");}
  const icon=document.createElement("i");icon.className="p-sidebar-icon ph-bold ph-chat-circle";icon.setAttribute("aria-hidden","true");
  const title=document.createElement("span");title.textContent=c.title||"New chat";
  const edit=document.createElement("button");edit.type="button";edit.className="p-sidebar-touch__button";edit.title="Rename chat";edit.setAttribute("aria-label","Rename chat");edit.innerHTML='<i class="ph-bold ph-pencil-simple" aria-hidden="true"></i>';
  edit.addEventListener("click",event=>{event.stopPropagation();const next=prompt("Chat name",c.title||"New chat");if(next!==null&&next.trim()){c.title=next.trim();renderChatList();}});
  const remove=document.createElement("button");remove.type="button";remove.className="p-sidebar-touch__button";remove.title="Remove chat";remove.setAttribute("aria-label","Remove chat");remove.innerHTML='<i class="ph-bold ph-trash" aria-hidden="true"></i>';
  remove.addEventListener("click",event=>{event.stopPropagation();if(!confirm("Remove this chat?"))return;const index=chats.findIndex(x=>x.id===c.id);chats.splice(index,1);if(activeChatId===c.id){const next=chats[0];activeChatId=next?.id||null;messages=next?.messages||[];if(!next)startNewChat();}render();});
  const open=()=>{syncActiveChat();activeChatId=c.id;messages=c.messages||[];chatStarted=true;composerOpen=false;pendingCharts=[];setVisible($("chatMenu"),false);setError("");render();};
  row.addEventListener("click",open);
  row.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();open();}});
  row.append(icon,title,edit,remove);list.append(row);
 });
}
function render(){
 syncChartTheme();
 setVisible(setup,!connected);
 setVisible($("topbar"),connected&&chatStarted);
 setVisible($("workspace"),connected&&chatStarted);
 setVisible($("toolbar"),connected&&chatStarted);
 setVisible(chat,connected&&chatStarted&&!composerOpen);
 setVisible(composeView,connected&&chatStarted&&composerOpen);
 setVisible($("cancelComposeButton"),composerOpen&&connected&&chatStarted);
 setVisible(composeButton,connected&&chatStarted);
 setVisible($("chatMenu"),!$("chatMenu").hidden&&connected&&chatStarted);
 composeButton.innerHTML=composerOpen?'<i class="ph-bold ph-paper-plane-tilt" aria-hidden="true"></i>':'<i class="ph-bold ph-plus" aria-hidden="true"></i>';
 composeButton.setAttribute("aria-label",composerOpen?"Send charts":"Add chart");
 composeButton.title=composerOpen?"Send charts":"Add chart";
 renderChatList();renderPendingCharts();renderMessages();
}
function chartValidationError(chart){
 const data=chart?.config?.data;const datasets=data?.datasets||[];
 if(!datasets.length)return "Add at least one data series.";
 if(chart.type==="duplication"||chart.type==="diversification"){
  for(const ds of datasets){if(!Array.isArray(ds.data)||!ds.data.length)return "Each series needs at least one data point.";for(const point of ds.data){if(point.x===null||point.x===""||!Number.isFinite(Number(point.x)))return "Enter a numeric X value for every point.";if(point.y===null||point.y===""||!Number.isFinite(Number(point.y)))return "Enter a numeric Y value for every point.";if(chart.type==="diversification"&&(point.r===null||point.r===""||!Number.isFinite(Number(point.r))||Number(point.r)<=0))return "Enter a positive bubble size for every point.";}}
  return "";
 }
 const labels=data?.labels||[];if(!labels.length||labels.some(label=>!String(label).trim()))return "Enter a category for every row.";
 for(const ds of datasets){if(!Array.isArray(ds.data)||ds.data.length!==labels.length)return "Each series must have a value for every category.";if(ds.data.some(value=>value===null||value===""||!Number.isFinite(Number(value))))return "Enter a numeric value for every category.";}
 return "";
}
function renderPendingCharts(){
 while(pendingChartInstances.length)pendingChartInstances.pop().destroy();const holder=$("pendingCharts");holder.replaceChildren();
 pendingCharts.forEach((c,i)=>{
  const card=document.createElement("li");card.className="p-list-row chart-card";const top=document.createElement("div");top.className="p-list-label";const name=document.createElement("strong");name.textContent=chartInfo[c.type].title+(c.title?" — "+c.title:"");const actions=document.createElement("div");actions.className="p-container";
  const action=(symbol,label,disabled,fn)=>{const icons={"Move up":"ph-arrow-up","Move down":"ph-arrow-down","Remove chart":"ph-trash","Remove row":"ph-trash","Remove point":"ph-trash","Add row":"ph-plus","Add duplicate":"ph-plus","Remove series":"ph-trash","Add series":"ph-plus"};const b=document.createElement("button");b.type="button";b.className="p-button p-button-touch p-button-secondary p-button-icon-only";b.innerHTML=`<i class="ph-bold ${icons[label]||"ph-dots-three"}" aria-hidden="true"></i>`;b.title=label;b.setAttribute("aria-label",label);b.disabled=disabled;b.addEventListener("click",fn);return b;};
  actions.append(action("","Move up",i===0,()=>{[pendingCharts[i-1],pendingCharts[i]]=[pendingCharts[i],pendingCharts[i-1]];renderPendingCharts();}),action("","Move down",i===pendingCharts.length-1,()=>{[pendingCharts[i+1],pendingCharts[i]]=[pendingCharts[i],pendingCharts[i+1]];renderPendingCharts();}),action("","Remove chart",false,()=>{pendingCharts.splice(i,1);renderPendingCharts();}));top.append(name,actions);
  const title=document.createElement("input");title.type="text";title.className="p-field p-field-touch p-field-touch-filled chart-title-field";title.maxLength=100;title.placeholder="Chart title";title.value=c.title||"";title.setAttribute("aria-label","Chart title");
  const editor=document.createElement("div");editor.className="p-container chart-editor";const status=document.createElement("p");status.className="p-list-touch-footer";status.setAttribute("role","status");const preview=document.createElement("div");preview.className="p-container chart-preview";const canvas=document.createElement("canvas");canvas.setAttribute("role","img");canvas.setAttribute("aria-label",chartInfo[c.type].title+" preview");preview.append(canvas);const datasets=c.config.data.datasets;
  const field=(value,placeholder,change,type="text")=>{const input=document.createElement("input");input.className="p-field p-field-touch p-field-touch-filled";input.type=type;input.value=value??"";input.placeholder=placeholder;input.setAttribute("aria-label",placeholder);input.style.width="100%";input.style.minWidth="0";input.autocomplete="off";if(type==="number"){input.step="any";input.inputMode="decimal";}input.addEventListener("input",()=>change(type==="number"?(input.value===""?null:Number(input.value)):input.value));return input;};
  const update=()=>{const validation=chartValidationError(c);c.dataError=!!validation;status.textContent=validation;const old=pendingChartInstances.find(x=>x.canvas===canvas);if(old){old.destroy();pendingChartInstances.splice(pendingChartInstances.indexOf(old),1);}if(typeof Chart==="undefined"){if(!validation)status.textContent="Chart preview is unavailable, but the chart can still be sent.";return;}try{pendingChartInstances.push(new Chart(canvas,chartConfig(c)));}catch(err){if(!validation)status.textContent="Preview unavailable: "+err.message;}};
  title.addEventListener("input",()=>{c.title=title.value;if(c.type==="duplication")datasets[0].label=title.value;name.textContent=chartInfo[c.type].title+(c.title?" — "+c.title:"");update();});
  if(["avoidance","lossPrevention","lossReduction","separation"].includes(c.type)){
   const labels=c.config.data.labels||[],rows=document.createElement("div");rows.className="p-container chart-row-list";const head=document.createElement("div");head.className="p-list-touch-header chart-grid-head";["Category",...datasets.map(ds=>ds.label||"Value")," "].forEach(t=>{const span=document.createElement("span");span.textContent=t;head.append(span);});rows.append(head);
   labels.forEach((_,index)=>{const row=document.createElement("div");row.className="p-container chart-data-row";const fields=document.createElement("div");fields.className="p-field-group-touch chart-fields";fields.append(field(labels[index],c.type==="separation"?"Time period "+(index+1):"Exposure "+(index+1),v=>{labels[index]=v;update();}));datasets.forEach(ds=>fields.append(field(ds.data[index],"Value",v=>{ds.data[index]=v;update();},"number")));row.append(fields,action("","Remove row",labels.length<=1,()=>{labels.splice(index,1);datasets.forEach(ds=>ds.data.splice(index,1));renderPendingCharts();}));rows.append(row);});
   rows.append(action("","Add row",false,()=>{labels.push("");datasets.forEach(ds=>ds.data.push(null));renderPendingCharts();}));editor.append(rows);
  }else if(c.type==="duplication"){
   const ds=datasets[0],rows=document.createElement("div");rows.className="p-container chart-row-list";const head=document.createElement("div");head.className="p-list-touch-header chart-grid-head";["Category","X value","Y value"," "].forEach(t=>{const span=document.createElement("span");span.textContent=t;head.append(span);});rows.append(head);
   ds.data.forEach((point,pi)=>{const row=document.createElement("div");row.className="p-container chart-data-row";const fields=document.createElement("div");fields.className="p-field-group-touch chart-fields";fields.append(field(point.category,"Duplicate "+(pi+1),v=>{point.category=v;update();}),field(point.x,"X value",v=>{point.x=v;update();},"number"),field(point.y,"Y value",v=>{point.y=v;update();},"number"));row.append(fields,action("","Remove row",ds.data.length<=1,()=>{ds.data.splice(pi,1);renderPendingCharts();}));rows.append(row);});
   rows.append(action("","Add duplicate",false,()=>{ds.data.push({x:null,y:null,category:""});renderPendingCharts();}));editor.append(rows);
  }else if(c.type==="diversification"){
   datasets.forEach((ds,di)=>{const section=document.createElement("section");section.className="p-container chart-series";const seriesLabel=document.createElement("div");seriesLabel.className="p-field-group-touch chart-fields chart-series-label";seriesLabel.append(field(ds.label,"Series "+(di+1),v=>{ds.label=v;update();}));section.append(seriesLabel);const removeSeries=action("","Remove series",datasets.length<=1,()=>{datasets.splice(di,1);renderPendingCharts();});section.append(removeSeries);const rows=document.createElement("div");rows.className="p-container chart-row-list";const head=document.createElement("div");head.className="p-list-touch-header chart-grid-head";["Point","X value","Y value","Size"].forEach(t=>{const span=document.createElement("span");span.textContent=t;head.append(span);});rows.append(head);ds.data.forEach((point,pi)=>{const row=document.createElement("div");row.className="p-container chart-data-row";const fields=document.createElement("div");fields.className="p-field-group-touch chart-fields";["x","y","r"].forEach(k=>fields.append(field(point[k],k==="r"?"Size":k.toUpperCase(),v=>{point[k]=v;update();},"number")));row.append(fields,action("","Remove point",ds.data.length<=1,()=>{ds.data.splice(pi,1);renderPendingCharts();}));rows.append(row);});section.append(rows);editor.append(section);});
   const addSeries=action("","Add series",false,()=>{datasets.push({label:"",data:[{x:null,y:null,r:null}],backgroundColor:["#1769e0","#69a98b","#e8b65b","#a58bd4"][datasets.length%4]});renderPendingCharts();});addSeries.className="p-button p-button-touch p-button-secondary";editor.append(addSeries);
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
  const item=document.createElement("li");item.className="p-list-row";
  const label=document.createElement("div");label.className="p-list-label";const meta=document.createElement("time");meta.className="p-list-subtitle";meta.dateTime=new Date(m.timestamp).toISOString();meta.textContent=new Date(m.timestamp).toLocaleString();label.append(meta);item.append(label);
  const charts=m.kind==="risk-chart"?(m.charts?.length?m.charts:(m.chart?[m.chart]:[])):(m.kind==="chat-message"&&Array.isArray(m.charts)?m.charts:[]);
  if(charts.length){
   for(const c of charts){
    const card=document.createElement("section");card.className="p-container";
    const h=document.createElement("h3");h.textContent=c.title||chartInfo[c.type]?.title||"Risk chart";card.append(h);
    
    const canvas=document.createElement("canvas");canvas.setAttribute("role","img");canvas.setAttribute("aria-label",(c.title||"Risk")+" chart");card.append(canvas);item.append(card);
    try{renderedCharts.push(new Chart(canvas,c.config?chartConfig(c):legacyChartConfig(c)));}catch(e){const p=document.createElement("p");p.textContent="Chart display error: "+e.message;card.append(p);}
   }
   
  }
  messagesEl.append(item);
 }
 messagesEl.scrollTop=messagesEl.scrollHeight;
}
function receive(raw){
 let data;
 try{data=JSON.parse(raw);}catch{setError("Received an unsupported message.");return;}
 const incoming=data?.charts?.length?data.charts:(data?.chart?[data.chart]:[]);
 if(data?.kind!=="risk-chart"||!incoming.length||!incoming.every(c=>c&&(c.config?.type||Array.isArray(c.labels)))){
  setError("Received an unsupported message.");return;
 }
 const message={kind:"risk-chart",charts:incoming,timestamp:Number(data.timestamp)||Date.now(),mine:false};
 messages.push(message);setError("");renderMessages();renderChatList();
}
peer=createP2P({
 onMessage:receive,
 onLocalCode:(code,type)=>{localCode=code;stage=type;renderConnectionCode();},
 onConnectionState:s=>{
  const was=connected;connected=s.connected;
  if(connected&&!was){chatStarted=false;composerOpen=false;pendingCharts=[];startNewChat();}
  if(!connected){chatStarted=false;composerOpen=false;setVisible($("chatMenu"),false);}
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

$("openChatButton").addEventListener("click",()=>$("loadChatFile").click());
$("chatMenuButton").addEventListener("click",()=>{setVisible($("chatMenu"),$("chatMenu").style.display==="none");});
$("sidebarCloseButton").addEventListener("click",()=>setVisible($("chatMenu"),false));
$("sidebarNewChat").addEventListener("click",()=>{setVisible($("chatMenu"),false);startNewChat();});
document.addEventListener("click",e=>{if(!$("chatMenu").contains(e.target)&&!$("chatMenuButton").contains(e.target))setVisible($("chatMenu"),false);});
$("cancelComposeButton").addEventListener("click",()=>{composerOpen=false;setError("");render();});
$("loadChatFile").addEventListener("change",async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  const data=JSON.parse(await file.text());
  const validMessages=items=>items.filter(m=>m&&m.kind==="risk-chart"&&(Array.isArray(m.charts)||m.chart)).map(m=>({...m,mine:!!m.mine,timestamp:Number(m.timestamp)||Date.now()}));
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
 if(!peer.isConnected()){setError("The peer data channel is not open. Reconnect before sending.");return;}
 const invalid=pendingCharts.find(chart=>chartValidationError(chart));
 if(invalid){setError(chartValidationError(invalid));return;}
 const message={kind:"risk-chart",charts:pendingCharts.map(chart=>({...chart,config:JSON.parse(JSON.stringify(chart.config))})),timestamp:Date.now()};
 try{
  peer.sendMessage(JSON.stringify(message));
  messages.push({...message,mine:true});
  pendingCharts=[];composerOpen=false;setError("");render();
 }catch(error){setError("Could not send charts: "+(error?.message||"The connection failed."));}
});
$("composeView").addEventListener("click",event=>{
 const button=event.target.closest("[data-chart]");
 if(button&&$("composeView").contains(button))addChartToCompose(button.dataset.chart);
});
function closeDialog(d){if(d===$("helpDialog")||d===$("helpSheet"))while(helpCharts.length)helpCharts.pop().destroy();}
document.querySelectorAll(".dialog-close").forEach(b=>b.addEventListener("click",()=>closeDialog($("helpSheet"))));
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
  h.textContent=info.title;p.textContent=info.description;wrap.className="p-container";
  canvas.setAttribute("role","img");canvas.setAttribute("aria-label",info.title+" example chart");
  wrap.append(canvas);article.append(h,p,wrap);list.append(article);
  try{helpCharts.push(new Chart(canvas,helpExampleConfig(key)));}catch(e){const error=document.createElement("p");error.textContent="Example chart unavailable.";article.append(error);}
 }

});

render();
if(typeof RTCPeerConnection==="undefined"){setError("WebRTC is not supported in this browser.");}
else peer.createOffer();
if(typeof matchMedia==="function"){
 const appearance=matchMedia("(prefers-color-scheme: dark)");
 appearance.addEventListener?.("change",()=>{syncChartTheme();renderMessages();});
}
