const express = require('express');
const fs = require('fs');
const { exec, execSync } = require('child_process');
const path = require('path');
const axios = require('axios');
const os = require('os');

const app = express();
app.use(express.json());

const PORT = process.env.WORKER_PORT || 4000;
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const workerUrl = process.env.WORKER_URL || `http://localhost:${PORT}`;

// ==================== SYSTEM CAPABILITIES ====================
function getCapabilities() {
    const caps = {
        cpuCores: os.cpus().length,
        cpuModel: os.cpus()[0]?.model || 'Unknown',
        totalMemoryGB: Math.round(os.totalmem() / (1024 ** 3)),
        freeMemoryGB: Math.round(os.freemem() / (1024 ** 3)),
        platform: os.platform(),
        hostname: os.hostname(),
        gpuAvailable: false,
        gpuModel: null,
        dockerAvailable: false
    };

    try {
        const gpu = execSync('nvidia-smi --query-gpu=name --format=csv,noheader', {
            encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']
        });
        caps.gpuAvailable = true;
        caps.gpuModel = gpu.trim();
    } catch {}

    try {
        execSync('docker --version', { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
        caps.dockerAvailable = true;
    } catch {}

    return caps;
}

const capabilities = getCapabilities();
console.log('🖥️ Capabilities:', JSON.stringify(capabilities, null, 2));

// ==================== REGISTRATION & HEARTBEAT ====================
let registrationAttempts = 0;
const maxRegistrationAttempts = 20;
const baseRegistrationDelay = 3000; // 3 seconds

async function registerWorker() {
    try {
        const res = await axios.post(`${SERVER_URL}/register`, { workerUrl, capabilities });
        console.log('✅ Registered | Trust:', res.data.trustScore, '| Credits:', res.data.credits);
        
        // Reset attempt counter on successful registration
        registrationAttempts = 0;
        
        // Set up heartbeats once registered
        if (!global.heartbeatInterval) {
            global.heartbeatInterval = setInterval(sendHeartbeat, 10000);
        }
    } catch (err) {
        registrationAttempts++;
        const delay = Math.min(baseRegistrationDelay * Math.pow(2, Math.floor(registrationAttempts / 3)), 120000);
        console.error(`❌ Registration failed (attempt ${registrationAttempts}/${maxRegistrationAttempts}): ${err.message}`);
        
        if (registrationAttempts < maxRegistrationAttempts) {
            console.log(`   Retrying in ${delay / 1000}s...`);
            setTimeout(registerWorker, delay);
        } else {
            console.error('❌ Max registration attempts reached. Check server connectivity.');
        }
    }
}

async function sendHeartbeat() {
    try {
        await axios.post(`${SERVER_URL}/heartbeat`, { workerUrl });
    } catch (err) {
        console.warn('⚠️ Heartbeat failed:', err.message);
        // Don't stop on heartbeat failure, server may be temporarily down
    }
}

// Initial registration
registerWorker();

// Re-attempt registration every 30 seconds if not yet registered
setInterval(() => {
    if (registrationAttempts > 0) {
        console.log('Attempting to re-register...');
        registerWorker();
    }
}, 30000);

// ==================== FILE DOWNLOAD ====================
async function downloadFile(url, outputPath) {
    const response = await axios({ method: 'GET', url, responseType: 'stream' });
    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

// ==================== DOCKER CHECK ====================
function isDockerRunning() {
    try {
        execSync('docker info', { encoding: 'utf-8', timeout: 10000, stdio: 'pipe' });
        return true;
    } catch { return false; }
}

// ==================== JOB EXECUTION ====================
app.get('/', (req, res) => res.json({ status: 'worker running', port: PORT, capabilities }));

app.post('/execute', async (req, res) => {
    const { jobId, files, serverUrl } = req.body;
    res.json({ status: 'accepted', jobId });

    const SERVER = serverUrl || SERVER_URL;

    try {
        await axios.post(`${SERVER}/job-update`, { jobId, status: 'running', workerUrl });

        const jobsPath = path.join(__dirname, 'jobs');
        if (!fs.existsSync(jobsPath)) fs.mkdirSync(jobsPath, { recursive: true });

        let mainFile = '';
        const downloadedFiles = [];

        for (const file of files) {
            const cleanPath = file.replace(/\\/g, '/');
            let fileName = path.basename(cleanPath);

            if (fileName.endsWith('.py') && !mainFile) {
                fileName = 'main.py';
                mainFile = fileName;
            } else if (fileName.endsWith('.csv')) {
                fileName = 'data.csv';
            }

            const localPath = path.join(jobsPath, fileName);
            console.log('⬇️ Downloading:', cleanPath, '->', fileName);
            await downloadFile(`${SERVER}/${cleanPath}`, localPath);
            downloadedFiles.push(fileName);
        }

        if (!mainFile) throw new Error('No Python script found in uploaded files');

        console.log('🧠 Executing:', mainFile);

        // Decide: Docker or local
        const useDocker = capabilities.dockerAvailable && isDockerRunning();
        let command;

        if (useDocker) {
            const dockerJobsPath = jobsPath.replace(/\\/g, '/');
            command = `docker run --rm --name job-${jobId.substring(0, 8)} ` +
                `-v "${dockerJobsPath}:/app" -w /app python:3.10-slim ` +
                `sh -c "pip install numpy pandas scikit-learn --quiet 2>/dev/null && python main.py"`;
            console.log('🐳 Running in Docker');
        } else {
            command = `py "${path.join(jobsPath, mainFile)}"`;
            console.log('⚙️ Running locally');
        }

        exec(command, { timeout: 120000, cwd: jobsPath }, async (err, stdout, stderr) => {
            // Cleanup job files
            try {
                for (const f of downloadedFiles) {
                    const fp = path.join(jobsPath, f);
                    if (fs.existsSync(fp)) fs.unlinkSync(fp);
                }
            } catch {}

            if (err) {
                console.error('❌ Execution error:', err.message);
                await axios.post(`${SERVER}/job-update`, {
                    jobId, status: 'failed',
                    error: stderr || err.message, workerUrl
                }).catch(() => {});
                return;
            }

            console.log('✅ Job done:', jobId);
            if (stdout) console.log('OUTPUT:', stdout.substring(0, 500));

            await axios.post(`${SERVER}/job-update`, {
                jobId, status: 'completed',
                result: stdout, workerUrl
            }).catch(() => {});
        });

    } catch (err) {
        console.error('🔥 Error:', err.message);
        await axios.post(`${SERVER}/job-update`, {
            jobId, status: 'failed',
            error: err.message, workerUrl
        }).catch(() => {});
    }
});

// ==================== CLEAN DISCONNECT ====================
async function unregisterWorker() {
    try {
        await axios.post(`${SERVER_URL}/unregister`, { workerUrl }, { timeout: 3000 });
        console.log('👋 Unregistered from server');
    } catch {}
}

// Handle graceful shutdown
process.on('SIGTERM', async () => { await unregisterWorker(); process.exit(0); });
process.on('SIGINT', async () => { await unregisterWorker(); process.exit(0); });
process.on('exit', () => {
    // Sync request on exit as last resort
    try {
        const http = require('http');
        const url = new URL(`${SERVER_URL}/unregister`);
        const data = JSON.stringify({ workerUrl });
        const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
        });
        req.write(data);
        req.end();
    } catch {}
});

// ==================== START ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Worker running at ${workerUrl}`);
    console.log(`   Server: ${SERVER_URL}`);
    console.log(`   Docker: ${capabilities.dockerAvailable ? '✅' : '❌'}`);
    console.log(`   GPU: ${capabilities.gpuAvailable ? capabilities.gpuModel : '❌'}`);
    registerWorker();
});