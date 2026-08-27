/**
 * Immediate Coming Soon guest ping — runs as a classic script before React hydrates.
 * Android Chrome can delay or skip SessionProvider-dependent trackers; this still
 * creates/refreshes the visitor row and sets the httpOnly cookie via the API.
 */
export function ComingSoonGuestBeacon() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{window.__mesaGuestDocumentPv=1;var id=(crypto.randomUUID&&crypto.randomUUID())||("n"+Date.now()+"_"+Math.random().toString(36).slice(2));fetch("/api/analytics/guest",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({path:location.pathname||"/",pageview:!0,navId:id,referer:document.referrer||""})}).catch(function(){})}catch(e){}})();`,
      }}
    />
  );
}
