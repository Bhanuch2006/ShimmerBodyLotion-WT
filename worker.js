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

// ==================== REGISTRATION ====================
async function registerWorker() {
    if (!workerUrl) {
        console.warn('⚠️ Waiting for worker URL...');
        setTimeout(registerWorker, 3000);
        return;
    }

    try {
        const res = await axios.post(`${SERVER_URL}/register`, { workerUrl, capabilities });
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
        const res = await axios.post(`${SERVER_URL}/poll-job`, { workerUrl });
        const { job } = res.data;

        if (job) {
            console.log(`📋 Job received: ${job.jobId}`);
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

        const command = `py "${path.join(jobsPath, mainFile)}"`;

        exec(command, { cwd: jobsPath, timeout: 120000 }, async (err, stdout, stderr) => {

            // cleanup
            for (const f of downloadedFiles) {
                const fp = path.join(jobsPath, f);
                if (fs.existsSync(fp)) fs.unlinkSync(fp);
            }

            if (err) {
                console.error('❌ Execution error:', err.message);

                await axios.post(`${SERVER}/job-update`, {
                    jobId,
                    status: 'failed',
                    error: stderr || err.message,
                    workerUrl
                });

            } else {
                console.log('✅ Job done');

                await axios.post(`${SERVER}/job-update`, {
                    jobId,
                    status: 'completed',
                    result: stdout,
                    workerUrl
                });
            }

            isExecuting = false;
        });

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