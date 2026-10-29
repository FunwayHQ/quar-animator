import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'node:path';

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // The editor holds the window while there are unsaved changes (beforeunload);
  // a browser asks then, and Electron leaves the asking to the app
  window.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question',
      buttons: ['Leave', 'Stay'],
      defaultId: 1,
      cancelId: 1,
      message: 'Leave without saving?',
      detail: 'Your unsaved changes will be lost.',
    });
    if (choice === 0) event.preventDefault();
  });

  if (app.isPackaged) {
    void window.loadFile(path.join(process.resourcesPath, 'web', 'index.html'));
  } else {
    void window.loadURL('http://localhost:3000');
  }
}

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
