/**
 * Immediate Coming Soon guest ping — runs as a classic script before React hydrates.
 * Android Chrome can delay or skip SessionProvider-dependent trackers; this still
 * creates/refreshes the visitor row and sets the httpOnly cookie via the API.
 *
 * Visitor identity is bootstrapped in localStorage (shared across tabs) under a
 * Web Lock so simultaneous tabs do not mint two Guest rows.
 */
export function ComingSoonGuestBeacon() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{window.__mesaGuestDocumentPv=1;function conn(){try{var ck=sessionStorage.getItem("mesa-guest-connection")||"";if(!ck||ck.length>80||!/^[A-Za-z0-9_-]+$/.test(ck)){ck=(crypto.randomUUID&&crypto.randomUUID().replace(/-/g,""))||("c"+Date.now()+"_"+Math.random().toString(36).slice(2));sessionStorage.setItem("mesa-guest-connection",ck)}return ck}catch(e){return""}}function visitor(){try{var k=localStorage.getItem("mesa-guest-visitor")||"";if(k&&k.length<=80&&/^[A-Za-z0-9_-]+$/.test(k))return k;k=(crypto.randomUUID&&crypto.randomUUID())||("v"+Date.now()+"_"+Math.random().toString(36).slice(2));localStorage.setItem("mesa-guest-visitor",k);var c=localStorage.getItem("mesa-guest-visitor")||k;return c}catch(e){return""}}function send(vk){var id=(crypto.randomUUID&&crypto.randomUUID())||("n"+Date.now()+"_"+Math.random().toString(36).slice(2));fetch("/api/analytics/guest",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({path:location.pathname||"/",pageview:!0,navId:id,referer:document.referrer||"",connectionKey:conn(),clientVisitorKey:vk})}).then(function(r){return r.json().catch(function(){return{}})}).then(function(d){if(d&&d.visitorKey){try{localStorage.setItem("mesa-guest-visitor",d.visitorKey)}catch(e){}}}).catch(function(){})}var run=function(){send(visitor())};if(navigator.locks&&navigator.locks.request){navigator.locks.request("mesa-guest-visitor-key",run).catch(run)}else{run()}}catch(e){}})();`,
      }}
    />
  );
}
