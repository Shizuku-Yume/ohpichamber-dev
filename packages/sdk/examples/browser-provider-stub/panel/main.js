(()=>{var E="openchamber.sdk",g=2;var ge="openchamber:guest-bootstrap",Do=(e,r,s)=>{let{window:u,MessageChannel:d}=globalThis;if(!u||!d)return;try{let S=new d,m=S.port1,_=!1,h=!1,k=null,N=(I)=>{try{I.close()}catch{}},Z=(I=[])=>{for(let M of I)N(M);if(!_)_=!0,N(m)},j=(I)=>{let M=new CustomEvent(s,{detail:I,cancelable:!0});if(!u.dispatchEvent(M))return;N(I),_=!0};u.addEventListener(s,(I)=>{if(!("detail"in I)||I.detail!==null)return;if(h=!0,k){let M=k;k=null,j(M)}}),m.addEventListener("message",(I)=>{if(_)return;let M=I.data,V=I.ports??[];if(!M||M.channel!==e||M.v!==r||M.type!=="connect-port"||V.length!==1){Z(V);return}let z=V[0];if(_=!0,N(m),z.start(),!h){k=z;return}j(z)}),m.start(),u.parent.postMessage({channel:e,v:r,type:"bootstrap"},"*",[S.port2])}catch{}},Ho=`(${Do.toString()})(${JSON.stringify("openchamber.guest-bootstrap")}, 2, ${JSON.stringify("openchamber:guest-bootstrap")});`;var Ke=`
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
`;function je(e){let r=e.documentElement;if(r.hasAttribute("data-oc-scrollbar-activity"))return;r.setAttribute("data-oc-scrollbar-activity","");let s=new WeakMap;e.addEventListener("scroll",(u)=>{let d=u.target===e?r:u.target;if(!(d instanceof Element))return;if(!d.hasAttribute("data-oc-scrolling"))d.setAttribute("data-oc-scrolling","");let S=s.get(d);if(S!==void 0)clearTimeout(S);s.set(d,setTimeout(()=>{s.delete(d),d.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var Bo=`(${je.toString()})(document);`;var ze=128,Je=65536;var he=128;var be=65536;var Kt=/^[a-z][a-z0-9-]{0,39}$/;var qt=(e)=>Object(e)===e&&!Array.isArray(e),Qe=(e,r)=>Object.keys(e).every((s)=>r.includes(s)),Wt=(e)=>String(e)===e&&e.length>=1&&e.length<=60,$t=(e)=>String(e)===e&&e.length>=1&&e.length<=80,jt=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let s of e){if(!qt(s)||!Kt.test(s.id)||!Wt(s.label))return!1;if(s.disabled!==void 0&&s.disabled!==!0&&s.disabled!==!1)return!1;if(r.has(s.id))return!1;if(r.add(s.id),s.kind==="button"){if(!Qe(s,["kind","id","label","disabled"]))return!1;continue}if(s.kind!=="select"||!Qe(s,["kind","id","label","value","options","disabled"]))return!1;if(!$t(s.value)||!Array.isArray(s.options)||s.options.length<1||s.options.length>16)return!1;let u=new Set;for(let d of s.options){if(!qt(d)||!Qe(d,["value","label"])||!$t(d.value)||!Wt(d.label)||u.has(d.value))return!1;u.add(d.value)}if(!u.has(s.value))return!1}return!0};var zt=["{id}","{segment}","{segments+}"];var Tr=new Set(zt);var Jt=["turn-finished","turn-failed","permission-asked","question-asked","turn-started","session-created","session-archived","session-deleted"];var fr=new Set(Jt);var ve=20000000,xe=256;var Ye=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,Qt=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let s=0;s<e.bytes.byteLength;s+=1)if(e.bytes[s]!==r.bytes[s])return!1;return!0};var Yt=/^[A-Za-z0-9_-]{1,80}$/;var Zt=["left","right","top","bottom"];var eo=(e,r=0,s={remaining:16000})=>{if(--s.remaining<0||r>=32)return!1;if(e===null)return!0;let u=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let d of u)if(!eo(d,r+1,s))return!1;return!0},Ze=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(Ze);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(Ze)}return String(e)===e||Number.isFinite(e)},et=(e)=>{try{if(String(e.id)!==e.id||!Yt.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!Zt.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!eo(e.data)||!Ze(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var ot=2000;var oo=["file","directory","other","missing"],rt=(e)=>Boolean(e&&"sessionId"in e),st=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var ro=/^[0-9a-f]{7,64}$/i,nt=(e)=>ro.test(e),Oe=500,Ae=32000,so=16000,no=128,io=200,ao=2000,lo=16000,uo=80,co=200,po=16000;var So=2000;var it=20000,Ce=1024,ke=2000000;var Ie=64000,Pe=8000,at=4000;var lt=960000;var Eo=999,go=1e4,_e=500,_o=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],To=["stopped","starting","ready","failed"],Vo=new Set(_o),mo=(e)=>Vo.has(e),fo=(e)=>e&&mo(e)?e:"HOST_REJECTED",se=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(se);if(Object(e)===e)return Object.values(e).every(se);return!1},Ro=(e)=>se(e)&&JSON.stringify(e).length<=po,to=(e)=>e?.trim().slice(0,co)??"",ne=(e)=>{let r=e.id.trim().slice(0,no),s=e.title.trim().slice(0,io),u=e.url.trim().slice(0,ao),d=e.text?.trim().slice(0,lo),S=e.author?.trim().slice(0,uo),m=e.kind==="pull"?"pull":"issue",_={providerId:e.providerId.trim(),id:r,title:s||r,url:u,kind:m};if(d)_.text=d;if(S)_.author=S;if(m==="pull"){let h=to(e.branches?.head),k=to(e.branches?.base);if(h&&k)_.branches={head:h,base:k}}if(Ro(e.data))_.data=e.data;return _},ut=(e)=>{let r=ne(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},ct=(e)=>{let r={text:e.text.trim().slice(0,so)};if(e.send)r.send=!0;return r},pt=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(Eo,Math.max(0,Math.round(e)))},dt=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(go,Math.max(0,Math.ceil(e)))};var ie=(e)=>e.length>0&&e.length<=Ce&&!e.includes("\x00")&&!e.includes("\\");var Ge=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>So)return!1;return!e.split("/").some((s)=>s==="."||s==="..")},Xo=new Set(To),St=(e)=>Boolean(e&&"status"in e&&Xo.has(String(e.status))&&!("body"in e)),Me=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),Et=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),gt=(e)=>Boolean(e&&"written"in e&&e.written===!0),_t=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),qo=new Set(oo),Tt=(e)=>Boolean(e&&"kind"in e&&"size"in e&&qo.has(String(e.kind))&&Number.isFinite(e.size)),mt=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),Wo=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","service-event","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late"]),$o=(e)=>Object(e)===e?e:null,tt=(e)=>String(e)===e&&e.length>0,Ko=(e)=>{if(!tt(e.id))return null;if(e.ok===!0){let r={channel:E,v:g,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&tt(e.error))return{channel:E,v:g,type:"result",id:e.id,ok:!1,error:e.error,code:fo(tt(e.code)?e.code:void 0)};return null},ft=(e)=>{let r=$o(e);if(!r||r.channel!==E||r.v!==g)return null;if(r.type==="result")return Ko(r);if(!Wo.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var yo=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),jo=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class l extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var ho=()=>Promise.reject(new l("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),Ue=()=>Promise.reject(new l("BAD_PATH",`File path must be 1 to ${Ce} characters without NUL or backslash.`)),we=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new l("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},p=(e)=>(e.value+=1,`oc-${e.value}`),Rt=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new l("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let s=e.requestTimeoutMs??it,u=e.acceptSource??((t)=>t===r.parent),d=new Set,S=new Set,m=new Set,_=new Set,h=new Set,k=new Set,N=new Set,Z=new Set,j=new Set,I=new Set,M=new Set,V=new Set,z=[],ue=null,ce=null,Te=new Set,me=new Set,pe=null,de=null,Ve=!1,ee=new Map,te=new Map,oe=new Map,B=!1,c={value:0},a=null,X=null,Se=!1,Ee=!1,Mt=null,Ut=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},re=null,Xe=[],H=(t)=>{if(B)return;if(re){re.postMessage(t);return}Xe.push(t)},wt=()=>{if(B||Object.is(r.parent,r)||V.size===0||a?.features?.lateGenerateResults!==!0)return;H({channel:E,v:g,type:"generate-late-listen"})},y=(t,o)=>{for(let n of t)try{n(o)}catch(i){console.error(i)}},Uo=(t)=>{if(!("data"in t))return;let o=ft(t.data);if(!o)return;if(o.type==="workspace"){let i=te.get(o.payload.subscriptionId);if(i)y([i],o.payload.snapshot);return}if(o.type==="shells"){let i=oe.get(o.payload.subscriptionId);if(i)y([i],o.payload.snapshot);return}if(o.type==="ready"){if(a=o.payload,X=Ut(o.payload.session),y(d,o.payload),y(S,o.payload.directory),y(m,o.payload.session),X)y(_,X);if(y(h,o.payload.connection),y(k,o.payload.settings),y(N,o.payload.item),o.payload.block)y(Z,o.payload.block);wt();return}if(o.type==="service-event"){y(j,o.payload);return}if(o.type==="generate-late"){if(V.size===0)z.push(o.payload);else y(V,o.payload);return}if(o.type==="directory"){if(a)a={...a,directory:o.payload.directory};y(S,o.payload.directory);return}if(o.type==="session"){if(a)a={...a,session:o.payload.session};if(!o.payload.session)X=null;else if(X?.sessionId!==o.payload.session.id)X=Ut(o.payload.session);y(m,o.payload.session);return}if(o.type==="session-lifecycle"){X=o.payload,y(_,o.payload);return}if(o.type==="connection"){if(a)a={...a,connection:o.payload.connection};y(h,o.payload.connection);return}if(o.type==="settings"){if(a)a={...a,settings:o.payload.settings};y(k,o.payload.settings);return}if(o.type==="item"){if(a)a={...a,item:o.payload.item};y(N,o.payload.item);return}if(o.type==="status-control-event"){y(I,o.payload);return}if(o.type==="popover-closed"){y(M,o.payload);return}if(o.type==="action"){let i=(T)=>{if(!B)H({channel:E,v:g,type:"action-result",id:o.id,payload:T})},f=ce;if(!f){i({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>f(o.payload)).then(()=>i({ok:!0}),(T)=>{let C=(T instanceof Error?T.message:String(T)).trim();i({ok:!1,error:(C||"Action failed.").slice(0,_e)})});return}if(o.type==="file-open"){let i=o.payload;if(de&&Qt(de,i))return;de=i,y(Te,o.payload);return}if(o.type==="file-saved"){y(me,o.payload.version);return}if(o.type==="file-snapshot"){let i=(C)=>{if(!B)H({channel:E,v:g,type:"file-snapshot-result",id:o.id,payload:C})},f=(C)=>i({error:(C.trim()||"Could not read the edited file.").slice(0,_e)}),T=pe;if(!T){f("This extension does not edit files.");return}Promise.resolve().then(()=>T(o.payload.purpose)).then((C)=>{if(Ye(C)>ve){f(`The file is over ${ve} ${"bytes"in C?"bytes":"characters"}.`);return}if(C.version.length>xe){f(`The snapshot version is over ${xe} characters.`);return}i({snapshot:"bytes"in C?{bytes:C.bytes,version:C.version}:{content:C.content,version:C.version}})},(C)=>f(C instanceof Error?C.message:String(C)));return}if(o.type==="resolve"){let i=(T)=>{H({channel:E,v:g,type:"resolve-result",id:o.id,payload:T})},f=ue;if(!f){i({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>f(o.payload)).then((T)=>i({item:T?ne(T):null}),(T)=>{let C=(T instanceof Error?T.message:String(T)).trim();i({error:(C||"Command failed.").slice(0,_e)})});return}let n=ee.get(o.id);if(!n)return;if(clearTimeout(n.timer),ee.delete(o.id),o.ok){n.resolve(o.payload);return}n.reject(new l(o.code,o.error))},wo=(t)=>{if(!("source"in t))return!0;return u(t.source)},Nt=(t)=>{if(!wo(t)||!("detail"in t))return;let o=t.detail;if(!(o instanceof MessagePort))return;t.preventDefault(),t.stopImmediatePropagation(),re?.close(),re=o,o.addEventListener("message",Uo),o.start(),o.postMessage({channel:E,v:g,type:"hello"});for(let n of Xe.splice(0))o.postMessage(n)};r.addEventListener(ge,Nt),r.dispatchEvent?.(new CustomEvent(ge,{detail:null}));let U=(t,o=s)=>{if(B||Object.is(r.parent,r))return Promise.reject(new l("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((n,i)=>{let f=setTimeout(()=>{ee.delete(t.id),i(new l("HOST_TIMEOUT","Host did not answer in time."))},o);ee.set(t.id,{resolve:n,reject:i,timer:f}),H(t)})},x=(t)=>U(t).then(()=>{return}),A={channel:E,v:g},qe=(t)=>{if(!B&&!Object.is(r.parent,r))H(t)},Lt=()=>qe({...A,type:"file-save"}),Dt=(t)=>{if(!yo(t)||!jo(t))return;t.preventDefault(),Lt()},Ht=(t)=>{if(!yo(t)||t.key!=="Escape"||a?.surface!=="popover"||!a.popover)return;t.preventDefault(),Vt(a.popover.id,"escape").catch(()=>{return})},fe=()=>{let t=a?.surface==="popover"?a.popover:void 0;if(!t)return;let o=Se||Ee;if(Mt===o)return;Mt=o,Xt(t.id,o).catch(()=>{return})},Re=()=>{if(a?.surface!=="popover"||Se)return;Se=!0,fe()},Bt=(t)=>{if(a?.surface!=="popover"||t.relatedTarget!==null||!Se)return;Se=!1,fe()},Ft=()=>{if(a?.surface!=="popover"||Ee)return;Ee=!0,fe()},No=()=>{if(a?.surface!=="popover"||!Ee)return;Ee=!1,fe()},F=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new l("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},We=async(t)=>{if(t.kind!=="projects")F(t.projectId);let o=await U({...A,type:"workspace-read",id:p(c),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new l("HOST_REJECTED","Host did not return workspace data.");return o},$e=async(t,o)=>{if(t.kind!=="projects")F(t.projectId);let n=p(c);te.set(n,o);try{await x({...A,type:"workspace-subscribe",id:p(c),payload:{subscriptionId:n,query:t}})}catch(i){if(te.delete(n),!B)H({...A,type:"workspace-unsubscribe",id:p(c),payload:{subscriptionId:n}});throw i}return()=>{if(!te.delete(n)||B)return;H({...A,type:"workspace-unsubscribe",id:p(c),payload:{subscriptionId:n}})}},Lo=async(t,o)=>{if(t.kind==="session")F(t.sessionId);if(t.kind==="project")F(t.projectId);let n=p(c);oe.set(n,o);try{await x({...A,type:"shells-subscribe",id:p(c),payload:{subscriptionId:n,scope:t}})}catch(i){if(oe.delete(n),!B)H({...A,type:"shells-unsubscribe",id:p(c),payload:{subscriptionId:n}});throw i}return()=>{if(!oe.delete(n)||B)return;H({...A,type:"shells-unsubscribe",id:p(c),payload:{subscriptionId:n}})}},ye=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>ze))throw new l("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!se(t.value))throw new l("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>Je)throw new l("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&a?.features?.deviceStorage!==!0)throw new l("UNSUPPORTED","This host does not support device storage.");let o=await U({...A,type:"storage",id:p(c),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new l("HOST_REJECTED","Host did not return storage data.");return o},Vt=(t,o)=>a?.features?.popovers!==!0&&!(a?.surface==="popover"&&a.popover?.id===t)?Promise.reject(new l("UNSUPPORTED","This host does not support popovers.")):x({...A,type:"popover-close",id:p(c),payload:o?{id:t,reason:o}:{id:t}}),Xt=(t,o)=>a?.features?.popovers!==!0&&!(a?.surface==="popover"&&a.popover?.id===t)?Promise.reject(new l("UNSUPPORTED","This host does not support popovers.")):x({...A,type:"popover-anchor",id:p(c),payload:{id:t,active:o}});return r.addEventListener("keydown",Ht,!0),r.addEventListener("pointerover",Re),r.addEventListener("pointermove",Re),r.addEventListener("pointerout",Bt),r.addEventListener("focus",Ft),r.addEventListener("blur",No),{onAction:(t)=>(ce=t,()=>{if(ce===t)ce=null}),listProjects:async()=>{let t=await We({kind:"projects"});if(t.kind!=="projects")throw new l("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await We({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new l("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await We({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new l("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>$e({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>$e({kind:"worktrees",projectId:t},(n)=>{if(n.kind==="worktrees")o(n)}),onSessions:(t,o)=>$e({kind:"sessions",projectId:t},(n)=>{if(n.kind==="sessions")o(n)}),onRunningShells:(t,o)=>Lo(t,o),readShellOutput:async(t,o)=>{F(t,he);let n=o?.cursor;if(n!==void 0&&(!Number.isInteger(n)||n<0))throw new l("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let i=o?.tailBytes;if(i!==void 0&&(!Number.isInteger(i)||i<1||i>be))throw new l("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${be}.`);let T=await U({...A,type:"shell-output",id:p(c),payload:{shellId:t,cursor:n,tailBytes:i}});if(!T||typeof T.output!=="string"||!Number.isFinite(T.cursor))throw new l("HOST_REJECTED","Host did not return shell output.");return T},stopShell:async(t)=>{if(F(t,he),(await U({...A,type:"shell-stop",id:p(c),payload:{shellId:t}}))?.stopped!==!0)throw new l("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{F(t),await x({...A,type:"open-session",id:p(c),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let n=we(o),i={op:"get",key:t};if(n)i.scope=n;let f=await ye(i);return f.op==="get"&&f.found?f.value:void 0},set:async(t,o,n)=>{let i=we(n),f={op:"set",key:t,value:o};if(i)f.scope=i;await ye(f)},delete:async(t,o)=>{let n=we(o),i={op:"delete",key:t};if(n)i.scope=n;await ye(i)},keys:async(t)=>{let o=we(t),n={op:"keys"};if(o)n.scope=o;let i=await ye(n);if(i.op!=="keys")throw new l("HOST_REJECTED","Expected storage keys.");return i.keys}},onReady:(t)=>{if(d.add(t),a)t(a);return()=>{d.delete(t)}},onDirectory:(t)=>{if(S.add(t),a)t(a.directory);return()=>{S.delete(t)}},onSession:(t)=>{if(m.add(t),a)t(a.session);return()=>{m.delete(t)}},onSessionLifecycle:(t)=>{if(_.add(t),X)t(X);return()=>{_.delete(t)}},onConnection:(t)=>{if(h.add(t),a)t(a.connection);return()=>{h.delete(t)}},onSettings:(t)=>{if(k.add(t),a)t(a.settings);return()=>{k.delete(t)}},onItem:(t)=>{if(N.add(t),a)t(a.item);return()=>{N.delete(t)}},onBlock:(t)=>{if(Z.add(t),a?.block)t(a.block);return()=>{Z.delete(t)}},onServiceEvent:(t)=>(j.add(t),()=>{j.delete(t)}),onStatusControl:(t)=>(I.add(t),()=>{I.delete(t)}),onPopoverClosed:(t)=>(M.add(t),()=>{M.delete(t)}),onLateGenerateResult:(t)=>{V.add(t);for(let o of z.splice(0))y([t],o);return wt(),()=>{V.delete(t)}},setStatusControls:(t)=>{if(a?.features?.statusControls!==!0)return Promise.reject(new l("UNSUPPORTED","This host does not support status controls."));if(!jt(t))return Promise.reject(new l("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return x({...A,type:"status-controls",id:p(c),payload:{controls:t}})},openPopover:(t)=>{if(a?.features?.popovers!==!0)return Promise.reject(new l("UNSUPPORTED","This host does not support popovers."));if(!et(t))return Promise.reject(new l("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return x({...A,type:"popover-open",id:p(c),payload:t})},closePopover:Vt,setPopoverAnchorActive:Xt,onResolve:(t)=>(ue=t,()=>{if(ue===t)ue=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Oe)return Promise.reject(new l("HOST_REJECTED",`Toast message must contain 1 to ${Oe} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Ae))return Promise.reject(new l("HOST_REJECTED",`Toast copy text must contain 1 to ${Ae} characters.`));return x({channel:E,v:g,type:"toast",id:p(c),payload:{...t,message:o}})},openUrl:(t)=>x({channel:E,v:g,type:"open-url",id:p(c),payload:{url:t}}),openCommit:(t)=>nt(t)?x({channel:E,v:g,type:"open-commit",id:p(c),payload:{sha:t}}):Promise.reject(new l("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),answerBlock:(t)=>x({channel:E,v:g,type:"block-answer",id:p(c),payload:{text:t.trim().slice(0,ot)}}),openSurface:(t)=>x({channel:E,v:g,type:"open-surface",id:p(c),payload:{surfaceId:t}}),writeClipboard:(t)=>x({channel:E,v:g,type:"clipboard-write",id:p(c),payload:{text:t}}),compose:(t)=>x({channel:E,v:g,type:"compose",id:p(c),payload:t}),attach:(t)=>x({channel:E,v:g,type:"attach",id:p(c),payload:ne(t)}),startSession:async(t)=>{if(t.projectId!==void 0)F(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")F(o.directory);else{if(o.name!==void 0)F(o.name,200);if(o.baseBranch!==void 0)F(o.baseBranch,200)}let n=await U({channel:E,v:g,type:"start-session",id:p(c),payload:ut(t)},e.requestTimeoutMs??180000);if(!rt(n))throw new l("HOST_REJECTED","Host did not return a session.");return n},prompt:(t)=>U({channel:E,v:g,type:"prompt",id:p(c),payload:ct(t)}).then((o)=>{if(!st(o))throw new l("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>x({channel:E,v:g,type:"session-link",id:p(c),payload:ne(t)}),close:()=>x({channel:E,v:g,type:"close",id:p(c)}),oauthStart:()=>x({channel:E,v:g,type:"oauth-start",id:p(c)}),oauthDisconnect:()=>x({channel:E,v:g,type:"oauth-disconnect",id:p(c)}),request:(t)=>(Ge(t.path)?U({channel:E,v:g,type:"request",id:p(c),payload:t}):ho()).then((o)=>{if(!Me(o))throw new l("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:(t)=>(Ge(t.path)?U({channel:E,v:g,type:"service-request",id:p(c),payload:t}):ho()).then((o)=>{if(!Me(o))throw new l("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>U({channel:E,v:g,type:"service-status",id:p(c)}).then((t)=>{if(!St(t))throw new l("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(ie(t)?U({channel:E,v:g,type:"file-read",id:p(c),payload:{path:t}}):Ue()).then((o)=>{if(!Et(o))throw new l("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!ie(t))return Ue();if(o.length>ke)return Promise.reject(new l("FILE_TOO_LARGE",`Content is over ${ke} characters.`));return U({channel:E,v:g,type:"file-write",id:p(c),payload:{path:t,content:o}}).then((n)=>{if(!gt(n))throw new l("HOST_REJECTED","Host did not confirm the write.");return n})},listDir:(t)=>(ie(t)?U({channel:E,v:g,type:"file-list",id:p(c),payload:{path:t}}):Ue()).then((o)=>{if(!_t(o))throw new l("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(ie(t)?U({channel:E,v:g,type:"file-stat",id:p(c),payload:{path:t}}):Ue()).then((o)=>{if(!Tt(o))throw new l("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),n=t.system?.trim();if(o.length===0||o.length>Ie)return Promise.reject(new l("HOST_REJECTED",`Prompt must be 1 to ${Ie} characters.`));if(n!==void 0&&(n.length===0||n.length>Pe))return Promise.reject(new l("HOST_REJECTED",`System prompt must be 1 to ${Pe} characters.`));let i=t.maxOutputTokens===void 0?void 0:Math.min(at,Math.max(1,Math.floor(t.maxOutputTokens)));if(i!==void 0&&!Number.isFinite(i))return Promise.reject(new l("HOST_REJECTED","maxOutputTokens must be a number."));let f={prompt:o};if(n!==void 0)f.system=n;if(i!==void 0)f.maxOutputTokens=i;return U({channel:E,v:g,type:"generate",id:p(c),payload:f},e.requestTimeoutMs??lt).then((T)=>{if(!mt(T))throw new l("HOST_REJECTED","Host did not return generated text.");return T})},setBadge:(t)=>x({channel:E,v:g,type:"badge",id:p(c),payload:{count:pt(t)}}),setHeight:(t)=>x({channel:E,v:g,type:"resize",id:p(c),payload:{height:dt(t)}}),onFileOpen:(t)=>{if(Te.add(t),!Ve)Ve=!0,r.addEventListener("keydown",Dt,!0);if(de)t(de);return()=>{Te.delete(t)}},onFileSnapshot:(t)=>(pe=t,()=>{if(pe===t)pe=null}),onFileSaved:(t)=>(me.add(t),()=>{me.delete(t)}),reportFileChange:(t)=>qe({...A,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:Lt,reportFileUnsupported:()=>qe({...A,type:"file-unsupported"}),dispose:()=>{for(let t of te.keys())H({...A,type:"workspace-unsubscribe",id:p(c),payload:{subscriptionId:t}});te.clear();for(let t of oe.keys())H({...A,type:"shells-unsubscribe",id:p(c),payload:{subscriptionId:t}});if(oe.clear(),B=!0,ue=null,ce=null,pe=null,Te.clear(),me.clear(),Ve)r.removeEventListener("keydown",Dt,!0);r.removeEventListener(ge,Nt),r.removeEventListener("keydown",Ht,!0),r.removeEventListener("pointerover",Re),r.removeEventListener("pointermove",Re),r.removeEventListener("pointerout",Bt),r.removeEventListener("focus",Ft),re?.close(),re=null,Xe.length=0;for(let t of ee.values())clearTimeout(t.timer),t.reject(new l("HOST_UNAVAILABLE","Host client was disposed."));ee.clear(),d.clear(),S.clear(),m.clear(),_.clear(),h.clear(),k.clear(),N.clear(),Z.clear(),j.clear(),I.clear(),M.clear(),V.clear(),z.length=0}}};var bo=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var wr=new Set(bo);var vo=["none","agent","user"];var Lr=new Set(vo);var zo=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],Jo=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],xo=(e,r)=>{r.style.colorScheme=e.mode;for(let[s,u]of zo)r.style.setProperty(s,e.tokens[u]);for(let[s,u,d]of Jo){let S=e.tokens[d]??"";r.style.setProperty(s,S),r.style.setProperty(u,S)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size","0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},yt=(e,r)=>{if(xo(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var Qo={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},R=(e,r)=>`var(--${e}, var(--oc-${Qo[e]}, ${r}))`,W=R("surface-background","transparent"),Le=R("surface-elevated","transparent"),ae=R("surface-elevated-foreground","inherit"),L=R("surface-foreground","inherit"),b=R("surface-muted-foreground","gray"),Yo=R("surface-muted","transparent"),J=R("interactive-border","currentColor"),w=R("interactive-hover","transparent"),Q=R("interactive-active","transparent"),ht=R("interactive-selection","transparent"),bt=R("interactive-selection-foreground","inherit"),q=R("primary","currentColor"),vt=R("primary-text","inherit"),xt=R("error-text","inherit"),Zo=R("font-sans","inherit"),Ot=R("font-mono","monospace"),ko=R("radius","9px"),At=`calc(${ko} - 2px)`,Oo=`calc(${ko} - 4px)`,v=(e,r,s="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${s})`,Ao=`background-image: linear-gradient(${w}, ${w});`,Ct=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,kt="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Co="box-shadow: var(--oc-sdk-lit);",It=`inset 0 0.5px 0 0 ${v(L,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,er=`
:root {
  --oc-sdk-edge: ${v(L,16)};
  --oc-sdk-field-bg: ${Le};
  --oc-sdk-raised-bg: ${W};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${v(L,14)};
  --oc-sdk-field-bg: ${v(W,50,Le)};
  --oc-sdk-raised-bg: ${Le};
  --oc-sdk-field-lift: ${It};
  --oc-sdk-raised-lift: ${It};
  --oc-sdk-lit: ${It};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,Ne=(e)=>{let r=R(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${R(`${e}-text`,"inherit")}; }`},tr=`
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
`,Io=`${er}
.oc-sdk { color: ${L}; font-family: ${Zo}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${Ao} }
.oc-sdk-mono { font-family: ${Ot}; }
.oc-sdk-muted { color: ${b}; }
${Ne("success")}${Ne("warning")}${Ne("error")}${Ne("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${q}; --oc-sdk-tone-text: ${vt}; }

.oc-sdk-btn { border-radius: ${At}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${Oo}; }
.oc-sdk-btn[data-variant="default"] { color: ${vt}; background: ${v(q,10,W)}; border-color: ${v(q,12)}; ${Co} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${v(q,16,W)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${v(q,22,W)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${Yo}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${Q}, ${Q}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${ae}; ${kt} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${Q}, ${Q}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${w}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${Q}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${R("status-error","red")}; color: ${xt}; background: ${v("var(--oc-sdk-tone)",7,W)}; border-color: ${v("var(--oc-sdk-tone)",12)}; ${Co} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${v("var(--oc-sdk-tone)",9,W)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${v("var(--oc-sdk-tone)",11,W)}; box-shadow: none; }

.oc-sdk-field-note { color: ${b}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${xt}; }
.oc-sdk-input { border-radius: ${At}; background: var(--oc-sdk-field-bg); color: ${ae}; ${Ct("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${b}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Ct(v(L,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Ct(R("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${Ot}; }

.oc-sdk-search-icon { color: ${b}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${q}; }
.oc-sdk-search-clear { border-radius: ${Oo}; color: ${b}; }
.oc-sdk-search-clear:hover { background: ${w}; color: ${L}; }

.oc-sdk-trigger { border-radius: ${At}; background: var(--oc-sdk-raised-bg); color: ${ae}; ${kt} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${Q}, ${Q}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${b}; }
.oc-sdk-trigger-chevron { color: ${b}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${ae}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${Le}; background-clip: padding-box; color: ${ae}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${w}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${ht}; color: ${bt}; }
.oc-sdk-option-check { color: ${L}; }
.oc-sdk-option[data-destructive="true"] { color: ${xt}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${v(R("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${b}; }
.oc-sdk-popup-empty { color: ${b}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${J}; border-radius: 4px; color: ${L}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${v(L,60,J)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${J}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${W}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${q}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${Ao} }
.oc-sdk-check-desc { color: ${b}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${v(L,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${b}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${L}; }
.oc-sdk-tab[aria-selected="true"] { color: ${bt}; background: ${ht}; border-color: ${J}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${ae}; background: var(--oc-sdk-raised-bg); ${kt} }
.oc-sdk-tab-count { color: ${b}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${v(L,6)}; color: ${b}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${v("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${w}; }
.oc-sdk-row[aria-selected="true"] { background: ${ht}; color: ${bt}; }
.oc-sdk-row-lead { font-family: ${Ot}; color: ${b}; }
.oc-sdk-row-sub { color: ${b}; }
.oc-sdk-row-meta { color: ${b}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${b}; }

.oc-sdk-empty-body { color: ${b}; }

.oc-sdk-spinner { color: ${b}; }
.oc-sdk-spinner-ring { border-color: ${J}; border-top-color: ${q}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${v("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${b}; }

.oc-sdk-separator { color: ${b}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${v(J,40)}; }

.oc-sdk-progress-label { color: ${b}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${v(L,6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${q}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${R("status-success","currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${R("success-text","inherit")}; }

.oc-sdk-text a { color: ${vt}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${v(J,60)}; }
`,P=`
${Ke}
${tr}
${Io}`;var Po="oc-sdk-ui-style";var G=(e)=>{let r=document.getElementById(Po);if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}je(document);let s=document.createElement("style");s.id=Po,s.textContent=e,document.head.appendChild(s)},O=(e,r)=>{let s=document.createElement(e);if(r)s.className=r;return s},K=(e)=>{let r=O("button",e);return r.type="button",r},D=(e,r)=>{let s=r??"";if(e.textContent!==s)e.textContent=s},Y=(e,r,s)=>{if(s===void 0||s===null||s==="")e.removeAttribute(r);else if(e.getAttribute(r)!==s)e.setAttribute(r,s)};var or=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},le=(e,r)=>{G(P);let s=r,u=K("oc-sdk oc-sdk-btn"),d=or(),S=document.createElement("span");u.append(S),e.append(u);let m=()=>{if(u.dataset.variant=s.variant??"default",u.dataset.size=s.size??"default",u.disabled=Boolean(s.disabled)||Boolean(s.loading),u.dataset.loading=s.loading?"true":"false",u.setAttribute("aria-busy",s.loading?"true":"false"),s.loading&&d.parentNode!==u)u.prepend(d);else if(!s.loading&&d.parentNode===u)d.remove();D(S,s.label)},_=()=>{if(s.disabled||s.loading)return;s.onClick()};return u.addEventListener("click",_),m(),{update:(h)=>{s={...s,...h},m()},dispose:()=>{u.removeEventListener("click",_),u.remove()}}};var Pt=(e,r)=>{G(P);let s=r,u=O("label","oc-sdk oc-sdk-field"),d=O("span","oc-sdk-field-label"),S=s.multiline?O("textarea","oc-sdk-input"):O("input","oc-sdk-input"),m=O("span","oc-sdk-field-note");u.append(d,S,m),e.append(u);let _=()=>{if(D(d,s.label),d.hidden=!s.label,S instanceof HTMLInputElement)S.type=s.password?"password":"text";else S.rows=s.rows??3;if(S.value!==s.value)S.value=s.value;S.disabled=Boolean(s.disabled),Y(S,"placeholder",s.placeholder),S.dataset.mono=s.mono?"true":"false";let k=Boolean(s.error);u.dataset.invalid=k?"true":"false",S.setAttribute("aria-invalid",k?"true":"false");let N=s.error??s.helper??"";D(m,N),m.hidden=N===""},h=()=>{s.onChange(S.value)};return S.addEventListener("input",h),_(),{update:(k)=>{s={...s,...k},_()},dispose:()=>{S.removeEventListener("input",h),u.remove()}}};var Gt=Rt(),Mo=document.querySelector("#root");if(!Mo)throw Error("Missing root");var Go=!1;Gt.onReady((e)=>{if(yt(e,document.documentElement),Go)return;Go=!0;let r=document.createElement("div");r.style.cssText="display:flex;align-items:center;gap:8px;height:100%;padding:0 8px;box-sizing:border-box;",Mo.append(r);let s="",u=document.createElement("div");u.style.flex="1",r.append(u);let d=Pt(u,{value:s,placeholder:"https://example.com",mono:!0,onChange:(_)=>{s=_,d.update({value:_})}}),S=le(r,{label:"Go",size:"sm",onClick:()=>{if(!s.trim())return;S.update({loading:!0}),Gt.serviceRequest({method:"POST",path:"/navigate",body:JSON.stringify({url:s.trim()})}).then(()=>m()).finally(()=>S.update({loading:!1}))}}),m=async()=>{try{let _=await Gt.serviceRequest({method:"GET",path:"/state"}),h=JSON.parse(_.body);if(String(h.url)===h.url&&h.url!==s)s=h.url==="about:blank"?"":h.url,d.update({value:s})}catch{}};m(),setInterval(()=>{m()},2000)});})();
