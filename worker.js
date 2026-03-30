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
const SERVER_URL = process.env.SERVER_URL || 'https://shimmerbodylotion-wt.onrender.com';
const NGROK_AUTHTOKEN = process.env.NGROK_AUTHTOKEN || null;
const WORKER_CLIENT_ID = process.env.WORKER_CLIENT_ID || `host:${os.hostname()}`;

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
const locallySubmittedJobIds = new Set();

function getOfferPayload(job) {
    return {
        jobId: job.jobId,
        description: job.description || 'No description provided',
        resources: job.resources_required || { cpu: 1, ram: 0.5, gpu: false },
        files: job.files || []
    };
}

function requestJobApproval(job) {
    // If running under Electron parent process, use modal approval flow.
    if (typeof process.send === 'function' && process.connected) {
        return new Promise((resolve) => {
            const offer = getOfferPayload(job);
            activeJobOffer = {
                jobId: job.jobId,
                resolve,
                timer: null
            };

            activeJobOffer.timer = setTimeout(() => {
                if (!activeJobOffer || activeJobOffer.jobId !== job.jobId) return;
                const done = activeJobOffer.resolve;
                activeJobOffer = null;
                done(false);
            }, 60000);

            process.send({ type: 'JOB_OFFER', data: offer });
        });
    }

    // Standalone worker mode: auto-accept unless explicitly disabled.
    if (process.env.AUTO_ACCEPT_JOBS === 'false') {
        console.log('⚠️ AUTO_ACCEPT_JOBS=false and no UI approval channel; rejecting job offer.');
        return Promise.resolve(false);
    }
    return Promise.resolve(true);
}

process.on('message', (msg = {}) => {
    if (msg.type === 'SUBMITTED_JOB' && msg.jobId) {
        locallySubmittedJobIds.add(msg.jobId);
        return;
    }

    if (!activeJobOffer) return;
    const { type, jobId } = msg;
    if (!jobId || jobId !== activeJobOffer.jobId) return;

    const done = activeJobOffer.resolve;
    clearTimeout(activeJobOffer.timer);
    activeJobOffer = null;

    if (type === 'JOB_ACCEPTED') {
        done(true);
        return;
    }

    if (type === 'JOB_REJECTED') {
        done(false);
    }
});

// ==================== REGISTRATION ====================
async function registerWorker() {
    if (!workerUrl) {
        console.warn('⚠️ Waiting for worker URL...');
        setTimeout(registerWorker, 3000);
        return;
    }

    try {
        const res = await axios.post(`${SERVER_URL}/register`, {
            workerUrl,
            capabilities,
            workerClientId: WORKER_CLIENT_ID
        });
        console.log('✅ Registered | Trust:', res.data.trustScore);

        registered = true;

        setInterval(sendHeartbeat, 10000);
        setInterval(pollForJob, 5000);
        setTimeout(pollForJob, 1000);

    } catch (err) {
        console.error('❌ Registration failed:', err.message);
        setTimeout(registerWorker, 5000);
    }
}

async function sendHeartbeat() {
    try {
        await axios.post(`${SERVER_URL}/heartbeat`, { workerUrl });
    } catch {}
}

// ==================== POLL ====================
async function pollForJob() {
    if (!registered || isExecuting || activeJobOffer || !workerUrl) return;

    try {
        const res = await axios.post(`${SERVER_URL}/poll-job`, {
            workerUrl,
            workerClientId: WORKER_CLIENT_ID
        });
        const { job } = res.data;

        if (job) {
            if (locallySubmittedJobIds.has(job.jobId)) {
                console.log(`⛔ Ignoring self-submitted job: ${job.jobId}`);
                await axios.post(`${SERVER_URL}/job-update`, {
                    jobId: job.jobId,
                    status: 'rejected',
                    workerUrl
                });
                return;
            }

            console.log(`📋 Job offer received: ${job.jobId}`);
            const approved = await requestJobApproval(job);

            if (!approved) {
                console.log(`🛑 Job rejected by user: ${job.jobId}`);
                await axios.post(`${SERVER_URL}/job-update`, {
                    jobId: job.jobId,
                    status: 'rejected',
                    workerUrl
                });
                return;
            }

            console.log(`✅ Job accepted by user: ${job.jobId}`);
            handleJob(job);
        }
    } catch (err) {}
}

// ==================== DOWNLOAD ====================
async function downloadFile(url, outputPath) {
    const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream'
    });

    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

function runCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
        exec(command, options, (err, stdout, stderr) => {
            if (err) {
                err.stdout = stdout;
                err.stderr = stderr;
                return reject(err);
            }
            resolve({ stdout, stderr });
        });
    });
}

async function runPythonWithFallback(scriptPath, cwd) {
    const candidates = [
        process.env.PYTHON_BIN,
        'python',
        'py -3',
        'py'
    ].filter(Boolean);

    let lastError = null;
    for (const candidate of candidates) {
        try {
            const command = `${candidate} "${scriptPath}"`;
            const result = await runCommand(command, { cwd, timeout: 120000 });
            return { ...result, command: candidate };
        } catch (err) {
            lastError = err;
            const stderrText = (err.stderr || err.message || '').toString();
            console.warn(`⚠️ Python command failed (${candidate}): ${stderrText.trim()}`);
        }
    }

    const failure = new Error('No working Python command found. Set PYTHON_BIN in .env if needed.');
    failure.cause = lastError;
    throw failure;
}

// ==================== JOB ====================
async function handleJob(job) {
    const { jobId, files, serverUrl } = job;
    const SERVER = serverUrl || SERVER_URL;

    if (isExecuting) return;
    isExecuting = true;

    console.log(`🚀 Executing job: ${jobId}`);

    try {
        await axios.post(`${SERVER}/job-update`, { jobId, status: 'running', workerUrl });

        const jobsPath = path.join(__dirname, 'jobs');
        if (!fs.existsSync(jobsPath)) fs.mkdirSync(jobsPath);

        let mainFile = '';
        const downloadedFiles = [];

        for (const file of files) {
            const cleanPath = file.replace(/\\/g, '/');

            // ✅ FIXED filename extraction (Cloudinary safe)
            let fileName = path.basename(new URL(cleanPath).pathname);

            if (fileName.endsWith('.py') && !mainFile) {
                fileName = 'main.py';
                mainFile = fileName;
            } else if (fileName.endsWith('.csv')) {
                fileName = 'data.csv';
            }

            const localPath = path.join(jobsPath, fileName);

            console.log(`⬇️ Downloading: ${cleanPath}`);

            // ✅ FIXED (NO SERVER PREFIX)
            await downloadFile(cleanPath, localPath);

            downloadedFiles.push(fileName);
        }

        if (!mainFile) throw new Error('No Python file found');

        console.log('🧠 Running script...');

        const scriptPath = path.join(jobsPath, mainFile);
        if (!fs.existsSync(scriptPath)) {
            throw new Error(`Main script missing after download: ${scriptPath}`);
        }

        try {
            const { stdout, command } = await runPythonWithFallback(scriptPath, jobsPath);
            console.log(`✅ Job done (using: ${command})`);

            await axios.post(`${SERVER}/job-update`, {
                jobId,
                status: 'completed',
                result: stdout,
                workerUrl
            });
        } catch (err) {
            const detail = err?.cause?.stderr || err?.cause?.message || err.message;
            console.error('❌ Execution error:', detail);

            await axios.post(`${SERVER}/job-update`, {
                jobId,
                status: 'failed',
                error: detail,
                workerUrl
            });
        } finally {
            // cleanup
            for (const f of downloadedFiles) {
                const fp = path.join(jobsPath, f);
                if (fs.existsSync(fp)) fs.unlinkSync(fp);
            }

            isExecuting = false;
        }

    } catch (err) {
        console.error('🔥 Job failed:', err.message);

        await axios.post(`${SERVER}/job-update`, {
            jobId,
            status: 'failed',
            error: err.message,
            workerUrl
        });

        isExecuting = false;
    }
}

// ==================== START ====================
app.listen(PORT, async () => {
    console.log(`🚀 Worker running on port ${PORT}`);

    if (NGROK_AUTHTOKEN) {
        const ngrok = require('@ngrok/ngrok');
        const listener = await ngrok.forward({
            addr: PORT,
            authtoken: NGROK_AUTHTOKEN
        });

        workerUrl = listener.url();
        console.log('🌍 Public URL:', workerUrl);
    } else {
        workerUrl = `http://localhost:${PORT}`;
    }

    registerWorker();
});