const express = require('express');
const fs = require('fs');
const { exec, execSync } = require('child_process');
const path = require('path');
const axios = require('axios');
const os = require('os');

const app = express();
app.use(express.json());

const initialPort = parseInt(process.env.WORKER_PORT) || 4000;
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
let workerUrl = process.env.WORKER_URL || `http://localhost:${initialPort}`;

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
async function registerWorker() {
    try {
        const res = await axios.post(`${SERVER_URL}/register`, { workerUrl, capabilities });
        console.log('✅ Registered | Trust:', res.data.trustScore, '| Credits:', res.data.credits);
    } catch (err) {
        console.error('❌ Registration failed:', err.message);
    }
}

async function sendHeartbeat() {
    try { await axios.post(`${SERVER_URL}/heartbeat`, { workerUrl }); }
    catch {}
}

setInterval(sendHeartbeat, 10000);
setInterval(registerWorker, 30000);

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

let activeJobOffer = null;

app.post('/offer', async (req, res) => {
    const { jobId, files, description, resources, serverUrl } = req.body;
    res.json({ status: 'offered', jobId });

    const SERVER = serverUrl || SERVER_URL;
    activeJobOffer = { jobId, files, serverUrl: SERVER, description, resources };

    console.log('📬 Received job offer:', jobId);

    if (process.send) {
        process.send({ 
            type: 'JOB_OFFER', 
            data: activeJobOffer
        });
    } else {
        console.log('⚠️ No IPC parent found, auto-accepting job (headless mode)');
        executeJob(jobId, files, SERVER);
    }
});

// Listen for IPC messages from Electron Main Process
process.on('message', async (msg) => {
    if (msg.type === 'JOB_ACCEPTED' && activeJobOffer?.jobId === msg.jobId) {
        console.log('✅ Job accepted by local contributor:', msg.jobId);
        const { jobId, files, serverUrl } = activeJobOffer;
        activeJobOffer = null;
        executeJob(jobId, files, serverUrl);
    } 
    else if (msg.type === 'JOB_REJECTED' && activeJobOffer?.jobId === msg.jobId) {
        console.log('❌ Job rejected by local contributor:', msg.jobId);
        const SERVER = activeJobOffer.serverUrl;
        activeJobOffer = null;
        try {
            await axios.post(`${SERVER}/job-update`, {
                jobId: msg.jobId,
                status: 'rejected',
                workerUrl
            });
        } catch (e) {
            console.error('Failed to send rejection to server');
        }
    }
});

async function executeJob(jobId, files, SERVER) {
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
}

// ==================== START ====================
function startWorkerServer(port) {
    const server = app.listen(port, '0.0.0.0', () => {
        const actualPort = server.address().port;
        workerUrl = process.env.WORKER_URL || `http://localhost:${actualPort}`;
        console.log(`🚀 Worker running at ${workerUrl}`);
        console.log(`   Docker: ${capabilities.dockerAvailable ? '✅' : '❌'}`);
        console.log(`   GPU: ${capabilities.gpuAvailable ? capabilities.gpuModel : '❌'}`);
        registerWorker();
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`⚠️ Port ${port} is in use, trying a random port...`);
            setTimeout(() => {
                server.close();
                startWorkerServer(0);
            }, 500);
        } else {
            console.error('🔥 Server start error:', err.message);
        }
    });
}

startWorkerServer(initialPort);