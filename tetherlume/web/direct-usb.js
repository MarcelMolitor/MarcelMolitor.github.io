const $=id=>document.getElementById(id);
const connect=$("connect"), disconnect=$("disconnect"), note=$("direct-note"), screen=$("phone-screen"), state=$("connection-state");
let adb,device,url,active=false,busy=false,epoch=0,down;
const controls=[...document.querySelectorAll("[data-key]"),$("save-shot")];
function enable(v){controls.forEach(b=>b.disabled=!v);disconnect.disabled=!v;connect.disabled=v;}
function message(s){note.textContent=s}
async function stop(){epoch++;active=false;const old=adb;adb=undefined;try{await old?.close()}catch{}try{await device?.raw?.close()}catch{}device=undefined;screen.hidden=true;$("placeholder").hidden=false;screen.removeAttribute("src");if(url)URL.revokeObjectURL(url);url=undefined;state.textContent="Nicht verbunden";enable(false);connect.textContent="Android verbinden";}
async function capture(client){const result=await client.subprocess.shellProtocol.spawnWait("screencap -p");if(result.exitCode!==0)throw Error("Bildschirmaufnahme fehlgeschlagen");return new Blob([result.stdout],{type:"image/png"})}
async function loop(client,token){while(active&&epoch===token){try{const blob=await capture(client);if(!active||epoch!==token)return;const next=URL.createObjectURL(blob);screen.src=next;if(url)URL.revokeObjectURL(url);url=next;screen.hidden=false;$("placeholder").hidden=true;await new Promise(r=>setTimeout(r,450))}catch(e){if(epoch===token){await stop();message("Bildschirmverbindung beendet: "+e.message)}return}}}
async function command(cmd){if(!adb||busy)return;busy=true;try{const result=await adb.subprocess.shellProtocol.spawnWait(cmd);if(result.exitCode!==0)throw Error("Android-Eingabe fehlgeschlagen")}catch(e){message(e.message)}finally{busy=false}}
function point(e){const r=screen.getBoundingClientRect();return [Math.max(0,Math.min(screen.naturalWidth-1,Math.round((e.clientX-r.left)*screen.naturalWidth/r.width))),Math.max(0,Math.min(screen.naturalHeight-1,Math.round((e.clientY-r.top)*screen.naturalHeight/r.height)))]}
screen.onpointerdown=e=>{if(!active||!screen.naturalWidth)return;screen.setPointerCapture(e.pointerId);down=point(e)};
screen.onpointercancel=()=>{down=undefined};
screen.onpointerup=e=>{if(!down)return;const a=down,b=point(e);down=undefined;command(Math.hypot(a[0]-b[0],a[1]-b[1])<12?"input tap "+b.join(" "):"input swipe "+a.join(" ")+" "+b.join(" ")+" 300")};
document.querySelectorAll("[data-key]").forEach(b=>b.onclick=()=>command("input keyevent "+Number(b.dataset.key)));
screen.onkeydown=e=>{const key={Backspace:67,Enter:66,Escape:4,ArrowUp:19,ArrowDown:20,ArrowLeft:21,ArrowRight:22}[e.key];if(key){e.preventDefault();command("input keyevent "+key)}else if(/^[a-zA-Z0-9 ]$/.test(e.key)){e.preventDefault();command("input text "+(e.key===" "?"%s":e.key))}};
$("save-shot").onclick=async()=>{if(!adb)return;try{const b=await capture(adb),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="tetherlume-"+Date.now()+".png";a.click();setTimeout(()=>URL.revokeObjectURL(u),3000)}catch(e){message(e.message)}};
disconnect.onclick=async()=>{await stop();message("Verbindung getrennt.")};
navigator.usb?.addEventListener("disconnect",e=>{if(device?.raw===e.device){stop();message("USB-Gerät entfernt.")}});
try{if(!isSecureContext||!navigator.usb)throw Error("WebUSB benötigt Chrome oder Edge über HTTPS.");
const [{Adb,AdbDaemonTransport},{AdbDaemonWebUsbDeviceManager},{default:CredentialStore}]=await Promise.all([import("https://esm.sh/@yume-chan/adb@2.0.0"),import("https://esm.sh/@yume-chan/adb-daemon-webusb@2.0.0"),import("https://esm.sh/@yume-chan/adb-credential-web@2.0.0")]);
const manager=AdbDaemonWebUsbDeviceManager.BROWSER;if(!manager)throw Error("WebUSB nicht verfügbar.");
connect.disabled=false;connect.textContent="Android verbinden";message("Bereit. Schließe andere ADB-Programme und WebADB-Tabs.");
connect.onclick=async()=>{connect.disabled=true;let token=++epoch;try{device=await manager.requestDevice();if(!device){connect.disabled=false;return}message("Bitte USB-Debugging am Smartphone bestätigen.");const connection=await device.connect();const transport=await AdbDaemonTransport.authenticate({serial:device.serial,connection,credentialStore:new CredentialStore()});adb=new Adb(transport);active=true;enable(true);state.textContent="Verbunden · Experimentell";message("Verbunden. Bildschirm wird geladen.");loop(adb,token)}catch(e){await stop();message("Verbindung fehlgeschlagen: "+e.message+". Andere ADB-Programme schließen und USB-Debugging prüfen.")}};
}catch(e){connect.disabled=true;connect.textContent="USB nicht verfügbar";message("Start fehlgeschlagen: "+e.message)}
