import { createP2P } from "./p2p.js";
const $=id=>document.getElementById(id);
const setup=$("setupView"),chat=$("chat"),qr=$("qrCode"),paste=$("pasteCode"),messagesEl=$("messages"),composeView=$("composeView"),composeText=$("composeText"),composeButton=$("composeButton"),cancelButton=$("cancelComposeButton"),errorEl=$("error");
let connected=false,localCode="",stage="offer",composerOpen=false,messages=[],versions=[],peer,editorChart=null,activeChartKey=null;
const renderedCharts=[];
const chartInfo={
 avoidance:{title:"Avoidance",description:"Avoidance means not undertaking or abandoning a loss exposure. Examples include locating a facility outside a flood zone or withdrawing a product with dangerous side effects. It eliminates the exposure where feasible.",style:"radar"},
 lossPrevention:{title:"Loss prevention",description:"Loss prevention reduces the frequency of a particular loss. Examples include driver training, prohibiting alcohol or drug use while driving, and enforcing safety rules.",style:"line"},
 lossReduction:{title:"Loss reduction",description:"Loss reduction reduces the severity of a loss after it occurs. Examples include automatic sprinklers, first-aid equipment, and emergency response procedures.",style:"bar"},
 duplication:{title:"Duplication",description:"Duplication keeps backups or copies of important property or information available if the original is lost. Examples include spare tires and duplicate business records.",style:"doughnut"},
 separation:{title:"Separation",description:"Separation divides assets exposed to loss so one event cannot damage everything at once. For example, fire-resistant factory sections can prevent a fire spreading throughout a facility.",style:"polarArea"},
 diversification:{title:"Diversification",description:"Diversification spreads exposure across different parties, securities, suppliers, or transactions. Using several suppliers reduces dependence on one supplier.",style:"pie"}
};
function setError(v=""){errorEl.textContent=v;}
function setChartError(v=""){$("chartError").textContent=v;}
function chartConfig(c){
 const info=chartInfo[c.type]||chartInfo.avoidance,isCircular=["pie","doughnut","polarArea","radar"].includes(info.style);
 return {type:info.style,data:{labels:c.labels,datasets:[{label:c.title||info.title,data:c.values,borderWidth:2,tension:.25,backgroundColor:isCircular?["#1769e0","#4f9bd9","#75b99b","#e8b65b","#a58bd4","#e58b8b"]:"rgba(23,105,224,.65)",borderColor:"#1769e0"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:isCircular}},scales:isCircular?{}:{y:{beginAtZero:true}}}};
}
function render(){setup.hidden=connected;chat.hidden=!connected;composeView.hidden=!composerOpen;$("versionButton").hidden=composerOpen;composeButton.hidden=composerOpen;cancelButton.hidden=!composerOpen;$("connectionStatus").textContent=connected?"Connected":"Connecting…";renderMessages();}
function renderMessages(){
 while(renderedCharts.length)renderedCharts.pop().destroy();messagesEl.replaceChildren();
 for(const m of messages){
  const item=document.createElement("article");item.className="message "+(m.mine?"mine":"theirs");
  const meta=document.createElement("div");meta.className="message-meta";meta.textContent=(m.mine?"You":"Peer")+" · "+new Date(m.timestamp).toLocaleString();item.append(meta);
  if(m.kind==="risk-chart"&&m.chart){
   const card=document.createElement("div");card.className="chart-message";const h=document.createElement("h3");h.textContent=m.chart.title;card.append(h);
   if(m.chart.context){const p=document.createElement("p");p.className="chart-context";p.textContent=m.chart.context;card.append(p);}
   const canvas=document.createElement("canvas");canvas.setAttribute("role","img");canvas.setAttribute("aria-label",m.chart.title+" chart");card.append(canvas);item.append(card);
   try{renderedCharts.push(new Chart(canvas,chartConfig(m.chart)));}catch(e){const p=document.createElement("p");p.textContent="Chart display error: "+e.message;card.append(p);}
   if(m.caption){const p=document.createElement("p");p.className="message-caption";p.textContent=m.caption;item.append(p);}
  }else{const body=document.createElement("div");body.textContent=m.text||"";item.append(body);}
  messagesEl.append(item);
 }
 messagesEl.scrollTop=messagesEl.scrollHeight;
}
function receive(raw){
 let m;try{const d=JSON.parse(raw);if(d?.kind==="risk-chart"&&d.chart&&Array.isArray(d.chart.labels)&&Array.isArray(d.chart.values))m={kind:"risk-chart",chart:d.chart,caption:typeof d.caption==="string"?d.caption:"",timestamp:Number(d.timestamp)||Date.now(),mine:false};else if(d?.kind==="chat-message"&&typeof d.text==="string")m={kind:"text",text:d.text,timestamp:Number(d.timestamp)||Date.now(),mine:false};else m={kind:"text",text:String(raw),timestamp:Date.now(),mine:false};}catch{m={kind:"text",text:String(raw),timestamp:Date.now(),mine:false};}
 messages.push(m);renderMessages();
}
peer=createP2P({onMessage:receive,onLocalCode:(code,type)=>{localCode=code;stage=type;renderConnectionCode();},onConnectionState:s=>{connected=s.connected;render();},onError:setError});
function renderConnectionCode(){qr.replaceChildren();if(localCode&&typeof QRCode!=="undefined")new QRCode(qr,{text:localCode,width:260,height:260,correctLevel:QRCode.CorrectLevel.L});$("copyCode").textContent=stage==="answer"?"Copy Answer":"Copy Request";paste.hidden=stage==="answer";$("copyCode").hidden=!localCode;}
$("copyCode").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(localCode);$("copyCode").textContent="Copied";}catch{setError("Clipboard unavailable. Copy the connection code manually.");}});
async function processPaste(){const v=paste.value.trim();if(!v)return;try{await peer.processCode(v,stage);paste.value="";setError("");}catch(e){setError(e.message||"Could not process connection code.");}}
paste.addEventListener("paste",()=>setTimeout(processPaste,100));paste.addEventListener("input",()=>{if(paste.value.trim().endsWith("}"))processPaste();});
composeButton.addEventListener("click",()=>{composerOpen=true;setError("");render();});
cancelButton.addEventListener("click",()=>{composerOpen=false;composeText.value="";render();});
function readChartForm(){
 const labels=$("chartLabels").value.split(",").map(x=>x.trim()).filter(Boolean),raw=$("chartValues").value.split(",").map(x=>x.trim()).filter(Boolean);
 if(labels.length<2||labels.length>20)throw Error("Enter between 2 and 20 category labels.");
 if(raw.length!==labels.length)throw Error("Enter exactly one value for each category label.");
 const values=raw.map(Number);if(values.some(x=>!Number.isFinite(x)||x<0))throw Error("Values must be non-negative numbers.");
 const title=$("chartName").value.trim();if(!title)throw Error("Enter a chart title.");
 return {type:activeChartKey,title,context:$("chartContext").value.trim(),labels,values};
}
function updatePreview(){try{const c=readChartForm();setChartError("");if(editorChart)editorChart.destroy();editorChart=new Chart($("chartCanvas"),chartConfig(c));}catch(e){setChartError(e.message);if(editorChart){editorChart.destroy();editorChart=null;}}}
function openChartEditor(key){if(!chartInfo[key])return;activeChartKey=key;$("chartTitle").textContent=chartInfo[key].title+" chart";$("chartName").value=chartInfo[key].title+" — ";$("chartContext").value="";$("chartLabels").value="Category A, Category B, Category C";$("chartValues").value="60, 30, 10";setChartError("");$("chartDialog").hidden=false;updatePreview();}
document.querySelectorAll(".chart-tool").forEach(b=>b.addEventListener("click",()=>openChartEditor(b.dataset.chart)));
["chartName","chartContext","chartLabels","chartValues"].forEach(id=>$(id).addEventListener("input",updatePreview));
function closeDialog(d){d.hidden=true;if(d===$("chartDialog")&&editorChart){editorChart.destroy();editorChart=null;}}
document.querySelectorAll(".dialog-close").forEach(b=>b.addEventListener("click",()=>closeDialog(b.closest(".dialog"))));
document.querySelectorAll(".dialog").forEach(d=>d.addEventListener("click",e=>{if(e.target===d)closeDialog(d);}));
$("sendChartButton").addEventListener("click",()=>{
 if(!peer.isConnected()){setChartError("Connect to your peer before sending a chart.");return;}
 let chart;try{chart=readChartForm();}catch(e){setChartError(e.message);return;}
 const m={kind:"risk-chart",chart,caption:composeText.value.trim(),timestamp:Date.now()};
 try{peer.sendMessage(JSON.stringify(m));messages.push({...m,mine:true});composeText.value="";composerOpen=false;closeDialog($("chartDialog"));render();}catch(e){setChartError(e.message||"Chart could not be sent.");}
});
$("helpButton").addEventListener("click",()=>{const list=$("chartDescriptions");list.replaceChildren();for(const info of Object.values(chartInfo)){const a=document.createElement("article"),h=document.createElement("h3"),p=document.createElement("p");h.textContent=info.title;p.textContent=info.description;a.append(h,p);list.append(a);} $("helpDialog").hidden=false;});
document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".dialog").forEach(closeDialog);});
$("versionButton").addEventListener("click",()=>{$("versionPanel").hidden=!$("versionPanel").hidden;});$("closeVersionPanel").addEventListener("click",()=>$("versionPanel").hidden=true);
function download(data,name){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"})),a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);}
function renderVersions(){const list=$("versionsList");list.replaceChildren();versions.forEach(v=>{const row=document.createElement("div");row.className="version-entry";row.textContent=v.name+" · "+new Date(v.savedAt).toLocaleString();list.append(row);});}
$("saveVersionButton").addEventListener("click",()=>{versions.unshift({name:"Version "+(versions.length+1),savedAt:new Date().toISOString(),messages:messages.map(m=>({...m}))});renderVersions();});
$("exportChatsButton").addEventListener("click",()=>download({format:"hm-account-chat",version:2,messages},"hm-account-chats.json"));
$("importChatsButton").addEventListener("click",()=>$("chatFile").click());
$("chatFile").addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text());if(!Array.isArray(d.messages))throw Error("Invalid backup file.");messages=d.messages.filter(m=>m&&((m.kind==="risk-chart"&&m.chart&&Array.isArray(m.chart.labels)&&Array.isArray(m.chart.values))||typeof m.text==="string")).map(m=>({...m,mine:!!m.mine,timestamp:Number(m.timestamp)||Date.now()}));renderMessages();setError("");}catch(err){setError("Could not import: "+err.message);}finally{e.target.value="";}});
render();peer.createOffer();
