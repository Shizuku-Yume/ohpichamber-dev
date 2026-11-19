(()=>{var _="openchamber.sdk",T=2;var Re="openchamber:guest-bootstrap",Qo=(e,r,s)=>{let{window:l,MessageChannel:p}=globalThis;if(!l||!p)return;try{let m=new p,g=m.port1,E=!1,w=!1,N=null,W=(k)=>{try{k.close()}catch{}},te=(k=[])=>{for(let G of k)W(G);if(!E)E=!0,W(g)},Q=(k)=>{let G=new CustomEvent(s,{detail:k,cancelable:!0});if(!l.dispatchEvent(G))return;W(k),E=!0};l.addEventListener(s,(k)=>{if(!("detail"in k)||k.detail!==null)return;if(w=!0,N){let G=N;N=null,Q(G)}}),g.addEventListener("message",(k)=>{if(E)return;let G=k.data,q=k.ports??[];if(!G||G.channel!==e||G.v!==r||G.type!=="connect-port"||q.length!==1){te(q);return}let Y=q[0];if(E=!0,W(g),Y.start(),!w){N=Y;return}Q(Y)}),g.start(),l.parent.postMessage({channel:e,v:r,type:"bootstrap"},"*",[m.port2])}catch{}},Yo=`(${Qo.toString()})(${JSON.stringify("openchamber.guest-bootstrap")}, 2, ${JSON.stringify("openchamber:guest-bootstrap")});`;var Ze=`
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
`;function et(e){let r=e.documentElement;if(r.hasAttribute("data-oc-scrollbar-activity"))return;r.setAttribute("data-oc-scrollbar-activity","");let s=new WeakMap;e.addEventListener("scroll",(l)=>{let p=l.target===e?r:l.target;if(!(p instanceof Element))return;if(!p.hasAttribute("data-oc-scrolling"))p.setAttribute("data-oc-scrolling","");let m=s.get(p);if(m!==void 0)clearTimeout(m);s.set(p,setTimeout(()=>{s.delete(p),p.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var Zo=`(${et.toString()})(document);`;var tt=128,ot=65536;var xe=128;var Ce=65536;var rt=8000,st=192000,nt=120000;var eo=(e)=>{let r=[],s=0,l=0;return{push:(p)=>{r.push(p),l+=p.length;while(l-s>e&&r.length>1){let m=r.shift();l-=m?.length??0,s=0}},pull:(p)=>{let m=0;while(m<p.length&&r.length>0){let g=r[0],E=Math.min(p.length-m,g.length-s);if(p.set(g.subarray(s,s+E),m),m+=E,s+=E,s>=g.length)r.shift(),l-=g.length,s=0}p.fill(0,m)},clear:()=>{r.length=0,s=0,l=0},get size(){return l-s}}};var so=/^[a-z][a-z0-9-]{0,39}$/;var to=(e)=>Object(e)===e&&!Array.isArray(e),it=(e,r)=>Object.keys(e).every((s)=>r.includes(s)),oo=(e)=>String(e)===e&&e.length>=1&&e.length<=60,ro=(e)=>String(e)===e&&e.length>=1&&e.length<=80,no=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let s of e){if(!to(s)||!so.test(s.id)||!oo(s.label))return!1;if(s.disabled!==void 0&&s.disabled!==!0&&s.disabled!==!1)return!1;if(r.has(s.id))return!1;if(r.add(s.id),s.kind==="button"){if(!it(s,["kind","id","label","disabled"]))return!1;continue}if(s.kind!=="select"||!it(s,["kind","id","label","value","options","disabled"]))return!1;if(!ro(s.value)||!Array.isArray(s.options)||s.options.length<1||s.options.length>16)return!1;let l=new Set;for(let p of s.options){if(!to(p)||!it(p,["value","label"])||!ro(p.value)||!oo(p.label)||l.has(p.value))return!1;l.add(p.value)}if(!l.has(s.value))return!1}return!0};var io=["{id}","{segment}","{segments+}"];var Gr=new Set(io);var ao=["turn-finished","turn-failed","permission-asked","question-asked","turn-started","session-created","session-archived","session-deleted"];var wr=new Set(ao);var ke=20000000,Ie=256;var at=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,lo=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let s=0;s<e.bytes.byteLength;s+=1)if(e.bytes[s]!==r.bytes[s])return!1;return!0};var uo=/^[A-Za-z0-9_-]{1,80}$/;var co=["left","right","top","bottom"];var po=(e,r=0,s={remaining:16000})=>{if(--s.remaining<0||r>=32)return!1;if(e===null)return!0;let l=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let p of l)if(!po(p,r+1,s))return!1;return!0},lt=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(lt);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(lt)}return String(e)===e||Number.isFinite(e)},ut=(e)=>{try{if(String(e.id)!==e.id||!uo.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!co.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!po(e.data)||!lt(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var pt=2000;var Eo=["file","directory","other","missing"],dt=(e)=>Boolean(e&&"sessionId"in e),St=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var go=/^[0-9a-f]{7,64}$/i,Et=(e)=>go.test(e),Pe=500,Me=32000,_o=16000,To=128,mo=200,Ro=2000,fo=16000,ho=80,yo=200,bo=16000;var vo=2000;var gt=20000,Ge=1024,Ue=2000000;var we=64000,Ne=8000,_t=4000;var Tt=960000;var Oo=999,Ao=1e4,fe=500,xo=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],Co=["stopped","starting","ready","failed"],tr=new Set(xo),ko=(e)=>tr.has(e),Io=(e)=>e&&ko(e)?e:"HOST_REJECTED",ae=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(ae);if(Object(e)===e)return Object.values(e).every(ae);return!1},Po=(e)=>ae(e)&&JSON.stringify(e).length<=bo,So=(e)=>e?.trim().slice(0,yo)??"",le=(e)=>{let r=e.id.trim().slice(0,To),s=e.title.trim().slice(0,mo),l=e.url.trim().slice(0,Ro),p=e.text?.trim().slice(0,fo),m=e.author?.trim().slice(0,ho),g=e.kind==="pull"?"pull":"issue",E={providerId:e.providerId.trim(),id:r,title:s||r,url:l,kind:g};if(p)E.text=p;if(m)E.author=m;if(g==="pull"){let w=So(e.branches?.head),N=So(e.branches?.base);if(w&&N)E.branches={head:w,base:N}}if(Po(e.data))E.data=e.data;return E},mt=(e)=>{let r=le(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},Rt=(e)=>{let r={text:e.text.trim().slice(0,_o)};if(e.send)r.send=!0;return r},ft=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(Oo,Math.max(0,Math.round(e)))},ht=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(Ao,Math.max(0,Math.ceil(e)))};var ue=(e)=>e.length>0&&e.length<=Ge&&!e.includes("\x00")&&!e.includes("\\");var Le=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>vo)return!1;return!e.split("/").some((s)=>s==="."||s==="..")},or=new Set(Co),yt=(e)=>Boolean(e&&"status"in e&&or.has(String(e.status))&&!("body"in e)),De=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),bt=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),vt=(e)=>Boolean(e&&"written"in e&&e.written===!0),Ot=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),rr=new Set(Eo),At=(e)=>Boolean(e&&"kind"in e&&"size"in e&&rr.has(String(e.kind))&&Number.isFinite(e.size)),xt=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),sr=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","service-event","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late","microphone-audio","microphone-ended"]),nr=(e)=>Object(e)===e?e:null,ct=(e)=>String(e)===e&&e.length>0,ir=(e)=>{if(!ct(e.id))return null;if(e.ok===!0){let r={channel:_,v:T,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&ct(e.error))return{channel:_,v:T,type:"result",id:e.id,ok:!1,error:e.error,code:Io(ct(e.code)?e.code:void 0)};return null},Ct=(e)=>{let r=nr(e);if(!r||r.channel!==_||r.v!==T)return null;if(r.type==="result")return ir(r);if(!sr.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var Mo=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),ar=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class u extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var Go=()=>Promise.reject(new u("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),He=()=>Promise.reject(new u("BAD_PATH",`File path must be 1 to ${Ge} characters without NUL or backslash.`)),Be=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new u("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},S=(e)=>(e.value+=1,`oc-${e.value}`),kt=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new u("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let s=e.requestTimeoutMs??gt,l=e.acceptSource??((t)=>t===r.parent),p=new Set,m=new Set,g=new Set,E=new Set,w=new Set,N=new Set,W=new Set,te=new Set,Q=new Set,k=new Set,G=new Set,q=new Set,Y=[],Se=null,Ee=null,ye=new Set,be=new Set,ge=null,_e=null,Ke=!1,oe=new Map,re=new Map,se=new Map,B=!1,d={value:0},c=null,K=null,Te=!1,me=!1,Xt=null,L=null,Wt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},ne=null,je=[],D=(t)=>{if(B)return;if(ne){ne.postMessage(t);return}je.push(t)},$t=()=>{if(B||Object.is(r.parent,r)||q.size===0||c?.features?.lateGenerateResults!==!0)return;D({channel:_,v:T,type:"generate-late-listen"})},h=(t,o)=>{for(let i of t)try{i(o)}catch(a){console.error(a)}},qo=(t)=>{if(!("data"in t))return;let o=Ct(t.data);if(!o)return;if(o.type==="workspace"){let a=re.get(o.payload.subscriptionId);if(a)h([a],o.payload.snapshot);return}if(o.type==="shells"){let a=se.get(o.payload.subscriptionId);if(a)h([a],o.payload.snapshot);return}if(o.type==="microphone-audio"){L?.queue.push(o.payload.samples);return}if(o.type==="microphone-ended"){let a=L;if(!a)return;L=null,a.release(),h(a.endedListeners,o.payload.reason);return}if(o.type==="ready"){if(c=o.payload,K=Wt(o.payload.session),h(p,o.payload),h(m,o.payload.directory),h(g,o.payload.session),K)h(E,K);if(h(w,o.payload.connection),h(N,o.payload.settings),h(W,o.payload.item),o.payload.block)h(te,o.payload.block);$t();return}if(o.type==="service-event"){h(Q,o.payload);return}if(o.type==="generate-late"){if(q.size===0)Y.push(o.payload);else h(q,o.payload);return}if(o.type==="directory"){if(c)c={...c,directory:o.payload.directory};h(m,o.payload.directory);return}if(o.type==="session"){if(c)c={...c,session:o.payload.session};if(!o.payload.session)K=null;else if(K?.sessionId!==o.payload.session.id)K=Wt(o.payload.session);h(g,o.payload.session);return}if(o.type==="session-lifecycle"){K=o.payload,h(E,o.payload);return}if(o.type==="connection"){if(c)c={...c,connection:o.payload.connection};h(w,o.payload.connection);return}if(o.type==="settings"){if(c)c={...c,settings:o.payload.settings};h(N,o.payload.settings);return}if(o.type==="item"){if(c)c={...c,item:o.payload.item};h(W,o.payload.item);return}if(o.type==="status-control-event"){h(k,o.payload);return}if(o.type==="popover-closed"){h(G,o.payload);return}if(o.type==="action"){let a=(f)=>{if(!B)D({channel:_,v:T,type:"action-result",id:o.id,payload:f})},R=Ee;if(!R){a({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>R(o.payload)).then(()=>a({ok:!0}),(f)=>{let y=(f instanceof Error?f.message:String(f)).trim();a({ok:!1,error:(y||"Action failed.").slice(0,fe)})});return}if(o.type==="file-open"){let a=o.payload;if(_e&&lo(_e,a))return;_e=a,h(ye,o.payload);return}if(o.type==="file-saved"){h(be,o.payload.version);return}if(o.type==="file-snapshot"){let a=(y)=>{if(!B)D({channel:_,v:T,type:"file-snapshot-result",id:o.id,payload:y})},R=(y)=>a({error:(y.trim()||"Could not read the edited file.").slice(0,fe)}),f=ge;if(!f){R("This extension does not edit files.");return}Promise.resolve().then(()=>f(o.payload.purpose)).then((y)=>{if(at(y)>ke){R(`The file is over ${ke} ${"bytes"in y?"bytes":"characters"}.`);return}if(y.version.length>Ie){R(`The snapshot version is over ${Ie} characters.`);return}a({snapshot:"bytes"in y?{bytes:y.bytes,version:y.version}:{content:y.content,version:y.version}})},(y)=>R(y instanceof Error?y.message:String(y)));return}if(o.type==="resolve"){let a=(f)=>{D({channel:_,v:T,type:"resolve-result",id:o.id,payload:f})},R=Se;if(!R){a({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>R(o.payload)).then((f)=>a({item:f?le(f):null}),(f)=>{let y=(f instanceof Error?f.message:String(f)).trim();a({error:(y||"Command failed.").slice(0,fe)})});return}let i=oe.get(o.id);if(!i)return;if(clearTimeout(i.timer),oe.delete(o.id),o.ok){i.resolve(o.payload);return}i.reject(new u(o.code,o.error))},Ko=(t)=>{if(!("source"in t))return!0;return l(t.source)},qt=(t)=>{if(!Ko(t)||!("detail"in t))return;let o=t.detail;if(!(o instanceof MessagePort))return;t.preventDefault(),t.stopImmediatePropagation(),ne?.close(),ne=o,o.addEventListener("message",qo),o.start(),o.postMessage({channel:_,v:T,type:"hello"});for(let i of je.splice(0))o.postMessage(i)};r.addEventListener(Re,qt),r.dispatchEvent?.(new CustomEvent(Re,{detail:null}));let M=(t,o=s)=>{if(B||Object.is(r.parent,r))return Promise.reject(new u("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((i,a)=>{let R=setTimeout(()=>{oe.delete(t.id),a(new u("HOST_TIMEOUT","Host did not answer in time."))},o);oe.set(t.id,{resolve:i,reject:a,timer:R}),D(t)})},x=(t)=>M(t).then(()=>{return}),v={channel:_,v:T},ze=(t)=>{if(!B&&!Object.is(r.parent,r))D(t)},Kt=()=>ze({...v,type:"file-save"}),Je=()=>{if(!B&&!Object.is(r.parent,r))D({...v,type:"microphone-close",id:S(d)})},jo=async()=>{if(L)throw new u("HOST_REJECTED","The microphone is already open in this frame.");if(c?.features?.microphone!==!0)throw new u("UNSUPPORTED","This OhPiChamber cannot share the microphone with extensions.");let t=globalThis.AudioContext;if(typeof t!=="function")throw new u("UNSUPPORTED","This frame has no Web Audio.");let o=new t;if(o.sampleRate<rt||o.sampleRate>st)throw o.close().catch(()=>{return}),new u("UNSUPPORTED",`Audio at ${o.sampleRate} Hz is not supported.`);let i=o.state==="suspended"?o.resume().catch(()=>{return}):void 0,a=eo(Math.round(o.sampleRate/4)),R=o.createScriptProcessor(1024,1,1);R.onaudioprocess=(F)=>a.pull(F.outputBuffer.getChannelData(0));let f=o.createMediaStreamDestination();R.connect(f);let y=new Set,ie={queue:a,endedListeners:y,release:()=>{R.onaudioprocess=null,R.disconnect(),a.clear();for(let F of f.stream.getTracks())F.stop();o.close().catch(()=>{return})}};L=ie;try{let F=await M({...v,type:"microphone-open",id:S(d),payload:{sampleRate:o.sampleRate}},nt);if(!F||!("opened"in F)||F.opened!==!0)throw new u("HOST_REJECTED","Host did not open the microphone.");if(await i,L!==ie)throw new u("DISCONNECTED","The microphone closed while it was opening.")}catch(F){if(L===ie)L=null;throw ie.release(),Je(),F}return{stream:f.stream,close:()=>{if(L!==ie)return;L=null,ie.release(),Je()},onEnded:(F)=>(y.add(F),()=>{y.delete(F)})}},jt=(t)=>{if(!Mo(t)||!ar(t))return;t.preventDefault(),Kt()},zt=(t)=>{if(!Mo(t)||t.key!=="Escape"||c?.surface!=="popover"||!c.popover)return;t.preventDefault(),Yt(c.popover.id,"escape").catch(()=>{return})},ve=()=>{let t=c?.surface==="popover"?c.popover:void 0;if(!t)return;let o=Te||me;if(Xt===o)return;Xt=o,Zt(t.id,o).catch(()=>{return})},Oe=()=>{if(c?.surface!=="popover"||Te)return;Te=!0,ve()},Jt=(t)=>{if(c?.surface!=="popover"||t.relatedTarget!==null||!Te)return;Te=!1,ve()},Qt=()=>{if(c?.surface!=="popover"||me)return;me=!0,ve()},zo=()=>{if(c?.surface!=="popover"||!me)return;me=!1,ve()},V=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new u("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},Qe=async(t)=>{if(t.kind!=="projects")V(t.projectId);let o=await M({...v,type:"workspace-read",id:S(d),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new u("HOST_REJECTED","Host did not return workspace data.");return o},Ye=async(t,o)=>{if(t.kind!=="projects")V(t.projectId);let i=S(d);re.set(i,o);try{await x({...v,type:"workspace-subscribe",id:S(d),payload:{subscriptionId:i,query:t}})}catch(a){if(re.delete(i),!B)D({...v,type:"workspace-unsubscribe",id:S(d),payload:{subscriptionId:i}});throw a}return()=>{if(!re.delete(i)||B)return;D({...v,type:"workspace-unsubscribe",id:S(d),payload:{subscriptionId:i}})}},Jo=async(t,o)=>{if(t.kind==="session")V(t.sessionId);if(t.kind==="project")V(t.projectId);let i=S(d);se.set(i,o);try{await x({...v,type:"shells-subscribe",id:S(d),payload:{subscriptionId:i,scope:t}})}catch(a){if(se.delete(i),!B)D({...v,type:"shells-unsubscribe",id:S(d),payload:{subscriptionId:i}});throw a}return()=>{if(!se.delete(i)||B)return;D({...v,type:"shells-unsubscribe",id:S(d),payload:{subscriptionId:i}})}},Ae=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>tt))throw new u("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!ae(t.value))throw new u("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>ot)throw new u("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&c?.features?.deviceStorage!==!0)throw new u("UNSUPPORTED","This host does not support device storage.");let o=await M({...v,type:"storage",id:S(d),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new u("HOST_REJECTED","Host did not return storage data.");return o},Yt=(t,o)=>c?.features?.popovers!==!0&&!(c?.surface==="popover"&&c.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):x({...v,type:"popover-close",id:S(d),payload:o?{id:t,reason:o}:{id:t}}),Zt=(t,o)=>c?.features?.popovers!==!0&&!(c?.surface==="popover"&&c.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):x({...v,type:"popover-anchor",id:S(d),payload:{id:t,active:o}});return r.addEventListener("keydown",zt,!0),r.addEventListener("pointerover",Oe),r.addEventListener("pointermove",Oe),r.addEventListener("pointerout",Jt),r.addEventListener("focus",Qt),r.addEventListener("blur",zo),{onAction:(t)=>(Ee=t,()=>{if(Ee===t)Ee=null}),listProjects:async()=>{let t=await Qe({kind:"projects"});if(t.kind!=="projects")throw new u("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await Qe({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new u("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await Qe({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new u("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>Ye({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>Ye({kind:"worktrees",projectId:t},(i)=>{if(i.kind==="worktrees")o(i)}),onSessions:(t,o)=>Ye({kind:"sessions",projectId:t},(i)=>{if(i.kind==="sessions")o(i)}),onRunningShells:(t,o)=>Jo(t,o),readShellOutput:async(t,o)=>{V(t,xe);let i=o?.cursor;if(i!==void 0&&(!Number.isInteger(i)||i<0))throw new u("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let a=o?.tailBytes;if(a!==void 0&&(!Number.isInteger(a)||a<1||a>Ce))throw new u("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${Ce}.`);let f=await M({...v,type:"shell-output",id:S(d),payload:{shellId:t,cursor:i,tailBytes:a}});if(!f||typeof f.output!=="string"||!Number.isFinite(f.cursor))throw new u("HOST_REJECTED","Host did not return shell output.");return f},stopShell:async(t)=>{if(V(t,xe),(await M({...v,type:"shell-stop",id:S(d),payload:{shellId:t}}))?.stopped!==!0)throw new u("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{V(t),await x({...v,type:"open-session",id:S(d),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let i=Be(o),a={op:"get",key:t};if(i)a.scope=i;let R=await Ae(a);return R.op==="get"&&R.found?R.value:void 0},set:async(t,o,i)=>{let a=Be(i),R={op:"set",key:t,value:o};if(a)R.scope=a;await Ae(R)},delete:async(t,o)=>{let i=Be(o),a={op:"delete",key:t};if(i)a.scope=i;await Ae(a)},keys:async(t)=>{let o=Be(t),i={op:"keys"};if(o)i.scope=o;let a=await Ae(i);if(a.op!=="keys")throw new u("HOST_REJECTED","Expected storage keys.");return a.keys}},onReady:(t)=>{if(p.add(t),c)t(c);return()=>{p.delete(t)}},onDirectory:(t)=>{if(m.add(t),c)t(c.directory);return()=>{m.delete(t)}},onSession:(t)=>{if(g.add(t),c)t(c.session);return()=>{g.delete(t)}},onSessionLifecycle:(t)=>{if(E.add(t),K)t(K);return()=>{E.delete(t)}},onConnection:(t)=>{if(w.add(t),c)t(c.connection);return()=>{w.delete(t)}},onSettings:(t)=>{if(N.add(t),c)t(c.settings);return()=>{N.delete(t)}},onItem:(t)=>{if(W.add(t),c)t(c.item);return()=>{W.delete(t)}},onBlock:(t)=>{if(te.add(t),c?.block)t(c.block);return()=>{te.delete(t)}},onServiceEvent:(t)=>(Q.add(t),()=>{Q.delete(t)}),onStatusControl:(t)=>(k.add(t),()=>{k.delete(t)}),onPopoverClosed:(t)=>(G.add(t),()=>{G.delete(t)}),onLateGenerateResult:(t)=>{q.add(t);for(let o of Y.splice(0))h([t],o);return $t(),()=>{q.delete(t)}},setStatusControls:(t)=>{if(c?.features?.statusControls!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support status controls."));if(!no(t))return Promise.reject(new u("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return x({...v,type:"status-controls",id:S(d),payload:{controls:t}})},openPopover:(t)=>{if(c?.features?.popovers!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support popovers."));if(!ut(t))return Promise.reject(new u("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return x({...v,type:"popover-open",id:S(d),payload:t})},closePopover:Yt,setPopoverAnchorActive:Zt,onResolve:(t)=>(Se=t,()=>{if(Se===t)Se=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Pe)return Promise.reject(new u("HOST_REJECTED",`Toast message must contain 1 to ${Pe} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Me))return Promise.reject(new u("HOST_REJECTED",`Toast copy text must contain 1 to ${Me} characters.`));return x({channel:_,v:T,type:"toast",id:S(d),payload:{...t,message:o}})},openUrl:(t)=>x({channel:_,v:T,type:"open-url",id:S(d),payload:{url:t}}),openCommit:(t)=>Et(t)?x({channel:_,v:T,type:"open-commit",id:S(d),payload:{sha:t}}):Promise.reject(new u("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),answerBlock:(t)=>x({channel:_,v:T,type:"block-answer",id:S(d),payload:{text:t.trim().slice(0,pt)}}),openSurface:(t)=>x({channel:_,v:T,type:"open-surface",id:S(d),payload:{surfaceId:t}}),writeClipboard:(t)=>x({channel:_,v:T,type:"clipboard-write",id:S(d),payload:{text:t}}),compose:(t)=>x({channel:_,v:T,type:"compose",id:S(d),payload:t}),attach:(t)=>x({channel:_,v:T,type:"attach",id:S(d),payload:le(t)}),startSession:async(t)=>{if(t.projectId!==void 0)V(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")V(o.directory);else{if(o.name!==void 0)V(o.name,200);if(o.baseBranch!==void 0)V(o.baseBranch,200)}let i=await M({channel:_,v:T,type:"start-session",id:S(d),payload:mt(t)},e.requestTimeoutMs??180000);if(!dt(i))throw new u("HOST_REJECTED","Host did not return a session.");return i},prompt:(t)=>M({channel:_,v:T,type:"prompt",id:S(d),payload:Rt(t)}).then((o)=>{if(!St(o))throw new u("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>x({channel:_,v:T,type:"session-link",id:S(d),payload:le(t)}),close:()=>x({channel:_,v:T,type:"close",id:S(d)}),oauthStart:()=>x({channel:_,v:T,type:"oauth-start",id:S(d)}),oauthDisconnect:()=>x({channel:_,v:T,type:"oauth-disconnect",id:S(d)}),request:(t)=>(Le(t.path)?M({channel:_,v:T,type:"request",id:S(d),payload:t}):Go()).then((o)=>{if(!De(o))throw new u("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:(t)=>(Le(t.path)?M({channel:_,v:T,type:"service-request",id:S(d),payload:t}):Go()).then((o)=>{if(!De(o))throw new u("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>M({channel:_,v:T,type:"service-status",id:S(d)}).then((t)=>{if(!yt(t))throw new u("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(ue(t)?M({channel:_,v:T,type:"file-read",id:S(d),payload:{path:t}}):He()).then((o)=>{if(!bt(o))throw new u("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!ue(t))return He();if(o.length>Ue)return Promise.reject(new u("FILE_TOO_LARGE",`Content is over ${Ue} characters.`));return M({channel:_,v:T,type:"file-write",id:S(d),payload:{path:t,content:o}}).then((i)=>{if(!vt(i))throw new u("HOST_REJECTED","Host did not confirm the write.");return i})},listDir:(t)=>(ue(t)?M({channel:_,v:T,type:"file-list",id:S(d),payload:{path:t}}):He()).then((o)=>{if(!Ot(o))throw new u("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(ue(t)?M({channel:_,v:T,type:"file-stat",id:S(d),payload:{path:t}}):He()).then((o)=>{if(!At(o))throw new u("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),i=t.system?.trim();if(o.length===0||o.length>we)return Promise.reject(new u("HOST_REJECTED",`Prompt must be 1 to ${we} characters.`));if(i!==void 0&&(i.length===0||i.length>Ne))return Promise.reject(new u("HOST_REJECTED",`System prompt must be 1 to ${Ne} characters.`));let a=t.maxOutputTokens===void 0?void 0:Math.min(_t,Math.max(1,Math.floor(t.maxOutputTokens)));if(a!==void 0&&!Number.isFinite(a))return Promise.reject(new u("HOST_REJECTED","maxOutputTokens must be a number."));let R={prompt:o};if(i!==void 0)R.system=i;if(a!==void 0)R.maxOutputTokens=a;return M({channel:_,v:T,type:"generate",id:S(d),payload:R},e.requestTimeoutMs??Tt).then((f)=>{if(!xt(f))throw new u("HOST_REJECTED","Host did not return generated text.");return f})},openMicrophone:jo,setBadge:(t)=>x({channel:_,v:T,type:"badge",id:S(d),payload:{count:ft(t)}}),setHeight:(t)=>x({channel:_,v:T,type:"resize",id:S(d),payload:{height:ht(t)}}),onFileOpen:(t)=>{if(ye.add(t),!Ke)Ke=!0,r.addEventListener("keydown",jt,!0);if(_e)t(_e);return()=>{ye.delete(t)}},onFileSnapshot:(t)=>(ge=t,()=>{if(ge===t)ge=null}),onFileSaved:(t)=>(be.add(t),()=>{be.delete(t)}),reportFileChange:(t)=>ze({...v,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:Kt,reportFileUnsupported:()=>ze({...v,type:"file-unsupported"}),dispose:()=>{for(let t of re.keys())D({...v,type:"workspace-unsubscribe",id:S(d),payload:{subscriptionId:t}});re.clear();for(let t of se.keys())D({...v,type:"shells-unsubscribe",id:S(d),payload:{subscriptionId:t}});if(se.clear(),L)Je(),L.release(),L=null;if(B=!0,Se=null,Ee=null,ge=null,ye.clear(),be.clear(),Ke)r.removeEventListener("keydown",jt,!0);r.removeEventListener(Re,qt),r.removeEventListener("keydown",zt,!0),r.removeEventListener("pointerover",Oe),r.removeEventListener("pointermove",Oe),r.removeEventListener("pointerout",Jt),r.removeEventListener("focus",Qt),ne?.close(),ne=null,je.length=0;for(let t of oe.values())clearTimeout(t.timer),t.reject(new u("HOST_UNAVAILABLE","Host client was disposed."));oe.clear(),p.clear(),m.clear(),g.clear(),E.clear(),w.clear(),N.clear(),W.clear(),te.clear(),Q.clear(),k.clear(),G.clear(),q.clear(),Y.length=0}}};var Uo=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var Zr=new Set(Uo);var wo=["none","agent","user"];var ts=new Set(wo);var lr=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],ur=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],No=(e,r)=>{r.style.colorScheme=e.mode;for(let[s,l]of lr)r.style.setProperty(s,e.tokens[l]);for(let[s,l,p]of ur){let m=e.tokens[p]??"";r.style.setProperty(s,m),r.style.setProperty(l,m)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size",e.tokens.fontSize??"0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},It=(e,r)=>{if(No(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var cr={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},b=(e,r)=>`var(--${e}, var(--oc-${cr[e]}, ${r}))`,z=b("surface-background","transparent"),Ve=b("surface-elevated","transparent"),ce=b("surface-elevated-foreground","inherit"),H=b("surface-foreground","inherit"),O=b("surface-muted-foreground","gray"),pr=b("surface-muted","transparent"),Z=b("interactive-border","currentColor"),U=b("interactive-hover","transparent"),ee=b("interactive-active","transparent"),Pt=b("interactive-selection","transparent"),Mt=b("interactive-selection-foreground","inherit"),j=b("primary","currentColor"),Gt=b("primary-text","inherit"),Ut=b("error-text","inherit"),dr=b("font-sans","inherit"),wt=b("font-mono","monospace"),Bo=b("radius","9px"),Nt=`calc(${Bo} - 2px)`,Lo=`calc(${Bo} - 4px)`,A=(e,r,s="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${s})`,Do=`background-image: linear-gradient(${U}, ${U});`,Lt=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,Dt="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Ho="box-shadow: var(--oc-sdk-lit);",Ht=`inset 0 0.5px 0 0 ${A(H,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,Sr=`
:root {
  --oc-sdk-edge: ${A(H,16)};
  --oc-sdk-field-bg: ${Ve};
  --oc-sdk-raised-bg: ${z};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${A(H,14)};
  --oc-sdk-field-bg: ${A(z,50,Ve)};
  --oc-sdk-raised-bg: ${Ve};
  --oc-sdk-field-lift: ${Ht};
  --oc-sdk-raised-lift: ${Ht};
  --oc-sdk-lit: ${Ht};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,Fe=(e)=>{let r=b(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${b(`${e}-text`,"inherit")}; }`},n=(e)=>`calc(${e}rem / 14)`,Er=`
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
`,Fo=`${Sr}
.oc-sdk { color: ${H}; font-family: ${dr}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${Do} }
.oc-sdk-mono { font-family: ${wt}; }
.oc-sdk-muted { color: ${O}; }
${Fe("success")}${Fe("warning")}${Fe("error")}${Fe("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${j}; --oc-sdk-tone-text: ${Gt}; }

.oc-sdk-btn { border-radius: ${Nt}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${Lo}; }
.oc-sdk-btn[data-variant="default"] { color: ${Gt}; background: ${A(j,10,z)}; border-color: ${A(j,12)}; ${Ho} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${A(j,16,z)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${A(j,22,z)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${pr}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${ee}, ${ee}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${ce}; ${Dt} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${ee}, ${ee}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${U}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${ee}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${b("status-error","red")}; color: ${Ut}; background: ${A("var(--oc-sdk-tone)",7,z)}; border-color: ${A("var(--oc-sdk-tone)",12)}; ${Ho} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${A("var(--oc-sdk-tone)",9,z)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${A("var(--oc-sdk-tone)",11,z)}; box-shadow: none; }

.oc-sdk-field-note { color: ${O}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${Ut}; }
.oc-sdk-input { border-radius: ${Nt}; background: var(--oc-sdk-field-bg); color: ${ce}; ${Lt("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${O}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Lt(A(H,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Lt(b("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${wt}; }

.oc-sdk-search-icon { color: ${O}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${j}; }
.oc-sdk-search-clear { border-radius: ${Lo}; color: ${O}; }
.oc-sdk-search-clear:hover { background: ${U}; color: ${H}; }

.oc-sdk-trigger { border-radius: ${Nt}; background: var(--oc-sdk-raised-bg); color: ${ce}; ${Dt} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${ee}, ${ee}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${O}; }
.oc-sdk-trigger-chevron { color: ${O}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${ce}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${Ve}; background-clip: padding-box; color: ${ce}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${U}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${Pt}; color: ${Mt}; }
.oc-sdk-option-check { color: ${H}; }
.oc-sdk-option[data-destructive="true"] { color: ${Ut}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${A(b("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${O}; }
.oc-sdk-popup-empty { color: ${O}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${Z}; border-radius: 4px; color: ${H}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${A(H,60,Z)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${Z}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${z}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${j}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(var(--oc-sdk-thumb-travel, 16px)); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${Do} }
.oc-sdk-check-desc { color: ${O}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${A(H,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${O}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${H}; }
.oc-sdk-tab[aria-selected="true"] { color: ${Mt}; background: ${Pt}; border-color: ${Z}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${ce}; background: var(--oc-sdk-raised-bg); ${Dt} }
.oc-sdk-tab-count { color: ${O}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${A(H,6)}; color: ${O}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${A("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${U}; }
.oc-sdk-row[aria-selected="true"] { background: ${Pt}; color: ${Mt}; }
.oc-sdk-row-lead { font-family: ${wt}; color: ${O}; }
.oc-sdk-row-sub { color: ${O}; }
.oc-sdk-row-meta { color: ${O}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${O}; }

.oc-sdk-empty-body { color: ${O}; }

.oc-sdk-spinner { color: ${O}; }
.oc-sdk-spinner-ring { border-color: ${Z}; border-top-color: ${j}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${A("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${O}; }

.oc-sdk-separator { color: ${O}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${A(Z,40)}; }

.oc-sdk-progress-label { color: ${O}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${A(H,6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${j}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${b("status-success","currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${b("success-text","inherit")}; }

.oc-sdk-text a { color: ${Gt}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${A(Z,60)}; }
`,I=`
${Ze}
${Er}
${Fo}`;var Vo="oc-sdk-ui-style",pe=(e)=>{while(e.firstChild)e.removeChild(e.firstChild)},P=(e)=>{let r=document.getElementById(Vo);if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}et(document);let s=document.createElement("style");s.id=Vo,s.textContent=e,document.head.appendChild(s)},C=(e,r)=>{let s=document.createElement(e);if(r)s.className=r;return s},J=(e)=>{let r=C("button",e);return r.type="button",r},X=(e,r)=>{let s=r??"";if(e.textContent!==s)e.textContent=s};var gr=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},de=(e,r)=>{P(I);let s=r,l=J("oc-sdk oc-sdk-btn"),p=gr(),m=document.createElement("span");l.append(m),e.append(l);let g=()=>{if(l.dataset.variant=s.variant??"default",l.dataset.size=s.size??"default",l.disabled=Boolean(s.disabled)||Boolean(s.loading),l.dataset.loading=s.loading?"true":"false",l.setAttribute("aria-busy",s.loading?"true":"false"),s.loading&&p.parentNode!==l)l.prepend(p);else if(!s.loading&&p.parentNode===l)p.remove();X(m,s.label)},E=()=>{if(s.disabled||s.loading)return;s.onClick()};return l.addEventListener("click",E),g(),{update:(w)=>{s={...s,...w},g()},dispose:()=>{l.removeEventListener("click",E),l.remove()}}};var fr=/(!?)\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,hr=(e)=>{try{let r=new URL(e);return r.protocol==="http:"||r.protocol==="https:"}catch{return!1}},Xo=(e)=>{let r=[],s=0;for(let l of e.matchAll(fr)){let p=l.index??0;if(p>s)r.push({kind:"text",text:e.slice(s,p)});let m=l[1]??"",g=(l[2]??"").trim(),E=l[3]??"";if(!hr(E))r.push({kind:"text",text:l[0]});else if(m==="!")r.push({kind:"image",src:E,alt:g});else r.push({kind:"link",href:E,label:g||E});s=p+l[0].length}if(s<e.length)r.push({kind:"text",text:e.slice(s)});return r},Bt=(e,r)=>{P(I);let s=r,l=C("div","oc-sdk oc-sdk-text");e.append(l);let p=(g)=>{if(!(g.target instanceof HTMLAnchorElement)||!s.onOpenUrl)return;g.preventDefault(),s.onOpenUrl(g.target.href)},m=()=>{pe(l);for(let g of Xo(s.text))if(g.kind==="text")l.append(document.createTextNode(g.text));else if(g.kind==="link"){let E=C("a");E.href=g.href,E.rel="noopener noreferrer",E.target="_blank",E.textContent=g.label,l.append(E)}else{let E=C("img");E.src=g.src,E.alt=g.alt,E.loading="lazy",E.referrerPolicy="no-referrer",l.append(E)}};return l.addEventListener("click",p),m(),{update:(g)=>{s={...s,...g},m()},dispose:()=>{l.removeEventListener("click",p),l.remove()}}};var Ft=kt(),qe=document.querySelector("#root");if(!qe)throw Error("Agent Desk: missing root");var $o=document.createElement("div"),Vt=(e)=>{let r=document.createElement("div");r.textContent=e,$o.prepend(r)},Wo=!1;Ft.onReady((e)=>{if(It(e,document.documentElement),Wo)return;Wo=!0,Bt(qe,{text:"Agent Desk"}),de(qe,{label:"Start a session",onClick:()=>{Ft.serviceRequest({method:"POST",path:"/start",body:JSON.stringify({directory:e.directory})}).then((r)=>Vt(r.body)).catch(()=>Vt("The service did not answer."))}}),qe.append($o)});Ft.onServiceEvent(({topic:e,data:r})=>Vt(`${e}: ${JSON.stringify(r)}`));})();
