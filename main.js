'use strict';

const { app, BrowserWindow, ipcMain, session, shell, clipboard, safeStorage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const INJECT = require('./inject.js');

const PARTITION = 'persist:fsharetabs';
const DEFAULT_SHEET =
  'https://docs.google.com/spreadsheets/d/16SY-Zdcq2KWP3w7fmwXKdKRQm27OuZcL/edit?pli=1&gid=1219962706#gid=1219962706';
const BROWSE_HOME = 'https://fshare.annnekkk.com/';
const FSHARE_HOME = 'https://www.fshare.vn/';
const FSHARE_LOGIN = 'https://www.fshare.vn/site/login';

const PANE = { SHEET: 0, BROWSE: 1, FSHARE: 2 };

let win = null;
/** role -> webContents of the matching <webview> */
const panes = {};
/** webContents.id -> role */
const roleById = new Map();

// ---------------------------------------------------------------- config ---

const configPath = () => path.join(app.getPath('userData'), 'config.json');

let config = {
  sheetUrl: DEFAULT_SHEET,
  email: '',
  password: '',      // kept in memory only; persisted encrypted
  passwordEnc: '',
  passwordPlain: '', // fallback when OS encryption is unavailable
  vlcPath: '',
  autoPlay: true,
  autoLogin: true,
  autoSubmit: true,
};

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    config = { ...config, ...raw };
  } catch { /* first run */ }

  if (config.passwordEnc) {
    try {
      config.password = safeStorage.decryptString(Buffer.from(config.passwordEnc, 'base64'));
    } catch (e) {
      config.password = '';
      log('warn', 'Could not decrypt the saved password (' + e.message + '). Re-enter it in Settings.');
    }
  } else if (config.passwordPlain) {
    config.password = config.passwordPlain;
  }
}

function saveConfig(patch) {
  Object.assign(config, patch);
  const out = {
    sheetUrl: config.sheetUrl,
    email: config.email,
    vlcPath: config.vlcPath,
    autoPlay: config.autoPlay,
    autoLogin: config.autoLogin,
    autoSubmit: config.autoSubmit,
    passwordEnc: '',
    passwordPlain: '',
  };
  if (config.password) {
    if (safeStorage.isEncryptionAvailable()) {
      out.passwordEnc = safeStorage.encryptString(config.password).toString('base64');
    } else {
      out.passwordPlain = config.password; // Linux without a keyring
    }
  }
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(out, null, 2), { mode: 0o600 });
  } catch (e) {
    log('error', 'Could not save settings: ' + e.message);
  }
  loginAttempts = 0;
}

function publicConfig() {
  return {
    sheetUrl: config.sheetUrl,
    email: config.email,
    hasPassword: !!config.password,
    vlcPath: config.vlcPath,
    autoPlay: config.autoPlay,
    autoLogin: config.autoLogin,
    autoSubmit: config.autoSubmit,
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    platform: process.platform,
  };
}

// ------------------------------------------------------------------- log ---

function log(level, message) {
  const line = { level, message, at: Date.now() };
  if (win && !win.isDestroyed()) win.webContents.send('log', line);
  const tag = level === 'error' ? 'ERR ' : level === 'warn' ? 'WARN' : 'INFO';
  console.log(`[${tag}] ${message}`);
}

function toRenderer(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// ------------------------------------------------------------ url helpers ---

const MEDIA_RE = /\.(mkv|mp4|avi|ts|m2ts|mov|wmv|flv|rmvb|m4v|mpg|mpeg|vob|iso|webm|m3u8)(\?|#|$)/i;

/** Google wraps sheet hyperlinks in https://www.google.com/url?q=<real> */
function unwrapRedirect(raw) {
  try {
    const u = new URL(raw);
    if (/(^|\.)google\.[a-z.]+$/i.test(u.hostname) && u.pathname === '/url') {
      const q = u.searchParams.get('q') || u.searchParams.get('url');
      if (q) return q;
    }
  } catch { /* not a URL */ }
  return raw;
}

function host(raw) {
  try { return new URL(raw).hostname.toLowerCase(); } catch { return ''; }
}

const isFshareLink = (u) => /(^|\.)fshare\.vn$/i.test(host(u));
const isFolderLink = (u) => isFshareLink(u) && /\/folder\//i.test(u);
const isFileLink   = (u) => isFshareLink(u) && /\/file\//i.test(u);
const isBrowseSite = (u) => /(^|\.)annnekkk\.com$/i.test(host(u));

/** A link VLC should stream rather than a page to render. */
function isDirectDownload(u) {
  if (!/^https?:/i.test(u)) return false;
  const h = host(u);
  if (/^download\d*\.fshare\.vn$/i.test(h)) return true;
  if (isFshareLink(u) && /\/dl\//i.test(u)) return true;
  return MEDIA_RE.test(u);
}

/** Last path component: the fshare link code. */
function linkCode(u) {
  try {
    const parts = new URL(u).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch { return ''; }
}

// ---------------------------------------------------------------- routing ---

const recent = new Map();
function isDuplicate(key, ms = 2000) {
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > 10000) recent.delete(k);
  if (recent.has(key) && now - recent.get(key) < ms) return true;
  recent.set(key, now);
  return false;
}

function loadInPane(role, url) {
  const wc = panes[role];
  if (!wc || wc.isDestroyed()) {
    log('error', `Tab ${role + 1} is not ready yet.`);
    return;
  }
  wc.loadURL(url);
  toRenderer('select-pane', role);
}

/** Tab 1: an fshare link was clicked in the Google Sheet. */
function handleSheetLink(rawUrl, source) {
  const url = unwrapRedirect(rawUrl);
  if (isDuplicate('sheet:' + url)) return;
  log('info', `Tab 1 → fshare link clicked [${source}]: ${url}`);

  if (isFileLink(url)) {
    // The explorer only browses folders, so a single file goes straight to tab 3.
    log('info', 'It is a file link → sending straight to tab 3 (Fshare).');
    loadInPane(PANE.FSHARE, url);
    return;
  }

  const code = isFolderLink(url) ? linkCode(url) : '';
  if (code) {
    const target = BROWSE_HOME + encodeURIComponent(code);
    log('info', `Opening the folder in tab 2: ${target}`);
    pendingPaste[PANE.BROWSE] = url;      // also shown in the site's own input box
    loadInPane(PANE.BROWSE, target);
  } else {
    log('info', 'Pasting the link into the tab 2 search box.');
    pendingPaste[PANE.BROWSE] = url;
    loadInPane(PANE.BROWSE, BROWSE_HOME);
  }
}

/** Tab 2: the user picked one file in the folder explorer. */
function handleChosenLink(rawUrl, source) {
  const url = unwrapRedirect(rawUrl);
  if (isDuplicate('chosen:' + url)) return;

  if (isDirectDownload(url)) {
    log('info', `Tab 2 → direct link picked, streaming it.`);
    playInVLC(url, 'tab 2');
    return;
  }
  log('info', `Tab 2 → file picked [${source}]: ${url}`);
  loadInPane(PANE.FSHARE, url);
}

/** Tab 3 (or anywhere): a real download URL surfaced. */
function handleDownloadUrl(url, source) {
  if (!url || !/^https?:/i.test(url)) return;
  if (isDuplicate('dl:' + url, 8000)) return;
  log('info', `Download link captured (${source}): ${url}`);
  toRenderer('download-captured', url);
  try { clipboard.writeText(url); } catch { /* ignore */ }
  if (config.autoPlay) playInVLC(url, source);
  else log('info', 'Auto-play is off — the link is on the clipboard.');
}

// -------------------------------------------------------------------- VLC ---

function vlcCandidates() {
  const list = [];
  if (config.vlcPath) list.push(config.vlcPath);
  if (process.platform === 'win32') {
    list.push(
      'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
      'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs\\VideoLAN\\VLC\\vlc.exe')
    );
  } else if (process.platform === 'darwin') {
    list.push('/Applications/VLC.app/Contents/MacOS/VLC',
              path.join(app.getPath('home'), 'Applications/VLC.app/Contents/MacOS/VLC'));
  } else {
    list.push('/usr/bin/vlc', '/usr/local/bin/vlc', '/snap/bin/vlc');
  }
  return list.filter(Boolean);
}

function playInVLC(url, source) {
  const exe = vlcCandidates().find((p) => { try { return fs.existsSync(p); } catch { return false; } });
  const args = [url];
  const opts = { detached: true, stdio: 'ignore' };

  const done = (how) => { log('info', `▶ VLC launched (${how}) for the ${source} link.`); toRenderer('played', url); };
  const fail = (e) => {
    log('error', `Could not start VLC: ${e.message}. The link is on your clipboard — open it with VLC → File → Open Network.`);
    toRenderer('vlc-missing', url);
  };

  try {
    if (exe) {
      const child = spawn(exe, args, opts);
      child.on('error', fail);
      child.unref();
      done(exe);
      return;
    }
    // No known install path: fall back to the platform launcher.
    if (process.platform === 'darwin') {
      const child = spawn('open', ['-a', 'VLC', url], opts);
      child.on('error', fail);
      child.unref();
      done('open -a VLC');
    } else if (process.platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', '', 'vlc', url], { ...opts, windowsHide: true });
      child.on('error', fail);
      child.unref();
      done('start vlc');
    } else {
      const child = spawn('vlc', args, opts);
      child.on('error', fail);
      child.unref();
      done('vlc');
    }
  } catch (e) { fail(e); }
}

// ------------------------------------------------------- webview plumbing ---

const pendingPaste = {};   // role -> url to type into the page after it loads
let loginAttempts = 0;

function roleOf(contents) {
  return roleById.has(contents.id) ? roleById.get(contents.id) : null;
}

function runInAllFrames(contents, script) {
  try {
    contents.mainFrame.framesInSubtree.forEach((frame) => {
      frame.executeJavaScript(script, true).catch(() => {});
    });
  } catch {
    contents.executeJavaScript(script, true).catch(() => {});
  }
}

function attachWebview(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    const role = roleOf(contents);
    const target = unwrapRedirect(url);
    if (role === PANE.SHEET) {
      if (isFshareLink(target)) handleSheetLink(target, 'popup');
      else { log('info', `Opening ${target} in your default browser.`); shell.openExternal(target); }
    } else if (role === PANE.BROWSE) {
      if (isFshareLink(target) || isDirectDownload(target)) handleChosenLink(target, 'popup');
      else shell.openExternal(target);
    } else if (role === PANE.FSHARE) {
      if (isDirectDownload(target)) handleDownloadUrl(target, 'popup');
      else contents.loadURL(target);
    } else {
      shell.openExternal(target);
    }
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    const role = roleOf(contents);
    const target = unwrapRedirect(url);
    if (role === PANE.SHEET && isFshareLink(target)) {
      event.preventDefault();
      handleSheetLink(target, 'navigation');
    } else if (role === PANE.BROWSE && (isFshareLink(target) || isDirectDownload(target))) {
      event.preventDefault();
      handleChosenLink(target, 'navigation');
    } else if (isDirectDownload(target)) {
      event.preventDefault();
      handleDownloadUrl(target, 'navigation');
    }
  });

  contents.on('dom-ready', () => {
    const role = roleOf(contents);
    if (role === null) return;
    const url = contents.getURL();

    if (role === PANE.SHEET) {
      runInAllFrames(contents, INJECT.sheet);
    } else if (role === PANE.BROWSE) {
      contents.executeJavaScript(INJECT.browse, true).catch(() => {});
      const paste = pendingPaste[PANE.BROWSE];
      if (paste) {
        delete pendingPaste[PANE.BROWSE];
        contents
          .executeJavaScript(INJECT.paste(paste, config.autoSubmit && isBrowseSite(url) && new URL(url).pathname === '/'), true)
          .then((r) => log('info', `Tab 2: pasted the link (${r}).`))
          .catch((e) => log('warn', 'Tab 2: could not paste the link — ' + e.message));
      }
    } else if (role === PANE.FSHARE) {
      contents.executeJavaScript(INJECT.fshare, true).catch(() => {});
      handleFsharePage(contents);
    }
  });

  contents.on('page-title-updated', (_e, title) => {
    const role = roleOf(contents);
    if (role !== null) toRenderer('pane-title', { role, title });
  });
}

let returnTo = null;

/**
 * Keep tab 3 signed in: if a page loads signed out and credentials are stored,
 * detour through the sign-in page and come back to where the user was heading.
 */
function handleFsharePage(contents) {
  contents.executeJavaScript(INJECT.loginState, true).then((state) => {
    const url = contents.getURL();
    const onLoginPage = /\/site\/login/i.test(url);
    toRenderer('login-state', state);

    if (state === 'logged-in') {
      loginAttempts = 0;
      if (returnTo && onLoginPage) {
        const back = returnTo;
        returnTo = null;
        log('info', 'Tab 3: signed in — returning to the file page.');
        contents.loadURL(back);
      }
      return;
    }
    if (state !== 'logged-out') return;
    if (!config.autoLogin || !config.email || !config.password) {
      if (!config.email || !config.password) log('warn', 'Tab 3: not signed in — add your Fshare account in Settings.');
      return;
    }
    if (loginAttempts >= 2) {
      log('warn', 'Tab 3: sign-in did not take after 2 tries — check your credentials, then press "Sign in".');
      return;
    }
    if (onLoginPage) {
      maybeLogin(contents, false);
    } else {
      returnTo = url;
      log('info', 'Tab 3: not signed in — opening the Fshare sign-in page.');
      contents.loadURL(FSHARE_LOGIN);
    }
  }).catch(() => {});
}

function maybeLogin(contents, force) {
  if (!config.email || !config.password) {
    if (force) log('warn', 'Add your Fshare e-mail and password in Settings first.');
    return;
  }
  if (!force && loginAttempts >= 2) return;
  contents
    .executeJavaScript(INJECT.login(config.email, config.password), true)
    .then((result) => {
      if (result === 'submitted') {
        loginAttempts += 1;
        log('info', 'Tab 3: signing in to Fshare…');
      } else if (result === 'logged-in') {
        loginAttempts = 0;
        log('info', 'Tab 3: already signed in to Fshare.');
      } else if (force) {
        log('warn', 'Tab 3: no sign-in form on this page.');
      }
    })
    .catch((e) => log('warn', 'Tab 3: sign-in script failed — ' + e.message));
}

// ------------------------------------------------------------------ setup ---

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    title: 'Fshare Tabs',
    backgroundColor: '#14161a',
    webPreferences: {
      preload: path.join(__dirname, 'preload-host.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: false,
    },
  });
  // Force safe webview settings and give every tab the bridge preload.
  win.webContents.on('will-attach-webview', (_e, webPreferences) => {
    webPreferences.preload = path.join(__dirname, 'preload-web.js');
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
  });

  // Tabs attach in DOM order, so this is the authoritative pane numbering.
  let attachIndex = 0;
  win.webContents.on('did-attach-webview', (_e, contents) => {
    const role = attachIndex++;
    if (role <= PANE.FSHARE) { roleById.set(contents.id, role); panes[role] = contents; }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  // Look like plain Chrome: Google refuses to sign you in to an "Electron" browser.
  app.userAgentFallback = app.userAgentFallback
    .replace(/\sElectron\/[\d.]+/, '')
    .replace(/\sFshare Tabs\/[\d.]+/, '');

  loadConfig();

  const sess = session.fromPartition(PARTITION);
  sess.setUserAgent(app.userAgentFallback);
  sess.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'clipboard-sanitized-write'));

  sess.on('will-download', (event, item) => {
    const url = item.getURL();
    event.preventDefault();          // stream it instead of saving it
    handleDownloadUrl(url, 'download');
  });

  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() === 'webview') attachWebview(contents);
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// -------------------------------------------------------------------- IPC ---

ipcMain.handle('get-config', () => publicConfig());

ipcMain.handle('save-config', (_e, patch) => {
  const clean = { ...patch };
  if (clean.password === undefined || clean.password === null) delete clean.password;
  saveConfig(clean);
  log('info', 'Settings saved.');
  return publicConfig();
});

ipcMain.handle('register-pane', (_e, { role, webContentsId }) => {
  roleById.set(webContentsId, role);
  const wc = require('electron').webContents.fromId(webContentsId);
  if (wc) panes[role] = wc;
  console.log(`[INFO] pane ${role} = webContents ${webContentsId} (${wc ? wc.getURL().slice(0, 60) : 'missing'})`);
  return true;
});

ipcMain.handle('boot-urls', () => ({
  sheet: config.sheetUrl,
  browse: BROWSE_HOME,
  fshare: FSHARE_HOME,
}));

ipcMain.handle('login-now', () => {
  const wc = panes[PANE.FSHARE];
  if (!wc) return false;
  loginAttempts = 0;
  const url = wc.getURL();
  if (!/fshare\.vn/i.test(url)) {
    wc.loadURL(FSHARE_LOGIN);
    log('info', 'Tab 3: opening the Fshare sign-in page…');
    wc.once('dom-ready', () => maybeLogin(wc, true));
  } else {
    maybeLogin(wc, true);
  }
  toRenderer('select-pane', PANE.FSHARE);
  return true;
});

ipcMain.handle('open-login-page', () => {
  const wc = panes[PANE.FSHARE];
  if (wc) { loginAttempts = 0; wc.loadURL(FSHARE_LOGIN); toRenderer('select-pane', PANE.FSHARE); }
  return true;
});

ipcMain.handle('play-url', (_e, url) => { playInVLC(url, 'manual'); return true; });

ipcMain.handle('copy-text', (_e, text) => { clipboard.writeText(text || ''); return true; });

ipcMain.handle('pick-vlc', async () => {
  const filters = process.platform === 'win32'
    ? [{ name: 'VLC', extensions: ['exe'] }]
    : process.platform === 'darwin'
      ? [{ name: 'Applications', extensions: ['app'] }]
      : [];
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  if (r.canceled || !r.filePaths[0]) return config.vlcPath;
  let p = r.filePaths[0];
  if (process.platform === 'darwin' && p.endsWith('.app')) p = path.join(p, 'Contents/MacOS/VLC');
  saveConfig({ vlcPath: p });
  return p;
});

// Bridge from the injected page scripts (via preload-web.js).
ipcMain.on('web-bridge', (event, payload) => {
  const role = roleById.get(event.sender.id);
  if (!payload || typeof payload !== 'object') return;
  const url = unwrapRedirect(String(payload.url || ''));
  if (!/^https?:/i.test(url)) return;

  switch (payload.type) {
    case 'sheetLink':  if (role === PANE.SHEET) handleSheetLink(url, 'page'); break;
    case 'chosenLink': if (role === PANE.BROWSE) handleChosenLink(url, 'page'); break;
    case 'download':   handleDownloadUrl(url, payload.via || 'page'); break;
    default: break;
  }
});
