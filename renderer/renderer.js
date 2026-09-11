'use strict';

const panes = [document.getElementById('pane0'), document.getElementById('pane1'), document.getElementById('pane2')];
const tabs = Array.from(document.querySelectorAll('.tab'));
const addr = document.getElementById('addr');
const loader = document.getElementById('loader');
const logEl = document.getElementById('log');
const lastLink = document.getElementById('lastLink');
const playBtn = document.getElementById('playBtn');
const copyBtn = document.getElementById('copyBtn');
const loginPill = document.getElementById('loginPill');
const dlg = document.getElementById('settings');

let active = 0;
let homes = ['about:blank', 'about:blank', 'about:blank'];
let cfg = {};

// ------------------------------------------------------------------- tabs ---

function select(n) {
  active = n;
  panes.forEach((p, i) => p.classList.toggle('active', i === n));
  tabs.forEach((t, i) => t.classList.toggle('active', i === n));
  syncToolbar();
}
tabs.forEach((t) => t.addEventListener('click', () => select(Number(t.dataset.pane))));

function current() { return panes[active]; }

function syncToolbar() {
  const wv = current();
  try {
    addr.value = wv.getURL() === 'about:blank' ? '' : wv.getURL();
    loader.hidden = !wv.isLoading();
    document.getElementById('backBtn').disabled = !wv.canGoBack();
    document.getElementById('fwdBtn').disabled = !wv.canGoForward();
  } catch { /* not attached yet */ }
}

document.getElementById('backBtn').addEventListener('click', () => current().goBack());
document.getElementById('fwdBtn').addEventListener('click', () => current().goForward());
document.getElementById('reloadBtn').addEventListener('click', () => current().reload());
document.getElementById('homeBtn').addEventListener('click', () => current().loadURL(homes[active]));
document.getElementById('goBtn').addEventListener('click', go);
addr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

function go() {
  let v = addr.value.trim();
  if (!v) return;
  if (!/^[a-z]+:\/\//i.test(v)) v = 'https://' + v;
  current().loadURL(v);
}

// -------------------------------------------------------------------- log ---

function addLog(line) {
  const li = document.createElement('li');
  if (line.level && line.level !== 'info') li.className = line.level;
  const t = document.createElement('span');
  t.className = 't';
  t.textContent = new Date(line.at || Date.now()).toLocaleTimeString();
  li.appendChild(t);
  li.appendChild(document.createTextNode(line.message));
  logEl.appendChild(li);
  while (logEl.children.length > 300) logEl.removeChild(logEl.firstChild);
  logEl.scrollTop = logEl.scrollHeight;
}

document.getElementById('logBtn').addEventListener('click', () => { logEl.hidden = !logEl.hidden; });

// ---------------------------------------------------------------- webviews ---

// A <webview> only accepts loadURL once it has attached, and the boot URLs
// arrive over IPC — so wait for both before loading each tab.
const attached = [false, false, false];
const loaded = [false, false, false];
let bootReady = false;

function loadHome(role) {
  if (!attached[role] || !bootReady || loaded[role]) return;
  loaded[role] = true;
  panes[role].loadURL(homes[role]);
}

/** did-attach is not fired reliably for background tabs, so poll instead. */
function whenAttached(wv, role, tries) {
  let id = null;
  try { id = wv.getWebContentsId(); } catch { id = null; }
  if (id) {
    window.api.registerPane(role, id);
    attached[role] = true;
    loadHome(role);
    return;
  }
  if ((tries || 0) > 200) { addLog({ level: 'error', message: `Tab ${role + 1} failed to initialise.` }); return; }
  setTimeout(() => whenAttached(wv, role, (tries || 0) + 1), 50);
}

panes.forEach((wv, role) => {
  wv.addEventListener('did-attach', () => {
    window.api.registerPane(role, wv.getWebContentsId());
    attached[role] = true;
    loadHome(role);
  });
  wv.addEventListener('did-start-loading', () => { if (role === active) loader.hidden = false; });
  wv.addEventListener('did-stop-loading', () => { if (role === active) { loader.hidden = true; syncToolbar(); } });
  wv.addEventListener('did-navigate', () => { if (role === active) syncToolbar(); });
  wv.addEventListener('did-navigate-in-page', () => { if (role === active) syncToolbar(); });
  wv.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3 || e.errorCode === 0) return; // aborted, e.g. a link we intercepted
    addLog({ level: 'error', message: `Tab ${role + 1}: ${e.errorDescription || 'load failed'} (${e.validatedURL || ''})` });
  });
});

// -------------------------------------------------------------- main events ---

window.api.on('log', addLog);
window.api.on('select-pane', (n) => select(n));
window.api.on('pane-title', ({ role, title }) => { tabs[role].title = title || ''; });
window.api.on('download-captured', (url) => {
  lastLink.value = url;
  playBtn.disabled = false;
  copyBtn.disabled = false;
});
window.api.on('vlc-missing', () => { logEl.hidden = false; });
window.api.on('login-state', (state) => {
  loginPill.textContent = state === 'logged-in' ? 'Fshare: signed in'
    : state === 'logged-out' ? 'Fshare: signed out' : 'Fshare: unknown';
  loginPill.className = 'pill ' + (state === 'logged-in' ? 'in' : state === 'logged-out' ? 'out' : '');
});

playBtn.addEventListener('click', () => { if (lastLink.value) window.api.playUrl(lastLink.value); });
copyBtn.addEventListener('click', () => { if (lastLink.value) window.api.copyText(lastLink.value); });
document.getElementById('signInBtn').addEventListener('click', () => window.api.loginNow());

// ---------------------------------------------------------------- settings ---

document.getElementById('settingsBtn').addEventListener('click', async () => {
  cfg = await window.api.getConfig();
  document.getElementById('setEmail').value = cfg.email || '';
  document.getElementById('setPassword').value = '';
  document.getElementById('setPassword').placeholder = cfg.hasPassword ? '(unchanged)' : 'password';
  document.getElementById('setSheet').value = cfg.sheetUrl || '';
  document.getElementById('setVlc').value = cfg.vlcPath || '';
  document.getElementById('setAutoPlay').checked = !!cfg.autoPlay;
  document.getElementById('setAutoLogin').checked = !!cfg.autoLogin;
  document.getElementById('setAutoSubmit').checked = !!cfg.autoSubmit;
  document.getElementById('cryptoHint').textContent = cfg.encryptionAvailable
    ? 'Stored encrypted with your operating system keychain.'
    : 'Warning: no OS keychain available — the password is saved as plain text in the app folder.';
  dlg.showModal();
});

document.getElementById('pickVlcBtn').addEventListener('click', async () => {
  const p = await window.api.pickVlc();
  if (p) document.getElementById('setVlc').value = p;
});

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  if (e.submitter && e.submitter.value !== 'save') return;
  const patch = {
    email: document.getElementById('setEmail').value.trim(),
    sheetUrl: document.getElementById('setSheet').value.trim(),
    vlcPath: document.getElementById('setVlc').value.trim(),
    autoPlay: document.getElementById('setAutoPlay').checked,
    autoLogin: document.getElementById('setAutoLogin').checked,
    autoSubmit: document.getElementById('setAutoSubmit').checked,
  };
  const pw = document.getElementById('setPassword').value;
  if (pw) patch.password = pw;
  const before = cfg.sheetUrl;
  cfg = await window.api.saveConfig(patch);
  if (cfg.sheetUrl && cfg.sheetUrl !== before) { homes[0] = cfg.sheetUrl; panes[0].loadURL(cfg.sheetUrl); }
  addLog({ level: 'info', message: 'Settings saved.' });
});

// -------------------------------------------------------------------- boot ---

(async () => {
  const urls = await window.api.bootUrls();
  homes = [urls.sheet, urls.browse, urls.fshare];
  bootReady = true;
  panes.forEach((wv, i) => whenAttached(wv, i, 0));
  cfg = await window.api.getConfig();
  select(0);
  addLog({ level: 'info', message: 'Ready. Click an Fshare link in the sheet to start.' });
  if (!cfg.email || !cfg.hasPassword) {
    addLog({ level: 'warn', message: 'No Fshare account saved yet — open Settings and add your e-mail and password.' });
  }
})();
