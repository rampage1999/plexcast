const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

let mainWindow = null;
let tray = null;
let serverProcess = null;

const SERVER_URL = 'http://localhost:8989';
const DEV_UI_URL = 'http://localhost:5173';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  const url = isDev ? DEV_UI_URL : `file://${path.join(__dirname, '../dist/index.html')}`;
  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open PlexCast',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'M3U Playlist URL',
      click: () => {
        shell.openExternal(`${SERVER_URL}/channels.m3u`);
      },
    },
    {
      label: 'EPG Guide URL',
      click: () => {
        shell.openExternal(`${SERVER_URL}/epg.xml`);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit PlexCast',
      click: () => {
        app.exit(0);
      },
    },
  ]);

  tray.setToolTip('PlexCast — Plex TV Channels');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

function startServer() {
  if (isDev) return; // In dev, server is started separately
  const serverPath = path.join(__dirname, '../server/index.js');
  serverProcess = spawn(process.execPath, [serverPath], {
    env: { ...process.env, NODE_ENV: 'production', DATA_DIR: app.getPath('userData') },
    stdio: 'ignore',
  });
}

// IPC handlers for window controls
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.hide());

app.whenReady().then(() => {
  // Set CSP headers on all responses
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      // Dev: allow Vite HMR (eval, inline scripts, websockets, localhost API + stream)
      ? "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws://localhost:* http://localhost:*; media-src 'self' blob: http://localhost:*; img-src 'self' data: http: https:"
      // Production: no eval needed
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' http://localhost:*; media-src 'self' blob: http://localhost:*; img-src 'self' data: http: https:";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  startServer();
  createWindow();
  createTray();

  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
  });
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});
