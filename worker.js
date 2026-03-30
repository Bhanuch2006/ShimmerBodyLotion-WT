require('dotenv').config();
const express = require('express');
const fs = require('fs');
const { exec, execSync } = require('child_process');
const path = require('path');
const axios = require('axios');
const os = require('os');

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.WORKER_PORT) || 4000;
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const NGROK_AUTHTOKEN = process.env.NGROK_AUTHTOKEN || null;

// workerUrl will be set after ngrok tunnel starts (or fallback to localhost)
let workerUrl = process.env.WORKER_URL || null;

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

// ==================== STATE ====================
let isExecuting = false;
let registered = false;
let activeJobOffer = null;

// ==================== REGISTRATION & HEARTBEAT ====================
let registrationAttempts = 0;
const maxRegistrationAttempts = 20;
const baseRegistrationDelay = 3000;

async function registerWorker() {
    if (!workerUrl) {
        console.warn('⚠️ No workerUrl yet (ngrok not ready). Retrying in 3s...');
        setTimeout(registerWorker, 3000);
        return;
    }

    try {
        const res = await axios.post(`${SERVER_URL}/register`, { workerUrl, capabilities });
        console.log('✅ Registered | Trust:', res.data.trustScore, '| Credits:', res.data.credits);
        console.log(`   Public URL: ${workerUrl}`);

        registrationAttempts = 0;
        registered = true;

        // Start heartbeats once registered
        if (!global.heartbeatInterval) {
            global.heartbeatInterval = setInterval(sendHeartbeat, 10000);
        }

        // Start polling for jobs once registered
        if (!global.pollInterval) {
            global.pollInterval = setInterval(pollForJob, 5000);
            setTimeout(pollForJob, 1000);
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
    if (!workerUrl) return;
    try {
        await axios.post(`${SERVER_URL}/heartbeat`, { workerUrl });
    } catch (err) {
        console.warn('⚠️ Heartbeat failed:', err.message);
    }
}

// Re-attempt registration every 30 seconds if not yet registered
setInterval(() => {
    if (!registered && workerUrl) {
        console.log('Attempting to re-register...');
        registerWorker();
    }
}, 30000);

// ==================== POLL FOR JOBS ====================
async function pollForJob() {
    if (!registered || isExecuting || activeJobOffer || !workerUrl) return;

    try {
        const res = await axios.post(`${SERVER_URL}/poll-job`, { workerUrl }, { timeout: 10000 });
        const { job } = res.data;

        if (job) {
            console.log(`📋 Job offered via poll: ${job.jobId}`);
            handleJobOffer(job.jobId, job.files, job.serverUrl, job.description, job.resources_required);
        }
    } catch (err) {
        if (err.code !== 'ECONNREFUSED' && err.response?.status !== 404) {
            console.warn('⚠️ Poll failed:', err.message);
        }
    }
}

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

// ==================== JOB HANDLING ====================
app.get('/', (req, res) => res.json({ status: 'worker running', port: PORT, publicUrl: workerUrl, capabilities }));

// Keep /offer endpoint from MehulShaunak (legacy/push dispatch)
app.post('/offer', async (req, res) => {
    const { jobId, files, description, resources, serverUrl } = req.body;
    res.json({ status: 'offered', jobId });
    handleJobOffer(jobId, files, serverUrl, description, resources);
});

async function handleJobOffer(jobId, files, serverUrl, description = '', resources = {}) {
    if (isExecuting || activeJobOffer) {
        console.warn('⚠️ Busy, ignoring job offer:', jobId);
        return;
    }

    const SERVER = serverUrl || SERVER_URL;
    activeJobOffer = { jobId, files, serverUrl: SERVER, description, resources };

    console.log('📬 Received job offer:', jobId);

    if (process.send) {
        // Send to Main process to show popup
        process.send({ 
            type: 'JOB_OFFER', 
            data: activeJobOffer
        });
    } else {
        console.log('⚠️ No IPC parent found, auto-accepting job (headless mode)');
        startJobExecution(jobId, files, SERVER);
    }
}

// Listen for IPC messages from Electron Main Process (Accept/Reject button clicks)
process.on('message', async (msg) => {
    if (msg.type === 'JOB_ACCEPTED' && activeJobOffer?.jobId === msg.jobId) {
        console.log('✅ Job accepted by local contributor:', msg.jobId);
        const { jobId, files, serverUrl } = activeJobOffer;
        activeJobOffer = null;
        startJobExecution(jobId, files, serverUrl);
    } 
    else if (msg.type === 'JOB_REJECTED' && activeJobOffer?.jobId === msg.jobId) {
        console.log('❌ Job rejected by local contributor:', msg.jobId);
        const SERVER = activeJobOffer.serverUrl;
        const jobId = activeJobOffer.jobId;
        activeJobOffer = null;
        try {
            await axios.post(`${SERVER}/job-update`, {
                jobId: jobId,
                status: 'rejected',
                workerUrl
            });
        } catch (e) {
            console.error('Failed to send rejection to server');
        }
    }
});

async function startJobExecution(jobId, files, SERVER) {
    if (isExecuting) return;
    isExecuting = true;

    console.log(`📋 Executing job: ${jobId}`);
    
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
            console.log(`⬇️ Downloading: ${cleanPath} -> ${fileName}`);
            
            try {
                await downloadFile(`${SERVER}/${cleanPath}`, localPath);
                downloadedFiles.push(fileName);
            } catch (downloadErr) {
                console.error(`   ❌ Download failed: ${downloadErr.message}`);
                throw downloadErr;
            }
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
            } else {
                console.log('✅ Job done:', jobId);
                if (stdout) console.log('OUTPUT:', stdout.substring(0, 500));

                await axios.post(`${SERVER}/job-update`, {
                    jobId, status: 'completed',
                    result: stdout, workerUrl
                }).catch(() => {});
            }

            isExecuting = false;
            console.log('🔄 Ready for next job');
            setTimeout(pollForJob, 1000);
        });

    } catch (err) {
        console.error('🔥 Error:', err.message);
        await axios.post(`${SERVER}/job-update`, {
            jobId, status: 'failed',
            error: err.message, workerUrl
        }).catch(() => {});

        isExecuting = false;
        console.log('🔄 Ready for next job');
    }
}

// ==================== CLEAN DISCONNECT ====================
async function unregisterWorker() {
    if (!workerUrl) return;
    try {
        await axios.post(`${SERVER_URL}/unregister`, { workerUrl }, { timeout: 3000 });
        console.log('👋 Unregistered from server');
    } catch {}
}

process.on('SIGTERM', async () => { await unregisterWorker(); process.exit(0); });
process.on('SIGINT', async () => { await unregisterWorker(); process.exit(0); });

// ==================== START ====================
const httpServer = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Worker HTTP server listening on port ${PORT}`);
    console.log(`   Server: ${SERVER_URL}`);
    console.log(`   Docker: ${capabilities.dockerAvailable ? '✅' : '❌'}`);
    console.log(`   GPU: ${capabilities.gpuAvailable ? capabilities.gpuModel : '❌'}`);

    if (NGROK_AUTHTOKEN) {
        try {
            console.log('🔗 Starting ngrok tunnel...');
            const ngrok = require('@ngrok/ngrok');

            const listener = await ngrok.forward({
                addr: PORT,
                authtoken: NGROK_AUTHTOKEN,
            });

            workerUrl = listener.url();
            console.log(`✅ ngrok tunnel active: ${workerUrl}`);
            console.log(`   Mode: Pull-based polling (interactive via Electron UI)`);

        } catch (err) {
            console.error('❌ ngrok failed:', err.message);
            workerUrl = process.env.WORKER_URL || `http://localhost:${PORT}`;
        }
    } else {
        workerUrl = process.env.WORKER_URL || `http://localhost:${PORT}`;
        console.warn('⚠️ No NGROK_AUTHTOKEN set. Using:', workerUrl);
    }

    await registerWorker();
});
