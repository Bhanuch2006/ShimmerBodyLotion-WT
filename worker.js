require('dotenv').config();
const express = require('express');
const fs = require('fs');
const { exec, execSync } = require('child_process');
const path = require('path');
const axios = require('axios');
const os = require('os');
const archiver = require('archiver');

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.WORKER_PORT) || 4000;
const SERVER_URL = process.env.SERVER_URL || 'https://shimmerbodylotion-wt.onrender.com';
const NGROK_AUTHTOKEN = process.env.NGROK_AUTHTOKEN || null;
const WORKER_CLIENT_ID = process.env.WORKER_CLIENT_ID || `host:${os.hostname()}`;
const CONTAINER_OUTPUT_DIR = '/workspace/output';

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

function sendStatus(text) {
    if (typeof process.send === 'function' && process.connected) {
        process.send({ type: 'STATUS', text });
    }
}

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
    if (msg.type === 'SHUTDOWN') {
        gracefulShutdown();
        return;
    }

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

async function disconnectWorker() {
    if (!registered || !workerUrl) return;
    try {
        await axios.post(`${SERVER_URL}/disconnect-worker`, { workerUrl });
    } catch {}
}

let shuttingDown = false;
async function gracefulShutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    sendStatus('Worker shutting down...');
    await disconnectWorker();
    process.exit(0);
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
                sendStatus(`Self-assignment blocked for ${job.jobId.substring(0, 8)}...`);
                try {
                    await axios.post(`${SERVER_URL}/job-skip`, {
                        jobId: job.jobId,
                        workerUrl,
                        reason: 'self-submitted'
                    });
                } catch {
                    await axios.post(`${SERVER_URL}/job-update`, {
                        jobId: job.jobId,
                        status: 'rejected',
                        workerUrl
                    });
                }
                return;
            }

            console.log(`📋 Job offer received: ${job.jobId}`);
            sendStatus(`Job offer received: ${job.jobId.substring(0, 8)}...`);
            const approved = await requestJobApproval(job);

            if (!approved) {
                console.log(`🛑 Job rejected by user: ${job.jobId}`);
                sendStatus(`Job rejected: ${job.jobId.substring(0, 8)}...`);
                await axios.post(`${SERVER_URL}/job-update`, {
                    jobId: job.jobId,
                    status: 'rejected',
                    workerUrl
                });
                return;
            }

            console.log(`✅ Job accepted by user: ${job.jobId}`);
            sendStatus(`Job accepted: ${job.jobId.substring(0, 8)}...`);
            handleJob(job);
        }
    } catch (err) {
        console.warn('⚠️ Poll error:', err.message);
    }
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
        exec(command, { maxBuffer: 20 * 1024 * 1024, ...options }, (err, stdout, stderr) => {
            if (err) {
                err.stdout = stdout;
                err.stderr = stderr;
                return reject(err);
            }
            resolve({ stdout, stderr });
        });
    });
}

async function runPythonWithFallback(scriptPath, cwd, extraEnv = {}) {
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
            const result = await runCommand(command, {
                cwd,
                timeout: 120000,
                env: { ...process.env, ...extraEnv }
            });
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

async function runJobInDocker(jobsPath, mainFile, outputDir) {
    const command = [
        'docker run --rm',
        `-v "${jobsPath}:/workspace"`,
        `-v "${outputDir}:${CONTAINER_OUTPUT_DIR}"`,
        '-w /workspace',
        `-e OUTPUT_DIR=${CONTAINER_OUTPUT_DIR}`,
        'python:3.10-slim',
        `sh -c "mkdir -p ${CONTAINER_OUTPUT_DIR} && python /workspace/${mainFile}"`
    ].join(' ');

    return runCommand(command, { cwd: jobsPath, timeout: 300000 });
}

function ensureCleanDir(dirPath) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    fs.mkdirSync(dirPath, { recursive: true });
}

function listFilesRecursive(rootDir) {
    if (!fs.existsSync(rootDir)) return [];
    const results = [];

    function walk(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else {
                const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
                results.push(rel);
            }
        }
    }

    walk(rootDir);
    return results;
}

function createZipFromDirectory(sourceDir, zipPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', resolve);
        output.on('error', reject);
        archive.on('error', reject);

        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

async function uploadOutputZip(serverUrl, jobId, zipPath) {
    const form = new FormData();
    form.append('task_id', jobId);
    form.append('file', new Blob([fs.readFileSync(zipPath)]), 'output.zip');

    const resp = await fetch(`${serverUrl}/upload-output`, {
        method: 'POST',
        body: form
    });

    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Output upload failed: ${resp.status} ${body}`);
    }

    return resp.json();
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
        const outputDir = path.join(jobsPath, 'output', jobId);
        ensureCleanDir(outputDir);
        // Contract: user scripts should write artifacts to OUTPUT_DIR (/workspace/output in Docker).
        fs.mkdirSync(outputDir, { recursive: true });

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
            let stdout = '';
            let stderr = '';
            let command = '';

            try {
                if (capabilities.dockerAvailable) {
                    const dockerRun = await runJobInDocker(jobsPath, mainFile, outputDir);
                    stdout = dockerRun.stdout || '';
                    stderr = dockerRun.stderr || '';
                    command = 'docker';
                } else {
                    throw new Error('Docker unavailable on worker');
                }
            } catch (dockerErr) {
                console.warn(`⚠️ Docker execution failed, falling back to local python: ${dockerErr.message}`);
                const localRun = await runPythonWithFallback(scriptPath, jobsPath, { OUTPUT_DIR: outputDir });
                stdout = localRun.stdout || '';
                stderr = localRun.stderr || '';
                command = localRun.command;
            }

            const logsPath = path.join(outputDir, 'logs.txt');
            const executionLog = [
                `jobId: ${jobId}`,
                `runner: ${command}`,
                `outputDir: ${outputDir}`,
                `containerOutputDir: ${CONTAINER_OUTPUT_DIR}`,
                '',
                '=== STDOUT ===',
                stdout,
                '',
                '=== STDERR ===',
                stderr
            ].join('\n');
            fs.writeFileSync(logsPath, executionLog, 'utf8');

            const outputFiles = listFilesRecursive(outputDir);
            const modelExts = new Set(['.pt', '.pth', '.pkl', '.h5', '.joblib', '.onnx']);
            const modelFiles = outputFiles.filter((f) => modelExts.has(path.extname(f).toLowerCase()));
            let outputWarning = modelFiles.length === 0 ? 'No model file generated' : null;

            const zipPath = path.join(jobsPath, `${jobId}-output.zip`);
            await createZipFromDirectory(outputDir, zipPath);
            let outputFileUrl = null;

            try {
                const uploadRes = await uploadOutputZip(SERVER, jobId, zipPath);
                outputFileUrl = uploadRes.output_file_url || null;
            } catch (uploadErr) {
                const msg = String(uploadErr.message || uploadErr);
                const uploadWarning = msg.includes('404')
                    ? 'Output upload unavailable on server (missing /upload-output endpoint)'
                    : `Output upload failed: ${msg}`;
                outputWarning = outputWarning ? `${outputWarning}; ${uploadWarning}` : uploadWarning;
                console.warn(`⚠️ ${uploadWarning}`);
            }

            console.log(`✅ Job done (using: ${command})`);

            await axios.post(`${SERVER}/job-update`, {
                jobId,
                status: 'completed',
                result: stdout,
                output_file_url: outputFileUrl,
                output_warning: outputWarning,
                output_files: outputFiles,
                workerUrl
            });

            if (fs.existsSync(zipPath)) {
                fs.unlinkSync(zipPath);
            }
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
            fs.rmSync(outputDir, { recursive: true, force: true });

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
        try {
            const ngrok = require('@ngrok/ngrok');
            const listener = await ngrok.forward({
                addr: PORT,
                authtoken: NGROK_AUTHTOKEN
            });

            workerUrl = listener.url();
            console.log('🌍 Public URL:', workerUrl);
            sendStatus(`Worker online at ${workerUrl}`);
        } catch (err) {
            const errMsg = err?.message || String(err);
            if (String(errMsg).includes('ERR_NGROK_334')) {
                console.warn('⚠️ ngrok endpoint already online. Continuing without ngrok tunnel for this worker instance.');
            } else {
                console.warn(`⚠️ ngrok startup failed: ${errMsg}`);
            }

            workerUrl = process.env.WORKER_URL || `http://localhost:${PORT}`;
            sendStatus('ngrok unavailable; running in poll mode with local worker identity');
        }
    } else {
        workerUrl = `http://localhost:${PORT}`;
        sendStatus('Worker online (local mode)');
    }

    registerWorker();
});

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);