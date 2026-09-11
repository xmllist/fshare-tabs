'use strict';
// Runs inside every tab's page, in an isolated world.
// The page world talks to us with an `fs-bridge` DOM event; only we can reach IPC.
const { ipcRenderer } = require('electron');

document.addEventListener('fs-bridge', (event) => {
  try {
    const payload = JSON.parse(event.detail);
    if (payload && typeof payload === 'object') ipcRenderer.send('web-bridge', payload);
  } catch { /* ignore malformed messages */ }
});
