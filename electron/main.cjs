// @ts-check
delete process.env.ELECTRON_RUN_AS_NODE;

const { app, BrowserWindow, shell, ipcMain } = require("electron");
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
          if (res.statusCode === 200) {
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
    title: "Shree Royal Car - Business Management System",
    icon: path.join(__dirname, "..", "public", "logo.png"),
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

  // Open external links in user's default browser, keep local navigation inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
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
    // Setup IPC listeners for window management
    ipcMain.on("window-minimize", () => mainWindow?.minimize());
    ipcMain.on("window-maximize", () => {
      if (!mainWindow) return;
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    });
    ipcMain.on("window-close", () => mainWindow?.close());
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
        appUrl = await startStandaloneServer(port);
      }

      createMainWindow(appUrl);
    } catch (err) {
      console.error("[Electron] Fatal startup failure:", err);
      app.quit();
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
