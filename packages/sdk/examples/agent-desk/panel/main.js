(()=>{var _="openchamber.sdk",T=2;var Re="openchamber:guest-bootstrap",Zo=(e,r,s)=>{let{window:i,MessageChannel:c}=globalThis;if(!i||!c)return;try{let m=new c,g=m.port1,E=!1,w=!1,N=null,X=(k)=>{try{k.close()}catch{}},te=(k=[])=>{for(let G of k)X(G);if(!E)E=!0,X(g)},Q=(k)=>{let G=new CustomEvent(s,{detail:k,cancelable:!0});if(!i.dispatchEvent(G))return;X(k),E=!0};i.addEventListener(s,(k)=>{if(!("detail"in k)||k.detail!==null)return;if(w=!0,N){let G=N;N=null,Q(G)}}),g.addEventListener("message",(k)=>{if(E)return;let G=k.data,q=k.ports??[];if(!G||G.channel!==e||G.v!==r||G.type!=="connect-port"||q.length!==1){te(q);return}let Y=q[0];if(E=!0,X(g),Y.start(),!w){N=Y;return}Q(Y)}),g.start(),i.parent.postMessage({channel:e,v:r,type:"bootstrap"},"*",[m.port2])}catch{}},er=`(${Zo.toString()})(${JSON.stringify("openchamber.guest-bootstrap")}, 2, ${JSON.stringify("openchamber:guest-bootstrap")});`;var Ze=`
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
`;function et(e){let r=e.documentElement;if(r.hasAttribute("data-oc-scrollbar-activity"))return;r.setAttribute("data-oc-scrollbar-activity","");let s=new WeakMap;e.addEventListener("scroll",(i)=>{let c=i.target===e?r:i.target;if(!(c instanceof Element))return;if(!c.hasAttribute("data-oc-scrolling"))c.setAttribute("data-oc-scrolling","");let m=s.get(c);if(m!==void 0)clearTimeout(m);s.set(c,setTimeout(()=>{s.delete(c),c.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var tr=`(${et.toString()})(document);`;var tt=128,ot=65536;var xe=128;var Ce=65536;var rt=8000,st=192000,nt=120000;var eo=(e)=>{let r=[],s=0,i=0;return{push:(c)=>{r.push(c),i+=c.length;while(i-s>e&&r.length>1){let m=r.shift();i-=m?.length??0,s=0}},pull:(c)=>{let m=0;while(m<c.length&&r.length>0){let g=r[0],E=Math.min(c.length-m,g.length-s);if(c.set(g.subarray(s,s+E),m),m+=E,s+=E,s>=g.length)r.shift(),i-=g.length,s=0}c.fill(0,m)},clear:()=>{r.length=0,s=0,i=0},get size(){return i-s}}};var so=/^[a-z][a-z0-9-]{0,39}$/;var to=(e)=>Object(e)===e&&!Array.isArray(e),it=(e,r)=>Object.keys(e).every((s)=>r.includes(s)),oo=(e)=>String(e)===e&&e.length>=1&&e.length<=60,ro=(e)=>String(e)===e&&e.length>=1&&e.length<=80,no=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let s of e){if(!to(s)||!so.test(s.id)||!oo(s.label))return!1;if(s.disabled!==void 0&&s.disabled!==!0&&s.disabled!==!1)return!1;if(r.has(s.id))return!1;if(r.add(s.id),s.kind==="button"){if(!it(s,["kind","id","label","disabled"]))return!1;continue}if(s.kind!=="select"||!it(s,["kind","id","label","value","options","disabled"]))return!1;if(!ro(s.value)||!Array.isArray(s.options)||s.options.length<1||s.options.length>16)return!1;let i=new Set;for(let c of s.options){if(!to(c)||!it(c,["value","label"])||!ro(c.value)||!oo(c.label)||i.has(c.value))return!1;i.add(c.value)}if(!i.has(s.value))return!1}return!0};var io=["{id}","{segment}","{segments+}"];var wr=new Set(io);var ao=["turn-finished","turn-failed","permission-asked","question-asked","turn-started","session-created","session-archived","session-deleted"];var Lr=new Set(ao);var ke=20000000,Ie=256;var at=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,lo=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let s=0;s<e.bytes.byteLength;s+=1)if(e.bytes[s]!==r.bytes[s])return!1;return!0};var uo=/^[A-Za-z0-9_-]{1,80}$/;var co=["left","right","top","bottom"];var po=(e,r=0,s={remaining:16000})=>{if(--s.remaining<0||r>=32)return!1;if(e===null)return!0;let i=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let c of i)if(!po(c,r+1,s))return!1;return!0},lt=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(lt);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(lt)}return String(e)===e||Number.isFinite(e)},ut=(e)=>{try{if(String(e.id)!==e.id||!uo.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!co.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!po(e.data)||!lt(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var So=/^[0-9a-f]{7,64}$/i,Eo=(e)=>So.test(e),ct=255,go=(e,r,s)=>({openCommit:(i)=>Eo(i)?e({channel:_,v:T,type:"open-commit",id:r(),payload:{sha:i}}):s("Commit id must be 7 to 64 hex characters."),openWalkthrough:({base:i})=>{let c=i.trim();if(!c||c.length>ct)return s(`Base must contain 1 to ${ct} characters.`);return e({channel:_,v:T,type:"open-walkthrough",id:r(),payload:{base:c}})}});var dt=2000;var To=["file","directory","other","missing"],St=(e)=>Boolean(e&&"sessionId"in e),Et=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var Pe=500,Me=32000,mo=16000,Ro=128,fo=200,ho=2000,yo=16000,bo=80,vo=200,Oo=16000;var Ao=2000;var gt=20000,Ge=1024,Ue=2000000;var we=64000,Ne=8000,_t=4000;var Tt=960000;var xo=999,Co=1e4,fe=500,ko=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],Io=["stopped","starting","ready","failed"],rr=new Set(ko),Po=(e)=>rr.has(e),Mo=(e)=>e&&Po(e)?e:"HOST_REJECTED",ae=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(ae);if(Object(e)===e)return Object.values(e).every(ae);return!1},Go=(e)=>ae(e)&&JSON.stringify(e).length<=Oo,_o=(e)=>e?.trim().slice(0,vo)??"",le=(e)=>{let r=e.id.trim().slice(0,Ro),s=e.title.trim().slice(0,fo),i=e.url.trim().slice(0,ho),c=e.text?.trim().slice(0,yo),m=e.author?.trim().slice(0,bo),g=e.kind==="pull"?"pull":"issue",E={providerId:e.providerId.trim(),id:r,title:s||r,url:i,kind:g};if(c)E.text=c;if(m)E.author=m;if(g==="pull"){let w=_o(e.branches?.head),N=_o(e.branches?.base);if(w&&N)E.branches={head:w,base:N}}if(Go(e.data))E.data=e.data;return E},mt=(e)=>{let r=le(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},Rt=(e)=>{let r={text:e.text.trim().slice(0,mo)};if(e.send)r.send=!0;return r},ft=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(xo,Math.max(0,Math.round(e)))},ht=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(Co,Math.max(0,Math.ceil(e)))};var ue=(e)=>e.length>0&&e.length<=Ge&&!e.includes("\x00")&&!e.includes("\\");var Le=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>Ao)return!1;return!e.split("/").some((s)=>s==="."||s==="..")},sr=new Set(Io),yt=(e)=>Boolean(e&&"status"in e&&sr.has(String(e.status))&&!("body"in e)),De=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),bt=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),vt=(e)=>Boolean(e&&"written"in e&&e.written===!0),Ot=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),nr=new Set(To),At=(e)=>Boolean(e&&"kind"in e&&"size"in e&&nr.has(String(e.kind))&&Number.isFinite(e.size)),xt=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),ir=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","service-event","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late","microphone-audio","microphone-ended"]),ar=(e)=>Object(e)===e?e:null,pt=(e)=>String(e)===e&&e.length>0,lr=(e)=>{if(!pt(e.id))return null;if(e.ok===!0){let r={channel:_,v:T,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&pt(e.error))return{channel:_,v:T,type:"result",id:e.id,ok:!1,error:e.error,code:Mo(pt(e.code)?e.code:void 0)};return null},Ct=(e)=>{let r=ar(e);if(!r||r.channel!==_||r.v!==T)return null;if(r.type==="result")return lr(r);if(!ir.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var Uo=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),ur=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class u extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var wo=()=>Promise.reject(new u("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),He=()=>Promise.reject(new u("BAD_PATH",`File path must be 1 to ${Ge} characters without NUL or backslash.`)),Be=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new u("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},S=(e)=>(e.value+=1,`oc-${e.value}`),kt=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new u("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let s=e.requestTimeoutMs??gt,i=e.acceptSource??((t)=>t===r.parent),c=new Set,m=new Set,g=new Set,E=new Set,w=new Set,N=new Set,X=new Set,te=new Set,Q=new Set,k=new Set,G=new Set,q=new Set,Y=[],Se=null,Ee=null,ye=new Set,be=new Set,ge=null,_e=null,Ke=!1,oe=new Map,re=new Map,se=new Map,B=!1,d={value:0},p=null,K=null,Te=!1,me=!1,Wt=null,L=null,Xt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},ne=null,je=[],D=(t)=>{if(B)return;if(ne){ne.postMessage(t);return}je.push(t)},$t=()=>{if(B||Object.is(r.parent,r)||q.size===0||p?.features?.lateGenerateResults!==!0)return;D({channel:_,v:T,type:"generate-late-listen"})},h=(t,o)=>{for(let a of t)try{a(o)}catch(l){console.error(l)}},jo=(t)=>{if(!("data"in t))return;let o=Ct(t.data);if(!o)return;if(o.type==="workspace"){let l=re.get(o.payload.subscriptionId);if(l)h([l],o.payload.snapshot);return}if(o.type==="shells"){let l=se.get(o.payload.subscriptionId);if(l)h([l],o.payload.snapshot);return}if(o.type==="microphone-audio"){L?.queue.push(o.payload.samples);return}if(o.type==="microphone-ended"){let l=L;if(!l)return;L=null,l.release(),h(l.endedListeners,o.payload.reason);return}if(o.type==="ready"){if(p=o.payload,K=Xt(o.payload.session),h(c,o.payload),h(m,o.payload.directory),h(g,o.payload.session),K)h(E,K);if(h(w,o.payload.connection),h(N,o.payload.settings),h(X,o.payload.item),o.payload.block)h(te,o.payload.block);$t();return}if(o.type==="service-event"){h(Q,o.payload);return}if(o.type==="generate-late"){if(q.size===0)Y.push(o.payload);else h(q,o.payload);return}if(o.type==="directory"){if(p)p={...p,directory:o.payload.directory};h(m,o.payload.directory);return}if(o.type==="session"){if(p)p={...p,session:o.payload.session};if(!o.payload.session)K=null;else if(K?.sessionId!==o.payload.session.id)K=Xt(o.payload.session);h(g,o.payload.session);return}if(o.type==="session-lifecycle"){K=o.payload,h(E,o.payload);return}if(o.type==="connection"){if(p)p={...p,connection:o.payload.connection};h(w,o.payload.connection);return}if(o.type==="settings"){if(p)p={...p,settings:o.payload.settings};h(N,o.payload.settings);return}if(o.type==="item"){if(p)p={...p,item:o.payload.item};h(X,o.payload.item);return}if(o.type==="status-control-event"){h(k,o.payload);return}if(o.type==="popover-closed"){h(G,o.payload);return}if(o.type==="action"){let l=(f)=>{if(!B)D({channel:_,v:T,type:"action-result",id:o.id,payload:f})},R=Ee;if(!R){l({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>R(o.payload)).then(()=>l({ok:!0}),(f)=>{let y=(f instanceof Error?f.message:String(f)).trim();l({ok:!1,error:(y||"Action failed.").slice(0,fe)})});return}if(o.type==="file-open"){let l=o.payload;if(_e&&lo(_e,l))return;_e=l,h(ye,o.payload);return}if(o.type==="file-saved"){h(be,o.payload.version);return}if(o.type==="file-snapshot"){let l=(y)=>{if(!B)D({channel:_,v:T,type:"file-snapshot-result",id:o.id,payload:y})},R=(y)=>l({error:(y.trim()||"Could not read the edited file.").slice(0,fe)}),f=ge;if(!f){R("This extension does not edit files.");return}Promise.resolve().then(()=>f(o.payload.purpose)).then((y)=>{if(at(y)>ke){R(`The file is over ${ke} ${"bytes"in y?"bytes":"characters"}.`);return}if(y.version.length>Ie){R(`The snapshot version is over ${Ie} characters.`);return}l({snapshot:"bytes"in y?{bytes:y.bytes,version:y.version}:{content:y.content,version:y.version}})},(y)=>R(y instanceof Error?y.message:String(y)));return}if(o.type==="resolve"){let l=(f)=>{D({channel:_,v:T,type:"resolve-result",id:o.id,payload:f})},R=Se;if(!R){l({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>R(o.payload)).then((f)=>l({item:f?le(f):null}),(f)=>{let y=(f instanceof Error?f.message:String(f)).trim();l({error:(y||"Command failed.").slice(0,fe)})});return}let a=oe.get(o.id);if(!a)return;if(clearTimeout(a.timer),oe.delete(o.id),o.ok){a.resolve(o.payload);return}a.reject(new u(o.code,o.error))},zo=(t)=>{if(!("source"in t))return!0;return i(t.source)},qt=(t)=>{if(!zo(t)||!("detail"in t))return;let o=t.detail;if(!(o instanceof MessagePort))return;t.preventDefault(),t.stopImmediatePropagation(),ne?.close(),ne=o,o.addEventListener("message",jo),o.start(),o.postMessage({channel:_,v:T,type:"hello"});for(let a of je.splice(0))o.postMessage(a)};r.addEventListener(Re,qt),r.dispatchEvent?.(new CustomEvent(Re,{detail:null}));let M=(t,o=s)=>{if(B||Object.is(r.parent,r))return Promise.reject(new u("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((a,l)=>{let R=setTimeout(()=>{oe.delete(t.id),l(new u("HOST_TIMEOUT","Host did not answer in time."))},o);oe.set(t.id,{resolve:a,reject:l,timer:R}),D(t)})},x=(t)=>M(t).then(()=>{return}),v={channel:_,v:T},ze=(t)=>{if(!B&&!Object.is(r.parent,r))D(t)},Kt=()=>ze({...v,type:"file-save"}),Je=()=>{if(!B&&!Object.is(r.parent,r))D({...v,type:"microphone-close",id:S(d)})},Jo=async()=>{if(L)throw new u("HOST_REJECTED","The microphone is already open in this frame.");if(p?.features?.microphone!==!0)throw new u("UNSUPPORTED","This OhPiChamber cannot share the microphone with extensions.");let t=globalThis.AudioContext;if(typeof t!=="function")throw new u("UNSUPPORTED","This frame has no Web Audio.");let o=new t;if(o.sampleRate<rt||o.sampleRate>st)throw o.close().catch(()=>{return}),new u("UNSUPPORTED",`Audio at ${o.sampleRate} Hz is not supported.`);let a=o.state==="suspended"?o.resume().catch(()=>{return}):void 0,l=eo(Math.round(o.sampleRate/4)),R=o.createScriptProcessor(1024,1,1);R.onaudioprocess=(F)=>l.pull(F.outputBuffer.getChannelData(0));let f=o.createMediaStreamDestination();R.connect(f);let y=new Set,ie={queue:l,endedListeners:y,release:()=>{R.onaudioprocess=null,R.disconnect(),l.clear();for(let F of f.stream.getTracks())F.stop();o.close().catch(()=>{return})}};L=ie;try{let F=await M({...v,type:"microphone-open",id:S(d),payload:{sampleRate:o.sampleRate}},nt);if(!F||!("opened"in F)||F.opened!==!0)throw new u("HOST_REJECTED","Host did not open the microphone.");if(await a,L!==ie)throw new u("DISCONNECTED","The microphone closed while it was opening.")}catch(F){if(L===ie)L=null;throw ie.release(),Je(),F}return{stream:f.stream,close:()=>{if(L!==ie)return;L=null,ie.release(),Je()},onEnded:(F)=>(y.add(F),()=>{y.delete(F)})}},jt=(t)=>{if(!Uo(t)||!ur(t))return;t.preventDefault(),Kt()},zt=(t)=>{if(!Uo(t)||t.key!=="Escape"||p?.surface!=="popover"||!p.popover)return;t.preventDefault(),Yt(p.popover.id,"escape").catch(()=>{return})},ve=()=>{let t=p?.surface==="popover"?p.popover:void 0;if(!t)return;let o=Te||me;if(Wt===o)return;Wt=o,Zt(t.id,o).catch(()=>{return})},Oe=()=>{if(p?.surface!=="popover"||Te)return;Te=!0,ve()},Jt=(t)=>{if(p?.surface!=="popover"||t.relatedTarget!==null||!Te)return;Te=!1,ve()},Qt=()=>{if(p?.surface!=="popover"||me)return;me=!0,ve()},Qo=()=>{if(p?.surface!=="popover"||!me)return;me=!1,ve()},V=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new u("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},Qe=async(t)=>{if(t.kind!=="projects")V(t.projectId);let o=await M({...v,type:"workspace-read",id:S(d),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new u("HOST_REJECTED","Host did not return workspace data.");return o},Ye=async(t,o)=>{if(t.kind!=="projects")V(t.projectId);let a=S(d);re.set(a,o);try{await x({...v,type:"workspace-subscribe",id:S(d),payload:{subscriptionId:a,query:t}})}catch(l){if(re.delete(a),!B)D({...v,type:"workspace-unsubscribe",id:S(d),payload:{subscriptionId:a}});throw l}return()=>{if(!re.delete(a)||B)return;D({...v,type:"workspace-unsubscribe",id:S(d),payload:{subscriptionId:a}})}},Yo=async(t,o)=>{if(t.kind==="session")V(t.sessionId);if(t.kind==="project")V(t.projectId);let a=S(d);se.set(a,o);try{await x({...v,type:"shells-subscribe",id:S(d),payload:{subscriptionId:a,scope:t}})}catch(l){if(se.delete(a),!B)D({...v,type:"shells-unsubscribe",id:S(d),payload:{subscriptionId:a}});throw l}return()=>{if(!se.delete(a)||B)return;D({...v,type:"shells-unsubscribe",id:S(d),payload:{subscriptionId:a}})}},Ae=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>tt))throw new u("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!ae(t.value))throw new u("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>ot)throw new u("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&p?.features?.deviceStorage!==!0)throw new u("UNSUPPORTED","This host does not support device storage.");let o=await M({...v,type:"storage",id:S(d),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new u("HOST_REJECTED","Host did not return storage data.");return o},Yt=(t,o)=>p?.features?.popovers!==!0&&!(p?.surface==="popover"&&p.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):x({...v,type:"popover-close",id:S(d),payload:o?{id:t,reason:o}:{id:t}}),Zt=(t,o)=>p?.features?.popovers!==!0&&!(p?.surface==="popover"&&p.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):x({...v,type:"popover-anchor",id:S(d),payload:{id:t,active:o}});return r.addEventListener("keydown",zt,!0),r.addEventListener("pointerover",Oe),r.addEventListener("pointermove",Oe),r.addEventListener("pointerout",Jt),r.addEventListener("focus",Qt),r.addEventListener("blur",Qo),{onAction:(t)=>(Ee=t,()=>{if(Ee===t)Ee=null}),listProjects:async()=>{let t=await Qe({kind:"projects"});if(t.kind!=="projects")throw new u("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await Qe({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new u("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await Qe({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new u("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>Ye({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>Ye({kind:"worktrees",projectId:t},(a)=>{if(a.kind==="worktrees")o(a)}),onSessions:(t,o)=>Ye({kind:"sessions",projectId:t},(a)=>{if(a.kind==="sessions")o(a)}),onRunningShells:(t,o)=>Yo(t,o),readShellOutput:async(t,o)=>{V(t,xe);let a=o?.cursor;if(a!==void 0&&(!Number.isInteger(a)||a<0))throw new u("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let l=o?.tailBytes;if(l!==void 0&&(!Number.isInteger(l)||l<1||l>Ce))throw new u("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${Ce}.`);let f=await M({...v,type:"shell-output",id:S(d),payload:{shellId:t,cursor:a,tailBytes:l}});if(!f||typeof f.output!=="string"||!Number.isFinite(f.cursor))throw new u("HOST_REJECTED","Host did not return shell output.");return f},stopShell:async(t)=>{if(V(t,xe),(await M({...v,type:"shell-stop",id:S(d),payload:{shellId:t}}))?.stopped!==!0)throw new u("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{V(t),await x({...v,type:"open-session",id:S(d),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let a=Be(o),l={op:"get",key:t};if(a)l.scope=a;let R=await Ae(l);return R.op==="get"&&R.found?R.value:void 0},set:async(t,o,a)=>{let l=Be(a),R={op:"set",key:t,value:o};if(l)R.scope=l;await Ae(R)},delete:async(t,o)=>{let a=Be(o),l={op:"delete",key:t};if(a)l.scope=a;await Ae(l)},keys:async(t)=>{let o=Be(t),a={op:"keys"};if(o)a.scope=o;let l=await Ae(a);if(l.op!=="keys")throw new u("HOST_REJECTED","Expected storage keys.");return l.keys}},onReady:(t)=>{if(c.add(t),p)t(p);return()=>{c.delete(t)}},onDirectory:(t)=>{if(m.add(t),p)t(p.directory);return()=>{m.delete(t)}},onSession:(t)=>{if(g.add(t),p)t(p.session);return()=>{g.delete(t)}},onSessionLifecycle:(t)=>{if(E.add(t),K)t(K);return()=>{E.delete(t)}},onConnection:(t)=>{if(w.add(t),p)t(p.connection);return()=>{w.delete(t)}},onSettings:(t)=>{if(N.add(t),p)t(p.settings);return()=>{N.delete(t)}},onItem:(t)=>{if(X.add(t),p)t(p.item);return()=>{X.delete(t)}},onBlock:(t)=>{if(te.add(t),p?.block)t(p.block);return()=>{te.delete(t)}},onServiceEvent:(t)=>(Q.add(t),()=>{Q.delete(t)}),onStatusControl:(t)=>(k.add(t),()=>{k.delete(t)}),onPopoverClosed:(t)=>(G.add(t),()=>{G.delete(t)}),onLateGenerateResult:(t)=>{q.add(t);for(let o of Y.splice(0))h([t],o);return $t(),()=>{q.delete(t)}},setStatusControls:(t)=>{if(p?.features?.statusControls!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support status controls."));if(!no(t))return Promise.reject(new u("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return x({...v,type:"status-controls",id:S(d),payload:{controls:t}})},openPopover:(t)=>{if(p?.features?.popovers!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support popovers."));if(!ut(t))return Promise.reject(new u("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return x({...v,type:"popover-open",id:S(d),payload:t})},closePopover:Yt,setPopoverAnchorActive:Zt,onResolve:(t)=>(Se=t,()=>{if(Se===t)Se=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Pe)return Promise.reject(new u("HOST_REJECTED",`Toast message must contain 1 to ${Pe} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Me))return Promise.reject(new u("HOST_REJECTED",`Toast copy text must contain 1 to ${Me} characters.`));return x({channel:_,v:T,type:"toast",id:S(d),payload:{...t,message:o}})},openUrl:(t)=>x({channel:_,v:T,type:"open-url",id:S(d),payload:{url:t}}),...go(x,()=>S(d),(t)=>Promise.reject(new u("HOST_REJECTED",t))),answerBlock:(t)=>x({channel:_,v:T,type:"block-answer",id:S(d),payload:{text:t.trim().slice(0,dt)}}),openSurface:(t)=>x({channel:_,v:T,type:"open-surface",id:S(d),payload:{surfaceId:t}}),writeClipboard:(t)=>x({channel:_,v:T,type:"clipboard-write",id:S(d),payload:{text:t}}),compose:(t)=>x({channel:_,v:T,type:"compose",id:S(d),payload:t}),attach:(t)=>x({channel:_,v:T,type:"attach",id:S(d),payload:le(t)}),startSession:async(t)=>{if(t.projectId!==void 0)V(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")V(o.directory);else{if(o.name!==void 0)V(o.name,200);if(o.baseBranch!==void 0)V(o.baseBranch,200)}let a=await M({channel:_,v:T,type:"start-session",id:S(d),payload:mt(t)},e.requestTimeoutMs??180000);if(!St(a))throw new u("HOST_REJECTED","Host did not return a session.");return a},prompt:(t)=>M({channel:_,v:T,type:"prompt",id:S(d),payload:Rt(t)}).then((o)=>{if(!Et(o))throw new u("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>x({channel:_,v:T,type:"session-link",id:S(d),payload:le(t)}),close:()=>x({channel:_,v:T,type:"close",id:S(d)}),oauthStart:()=>x({channel:_,v:T,type:"oauth-start",id:S(d)}),oauthDisconnect:()=>x({channel:_,v:T,type:"oauth-disconnect",id:S(d)}),request:(t)=>(Le(t.path)?M({channel:_,v:T,type:"request",id:S(d),payload:t}):wo()).then((o)=>{if(!De(o))throw new u("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:(t)=>(Le(t.path)?M({channel:_,v:T,type:"service-request",id:S(d),payload:t}):wo()).then((o)=>{if(!De(o))throw new u("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>M({channel:_,v:T,type:"service-status",id:S(d)}).then((t)=>{if(!yt(t))throw new u("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(ue(t)?M({channel:_,v:T,type:"file-read",id:S(d),payload:{path:t}}):He()).then((o)=>{if(!bt(o))throw new u("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!ue(t))return He();if(o.length>Ue)return Promise.reject(new u("FILE_TOO_LARGE",`Content is over ${Ue} characters.`));return M({channel:_,v:T,type:"file-write",id:S(d),payload:{path:t,content:o}}).then((a)=>{if(!vt(a))throw new u("HOST_REJECTED","Host did not confirm the write.");return a})},listDir:(t)=>(ue(t)?M({channel:_,v:T,type:"file-list",id:S(d),payload:{path:t}}):He()).then((o)=>{if(!Ot(o))throw new u("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(ue(t)?M({channel:_,v:T,type:"file-stat",id:S(d),payload:{path:t}}):He()).then((o)=>{if(!At(o))throw new u("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),a=t.system?.trim();if(o.length===0||o.length>we)return Promise.reject(new u("HOST_REJECTED",`Prompt must be 1 to ${we} characters.`));if(a!==void 0&&(a.length===0||a.length>Ne))return Promise.reject(new u("HOST_REJECTED",`System prompt must be 1 to ${Ne} characters.`));let l=t.maxOutputTokens===void 0?void 0:Math.min(_t,Math.max(1,Math.floor(t.maxOutputTokens)));if(l!==void 0&&!Number.isFinite(l))return Promise.reject(new u("HOST_REJECTED","maxOutputTokens must be a number."));let R={prompt:o};if(a!==void 0)R.system=a;if(l!==void 0)R.maxOutputTokens=l;return M({channel:_,v:T,type:"generate",id:S(d),payload:R},e.requestTimeoutMs??Tt).then((f)=>{if(!xt(f))throw new u("HOST_REJECTED","Host did not return generated text.");return f})},openMicrophone:Jo,setBadge:(t)=>x({channel:_,v:T,type:"badge",id:S(d),payload:{count:ft(t)}}),setHeight:(t)=>x({channel:_,v:T,type:"resize",id:S(d),payload:{height:ht(t)}}),onFileOpen:(t)=>{if(ye.add(t),!Ke)Ke=!0,r.addEventListener("keydown",jt,!0);if(_e)t(_e);return()=>{ye.delete(t)}},onFileSnapshot:(t)=>(ge=t,()=>{if(ge===t)ge=null}),onFileSaved:(t)=>(be.add(t),()=>{be.delete(t)}),reportFileChange:(t)=>ze({...v,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:Kt,reportFileUnsupported:()=>ze({...v,type:"file-unsupported"}),dispose:()=>{for(let t of re.keys())D({...v,type:"workspace-unsubscribe",id:S(d),payload:{subscriptionId:t}});re.clear();for(let t of se.keys())D({...v,type:"shells-unsubscribe",id:S(d),payload:{subscriptionId:t}});if(se.clear(),L)Je(),L.release(),L=null;if(B=!0,Se=null,Ee=null,ge=null,ye.clear(),be.clear(),Ke)r.removeEventListener("keydown",jt,!0);r.removeEventListener(Re,qt),r.removeEventListener("keydown",zt,!0),r.removeEventListener("pointerover",Oe),r.removeEventListener("pointermove",Oe),r.removeEventListener("pointerout",Jt),r.removeEventListener("focus",Qt),ne?.close(),ne=null,je.length=0;for(let t of oe.values())clearTimeout(t.timer),t.reject(new u("HOST_UNAVAILABLE","Host client was disposed."));oe.clear(),c.clear(),m.clear(),g.clear(),E.clear(),w.clear(),N.clear(),X.clear(),te.clear(),Q.clear(),k.clear(),G.clear(),q.clear(),Y.length=0}}};var No=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var ss=new Set(No);var Lo=["none","agent","user"];var is=new Set(Lo);var cr=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],pr=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],Do=(e,r)=>{r.style.colorScheme=e.mode;for(let[s,i]of cr)r.style.setProperty(s,e.tokens[i]);for(let[s,i,c]of pr){let m=e.tokens[c]??"";r.style.setProperty(s,m),r.style.setProperty(i,m)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size",e.tokens.fontSize??"0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},It=(e,r)=>{if(Do(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var dr={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},b=(e,r)=>`var(--${e}, var(--oc-${dr[e]}, ${r}))`,z=b("surface-background","transparent"),Ve=b("surface-elevated","transparent"),ce=b("surface-elevated-foreground","inherit"),H=b("surface-foreground","inherit"),O=b("surface-muted-foreground","gray"),Sr=b("surface-muted","transparent"),Z=b("interactive-border","currentColor"),U=b("interactive-hover","transparent"),ee=b("interactive-active","transparent"),Pt=b("interactive-selection","transparent"),Mt=b("interactive-selection-foreground","inherit"),j=b("primary","currentColor"),Gt=b("primary-text","inherit"),Ut=b("error-text","inherit"),Er=b("font-sans","inherit"),wt=b("font-mono","monospace"),Vo=b("radius","9px"),Nt=`calc(${Vo} - 2px)`,Ho=`calc(${Vo} - 4px)`,A=(e,r,s="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${s})`,Bo=`background-image: linear-gradient(${U}, ${U});`,Lt=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,Dt="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Fo="box-shadow: var(--oc-sdk-lit);",Ht=`inset 0 0.5px 0 0 ${A(H,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,gr=`
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
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${b(`${e}-text`,"inherit")}; }`},n=(e)=>`calc(${e}rem / 14)`,_r=`
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
`,Wo=`${gr}
.oc-sdk { color: ${H}; font-family: ${Er}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${Bo} }
.oc-sdk-mono { font-family: ${wt}; }
.oc-sdk-muted { color: ${O}; }
${Fe("success")}${Fe("warning")}${Fe("error")}${Fe("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${j}; --oc-sdk-tone-text: ${Gt}; }

.oc-sdk-btn { border-radius: ${Nt}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${Ho}; }
.oc-sdk-btn[data-variant="default"] { color: ${Gt}; background: ${A(j,10,z)}; border-color: ${A(j,12)}; ${Fo} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${A(j,16,z)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${A(j,22,z)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${Sr}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${ee}, ${ee}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${ce}; ${Dt} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${U}, ${U}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${ee}, ${ee}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${U}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${ee}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${b("status-error","red")}; color: ${Ut}; background: ${A("var(--oc-sdk-tone)",7,z)}; border-color: ${A("var(--oc-sdk-tone)",12)}; ${Fo} }
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
.oc-sdk-search-clear { border-radius: ${Ho}; color: ${O}; }
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
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${Bo} }
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
${_r}
${Wo}`;var Xo="oc-sdk-ui-style",pe=(e)=>{while(e.firstChild)e.removeChild(e.firstChild)},P=(e)=>{let r=document.getElementById(Xo);if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}et(document);let s=document.createElement("style");s.id=Xo,s.textContent=e,document.head.appendChild(s)},C=(e,r)=>{let s=document.createElement(e);if(r)s.className=r;return s},J=(e)=>{let r=C("button",e);return r.type="button",r},W=(e,r)=>{let s=r??"";if(e.textContent!==s)e.textContent=s};var Tr=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},de=(e,r)=>{P(I);let s=r,i=J("oc-sdk oc-sdk-btn"),c=Tr(),m=document.createElement("span");i.append(m),e.append(i);let g=()=>{if(i.dataset.variant=s.variant??"default",i.dataset.size=s.size??"default",i.disabled=Boolean(s.disabled)||Boolean(s.loading),i.dataset.loading=s.loading?"true":"false",i.setAttribute("aria-busy",s.loading?"true":"false"),s.loading&&c.parentNode!==i)i.prepend(c);else if(!s.loading&&c.parentNode===i)c.remove();W(m,s.label)},E=()=>{if(s.disabled||s.loading)return;s.onClick()};return i.addEventListener("click",E),g(),{update:(w)=>{s={...s,...w},g()},dispose:()=>{i.removeEventListener("click",E),i.remove()}}};var yr=/(!?)\[([^[\]]*)\]\((https?:\/\/[^()\s]+)\)/g,br=(e)=>{try{let r=new URL(e);return r.protocol==="http:"||r.protocol==="https:"}catch{return!1}},$o=(e)=>{let r=[],s=0;for(let i of e.matchAll(yr)){let c=i.index??0;if(c>s)r.push({kind:"text",text:e.slice(s,c)});let m=i[1]??"",g=(i[2]??"").trim(),E=i[3]??"";if(!br(E))r.push({kind:"text",text:i[0]});else if(m==="!")r.push({kind:"image",src:E,alt:g});else r.push({kind:"link",href:E,label:g||E});s=c+i[0].length}if(s<e.length)r.push({kind:"text",text:e.slice(s)});return r},Bt=(e,r)=>{P(I);let s=r,i=C("div","oc-sdk oc-sdk-text");e.append(i);let c=(g)=>{if(!(g.target instanceof HTMLAnchorElement)||!s.onOpenUrl)return;g.preventDefault(),s.onOpenUrl(g.target.href)},m=()=>{pe(i);for(let g of $o(s.text))if(g.kind==="text")i.append(document.createTextNode(g.text));else if(g.kind==="link"){let E=C("a");E.href=g.href,E.rel="noopener noreferrer",E.target="_blank",E.textContent=g.label,i.append(E)}else{let E=C("img");E.src=g.src,E.alt=g.alt,E.loading="lazy",E.referrerPolicy="no-referrer",i.append(E)}};return i.addEventListener("click",c),m(),{update:(g)=>{s={...s,...g},m()},dispose:()=>{i.removeEventListener("click",c),i.remove()}}};var Ft=kt(),qe=document.querySelector("#root");if(!qe)throw Error("Agent Desk: missing root");var Ko=document.createElement("div"),Vt=(e)=>{let r=document.createElement("div");r.textContent=e,Ko.prepend(r)},qo=!1;Ft.onReady((e)=>{if(It(e,document.documentElement),qo)return;qo=!0,Bt(qe,{text:"Agent Desk"}),de(qe,{label:"Start a session",onClick:()=>{Ft.serviceRequest({method:"POST",path:"/start",body:JSON.stringify({directory:e.directory})}).then((r)=>Vt(r.body)).catch(()=>Vt("The service did not answer."))}}),qe.append(Ko)});Ft.onServiceEvent(({topic:e,data:r})=>Vt(`${e}: ${JSON.stringify(r)}`));})();
