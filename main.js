const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const os = require('os');

let mainWindow;
let tray;
let serverProcess;
let workerProcess;
let appMode = null; // 'server' or 'client'
let remoteServerIP = null;

function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal && net.address.startsWith('192.168.')) {
                return net.address;
            }
        }
    }
    // Fallback to any non-internal IPv4
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        backgroundColor: '#060612',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Load the setup page first
    mainWindow.loadFile(path.join(__dirname, 'setup.html'));

    mainWindow.on('close', (e) => {
        if (tray) {
            e.preventDefault();
            mainWindow.hide();
        }
    });
}

function startServer() {
    return new Promise((resolve, reject) => {
        serverProcess = fork(path.join(__dirname, 'server.js'), [], { silent: true });

        const timeout = setTimeout(() => resolve(), 5000);

        serverProcess.stdout.on('data', (data) => {
            const msg = data.toString();
            process.stdout.write(`[Server] ${msg}`);
            if (msg.includes('SERVER_READY')) {
                clearTimeout(timeout);
                resolve();
            }
        });

        serverProcess.stderr.on('data', (data) => {
            process.stderr.write(`[Server ERR] ${data}`);
        });

        serverProcess.on('error', reject);
    });
}

function startWorker(serverUrl) {
    if (workerProcess) return;

    const localIP = getLocalIP();
    const workerPort = '4000';
    const workerUrl = `http://${localIP}:${workerPort}`;

    workerProcess = fork(path.join(__dirname, 'worker.js'), [], {
        silent: true,
        env: {
            ...process.env,
            SERVER_URL: serverUrl,
            WORKER_PORT: workerPort,
            WORKER_URL: workerUrl
        }
    });

    workerProcess.stdout.on('data', d => process.stdout.write(`[Worker] ${d}`));
    workerProcess.stderr.on('data', d => process.stderr.write(`[Worker ERR] ${d}`));
    workerProcess.on('exit', () => {
        workerProcess = null;
        if (mainWindow) mainWindow.webContents.send('worker-status', false);
    });

    console.log(`[Main] Worker started: ${workerUrl} -> ${serverUrl}`);
}

function createTray() {
    const icon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABhSURBVFhH7c4xDQAgDETRsoDEYQVrOMEaFnCANRZgAtIhl/yVnzRNllIqstZ+cs8JOIETOIETOIETOIEThLXWsc/MOQfee4ecc4iIYa21SErpUkrpIiJSSqN775O11koR+QFU2Q8hm4gNaAAAAABJRU5ErkJggg=='
    );
    tray = new Tray(icon);
    const modeLabel = appMode === 'server' ? 'Mode: Server' : `Mode: Client → ${remoteServerIP}`;
    tray.setToolTip('SharingIsCaring - Compute Sharing');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: modeLabel, enabled: false },
        { label: 'Show', click: () => mainWindow.show() },
        { type: 'separator' },
        { label: 'Quit', click: () => { tray.destroy(); tray = null; app.quit(); } }
    ]));
    tray.on('double-click', () => mainWindow.show());
}

// ==================== IPC HANDLERS ====================
ipcMain.handle('get-system-info', () => ({
    cpuCores: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'Unknown',
    totalMemory: Math.round(os.totalmem() / (1024 ** 3)),
    freeMemory: Math.round(os.freemem() / (1024 ** 3)),
    platform: os.platform(),
    hostname: os.hostname()
}));

ipcMain.handle('get-app-mode', () => ({
    mode: appMode,
    remoteIP: remoteServerIP,
    localIP: getLocalIP()
}));

// Setup mode selection from the setup page
ipcMain.handle('select-mode', async (event, mode, ip) => {
    appMode = mode;

    if (mode === 'server') {
        // Start local server, then load the dashboard from it
        console.log('[Main] Starting in SERVER mode');
        await startServer();
        const localIP = getLocalIP();
        console.log(`[Main] Server running. Local IP: ${localIP}`);
        mainWindow.loadURL('http://localhost:3000');

        // Auto-start worker connecting to own server
        startWorker('http://localhost:3000');

        createTray();
        return { success: true, localIP };

    } else if (mode === 'client') {
        remoteServerIP = ip;
        const serverUrl = `http://${ip}:3000`;
        console.log(`[Main] Starting in CLIENT mode -> ${serverUrl}`);

        // Don't start local server — load the remote dashboard
        mainWindow.loadURL(serverUrl);

        // Start worker connecting to remote server
        startWorker(serverUrl);

        createTray();
        return { success: true };
    }
});

ipcMain.handle('toggle-worker', (event, start) => {
    if (appMode === 'server') {
        const serverUrl = 'http://localhost:3000';
        if (start && !workerProcess) {
            startWorker(serverUrl);
            return { status: 'started' };
        } else if (!start && workerProcess) {
            workerProcess.kill();
            workerProcess = null;
            return { status: 'stopped' };
        }
    } else if (appMode === 'client') {
        const serverUrl = `http://${remoteServerIP}:3000`;
        if (start && !workerProcess) {
            startWorker(serverUrl);
            return { status: 'started' };
        } else if (!start && workerProcess) {
            workerProcess.kill();
            workerProcess = null;
            return { status: 'stopped' };
        }
    }
    return { status: start ? 'already-running' : 'already-stopped' };
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

// ==================== APP LIFECYCLE ====================
app.whenReady().then(async () => {
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    if (serverProcess) serverProcess.kill();
    if (workerProcess) workerProcess.kill();
    if (tray) { tray.destroy(); tray = null; }
});
