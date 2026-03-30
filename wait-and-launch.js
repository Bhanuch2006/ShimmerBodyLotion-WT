// wait-and-launch.js
// Polls Vite dev server until ready, then launches Electron.
// Zero extra dependencies needed.
const http = require('http');
const { spawn } = require('child_process');

const VITE_URL = 'http://localhost:5173';
const MAX_WAIT_MS = 60000;
const POLL_INTERVAL_MS = 1000;

let elapsed = 0;

function checkVite(callback) {
    http.get(VITE_URL, (res) => {
        callback(null, res.statusCode);
    }).on('error', (err) => {
        callback(err);
    });
}

function waitForVite() {
    checkVite((err) => {
        if (!err) {
            console.log('[Launcher] Vite is ready! Starting Electron...');
            const electronBin = require('path').join(__dirname, 'node_modules', '.bin', 'electron');
            const child = spawn(electronBin, ['.'], { stdio: 'inherit', shell: true });
            child.on('close', (code) => process.exit(code));
        } else {
            elapsed += POLL_INTERVAL_MS;
            if (elapsed >= MAX_WAIT_MS) {
                console.error('[Launcher] Timed out waiting for Vite. Aborting.');
                process.exit(1);
            }
            process.stdout.write(`\r[Launcher] Waiting for Vite... (${elapsed / 1000}s)`);
            setTimeout(waitForVite, POLL_INTERVAL_MS);
        }
    });
}

console.log('[Launcher] Waiting for Vite dev server at', VITE_URL);
waitForVite();
