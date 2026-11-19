(()=>{var E="openchamber.sdk",g=2;var Re="openchamber:guest-bootstrap",qo=(e,r,n)=>{let{window:S,MessageChannel:c}=globalThis;if(!S||!c)return;try{let _=new c,f=_.port1,R=!1,C=!1,N=null,W=(k)=>{try{k.close()}catch{}},oe=(k=[])=>{for(let U of k)W(U);if(!R)R=!0,W(f)},Q=(k)=>{let U=new CustomEvent(n,{detail:k,cancelable:!0});if(!S.dispatchEvent(U))return;W(k),R=!0};S.addEventListener(n,(k)=>{if(!("detail"in k)||k.detail!==null)return;if(C=!0,N){let U=N;N=null,Q(U)}}),f.addEventListener("message",(k)=>{if(R)return;let U=k.data,q=k.ports??[];if(!U||U.channel!==e||U.v!==r||U.type!=="connect-port"||q.length!==1){oe(q);return}let Y=q[0];if(R=!0,W(f),Y.start(),!C){N=Y;return}Q(Y)}),f.start(),S.parent.postMessage({channel:e,v:r,type:"bootstrap"},"*",[_.port2])}catch{}},Ko=`(${qo.toString()})(${JSON.stringify("openchamber.guest-bootstrap")}, 2, ${JSON.stringify("openchamber:guest-bootstrap")});`;var et=`
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
`;function tt(e){let r=e.documentElement;if(r.hasAttribute("data-oc-scrollbar-activity"))return;r.setAttribute("data-oc-scrollbar-activity","");let n=new WeakMap;e.addEventListener("scroll",(S)=>{let c=S.target===e?r:S.target;if(!(c instanceof Element))return;if(!c.hasAttribute("data-oc-scrolling"))c.setAttribute("data-oc-scrolling","");let _=n.get(c);if(_!==void 0)clearTimeout(_);n.set(c,setTimeout(()=>{n.delete(c),c.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var jo=`(${tt.toString()})(document);`;var ot=128,rt=65536;var xe=128;var Ce=65536;var st=8000,nt=192000,it=120000;var Yt=(e)=>{let r=[],n=0,S=0;return{push:(c)=>{r.push(c),S+=c.length;while(S-n>e&&r.length>1){let _=r.shift();S-=_?.length??0,n=0}},pull:(c)=>{let _=0;while(_<c.length&&r.length>0){let f=r[0],R=Math.min(c.length-_,f.length-n);if(c.set(f.subarray(n,n+R),_),_+=R,n+=R,n>=f.length)r.shift(),S-=f.length,n=0}c.fill(0,_)},clear:()=>{r.length=0,n=0,S=0},get size(){return S-n}}};var oo=/^[a-z][a-z0-9-]{0,39}$/;var Zt=(e)=>Object(e)===e&&!Array.isArray(e),at=(e,r)=>Object.keys(e).every((n)=>r.includes(n)),eo=(e)=>String(e)===e&&e.length>=1&&e.length<=60,to=(e)=>String(e)===e&&e.length>=1&&e.length<=80,ro=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let n of e){if(!Zt(n)||!oo.test(n.id)||!eo(n.label))return!1;if(n.disabled!==void 0&&n.disabled!==!0&&n.disabled!==!1)return!1;if(r.has(n.id))return!1;if(r.add(n.id),n.kind==="button"){if(!at(n,["kind","id","label","disabled"]))return!1;continue}if(n.kind!=="select"||!at(n,["kind","id","label","value","options","disabled"]))return!1;if(!to(n.value)||!Array.isArray(n.options)||n.options.length<1||n.options.length>16)return!1;let S=new Set;for(let c of n.options){if(!Zt(c)||!at(c,["value","label"])||!to(c.value)||!eo(c.label)||S.has(c.value))return!1;S.add(c.value)}if(!S.has(n.value))return!1}return!0};var so=["{id}","{segment}","{segments+}"];var Ar=new Set(so);var no=["turn-finished","turn-failed","permission-asked","question-asked","turn-started","session-created","session-archived","session-deleted"];var Cr=new Set(no);var ke=20000000,Ie=256;var lt=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,io=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let n=0;n<e.bytes.byteLength;n+=1)if(e.bytes[n]!==r.bytes[n])return!1;return!0};var ao=/^[A-Za-z0-9_-]{1,80}$/;var lo=["left","right","top","bottom"];var uo=(e,r=0,n={remaining:16000})=>{if(--n.remaining<0||r>=32)return!1;if(e===null)return!0;let S=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let c of S)if(!uo(c,r+1,n))return!1;return!0},ut=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(ut);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(ut)}return String(e)===e||Number.isFinite(e)},ct=(e)=>{try{if(String(e.id)!==e.id||!ao.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!lo.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!uo(e.data)||!ut(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var dt=2000;var po=["file","directory","other","missing"],St=(e)=>Boolean(e&&"sessionId"in e),Et=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var So=/^[0-9a-f]{7,64}$/i,gt=(e)=>So.test(e),Pe=500,Me=32000,Eo=16000,go=128,_o=200,To=2000,mo=16000,Ro=80,fo=200,ho=16000;var yo=2000;var _t=20000,Ge=1024,Ue=2000000;var we=64000,Ne=8000,Tt=4000;var mt=960000;var bo=999,vo=1e4,fe=500,Oo=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],Ao=["stopped","starting","ready","failed"],Jo=new Set(Oo),xo=(e)=>Jo.has(e),Co=(e)=>e&&xo(e)?e:"HOST_REJECTED",le=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(le);if(Object(e)===e)return Object.values(e).every(le);return!1},ko=(e)=>le(e)&&JSON.stringify(e).length<=ho,co=(e)=>e?.trim().slice(0,fo)??"",ue=(e)=>{let r=e.id.trim().slice(0,go),n=e.title.trim().slice(0,_o),S=e.url.trim().slice(0,To),c=e.text?.trim().slice(0,mo),_=e.author?.trim().slice(0,Ro),f=e.kind==="pull"?"pull":"issue",R={providerId:e.providerId.trim(),id:r,title:n||r,url:S,kind:f};if(c)R.text=c;if(_)R.author=_;if(f==="pull"){let C=co(e.branches?.head),N=co(e.branches?.base);if(C&&N)R.branches={head:C,base:N}}if(ko(e.data))R.data=e.data;return R},Rt=(e)=>{let r=ue(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},ft=(e)=>{let r={text:e.text.trim().slice(0,Eo)};if(e.send)r.send=!0;return r},ht=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(bo,Math.max(0,Math.round(e)))},yt=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(vo,Math.max(0,Math.ceil(e)))};var ce=(e)=>e.length>0&&e.length<=Ge&&!e.includes("\x00")&&!e.includes("\\");var Le=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>yo)return!1;return!e.split("/").some((n)=>n==="."||n==="..")},Qo=new Set(Ao),bt=(e)=>Boolean(e&&"status"in e&&Qo.has(String(e.status))&&!("body"in e)),De=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),vt=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),Ot=(e)=>Boolean(e&&"written"in e&&e.written===!0),At=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),Yo=new Set(po),xt=(e)=>Boolean(e&&"kind"in e&&"size"in e&&Yo.has(String(e.kind))&&Number.isFinite(e.size)),Ct=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),Zo=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","service-event","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late","microphone-audio","microphone-ended"]),er=(e)=>Object(e)===e?e:null,pt=(e)=>String(e)===e&&e.length>0,tr=(e)=>{if(!pt(e.id))return null;if(e.ok===!0){let r={channel:E,v:g,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&pt(e.error))return{channel:E,v:g,type:"result",id:e.id,ok:!1,error:e.error,code:Co(pt(e.code)?e.code:void 0)};return null},kt=(e)=>{let r=er(e);if(!r||r.channel!==E||r.v!==g)return null;if(r.type==="result")return tr(r);if(!Zo.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var Io=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),or=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class l extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var Po=()=>Promise.reject(new l("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),He=()=>Promise.reject(new l("BAD_PATH",`File path must be 1 to ${Ge} characters without NUL or backslash.`)),Be=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new l("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},d=(e)=>(e.value+=1,`oc-${e.value}`),It=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new l("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let n=e.requestTimeoutMs??_t,S=e.acceptSource??((t)=>t===r.parent),c=new Set,_=new Set,f=new Set,R=new Set,C=new Set,N=new Set,W=new Set,oe=new Set,Q=new Set,k=new Set,U=new Set,q=new Set,Y=[],Se=null,Ee=null,ye=new Set,be=new Set,ge=null,_e=null,je=!1,re=new Map,se=new Map,ne=new Map,B=!1,p={value:0},u=null,K=null,Te=!1,me=!1,Ft=null,L=null,Vt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},ie=null,ze=[],D=(t)=>{if(B)return;if(ie){ie.postMessage(t);return}ze.push(t)},Xt=()=>{if(B||Object.is(r.parent,r)||q.size===0||u?.features?.lateGenerateResults!==!0)return;D({channel:E,v:g,type:"generate-late-listen"})},h=(t,o)=>{for(let i of t)try{i(o)}catch(a){console.error(a)}},Fo=(t)=>{if(!("data"in t))return;let o=kt(t.data);if(!o)return;if(o.type==="workspace"){let a=se.get(o.payload.subscriptionId);if(a)h([a],o.payload.snapshot);return}if(o.type==="shells"){let a=ne.get(o.payload.subscriptionId);if(a)h([a],o.payload.snapshot);return}if(o.type==="microphone-audio"){L?.queue.push(o.payload.samples);return}if(o.type==="microphone-ended"){let a=L;if(!a)return;L=null,a.release(),h(a.endedListeners,o.payload.reason);return}if(o.type==="ready"){if(u=o.payload,K=Vt(o.payload.session),h(c,o.payload),h(_,o.payload.directory),h(f,o.payload.session),K)h(R,K);if(h(C,o.payload.connection),h(N,o.payload.settings),h(W,o.payload.item),o.payload.block)h(oe,o.payload.block);Xt();return}if(o.type==="service-event"){h(Q,o.payload);return}if(o.type==="generate-late"){if(q.size===0)Y.push(o.payload);else h(q,o.payload);return}if(o.type==="directory"){if(u)u={...u,directory:o.payload.directory};h(_,o.payload.directory);return}if(o.type==="session"){if(u)u={...u,session:o.payload.session};if(!o.payload.session)K=null;else if(K?.sessionId!==o.payload.session.id)K=Vt(o.payload.session);h(f,o.payload.session);return}if(o.type==="session-lifecycle"){K=o.payload,h(R,o.payload);return}if(o.type==="connection"){if(u)u={...u,connection:o.payload.connection};h(C,o.payload.connection);return}if(o.type==="settings"){if(u)u={...u,settings:o.payload.settings};h(N,o.payload.settings);return}if(o.type==="item"){if(u)u={...u,item:o.payload.item};h(W,o.payload.item);return}if(o.type==="status-control-event"){h(k,o.payload);return}if(o.type==="popover-closed"){h(U,o.payload);return}if(o.type==="action"){let a=(m)=>{if(!B)D({channel:E,v:g,type:"action-result",id:o.id,payload:m})},T=Ee;if(!T){a({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>T(o.payload)).then(()=>a({ok:!0}),(m)=>{let y=(m instanceof Error?m.message:String(m)).trim();a({ok:!1,error:(y||"Action failed.").slice(0,fe)})});return}if(o.type==="file-open"){let a=o.payload;if(_e&&io(_e,a))return;_e=a,h(ye,o.payload);return}if(o.type==="file-saved"){h(be,o.payload.version);return}if(o.type==="file-snapshot"){let a=(y)=>{if(!B)D({channel:E,v:g,type:"file-snapshot-result",id:o.id,payload:y})},T=(y)=>a({error:(y.trim()||"Could not read the edited file.").slice(0,fe)}),m=ge;if(!m){T("This extension does not edit files.");return}Promise.resolve().then(()=>m(o.payload.purpose)).then((y)=>{if(lt(y)>ke){T(`The file is over ${ke} ${"bytes"in y?"bytes":"characters"}.`);return}if(y.version.length>Ie){T(`The snapshot version is over ${Ie} characters.`);return}a({snapshot:"bytes"in y?{bytes:y.bytes,version:y.version}:{content:y.content,version:y.version}})},(y)=>T(y instanceof Error?y.message:String(y)));return}if(o.type==="resolve"){let a=(m)=>{D({channel:E,v:g,type:"resolve-result",id:o.id,payload:m})},T=Se;if(!T){a({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>T(o.payload)).then((m)=>a({item:m?ue(m):null}),(m)=>{let y=(m instanceof Error?m.message:String(m)).trim();a({error:(y||"Command failed.").slice(0,fe)})});return}let i=re.get(o.id);if(!i)return;if(clearTimeout(i.timer),re.delete(o.id),o.ok){i.resolve(o.payload);return}i.reject(new l(o.code,o.error))},Vo=(t)=>{if(!("source"in t))return!0;return S(t.source)},Wt=(t)=>{if(!Vo(t)||!("detail"in t))return;let o=t.detail;if(!(o instanceof MessagePort))return;t.preventDefault(),t.stopImmediatePropagation(),ie?.close(),ie=o,o.addEventListener("message",Fo),o.start(),o.postMessage({channel:E,v:g,type:"hello"});for(let i of ze.splice(0))o.postMessage(i)};r.addEventListener(Re,Wt),r.dispatchEvent?.(new CustomEvent(Re,{detail:null}));let I=(t,o=n)=>{if(B||Object.is(r.parent,r))return Promise.reject(new l("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((i,a)=>{let T=setTimeout(()=>{re.delete(t.id),a(new l("HOST_TIMEOUT","Host did not answer in time."))},o);re.set(t.id,{resolve:i,reject:a,timer:T}),D(t)})},x=(t)=>I(t).then(()=>{return}),v={channel:E,v:g},Je=(t)=>{if(!B&&!Object.is(r.parent,r))D(t)},$t=()=>Je({...v,type:"file-save"}),Qe=()=>{if(!B&&!Object.is(r.parent,r))D({...v,type:"microphone-close",id:d(p)})},Xo=async()=>{if(L)throw new l("HOST_REJECTED","The microphone is already open in this frame.");if(u?.features?.microphone!==!0)throw new l("UNSUPPORTED","This OhPiChamber cannot share the microphone with extensions.");let t=globalThis.AudioContext;if(typeof t!=="function")throw new l("UNSUPPORTED","This frame has no Web Audio.");let o=new t;if(o.sampleRate<st||o.sampleRate>nt)throw o.close().catch(()=>{return}),new l("UNSUPPORTED",`Audio at ${o.sampleRate} Hz is not supported.`);let i=o.state==="suspended"?o.resume().catch(()=>{return}):void 0,a=Yt(Math.round(o.sampleRate/4)),T=o.createScriptProcessor(1024,1,1);T.onaudioprocess=(F)=>a.pull(F.outputBuffer.getChannelData(0));let m=o.createMediaStreamDestination();T.connect(m);let y=new Set,ae={queue:a,endedListeners:y,release:()=>{T.onaudioprocess=null,T.disconnect(),a.clear();for(let F of m.stream.getTracks())F.stop();o.close().catch(()=>{return})}};L=ae;try{let F=await I({...v,type:"microphone-open",id:d(p),payload:{sampleRate:o.sampleRate}},it);if(!F||!("opened"in F)||F.opened!==!0)throw new l("HOST_REJECTED","Host did not open the microphone.");if(await i,L!==ae)throw new l("DISCONNECTED","The microphone closed while it was opening.")}catch(F){if(L===ae)L=null;throw ae.release(),Qe(),F}return{stream:m.stream,close:()=>{if(L!==ae)return;L=null,ae.release(),Qe()},onEnded:(F)=>(y.add(F),()=>{y.delete(F)})}},qt=(t)=>{if(!Io(t)||!or(t))return;t.preventDefault(),$t()},Kt=(t)=>{if(!Io(t)||t.key!=="Escape"||u?.surface!=="popover"||!u.popover)return;t.preventDefault(),Jt(u.popover.id,"escape").catch(()=>{return})},ve=()=>{let t=u?.surface==="popover"?u.popover:void 0;if(!t)return;let o=Te||me;if(Ft===o)return;Ft=o,Qt(t.id,o).catch(()=>{return})},Oe=()=>{if(u?.surface!=="popover"||Te)return;Te=!0,ve()},jt=(t)=>{if(u?.surface!=="popover"||t.relatedTarget!==null||!Te)return;Te=!1,ve()},zt=()=>{if(u?.surface!=="popover"||me)return;me=!0,ve()},Wo=()=>{if(u?.surface!=="popover"||!me)return;me=!1,ve()},V=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new l("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},Ye=async(t)=>{if(t.kind!=="projects")V(t.projectId);let o=await I({...v,type:"workspace-read",id:d(p),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new l("HOST_REJECTED","Host did not return workspace data.");return o},Ze=async(t,o)=>{if(t.kind!=="projects")V(t.projectId);let i=d(p);se.set(i,o);try{await x({...v,type:"workspace-subscribe",id:d(p),payload:{subscriptionId:i,query:t}})}catch(a){if(se.delete(i),!B)D({...v,type:"workspace-unsubscribe",id:d(p),payload:{subscriptionId:i}});throw a}return()=>{if(!se.delete(i)||B)return;D({...v,type:"workspace-unsubscribe",id:d(p),payload:{subscriptionId:i}})}},$o=async(t,o)=>{if(t.kind==="session")V(t.sessionId);if(t.kind==="project")V(t.projectId);let i=d(p);ne.set(i,o);try{await x({...v,type:"shells-subscribe",id:d(p),payload:{subscriptionId:i,scope:t}})}catch(a){if(ne.delete(i),!B)D({...v,type:"shells-unsubscribe",id:d(p),payload:{subscriptionId:i}});throw a}return()=>{if(!ne.delete(i)||B)return;D({...v,type:"shells-unsubscribe",id:d(p),payload:{subscriptionId:i}})}},Ae=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>ot))throw new l("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!le(t.value))throw new l("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>rt)throw new l("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&u?.features?.deviceStorage!==!0)throw new l("UNSUPPORTED","This host does not support device storage.");let o=await I({...v,type:"storage",id:d(p),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new l("HOST_REJECTED","Host did not return storage data.");return o},Jt=(t,o)=>u?.features?.popovers!==!0&&!(u?.surface==="popover"&&u.popover?.id===t)?Promise.reject(new l("UNSUPPORTED","This host does not support popovers.")):x({...v,type:"popover-close",id:d(p),payload:o?{id:t,reason:o}:{id:t}}),Qt=(t,o)=>u?.features?.popovers!==!0&&!(u?.surface==="popover"&&u.popover?.id===t)?Promise.reject(new l("UNSUPPORTED","This host does not support popovers.")):x({...v,type:"popover-anchor",id:d(p),payload:{id:t,active:o}});return r.addEventListener("keydown",Kt,!0),r.addEventListener("pointerover",Oe),r.addEventListener("pointermove",Oe),r.addEventListener("pointerout",jt),r.addEventListener("focus",zt),r.addEventListener("blur",Wo),{onAction:(t)=>(Ee=t,()=>{if(Ee===t)Ee=null}),listProjects:async()=>{let t=await Ye({kind:"projects"});if(t.kind!=="projects")throw new l("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await Ye({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new l("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await Ye({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new l("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>Ze({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>Ze({kind:"worktrees",projectId:t},(i)=>{if(i.kind==="worktrees")o(i)}),onSessions:(t,o)=>Ze({kind:"sessions",projectId:t},(i)=>{if(i.kind==="sessions")o(i)}),onRunningShells:(t,o)=>$o(t,o),readShellOutput:async(t,o)=>{V(t,xe);let i=o?.cursor;if(i!==void 0&&(!Number.isInteger(i)||i<0))throw new l("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let a=o?.tailBytes;if(a!==void 0&&(!Number.isInteger(a)||a<1||a>Ce))throw new l("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${Ce}.`);let m=await I({...v,type:"shell-output",id:d(p),payload:{shellId:t,cursor:i,tailBytes:a}});if(!m||typeof m.output!=="string"||!Number.isFinite(m.cursor))throw new l("HOST_REJECTED","Host did not return shell output.");return m},stopShell:async(t)=>{if(V(t,xe),(await I({...v,type:"shell-stop",id:d(p),payload:{shellId:t}}))?.stopped!==!0)throw new l("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{V(t),await x({...v,type:"open-session",id:d(p),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let i=Be(o),a={op:"get",key:t};if(i)a.scope=i;let T=await Ae(a);return T.op==="get"&&T.found?T.value:void 0},set:async(t,o,i)=>{let a=Be(i),T={op:"set",key:t,value:o};if(a)T.scope=a;await Ae(T)},delete:async(t,o)=>{let i=Be(o),a={op:"delete",key:t};if(i)a.scope=i;await Ae(a)},keys:async(t)=>{let o=Be(t),i={op:"keys"};if(o)i.scope=o;let a=await Ae(i);if(a.op!=="keys")throw new l("HOST_REJECTED","Expected storage keys.");return a.keys}},onReady:(t)=>{if(c.add(t),u)t(u);return()=>{c.delete(t)}},onDirectory:(t)=>{if(_.add(t),u)t(u.directory);return()=>{_.delete(t)}},onSession:(t)=>{if(f.add(t),u)t(u.session);return()=>{f.delete(t)}},onSessionLifecycle:(t)=>{if(R.add(t),K)t(K);return()=>{R.delete(t)}},onConnection:(t)=>{if(C.add(t),u)t(u.connection);return()=>{C.delete(t)}},onSettings:(t)=>{if(N.add(t),u)t(u.settings);return()=>{N.delete(t)}},onItem:(t)=>{if(W.add(t),u)t(u.item);return()=>{W.delete(t)}},onBlock:(t)=>{if(oe.add(t),u?.block)t(u.block);return()=>{oe.delete(t)}},onServiceEvent:(t)=>(Q.add(t),()=>{Q.delete(t)}),onStatusControl:(t)=>(k.add(t),()=>{k.delete(t)}),onPopoverClosed:(t)=>(U.add(t),()=>{U.delete(t)}),onLateGenerateResult:(t)=>{q.add(t);for(let o of Y.splice(0))h([t],o);return Xt(),()=>{q.delete(t)}},setStatusControls:(t)=>{if(u?.features?.statusControls!==!0)return Promise.reject(new l("UNSUPPORTED","This host does not support status controls."));if(!ro(t))return Promise.reject(new l("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return x({...v,type:"status-controls",id:d(p),payload:{controls:t}})},openPopover:(t)=>{if(u?.features?.popovers!==!0)return Promise.reject(new l("UNSUPPORTED","This host does not support popovers."));if(!ct(t))return Promise.reject(new l("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return x({...v,type:"popover-open",id:d(p),payload:t})},closePopover:Jt,setPopoverAnchorActive:Qt,onResolve:(t)=>(Se=t,()=>{if(Se===t)Se=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Pe)return Promise.reject(new l("HOST_REJECTED",`Toast message must contain 1 to ${Pe} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Me))return Promise.reject(new l("HOST_REJECTED",`Toast copy text must contain 1 to ${Me} characters.`));return x({channel:E,v:g,type:"toast",id:d(p),payload:{...t,message:o}})},openUrl:(t)=>x({channel:E,v:g,type:"open-url",id:d(p),payload:{url:t}}),openCommit:(t)=>gt(t)?x({channel:E,v:g,type:"open-commit",id:d(p),payload:{sha:t}}):Promise.reject(new l("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),answerBlock:(t)=>x({channel:E,v:g,type:"block-answer",id:d(p),payload:{text:t.trim().slice(0,dt)}}),openSurface:(t)=>x({channel:E,v:g,type:"open-surface",id:d(p),payload:{surfaceId:t}}),writeClipboard:(t)=>x({channel:E,v:g,type:"clipboard-write",id:d(p),payload:{text:t}}),compose:(t)=>x({channel:E,v:g,type:"compose",id:d(p),payload:t}),attach:(t)=>x({channel:E,v:g,type:"attach",id:d(p),payload:ue(t)}),startSession:async(t)=>{if(t.projectId!==void 0)V(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")V(o.directory);else{if(o.name!==void 0)V(o.name,200);if(o.baseBranch!==void 0)V(o.baseBranch,200)}let i=await I({channel:E,v:g,type:"start-session",id:d(p),payload:Rt(t)},e.requestTimeoutMs??180000);if(!St(i))throw new l("HOST_REJECTED","Host did not return a session.");return i},prompt:(t)=>I({channel:E,v:g,type:"prompt",id:d(p),payload:ft(t)}).then((o)=>{if(!Et(o))throw new l("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>x({channel:E,v:g,type:"session-link",id:d(p),payload:ue(t)}),close:()=>x({channel:E,v:g,type:"close",id:d(p)}),oauthStart:()=>x({channel:E,v:g,type:"oauth-start",id:d(p)}),oauthDisconnect:()=>x({channel:E,v:g,type:"oauth-disconnect",id:d(p)}),request:(t)=>(Le(t.path)?I({channel:E,v:g,type:"request",id:d(p),payload:t}):Po()).then((o)=>{if(!De(o))throw new l("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:(t)=>(Le(t.path)?I({channel:E,v:g,type:"service-request",id:d(p),payload:t}):Po()).then((o)=>{if(!De(o))throw new l("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>I({channel:E,v:g,type:"service-status",id:d(p)}).then((t)=>{if(!bt(t))throw new l("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(ce(t)?I({channel:E,v:g,type:"file-read",id:d(p),payload:{path:t}}):He()).then((o)=>{if(!vt(o))throw new l("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!ce(t))return He();if(o.length>Ue)return Promise.reject(new l("FILE_TOO_LARGE",`Content is over ${Ue} characters.`));return I({channel:E,v:g,type:"file-write",id:d(p),payload:{path:t,content:o}}).then((i)=>{if(!Ot(i))throw new l("HOST_REJECTED","Host did not confirm the write.");return i})},listDir:(t)=>(ce(t)?I({channel:E,v:g,type:"file-list",id:d(p),payload:{path:t}}):He()).then((o)=>{if(!At(o))throw new l("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(ce(t)?I({channel:E,v:g,type:"file-stat",id:d(p),payload:{path:t}}):He()).then((o)=>{if(!xt(o))throw new l("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),i=t.system?.trim();if(o.length===0||o.length>we)return Promise.reject(new l("HOST_REJECTED",`Prompt must be 1 to ${we} characters.`));if(i!==void 0&&(i.length===0||i.length>Ne))return Promise.reject(new l("HOST_REJECTED",`System prompt must be 1 to ${Ne} characters.`));let a=t.maxOutputTokens===void 0?void 0:Math.min(Tt,Math.max(1,Math.floor(t.maxOutputTokens)));if(a!==void 0&&!Number.isFinite(a))return Promise.reject(new l("HOST_REJECTED","maxOutputTokens must be a number."));let T={prompt:o};if(i!==void 0)T.system=i;if(a!==void 0)T.maxOutputTokens=a;return I({channel:E,v:g,type:"generate",id:d(p),payload:T},e.requestTimeoutMs??mt).then((m)=>{if(!Ct(m))throw new l("HOST_REJECTED","Host did not return generated text.");return m})},openMicrophone:Xo,setBadge:(t)=>x({channel:E,v:g,type:"badge",id:d(p),payload:{count:ht(t)}}),setHeight:(t)=>x({channel:E,v:g,type:"resize",id:d(p),payload:{height:yt(t)}}),onFileOpen:(t)=>{if(ye.add(t),!je)je=!0,r.addEventListener("keydown",qt,!0);if(_e)t(_e);return()=>{ye.delete(t)}},onFileSnapshot:(t)=>(ge=t,()=>{if(ge===t)ge=null}),onFileSaved:(t)=>(be.add(t),()=>{be.delete(t)}),reportFileChange:(t)=>Je({...v,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:$t,reportFileUnsupported:()=>Je({...v,type:"file-unsupported"}),dispose:()=>{for(let t of se.keys())D({...v,type:"workspace-unsubscribe",id:d(p),payload:{subscriptionId:t}});se.clear();for(let t of ne.keys())D({...v,type:"shells-unsubscribe",id:d(p),payload:{subscriptionId:t}});if(ne.clear(),L)Qe(),L.release(),L=null;if(B=!0,Se=null,Ee=null,ge=null,ye.clear(),be.clear(),je)r.removeEventListener("keydown",qt,!0);r.removeEventListener(Re,Wt),r.removeEventListener("keydown",Kt,!0),r.removeEventListener("pointerover",Oe),r.removeEventListener("pointermove",Oe),r.removeEventListener("pointerout",jt),r.removeEventListener("focus",zt),ie?.close(),ie=null,ze.length=0;for(let t of re.values())clearTimeout(t.timer),t.reject(new l("HOST_UNAVAILABLE","Host client was disposed."));re.clear(),c.clear(),_.clear(),f.clear(),R.clear(),C.clear(),N.clear(),W.clear(),oe.clear(),Q.clear(),k.clear(),U.clear(),q.clear(),Y.length=0}}};var Mo=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var qr=new Set(Mo);var Go=["none","agent","user"];var jr=new Set(Go);var rr=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],sr=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],Uo=(e,r)=>{r.style.colorScheme=e.mode;for(let[n,S]of rr)r.style.setProperty(n,e.tokens[S]);for(let[n,S,c]of sr){let _=e.tokens[c]??"";r.style.setProperty(n,_),r.style.setProperty(S,_)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size",e.tokens.fontSize??"0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},Pt=(e,r)=>{if(Uo(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var nr={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},b=(e,r)=>`var(--${e}, var(--oc-${nr[e]}, ${r}))`,z=b("surface-background","transparent"),Ve=b("surface-elevated","transparent"),pe=b("surface-elevated-foreground","inherit"),H=b("surface-foreground","inherit"),O=b("surface-muted-foreground","gray"),ir=b("surface-muted","transparent"),Z=b("interactive-border","currentColor"),w=b("interactive-hover","transparent"),ee=b("interactive-active","transparent"),Mt=b("interactive-selection","transparent"),Gt=b("interactive-selection-foreground","inherit"),j=b("primary","currentColor"),Ut=b("primary-text","inherit"),wt=b("error-text","inherit"),ar=b("font-sans","inherit"),Nt=b("font-mono","monospace"),Do=b("radius","9px"),Lt=`calc(${Do} - 2px)`,wo=`calc(${Do} - 4px)`,A=(e,r,n="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${n})`,No=`background-image: linear-gradient(${w}, ${w});`,Dt=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,Ht="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Lo="box-shadow: var(--oc-sdk-lit);",Bt=`inset 0 0.5px 0 0 ${A(H,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,lr=`
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
  --oc-sdk-field-lift: ${Bt};
  --oc-sdk-raised-lift: ${Bt};
  --oc-sdk-lit: ${Bt};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,Fe=(e)=>{let r=b(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${b(`${e}-text`,"inherit")}; }`},s=(e)=>`calc(${e}rem / 14)`,ur=`
.oc-sdk { box-sizing: border-box; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: ${s(8)}; height: ${s(32)}; padding: 0 ${s(12)}; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; }
.oc-sdk-btn[data-size="sm"] { gap: ${s(6)}; height: ${s(28)}; padding: 0 ${s(10)}; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { gap: ${s(4)}; height: ${s(24)}; padding: 0 ${s(8)}; font-size: 0.75rem; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: ${s(14)}; height: ${s(14)}; }

.oc-sdk-field { display: flex; flex-direction: column; gap: ${s(4)}; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: ${s(32)}; padding: 0 ${s(10)}; border: 0; font-size: 0.875rem; line-height: 1.45; appearance: none; }
textarea.oc-sdk-input { height: auto; padding: ${s(8)} ${s(10)}; resize: vertical; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: ${s(34)}; padding-right: ${s(34)}; }
.oc-sdk-search-icon { position: absolute; left: ${s(11)}; top: 50%; transform: translateY(-50%); pointer-events: none; }
.oc-sdk-search-clear { position: absolute; right: ${s(6)}; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: ${s(24)}; height: ${s(24)}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: ${s(4)}; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: ${s(6)}; align-self: flex-start; width: auto; max-width: 100%; min-width: 0; height: ${s(28)}; padding: 0 ${s(10)}; border: 1px solid transparent; font-size: 0.8125rem; text-align: left; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: ${s(2)}; min-width: ${s(160)}; max-width: calc(100vw - ${s(16)}); max-height: min(${s(320)}, calc(100vh - ${s(16)})); overflow: auto; padding: ${s(4)}; border: 1px solid transparent; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: ${s(2)} ${s(2)} ${s(4)}; }
.oc-sdk-popup-search .oc-sdk-input { height: ${s(28)}; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: ${s(8)}; width: 100%; padding: ${s(6)} ${s(8)}; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; }
.oc-sdk-option-check { flex: 0 0 auto; display: inline-flex; width: ${s(14)}; visibility: hidden; }
.oc-sdk-option[aria-selected="true"] > .oc-sdk-option-check { visibility: visible; }
.oc-sdk-popup-empty { padding: ${s(8)}; font-size: 0.8125rem; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: ${s(8)}; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: ${s(14)}; height: ${s(14)}; margin-top: ${s(3)}; border: 1px solid transparent; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: ${s(36)}; height: ${s(20)}; --oc-sdk-thumb-travel: ${s(16)}; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: ${s(2)}; left: ${s(2)}; width: ${s(16)}; height: ${s(16)}; }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; }

.oc-sdk-tabs { display: inline-flex; gap: ${s(2)}; padding: ${s(2)}; max-width: 100%; overflow: auto; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: ${s(6)}; height: ${s(28)}; padding: 0 ${s(10)}; border: 1px solid transparent; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: ${s(1)} ${s(6)}; font-size: ${s(11)}; font-weight: 500; line-height: ${s(16)}; white-space: nowrap; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: ${s(8)}; width: 100%; padding: ${s(6)} ${s(8)}; text-align: left; }
.oc-sdk-row-lead { flex: 0 0 auto; width: ${s(64)}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-list-empty { padding: ${s(16)} ${s(8)}; text-align: center; font-size: 0.8125rem; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${s(4)}; padding: ${s(40)} ${s(16)}; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; }
.oc-sdk-empty-action { margin-top: ${s(12)}; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: ${s(8)}; font-size: 0.8125rem; }
.oc-sdk-spinner-ring { width: ${s(16)}; height: ${s(16)}; border: 2px solid transparent; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: ${s(12)}; height: ${s(12)}; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: ${s(12)}; padding: ${s(8)} ${s(12)}; border: 1px solid transparent; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: ${s(2)}; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-banner-body { font-size: 0.8125rem; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: ${s(8)}; width: 100%; margin: ${s(8)} 0; font-size: 0.75rem; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: ${s(4)} 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: ${s(4)}; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: ${s(6)}; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; transform-origin: left; transition: transform 200ms ease-out; }
.oc-sdk-progress-value { display: inline-flex; align-items: center; gap: ${s(2)}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { font-weight: 600; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text img { display: block; max-width: 100%; margin: ${s(8)} 0; }

/* Under a finger the controls reach the app's touch sizes: rows and options 44px like its sheets, every other
   control at least 36px. Inputs keep 16px text, below which iOS zooms the page on focus. */
@media (pointer: coarse) {
  .oc-sdk-btn, .oc-sdk-input { height: ${s(40)}; }
  .oc-sdk-btn[data-size="sm"], .oc-sdk-btn[data-size="xs"], .oc-sdk-trigger, .oc-sdk-tab, .oc-sdk-popup-search .oc-sdk-input { height: ${s(36)}; }
  .oc-sdk-input, .oc-sdk-popup-search .oc-sdk-input { font-size: max(16px, 0.875rem); }
  .oc-sdk-search-clear { width: ${s(36)}; height: ${s(36)}; right: 0; }
  .oc-sdk-row, .oc-sdk-option { min-height: ${s(44)}; }
  .oc-sdk-check { min-height: ${s(36)}; padding: ${s(8)} 0; }
}
`,Ho=`${lr}
.oc-sdk { color: ${H}; font-family: ${ar}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${No} }
.oc-sdk-mono { font-family: ${Nt}; }
.oc-sdk-muted { color: ${O}; }
${Fe("success")}${Fe("warning")}${Fe("error")}${Fe("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${j}; --oc-sdk-tone-text: ${Ut}; }

.oc-sdk-btn { border-radius: ${Lt}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${wo}; }
.oc-sdk-btn[data-variant="default"] { color: ${Ut}; background: ${A(j,10,z)}; border-color: ${A(j,12)}; ${Lo} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${A(j,16,z)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${A(j,22,z)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${ir}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${ee}, ${ee}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${pe}; ${Ht} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${ee}, ${ee}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${w}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${ee}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${b("status-error","red")}; color: ${wt}; background: ${A("var(--oc-sdk-tone)",7,z)}; border-color: ${A("var(--oc-sdk-tone)",12)}; ${Lo} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${A("var(--oc-sdk-tone)",9,z)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${A("var(--oc-sdk-tone)",11,z)}; box-shadow: none; }

.oc-sdk-field-note { color: ${O}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${wt}; }
.oc-sdk-input { border-radius: ${Lt}; background: var(--oc-sdk-field-bg); color: ${pe}; ${Dt("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${O}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Dt(A(H,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Dt(b("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${Nt}; }

.oc-sdk-search-icon { color: ${O}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${j}; }
.oc-sdk-search-clear { border-radius: ${wo}; color: ${O}; }
.oc-sdk-search-clear:hover { background: ${w}; color: ${H}; }

.oc-sdk-trigger { border-radius: ${Lt}; background: var(--oc-sdk-raised-bg); color: ${pe}; ${Ht} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${ee}, ${ee}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${O}; }
.oc-sdk-trigger-chevron { color: ${O}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${pe}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${Ve}; background-clip: padding-box; color: ${pe}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${w}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${Mt}; color: ${Gt}; }
.oc-sdk-option-check { color: ${H}; }
.oc-sdk-option[data-destructive="true"] { color: ${wt}; }
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
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${No} }
.oc-sdk-check-desc { color: ${O}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${A(H,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${O}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${H}; }
.oc-sdk-tab[aria-selected="true"] { color: ${Gt}; background: ${Mt}; border-color: ${Z}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${pe}; background: var(--oc-sdk-raised-bg); ${Ht} }
.oc-sdk-tab-count { color: ${O}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${A(H,6)}; color: ${O}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${A("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${w}; }
.oc-sdk-row[aria-selected="true"] { background: ${Mt}; color: ${Gt}; }
.oc-sdk-row-lead { font-family: ${Nt}; color: ${O}; }
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

.oc-sdk-text a { color: ${Ut}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${A(Z,60)}; }
`,P=`
${et}
${ur}
${Ho}`;var Bo="oc-sdk-ui-style";var M=(e)=>{let r=document.getElementById(Bo);if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}tt(document);let n=document.createElement("style");n.id=Bo,n.textContent=e,document.head.appendChild(n)},G=(e,r)=>{let n=document.createElement(e);if(r)n.className=r;return n},J=(e)=>{let r=G("button",e);return r.type="button",r},X=(e,r)=>{let n=r??"";if(e.textContent!==n)e.textContent=n};var cr=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},de=(e,r)=>{M(P);let n=r,S=J("oc-sdk oc-sdk-btn"),c=cr(),_=document.createElement("span");S.append(_),e.append(S);let f=()=>{if(S.dataset.variant=n.variant??"default",S.dataset.size=n.size??"default",S.disabled=Boolean(n.disabled)||Boolean(n.loading),S.dataset.loading=n.loading?"true":"false",S.setAttribute("aria-busy",n.loading?"true":"false"),n.loading&&c.parentNode!==S)S.prepend(c);else if(!n.loading&&c.parentNode===S)c.remove();X(_,n.label)},R=()=>{if(n.disabled||n.loading)return;n.onClick()};return S.addEventListener("click",R),f(),{update:(C)=>{n={...n,...C},f()},dispose:()=>{S.removeEventListener("click",R),S.remove()}}};var Ke=It(),te=document.querySelector("#root");if(!te)throw Error("DeskChart: missing root");te.style.padding="12px";Ke.onReady((e)=>Pt(e,document.documentElement));Ke.onBlock(({args:e,answered:r})=>{let n=(e.values??"").split(",").map(Number).filter(Number.isFinite),S=Math.max(1,...n);te.replaceChildren();let c=document.createElement("div");c.textContent=e.title??"",c.style.font="600 13px var(--oc-font, system-ui)";let _=document.createElement("div");_.style.cssText="display:flex;align-items:flex-end;gap:6px;height:96px;margin-top:8px";for(let R of n){let C=document.createElement("div");C.style.cssText=`flex:1;height:${R/S*100}%;background:currentColor;opacity:.6;border-radius:3px 3px 0 0`,C.title=String(R),_.append(C)}te.append(c,_);let f=document.createElement("div");f.style.marginTop="10px",te.append(f),de(f,{label:r??"Explain this",variant:"outline",size:"sm",disabled:r!==null,onClick:()=>{Ke.answerBlock("Explain this chart")}})});new ResizeObserver(()=>{Ke.setHeight(Math.ceil(te.getBoundingClientRect().height))}).observe(te);})();
