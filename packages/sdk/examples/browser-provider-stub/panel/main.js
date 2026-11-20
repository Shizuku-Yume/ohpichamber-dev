(()=>{var g="openchamber.sdk",_=2;var Re="openchamber:guest-bootstrap",jo=(e,r,s)=>{let{window:u,MessageChannel:p}=globalThis;if(!u||!p)return;try{let d=new p,m=d.port1,T=!1,v=!1,I=null,L=(P)=>{try{P.close()}catch{}},oe=(P=[])=>{for(let w of P)L(w);if(!T)T=!0,L(m)},Q=(P)=>{let w=new CustomEvent(s,{detail:P,cancelable:!0});if(!u.dispatchEvent(w))return;L(P),T=!0};u.addEventListener(s,(P)=>{if(!("detail"in P)||P.detail!==null)return;if(v=!0,I){let w=I;I=null,Q(w)}}),m.addEventListener("message",(P)=>{if(T)return;let w=P.data,q=P.ports??[];if(!w||w.channel!==e||w.v!==r||w.type!=="connect-port"||q.length!==1){oe(q);return}let Y=q[0];if(T=!0,L(m),Y.start(),!v){I=Y;return}Q(Y)}),m.start(),u.parent.postMessage({channel:e,v:r,type:"bootstrap"},"*",[d.port2])}catch{}},zo=`(${jo.toString()})(${JSON.stringify("openchamber.guest-bootstrap")}, 2, ${JSON.stringify("openchamber:guest-bootstrap")});`;var Ye=`
:root {
  /* Quiet at rest like the app's own thumbs; hover gives a clear grab target. */
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 18%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 36%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
:hover, [data-oc-scrolling] {
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  *, :hover, [data-oc-scrolling] { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  :hover::-webkit-scrollbar-thumb, [data-oc-scrolling]::-webkit-scrollbar-thumb { background: var(--oc-scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  *, :hover, [data-oc-scrolling] { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;function Ze(e){let r=e.documentElement;if(r.hasAttribute("data-oc-scrollbar-activity"))return;r.setAttribute("data-oc-scrollbar-activity","");let s=new WeakMap;e.addEventListener("scroll",(u)=>{let p=u.target===e?r:u.target;if(!(p instanceof Element))return;if(!p.hasAttribute("data-oc-scrolling"))p.setAttribute("data-oc-scrolling","");let d=s.get(p);if(d!==void 0)clearTimeout(d);s.set(p,setTimeout(()=>{s.delete(p),p.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var Jo=`(${Ze.toString()})(document);`;var et=128,tt=65536;var Ae=128;var xe=65536;var ot=8000,rt=192000,st=120000;var Yt=(e)=>{let r=[],s=0,u=0;return{push:(p)=>{r.push(p),u+=p.length;while(u-s>e&&r.length>1){let d=r.shift();u-=d?.length??0,s=0}},pull:(p)=>{let d=0;while(d<p.length&&r.length>0){let m=r[0],T=Math.min(p.length-d,m.length-s);if(p.set(m.subarray(s,s+T),d),d+=T,s+=T,s>=m.length)r.shift(),u-=m.length,s=0}p.fill(0,d)},clear:()=>{r.length=0,s=0,u=0},get size(){return u-s}}};var oo=/^[a-z][a-z0-9-]{0,39}$/;var Zt=(e)=>Object(e)===e&&!Array.isArray(e),nt=(e,r)=>Object.keys(e).every((s)=>r.includes(s)),eo=(e)=>String(e)===e&&e.length>=1&&e.length<=60,to=(e)=>String(e)===e&&e.length>=1&&e.length<=80,ro=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let s of e){if(!Zt(s)||!oo.test(s.id)||!eo(s.label))return!1;if(s.disabled!==void 0&&s.disabled!==!0&&s.disabled!==!1)return!1;if(r.has(s.id))return!1;if(r.add(s.id),s.kind==="button"){if(!nt(s,["kind","id","label","disabled"]))return!1;continue}if(s.kind!=="select"||!nt(s,["kind","id","label","value","options","disabled"]))return!1;if(!to(s.value)||!Array.isArray(s.options)||s.options.length<1||s.options.length>16)return!1;let u=new Set;for(let p of s.options){if(!Zt(p)||!nt(p,["value","label"])||!to(p.value)||!eo(p.label)||u.has(p.value))return!1;u.add(p.value)}if(!u.has(s.value))return!1}return!0};var so=["{id}","{segment}","{segments+}"];var Cr=new Set(so);var no=["turn-finished","turn-failed","permission-asked","question-asked","turn-started","session-created","session-archived","session-deleted"];var Ir=new Set(no);var Ce=20000000,ke=256;var it=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,io=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let s=0;s<e.bytes.byteLength;s+=1)if(e.bytes[s]!==r.bytes[s])return!1;return!0};var ao=/^[A-Za-z0-9_-]{1,80}$/;var lo=["left","right","top","bottom"];var uo=(e,r=0,s={remaining:16000})=>{if(--s.remaining<0||r>=32)return!1;if(e===null)return!0;let u=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let p of u)if(!uo(p,r+1,s))return!1;return!0},at=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(at);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(at)}return String(e)===e||Number.isFinite(e)},lt=(e)=>{try{if(String(e.id)!==e.id||!ao.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!lo.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!uo(e.data)||!at(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var ct=2000;var po=["file","directory","other","missing"],pt=(e)=>Boolean(e&&"sessionId"in e),dt=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var So=/^[0-9a-f]{7,64}$/i,St=(e)=>So.test(e),Ie=500,Pe=32000,Eo=16000,go=128,_o=200,To=2000,mo=16000,Ro=80,fo=200,ho=16000;var yo=2000;var Et=20000,Me=1024,Ge=2000000;var Ue=64000,we=8000,gt=4000;var _t=960000;var bo=999,vo=1e4,fe=500,Oo=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],Ao=["stopped","starting","ready","failed"],Yo=new Set(Oo),xo=(e)=>Yo.has(e),Co=(e)=>e&&xo(e)?e:"HOST_REJECTED",le=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(le);if(Object(e)===e)return Object.values(e).every(le);return!1},ko=(e)=>le(e)&&JSON.stringify(e).length<=ho,co=(e)=>e?.trim().slice(0,fo)??"",ue=(e)=>{let r=e.id.trim().slice(0,go),s=e.title.trim().slice(0,_o),u=e.url.trim().slice(0,To),p=e.text?.trim().slice(0,mo),d=e.author?.trim().slice(0,Ro),m=e.kind==="pull"?"pull":"issue",T={providerId:e.providerId.trim(),id:r,title:s||r,url:u,kind:m};if(p)T.text=p;if(d)T.author=d;if(m==="pull"){let v=co(e.branches?.head),I=co(e.branches?.base);if(v&&I)T.branches={head:v,base:I}}if(ko(e.data))T.data=e.data;return T},Tt=(e)=>{let r=ue(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},mt=(e)=>{let r={text:e.text.trim().slice(0,Eo)};if(e.send)r.send=!0;return r},Rt=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(bo,Math.max(0,Math.round(e)))},ft=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(vo,Math.max(0,Math.ceil(e)))};var ce=(e)=>e.length>0&&e.length<=Me&&!e.includes("\x00")&&!e.includes("\\");var Ne=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>yo)return!1;return!e.split("/").some((s)=>s==="."||s==="..")},Zo=new Set(Ao),ht=(e)=>Boolean(e&&"status"in e&&Zo.has(String(e.status))&&!("body"in e)),Le=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),yt=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),bt=(e)=>Boolean(e&&"written"in e&&e.written===!0),vt=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),er=new Set(po),Ot=(e)=>Boolean(e&&"kind"in e&&"size"in e&&er.has(String(e.kind))&&Number.isFinite(e.size)),At=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),tr=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","service-event","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late","microphone-audio","microphone-ended"]),or=(e)=>Object(e)===e?e:null,ut=(e)=>String(e)===e&&e.length>0,rr=(e)=>{if(!ut(e.id))return null;if(e.ok===!0){let r={channel:g,v:_,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&ut(e.error))return{channel:g,v:_,type:"result",id:e.id,ok:!1,error:e.error,code:Co(ut(e.code)?e.code:void 0)};return null},xt=(e)=>{let r=or(e);if(!r||r.channel!==g||r.v!==_)return null;if(r.type==="result")return rr(r);if(!tr.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var Io=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),sr=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class l extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var Po=()=>Promise.reject(new l("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),De=()=>Promise.reject(new l("BAD_PATH",`File path must be 1 to ${Me} characters without NUL or backslash.`)),He=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new l("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},E=(e)=>(e.value+=1,`oc-${e.value}`),Ct=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new l("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let s=e.requestTimeoutMs??Et,u=e.acceptSource??((t)=>t===r.parent),p=new Set,d=new Set,m=new Set,T=new Set,v=new Set,I=new Set,L=new Set,oe=new Set,Q=new Set,P=new Set,w=new Set,q=new Set,Y=[],Se=null,Ee=null,he=new Set,ye=new Set,ge=null,_e=null,qe=!1,re=new Map,se=new Map,ne=new Map,V=!1,S={value:0},c=null,K=null,Te=!1,me=!1,Ft=null,D=null,Vt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},ie=null,Ke=[],H=(t)=>{if(V)return;if(ie){ie.postMessage(t);return}Ke.push(t)},Xt=()=>{if(V||Object.is(r.parent,r)||q.size===0||c?.features?.lateGenerateResults!==!0)return;H({channel:g,v:_,type:"generate-late-listen"})},h=(t,o)=>{for(let i of t)try{i(o)}catch(a){console.error(a)}},Xo=(t)=>{if(!("data"in t))return;let o=xt(t.data);if(!o)return;if(o.type==="workspace"){let a=se.get(o.payload.subscriptionId);if(a)h([a],o.payload.snapshot);return}if(o.type==="shells"){let a=ne.get(o.payload.subscriptionId);if(a)h([a],o.payload.snapshot);return}if(o.type==="microphone-audio"){D?.queue.push(o.payload.samples);return}if(o.type==="microphone-ended"){let a=D;if(!a)return;D=null,a.release(),h(a.endedListeners,o.payload.reason);return}if(o.type==="ready"){if(c=o.payload,K=Vt(o.payload.session),h(p,o.payload),h(d,o.payload.directory),h(m,o.payload.session),K)h(T,K);if(h(v,o.payload.connection),h(I,o.payload.settings),h(L,o.payload.item),o.payload.block)h(oe,o.payload.block);Xt();return}if(o.type==="service-event"){h(Q,o.payload);return}if(o.type==="generate-late"){if(q.size===0)Y.push(o.payload);else h(q,o.payload);return}if(o.type==="directory"){if(c)c={...c,directory:o.payload.directory};h(d,o.payload.directory);return}if(o.type==="session"){if(c)c={...c,session:o.payload.session};if(!o.payload.session)K=null;else if(K?.sessionId!==o.payload.session.id)K=Vt(o.payload.session);h(m,o.payload.session);return}if(o.type==="session-lifecycle"){K=o.payload,h(T,o.payload);return}if(o.type==="connection"){if(c)c={...c,connection:o.payload.connection};h(v,o.payload.connection);return}if(o.type==="settings"){if(c)c={...c,settings:o.payload.settings};h(I,o.payload.settings);return}if(o.type==="item"){if(c)c={...c,item:o.payload.item};h(L,o.payload.item);return}if(o.type==="status-control-event"){h(P,o.payload);return}if(o.type==="popover-closed"){h(w,o.payload);return}if(o.type==="action"){let a=(f)=>{if(!V)H({channel:g,v:_,type:"action-result",id:o.id,payload:f})},R=Ee;if(!R){a({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>R(o.payload)).then(()=>a({ok:!0}),(f)=>{let y=(f instanceof Error?f.message:String(f)).trim();a({ok:!1,error:(y||"Action failed.").slice(0,fe)})});return}if(o.type==="file-open"){let a=o.payload;if(_e&&io(_e,a))return;_e=a,h(he,o.payload);return}if(o.type==="file-saved"){h(ye,o.payload.version);return}if(o.type==="file-snapshot"){let a=(y)=>{if(!V)H({channel:g,v:_,type:"file-snapshot-result",id:o.id,payload:y})},R=(y)=>a({error:(y.trim()||"Could not read the edited file.").slice(0,fe)}),f=ge;if(!f){R("This extension does not edit files.");return}Promise.resolve().then(()=>f(o.payload.purpose)).then((y)=>{if(it(y)>Ce){R(`The file is over ${Ce} ${"bytes"in y?"bytes":"characters"}.`);return}if(y.version.length>ke){R(`The snapshot version is over ${ke} characters.`);return}a({snapshot:"bytes"in y?{bytes:y.bytes,version:y.version}:{content:y.content,version:y.version}})},(y)=>R(y instanceof Error?y.message:String(y)));return}if(o.type==="resolve"){let a=(f)=>{H({channel:g,v:_,type:"resolve-result",id:o.id,payload:f})},R=Se;if(!R){a({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>R(o.payload)).then((f)=>a({item:f?ue(f):null}),(f)=>{let y=(f instanceof Error?f.message:String(f)).trim();a({error:(y||"Command failed.").slice(0,fe)})});return}let i=re.get(o.id);if(!i)return;if(clearTimeout(i.timer),re.delete(o.id),o.ok){i.resolve(o.payload);return}i.reject(new l(o.code,o.error))},Wo=(t)=>{if(!("source"in t))return!0;return u(t.source)},Wt=(t)=>{if(!Wo(t)||!("detail"in t))return;let o=t.detail;if(!(o instanceof MessagePort))return;t.preventDefault(),t.stopImmediatePropagation(),ie?.close(),ie=o,o.addEventListener("message",Xo),o.start(),o.postMessage({channel:g,v:_,type:"hello"});for(let i of Ke.splice(0))o.postMessage(i)};r.addEventListener(Re,Wt),r.dispatchEvent?.(new CustomEvent(Re,{detail:null}));let U=(t,o=s)=>{if(V||Object.is(r.parent,r))return Promise.reject(new l("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((i,a)=>{let R=setTimeout(()=>{re.delete(t.id),a(new l("HOST_TIMEOUT","Host did not answer in time."))},o);re.set(t.id,{resolve:i,reject:a,timer:R}),H(t)})},C=(t)=>U(t).then(()=>{return}),O={channel:g,v:_},je=(t)=>{if(!V&&!Object.is(r.parent,r))H(t)},$t=()=>je({...O,type:"file-save"}),ze=()=>{if(!V&&!Object.is(r.parent,r))H({...O,type:"microphone-close",id:E(S)})},$o=async()=>{if(D)throw new l("HOST_REJECTED","The microphone is already open in this frame.");if(c?.features?.microphone!==!0)throw new l("UNSUPPORTED","This OhPiChamber cannot share the microphone with extensions.");let t=globalThis.AudioContext;if(typeof t!=="function")throw new l("UNSUPPORTED","This frame has no Web Audio.");let o=new t;if(o.sampleRate<ot||o.sampleRate>rt)throw o.close().catch(()=>{return}),new l("UNSUPPORTED",`Audio at ${o.sampleRate} Hz is not supported.`);let i=o.state==="suspended"?o.resume().catch(()=>{return}):void 0,a=Yt(Math.round(o.sampleRate/4)),R=o.createScriptProcessor(1024,1,1);R.onaudioprocess=(X)=>a.pull(X.outputBuffer.getChannelData(0));let f=o.createMediaStreamDestination();R.connect(f);let y=new Set,ae={queue:a,endedListeners:y,release:()=>{R.onaudioprocess=null,R.disconnect(),a.clear();for(let X of f.stream.getTracks())X.stop();o.close().catch(()=>{return})}};D=ae;try{let X=await U({...O,type:"microphone-open",id:E(S),payload:{sampleRate:o.sampleRate}},st);if(!X||!("opened"in X)||X.opened!==!0)throw new l("HOST_REJECTED","Host did not open the microphone.");if(await i,D!==ae)throw new l("DISCONNECTED","The microphone closed while it was opening.")}catch(X){if(D===ae)D=null;throw ae.release(),ze(),X}return{stream:f.stream,close:()=>{if(D!==ae)return;D=null,ae.release(),ze()},onEnded:(X)=>(y.add(X),()=>{y.delete(X)})}},qt=(t)=>{if(!Io(t)||!sr(t))return;t.preventDefault(),$t()},Kt=(t)=>{if(!Io(t)||t.key!=="Escape"||c?.surface!=="popover"||!c.popover)return;t.preventDefault(),Jt(c.popover.id,"escape").catch(()=>{return})},be=()=>{let t=c?.surface==="popover"?c.popover:void 0;if(!t)return;let o=Te||me;if(Ft===o)return;Ft=o,Qt(t.id,o).catch(()=>{return})},ve=()=>{if(c?.surface!=="popover"||Te)return;Te=!0,be()},jt=(t)=>{if(c?.surface!=="popover"||t.relatedTarget!==null||!Te)return;Te=!1,be()},zt=()=>{if(c?.surface!=="popover"||me)return;me=!0,be()},qo=()=>{if(c?.surface!=="popover"||!me)return;me=!1,be()},W=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new l("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},Je=async(t)=>{if(t.kind!=="projects")W(t.projectId);let o=await U({...O,type:"workspace-read",id:E(S),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new l("HOST_REJECTED","Host did not return workspace data.");return o},Qe=async(t,o)=>{if(t.kind!=="projects")W(t.projectId);let i=E(S);se.set(i,o);try{await C({...O,type:"workspace-subscribe",id:E(S),payload:{subscriptionId:i,query:t}})}catch(a){if(se.delete(i),!V)H({...O,type:"workspace-unsubscribe",id:E(S),payload:{subscriptionId:i}});throw a}return()=>{if(!se.delete(i)||V)return;H({...O,type:"workspace-unsubscribe",id:E(S),payload:{subscriptionId:i}})}},Ko=async(t,o)=>{if(t.kind==="session")W(t.sessionId);if(t.kind==="project")W(t.projectId);let i=E(S);ne.set(i,o);try{await C({...O,type:"shells-subscribe",id:E(S),payload:{subscriptionId:i,scope:t}})}catch(a){if(ne.delete(i),!V)H({...O,type:"shells-unsubscribe",id:E(S),payload:{subscriptionId:i}});throw a}return()=>{if(!ne.delete(i)||V)return;H({...O,type:"shells-unsubscribe",id:E(S),payload:{subscriptionId:i}})}},Oe=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>et))throw new l("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!le(t.value))throw new l("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>tt)throw new l("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&c?.features?.deviceStorage!==!0)throw new l("UNSUPPORTED","This host does not support device storage.");let o=await U({...O,type:"storage",id:E(S),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new l("HOST_REJECTED","Host did not return storage data.");return o},Jt=(t,o)=>c?.features?.popovers!==!0&&!(c?.surface==="popover"&&c.popover?.id===t)?Promise.reject(new l("UNSUPPORTED","This host does not support popovers.")):C({...O,type:"popover-close",id:E(S),payload:o?{id:t,reason:o}:{id:t}}),Qt=(t,o)=>c?.features?.popovers!==!0&&!(c?.surface==="popover"&&c.popover?.id===t)?Promise.reject(new l("UNSUPPORTED","This host does not support popovers.")):C({...O,type:"popover-anchor",id:E(S),payload:{id:t,active:o}});return r.addEventListener("keydown",Kt,!0),r.addEventListener("pointerover",ve),r.addEventListener("pointermove",ve),r.addEventListener("pointerout",jt),r.addEventListener("focus",zt),r.addEventListener("blur",qo),{onAction:(t)=>(Ee=t,()=>{if(Ee===t)Ee=null}),listProjects:async()=>{let t=await Je({kind:"projects"});if(t.kind!=="projects")throw new l("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await Je({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new l("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await Je({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new l("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>Qe({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>Qe({kind:"worktrees",projectId:t},(i)=>{if(i.kind==="worktrees")o(i)}),onSessions:(t,o)=>Qe({kind:"sessions",projectId:t},(i)=>{if(i.kind==="sessions")o(i)}),onRunningShells:(t,o)=>Ko(t,o),readShellOutput:async(t,o)=>{W(t,Ae);let i=o?.cursor;if(i!==void 0&&(!Number.isInteger(i)||i<0))throw new l("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let a=o?.tailBytes;if(a!==void 0&&(!Number.isInteger(a)||a<1||a>xe))throw new l("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${xe}.`);let f=await U({...O,type:"shell-output",id:E(S),payload:{shellId:t,cursor:i,tailBytes:a}});if(!f||typeof f.output!=="string"||!Number.isFinite(f.cursor))throw new l("HOST_REJECTED","Host did not return shell output.");return f},stopShell:async(t)=>{if(W(t,Ae),(await U({...O,type:"shell-stop",id:E(S),payload:{shellId:t}}))?.stopped!==!0)throw new l("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{W(t),await C({...O,type:"open-session",id:E(S),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let i=He(o),a={op:"get",key:t};if(i)a.scope=i;let R=await Oe(a);return R.op==="get"&&R.found?R.value:void 0},set:async(t,o,i)=>{let a=He(i),R={op:"set",key:t,value:o};if(a)R.scope=a;await Oe(R)},delete:async(t,o)=>{let i=He(o),a={op:"delete",key:t};if(i)a.scope=i;await Oe(a)},keys:async(t)=>{let o=He(t),i={op:"keys"};if(o)i.scope=o;let a=await Oe(i);if(a.op!=="keys")throw new l("HOST_REJECTED","Expected storage keys.");return a.keys}},onReady:(t)=>{if(p.add(t),c)t(c);return()=>{p.delete(t)}},onDirectory:(t)=>{if(d.add(t),c)t(c.directory);return()=>{d.delete(t)}},onSession:(t)=>{if(m.add(t),c)t(c.session);return()=>{m.delete(t)}},onSessionLifecycle:(t)=>{if(T.add(t),K)t(K);return()=>{T.delete(t)}},onConnection:(t)=>{if(v.add(t),c)t(c.connection);return()=>{v.delete(t)}},onSettings:(t)=>{if(I.add(t),c)t(c.settings);return()=>{I.delete(t)}},onItem:(t)=>{if(L.add(t),c)t(c.item);return()=>{L.delete(t)}},onBlock:(t)=>{if(oe.add(t),c?.block)t(c.block);return()=>{oe.delete(t)}},onServiceEvent:(t)=>(Q.add(t),()=>{Q.delete(t)}),onStatusControl:(t)=>(P.add(t),()=>{P.delete(t)}),onPopoverClosed:(t)=>(w.add(t),()=>{w.delete(t)}),onLateGenerateResult:(t)=>{q.add(t);for(let o of Y.splice(0))h([t],o);return Xt(),()=>{q.delete(t)}},setStatusControls:(t)=>{if(c?.features?.statusControls!==!0)return Promise.reject(new l("UNSUPPORTED","This host does not support status controls."));if(!ro(t))return Promise.reject(new l("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return C({...O,type:"status-controls",id:E(S),payload:{controls:t}})},openPopover:(t)=>{if(c?.features?.popovers!==!0)return Promise.reject(new l("UNSUPPORTED","This host does not support popovers."));if(!lt(t))return Promise.reject(new l("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return C({...O,type:"popover-open",id:E(S),payload:t})},closePopover:Jt,setPopoverAnchorActive:Qt,onResolve:(t)=>(Se=t,()=>{if(Se===t)Se=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Ie)return Promise.reject(new l("HOST_REJECTED",`Toast message must contain 1 to ${Ie} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Pe))return Promise.reject(new l("HOST_REJECTED",`Toast copy text must contain 1 to ${Pe} characters.`));return C({channel:g,v:_,type:"toast",id:E(S),payload:{...t,message:o}})},openUrl:(t)=>C({channel:g,v:_,type:"open-url",id:E(S),payload:{url:t}}),openCommit:(t)=>St(t)?C({channel:g,v:_,type:"open-commit",id:E(S),payload:{sha:t}}):Promise.reject(new l("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),answerBlock:(t)=>C({channel:g,v:_,type:"block-answer",id:E(S),payload:{text:t.trim().slice(0,ct)}}),openSurface:(t)=>C({channel:g,v:_,type:"open-surface",id:E(S),payload:{surfaceId:t}}),writeClipboard:(t)=>C({channel:g,v:_,type:"clipboard-write",id:E(S),payload:{text:t}}),compose:(t)=>C({channel:g,v:_,type:"compose",id:E(S),payload:t}),attach:(t)=>C({channel:g,v:_,type:"attach",id:E(S),payload:ue(t)}),startSession:async(t)=>{if(t.projectId!==void 0)W(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")W(o.directory);else{if(o.name!==void 0)W(o.name,200);if(o.baseBranch!==void 0)W(o.baseBranch,200)}let i=await U({channel:g,v:_,type:"start-session",id:E(S),payload:Tt(t)},e.requestTimeoutMs??180000);if(!pt(i))throw new l("HOST_REJECTED","Host did not return a session.");return i},prompt:(t)=>U({channel:g,v:_,type:"prompt",id:E(S),payload:mt(t)}).then((o)=>{if(!dt(o))throw new l("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>C({channel:g,v:_,type:"session-link",id:E(S),payload:ue(t)}),close:()=>C({channel:g,v:_,type:"close",id:E(S)}),oauthStart:()=>C({channel:g,v:_,type:"oauth-start",id:E(S)}),oauthDisconnect:()=>C({channel:g,v:_,type:"oauth-disconnect",id:E(S)}),request:(t)=>(Ne(t.path)?U({channel:g,v:_,type:"request",id:E(S),payload:t}):Po()).then((o)=>{if(!Le(o))throw new l("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:(t)=>(Ne(t.path)?U({channel:g,v:_,type:"service-request",id:E(S),payload:t}):Po()).then((o)=>{if(!Le(o))throw new l("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>U({channel:g,v:_,type:"service-status",id:E(S)}).then((t)=>{if(!ht(t))throw new l("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(ce(t)?U({channel:g,v:_,type:"file-read",id:E(S),payload:{path:t}}):De()).then((o)=>{if(!yt(o))throw new l("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!ce(t))return De();if(o.length>Ge)return Promise.reject(new l("FILE_TOO_LARGE",`Content is over ${Ge} characters.`));return U({channel:g,v:_,type:"file-write",id:E(S),payload:{path:t,content:o}}).then((i)=>{if(!bt(i))throw new l("HOST_REJECTED","Host did not confirm the write.");return i})},listDir:(t)=>(ce(t)?U({channel:g,v:_,type:"file-list",id:E(S),payload:{path:t}}):De()).then((o)=>{if(!vt(o))throw new l("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(ce(t)?U({channel:g,v:_,type:"file-stat",id:E(S),payload:{path:t}}):De()).then((o)=>{if(!Ot(o))throw new l("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),i=t.system?.trim();if(o.length===0||o.length>Ue)return Promise.reject(new l("HOST_REJECTED",`Prompt must be 1 to ${Ue} characters.`));if(i!==void 0&&(i.length===0||i.length>we))return Promise.reject(new l("HOST_REJECTED",`System prompt must be 1 to ${we} characters.`));let a=t.maxOutputTokens===void 0?void 0:Math.min(gt,Math.max(1,Math.floor(t.maxOutputTokens)));if(a!==void 0&&!Number.isFinite(a))return Promise.reject(new l("HOST_REJECTED","maxOutputTokens must be a number."));let R={prompt:o};if(i!==void 0)R.system=i;if(a!==void 0)R.maxOutputTokens=a;return U({channel:g,v:_,type:"generate",id:E(S),payload:R},e.requestTimeoutMs??_t).then((f)=>{if(!At(f))throw new l("HOST_REJECTED","Host did not return generated text.");return f})},openMicrophone:$o,setBadge:(t)=>C({channel:g,v:_,type:"badge",id:E(S),payload:{count:Rt(t)}}),setHeight:(t)=>C({channel:g,v:_,type:"resize",id:E(S),payload:{height:ft(t)}}),onFileOpen:(t)=>{if(he.add(t),!qe)qe=!0,r.addEventListener("keydown",qt,!0);if(_e)t(_e);return()=>{he.delete(t)}},onFileSnapshot:(t)=>(ge=t,()=>{if(ge===t)ge=null}),onFileSaved:(t)=>(ye.add(t),()=>{ye.delete(t)}),reportFileChange:(t)=>je({...O,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:$t,reportFileUnsupported:()=>je({...O,type:"file-unsupported"}),dispose:()=>{for(let t of se.keys())H({...O,type:"workspace-unsubscribe",id:E(S),payload:{subscriptionId:t}});se.clear();for(let t of ne.keys())H({...O,type:"shells-unsubscribe",id:E(S),payload:{subscriptionId:t}});if(ne.clear(),D)ze(),D.release(),D=null;if(V=!0,Se=null,Ee=null,ge=null,he.clear(),ye.clear(),qe)r.removeEventListener("keydown",qt,!0);r.removeEventListener(Re,Wt),r.removeEventListener("keydown",Kt,!0),r.removeEventListener("pointerover",ve),r.removeEventListener("pointermove",ve),r.removeEventListener("pointerout",jt),r.removeEventListener("focus",zt),ie?.close(),ie=null,Ke.length=0;for(let t of re.values())clearTimeout(t.timer),t.reject(new l("HOST_UNAVAILABLE","Host client was disposed."));re.clear(),p.clear(),d.clear(),m.clear(),T.clear(),v.clear(),I.clear(),L.clear(),oe.clear(),Q.clear(),P.clear(),w.clear(),q.clear(),Y.length=0}}};var Mo=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var jr=new Set(Mo);var Go=["none","agent","user"];var Jr=new Set(Go);var nr=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],ir=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],Uo=(e,r)=>{r.style.colorScheme=e.mode;for(let[s,u]of nr)r.style.setProperty(s,e.tokens[u]);for(let[s,u,p]of ir){let d=e.tokens[p]??"";r.style.setProperty(s,d),r.style.setProperty(u,d)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size",e.tokens.fontSize??"0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},kt=(e,r)=>{if(Uo(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var ar={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},b=(e,r)=>`var(--${e}, var(--oc-${ar[e]}, ${r}))`,z=b("surface-background","transparent"),Fe=b("surface-elevated","transparent"),pe=b("surface-elevated-foreground","inherit"),B=b("surface-foreground","inherit"),A=b("surface-muted-foreground","gray"),lr=b("surface-muted","transparent"),Z=b("interactive-border","currentColor"),N=b("interactive-hover","transparent"),ee=b("interactive-active","transparent"),It=b("interactive-selection","transparent"),Pt=b("interactive-selection-foreground","inherit"),j=b("primary","currentColor"),Mt=b("primary-text","inherit"),Gt=b("error-text","inherit"),ur=b("font-sans","inherit"),Ut=b("font-mono","monospace"),Do=b("radius","9px"),wt=`calc(${Do} - 2px)`,wo=`calc(${Do} - 4px)`,x=(e,r,s="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${s})`,No=`background-image: linear-gradient(${N}, ${N});`,Nt=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,Lt="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Lo="box-shadow: var(--oc-sdk-lit);",Dt=`inset 0 0.5px 0 0 ${x(B,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,cr=`
:root {
  --oc-sdk-edge: ${x(B,16)};
  --oc-sdk-field-bg: ${Fe};
  --oc-sdk-raised-bg: ${z};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${x(B,14)};
  --oc-sdk-field-bg: ${x(z,50,Fe)};
  --oc-sdk-raised-bg: ${Fe};
  --oc-sdk-field-lift: ${Dt};
  --oc-sdk-raised-lift: ${Dt};
  --oc-sdk-lit: ${Dt};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,Be=(e)=>{let r=b(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${b(`${e}-text`,"inherit")}; }`},n=(e)=>`calc(${e}rem / 14)`,pr=`
.oc-sdk { box-sizing: border-box; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: ${n(8)}; height: ${n(32)}; padding: 0 ${n(12)}; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; }
.oc-sdk-btn[data-size="sm"] { gap: ${n(6)}; height: ${n(28)}; padding: 0 ${n(10)}; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { gap: ${n(4)}; height: ${n(24)}; padding: 0 ${n(8)}; font-size: 0.75rem; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: ${n(14)}; height: ${n(14)}; }

.oc-sdk-field { display: flex; flex-direction: column; gap: ${n(4)}; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: ${n(32)}; padding: 0 ${n(10)}; border: 0; font-size: 0.875rem; line-height: 1.45; appearance: none; }
textarea.oc-sdk-input { height: auto; padding: ${n(8)} ${n(10)}; resize: vertical; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: ${n(34)}; padding-right: ${n(34)}; }
.oc-sdk-search-icon { position: absolute; left: ${n(11)}; top: 50%; transform: translateY(-50%); pointer-events: none; }
.oc-sdk-search-clear { position: absolute; right: ${n(6)}; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: ${n(24)}; height: ${n(24)}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: ${n(4)}; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: ${n(6)}; align-self: flex-start; width: auto; max-width: 100%; min-width: 0; height: ${n(28)}; padding: 0 ${n(10)}; border: 1px solid transparent; font-size: 0.8125rem; text-align: left; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: ${n(2)}; min-width: ${n(160)}; max-width: calc(100vw - ${n(16)}); max-height: min(${n(320)}, calc(100vh - ${n(16)})); overflow: auto; padding: ${n(4)}; border: 1px solid transparent; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: ${n(2)} ${n(2)} ${n(4)}; }
.oc-sdk-popup-search .oc-sdk-input { height: ${n(28)}; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: ${n(8)}; width: 100%; padding: ${n(6)} ${n(8)}; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; }
.oc-sdk-option-check { flex: 0 0 auto; display: inline-flex; width: ${n(14)}; visibility: hidden; }
.oc-sdk-option[aria-selected="true"] > .oc-sdk-option-check { visibility: visible; }
.oc-sdk-popup-empty { padding: ${n(8)}; font-size: 0.8125rem; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: ${n(8)}; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: ${n(14)}; height: ${n(14)}; margin-top: ${n(3)}; border: 1px solid transparent; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: ${n(36)}; height: ${n(20)}; --oc-sdk-thumb-travel: ${n(16)}; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: ${n(2)}; left: ${n(2)}; width: ${n(16)}; height: ${n(16)}; }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; }

.oc-sdk-tabs { display: inline-flex; gap: ${n(2)}; padding: ${n(2)}; max-width: 100%; overflow: auto; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: ${n(6)}; height: ${n(28)}; padding: 0 ${n(10)}; border: 1px solid transparent; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: ${n(1)} ${n(6)}; font-size: ${n(11)}; font-weight: 500; line-height: ${n(16)}; white-space: nowrap; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: ${n(8)}; width: 100%; padding: ${n(6)} ${n(8)}; text-align: left; }
.oc-sdk-row-lead { flex: 0 0 auto; width: ${n(64)}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-list-empty { padding: ${n(16)} ${n(8)}; text-align: center; font-size: 0.8125rem; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${n(4)}; padding: ${n(40)} ${n(16)}; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; }
.oc-sdk-empty-action { margin-top: ${n(12)}; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: ${n(8)}; font-size: 0.8125rem; }
.oc-sdk-spinner-ring { width: ${n(16)}; height: ${n(16)}; border: 2px solid transparent; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: ${n(12)}; height: ${n(12)}; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: ${n(12)}; padding: ${n(8)} ${n(12)}; border: 1px solid transparent; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: ${n(2)}; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-banner-body { font-size: 0.8125rem; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: ${n(8)}; width: 100%; margin: ${n(8)} 0; font-size: 0.75rem; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: ${n(4)} 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: ${n(4)}; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: ${n(6)}; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; transform-origin: left; transition: transform 200ms ease-out; }
.oc-sdk-progress-value { display: inline-flex; align-items: center; gap: ${n(2)}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { font-weight: 600; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text img { display: block; max-width: 100%; margin: ${n(8)} 0; }

/* Under a finger the controls reach the app's touch sizes: rows and options 44px like its sheets, every other
   control at least 36px. Inputs keep 16px text, below which iOS zooms the page on focus. */
@media (pointer: coarse) {
  .oc-sdk-btn, .oc-sdk-input { height: ${n(40)}; }
  .oc-sdk-btn[data-size="sm"], .oc-sdk-btn[data-size="xs"], .oc-sdk-trigger, .oc-sdk-tab, .oc-sdk-popup-search .oc-sdk-input { height: ${n(36)}; }
  .oc-sdk-input, .oc-sdk-popup-search .oc-sdk-input { font-size: max(16px, 0.875rem); }
  .oc-sdk-search-clear { width: ${n(36)}; height: ${n(36)}; right: 0; }
  .oc-sdk-row, .oc-sdk-option { min-height: ${n(44)}; }
  .oc-sdk-check { min-height: ${n(36)}; padding: ${n(8)} 0; }
}
`,Ho=`${cr}
.oc-sdk { color: ${B}; font-family: ${ur}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${No} }
.oc-sdk-mono { font-family: ${Ut}; }
.oc-sdk-muted { color: ${A}; }
${Be("success")}${Be("warning")}${Be("error")}${Be("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${j}; --oc-sdk-tone-text: ${Mt}; }

.oc-sdk-btn { border-radius: ${wt}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${wo}; }
.oc-sdk-btn[data-variant="default"] { color: ${Mt}; background: ${x(j,10,z)}; border-color: ${x(j,12)}; ${Lo} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${x(j,16,z)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${x(j,22,z)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${lr}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${N}, ${N}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${ee}, ${ee}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${pe}; ${Lt} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${N}, ${N}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${ee}, ${ee}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${N}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${ee}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${b("status-error","red")}; color: ${Gt}; background: ${x("var(--oc-sdk-tone)",7,z)}; border-color: ${x("var(--oc-sdk-tone)",12)}; ${Lo} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${x("var(--oc-sdk-tone)",9,z)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${x("var(--oc-sdk-tone)",11,z)}; box-shadow: none; }

.oc-sdk-field-note { color: ${A}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${Gt}; }
.oc-sdk-input { border-radius: ${wt}; background: var(--oc-sdk-field-bg); color: ${pe}; ${Nt("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${A}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${N}, ${N}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Nt(x(B,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Nt(b("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${Ut}; }

.oc-sdk-search-icon { color: ${A}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${j}; }
.oc-sdk-search-clear { border-radius: ${wo}; color: ${A}; }
.oc-sdk-search-clear:hover { background: ${N}; color: ${B}; }

.oc-sdk-trigger { border-radius: ${wt}; background: var(--oc-sdk-raised-bg); color: ${pe}; ${Lt} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${N}, ${N}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${ee}, ${ee}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${A}; }
.oc-sdk-trigger-chevron { color: ${A}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${pe}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${Fe}; background-clip: padding-box; color: ${pe}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${N}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${It}; color: ${Pt}; }
.oc-sdk-option-check { color: ${B}; }
.oc-sdk-option[data-destructive="true"] { color: ${Gt}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${x(b("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${A}; }
.oc-sdk-popup-empty { color: ${A}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${Z}; border-radius: 4px; color: ${B}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${x(B,60,Z)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${Z}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${z}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${j}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(var(--oc-sdk-thumb-travel, 16px)); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${No} }
.oc-sdk-check-desc { color: ${A}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${x(B,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${A}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${B}; }
.oc-sdk-tab[aria-selected="true"] { color: ${Pt}; background: ${It}; border-color: ${Z}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${pe}; background: var(--oc-sdk-raised-bg); ${Lt} }
.oc-sdk-tab-count { color: ${A}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${x(B,6)}; color: ${A}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${x("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${N}; }
.oc-sdk-row[aria-selected="true"] { background: ${It}; color: ${Pt}; }
.oc-sdk-row-lead { font-family: ${Ut}; color: ${A}; }
.oc-sdk-row-sub { color: ${A}; }
.oc-sdk-row-meta { color: ${A}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${A}; }

.oc-sdk-empty-body { color: ${A}; }

.oc-sdk-spinner { color: ${A}; }
.oc-sdk-spinner-ring { border-color: ${Z}; border-top-color: ${j}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${x("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${A}; }

.oc-sdk-separator { color: ${A}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${x(Z,40)}; }

.oc-sdk-progress-label { color: ${A}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${x(B,6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${j}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${b("status-success","currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${b("success-text","inherit")}; }

.oc-sdk-text a { color: ${Mt}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${x(Z,60)}; }
`,M=`
${Ye}
${pr}
${Ho}`;var Bo="oc-sdk-ui-style";var G=(e)=>{let r=document.getElementById(Bo);if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}Ze(document);let s=document.createElement("style");s.id=Bo,s.textContent=e,document.head.appendChild(s)},k=(e,r)=>{let s=document.createElement(e);if(r)s.className=r;return s},J=(e)=>{let r=k("button",e);return r.type="button",r},F=(e,r)=>{let s=r??"";if(e.textContent!==s)e.textContent=s},te=(e,r,s)=>{if(s===void 0||s===null||s==="")e.removeAttribute(r);else if(e.getAttribute(r)!==s)e.setAttribute(r,s)};var dr=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},de=(e,r)=>{G(M);let s=r,u=J("oc-sdk oc-sdk-btn"),p=dr(),d=document.createElement("span");u.append(d),e.append(u);let m=()=>{if(u.dataset.variant=s.variant??"default",u.dataset.size=s.size??"default",u.disabled=Boolean(s.disabled)||Boolean(s.loading),u.dataset.loading=s.loading?"true":"false",u.setAttribute("aria-busy",s.loading?"true":"false"),s.loading&&p.parentNode!==u)u.prepend(p);else if(!s.loading&&p.parentNode===u)p.remove();F(d,s.label)},T=()=>{if(s.disabled||s.loading)return;s.onClick()};return u.addEventListener("click",T),m(),{update:(v)=>{s={...s,...v},m()},dispose:()=>{u.removeEventListener("click",T),u.remove()}}};var Ht=(e,r)=>{G(M);let s=r,u=k("label","oc-sdk oc-sdk-field"),p=k("span","oc-sdk-field-label"),d=s.multiline?k("textarea","oc-sdk-input"):k("input","oc-sdk-input"),m=k("span","oc-sdk-field-note");u.append(p,d,m),e.append(u);let T=()=>{if(F(p,s.label),p.hidden=!s.label,d instanceof HTMLInputElement)d.type=s.password?"password":"text";else d.rows=s.rows??3;if(d.value!==s.value)d.value=s.value;d.disabled=Boolean(s.disabled),te(d,"placeholder",s.placeholder),d.dataset.mono=s.mono?"true":"false";let I=Boolean(s.error);u.dataset.invalid=I?"true":"false",d.setAttribute("aria-invalid",I?"true":"false");let L=s.error??s.helper??"";F(m,L),m.hidden=L===""},v=()=>{s.onChange(d.value)};return d.addEventListener("input",v),T(),{update:(I)=>{s={...s,...I},T()},dispose:()=>{d.removeEventListener("input",v),u.remove()}}};var Bt=Ct(),Vo=document.querySelector("#root");if(!Vo)throw Error("Missing root");var Fo=!1;Bt.onReady((e)=>{if(kt(e,document.documentElement),Fo)return;Fo=!0;let r=document.createElement("div");r.style.cssText="display:flex;align-items:center;gap:8px;height:100%;padding:0 8px;box-sizing:border-box;",Vo.append(r);let s="",u=document.createElement("div");u.style.flex="1",r.append(u);let p=Ht(u,{value:s,placeholder:"https://example.com",mono:!0,onChange:(T)=>{s=T,p.update({value:T})}}),d=de(r,{label:"Go",size:"sm",onClick:()=>{if(!s.trim())return;d.update({loading:!0}),Bt.serviceRequest({method:"POST",path:"/navigate",body:JSON.stringify({url:s.trim()})}).then(()=>m()).finally(()=>d.update({loading:!1}))}}),m=async()=>{try{let T=await Bt.serviceRequest({method:"GET",path:"/state"}),v=JSON.parse(T.body);if(String(v.url)===v.url&&v.url!==s)s=v.url==="about:blank"?"":v.url,p.update({value:s})}catch{}};m(),setInterval(()=>{m()},2000)});})();
