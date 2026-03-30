const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const os = require('os');

let mainWindow;
let tray;
let serverProcess;
let workerProcess;

// Set custom user data path to avoid cache access issues in shared environments
const userDataPath = path.join(__dirname, '.electron_data');
app.setPath('userData', userDataPath);
app.setPath('sessionData', path.join(userDataPath, 'session'));

const fs = require('fs');
let CENTRAL_SERVER = 'https://shimmerbodylotion-wt.onrender.com'; // Default fallback

// Read central server URL from config if exists
try {
    const configPath = path.join(__dirname, '.server-config.json');
    if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.serverUrl) {
            CENTRAL_SERVER = config.serverUrl;
            console.log(`[Main] Using central server from config: ${CENTRAL_SERVER}`);
        }
    }
} catch (err) {
    console.error('[Main] Failed to read .server-config.json:', err.message);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        frame: false,
        backgroundColor: '#0a0a1a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    const isDev = !app.isPackaged;
    const url = isDev ? 'http://localhost:5173' : 'http://localhost:3000';

    if (isDev) {
        // Retry logic for Vite dev server in case of startup delay
        const tryLoad = () => {
            mainWindow.loadURL(url).catch(() => {
                console.log('[Electron] Vite not ready, retrying in 1s...');
                setTimeout(tryLoad, 1000);
            });
        };
        tryLoad();
    } else {
        mainWindow.loadURL(url);
    }

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

function createTray() {
    const icon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABhSURBVFhH7c4xDQAgDETRsoDEYQVrOMEaFnCANRZgAtIhl/yVnzRNllIqstZ+cs8JOIETOIETOIETOIEThLXWsc/MOQfee4ecc4iIYa21SErpUkrpIiJSSqN775O11koR+QFU2Q8hm4gNaAAAAABJRU5ErkJggg=='
    );
    tray = new Tray(icon);
    tray.setToolTip('SharingIsCaring - Compute Sharing');
    tray.setContextMenu(Menu.buildFromTemplate([
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

ipcMain.handle('get-server-url', () => CENTRAL_SERVER);

ipcMain.handle('toggle-worker', (event, start, serverUrl) => {
    if (start && !workerProcess) {
        const targetUrl = serverUrl || CENTRAL_SERVER;
        workerProcess = fork(path.join(__dirname, 'worker.js'), [], { 
            silent: true,
            env: { ...process.env, SERVER_URL: targetUrl }
        });
        workerProcess.stdout.on('data', d => process.stdout.write(`[Worker] ${d}`));
        workerProcess.stderr.on('data', d => process.stderr.write(`[Worker ERR] ${d}`));
        
        workerProcess.on('message', (msg) => {
            if (mainWindow) mainWindow.webContents.send('worker-message', msg);
        });

        workerProcess.on('exit', () => {
            workerProcess = null;
            if (mainWindow) mainWindow.webContents.send('worker-status', false);
        });
        return { status: 'started' };
    } else if (!start && workerProcess) {
        workerProcess.kill();
        workerProcess = null;
        return { status: 'stopped' };
    }
    return { status: start ? 'already-running' : 'already-stopped' };
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

ipcMain.handle('worker-reply', (event, msgType, data) => {
    if (workerProcess) {
        workerProcess.send({ type: msgType, ...data });
        return { status: 'sent' };
    }
    return { status: 'worker-offline' };
});

// ==================== APP LIFECYCLE ====================
app.whenReady().then(async () => {
    await startServer();
    createWindow();
    createTray();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    if (serverProcess) serverProcess.kill();
    if (workerProcess) workerProcess.kill();
    if (tray) { tray.destroy(); tray = null; }
});
