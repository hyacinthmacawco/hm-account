import { createP2P } from "./p2p.js";

const $ = id => document.getElementById(id);
const setup=$("setupView"), chat=$("chat"), qr=$("qrCode"), paste=$("pasteCode");
const messagesEl=$("messages"), composeView=$("composeView"), composeText=$("composeText");
const composeButton=$("composeButton"), composeSend=$("composeSend"), cancelButton=$("cancelComposeButton");
const errorEl=$("error");
let connected=false, localCode="", stage="offer", composerOpen=false, messages=[], versions=[];
let peer;

const chartInfo={
 avoidance:{title:"Avoidance",description:"Avoidance means never acquiring or undertaking a loss exposure, or abandoning an existing exposure. For example, locating a new plant on high ground to avoid flood risk, or withdrawing a product with dangerous side effects. Its main advantage is eliminating the exposure; its limitations are that some losses cannot be avoided and avoidance may be impractical."},
 lossPrevention:{title:"Loss prevention",description:"Loss prevention consists of measures that reduce the frequency of a particular loss. Examples include driver training, prohibiting alcohol or drug use while driving, and enforcing safety rules to reduce vehicle accidents."},
 lossReduction:{title:"Loss reduction",description:"Loss reduction consists of measures that reduce the severity of a loss after it occurs. Examples include automatic fire-sprinkler systems, first-aid equipment, and emergency response procedures."},
 duplication:{title:"Duplication",description:"Duplication means keeping backups or copies of important property or information so they remain available if the original is lost. Examples include spare tires and duplicate business records."},
 separation:{title:"Separation",description:"Separation means dividing assets exposed to loss so that one event cannot damage everything at once. For example, dividing a factory into fire-resistant sections can prevent a fire in one section from spreading throughout the facility."},
 diversification:{title:"Diversification",description:"Diversification reduces exposure by spreading it across different parties, securities, suppliers, or transactions. For example, using several suppliers reduces dependence on a single supplier."}
};
let activeChart=null;
let chartInstance=null;
function setError(message=""){errorEl.textContent=message;}
function render(){
 setup.hidden=connected; chat.hidden=!connected; composeView.hidden=!composerOpen;
 $("versionButton").hidden=composerOpen; composeButton.hidden=composerOpen;
 cancelButton.hidden=!composerOpen; composeSend.hidden=!composerOpen;
 renderMessages();
}
function renderMessages(){
 messagesEl.replaceChildren();
 for(const message of messages){
  const item=document.createElement("article"); item.className="message "+(message.mine?"mine":"theirs");
  const meta=document.createElement("div");meta.className="message-meta";
  meta.textContent=(message.mine?"You":"Peer")+" · "+new Date(message.timestamp).toLocaleString();
  const body=document.createElement("div");body.textContent=message.text;
  item.append(meta,body);messagesEl.append(item);
 }
 messagesEl.scrollTop=messagesEl.scrollHeight;
}
function receive(payload){
 let text=payload, timestamp=Date.now();
 try{const data=JSON.parse(payload);if(data&&data.kind==="chat-message"&&typeof data.text==="string"){text=data.text;timestamp=Number(data.timestamp)||timestamp;}}catch{}
 messages.push({text:String(text),timestamp,mine:false});renderMessages();
}
peer=createP2P({
 onMessage:receive,
 onLocalCode:(code,type)=>{localCode=code;stage=type;renderConnectionCode();},
 onConnectionState:state=>{connected=state.connected;render();},
 onError:setError
});
function renderConnectionCode(){
 qr.replaceChildren();
 if(localCode&&typeof QRCode!=="undefined"){
  new QRCode(qr,{text:localCode,width:260,height:260,correctLevel:QRCode.CorrectLevel.L});
 }
 $("copyCode").textContent=stage==="answer"?"Copy Answer":"Copy Request";
 paste.hidden=stage==="answer";
 $("copyCode").hidden=!localCode;
}
$("copyCode").addEventListener("click",async()=>{
 try{await navigator.clipboard.writeText(localCode);$("copyCode").textContent="Copied";}
 catch{setError("Clipboard unavailable. Copy the connection code manually.");}
});
async function processPaste(){
 const value=paste.value.trim();if(!value)return;
 try{await peer.processCode(value,stage);paste.value="";setError("");}
 catch(error){setError(error.message||"Could not process connection code.");}
}
paste.addEventListener("paste",()=>setTimeout(processPaste,100));
paste.addEventListener("input",()=>{if(paste.value.trim().endsWith("}"))processPaste();});
composeButton.addEventListener("click",()=>{composerOpen=true;setError("");render();composeText.focus();});
cancelButton.addEventListener("click",()=>{composerOpen=false;render();});
function sendMessage(){
 const text=composeText.value.trim();if(!text)return;
 if(!peer.isConnected()){setError("The peer is not connected.");return;}
 const timestamp=Date.now();
 try{
  peer.sendMessage(JSON.stringify({kind:"chat-message",text,timestamp}));
  messages.push({text,timestamp,mine:true});composeText.value="";composerOpen=false;setError("");render();
 }catch(error){setError(error.message||"Message could not be sent.");}
}
composeSend.addEventListener("click",sendMessage);
composeText.addEventListener("keydown",event=>{if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){event.preventDefault();sendMessage();}});

function openChart(key){
 const info=chartInfo[key];if(!info)return;
 activeChart=key;$("chartTitle").textContent=info.title;$("chartDialog").hidden=false;
 if(chartInstance)chartInstance.destroy();
 const configs={
  avoidance:{type:"radar",data:{labels:["Exposure 1","Exposure 2","Exposure 3"],datasets:[{label:"Exposure",data:[1,10,5]}]}},
  lossPrevention:{type:"bar",data:{labels:["Driver training","No alcohol/drugs","Safety rules"],datasets:[{label:"Before",data:[40,100,30]},{label:"After",data:[20,50,10]}]}},
  lossReduction:{type:"doughnut",data:{labels:["Damage from fire","Sprinklers","First aid","Fire service"],datasets:[{data:[1,40,30,29]}]}},
  duplication:{type:"scatter",data:{datasets:[{label:"Backup availability",data:[{x:10,y:20},{x:15,y:20},{x:50,y:40}]}]}},
  separation:{type:"bar",data:{labels:["January","February","March"],datasets:[{label:"Part 1",data:[40,100,30]},{label:"Part 2",data:[20,50,10]}]},options:{scales:{x:{stacked:true},y:{stacked:true}}}},
  diversification:{type:"bubble",data:{datasets:[{label:"Stocks",data:[{x:20,y:10,r:5},{x:22,y:12,r:4}]},{label:"Bonds",data:[{x:50,y:40,r:2},{x:60,y:22,r:3}]}]}}
 };
 chartInstance=new Chart($("chartCanvas"),{...configs[key],options:{responsive:true,maintainAspectRatio:false,...configs[key].options}});
}
document.querySelectorAll(".chart-tool").forEach(button=>button.addEventListener("click",()=>openChart(button.dataset.chart)));
function closeDialog(dialog){dialog.hidden=true;if(dialog===$("chartDialog")&&chartInstance){chartInstance.destroy();chartInstance=null;}}
document.querySelectorAll(".dialog-close").forEach(button=>button.addEventListener("click",()=>closeDialog(button.closest(".dialog"))));
document.querySelectorAll(".dialog").forEach(dialog=>dialog.addEventListener("click",event=>{if(event.target===dialog)closeDialog(dialog);}));
$("helpButton").addEventListener("click",()=>{
 const list=$("chartDescriptions");list.replaceChildren();
 for(const info of Object.values(chartInfo)){
  const article=document.createElement("article"),heading=document.createElement("h3"),paragraph=document.createElement("p");
  heading.textContent=info.title;paragraph.textContent=info.description;article.append(heading,paragraph);list.append(article);
 }
 $("helpDialog").hidden=false;
});
document.addEventListener("keydown",event=>{if(event.key==="Escape")document.querySelectorAll(".dialog").forEach(dialog=>closeDialog(dialog));});
$("versionButton").addEventListener("click",()=>{$("versionPanel").hidden=!$("versionPanel").hidden;});
$("closeVersionPanel").addEventListener("click",()=>$("versionPanel").hidden=true);
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
function renderVersions(){const list=$("versionsList");list.replaceChildren();versions.forEach(v=>{const row=document.createElement("div");row.className="version-entry";row.textContent=v.name+" · "+new Date(v.savedAt).toLocaleString();list.append(row);});}
$("saveVersionButton").addEventListener("click",()=>{versions.unshift({name:"Version "+(versions.length+1),savedAt:new Date().toISOString(),messages:messages.map(m=>({...m}))});renderVersions();});
$("exportChatsButton").addEventListener("click",()=>download({format:"hm-account-chat",version:1,messages},"hm-account-chats.json"));
$("importChatsButton").addEventListener("click",()=>$("chatFile").click());
$("chatFile").addEventListener("change",async event=>{const file=event.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.messages))throw new Error("Invalid backup file.");messages=data.messages.filter(m=>m&&typeof m.text==="string").map(m=>({text:m.text,mine:!!m.mine,timestamp:Number(m.timestamp)||Date.now()}));renderMessages();setError("");}catch(error){setError("Could not import: "+error.message);}finally{event.target.value="";}});
render();
peer.createOffer();