// @ts-check
delete process.env.ELECTRON_RUN_AS_NODE;

const { app, BrowserWindow, shell, ipcMain, Menu } = require("electron");
const path = require("path");
const http = require("http");
const net = require("net");
const { fork } = require("child_process");
const fs = require("fs");

let mainWindow = null;
let serverProcess = null;

const isDev = !app.isPackaged && process.env.NODE_ENV === "development";

/**
 * Finds an available TCP port starting from the given preferred port.
 * @param {number} startPort
 * @returns {Promise<number>}
 */
function findFreePort(startPort = 3000) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : startPort;
      server.close(() => resolve(port));
    });
    server.on("error", () => {
      // If preferred port is taken, ask OS for any random available port (0)
      const fallbackServer = net.createServer();
      fallbackServer.listen(0, "127.0.0.1", () => {
        const address = fallbackServer.address();
        const port = typeof address === "object" && address ? address.port : 3001;
        fallbackServer.close(() => resolve(port));
      });
    });
  });
}

/**
 * Polls an HTTP endpoint until it returns 200 or times out.
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function waitForServer(url, timeoutMs = 30000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    function ping() {
      http
        .get(url, (res) => {
          // Any HTTP status between 200 and 499 confirms the local server is listening and responding
          if (res.statusCode >= 200 && res.statusCode < 500) {
            resolve();
          } else {
            retry();
          }
        })
        .on("error", () => retry());
    }

    function retry() {
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Server at ${url} did not respond within ${timeoutMs}ms`));
      } else {
        setTimeout(ping, 250);
      }
    }

    ping();
  });
}

/**
 * Locates the standalone server.js in production or dev modes.
 * @returns {string}
 */
function getStandaloneServerPath() {
  if (app.isPackaged) {
    const unpacked = path.join(process.resourcesPath, "app.asar.unpacked", ".next", "standalone", "server.js");
    if (fs.existsSync(unpacked)) {
      return unpacked;
    }
    return path.join(process.resourcesPath, "app", ".next", "standalone", "server.js");
  }
  return path.join(__dirname, "..", ".next", "standalone", "server.js");
}

/**
 * Starts the embedded Next.js standalone server if needed.
 * @param {number} port
 * @returns {Promise<string>} baseUrl
 */
async function startStandaloneServer(port) {
  const serverPath = getStandaloneServerPath();
  console.log(`[Electron] Launching Next.js standalone server at: ${serverPath} on port ${port}`);

  const childEnv = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
  };

  serverProcess = fork(serverPath, [], {
    cwd: path.dirname(serverPath),
    env: childEnv,
    stdio: "ignore",
  });

  serverProcess.on("exit", (code, signal) => {
    console.log(`[Next.js Server] Exited with code=${code} signal=${signal}`);
    serverProcess = null;
  });

  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  await waitForServer(healthUrl, 30000);
  return `http://127.0.0.1:${port}`;
}

/**
 * Creates the primary application window.
 * @param {string} startUrl
 */
function createMainWindow(startUrl) {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 868,
    minWidth: 1024,
    minHeight: 700,
    title: "Cars - Business Management System",
    autoHideMenuBar: true,
    show: false,
    backgroundColor: "#0B1120",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.loadURL(startUrl);

  // Strictly allow local navigation inside Electron, open external URLs safely in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (
        (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
        (parsed.protocol === "http:" || parsed.protocol === "https:")
      ) {
        return { action: "allow" };
      }
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        shell.openExternal(url);
      }
    } catch {
      // Invalid URL - deny
    }
    return { action: "deny" };
  });

  // Guard against untrusted external navigation inside the main window
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      const isLocal =
        (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
        (parsed.protocol === "http:" || parsed.protocol === "https:");
      if (!isLocal) {
        event.preventDefault();
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          shell.openExternal(navigationUrl);
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  // Prevent webview creation
  mainWindow.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function setupApplicationMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Print Bill / Screen",
          accelerator: "CmdOrCtrl+P",
          click: () => mainWindow?.webContents.print(),
        },
        { type: "separator" },
        { role: "quit", label: "Exit Cars" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload", accelerator: "CmdOrCtrl+R" },
        { role: "forceReload", accelerator: "CmdOrCtrl+Shift+R" },
        { type: "separator" },
        { role: "togglefullscreen", accelerator: "F11" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "toggleDevTools", accelerator: "F12" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Cars",
          click: () => {
            const { dialog } = require("electron");
            if (mainWindow) {
              dialog.showMessageBox(mainWindow, {
                type: "info",
                title: "About Cars",
                message: `Cars - Business Management System\nVersion: ${app.getVersion()}\nDesktop Platform: ${process.platform} (${process.arch})\nOffline-capable Desktop Application`,
              });
            }
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    setupApplicationMenu();

    // Setup IPC listeners for window management
    ipcMain.on("window-minimize", () => mainWindow?.minimize());
    ipcMain.on("window-maximize", () => {
      if (!mainWindow) return;
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    });
    ipcMain.on("window-close", () => mainWindow?.close());
    ipcMain.on("window-print", () => mainWindow?.webContents.print());
    ipcMain.handle("get-app-version", () => app.getVersion());

    try {
      let appUrl;
      if (isDev) {
        appUrl = process.env.ELECTRON_DEV_URL || "http://localhost:3000";
        console.log(`[Electron] Development mode -> loading ${appUrl}`);
        await waitForServer(`${appUrl}/api/health`, 30000).catch(() => {
          console.warn("[Electron] Dev health check did not respond, loading directly.");
        });
      } else {
        const port = await findFreePort(3000);
        appUrl = await startStandaloneServer(port).catch((err) => {
          console.warn("[Electron] Standalone server health check warning, loading anyway:", err.message);
          return `http://127.0.0.1:${port}`;
        });
      }

      createMainWindow(appUrl);
    } catch (err) {
      console.error("[Electron] Startup failure:", err);
      // Fallback: try opening default local port instead of quitting immediately
      createMainWindow("http://127.0.0.1:3000");
    }
  });

  function cleanupServer() {
    if (serverProcess) {
      console.log("[Electron] Stopping Next.js server process...");
      try {
        serverProcess.kill();
      } catch (e) {
        // Ignored
      }
      serverProcess = null;
    }
  }

  app.on("before-quit", cleanupServer);
  app.on("will-quit", cleanupServer);
  process.on("exit", cleanupServer);

  app.on("window-all-closed", () => {
    cleanupServer();
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
