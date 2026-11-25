/* Runs first on every page of the club's website (no inline scripts: the CSP forbids them). */
(function (l) {
  // Never inside another page (clickjacking): GitHub Pages cannot send frame-ancestors.
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { window.top.location.replace(l.href); } catch (e) {}
    return;
  }
  // The app used to live at the root: links in old emails, sign-in returns and installed
  // shortcuts (?open=, ?source=pwa, ?code=, #account-…, #access_token=…, #inicio…) go on to /app/.
  var home = l.pathname === '/' || /\/index\.html$/.test(l.pathname);
  var h = l.hash, q = l.search;
  if (home && (/[?&](open|source|code|error)=/.test(q) || (h && !/^#(contenido|menu|ult|app-t|ig-t)?$/.test(h)))) {
    l.replace('/app/' + q + h);
    return;
  }
  // Page-to-page transitions only between our own pages, never on reload or arrival.
  addEventListener('pagereveal', function (e) {
    var n = performance.getEntriesByType('navigation')[0];
    if (e.viewTransition && (!n || n.type === 'reload' || !document.referrer || new URL(document.referrer).origin !== l.origin)) e.viewTransition.skipTransition();
  });
})(location);
