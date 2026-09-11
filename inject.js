'use strict';

/**
 * Scripts that run in the page's own JavaScript world (via executeJavaScript).
 * They talk back to the main process by firing an `fs-bridge` DOM event that
 * preload-web.js picks up — the page itself never gets access to IPC.
 */

const BRIDGE = `
  var __fsTop = (function(){ try { return window.top === window; } catch(e){ return true; } })();
  function __fsSend(o){
    try {
      if (__fsTop) document.dispatchEvent(new CustomEvent('fs-bridge', { detail: JSON.stringify(o) }));
      else window.top.postMessage({ __fsbridge: o }, '*');
    } catch (e) {}
  }
  if (__fsTop && !window.__fsRelay) {
    window.__fsRelay = 1;
    window.addEventListener('message', function(ev){
      var d = ev && ev.data;
      if (d && d.__fsbridge && typeof d.__fsbridge === 'object') __fsSend(d.__fsbridge);
    });
  }
  function __fsUnwrap(u){
    try {
      var x = new URL(u, location.href);
      if (/(^|\\.)google\\.[a-z.]+$/i.test(x.hostname) && x.pathname === '/url') {
        var q = x.searchParams.get('q') || x.searchParams.get('url');
        if (q) return q;
      }
      return x.href;
    } catch (e) { return String(u); }
  }
  function __fsAnchor(ev){
    var p = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < p.length; i++) {
      var n = p[i];
      if (n && n.tagName === 'A' && n.getAttribute && n.getAttribute('href')) return n;
    }
    return (ev.target && ev.target.closest) ? ev.target.closest('a[href]') : null;
  }
  var __fsMedia = /\\.(mkv|mp4|avi|ts|m2ts|mov|wmv|flv|rmvb|m4v|mpg|mpeg|vob|iso|webm|m3u8)(\\?|#|$)/i;
  function __fsDirect(u){
    u = String(u || '');
    if (!/^https?:/i.test(u)) return false;
    if (/^https?:\\/\\/download\\d*\\.fshare\\.vn\\//i.test(u)) return true;
    if (/fshare\\.vn\\/(dl|download)\\//i.test(u)) return true;
    return __fsMedia.test(u);
  }
  function __fsSetValue(el, v){
    try {
      var d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
      if (d && d.set) d.set.call(el, v); else el.value = v;
    } catch (e) { el.value = v; }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
`;

/** Tab 1 — the Google Sheet. Runs in every frame. */
const sheet = `(function(){
  ${BRIDGE}
  if (window.__fsSheetHook) return 'already';
  window.__fsSheetHook = 1;
  document.addEventListener('click', function(ev){
    if (!ev.isTrusted) return;   // Sheets fires synthetic clicks on its own link bubble
    var a = __fsAnchor(ev);
    if (!a) return;
    var u = __fsUnwrap(a.href || a.getAttribute('href'));
    if (/(^|\\/\\/|\\.)((www|w+)\\.)?fshare\\.vn\\//i.test(u)) {
      ev.preventDefault();
      ev.stopPropagation();
      __fsSend({ type: 'sheetLink', url: u });
    }
  }, true);
  return 'ok';
})();`;

/** Tab 2 — the Fshare folder explorer. */
const browse = `(function(){
  ${BRIDGE}
  if (window.__fsBrowseHook) return 'already';
  window.__fsBrowseHook = 1;

  function pick(u){
    u = __fsUnwrap(u);
    if (/fshare\\.vn\\//i.test(u) || __fsDirect(u)) { __fsSend({ type: 'chosenLink', url: u }); return true; }
    return false;
  }

  document.addEventListener('click', function(ev){
    if (!ev.isTrusted) return;
    var a = __fsAnchor(ev);
    if (!a) return;
    var href = a.href || a.getAttribute('href');
    if (!href || /^javascript:/i.test(href)) return;
    if (pick(href)) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);

  // The "copy link" button in each row.
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      var oc = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = function(text){ pick(String(text || '').trim()); return oc(text); };
    }
  } catch (e) {}
  document.addEventListener('copy', function(){
    try { var s = String(window.getSelection()); if (s) pick(s.trim()); } catch (e) {}
  }, true);

  var ow = window.open;
  window.open = function(u){
    if (u && pick(String(u))) return null;
    return ow.apply(window, arguments);
  };
  return 'ok';
})();`;

/** Tab 3 — Fshare itself: watch for the real download URL. */
const fshare = `(function(){
  ${BRIDGE}
  if (window.__fsDlHook) return 'already';
  window.__fsDlHook = 1;

  var RE = /https?:\\/\\/[a-z0-9.-]*fshare\\.vn\\/(?:dl|download)\\/[^"'\\s<>\\\\)\\]},]+/i;
  function report(u, via){
    u = String(u || '').replace(/\\\\\\//g, '/');
    if (/^https?:/i.test(u)) __fsSend({ type: 'download', url: u, via: via });
  }
  function scan(text, via){
    if (typeof text !== 'string' || text.length > 400000) return;
    var m = text.replace(/\\\\\\//g, '/').match(RE);
    if (m) report(m[0], via);
  }

  try {
    var of = window.fetch;
    if (of) window.fetch = function(){
      var p = of.apply(this, arguments);
      try {
        p.then(function(r){ try { r.clone().text().then(function(t){ scan(t, 'fetch'); }, function(){}); } catch(e){} }, function(){});
      } catch (e) {}
      return p;
    };
  } catch (e) {}

  try {
    var os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(){
      this.addEventListener('load', function(){
        try { if (this.responseType === '' || this.responseType === 'text') scan(this.responseText, 'xhr'); } catch (e) {}
      });
      return os.apply(this, arguments);
    };
  } catch (e) {}

  var ow = window.open;
  window.open = function(u){
    if (u && __fsDirect(u)) { report(u, 'window.open'); return null; }
    return ow.apply(window, arguments);
  };

  document.addEventListener('click', function(ev){
    if (!ev.isTrusted) return;
    var a = __fsAnchor(ev);
    if (!a) return;
    var href = a.href || a.getAttribute('href');
    if (href && __fsDirect(href)) { ev.preventDefault(); ev.stopPropagation(); report(href, 'link'); }
  }, true);

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      var oc = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = function(text){
        var t = String(text || '').trim();
        if (__fsDirect(t)) report(t, 'clipboard');
        return oc(text);
      };
    }
  } catch (e) {}
  return 'ok';
})();`;

/** Type a link into the explorer's search box (and optionally press "Duyệt"). */
const paste = (url, submit) => `(function(){
  ${BRIDGE}
  var link = ${JSON.stringify(url)};
  var filled = [];
  var nav = document.querySelector('#navInput');
  var hero = document.querySelector('#heroInput');
  if (nav) { __fsSetValue(nav, link); filled.push('nav box'); }
  if (hero && hero.offsetParent !== null) { __fsSetValue(hero, link); filled.push('main box'); }
  if (!filled.length) {
    var els = Array.prototype.slice.call(document.querySelectorAll('input[type=text],input[type=url],input:not([type]),textarea'));
    var el = els.filter(function(e){ return e.offsetParent !== null; })[0];
    if (!el) return 'no input box on this page';
    __fsSetValue(el, link);
    filled.push('input box');
  }
  if (${submit ? 'true' : 'false'}) {
    try {
      if (hero && hero.offsetParent !== null && typeof window.goFromHero === 'function') { window.goFromHero(); return filled.join(' + ') + ' + searched'; }
      if (typeof window.goFromNav === 'function') { window.goFromNav(); return filled.join(' + ') + ' + searched'; }
      var btn = document.querySelector('#heroBtn') || document.querySelector('#navBtn');
      if (btn) { btn.click(); return filled.join(' + ') + ' + searched'; }
    } catch (e) {}
  }
  return filled.join(' + ');
})();`;

/** Is this Fshare page signed in? */
const loginState = `(function(){
  if (document.querySelector('a[href*="/site/logout"]')) return 'logged-in';
  if (document.querySelector('#loginform-password, input[type=password]')) return 'logged-out';
  if (/\\/site\\/login/i.test(location.pathname)) return 'logged-out';
  return document.querySelector('a[href*="/site/login"]') ? 'logged-out' : 'unknown';
})();`;

/** Fill the two Fshare sign-in fields and submit. */
const login = (email, password) => `(function(){
  ${BRIDGE}
  if (document.querySelector('a[href*="/site/logout"]')) return 'logged-in';
  var pw = document.querySelector('#loginform-password') || document.querySelector('input[type=password]');
  if (!pw) return 'no-form';
  var onLoginPage = /\\/site\\/login/i.test(location.pathname);
  if (!onLoginPage && pw.offsetParent === null) return 'no-form';
  var form = pw.form || document.querySelector('#form-signup');
  var em = document.querySelector('#loginform-email')
        || (form && form.querySelector('input[type=email], input[name*="email" i], input[name*="user" i], input[type=text]'))
        || document.querySelector('input[type=email], input[name*="email" i]');
  if (!em) return 'no-email-field';
  __fsSetValue(em, ${JSON.stringify(email)});
  __fsSetValue(pw, ${JSON.stringify(password)});
  try { var rm = document.querySelector('#loginform-rememberme'); if (rm && !rm.checked) rm.click(); } catch (e) {}
  var btn = (form || document).querySelector('button[type=submit], input[type=submit]');
  if (btn) btn.click();
  else if (form) { if (form.requestSubmit) form.requestSubmit(); else form.submit(); }
  else return 'no-submit-button';
  return 'submitted';
})();`;

module.exports = { sheet, browse, fshare, paste, loginState, login };
