const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const os = require('os');

let mainWindow;
let tray;
let workerProcess;

// ==================== CENTRAL SERVER URL ====================
// Supports multiple deployment methods:
// 1. Environment variable: CENTRAL_SERVER=https://your-server.com
// 2. Local discovery: Reads from config file if exists
// 3. Default fallback: https://sharingiscaring.onrender.com
const fs = require('fs');
let CENTRAL_SERVER = process.env.CENTRAL_SERVER;
let WORKER_URL_OVERRIDE = null;

if (!CENTRAL_SERVER) {
    try {
        const config = JSON.parse(fs.readFileSync(path.join(__dirname, '.server-config.json'), 'utf8'));
        CENTRAL_SERVER = config.serverUrl;
        WORKER_URL_OVERRIDE = config.workerUrl; // Can be null (auto-detect) or explicit URL
        console.log('[Config] Loaded server URL from .server-config.json');
        if (WORKER_URL_OVERRIDE) {
            console.log(`[Config] Using explicit worker URL: ${WORKER_URL_OVERRIDE}`);
        }
    } catch {
        CENTRAL_SERVER = 'https://sharingiscaring.onrender.com';
        console.log('[Config] Using default server URL');
    }
}

function getLocalIP() {
    const nets = os.networkInterfaces();
    // Virtual networks to skip (Docker, WSL, Hyper-V, VirtualBox, etc.)
    const virtualPrefixes = ['172.', '169.254', '127.', '10.0.8'];
    
    // Prioritize physical network interfaces
    const preferredNames = ['Ethernet', 'Wi-Fi', 'en0', 'en1', 'eth0', 'wlan0'];
    
    // First try preferred interfaces
    for (const name of preferredNames) {
        if (nets[name]) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal && !virtualPrefixes.some(p => net.address.startsWith(p))) {
                    console.log(`[Main] Using Network: ${name} (${net.address})`);
                    return net.address;
                }
            }
        }
    }
    
    // Fallback: check all interfaces, skip virtual networks
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal && !virtualPrefixes.some(p => net.address.startsWith(p))) {
                console.log(`[Main] Using Network: ${name} (${net.address})`);
                return net.address;
            }
        }
    }
    
    console.log('[Main] ⚠️ No physical network found, using localhost');
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

    // Load the central server dashboard directly
    console.log(`[Main] Connecting to central server: ${CENTRAL_SERVER}`);
    mainWindow.loadURL(CENTRAL_SERVER);

    // Handle load failures (server down, no internet)
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error(`[Main] Failed to load: ${errorDescription} (${errorCode})`);
        mainWindow.loadFile(path.join(__dirname, 'offline.html'));
    });

    mainWindow.on('close', (e) => {
        if (tray) {
            e.preventDefault();
            mainWindow.hide();
        }
    });
}

function startWorker() {
    if (workerProcess) return;

    const workerPort = '4000';
    
    // Use explicit URL from config if set, otherwise auto-detect
    let workerUrl = WORKER_URL_OVERRIDE;
    if (!workerUrl) {
        const localIP = getLocalIP();
        workerUrl = `http://${localIP}:${workerPort}`;
    }

    workerProcess = fork(path.join(__dirname, 'worker.js'), [], {
        silent: true,
        env: {
            ...process.env,
            SERVER_URL: CENTRAL_SERVER,
            WORKER_PORT: workerPort,
            WORKER_URL: workerUrl
        }
    });

    workerProcess.stdout.on('data', d => process.stdout.write(`[Worker] ${d}`));
    workerProcess.stderr.on('data', d => process.stderr.write(`[Worker ERR] ${d}`));
    
    let restartAttempts = 0;
    const maxRestarts = 10;
    const baseDelay = 5000; // 5 seconds
    
    workerProcess.on('exit', () => {
        workerProcess = null;
        restartAttempts++;
        
        const delay = Math.min(baseDelay * Math.pow(2, restartAttempts), 120000); // Max 2 minutes
        console.log(`[Main] Worker process exited (attempt ${restartAttempts}/${maxRestarts}), restarting in ${delay/1000}s...`);
        
        if (restartAttempts < maxRestarts) {
            setTimeout(startWorker, delay);
        } else {
            console.error('[Main] ❌ Worker failed to start after maximum retries. Check server connectivity.');
        }
    });

    console.log(`[Main] Worker started: ${workerUrl} -> ${CENTRAL_SERVER}`);
}

function resetWorkerRestarts() {
    // Reset restart attempts counter when connection succeeds
    console.log('[Main] Worker connection healthy');
}

function createTray() {
    const icon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABhSURBVFhH7c4xDQAgDETRsoDEYQVrOMEaFnCANRZgAtIhl/yVnzRNllIqstZ+cs8JOIETOIETOIETOIEThLXWsc/MOQfee4ecc4iIYa21SErpUkrpIiJSSqN775O11koR+QFU2Q8hm4gNaAAAAABJRU5ErkJggg=='
    );
    tray = new Tray(icon);
    tray.setToolTip('SharingIsCaring — Contributing Compute');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: `Server: ${CENTRAL_SERVER}`, enabled: false },
        { label: 'Show Dashboard', click: () => mainWindow.show() },
        { type: 'separator' },
        { label: 'Reconnect', click: () => {
            mainWindow.loadURL(CENTRAL_SERVER);
            if (!workerProcess) startWorker();
        }},
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

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

// ==================== APP LIFECYCLE ====================
app.whenReady().then(() => {
    createWindow();
    createTray();

    // Auto-start as worker — everyone contributes
    startWorker();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    if (workerProcess) workerProcess.kill();
    if (tray) { tray.destroy(); tray = null; }
});
