(()=>{var S="openchamber.sdk",E=2;var me="openchamber:guest-bootstrap",zo=(e,r,s)=>{let{window:i,MessageChannel:l}=globalThis;if(!i||!l)return;try{let g=new l,T=g.port1,_=!1,x=!1,k=null,F=(I)=>{try{I.close()}catch{}},oe=(I=[])=>{for(let M of I)F(M);if(!_)_=!0,F(T)},J=(I)=>{let M=new CustomEvent(s,{detail:I,cancelable:!0});if(!i.dispatchEvent(M))return;F(I),_=!0};i.addEventListener(s,(I)=>{if(!("detail"in I)||I.detail!==null)return;if(x=!0,k){let M=k;k=null,J(M)}}),T.addEventListener("message",(I)=>{if(_)return;let M=I.data,V=I.ports??[];if(!M||M.channel!==e||M.v!==r||M.type!=="connect-port"||V.length!==1){oe(V);return}let Q=V[0];if(_=!0,F(T),Q.start(),!x){k=Q;return}J(Q)}),T.start(),i.parent.postMessage({channel:e,v:r,type:"bootstrap"},"*",[g.port2])}catch{}},Jo=`(${zo.toString()})(${JSON.stringify("openchamber.guest-bootstrap")}, 2, ${JSON.stringify("openchamber:guest-bootstrap")});`;var et=`
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
`;function tt(e){let r=e.documentElement;if(r.hasAttribute("data-oc-scrollbar-activity"))return;r.setAttribute("data-oc-scrollbar-activity","");let s=new WeakMap;e.addEventListener("scroll",(i)=>{let l=i.target===e?r:i.target;if(!(l instanceof Element))return;if(!l.hasAttribute("data-oc-scrolling"))l.setAttribute("data-oc-scrolling","");let g=s.get(l);if(g!==void 0)clearTimeout(g);s.set(l,setTimeout(()=>{s.delete(l),l.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var Qo=`(${tt.toString()})(document);`;var ot=128,rt=65536;var Oe=128;var Ae=65536;var oo=/^[a-z][a-z0-9-]{0,39}$/;var Zt=(e)=>Object(e)===e&&!Array.isArray(e),st=(e,r)=>Object.keys(e).every((s)=>r.includes(s)),eo=(e)=>String(e)===e&&e.length>=1&&e.length<=60,to=(e)=>String(e)===e&&e.length>=1&&e.length<=80,ro=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let s of e){if(!Zt(s)||!oo.test(s.id)||!eo(s.label))return!1;if(s.disabled!==void 0&&s.disabled!==!0&&s.disabled!==!1)return!1;if(r.has(s.id))return!1;if(r.add(s.id),s.kind==="button"){if(!st(s,["kind","id","label","disabled"]))return!1;continue}if(s.kind!=="select"||!st(s,["kind","id","label","value","options","disabled"]))return!1;if(!to(s.value)||!Array.isArray(s.options)||s.options.length<1||s.options.length>16)return!1;let i=new Set;for(let l of s.options){if(!Zt(l)||!st(l,["value","label"])||!to(l.value)||!eo(l.label)||i.has(l.value))return!1;i.add(l.value)}if(!i.has(s.value))return!1}return!0};var so=["{id}","{segment}","{segments+}"];var kr=new Set(so);var no=["turn-finished","turn-failed","permission-asked","question-asked","turn-started","session-created","session-archived","session-deleted"];var Pr=new Set(no);var Ce=20000000,ke=256;var nt=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,io=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let s=0;s<e.bytes.byteLength;s+=1)if(e.bytes[s]!==r.bytes[s])return!1;return!0},Ie=(e)=>{let r=e,s=e;return{observe:(i)=>{let l=i!==s;return s=i,{edited:l,dirty:i!==r}},markSaved:(i)=>(r=i,s!==i)}};var ao=/^[A-Za-z0-9_-]{1,80}$/;var lo=["left","right","top","bottom"];var co=(e,r=0,s={remaining:16000})=>{if(--s.remaining<0||r>=32)return!1;if(e===null)return!0;let i=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let l of i)if(!co(l,r+1,s))return!1;return!0},it=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(it);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(it)}return String(e)===e||Number.isFinite(e)},at=(e)=>{try{if(String(e.id)!==e.id||!ao.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!lo.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!co(e.data)||!it(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var ct=2000;var po=["file","directory","other","missing"],ut=(e)=>Boolean(e&&"sessionId"in e),pt=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var So=/^[0-9a-f]{7,64}$/i,dt=(e)=>So.test(e),Pe=500,Ge=32000,Eo=16000,go=128,_o=200,To=2000,mo=16000,fo=80,yo=200,Ro=16000;var ho=2000;var St=20000,Me=1024,Ue=2000000;var we=64000,Ne=8000,Et=4000;var gt=960000;var bo=999,vo=1e4,fe=500,xo=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],Oo=["stopped","starting","ready","failed"],Zo=new Set(xo),Ao=(e)=>Zo.has(e),Co=(e)=>e&&Ao(e)?e:"HOST_REJECTED",ae=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(ae);if(Object(e)===e)return Object.values(e).every(ae);return!1},ko=(e)=>ae(e)&&JSON.stringify(e).length<=Ro,uo=(e)=>e?.trim().slice(0,yo)??"",le=(e)=>{let r=e.id.trim().slice(0,go),s=e.title.trim().slice(0,_o),i=e.url.trim().slice(0,To),l=e.text?.trim().slice(0,mo),g=e.author?.trim().slice(0,fo),T=e.kind==="pull"?"pull":"issue",_={providerId:e.providerId.trim(),id:r,title:s||r,url:i,kind:T};if(l)_.text=l;if(g)_.author=g;if(T==="pull"){let x=uo(e.branches?.head),k=uo(e.branches?.base);if(x&&k)_.branches={head:x,base:k}}if(ko(e.data))_.data=e.data;return _},_t=(e)=>{let r=le(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},Tt=(e)=>{let r={text:e.text.trim().slice(0,Eo)};if(e.send)r.send=!0;return r},mt=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(bo,Math.max(0,Math.round(e)))},ft=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(vo,Math.max(0,Math.ceil(e)))};var ce=(e)=>e.length>0&&e.length<=Me&&!e.includes("\x00")&&!e.includes("\\");var Le=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>ho)return!1;return!e.split("/").some((s)=>s==="."||s==="..")},er=new Set(Oo),yt=(e)=>Boolean(e&&"status"in e&&er.has(String(e.status))&&!("body"in e)),De=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),Rt=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),ht=(e)=>Boolean(e&&"written"in e&&e.written===!0),bt=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),tr=new Set(po),vt=(e)=>Boolean(e&&"kind"in e&&"size"in e&&tr.has(String(e.kind))&&Number.isFinite(e.size)),xt=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),or=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","service-event","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late"]),rr=(e)=>Object(e)===e?e:null,lt=(e)=>String(e)===e&&e.length>0,sr=(e)=>{if(!lt(e.id))return null;if(e.ok===!0){let r={channel:S,v:E,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&lt(e.error))return{channel:S,v:E,type:"result",id:e.id,ok:!1,error:e.error,code:Co(lt(e.code)?e.code:void 0)};return null},Ot=(e)=>{let r=rr(e);if(!r||r.channel!==S||r.v!==E)return null;if(r.type==="result")return sr(r);if(!or.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var Io=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),nr=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class u extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var Po=()=>Promise.reject(new u("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),He=()=>Promise.reject(new u("BAD_PATH",`File path must be 1 to ${Me} characters without NUL or backslash.`)),Be=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new u("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},d=(e)=>(e.value+=1,`oc-${e.value}`),At=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new u("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let s=e.requestTimeoutMs??St,i=e.acceptSource??((t)=>t===r.parent),l=new Set,g=new Set,T=new Set,_=new Set,x=new Set,k=new Set,F=new Set,oe=new Set,J=new Set,I=new Set,M=new Set,V=new Set,Q=[],de=null,Se=null,Re=new Set,he=new Set,Ee=null,ge=null,ze=!1,re=new Map,se=new Map,ne=new Map,H=!1,p={value:0},c=null,X=null,_e=!1,Te=!1,Vt=null,Xt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},ie=null,Je=[],D=(t)=>{if(H)return;if(ie){ie.postMessage(t);return}Je.push(t)},qt=()=>{if(H||Object.is(r.parent,r)||V.size===0||c?.features?.lateGenerateResults!==!0)return;D({channel:S,v:E,type:"generate-late-listen"})},R=(t,o)=>{for(let n of t)try{n(o)}catch(a){console.error(a)}},Wo=(t)=>{if(!("data"in t))return;let o=Ot(t.data);if(!o)return;if(o.type==="workspace"){let a=se.get(o.payload.subscriptionId);if(a)R([a],o.payload.snapshot);return}if(o.type==="shells"){let a=ne.get(o.payload.subscriptionId);if(a)R([a],o.payload.snapshot);return}if(o.type==="ready"){if(c=o.payload,X=Xt(o.payload.session),R(l,o.payload),R(g,o.payload.directory),R(T,o.payload.session),X)R(_,X);if(R(x,o.payload.connection),R(k,o.payload.settings),R(F,o.payload.item),o.payload.block)R(oe,o.payload.block);qt();return}if(o.type==="service-event"){R(J,o.payload);return}if(o.type==="generate-late"){if(V.size===0)Q.push(o.payload);else R(V,o.payload);return}if(o.type==="directory"){if(c)c={...c,directory:o.payload.directory};R(g,o.payload.directory);return}if(o.type==="session"){if(c)c={...c,session:o.payload.session};if(!o.payload.session)X=null;else if(X?.sessionId!==o.payload.session.id)X=Xt(o.payload.session);R(T,o.payload.session);return}if(o.type==="session-lifecycle"){X=o.payload,R(_,o.payload);return}if(o.type==="connection"){if(c)c={...c,connection:o.payload.connection};R(x,o.payload.connection);return}if(o.type==="settings"){if(c)c={...c,settings:o.payload.settings};R(k,o.payload.settings);return}if(o.type==="item"){if(c)c={...c,item:o.payload.item};R(F,o.payload.item);return}if(o.type==="status-control-event"){R(I,o.payload);return}if(o.type==="popover-closed"){R(M,o.payload);return}if(o.type==="action"){let a=(m)=>{if(!H)D({channel:S,v:E,type:"action-result",id:o.id,payload:m})},f=Se;if(!f){a({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>f(o.payload)).then(()=>a({ok:!0}),(m)=>{let A=(m instanceof Error?m.message:String(m)).trim();a({ok:!1,error:(A||"Action failed.").slice(0,fe)})});return}if(o.type==="file-open"){let a=o.payload;if(ge&&io(ge,a))return;ge=a,R(Re,o.payload);return}if(o.type==="file-saved"){R(he,o.payload.version);return}if(o.type==="file-snapshot"){let a=(A)=>{if(!H)D({channel:S,v:E,type:"file-snapshot-result",id:o.id,payload:A})},f=(A)=>a({error:(A.trim()||"Could not read the edited file.").slice(0,fe)}),m=Ee;if(!m){f("This extension does not edit files.");return}Promise.resolve().then(()=>m(o.payload.purpose)).then((A)=>{if(nt(A)>Ce){f(`The file is over ${Ce} ${"bytes"in A?"bytes":"characters"}.`);return}if(A.version.length>ke){f(`The snapshot version is over ${ke} characters.`);return}a({snapshot:"bytes"in A?{bytes:A.bytes,version:A.version}:{content:A.content,version:A.version}})},(A)=>f(A instanceof Error?A.message:String(A)));return}if(o.type==="resolve"){let a=(m)=>{D({channel:S,v:E,type:"resolve-result",id:o.id,payload:m})},f=de;if(!f){a({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>f(o.payload)).then((m)=>a({item:m?le(m):null}),(m)=>{let A=(m instanceof Error?m.message:String(m)).trim();a({error:(A||"Command failed.").slice(0,fe)})});return}let n=re.get(o.id);if(!n)return;if(clearTimeout(n.timer),re.delete(o.id),o.ok){n.resolve(o.payload);return}n.reject(new u(o.code,o.error))},$o=(t)=>{if(!("source"in t))return!0;return i(t.source)},Wt=(t)=>{if(!$o(t)||!("detail"in t))return;let o=t.detail;if(!(o instanceof MessagePort))return;t.preventDefault(),t.stopImmediatePropagation(),ie?.close(),ie=o,o.addEventListener("message",Wo),o.start(),o.postMessage({channel:S,v:E,type:"hello"});for(let n of Je.splice(0))o.postMessage(n)};r.addEventListener(me,Wt),r.dispatchEvent?.(new CustomEvent(me,{detail:null}));let U=(t,o=s)=>{if(H||Object.is(r.parent,r))return Promise.reject(new u("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((n,a)=>{let f=setTimeout(()=>{re.delete(t.id),a(new u("HOST_TIMEOUT","Host did not answer in time."))},o);re.set(t.id,{resolve:n,reject:a,timer:f}),D(t)})},v=(t)=>U(t).then(()=>{return}),O={channel:S,v:E},Qe=(t)=>{if(!H&&!Object.is(r.parent,r))D(t)},$t=()=>Qe({...O,type:"file-save"}),Kt=(t)=>{if(!Io(t)||!nr(t))return;t.preventDefault(),$t()},jt=(t)=>{if(!Io(t)||t.key!=="Escape"||c?.surface!=="popover"||!c.popover)return;t.preventDefault(),Qt(c.popover.id,"escape").catch(()=>{return})},be=()=>{let t=c?.surface==="popover"?c.popover:void 0;if(!t)return;let o=_e||Te;if(Vt===o)return;Vt=o,Yt(t.id,o).catch(()=>{return})},ve=()=>{if(c?.surface!=="popover"||_e)return;_e=!0,be()},zt=(t)=>{if(c?.surface!=="popover"||t.relatedTarget!==null||!_e)return;_e=!1,be()},Jt=()=>{if(c?.surface!=="popover"||Te)return;Te=!0,be()},Ko=()=>{if(c?.surface!=="popover"||!Te)return;Te=!1,be()},B=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new u("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},Ye=async(t)=>{if(t.kind!=="projects")B(t.projectId);let o=await U({...O,type:"workspace-read",id:d(p),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new u("HOST_REJECTED","Host did not return workspace data.");return o},Ze=async(t,o)=>{if(t.kind!=="projects")B(t.projectId);let n=d(p);se.set(n,o);try{await v({...O,type:"workspace-subscribe",id:d(p),payload:{subscriptionId:n,query:t}})}catch(a){if(se.delete(n),!H)D({...O,type:"workspace-unsubscribe",id:d(p),payload:{subscriptionId:n}});throw a}return()=>{if(!se.delete(n)||H)return;D({...O,type:"workspace-unsubscribe",id:d(p),payload:{subscriptionId:n}})}},jo=async(t,o)=>{if(t.kind==="session")B(t.sessionId);if(t.kind==="project")B(t.projectId);let n=d(p);ne.set(n,o);try{await v({...O,type:"shells-subscribe",id:d(p),payload:{subscriptionId:n,scope:t}})}catch(a){if(ne.delete(n),!H)D({...O,type:"shells-unsubscribe",id:d(p),payload:{subscriptionId:n}});throw a}return()=>{if(!ne.delete(n)||H)return;D({...O,type:"shells-unsubscribe",id:d(p),payload:{subscriptionId:n}})}},xe=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>ot))throw new u("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!ae(t.value))throw new u("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>rt)throw new u("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&c?.features?.deviceStorage!==!0)throw new u("UNSUPPORTED","This host does not support device storage.");let o=await U({...O,type:"storage",id:d(p),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new u("HOST_REJECTED","Host did not return storage data.");return o},Qt=(t,o)=>c?.features?.popovers!==!0&&!(c?.surface==="popover"&&c.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):v({...O,type:"popover-close",id:d(p),payload:o?{id:t,reason:o}:{id:t}}),Yt=(t,o)=>c?.features?.popovers!==!0&&!(c?.surface==="popover"&&c.popover?.id===t)?Promise.reject(new u("UNSUPPORTED","This host does not support popovers.")):v({...O,type:"popover-anchor",id:d(p),payload:{id:t,active:o}});return r.addEventListener("keydown",jt,!0),r.addEventListener("pointerover",ve),r.addEventListener("pointermove",ve),r.addEventListener("pointerout",zt),r.addEventListener("focus",Jt),r.addEventListener("blur",Ko),{onAction:(t)=>(Se=t,()=>{if(Se===t)Se=null}),listProjects:async()=>{let t=await Ye({kind:"projects"});if(t.kind!=="projects")throw new u("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await Ye({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new u("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await Ye({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new u("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>Ze({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>Ze({kind:"worktrees",projectId:t},(n)=>{if(n.kind==="worktrees")o(n)}),onSessions:(t,o)=>Ze({kind:"sessions",projectId:t},(n)=>{if(n.kind==="sessions")o(n)}),onRunningShells:(t,o)=>jo(t,o),readShellOutput:async(t,o)=>{B(t,Oe);let n=o?.cursor;if(n!==void 0&&(!Number.isInteger(n)||n<0))throw new u("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let a=o?.tailBytes;if(a!==void 0&&(!Number.isInteger(a)||a<1||a>Ae))throw new u("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${Ae}.`);let m=await U({...O,type:"shell-output",id:d(p),payload:{shellId:t,cursor:n,tailBytes:a}});if(!m||typeof m.output!=="string"||!Number.isFinite(m.cursor))throw new u("HOST_REJECTED","Host did not return shell output.");return m},stopShell:async(t)=>{if(B(t,Oe),(await U({...O,type:"shell-stop",id:d(p),payload:{shellId:t}}))?.stopped!==!0)throw new u("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{B(t),await v({...O,type:"open-session",id:d(p),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let n=Be(o),a={op:"get",key:t};if(n)a.scope=n;let f=await xe(a);return f.op==="get"&&f.found?f.value:void 0},set:async(t,o,n)=>{let a=Be(n),f={op:"set",key:t,value:o};if(a)f.scope=a;await xe(f)},delete:async(t,o)=>{let n=Be(o),a={op:"delete",key:t};if(n)a.scope=n;await xe(a)},keys:async(t)=>{let o=Be(t),n={op:"keys"};if(o)n.scope=o;let a=await xe(n);if(a.op!=="keys")throw new u("HOST_REJECTED","Expected storage keys.");return a.keys}},onReady:(t)=>{if(l.add(t),c)t(c);return()=>{l.delete(t)}},onDirectory:(t)=>{if(g.add(t),c)t(c.directory);return()=>{g.delete(t)}},onSession:(t)=>{if(T.add(t),c)t(c.session);return()=>{T.delete(t)}},onSessionLifecycle:(t)=>{if(_.add(t),X)t(X);return()=>{_.delete(t)}},onConnection:(t)=>{if(x.add(t),c)t(c.connection);return()=>{x.delete(t)}},onSettings:(t)=>{if(k.add(t),c)t(c.settings);return()=>{k.delete(t)}},onItem:(t)=>{if(F.add(t),c)t(c.item);return()=>{F.delete(t)}},onBlock:(t)=>{if(oe.add(t),c?.block)t(c.block);return()=>{oe.delete(t)}},onServiceEvent:(t)=>(J.add(t),()=>{J.delete(t)}),onStatusControl:(t)=>(I.add(t),()=>{I.delete(t)}),onPopoverClosed:(t)=>(M.add(t),()=>{M.delete(t)}),onLateGenerateResult:(t)=>{V.add(t);for(let o of Q.splice(0))R([t],o);return qt(),()=>{V.delete(t)}},setStatusControls:(t)=>{if(c?.features?.statusControls!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support status controls."));if(!ro(t))return Promise.reject(new u("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return v({...O,type:"status-controls",id:d(p),payload:{controls:t}})},openPopover:(t)=>{if(c?.features?.popovers!==!0)return Promise.reject(new u("UNSUPPORTED","This host does not support popovers."));if(!at(t))return Promise.reject(new u("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return v({...O,type:"popover-open",id:d(p),payload:t})},closePopover:Qt,setPopoverAnchorActive:Yt,onResolve:(t)=>(de=t,()=>{if(de===t)de=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Pe)return Promise.reject(new u("HOST_REJECTED",`Toast message must contain 1 to ${Pe} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Ge))return Promise.reject(new u("HOST_REJECTED",`Toast copy text must contain 1 to ${Ge} characters.`));return v({channel:S,v:E,type:"toast",id:d(p),payload:{...t,message:o}})},openUrl:(t)=>v({channel:S,v:E,type:"open-url",id:d(p),payload:{url:t}}),openCommit:(t)=>dt(t)?v({channel:S,v:E,type:"open-commit",id:d(p),payload:{sha:t}}):Promise.reject(new u("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),answerBlock:(t)=>v({channel:S,v:E,type:"block-answer",id:d(p),payload:{text:t.trim().slice(0,ct)}}),openSurface:(t)=>v({channel:S,v:E,type:"open-surface",id:d(p),payload:{surfaceId:t}}),writeClipboard:(t)=>v({channel:S,v:E,type:"clipboard-write",id:d(p),payload:{text:t}}),compose:(t)=>v({channel:S,v:E,type:"compose",id:d(p),payload:t}),attach:(t)=>v({channel:S,v:E,type:"attach",id:d(p),payload:le(t)}),startSession:async(t)=>{if(t.projectId!==void 0)B(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")B(o.directory);else{if(o.name!==void 0)B(o.name,200);if(o.baseBranch!==void 0)B(o.baseBranch,200)}let n=await U({channel:S,v:E,type:"start-session",id:d(p),payload:_t(t)},e.requestTimeoutMs??180000);if(!ut(n))throw new u("HOST_REJECTED","Host did not return a session.");return n},prompt:(t)=>U({channel:S,v:E,type:"prompt",id:d(p),payload:Tt(t)}).then((o)=>{if(!pt(o))throw new u("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>v({channel:S,v:E,type:"session-link",id:d(p),payload:le(t)}),close:()=>v({channel:S,v:E,type:"close",id:d(p)}),oauthStart:()=>v({channel:S,v:E,type:"oauth-start",id:d(p)}),oauthDisconnect:()=>v({channel:S,v:E,type:"oauth-disconnect",id:d(p)}),request:(t)=>(Le(t.path)?U({channel:S,v:E,type:"request",id:d(p),payload:t}):Po()).then((o)=>{if(!De(o))throw new u("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:(t)=>(Le(t.path)?U({channel:S,v:E,type:"service-request",id:d(p),payload:t}):Po()).then((o)=>{if(!De(o))throw new u("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>U({channel:S,v:E,type:"service-status",id:d(p)}).then((t)=>{if(!yt(t))throw new u("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(ce(t)?U({channel:S,v:E,type:"file-read",id:d(p),payload:{path:t}}):He()).then((o)=>{if(!Rt(o))throw new u("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!ce(t))return He();if(o.length>Ue)return Promise.reject(new u("FILE_TOO_LARGE",`Content is over ${Ue} characters.`));return U({channel:S,v:E,type:"file-write",id:d(p),payload:{path:t,content:o}}).then((n)=>{if(!ht(n))throw new u("HOST_REJECTED","Host did not confirm the write.");return n})},listDir:(t)=>(ce(t)?U({channel:S,v:E,type:"file-list",id:d(p),payload:{path:t}}):He()).then((o)=>{if(!bt(o))throw new u("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(ce(t)?U({channel:S,v:E,type:"file-stat",id:d(p),payload:{path:t}}):He()).then((o)=>{if(!vt(o))throw new u("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),n=t.system?.trim();if(o.length===0||o.length>we)return Promise.reject(new u("HOST_REJECTED",`Prompt must be 1 to ${we} characters.`));if(n!==void 0&&(n.length===0||n.length>Ne))return Promise.reject(new u("HOST_REJECTED",`System prompt must be 1 to ${Ne} characters.`));let a=t.maxOutputTokens===void 0?void 0:Math.min(Et,Math.max(1,Math.floor(t.maxOutputTokens)));if(a!==void 0&&!Number.isFinite(a))return Promise.reject(new u("HOST_REJECTED","maxOutputTokens must be a number."));let f={prompt:o};if(n!==void 0)f.system=n;if(a!==void 0)f.maxOutputTokens=a;return U({channel:S,v:E,type:"generate",id:d(p),payload:f},e.requestTimeoutMs??gt).then((m)=>{if(!xt(m))throw new u("HOST_REJECTED","Host did not return generated text.");return m})},setBadge:(t)=>v({channel:S,v:E,type:"badge",id:d(p),payload:{count:mt(t)}}),setHeight:(t)=>v({channel:S,v:E,type:"resize",id:d(p),payload:{height:ft(t)}}),onFileOpen:(t)=>{if(Re.add(t),!ze)ze=!0,r.addEventListener("keydown",Kt,!0);if(ge)t(ge);return()=>{Re.delete(t)}},onFileSnapshot:(t)=>(Ee=t,()=>{if(Ee===t)Ee=null}),onFileSaved:(t)=>(he.add(t),()=>{he.delete(t)}),reportFileChange:(t)=>Qe({...O,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:$t,reportFileUnsupported:()=>Qe({...O,type:"file-unsupported"}),dispose:()=>{for(let t of se.keys())D({...O,type:"workspace-unsubscribe",id:d(p),payload:{subscriptionId:t}});se.clear();for(let t of ne.keys())D({...O,type:"shells-unsubscribe",id:d(p),payload:{subscriptionId:t}});if(ne.clear(),H=!0,de=null,Se=null,Ee=null,Re.clear(),he.clear(),ze)r.removeEventListener("keydown",Kt,!0);r.removeEventListener(me,Wt),r.removeEventListener("keydown",jt,!0),r.removeEventListener("pointerover",ve),r.removeEventListener("pointermove",ve),r.removeEventListener("pointerout",zt),r.removeEventListener("focus",Jt),ie?.close(),ie=null,Je.length=0;for(let t of re.values())clearTimeout(t.timer),t.reject(new u("HOST_UNAVAILABLE","Host client was disposed."));re.clear(),l.clear(),g.clear(),T.clear(),_.clear(),x.clear(),k.clear(),F.clear(),oe.clear(),J.clear(),I.clear(),M.clear(),V.clear(),Q.length=0}}};var Go=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var Kr=new Set(Go);var Mo=["none","agent","user"];var zr=new Set(Mo);var ir=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],ar=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],Uo=(e,r)=>{r.style.colorScheme=e.mode;for(let[s,i]of ir)r.style.setProperty(s,e.tokens[i]);for(let[s,i,l]of ar){let g=e.tokens[l]??"";r.style.setProperty(s,g),r.style.setProperty(i,g)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size","0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},Ct=(e,r)=>{if(Uo(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var lr={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},y=(e,r)=>`var(--${e}, var(--oc-${lr[e]}, ${r}))`,W=y("surface-background","transparent"),Ve=y("surface-elevated","transparent"),ue=y("surface-elevated-foreground","inherit"),N=y("surface-foreground","inherit"),h=y("surface-muted-foreground","gray"),cr=y("surface-muted","transparent"),Y=y("interactive-border","currentColor"),w=y("interactive-hover","transparent"),Z=y("interactive-active","transparent"),kt=y("interactive-selection","transparent"),It=y("interactive-selection-foreground","inherit"),q=y("primary","currentColor"),Pt=y("primary-text","inherit"),Gt=y("error-text","inherit"),ur=y("font-sans","inherit"),Mt=y("font-mono","monospace"),Do=y("radius","9px"),Ut=`calc(${Do} - 2px)`,wo=`calc(${Do} - 4px)`,b=(e,r,s="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${s})`,No=`background-image: linear-gradient(${w}, ${w});`,wt=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,Nt="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Lo="box-shadow: var(--oc-sdk-lit);",Lt=`inset 0 0.5px 0 0 ${b(N,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,pr=`
:root {
  --oc-sdk-edge: ${b(N,16)};
  --oc-sdk-field-bg: ${Ve};
  --oc-sdk-raised-bg: ${W};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${b(N,14)};
  --oc-sdk-field-bg: ${b(W,50,Ve)};
  --oc-sdk-raised-bg: ${Ve};
  --oc-sdk-field-lift: ${Lt};
  --oc-sdk-raised-lift: ${Lt};
  --oc-sdk-lit: ${Lt};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,Fe=(e)=>{let r=y(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${y(`${e}-text`,"inherit")}; }`},dr=`
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
`,Ho=`${pr}
.oc-sdk { color: ${N}; font-family: ${ur}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${No} }
.oc-sdk-mono { font-family: ${Mt}; }
.oc-sdk-muted { color: ${h}; }
${Fe("success")}${Fe("warning")}${Fe("error")}${Fe("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${q}; --oc-sdk-tone-text: ${Pt}; }

.oc-sdk-btn { border-radius: ${Ut}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${wo}; }
.oc-sdk-btn[data-variant="default"] { color: ${Pt}; background: ${b(q,10,W)}; border-color: ${b(q,12)}; ${Lo} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${b(q,16,W)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${b(q,22,W)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${cr}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${Z}, ${Z}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${ue}; ${Nt} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${Z}, ${Z}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${w}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${Z}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${y("status-error","red")}; color: ${Gt}; background: ${b("var(--oc-sdk-tone)",7,W)}; border-color: ${b("var(--oc-sdk-tone)",12)}; ${Lo} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${b("var(--oc-sdk-tone)",9,W)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${b("var(--oc-sdk-tone)",11,W)}; box-shadow: none; }

.oc-sdk-field-note { color: ${h}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${Gt}; }
.oc-sdk-input { border-radius: ${Ut}; background: var(--oc-sdk-field-bg); color: ${ue}; ${wt("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${h}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${wt(b(N,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${wt(y("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${Mt}; }

.oc-sdk-search-icon { color: ${h}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${q}; }
.oc-sdk-search-clear { border-radius: ${wo}; color: ${h}; }
.oc-sdk-search-clear:hover { background: ${w}; color: ${N}; }

.oc-sdk-trigger { border-radius: ${Ut}; background: var(--oc-sdk-raised-bg); color: ${ue}; ${Nt} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${w}, ${w}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${Z}, ${Z}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${h}; }
.oc-sdk-trigger-chevron { color: ${h}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${ue}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${Ve}; background-clip: padding-box; color: ${ue}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${w}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${kt}; color: ${It}; }
.oc-sdk-option-check { color: ${N}; }
.oc-sdk-option[data-destructive="true"] { color: ${Gt}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${b(y("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${h}; }
.oc-sdk-popup-empty { color: ${h}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${Y}; border-radius: 4px; color: ${N}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${b(N,60,Y)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${Y}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${W}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${q}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${No} }
.oc-sdk-check-desc { color: ${h}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${b(N,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${h}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${N}; }
.oc-sdk-tab[aria-selected="true"] { color: ${It}; background: ${kt}; border-color: ${Y}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${ue}; background: var(--oc-sdk-raised-bg); ${Nt} }
.oc-sdk-tab-count { color: ${h}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${b(N,6)}; color: ${h}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${b("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${w}; }
.oc-sdk-row[aria-selected="true"] { background: ${kt}; color: ${It}; }
.oc-sdk-row-lead { font-family: ${Mt}; color: ${h}; }
.oc-sdk-row-sub { color: ${h}; }
.oc-sdk-row-meta { color: ${h}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${h}; }

.oc-sdk-empty-body { color: ${h}; }

.oc-sdk-spinner { color: ${h}; }
.oc-sdk-spinner-ring { border-color: ${Y}; border-top-color: ${q}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${b("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${h}; }

.oc-sdk-separator { color: ${h}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${b(Y,40)}; }

.oc-sdk-progress-label { color: ${h}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${b(N,6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${q}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${y("status-success","currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${y("success-text","inherit")}; }

.oc-sdk-text a { color: ${Pt}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${b(Y,60)}; }
`,P=`
${et}
${dr}
${Ho}`;var Bo="oc-sdk-ui-style";var G=(e)=>{let r=document.getElementById(Bo);if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}tt(document);let s=document.createElement("style");s.id=Bo,s.textContent=e,document.head.appendChild(s)},C=(e,r)=>{let s=document.createElement(e);if(r)s.className=r;return s},K=(e)=>{let r=C("button",e);return r.type="button",r},L=(e,r)=>{let s=r??"";if(e.textContent!==s)e.textContent=s};var Sr=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},j=(e,r)=>{G(P);let s=r,i=K("oc-sdk oc-sdk-btn"),l=Sr(),g=document.createElement("span");i.append(g),e.append(i);let T=()=>{if(i.dataset.variant=s.variant??"default",i.dataset.size=s.size??"default",i.disabled=Boolean(s.disabled)||Boolean(s.loading),i.dataset.loading=s.loading?"true":"false",i.setAttribute("aria-busy",s.loading?"true":"false"),s.loading&&l.parentNode!==i)i.prepend(l);else if(!s.loading&&l.parentNode===i)l.remove();L(g,s.label)},_=()=>{if(s.disabled||s.loading)return;s.onClick()};return i.addEventListener("click",_),T(),{update:(x)=>{s={...s,...x},T()},dispose:()=>{i.removeEventListener("click",_),i.remove()}}};var Dt=(e,r)=>{G(P);let s=r,i=C("div","oc-sdk oc-sdk-empty"),l=C("h2","oc-sdk-empty-title"),g=C("p","oc-sdk-empty-body"),T=C("div","oc-sdk-empty-action");i.append(l,g,T),e.append(i);let _=null,x=()=>{if(L(l,s.title),L(g,s.body),g.hidden=!s.body,T.hidden=!s.action,!s.action){_?.dispose(),_=null;return}let k={label:s.action.label,onClick:s.action.onClick};if(_)_.update(k);else _=j(T,{...k,variant:"outline",size:"sm"})};return x(),{update:(k)=>{s={...s,...k},x()},dispose:()=>{_?.dispose(),_=null,i.remove()}}};var mr=/^(\s*[-*+] )\[( |x|X)\] ?(.*)$/,Fo=(e)=>e.split(`
`).map((r)=>{let s=mr.exec(r);return s?{kind:"item",prefix:s[1]??"- ",done:s[2]!==" ",text:s[3]??""}:{kind:"text",text:r}}),Vo=(e)=>e.map((r)=>r.kind==="text"?r.text:`${r.prefix}[${r.done?"x":" "}] ${r.text}`).join(`
`),Ke=(e)=>{let r=2166136261;for(let s=0;s<e.length;s+=1)r^=e.charCodeAt(s),r=Math.imul(r,16777619);return`${e.length}:${(r>>>0).toString(16)}`},Xo=(e,r)=>{let s=-1,i="- ";e.forEach((_,x)=>{if(_.kind!=="item")return;s=x,i=_.prefix});let l={kind:"item",prefix:i,done:!1,text:r};if(s>=0)return[...e.slice(0,s+1),l,...e.slice(s+1)];return[...e.at(-1)?.kind==="text"&&e.at(-1)?.text===""?e.slice(0,-1):[...e],l,{kind:"text",text:""}]};var te=At(),ee=document.querySelector("#root");if(!ee)throw Error("Missing root");var qo=document.createElement("style");qo.textContent=`
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
`;document.head.append(qo);te.onReady((e)=>Ct(e,document.documentElement));var z=[],pe=!1,Bt=Ie(null),Ft=()=>Vo(z),je=()=>{te.reportFileChange(Bt.observe(Ke(Ft())))},Ht=()=>{if(ee.replaceChildren(),!z.some((r)=>r.kind==="item")&&pe){Dt(ee,{title:"No items",body:"This checklist is empty."});return}if(z.forEach((r,s)=>{if(r.kind==="text"){let T=document.createElement("p");T.className="note",T.textContent=r.text,ee.append(T);return}let i=document.createElement("div");i.className=r.done?"item done":"item";let l=document.createElement("input");l.type="checkbox",l.checked=r.done,l.disabled=pe,l.addEventListener("change",()=>{r.done=l.checked,i.className=r.done?"item done":"item",je()});let g=document.createElement("input");if(g.type="text",g.value=r.text,g.readOnly=pe,g.setAttribute("aria-label","Item"),g.addEventListener("input",()=>{r.text=g.value,je()}),i.append(l,g),!pe){let T=document.createElement("span");T.className="remove",j(T,{label:"Remove",variant:"ghost",size:"xs",onClick:()=>{z=z.filter((_,x)=>x!==s),je(),Ht()}}),i.append(T)}ee.append(i)}),pe)return;let e=document.createElement("div");e.className="actions",j(e,{label:"Add item",variant:"secondary",size:"sm",onClick:()=>{z=Xo(z,""),je(),Ht();let r=ee.querySelectorAll('.item input[type="text"]');r.item(r.length-1)?.focus()}}),ee.append(e)};te.onFileOpen((e)=>{if(e.encoding!=="text"){te.reportFileUnsupported();return}z=Fo(e.content),pe=e.readOnly,Bt=Ie(Ke(Ft())),Ht()});te.onFileSnapshot(()=>{let e=Ft();return{content:e,version:Ke(e)}});te.onFileSaved((e)=>{te.reportFileChange({dirty:Bt.markSaved(e),edited:!1})});})();
