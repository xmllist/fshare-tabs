'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['log', 'select-pane', 'download-captured', 'played', 'vlc-missing', 'pane-title', 'login-state'];

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (patch) => ipcRenderer.invoke('save-config', patch),
  registerPane: (role, webContentsId) => ipcRenderer.invoke('register-pane', { role, webContentsId }),
  bootUrls: () => ipcRenderer.invoke('boot-urls'),
  loginNow: () => ipcRenderer.invoke('login-now'),
  openLoginPage: () => ipcRenderer.invoke('open-login-page'),
  playUrl: (url) => ipcRenderer.invoke('play-url', url),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  pickVlc: () => ipcRenderer.invoke('pick-vlc'),
  on: (channel, fn) => {
    if (EVENTS.includes(channel)) ipcRenderer.on(channel, (_e, data) => fn(data));
  },
});
