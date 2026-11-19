(()=>{var _="openchamber.sdk",T=2;var ye="openchamber:guest-bootstrap",nr=(e,r,s)=>{let{window:i,MessageChannel:c}=globalThis;if(!i||!c)return;try{let E=new c,m=E.port1,g=!1,C=!1,I=null,W=(P)=>{try{P.close()}catch{}},ne=(P=[])=>{for(let w of P)W(w);if(!g)g=!0,W(m)},Z=(P)=>{let w=new CustomEvent(s,{detail:P,cancelable:!0});if(!i.dispatchEvent(w))return;W(P),g=!0};i.addEventListener(s,(P)=>{if(!("detail"in P)||P.detail!==null)return;if(C=!0,I){let w=I;I=null,Z(w)}}),m.addEventListener("message",(P)=>{if(g)return;let w=P.data,q=P.ports??[];if(!w||w.channel!==e||w.v!==r||w.type!=="connect-port"||q.length!==1){ne(q);return}let ee=q[0];if(g=!0,W(m),ee.start(),!C){I=ee;return}Z(ee)}),m.start(),i.parent.postMessage({channel:e,v:r,type:"bootstrap"},"*",[E.port2])}catch{}},ir=`(${nr.toString()})(${JSON.stringify("openchamber.guest-bootstrap")}, 2, ${JSON.stringify("openchamber:guest-bootstrap")});`;var nt=`
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
`;function it(e){let r=e.documentElement;if(r.hasAttribute("data-oc-scrollbar-activity"))return;r.setAttribute("data-oc-scrollbar-activity","");let s=new WeakMap;e.addEventListener("scroll",(i)=>{let c=i.target===e?r:i.target;if(!(c instanceof Element))return;if(!c.hasAttribute("data-oc-scrolling"))c.setAttribute("data-oc-scrolling","");let E=s.get(c);if(E!==void 0)clearTimeout(E);s.set(c,setTimeout(()=>{s.delete(c),c.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var ar=`(${it.toString()})(document);`;var at=128,lt=65536;var Ie=128;var Pe=65536;var ct=8000,ut=192000,pt=120000;var ao=(e)=>{let r=[],s=0,i=0;return{push:(c)=>{r.push(c),i+=c.length;while(i-s>e&&r.length>1){let E=r.shift();i-=E?.length??0,s=0}},pull:(c)=>{let E=0;while(E<c.length&&r.length>0){let m=r[0],g=Math.min(c.length-E,m.length-s);if(c.set(m.subarray(s,s+g),E),E+=g,s+=g,s>=m.length)r.shift(),i-=m.length,s=0}c.fill(0,E)},clear:()=>{r.length=0,s=0,i=0},get size(){return i-s}}};var po=/^[a-z][a-z0-9-]{0,39}$/;var lo=(e)=>Object(e)===e&&!Array.isArray(e),dt=(e,r)=>Object.keys(e).every((s)=>r.includes(s)),co=(e)=>String(e)===e&&e.length>=1&&e.length<=60,uo=(e)=>String(e)===e&&e.length>=1&&e.length<=80,So=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let s of e){if(!lo(s)||!po.test(s.id)||!co(s.label))return!1;if(s.disabled!==void 0&&s.disabled!==!0&&s.disabled!==!1)return!1;if(r.has(s.id))return!1;if(r.add(s.id),s.kind==="button"){if(!dt(s,["kind","id","label","disabled"]))return!1;continue}if(s.kind!=="select"||!dt(s,["kind","id","label","value","options","disabled"]))return!1;if(!uo(s.value)||!Array.isArray(s.options)||s.options.length<1||s.options.length>16)return!1;let i=new Set;for(let c of s.options){if(!lo(c)||!dt(c,["value","label"])||!uo(c.value)||!co(c.label)||i.has(c.value))return!1;i.add(c.value)}if(!i.has(s.value))return!1}return!0};var Eo=["{id}","{segment}","{segments+}"];var Fr=new Set(Eo);var go=["turn-finished","turn-failed","permission-asked","question-asked","turn-started","session-created","session-archived","session-deleted"];var Vr=new Set(go);var Me=20000000,Ge=256;var St=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,_o=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let s=0;s<e.bytes.byteLength;s+=1)if(e.bytes[s]!==r.bytes[s])return!1;return!0},Ue=(e)=>{let r=e,s=e;return{observe:(i)=>{let c=i!==s;return s=i,{edited:c,dirty:i!==r}},markSaved:(i)=>(r=i,s!==i)}};var To=/^[A-Za-z0-9_-]{1,80}$/;var mo=["left","right","top","bottom"];var Ro=(e,r=0,s={remaining:16000})=>{if(--s.remaining<0||r>=32)return!1;if(e===null)return!0;let i=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let c of i)if(!Ro(c,r+1,s))return!1;return!0},Et=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(Et);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(Et)}return String(e)===e||Number.isFinite(e)},gt=(e)=>{try{if(String(e.id)!==e.id||!To.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!mo.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!Ro(e.data)||!Et(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var Tt=2000;var fo=["file","directory","other","missing"],mt=(e)=>Boolean(e&&"sessionId"in e),Rt=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var yo=/^[0-9a-f]{7,64}$/i,ht=(e)=>yo.test(e),we=500,Ne=32000,bo=16000,vo=128,Oo=200,Ao=2000,xo=16000,Co=80,ko=200,Io=16000;var Po=2000;var ft=20000,Le=1024,De=2000000;var He=64000,Fe=8000,yt=4000;var bt=960000;var Mo=999,Go=1e4,be=500,Uo=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],wo=["stopped","starting","ready","failed"],cr=new Set(Uo),No=(e)=>cr.has(e),Lo=(e)=>e&&No(e)?e:"HOST_REJECTED",pe=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(pe);if(Object(e)===e)return Object.values(e).every(pe);return!1},Do=(e)=>pe(e)&&JSON.stringify(e).length<=Io,ho=(e)=>e?.trim().slice(0,ko)??"",de=(e)=>{let r=e.id.trim().slice(0,vo),s=e.title.trim().slice(0,Oo),i=e.url.trim().slice(0,Ao),c=e.text?.trim().slice(0,xo),E=e.author?.trim().slice(0,Co),m=e.kind==="pull"?"pull":"issue",g={providerId:e.providerId.trim(),id:r,title:s||r,url:i,kind:m};if(c)g.text=c;if(E)g.author=E;if(m==="pull"){let C=ho(e.branches?.head),I=ho(e.branches?.base);if(C&&I)g.branches={head:C,base:I}}if(Do(e.data))g.data=e.data;return g},vt=(e)=>{let r=de(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},Ot=(e)=>{let r={text:e.text.trim().slice(0,bo)};if(e.send)r.send=!0;return r},At=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(Mo,Math.max(0,Math.round(e)))},xt=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(Go,Math.max(0,Math.ceil(e)))};var Se=(e)=>e.length>0&&e.length<=Le&&!e.includes("\x00")&&!e.includes("\\");var Be=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>Po)return!1;return!e.split("/").some((s)=>s==="."||s==="..")},ur=new Set(wo),Ct=(e)=>Boolean(e&&"status"in e&&ur.has(String(e.status))&&!("body"in e)),Ve=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),kt=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),It=(e)=>Boolean(e&&"written"in e&&e.written===!0),Pt=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),pr=new Set(fo),Mt=(e)=>Boolean(e&&"kind"in e&&"size"in e&&pr.has(String(e.kind))&&Number.isFinite(e.size)),Gt=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),dr=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","service-event","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late","microphone-audio","microphone-ended"]),Sr=(e)=>Object(e)===e?e:null,_t=(e)=>String(e)===e&&e.length>0,Er=(e)=>{if(!_t(e.id))return null;if(e.ok===!0){let r={channel:_,v:T,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&_t(e.error))return{channel:_,v:T,type:"result",id:e.id,ok:!1,error:e.error,code:Lo(_t(e.code)?e.code:void 0)};return null},Ut=(e)=>{let r=Sr(e);if(!r||r.channel!==_||r.v!==T)return null;if(r.type==="result")return Er(r);if(!dr.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var Ho=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),gr=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class u extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var Fo=()=>Promise.reject(new u("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),Xe=()=>Promise.reject(new u("BAD_PATH",`File path must be 1 to ${Le} characters without NUL or backslash.`)),We=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new u("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},S=(e)=>(e.value+=1,`oc-${e.value}`),wt=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new u("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let s=e.requestTimeoutMs??ft,i=e.acceptSource??((t)=>t===r.parent),c=new Set,E=new Set,m=new Set,g=new Set,C=new Set,I=new Set,W=new Set,ne=new Set,Z=new Set,P=new Set,w=new Set,q=new Set,ee=[],_e=null,Te=null,Oe=new Set,Ae=new Set,me=null,Re=null,Ze=!1,ie=new Map,ae=new Map,le=new Map,B=!1,d={value:0},p=null,K=null,he=!1,fe=!1,Jt=null,L=null,Qt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},ce=null,et=[],D=(t)=>{if(B)return;if(ce){ce.postMessage(t);return}et.push(t)},Yt=()=>{if(B||Object.is(r.parent,r)||q.size===0||p?.features?.lateGenerateResults!==!0)return;D({channel:_,v:T,type:"generate-late-listen"})},f=(t,o)=>{for(let a of t)try{a(o)}catch(l){console.error(l)}},er=(t)=>{if(!("data"in t))return;let o=Ut(t.data);if(!o)return;if(o.type==="workspace"){let l=ae.get(o.payload.subscriptionId);if(l)f([l],o.payload.snapshot);return}if(o.type==="shells"){let l=le.get(o.payload.subscriptionId);if(l)f([l],o.payload.snapshot);return}if(o.type==="microphone-audio"){L?.queue.push(o.payload.samples);return}if(o.type==="microphone-ended"){let l=L;if(!l)return;L=null,l.release(),f(l.endedListeners,o.payload.reason);return}if(o.type==="ready"){if(p=o.payload,K=Qt(o.payload.session),f(c,o.payload),f(E,o.payload.directory),f(m,o.payload.session),K)f(g,K);if(f(C,o.payload.connection),f(I,o.payload.settings),f(W,o.payload.item),o.payload.block)f(ne,o.payload.block);Yt();return}if(o.type==="service-event"){f(Z,o.payload);return}if(o.type==="generate-late"){if(q.size===0)ee.push(o.payload);else f(q,o.payload);return}if(o.type==="directory"){if(p)p={...p,directory:o.payload.directory};f(E,o.payload.directory);return}if(o.type==="session"){if(p)p={...p,session:o.payload.session};if(!o.payload.session)K=null;else if(K?.sessionId!==o.payload.session.id)K=Qt(o.payload.session);f(m,o.payload.session);return}if(o.type==="session-lifecycle"){K=o.payload,f(g,o.payload);return}if(o.type==="connection"){if(p)p={...p,connection:o.payload.connection};f(C,o.payload.connection);return}if(o.type==="settings"){if(p)p={...p,settings:o.payload.settings};f(I,o.payload.settings);return}if(o.type==="item"){if(p)p={...p,item:o.payload.item};f(W,o.payload.item);return}if(o.type==="status-control-event"){f(P,o.payload);return}if(o.type==="popover-closed"){f(w,o.payload);return}if(o.type==="action"){let l=(h)=>{if(!B)D({channel:_,v:T,type:"action-result",id:o.id,payload:h})},R=Te;if(!R){l({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>R(o.payload)).then(()=>l({ok:!0}),(h)=>{let y=(h instanceof Error?h.message:String(h)).trim();l({ok:!1,error:(y||"Action failed.").slice(0,be)})});return}if(o.type==="file-open"){let l=o.payload;if(Re&&_o(Re,l))return;Re=l,f(Oe,o.payload);return}if(o.type==="file-saved"){f(Ae,o.payload.version);return}if(o.type==="file-snapshot"){let l=(y)=>{if(!B)D({channel:_,v:T,type:"file-snapshot-result",id:o.id,payload:y})},R=(y)=>l({error:(y.trim()||"Could not read the edited file.").slice(0,be)}),h=me;if(!h){R("This extension does not edit files.");return}Promise.resolve().then(()=>h(o.payload.purpose)).then((y)=>{if(St(y)>Me){R(`The file is over ${Me} ${"bytes"in y?"bytes":"characters"}.`);return}if(y.version.length>Ge){R(`The snapshot version is over ${Ge} characters.`);return}l({snapshot:"bytes"in y?{bytes:y.bytes,version:y.version}:{content:y.content,version:y.version}})},(y)=>R(y instanceof Error?y.message:String(y)));return}if(o.type==="resolve"){let l=(h)=>{D({channel:_,v:T,type:"resolve-result",id:o.id,payload:h})},R=_e;if(!R){l({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>R(o.payload)).then((h)=>l({item:h?de(h):null}),(h)=>{let y=(h instanceof Error?h.message:String(h)).trim();l({error:(y||"Command failed.").slice(0,be)})});return}let a=ie.get(o.id);if(!a)return;if(clearTimeout(a.timer),ie.delete(o.id),o.ok){a.resolve(o.payload);return}a.reject(new u(o.code,o.error))},tr=(t)=>{if(!("source"in t))return!0;return i(t.source)},Zt=(t)=>{if(!tr(t)||!("detail"in t))return;let o=t.detail;if(!(o instanceof MessagePort))return;t.preventDefault(),t.stopImmediatePropagation(),ce?.close(),ce=o,o.addEventListener("message",er),o.start(),o.postMessage({channel:_,v:T,type:"hello"});for(let a of et.splice(0))o.postMessage(a)};r.addEventListener(ye,Zt),r.dispatchEvent?.(new CustomEvent(ye,{detail:null}));let U=(t,o=s)=>{if(B||Object.is(r.parent,r))return Promise.reject(new u("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((a,l)=>{let R=setTimeout(()=>{ie.delete(t.id),l(new u("HOST_TIMEOUT","Host did not answer in time."))},o);ie.set(t.id,{resolve:a,reject:l,timer:R}),D(t)})},x=(t)=>U(t).then(()=>{return}),v={channel:_,v:T},tt=(t)=>{if(!B&&!Object.is(r.parent,r))D(t)},eo=()=>tt({...v,type:"file-save"}),ot=()=>{if(!B&&!Object.is(r.parent,r))D({...v,type:"microphone-close",id:S(d)})},or=async()=>{if(L)throw new u("HOST_REJECTED","The microphone is already open in this frame.");if(p?.features?.microphone!==!0)throw new u("UNSUPPORTED","This OhPiChamber cannot share the microphone with extensions.");let t=globalThis.AudioContext;if(typeof t!=="function")throw new u("UNSUPPORTED","This frame has no Web Audio.");let o=new t;if(o.sampleRate<ct||o.sampleRate>ut)throw o.close().catch(()=>{return}),new u("UNSUPPORTED",`Audio at ${o.sampleRate} Hz is not supported.`);let a=o.state==="suspended"?o.resume().catch(()=>{return}):void 0,l=ao(Math.round(o.sampleRate/4)),R=o.createScriptProcessor(1024,1,1);R.onaudioprocess=(V)=>l.pull(V.outputBuffer.getChannelData(0));let h=o.createMediaStreamDestination();R.connect(h);let y=new Set,ue={queue:l,endedListeners:y,release:()=>{R.onaudioprocess=null,R.disconnect(),l.clear();for(let V of h.stream.getTracks())V.stop();o.close().catch(()=>{return})}};L=ue;try{let V=await U({...v,type:"microphone-open",id:S(d),payload:{sampleRate:o.sampleRate}},pt);if(!V||!("opened"in V)||V.opened!==!0)throw new u("HOST_REJECTED","Host did not open the microphone.");if(await a,L!==ue)throw new u("DISCONNECTED","The microphone closed while it was opening.")}catch(V){if(L===ue)L=null;throw ue.release(),ot(),V}return{stream:h.stream,close:()=>{if(L!==ue)return;L=null,ue.release(),ot()},onEnded:(V)=>(y.add(V),()=>{y.delete(V)})}},to=(t)=>{if(!Ho(t)||!gr(t))return;t.preventDefault(),eo()},oo=(t)=>{if(!Ho(t)||t.key!=="Escape"||p?.surface!=="popover"||!p.popover)return;t.preventDefault(),no(p.popover.id,"escape").catch(()=>{return})},xe=()=>{let t=p?.surface==="popover"?p.popover:void 0;if(!t)return;let o=he||fe;if(Jt===o)return;Jt=o,io(t.id,o).catch(()=>{return})},Ce=()=>{if(p?.surface!=="popover"||he)return;he=!0,xe()},ro=(t)=>{if(p?.surface!=="popover"||t.relatedTarget!==null||!he)return;he=!1,xe()},so=()=>{if(p?.surface!=="popover"||fe)return;fe=!0,xe()},rr=()=>{if(p?.surface!=="popover"||!fe)return;fe=!1,xe()},X=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new u("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},rt=async(t)=>{if(t.kind!=="projects")X(t.projectId);let o=await U({...v,type:"workspace-read",id:S(d),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new u("HOST_REJECTED","Host did not return workspace data.");return o},st=async(t,o)=>{if(t.kind!=="projects")X(t.projectId);let a=S(d);ae.set(a,o);try{await x({...v,type:"workspace-subscribe",id:S(d),payload:{subscriptionId:a,query:t}})}catch(l){if(ae.delete(a),!B)D({...v,type:"workspace-unsubscribe",id:S(d),payload:{subscriptionId:a}});throw l}return()=>{if(!ae.delete(a)||B)return;D({...v,type:"workspace-unsubscribe",id:S(d),payload:{subscriptionId:a}})}},sr=async(t,o)=>{if(t.kind==="session")X(t.sessionId);if(t.kind==="project")X(t.projectId);let a=S(d);le.set(a,o);try{await x({...v,type:"shells-subscribe",id:S(d),payload:{subscriptionId:a,scope:t}})}catch(l){if(le.delete(a),!B)D({...v,type:"shells-unsubscribe",id:S(d),payload:{subscriptionId:a}});throw l}return()=>{if(!le.delete(a)||B)return;D({...v,type:"shells-unsubscribe",id:S(d),payload:{subscriptionId:a}})}},ke=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>at))throw new u("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!pe(t.value))throw new u("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>lt)throw new u("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&p?.features?.deviceStorage!==!0)throw new u("UNSUPPORTED","This host does not support device storage.");let o=await U({...v,type:"storage",id:S(d),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new u("HOST_REJECTED","Host did not return storage data.");return o},no=(t,o)=>p?.features?.popovers!==!0&&!(p?.surface==="popover"&&p.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):x({...v,type:"popover-close",id:S(d),payload:o?{id:t,reason:o}:{id:t}}),io=(t,o)=>p?.features?.popovers!==!0&&!(p?.surface==="popover"&&p.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):x({...v,type:"popover-anchor",id:S(d),payload:{id:t,active:o}});return r.addEventListener("keydown",oo,!0),r.addEventListener("pointerover",Ce),r.addEventListener("pointermove",Ce),r.addEventListener("pointerout",ro),r.addEventListener("focus",so),r.addEventListener("blur",rr),{onAction:(t)=>(Te=t,()=>{if(Te===t)Te=null}),listProjects:async()=>{let t=await rt({kind:"projects"});if(t.kind!=="projects")throw new u("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await rt({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new u("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await rt({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new u("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>st({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>st({kind:"worktrees",projectId:t},(a)=>{if(a.kind==="worktrees")o(a)}),onSessions:(t,o)=>st({kind:"sessions",projectId:t},(a)=>{if(a.kind==="sessions")o(a)}),onRunningShells:(t,o)=>sr(t,o),readShellOutput:async(t,o)=>{X(t,Ie);let a=o?.cursor;if(a!==void 0&&(!Number.isInteger(a)||a<0))throw new u("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let l=o?.tailBytes;if(l!==void 0&&(!Number.isInteger(l)||l<1||l>Pe))throw new u("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${Pe}.`);let h=await U({...v,type:"shell-output",id:S(d),payload:{shellId:t,cursor:a,tailBytes:l}});if(!h||typeof h.output!=="string"||!Number.isFinite(h.cursor))throw new u("HOST_REJECTED","Host did not return shell output.");return h},stopShell:async(t)=>{if(X(t,Ie),(await U({...v,type:"shell-stop",id:S(d),payload:{shellId:t}}))?.stopped!==!0)throw new u("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{X(t),await x({...v,type:"open-session",id:S(d),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let a=We(o),l={op:"get",key:t};if(a)l.scope=a;let R=await ke(l);return R.op==="get"&&R.found?R.value:void 0},set:async(t,o,a)=>{let l=We(a),R={op:"set",key:t,value:o};if(l)R.scope=l;await ke(R)},delete:async(t,o)=>{let a=We(o),l={op:"delete",key:t};if(a)l.scope=a;await ke(l)},keys:async(t)=>{let o=We(t),a={op:"keys"};if(o)a.scope=o;let l=await ke(a);if(l.op!=="keys")throw new u("HOST_REJECTED","Expected storage keys.");return l.keys}},onReady:(t)=>{if(c.add(t),p)t(p);return()=>{c.delete(t)}},onDirectory:(t)=>{if(E.add(t),p)t(p.directory);return()=>{E.delete(t)}},onSession:(t)=>{if(m.add(t),p)t(p.session);return()=>{m.delete(t)}},onSessionLifecycle:(t)=>{if(g.add(t),K)t(K);return()=>{g.delete(t)}},onConnection:(t)=>{if(C.add(t),p)t(p.connection);return()=>{C.delete(t)}},onSettings:(t)=>{if(I.add(t),p)t(p.settings);return()=>{I.delete(t)}},onItem:(t)=>{if(W.add(t),p)t(p.item);return()=>{W.delete(t)}},onBlock:(t)=>{if(ne.add(t),p?.block)t(p.block);return()=>{ne.delete(t)}},onServiceEvent:(t)=>(Z.add(t),()=>{Z.delete(t)}),onStatusControl:(t)=>(P.add(t),()=>{P.delete(t)}),onPopoverClosed:(t)=>(w.add(t),()=>{w.delete(t)}),onLateGenerateResult:(t)=>{q.add(t);for(let o of ee.splice(0))f([t],o);return Yt(),()=>{q.delete(t)}},setStatusControls:(t)=>{if(p?.features?.statusControls!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support status controls."));if(!So(t))return Promise.reject(new u("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return x({...v,type:"status-controls",id:S(d),payload:{controls:t}})},openPopover:(t)=>{if(p?.features?.popovers!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support popovers."));if(!gt(t))return Promise.reject(new u("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return x({...v,type:"popover-open",id:S(d),payload:t})},closePopover:no,setPopoverAnchorActive:io,onResolve:(t)=>(_e=t,()=>{if(_e===t)_e=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>we)return Promise.reject(new u("HOST_REJECTED",`Toast message must contain 1 to ${we} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Ne))return Promise.reject(new u("HOST_REJECTED",`Toast copy text must contain 1 to ${Ne} characters.`));return x({channel:_,v:T,type:"toast",id:S(d),payload:{...t,message:o}})},openUrl:(t)=>x({channel:_,v:T,type:"open-url",id:S(d),payload:{url:t}}),openCommit:(t)=>ht(t)?x({channel:_,v:T,type:"open-commit",id:S(d),payload:{sha:t}}):Promise.reject(new u("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),answerBlock:(t)=>x({channel:_,v:T,type:"block-answer",id:S(d),payload:{text:t.trim().slice(0,Tt)}}),openSurface:(t)=>x({channel:_,v:T,type:"open-surface",id:S(d),payload:{surfaceId:t}}),writeClipboard:(t)=>x({channel:_,v:T,type:"clipboard-write",id:S(d),payload:{text:t}}),compose:(t)=>x({channel:_,v:T,type:"compose",id:S(d),payload:t}),attach:(t)=>x({channel:_,v:T,type:"attach",id:S(d),payload:de(t)}),startSession:async(t)=>{if(t.projectId!==void 0)X(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")X(o.directory);else{if(o.name!==void 0)X(o.name,200);if(o.baseBranch!==void 0)X(o.baseBranch,200)}let a=await U({channel:_,v:T,type:"start-session",id:S(d),payload:vt(t)},e.requestTimeoutMs??180000);if(!mt(a))throw new u("HOST_REJECTED","Host did not return a session.");return a},prompt:(t)=>U({channel:_,v:T,type:"prompt",id:S(d),payload:Ot(t)}).then((o)=>{if(!Rt(o))throw new u("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>x({channel:_,v:T,type:"session-link",id:S(d),payload:de(t)}),close:()=>x({channel:_,v:T,type:"close",id:S(d)}),oauthStart:()=>x({channel:_,v:T,type:"oauth-start",id:S(d)}),oauthDisconnect:()=>x({channel:_,v:T,type:"oauth-disconnect",id:S(d)}),request:(t)=>(Be(t.path)?U({channel:_,v:T,type:"request",id:S(d),payload:t}):Fo()).then((o)=>{if(!Ve(o))throw new u("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:(t)=>(Be(t.path)?U({channel:_,v:T,type:"service-request",id:S(d),payload:t}):Fo()).then((o)=>{if(!Ve(o))throw new u("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>U({channel:_,v:T,type:"service-status",id:S(d)}).then((t)=>{if(!Ct(t))throw new u("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(Se(t)?U({channel:_,v:T,type:"file-read",id:S(d),payload:{path:t}}):Xe()).then((o)=>{if(!kt(o))throw new u("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!Se(t))return Xe();if(o.length>De)return Promise.reject(new u("FILE_TOO_LARGE",`Content is over ${De} characters.`));return U({channel:_,v:T,type:"file-write",id:S(d),payload:{path:t,content:o}}).then((a)=>{if(!It(a))throw new u("HOST_REJECTED","Host did not confirm the write.");return a})},listDir:(t)=>(Se(t)?U({channel:_,v:T,type:"file-list",id:S(d),payload:{path:t}}):Xe()).then((o)=>{if(!Pt(o))throw new u("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(Se(t)?U({channel:_,v:T,type:"file-stat",id:S(d),payload:{path:t}}):Xe()).then((o)=>{if(!Mt(o))throw new u("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),a=t.system?.trim();if(o.length===0||o.length>He)return Promise.reject(new u("HOST_REJECTED",`Prompt must be 1 to ${He} characters.`));if(a!==void 0&&(a.length===0||a.length>Fe))return Promise.reject(new u("HOST_REJECTED",`System prompt must be 1 to ${Fe} characters.`));let l=t.maxOutputTokens===void 0?void 0:Math.min(yt,Math.max(1,Math.floor(t.maxOutputTokens)));if(l!==void 0&&!Number.isFinite(l))return Promise.reject(new u("HOST_REJECTED","maxOutputTokens must be a number."));let R={prompt:o};if(a!==void 0)R.system=a;if(l!==void 0)R.maxOutputTokens=l;return U({channel:_,v:T,type:"generate",id:S(d),payload:R},e.requestTimeoutMs??bt).then((h)=>{if(!Gt(h))throw new u("HOST_REJECTED","Host did not return generated text.");return h})},openMicrophone:or,setBadge:(t)=>x({channel:_,v:T,type:"badge",id:S(d),payload:{count:At(t)}}),setHeight:(t)=>x({channel:_,v:T,type:"resize",id:S(d),payload:{height:xt(t)}}),onFileOpen:(t)=>{if(Oe.add(t),!Ze)Ze=!0,r.addEventListener("keydown",to,!0);if(Re)t(Re);return()=>{Oe.delete(t)}},onFileSnapshot:(t)=>(me=t,()=>{if(me===t)me=null}),onFileSaved:(t)=>(Ae.add(t),()=>{Ae.delete(t)}),reportFileChange:(t)=>tt({...v,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:eo,reportFileUnsupported:()=>tt({...v,type:"file-unsupported"}),dispose:()=>{for(let t of ae.keys())D({...v,type:"workspace-unsubscribe",id:S(d),payload:{subscriptionId:t}});ae.clear();for(let t of le.keys())D({...v,type:"shells-unsubscribe",id:S(d),payload:{subscriptionId:t}});if(le.clear(),L)ot(),L.release(),L=null;if(B=!0,_e=null,Te=null,me=null,Oe.clear(),Ae.clear(),Ze)r.removeEventListener("keydown",to,!0);r.removeEventListener(ye,Zt),r.removeEventListener("keydown",oo,!0),r.removeEventListener("pointerover",Ce),r.removeEventListener("pointermove",Ce),r.removeEventListener("pointerout",ro),r.removeEventListener("focus",so),ce?.close(),ce=null,et.length=0;for(let t of ie.values())clearTimeout(t.timer),t.reject(new u("HOST_UNAVAILABLE","Host client was disposed."));ie.clear(),c.clear(),E.clear(),m.clear(),g.clear(),C.clear(),I.clear(),W.clear(),ne.clear(),Z.clear(),P.clear(),w.clear(),q.clear(),ee.length=0}}};var Bo=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var is=new Set(Bo);var Vo=["none","agent","user"];var ls=new Set(Vo);var _r=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],Tr=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],Xo=(e,r)=>{r.style.colorScheme=e.mode;for(let[s,i]of _r)r.style.setProperty(s,e.tokens[i]);for(let[s,i,c]of Tr){let E=e.tokens[c]??"";r.style.setProperty(s,E),r.style.setProperty(i,E)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size",e.tokens.fontSize??"0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},Nt=(e,r)=>{if(Xo(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var mr={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},b=(e,r)=>`var(--${e}, var(--oc-${mr[e]}, ${r}))`,z=b("surface-background","transparent"),qe=b("surface-elevated","transparent"),Ee=b("surface-elevated-foreground","inherit"),H=b("surface-foreground","inherit"),O=b("surface-muted-foreground","gray"),Rr=b("surface-muted","transparent"),te=b("interactive-border","currentColor"),N=b("interactive-hover","transparent"),oe=b("interactive-active","transparent"),Lt=b("interactive-selection","transparent"),Dt=b("interactive-selection-foreground","inherit"),j=b("primary","currentColor"),Ht=b("primary-text","inherit"),Ft=b("error-text","inherit"),hr=b("font-sans","inherit"),Bt=b("font-mono","monospace"),Ko=b("radius","9px"),Vt=`calc(${Ko} - 2px)`,Wo=`calc(${Ko} - 4px)`,A=(e,r,s="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${s})`,$o=`background-image: linear-gradient(${N}, ${N});`,Xt=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,Wt="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",qo="box-shadow: var(--oc-sdk-lit);",$t=`inset 0 0.5px 0 0 ${A(H,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,fr=`
:root {
  --oc-sdk-edge: ${A(H,16)};
  --oc-sdk-field-bg: ${qe};
  --oc-sdk-raised-bg: ${z};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${A(H,14)};
  --oc-sdk-field-bg: ${A(z,50,qe)};
  --oc-sdk-raised-bg: ${qe};
  --oc-sdk-field-lift: ${$t};
  --oc-sdk-raised-lift: ${$t};
  --oc-sdk-lit: ${$t};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,$e=(e)=>{let r=b(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${b(`${e}-text`,"inherit")}; }`},n=(e)=>`calc(${e}rem / 14)`,yr=`
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
`,jo=`${fr}
.oc-sdk { color: ${H}; font-family: ${hr}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${$o} }
.oc-sdk-mono { font-family: ${Bt}; }
.oc-sdk-muted { color: ${O}; }
${$e("success")}${$e("warning")}${$e("error")}${$e("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${j}; --oc-sdk-tone-text: ${Ht}; }

.oc-sdk-btn { border-radius: ${Vt}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${Wo}; }
.oc-sdk-btn[data-variant="default"] { color: ${Ht}; background: ${A(j,10,z)}; border-color: ${A(j,12)}; ${qo} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${A(j,16,z)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${A(j,22,z)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${Rr}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${N}, ${N}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${oe}, ${oe}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${Ee}; ${Wt} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${N}, ${N}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${oe}, ${oe}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${N}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${oe}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${b("status-error","red")}; color: ${Ft}; background: ${A("var(--oc-sdk-tone)",7,z)}; border-color: ${A("var(--oc-sdk-tone)",12)}; ${qo} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${A("var(--oc-sdk-tone)",9,z)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${A("var(--oc-sdk-tone)",11,z)}; box-shadow: none; }

.oc-sdk-field-note { color: ${O}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${Ft}; }
.oc-sdk-input { border-radius: ${Vt}; background: var(--oc-sdk-field-bg); color: ${Ee}; ${Xt("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${O}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${N}, ${N}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Xt(A(H,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Xt(b("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${Bt}; }

.oc-sdk-search-icon { color: ${O}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${j}; }
.oc-sdk-search-clear { border-radius: ${Wo}; color: ${O}; }
.oc-sdk-search-clear:hover { background: ${N}; color: ${H}; }

.oc-sdk-trigger { border-radius: ${Vt}; background: var(--oc-sdk-raised-bg); color: ${Ee}; ${Wt} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${N}, ${N}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${oe}, ${oe}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${O}; }
.oc-sdk-trigger-chevron { color: ${O}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${Ee}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${qe}; background-clip: padding-box; color: ${Ee}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${N}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${Lt}; color: ${Dt}; }
.oc-sdk-option-check { color: ${H}; }
.oc-sdk-option[data-destructive="true"] { color: ${Ft}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${A(b("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${O}; }
.oc-sdk-popup-empty { color: ${O}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${te}; border-radius: 4px; color: ${H}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${A(H,60,te)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${te}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${z}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${j}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(var(--oc-sdk-thumb-travel, 16px)); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${$o} }
.oc-sdk-check-desc { color: ${O}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${A(H,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${O}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${H}; }
.oc-sdk-tab[aria-selected="true"] { color: ${Dt}; background: ${Lt}; border-color: ${te}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${Ee}; background: var(--oc-sdk-raised-bg); ${Wt} }
.oc-sdk-tab-count { color: ${O}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${A(H,6)}; color: ${O}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${A("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${N}; }
.oc-sdk-row[aria-selected="true"] { background: ${Lt}; color: ${Dt}; }
.oc-sdk-row-lead { font-family: ${Bt}; color: ${O}; }
.oc-sdk-row-sub { color: ${O}; }
.oc-sdk-row-meta { color: ${O}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${O}; }

.oc-sdk-empty-body { color: ${O}; }

.oc-sdk-spinner { color: ${O}; }
.oc-sdk-spinner-ring { border-color: ${te}; border-top-color: ${j}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${A("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${O}; }

.oc-sdk-separator { color: ${O}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${A(te,40)}; }

.oc-sdk-progress-label { color: ${O}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${A(H,6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${j}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${b("status-success","currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${b("success-text","inherit")}; }

.oc-sdk-text a { color: ${Ht}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${A(te,60)}; }
`,M=`
${nt}
${yr}
${jo}`;var zo="oc-sdk-ui-style";var G=(e)=>{let r=document.getElementById(zo);if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}it(document);let s=document.createElement("style");s.id=zo,s.textContent=e,document.head.appendChild(s)},k=(e,r)=>{let s=document.createElement(e);if(r)s.className=r;return s},J=(e)=>{let r=k("button",e);return r.type="button",r},F=(e,r)=>{let s=r??"";if(e.textContent!==s)e.textContent=s};var br=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},Q=(e,r)=>{G(M);let s=r,i=J("oc-sdk oc-sdk-btn"),c=br(),E=document.createElement("span");i.append(E),e.append(i);let m=()=>{if(i.dataset.variant=s.variant??"default",i.dataset.size=s.size??"default",i.disabled=Boolean(s.disabled)||Boolean(s.loading),i.dataset.loading=s.loading?"true":"false",i.setAttribute("aria-busy",s.loading?"true":"false"),s.loading&&c.parentNode!==i)i.prepend(c);else if(!s.loading&&c.parentNode===i)c.remove();F(E,s.label)},g=()=>{if(s.disabled||s.loading)return;s.onClick()};return i.addEventListener("click",g),m(),{update:(C)=>{s={...s,...C},m()},dispose:()=>{i.removeEventListener("click",g),i.remove()}}};var qt=(e,r)=>{G(M);let s=r,i=k("div","oc-sdk oc-sdk-empty"),c=k("h2","oc-sdk-empty-title"),E=k("p","oc-sdk-empty-body"),m=k("div","oc-sdk-empty-action");i.append(c,E,m),e.append(i);let g=null,C=()=>{if(F(c,s.title),F(E,s.body),E.hidden=!s.body,m.hidden=!s.action,!s.action){g?.dispose(),g=null;return}let I={label:s.action.label,onClick:s.action.onClick};if(g)g.update(I);else g=Q(m,{...I,variant:"outline",size:"sm"})};return C(),{update:(I)=>{s={...s,...I},C()},dispose:()=>{g?.dispose(),g=null,i.remove()}}};var Cr=/^(\s*[-*+] )\[( |x|X)\] ?(.*)$/,Jo=(e)=>e.split(`
`).map((r)=>{let s=Cr.exec(r);return s?{kind:"item",prefix:s[1]??"- ",done:s[2]!==" ",text:s[3]??""}:{kind:"text",text:r}}),Qo=(e)=>e.map((r)=>r.kind==="text"?r.text:`${r.prefix}[${r.done?"x":" "}] ${r.text}`).join(`
`),Qe=(e)=>{let r=2166136261;for(let s=0;s<e.length;s+=1)r^=e.charCodeAt(s),r=Math.imul(r,16777619);return`${e.length}:${(r>>>0).toString(16)}`},Yo=(e,r)=>{let s=-1,i="- ";e.forEach((g,C)=>{if(g.kind!=="item")return;s=C,i=g.prefix});let c={kind:"item",prefix:i,done:!1,text:r};if(s>=0)return[...e.slice(0,s+1),c,...e.slice(s+1)];return[...e.at(-1)?.kind==="text"&&e.at(-1)?.text===""?e.slice(0,-1):[...e],c,{kind:"text",text:""}]};var se=wt(),re=document.querySelector("#root");if(!re)throw Error("Missing root");var Zo=document.createElement("style");Zo.textContent=`
  html, body { margin: 0; height: 100%; background: var(--oc-bg); color: var(--oc-fg); font-family: var(--oc-font); font-size: 13px; }
  #root { box-sizing: border-box; height: 100%; overflow: auto; padding: 16px 20px; }
  .note { margin: 2px 0; color: var(--oc-muted); white-space: pre-wrap; min-height: 1em; }
  .item { display: flex; align-items: center; gap: 8px; margin: 2px 0; }
  .item input[type="checkbox"] { width: 16px; height: 16px; margin: 0; accent-color: var(--oc-primary); }
  .item input[type="text"] { flex: 1; min-width: 0; border: 1px solid transparent; border-radius: var(--oc-radius); padding: 4px 6px;
    background: transparent; color: inherit; font: inherit; }
  .item input[type="text"]:hover { border-color: var(--oc-border); }
  .item input[type="text"]:focus { outline: none; border-color: var(--oc-focus); background: var(--oc-elevated); }
  .item.done input[type="text"] { color: var(--oc-muted); text-decoration: line-through; }
  .item .remove { visibility: hidden; }
  .item:hover .remove, .item:focus-within .remove { visibility: visible; }
  .actions { margin-top: 12px; }
`;document.head.append(Zo);se.onReady((e)=>Nt(e,document.documentElement));var Y=[],ge=!1,jt=Ue(null),zt=()=>Qo(Y),Ye=()=>{se.reportFileChange(jt.observe(Qe(zt())))},Kt=()=>{if(re.replaceChildren(),!Y.some((r)=>r.kind==="item")&&ge){qt(re,{title:"No items",body:"This checklist is empty."});return}if(Y.forEach((r,s)=>{if(r.kind==="text"){let m=document.createElement("p");m.className="note",m.textContent=r.text,re.append(m);return}let i=document.createElement("div");i.className=r.done?"item done":"item";let c=document.createElement("input");c.type="checkbox",c.checked=r.done,c.disabled=ge,c.addEventListener("change",()=>{r.done=c.checked,i.className=r.done?"item done":"item",Ye()});let E=document.createElement("input");if(E.type="text",E.value=r.text,E.readOnly=ge,E.setAttribute("aria-label","Item"),E.addEventListener("input",()=>{r.text=E.value,Ye()}),i.append(c,E),!ge){let m=document.createElement("span");m.className="remove",Q(m,{label:"Remove",variant:"ghost",size:"xs",onClick:()=>{Y=Y.filter((g,C)=>C!==s),Ye(),Kt()}}),i.append(m)}re.append(i)}),ge)return;let e=document.createElement("div");e.className="actions",Q(e,{label:"Add item",variant:"secondary",size:"sm",onClick:()=>{Y=Yo(Y,""),Ye(),Kt();let r=re.querySelectorAll('.item input[type="text"]');r.item(r.length-1)?.focus()}}),re.append(e)};se.onFileOpen((e)=>{if(e.encoding!=="text"){se.reportFileUnsupported();return}Y=Jo(e.content),ge=e.readOnly,jt=Ue(Qe(zt())),Kt()});se.onFileSnapshot(()=>{let e=zt();return{content:e,version:Qe(e)}});se.onFileSaved((e)=>{se.reportFileChange({dirty:jt.markSaved(e),edited:!1})});})();
