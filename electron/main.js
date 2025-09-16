// @ts-nocheck
import { app, BrowserWindow, Menu, shell, dialog } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fixPath from 'fix-path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let serverApp;

const isDevelopment = process.env.NODE_ENV === 'development';

// Fix PATH environment for GUI-launched Electron apps
// This ensures npx and other shell commands are available
fixPath();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    icon: path.join(__dirname, '../public/favicon.ico'),
    titleBarStyle: 'default',
    show: false
  });

  // Maximize window to fill the screen
  mainWindow.maximize();
  mainWindow.show();

  if (isDevelopment) {
    // In development, connect to Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from our embedded server
    mainWindow.loadURL('http://localhost:3001');
    // Uncomment for debugging
    // mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorCode, errorDescription, 'URL:', validatedURL);
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const currentUrl = new URL(mainWindow.webContents.getURL());
    
    // If navigating to a different origin, open in external browser
    if (parsedUrl.origin !== currentUrl.origin) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startServer() {
  if (isDevelopment) {
    // In development, the server should already be running
    return;
  }

  try {
    console.log('Starting embedded server...');
    
    // Import the full server with all API routes
    const serverPath = path.join(__dirname, '../dist/server/server/index.js');
    const serverModule = await import(pathToFileURL(serverPath).href);
    const app = serverModule.default;
    
    if (!app || typeof app.listen !== 'function') {
      throw new Error('Server module did not export a valid Express app');
    }
    
    console.log('Starting full MindStrike server with all API routes');
    serverApp = app.listen(3001, () => {
      console.log('MindStrike server running on port 3001 with full functionality');
    });

    return serverApp;
  } catch (error) {
    console.error('Failed to start MindStrike server:', error);
    throw error;
  }
}

function stopServer() {
  if (serverApp) {
    serverApp.close();
    serverApp = null;
  }
}

app.whenReady().then(async () => {
  try {
    await startServer();
    
    // Give the server a moment to start, then create the window
    setTimeout(() => {
      createWindow();
    }, isDevelopment ? 0 : 1000);

  } catch (error) {
    console.error('Failed to start application:', error);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopServer();
});

// Function to show about dialog
function showAboutDialog() {
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'About MindStrike',
      message: 'MindStrike™',
      detail: `Version: 0.0.1
An agentic AI knowledge assistant

Copyright (c) 2025 MindStrike
Licensed under the MIT License
`,
      buttons: ['OK']
    });
  }
}

// Create application menu
function createMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{
      label: app.getName(),
      submenu: [
        { 
          label: 'About MindStrike',
          click: showAboutDialog
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    ...(!isMac ? [{
      label: 'Help',
      submenu: [
        {
          label: 'About MindStrike',
          click: showAboutDialog
        }
      ]
    }] : [])
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Hide menu bar
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
});
