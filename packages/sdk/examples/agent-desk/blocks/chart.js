(()=>{var p="openchamber.sdk",d=2;var Ee="openchamber:guest-bootstrap",wo=(e,r,n)=>{let{window:T,MessageChannel:S}=globalThis;if(!T||!S)return;try{let y=new S,O=y.port1,b=!1,C=!1,w=null,B=(A)=>{try{A.close()}catch{}},Q=(A=[])=>{for(let k of A)B(k);if(!b)b=!0,B(O)},K=(A)=>{let k=new CustomEvent(n,{detail:A,cancelable:!0});if(!T.dispatchEvent(k))return;B(A),b=!0};T.addEventListener(n,(A)=>{if(!("detail"in A)||A.detail!==null)return;if(C=!0,w){let k=w;w=null,K(k)}}),O.addEventListener("message",(A)=>{if(b)return;let k=A.data,F=A.ports??[];if(!k||k.channel!==e||k.v!==r||k.type!=="connect-port"||F.length!==1){Q(F);return}let j=F[0];if(b=!0,B(O),j.start(),!C){w=j;return}K(j)}),O.start(),T.parent.postMessage({channel:e,v:r,type:"bootstrap"},"*",[y.port2])}catch{}},No=`(${wo.toString()})(${JSON.stringify("openchamber.guest-bootstrap")}, 2, ${JSON.stringify("openchamber:guest-bootstrap")});`;var je=`
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
`;function Xt(e){let r=e.documentElement;if(r.hasAttribute("data-oc-scrollbar-activity"))return;r.setAttribute("data-oc-scrollbar-activity","");let n=new WeakMap;e.addEventListener("scroll",(T)=>{let S=T.target===e?r:T.target;if(!(S instanceof Element))return;if(!S.hasAttribute("data-oc-scrolling"))S.setAttribute("data-oc-scrolling","");let y=n.get(S);if(y!==void 0)clearTimeout(y);n.set(S,setTimeout(()=>{n.delete(S),S.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var Lo=`(${Xt.toString()})(document);`;var ze=128,Je=65536;var he=128;var be=65536;var Kt=/^[a-z][a-z0-9-]{0,39}$/;var qt=(e)=>Object(e)===e&&!Array.isArray(e),Qe=(e,r)=>Object.keys(e).every((n)=>r.includes(n)),Wt=(e)=>String(e)===e&&e.length>=1&&e.length<=60,$t=(e)=>String(e)===e&&e.length>=1&&e.length<=80,jt=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let n of e){if(!qt(n)||!Kt.test(n.id)||!Wt(n.label))return!1;if(n.disabled!==void 0&&n.disabled!==!0&&n.disabled!==!1)return!1;if(r.has(n.id))return!1;if(r.add(n.id),n.kind==="button"){if(!Qe(n,["kind","id","label","disabled"]))return!1;continue}if(n.kind!=="select"||!Qe(n,["kind","id","label","value","options","disabled"]))return!1;if(!$t(n.value)||!Array.isArray(n.options)||n.options.length<1||n.options.length>16)return!1;let T=new Set;for(let S of n.options){if(!qt(S)||!Qe(S,["value","label"])||!$t(S.value)||!Wt(S.label)||T.has(S.value))return!1;T.add(S.value)}if(!T.has(n.value))return!1}return!0};var zt=["{id}","{segment}","{segments+}"];var Sr=new Set(zt);var Jt=["turn-finished","turn-failed","permission-asked","question-asked","turn-started","session-created","session-archived","session-deleted"];var gr=new Set(Jt);var ve=20000000,xe=256;var Ye=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,Qt=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let n=0;n<e.bytes.byteLength;n+=1)if(e.bytes[n]!==r.bytes[n])return!1;return!0};var Yt=/^[A-Za-z0-9_-]{1,80}$/;var Zt=["left","right","top","bottom"];var eo=(e,r=0,n={remaining:16000})=>{if(--n.remaining<0||r>=32)return!1;if(e===null)return!0;let T=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let S of T)if(!eo(S,r+1,n))return!1;return!0},Ze=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(Ze);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(Ze)}return String(e)===e||Number.isFinite(e)},et=(e)=>{try{if(String(e.id)!==e.id||!Yt.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!Zt.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!eo(e.data)||!Ze(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var ot=2000;var oo=["file","directory","other","missing"],rt=(e)=>Boolean(e&&"sessionId"in e),st=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var ro=/^[0-9a-f]{7,64}$/i,nt=(e)=>ro.test(e),Oe=500,Ae=32000,so=16000,no=128,io=200,ao=2000,lo=16000,uo=80,co=200,po=16000;var So=2000;var it=20000,Ce=1024,ke=2000000;var Ie=64000,Pe=8000,at=4000;var lt=960000;var Eo=999,go=1e4,ge=500,_o=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],To=["stopped","starting","ready","failed"],Ho=new Set(_o),mo=(e)=>Ho.has(e),fo=(e)=>e&&mo(e)?e:"HOST_REJECTED",oe=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(oe);if(Object(e)===e)return Object.values(e).every(oe);return!1},Ro=(e)=>oe(e)&&JSON.stringify(e).length<=po,to=(e)=>e?.trim().slice(0,co)??"",re=(e)=>{let r=e.id.trim().slice(0,no),n=e.title.trim().slice(0,io),T=e.url.trim().slice(0,ao),S=e.text?.trim().slice(0,lo),y=e.author?.trim().slice(0,uo),O=e.kind==="pull"?"pull":"issue",b={providerId:e.providerId.trim(),id:r,title:n||r,url:T,kind:O};if(S)b.text=S;if(y)b.author=y;if(O==="pull"){let C=to(e.branches?.head),w=to(e.branches?.base);if(C&&w)b.branches={head:C,base:w}}if(Ro(e.data))b.data=e.data;return b},ut=(e)=>{let r=re(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},ct=(e)=>{let r={text:e.text.trim().slice(0,so)};if(e.send)r.send=!0;return r},pt=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(Eo,Math.max(0,Math.round(e)))},dt=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(go,Math.max(0,Math.ceil(e)))};var se=(e)=>e.length>0&&e.length<=Ce&&!e.includes("\x00")&&!e.includes("\\");var Ge=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>So)return!1;return!e.split("/").some((n)=>n==="."||n==="..")},Bo=new Set(To),St=(e)=>Boolean(e&&"status"in e&&Bo.has(String(e.status))&&!("body"in e)),Me=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),Et=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),gt=(e)=>Boolean(e&&"written"in e&&e.written===!0),_t=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),Fo=new Set(oo),Tt=(e)=>Boolean(e&&"kind"in e&&"size"in e&&Fo.has(String(e.kind))&&Number.isFinite(e.size)),mt=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),Vo=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","service-event","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late"]),Xo=(e)=>Object(e)===e?e:null,tt=(e)=>String(e)===e&&e.length>0,qo=(e)=>{if(!tt(e.id))return null;if(e.ok===!0){let r={channel:p,v:d,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&tt(e.error))return{channel:p,v:d,type:"result",id:e.id,ok:!1,error:e.error,code:fo(tt(e.code)?e.code:void 0)};return null},ft=(e)=>{let r=Xo(e);if(!r||r.channel!==p||r.v!==d)return null;if(r.type==="result")return qo(r);if(!Vo.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var yo=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),Wo=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class l extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var ho=()=>Promise.reject(new l("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),Ue=()=>Promise.reject(new l("BAD_PATH",`File path must be 1 to ${Ce} characters without NUL or backslash.`)),we=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new l("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},c=(e)=>(e.value+=1,`oc-${e.value}`),Rt=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new l("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let n=e.requestTimeoutMs??it,T=e.acceptSource??((t)=>t===r.parent),S=new Set,y=new Set,O=new Set,b=new Set,C=new Set,w=new Set,B=new Set,Q=new Set,K=new Set,A=new Set,k=new Set,F=new Set,j=[],le=null,ue=null,Te=new Set,me=new Set,ce=null,pe=null,Xe=!1,Y=new Map,Z=new Map,ee=new Map,D=!1,u={value:0},a=null,V=null,de=!1,Se=!1,Gt=null,Mt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},te=null,qe=[],L=(t)=>{if(D)return;if(te){te.postMessage(t);return}qe.push(t)},Ut=()=>{if(D||Object.is(r.parent,r)||F.size===0||a?.features?.lateGenerateResults!==!0)return;L({channel:p,v:d,type:"generate-late-listen"})},m=(t,o)=>{for(let s of t)try{s(o)}catch(i){console.error(i)}},Po=(t)=>{if(!("data"in t))return;let o=ft(t.data);if(!o)return;if(o.type==="workspace"){let i=Z.get(o.payload.subscriptionId);if(i)m([i],o.payload.snapshot);return}if(o.type==="shells"){let i=ee.get(o.payload.subscriptionId);if(i)m([i],o.payload.snapshot);return}if(o.type==="ready"){if(a=o.payload,V=Mt(o.payload.session),m(S,o.payload),m(y,o.payload.directory),m(O,o.payload.session),V)m(b,V);if(m(C,o.payload.connection),m(w,o.payload.settings),m(B,o.payload.item),o.payload.block)m(Q,o.payload.block);Ut();return}if(o.type==="service-event"){m(K,o.payload);return}if(o.type==="generate-late"){if(F.size===0)j.push(o.payload);else m(F,o.payload);return}if(o.type==="directory"){if(a)a={...a,directory:o.payload.directory};m(y,o.payload.directory);return}if(o.type==="session"){if(a)a={...a,session:o.payload.session};if(!o.payload.session)V=null;else if(V?.sessionId!==o.payload.session.id)V=Mt(o.payload.session);m(O,o.payload.session);return}if(o.type==="session-lifecycle"){V=o.payload,m(b,o.payload);return}if(o.type==="connection"){if(a)a={...a,connection:o.payload.connection};m(C,o.payload.connection);return}if(o.type==="settings"){if(a)a={...a,settings:o.payload.settings};m(w,o.payload.settings);return}if(o.type==="item"){if(a)a={...a,item:o.payload.item};m(B,o.payload.item);return}if(o.type==="status-control-event"){m(A,o.payload);return}if(o.type==="popover-closed"){m(k,o.payload);return}if(o.type==="action"){let i=(E)=>{if(!D)L({channel:p,v:d,type:"action-result",id:o.id,payload:E})},g=ue;if(!g){i({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>g(o.payload)).then(()=>i({ok:!0}),(E)=>{let x=(E instanceof Error?E.message:String(E)).trim();i({ok:!1,error:(x||"Action failed.").slice(0,ge)})});return}if(o.type==="file-open"){let i=o.payload;if(pe&&Qt(pe,i))return;pe=i,m(Te,o.payload);return}if(o.type==="file-saved"){m(me,o.payload.version);return}if(o.type==="file-snapshot"){let i=(x)=>{if(!D)L({channel:p,v:d,type:"file-snapshot-result",id:o.id,payload:x})},g=(x)=>i({error:(x.trim()||"Could not read the edited file.").slice(0,ge)}),E=ce;if(!E){g("This extension does not edit files.");return}Promise.resolve().then(()=>E(o.payload.purpose)).then((x)=>{if(Ye(x)>ve){g(`The file is over ${ve} ${"bytes"in x?"bytes":"characters"}.`);return}if(x.version.length>xe){g(`The snapshot version is over ${xe} characters.`);return}i({snapshot:"bytes"in x?{bytes:x.bytes,version:x.version}:{content:x.content,version:x.version}})},(x)=>g(x instanceof Error?x.message:String(x)));return}if(o.type==="resolve"){let i=(E)=>{L({channel:p,v:d,type:"resolve-result",id:o.id,payload:E})},g=le;if(!g){i({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>g(o.payload)).then((E)=>i({item:E?re(E):null}),(E)=>{let x=(E instanceof Error?E.message:String(E)).trim();i({error:(x||"Command failed.").slice(0,ge)})});return}let s=Y.get(o.id);if(!s)return;if(clearTimeout(s.timer),Y.delete(o.id),o.ok){s.resolve(o.payload);return}s.reject(new l(o.code,o.error))},Go=(t)=>{if(!("source"in t))return!0;return T(t.source)},wt=(t)=>{if(!Go(t)||!("detail"in t))return;let o=t.detail;if(!(o instanceof MessagePort))return;t.preventDefault(),t.stopImmediatePropagation(),te?.close(),te=o,o.addEventListener("message",Po),o.start(),o.postMessage({channel:p,v:d,type:"hello"});for(let s of qe.splice(0))o.postMessage(s)};r.addEventListener(Ee,wt),r.dispatchEvent?.(new CustomEvent(Ee,{detail:null}));let I=(t,o=n)=>{if(D||Object.is(r.parent,r))return Promise.reject(new l("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((s,i)=>{let g=setTimeout(()=>{Y.delete(t.id),i(new l("HOST_TIMEOUT","Host did not answer in time."))},o);Y.set(t.id,{resolve:s,reject:i,timer:g}),L(t)})},h=(t)=>I(t).then(()=>{return}),v={channel:p,v:d},We=(t)=>{if(!D&&!Object.is(r.parent,r))L(t)},Nt=()=>We({...v,type:"file-save"}),Lt=(t)=>{if(!yo(t)||!Wo(t))return;t.preventDefault(),Nt()},Dt=(t)=>{if(!yo(t)||t.key!=="Escape"||a?.surface!=="popover"||!a.popover)return;t.preventDefault(),Ft(a.popover.id,"escape").catch(()=>{return})},fe=()=>{let t=a?.surface==="popover"?a.popover:void 0;if(!t)return;let o=de||Se;if(Gt===o)return;Gt=o,Vt(t.id,o).catch(()=>{return})},Re=()=>{if(a?.surface!=="popover"||de)return;de=!0,fe()},Ht=(t)=>{if(a?.surface!=="popover"||t.relatedTarget!==null||!de)return;de=!1,fe()},Bt=()=>{if(a?.surface!=="popover"||Se)return;Se=!0,fe()},Mo=()=>{if(a?.surface!=="popover"||!Se)return;Se=!1,fe()},H=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new l("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},$e=async(t)=>{if(t.kind!=="projects")H(t.projectId);let o=await I({...v,type:"workspace-read",id:c(u),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new l("HOST_REJECTED","Host did not return workspace data.");return o},Ke=async(t,o)=>{if(t.kind!=="projects")H(t.projectId);let s=c(u);Z.set(s,o);try{await h({...v,type:"workspace-subscribe",id:c(u),payload:{subscriptionId:s,query:t}})}catch(i){if(Z.delete(s),!D)L({...v,type:"workspace-unsubscribe",id:c(u),payload:{subscriptionId:s}});throw i}return()=>{if(!Z.delete(s)||D)return;L({...v,type:"workspace-unsubscribe",id:c(u),payload:{subscriptionId:s}})}},Uo=async(t,o)=>{if(t.kind==="session")H(t.sessionId);if(t.kind==="project")H(t.projectId);let s=c(u);ee.set(s,o);try{await h({...v,type:"shells-subscribe",id:c(u),payload:{subscriptionId:s,scope:t}})}catch(i){if(ee.delete(s),!D)L({...v,type:"shells-unsubscribe",id:c(u),payload:{subscriptionId:s}});throw i}return()=>{if(!ee.delete(s)||D)return;L({...v,type:"shells-unsubscribe",id:c(u),payload:{subscriptionId:s}})}},ye=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>ze))throw new l("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!oe(t.value))throw new l("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>Je)throw new l("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&a?.features?.deviceStorage!==!0)throw new l("UNSUPPORTED","This host does not support device storage.");let o=await I({...v,type:"storage",id:c(u),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new l("HOST_REJECTED","Host did not return storage data.");return o},Ft=(t,o)=>a?.features?.popovers!==!0&&!(a?.surface==="popover"&&a.popover?.id===t)?Promise.reject(new l("UNSUPPORTED","This host does not support popovers.")):h({...v,type:"popover-close",id:c(u),payload:o?{id:t,reason:o}:{id:t}}),Vt=(t,o)=>a?.features?.popovers!==!0&&!(a?.surface==="popover"&&a.popover?.id===t)?Promise.reject(new l("UNSUPPORTED","This host does not support popovers.")):h({...v,type:"popover-anchor",id:c(u),payload:{id:t,active:o}});return r.addEventListener("keydown",Dt,!0),r.addEventListener("pointerover",Re),r.addEventListener("pointermove",Re),r.addEventListener("pointerout",Ht),r.addEventListener("focus",Bt),r.addEventListener("blur",Mo),{onAction:(t)=>(ue=t,()=>{if(ue===t)ue=null}),listProjects:async()=>{let t=await $e({kind:"projects"});if(t.kind!=="projects")throw new l("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await $e({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new l("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await $e({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new l("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>Ke({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>Ke({kind:"worktrees",projectId:t},(s)=>{if(s.kind==="worktrees")o(s)}),onSessions:(t,o)=>Ke({kind:"sessions",projectId:t},(s)=>{if(s.kind==="sessions")o(s)}),onRunningShells:(t,o)=>Uo(t,o),readShellOutput:async(t,o)=>{H(t,he);let s=o?.cursor;if(s!==void 0&&(!Number.isInteger(s)||s<0))throw new l("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let i=o?.tailBytes;if(i!==void 0&&(!Number.isInteger(i)||i<1||i>be))throw new l("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${be}.`);let E=await I({...v,type:"shell-output",id:c(u),payload:{shellId:t,cursor:s,tailBytes:i}});if(!E||typeof E.output!=="string"||!Number.isFinite(E.cursor))throw new l("HOST_REJECTED","Host did not return shell output.");return E},stopShell:async(t)=>{if(H(t,he),(await I({...v,type:"shell-stop",id:c(u),payload:{shellId:t}}))?.stopped!==!0)throw new l("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{H(t),await h({...v,type:"open-session",id:c(u),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let s=we(o),i={op:"get",key:t};if(s)i.scope=s;let g=await ye(i);return g.op==="get"&&g.found?g.value:void 0},set:async(t,o,s)=>{let i=we(s),g={op:"set",key:t,value:o};if(i)g.scope=i;await ye(g)},delete:async(t,o)=>{let s=we(o),i={op:"delete",key:t};if(s)i.scope=s;await ye(i)},keys:async(t)=>{let o=we(t),s={op:"keys"};if(o)s.scope=o;let i=await ye(s);if(i.op!=="keys")throw new l("HOST_REJECTED","Expected storage keys.");return i.keys}},onReady:(t)=>{if(S.add(t),a)t(a);return()=>{S.delete(t)}},onDirectory:(t)=>{if(y.add(t),a)t(a.directory);return()=>{y.delete(t)}},onSession:(t)=>{if(O.add(t),a)t(a.session);return()=>{O.delete(t)}},onSessionLifecycle:(t)=>{if(b.add(t),V)t(V);return()=>{b.delete(t)}},onConnection:(t)=>{if(C.add(t),a)t(a.connection);return()=>{C.delete(t)}},onSettings:(t)=>{if(w.add(t),a)t(a.settings);return()=>{w.delete(t)}},onItem:(t)=>{if(B.add(t),a)t(a.item);return()=>{B.delete(t)}},onBlock:(t)=>{if(Q.add(t),a?.block)t(a.block);return()=>{Q.delete(t)}},onServiceEvent:(t)=>(K.add(t),()=>{K.delete(t)}),onStatusControl:(t)=>(A.add(t),()=>{A.delete(t)}),onPopoverClosed:(t)=>(k.add(t),()=>{k.delete(t)}),onLateGenerateResult:(t)=>{F.add(t);for(let o of j.splice(0))m([t],o);return Ut(),()=>{F.delete(t)}},setStatusControls:(t)=>{if(a?.features?.statusControls!==!0)return Promise.reject(new l("UNSUPPORTED","This host does not support status controls."));if(!jt(t))return Promise.reject(new l("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return h({...v,type:"status-controls",id:c(u),payload:{controls:t}})},openPopover:(t)=>{if(a?.features?.popovers!==!0)return Promise.reject(new l("UNSUPPORTED","This host does not support popovers."));if(!et(t))return Promise.reject(new l("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return h({...v,type:"popover-open",id:c(u),payload:t})},closePopover:Ft,setPopoverAnchorActive:Vt,onResolve:(t)=>(le=t,()=>{if(le===t)le=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Oe)return Promise.reject(new l("HOST_REJECTED",`Toast message must contain 1 to ${Oe} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Ae))return Promise.reject(new l("HOST_REJECTED",`Toast copy text must contain 1 to ${Ae} characters.`));return h({channel:p,v:d,type:"toast",id:c(u),payload:{...t,message:o}})},openUrl:(t)=>h({channel:p,v:d,type:"open-url",id:c(u),payload:{url:t}}),openCommit:(t)=>nt(t)?h({channel:p,v:d,type:"open-commit",id:c(u),payload:{sha:t}}):Promise.reject(new l("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),answerBlock:(t)=>h({channel:p,v:d,type:"block-answer",id:c(u),payload:{text:t.trim().slice(0,ot)}}),openSurface:(t)=>h({channel:p,v:d,type:"open-surface",id:c(u),payload:{surfaceId:t}}),writeClipboard:(t)=>h({channel:p,v:d,type:"clipboard-write",id:c(u),payload:{text:t}}),compose:(t)=>h({channel:p,v:d,type:"compose",id:c(u),payload:t}),attach:(t)=>h({channel:p,v:d,type:"attach",id:c(u),payload:re(t)}),startSession:async(t)=>{if(t.projectId!==void 0)H(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")H(o.directory);else{if(o.name!==void 0)H(o.name,200);if(o.baseBranch!==void 0)H(o.baseBranch,200)}let s=await I({channel:p,v:d,type:"start-session",id:c(u),payload:ut(t)},e.requestTimeoutMs??180000);if(!rt(s))throw new l("HOST_REJECTED","Host did not return a session.");return s},prompt:(t)=>I({channel:p,v:d,type:"prompt",id:c(u),payload:ct(t)}).then((o)=>{if(!st(o))throw new l("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>h({channel:p,v:d,type:"session-link",id:c(u),payload:re(t)}),close:()=>h({channel:p,v:d,type:"close",id:c(u)}),oauthStart:()=>h({channel:p,v:d,type:"oauth-start",id:c(u)}),oauthDisconnect:()=>h({channel:p,v:d,type:"oauth-disconnect",id:c(u)}),request:(t)=>(Ge(t.path)?I({channel:p,v:d,type:"request",id:c(u),payload:t}):ho()).then((o)=>{if(!Me(o))throw new l("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:(t)=>(Ge(t.path)?I({channel:p,v:d,type:"service-request",id:c(u),payload:t}):ho()).then((o)=>{if(!Me(o))throw new l("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>I({channel:p,v:d,type:"service-status",id:c(u)}).then((t)=>{if(!St(t))throw new l("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(se(t)?I({channel:p,v:d,type:"file-read",id:c(u),payload:{path:t}}):Ue()).then((o)=>{if(!Et(o))throw new l("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!se(t))return Ue();if(o.length>ke)return Promise.reject(new l("FILE_TOO_LARGE",`Content is over ${ke} characters.`));return I({channel:p,v:d,type:"file-write",id:c(u),payload:{path:t,content:o}}).then((s)=>{if(!gt(s))throw new l("HOST_REJECTED","Host did not confirm the write.");return s})},listDir:(t)=>(se(t)?I({channel:p,v:d,type:"file-list",id:c(u),payload:{path:t}}):Ue()).then((o)=>{if(!_t(o))throw new l("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(se(t)?I({channel:p,v:d,type:"file-stat",id:c(u),payload:{path:t}}):Ue()).then((o)=>{if(!Tt(o))throw new l("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),s=t.system?.trim();if(o.length===0||o.length>Ie)return Promise.reject(new l("HOST_REJECTED",`Prompt must be 1 to ${Ie} characters.`));if(s!==void 0&&(s.length===0||s.length>Pe))return Promise.reject(new l("HOST_REJECTED",`System prompt must be 1 to ${Pe} characters.`));let i=t.maxOutputTokens===void 0?void 0:Math.min(at,Math.max(1,Math.floor(t.maxOutputTokens)));if(i!==void 0&&!Number.isFinite(i))return Promise.reject(new l("HOST_REJECTED","maxOutputTokens must be a number."));let g={prompt:o};if(s!==void 0)g.system=s;if(i!==void 0)g.maxOutputTokens=i;return I({channel:p,v:d,type:"generate",id:c(u),payload:g},e.requestTimeoutMs??lt).then((E)=>{if(!mt(E))throw new l("HOST_REJECTED","Host did not return generated text.");return E})},setBadge:(t)=>h({channel:p,v:d,type:"badge",id:c(u),payload:{count:pt(t)}}),setHeight:(t)=>h({channel:p,v:d,type:"resize",id:c(u),payload:{height:dt(t)}}),onFileOpen:(t)=>{if(Te.add(t),!Xe)Xe=!0,r.addEventListener("keydown",Lt,!0);if(pe)t(pe);return()=>{Te.delete(t)}},onFileSnapshot:(t)=>(ce=t,()=>{if(ce===t)ce=null}),onFileSaved:(t)=>(me.add(t),()=>{me.delete(t)}),reportFileChange:(t)=>We({...v,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:Nt,reportFileUnsupported:()=>We({...v,type:"file-unsupported"}),dispose:()=>{for(let t of Z.keys())L({...v,type:"workspace-unsubscribe",id:c(u),payload:{subscriptionId:t}});Z.clear();for(let t of ee.keys())L({...v,type:"shells-unsubscribe",id:c(u),payload:{subscriptionId:t}});if(ee.clear(),D=!0,le=null,ue=null,ce=null,Te.clear(),me.clear(),Xe)r.removeEventListener("keydown",Lt,!0);r.removeEventListener(Ee,wt),r.removeEventListener("keydown",Dt,!0),r.removeEventListener("pointerover",Re),r.removeEventListener("pointermove",Re),r.removeEventListener("pointerout",Ht),r.removeEventListener("focus",Bt),te?.close(),te=null,qe.length=0;for(let t of Y.values())clearTimeout(t.timer),t.reject(new l("HOST_UNAVAILABLE","Host client was disposed."));Y.clear(),S.clear(),y.clear(),O.clear(),b.clear(),C.clear(),w.clear(),B.clear(),Q.clear(),K.clear(),A.clear(),k.clear(),F.clear(),j.length=0}}};var bo=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var Pr=new Set(bo);var vo=["none","agent","user"];var Mr=new Set(vo);var $o=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],Ko=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],xo=(e,r)=>{r.style.colorScheme=e.mode;for(let[n,T]of $o)r.style.setProperty(n,e.tokens[T]);for(let[n,T,S]of Ko){let y=e.tokens[S]??"";r.style.setProperty(n,y),r.style.setProperty(T,y)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size","0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},yt=(e,r)=>{if(xo(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var jo={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},_=(e,r)=>`var(--${e}, var(--oc-${jo[e]}, ${r}))`,q=_("surface-background","transparent"),Le=_("surface-elevated","transparent"),ne=_("surface-elevated-foreground","inherit"),N=_("surface-foreground","inherit"),f=_("surface-muted-foreground","gray"),zo=_("surface-muted","transparent"),z=_("interactive-border","currentColor"),G=_("interactive-hover","transparent"),J=_("interactive-active","transparent"),ht=_("interactive-selection","transparent"),bt=_("interactive-selection-foreground","inherit"),X=_("primary","currentColor"),vt=_("primary-text","inherit"),xt=_("error-text","inherit"),Jo=_("font-sans","inherit"),Ot=_("font-mono","monospace"),ko=_("radius","9px"),At=`calc(${ko} - 2px)`,Oo=`calc(${ko} - 4px)`,R=(e,r,n="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${n})`,Ao=`background-image: linear-gradient(${G}, ${G});`,Ct=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,kt="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Co="box-shadow: var(--oc-sdk-lit);",It=`inset 0 0.5px 0 0 ${R(N,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,Qo=`
:root {
  --oc-sdk-edge: ${R(N,16)};
  --oc-sdk-field-bg: ${Le};
  --oc-sdk-raised-bg: ${q};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${R(N,14)};
  --oc-sdk-field-bg: ${R(q,50,Le)};
  --oc-sdk-raised-bg: ${Le};
  --oc-sdk-field-lift: ${It};
  --oc-sdk-raised-lift: ${It};
  --oc-sdk-lit: ${It};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,Ne=(e)=>{let r=_(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${_(`${e}-text`,"inherit")}; }`},Yo=`
.oc-sdk { box-sizing: border-box; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 12px; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; }
.oc-sdk-btn[data-size="sm"] { gap: 6px; height: 28px; padding: 0 10px; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { gap: 4px; height: 24px; padding: 0 8px; font-size: 0.75rem; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: 14px; height: 14px; }

.oc-sdk-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: 32px; padding: 0 10px; border: 0; font-size: 0.875rem; line-height: 1.45; appearance: none; }
textarea.oc-sdk-input { height: auto; padding: 8px 10px; resize: vertical; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: 34px; padding-right: 34px; }
.oc-sdk-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); pointer-events: none; }
.oc-sdk-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: 24px; height: 24px; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; width: auto; max-width: 100%; min-width: 0; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; text-align: left; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: 2px; min-width: 160px; max-width: calc(100vw - 16px); max-height: min(320px, calc(100vh - 16px)); overflow: auto; padding: 4px; border: 1px solid transparent; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: 2px 2px 4px; }
.oc-sdk-popup-search .oc-sdk-input { height: 28px; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; }
.oc-sdk-option-check { flex: 0 0 auto; display: inline-flex; width: 14px; visibility: hidden; }
.oc-sdk-option[aria-selected="true"] > .oc-sdk-option-check { visibility: visible; }
.oc-sdk-popup-empty { padding: 8px; font-size: 0.8125rem; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: 8px; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-top: 3px; border: 1px solid transparent; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: 36px; height: 20px; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; }

.oc-sdk-tabs { display: inline-flex; gap: 2px; padding: 2px; max-width: 100%; overflow: auto; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: 1px 6px; font-size: 11px; font-weight: 500; line-height: 16px; white-space: nowrap; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; text-align: left; }
.oc-sdk-row-lead { flex: 0 0 auto; width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-list-empty { padding: 16px 8px; text-align: center; font-size: 0.8125rem; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 40px 16px; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; }
.oc-sdk-empty-action { margin-top: 12px; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: 8px; font-size: 0.8125rem; }
.oc-sdk-spinner-ring { width: 16px; height: 16px; border: 2px solid transparent; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: 12px; height: 12px; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: 12px; padding: 8px 12px; border: 1px solid transparent; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-banner-body { font-size: 0.8125rem; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: 8px; width: 100%; margin: 8px 0; font-size: 0.75rem; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: 4px 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: 6px; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; transform-origin: left; transition: transform 200ms ease-out; }
.oc-sdk-progress-value { display: inline-flex; align-items: center; gap: 2px; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { font-weight: 600; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text img { display: block; max-width: 100%; margin: 8px 0; }
`,Io=`${Qo}
.oc-sdk { color: ${N}; font-family: ${Jo}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${Ao} }
.oc-sdk-mono { font-family: ${Ot}; }
.oc-sdk-muted { color: ${f}; }
${Ne("success")}${Ne("warning")}${Ne("error")}${Ne("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${X}; --oc-sdk-tone-text: ${vt}; }

.oc-sdk-btn { border-radius: ${At}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${Oo}; }
.oc-sdk-btn[data-variant="default"] { color: ${vt}; background: ${R(X,10,q)}; border-color: ${R(X,12)}; ${Co} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${R(X,16,q)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${R(X,22,q)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${zo}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${G}, ${G}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${J}, ${J}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${ne}; ${kt} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${G}, ${G}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${J}, ${J}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${G}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${J}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${_("status-error","red")}; color: ${xt}; background: ${R("var(--oc-sdk-tone)",7,q)}; border-color: ${R("var(--oc-sdk-tone)",12)}; ${Co} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${R("var(--oc-sdk-tone)",9,q)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${R("var(--oc-sdk-tone)",11,q)}; box-shadow: none; }

.oc-sdk-field-note { color: ${f}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${xt}; }
.oc-sdk-input { border-radius: ${At}; background: var(--oc-sdk-field-bg); color: ${ne}; ${Ct("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${f}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${G}, ${G}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Ct(R(N,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Ct(_("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${Ot}; }

.oc-sdk-search-icon { color: ${f}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${X}; }
.oc-sdk-search-clear { border-radius: ${Oo}; color: ${f}; }
.oc-sdk-search-clear:hover { background: ${G}; color: ${N}; }

.oc-sdk-trigger { border-radius: ${At}; background: var(--oc-sdk-raised-bg); color: ${ne}; ${kt} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${G}, ${G}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${J}, ${J}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${f}; }
.oc-sdk-trigger-chevron { color: ${f}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${ne}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${Le}; background-clip: padding-box; color: ${ne}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${G}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${ht}; color: ${bt}; }
.oc-sdk-option-check { color: ${N}; }
.oc-sdk-option[data-destructive="true"] { color: ${xt}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${R(_("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${f}; }
.oc-sdk-popup-empty { color: ${f}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${z}; border-radius: 4px; color: ${N}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${R(N,60,z)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${z}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${q}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${X}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${Ao} }
.oc-sdk-check-desc { color: ${f}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${R(N,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${f}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${N}; }
.oc-sdk-tab[aria-selected="true"] { color: ${bt}; background: ${ht}; border-color: ${z}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${ne}; background: var(--oc-sdk-raised-bg); ${kt} }
.oc-sdk-tab-count { color: ${f}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${R(N,6)}; color: ${f}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${R("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${G}; }
.oc-sdk-row[aria-selected="true"] { background: ${ht}; color: ${bt}; }
.oc-sdk-row-lead { font-family: ${Ot}; color: ${f}; }
.oc-sdk-row-sub { color: ${f}; }
.oc-sdk-row-meta { color: ${f}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${f}; }

.oc-sdk-empty-body { color: ${f}; }

.oc-sdk-spinner { color: ${f}; }
.oc-sdk-spinner-ring { border-color: ${z}; border-top-color: ${X}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${R("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${f}; }

.oc-sdk-separator { color: ${f}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${R(z,40)}; }

.oc-sdk-progress-label { color: ${f}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${R(N,6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${X}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${_("status-success","currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${_("success-text","inherit")}; }

.oc-sdk-text a { color: ${vt}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${R(z,60)}; }
`,P=`
${je}
${Yo}
${Io}`;var Ve=Rt(),ae=document.querySelector("#root");if(!ae)throw Error("DeskChart: missing root");ae.style.padding="12px";Ve.onReady((e)=>yt(e,document.documentElement));Ve.onBlock(({args:e,answered:r})=>{let n=(e.values??"").split(",").map(Number).filter(Number.isFinite),T=Math.max(1,...n);ae.replaceChildren();let S=document.createElement("div");S.textContent=e.title??"",S.style.font="600 13px var(--oc-font, system-ui)";let y=document.createElement("div");y.style.cssText="display:flex;align-items:flex-end;gap:6px;height:96px;margin-top:8px";for(let b of n){let C=document.createElement("div");C.style.cssText=`flex:1;height:${b/T*100}%;background:currentColor;opacity:.6;border-radius:3px 3px 0 0`,C.title=String(b),y.append(C)}let O=document.createElement("button");O.textContent=r??"Explain this",O.disabled=r!==null,O.addEventListener("click",()=>{Ve.answerBlock("Explain this chart")}),ae.append(S,y,O)});new ResizeObserver(()=>{Ve.setHeight(Math.ceil(ae.getBoundingClientRect().height))}).observe(ae);})();
