require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const cors = require('cors');

function estimateResources(files, description) {
    const hasPython = files.some(f => f.endsWith('.py'));
    const hasCSV = files.some(f => f.endsWith('.csv'));

    let ram = 0.5;
    let cpu = 1;

    if (hasPython) ram += 0.5;
    if (hasCSV) ram += 1;

    if (description?.toLowerCase().includes("train")) {
        ram += 2;
        cpu = 2;
    }

    return { cpu, ram, gpu: false };
}

// ==================== CLOUDINARY SETUP (Optional) ====================
let cloudinary = null;
let cloudinaryConfigured = false;
try {
    cloudinary = require('cloudinary').v2;

    let cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOOUD_NAME;
    let apiKey = process.env.CLOUDINARY_API_KEY;
    let apiSecret = process.env.CLOUDINARY_API_SECRET;

    if ((!cloudName || !apiKey || !apiSecret) && process.env.CLOUDINARY_URL) {
        try {
            const parsed = new URL(process.env.CLOUDINARY_URL);
            cloudName = cloudName || parsed.pathname.replace(/^\//, '');
            apiKey = apiKey || decodeURIComponent(parsed.username || '');
            apiSecret = apiSecret || decodeURIComponent(parsed.password || '');
        } catch (parseErr) {
            console.warn('⚠️ CLOUDINARY_URL could not be parsed:', parseErr.message);
        }
    }

    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret
    });

    const cfg = cloudinary.config();
    if (cfg?.cloud_name && cfg?.api_key && cfg?.api_secret) {
        cloudinaryConfigured = true;
        console.log(`✅ Cloudinary configured: ${cloudinary.config().cloud_name}`);
    } else {
        cloudinary = null;
        console.log('📪 Cloudinary credentials not set, using fallback disk storage');
    }
} catch (err) {
    console.log('📪 Cloudinary not installed, using fallback disk storage');
    cloudinary = null;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });



// ==================== CORS & MIDDLEWARE ====================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
const outputsDir = path.join(__dirname, 'outputs');
if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir);
app.use('/outputs', express.static(outputsDir));
app.use('/uploads', express.static(uploadsDir));

// ==================== DATA STORES ====================
const workers = new Map();
const jobs = new Map();
const jobQueue = [];

function normalizeClientId(value) {
    if (!value || typeof value !== 'string') return null;
    return value.trim().toLowerCase();
}

function normalizeHost(value) {
    if (!value || typeof value !== 'string') return null;
    return value.trim().toLowerCase();
}

// ==================== FILE UPLOAD ====================
const localDiskStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = cloudinary
    ? multer({ storage: multer.memoryStorage() })
    : multer({ storage: localDiskStorage });

const outputStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, outputsDir),
    filename: (req, file, cb) => {
        const taskId = req.body.task_id || 'task';
        const safeTaskId = String(taskId).replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `${Date.now()}-${safeTaskId}-output.zip`);
    }
});
const outputUpload = multer({ storage: outputStorage });

function uploadBufferToCloudinary(file) {
    return new Promise((resolve, reject) => {
        const originalName = file.originalname || 'file';
        const ext = path.extname(originalName).toLowerCase();
        const baseName = (path.basename(originalName, ext) || 'file')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '') || 'file';
        const publicId = `${Date.now()}-${baseName}${ext}`;

        const uploadStream = cloudinary.uploader.upload_stream(
            {
                resource_type: 'raw',
                folder: process.env.CLOUDINARY_FOLDER || undefined,
                public_id: publicId,
                filename_override: originalName,
                use_filename: false,
                unique_filename: false
            },
            (err, result) => {
                if (err) return reject(err);
                resolve(result);
            }
        );

        uploadStream.end(file.buffer);
    });
}

app.post('/upload', upload.array('files'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        if (cloudinaryConfigured && cloudinary) {
            const uploadedFiles = [];
            for (const file of req.files) {
                const result = await uploadBufferToCloudinary(file);
                uploadedFiles.push(result.secure_url);
            }
            console.log('✅ Files uploaded to Cloudinary:', uploadedFiles);
            return res.json({ files: uploadedFiles });
        }

        // Fallback: local disk
        const files = req.files.map(f => f.path.replace(/\\/g, '/'));
        console.log('✅ Files saved locally:', files);
        res.json({ files });

    } catch (err) {
        console.error('❌ Upload error:', err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

app.post('/upload-output', outputUpload.single('file'), (req, res) => {
    try {
        const taskId = req.body.task_id;
        if (!taskId) return res.status(400).json({ error: 'task_id is required' });
        if (!req.file) return res.status(400).json({ error: 'output zip file is required' });

        const job = jobs.get(taskId);
        if (!job) return res.status(404).json({ error: 'Task not found' });

        const outputPath = req.file.path;
        const outputUrl = `${getServerUrl()}/outputs/${path.basename(outputPath)}`;

        job.output_file_path = outputPath;
        job.output_file_url = outputUrl;
        if (job.status !== 'completed') job.status = 'completed';

        broadcastUpdate();
        return res.json({ task_id: taskId, output_file_url: outputUrl, status: 'completed' });
    } catch (err) {
        console.error('Output upload error:', err.message);
        return res.status(500).json({ error: 'Output upload failed' });
    }
});

// ==================== WORKER REGISTRATION ====================
app.post('/register', (req, res) => {
    const { workerUrl, capabilities, workerClientId } = req.body;
    const existing = workers.get(workerUrl);
    const normalizedClientId = normalizeClientId(workerClientId) || existing?.clientId || null;

    workers.set(workerUrl, {
        url: workerUrl,
        capabilities: capabilities || {},
        trustScore: existing ? existing.trustScore : 50,
        credits: existing ? existing.credits : 0,
        lastHeartbeat: Date.now(),
        status: 'online',
        jobsCompleted: existing ? existing.jobsCompleted : 0,
        jobsFailed: existing ? existing.jobsFailed : 0,
        currentJob: existing ? existing.currentJob : null,
        registeredAt: existing ? existing.registeredAt : Date.now(),
        lastAssignedAt: existing ? existing.lastAssignedAt : 0,
        jobHistory: existing ? existing.jobHistory : [],
        clientId: normalizedClientId,
        totalRamMB: existing ? (existing.totalRamMB || 0) : 0,
        totalDurationMs: existing ? (existing.totalDurationMs || 0) : 0
    });

    console.log(`✅ Worker registered (${workers.size} total):`, workerUrl);
    if (jobQueue.length > 0) {
        console.log(`   🔄 ${jobQueue.length} jobs queued - attempting assignment`);
    }
    broadcastUpdate();
    processQueue();

    res.json({
        status: 'registered',
        trustScore: workers.get(workerUrl).trustScore,
        credits: workers.get(workerUrl).credits
    });
});

// ==================== HEARTBEAT ====================
app.post('/heartbeat', (req, res) => {
    const { workerUrl } = req.body;
    const worker = workers.get(workerUrl);
    if (worker) {
        worker.lastHeartbeat = Date.now();
        if (worker.status === 'offline') {
            worker.status = 'online';
            console.log(' Worker back online:', workerUrl);
            broadcastUpdate();
            processQueue();
        }
    }
    res.json({ status: 'ok' });
});

app.post('/disconnect-worker', (req, res) => {
    const { workerUrl } = req.body;
    const worker = workers.get(workerUrl);
    if (!worker) return res.json({ status: 'ok' });

    worker.lastHeartbeat = Date.now();
    worker.status = 'offline';

    if (worker.currentJob) {
        const job = jobs.get(worker.currentJob);
        if (job && (job.status === 'assigned' || job.status === 'running')) {
            job.status = 'queued';
            job.assignedWorker = null;
            job.retries = (job.retries || 0) + 1;
            if (!jobQueue.includes(job.id)) jobQueue.unshift(job.id);
        }
        worker.currentJob = null;
    }

    broadcastUpdate();
    processQueue();
    return res.json({ status: 'ok' });
});

// ==================== JOB SUBMISSION ====================
app.post('/submit-job', async (req, res) => {
    const { files, description, resources_required, submitterClientId, submitterHostname } = req.body;
    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
    }

    const normalizedSubmitterClientId = normalizeClientId(submitterClientId);
    const normalizedSubmitterHostname = normalizeHost(submitterHostname);

    const jobId = crypto.randomUUID();
    const fileSignature = files.map(f => path.basename(f)).sort().join('|');
    const job = {
        id: jobId, files, status: 'queued',
        description: description || 'No description provided',
        resources_required: resources_required || estimateResources(files, description),
        submittedAt: Date.now(), assignedWorker: null,
        startedAt: null, completedAt: null,
        result: null, error: null, retries: 0,
        fileSignature,
        targetWorker: null,
        submitterClientId: normalizedSubmitterClientId,
        submitterHostname: normalizedSubmitterHostname,
        excludedWorkers: []
    };

    const csvFile = files.find(f => f.toLowerCase().endsWith('.csv'));
    let subJobs = [];
    const SPLIT_THRESHOLD = 50;

    if (csvFile) {
        try {
            let csvContent = '';
            if (csvFile.startsWith('http')) {
                const response = await axios.get(csvFile);
                csvContent = response.data;
            } else {
                const localPath = path.join(__dirname, csvFile);
                if (fs.existsSync(localPath)) csvContent = fs.readFileSync(localPath, 'utf8');
            }

            if (csvContent) {
                const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
                if (lines.length > 51) {
                    const header = lines[0];
                    const dataLines = lines.slice(1);
                    
                    // Cap max chunks at 10 to prevent system freeze on 50MB files
                    const SPLIT_THRESHOLD = Math.max(50, Math.ceil(dataLines.length / 10));
                    
                    const chunks = [];
                    for (let i = 0; i < dataLines.length; i += SPLIT_THRESHOLD) {
                        chunks.push(dataLines.slice(i, i + SPLIT_THRESHOLD));
                    }

                    for (let i = 0; i < chunks.length; i++) {
                        const chunkPathRel = `uploads/chunk_${jobId}_${i}.csv`;
                        const chunkPathAbs = path.join(__dirname, chunkPathRel);
                        fs.writeFileSync(chunkPathAbs, [header, ...chunks[i]].join('\n'), 'utf8');

                        const subFiles = files.map(f => f === csvFile ? chunkPathRel : f);
                        
                        const subJobId = `${jobId}_sub_${i}`;
                        const subJob = {
                            id: subJobId, parentId: jobId, files: subFiles, status: 'queued',
                            description: `${job.description} (Chunk ${i+1}/${chunks.length})`,
                            resources_required: job.resources_required,
                            submittedAt: Date.now(), assignedWorker: null,
                            startedAt: null, completedAt: null,
                            result: null, error: null, retries: 0,
                            fileSignature: job.fileSignature, targetWorker: null,
                            submitterClientId: job.submitterClientId, submitterHostname: job.submitterHostname,
                            excludedWorkers: []
                        };
                        jobs.set(subJobId, subJob);
                        subJobs.push(subJobId);
                        jobQueue.push(subJobId);
                    }
                }
            }
        } catch (err) {
            console.error('Error splitting CSV:', err.message);
        }
    }

    if (subJobs.length > 0) {
        job.isParent = true;
        job.subJobs = subJobs;
        jobs.set(jobId, job);
        console.log(`📥 Parent Job queued: ${jobId} with ${subJobs.length} chunks`);
    } else {
        jobs.set(jobId, job);
        jobQueue.push(jobId);
        console.log('📥 Job queued:', jobId);
    }

    broadcastUpdate();
    res.json({ jobId, status: 'queued', subJobsCount: subJobs.length });
});

// ==================== POLL-BASED JOB ASSIGNMENT ====================
app.post('/poll-job', (req, res) => {
    const { workerUrl } = req.body;
    const worker = workers.get(workerUrl);

    if (!worker) {
        return res.status(404).json({ job: null, error: 'Worker not registered' });
    }

    worker.lastHeartbeat = Date.now();
    if (worker.status === 'offline') {
        worker.status = 'online';
        console.log('💚 Worker back online (via poll):', workerUrl);
        broadcastUpdate();
    }

    if (worker.currentJob) return res.json({ job: null });
    if (jobQueue.length === 0) return res.json({ job: null });

    const serverUrl = getServerUrl();

    for (let i = 0; i < jobQueue.length; i++) {
        const jobId = jobQueue[i];
        const job = jobs.get(jobId);
        if (!job) { jobQueue.splice(i, 1); i--; continue; }

        if (job.targetWorker && job.targetWorker !== workerUrl) continue;

        if (Array.isArray(job.excludedWorkers) && job.excludedWorkers.includes(workerUrl)) continue;

        if (job.submitterClientId && worker.clientId && job.submitterClientId === worker.clientId) continue;

        const workerHost = normalizeHost(worker.capabilities?.hostname);
        if (job.submitterHostname && workerHost && job.submitterHostname === workerHost) continue;

        if (job.targetWorker && job.targetWorker === workerUrl) {
            // Perfect match
        } else if (job.targetWorker) {
            const target = workers.get(job.targetWorker);
            if (!target || target.status === 'offline') {
                console.log('⚠️ Target worker offline, allowing any worker:', job.targetWorker);
                job.targetWorker = null;
            } else {
                continue;
            }
        }

        jobQueue.splice(i, 1);
        job.status = 'assigned';
        job.assignedWorker = workerUrl;
        job.assignedAt = Date.now();
        worker.currentJob = jobId;
        worker.lastAssignedAt = Date.now();

        worker.jobHistory.push(job.fileSignature);
        if (worker.jobHistory.length > 20) {
            worker.jobHistory = worker.jobHistory.slice(-20);
        }

        const workerName = worker.capabilities?.hostname || workerUrl;
        console.log('🚀 Assigning job', jobId.substring(0, 8), 'to', workerName);

        broadcastUpdate();

        return res.json({
            job: {
                jobId: job.id,
                files: job.files,
                description: job.description,
                resources_required: job.resources_required,
                serverUrl
            }
        });
    }

    res.json({ job: null });
});

app.post('/job-skip', (req, res) => {
    const { jobId, workerUrl, reason } = req.body;
    const job = jobs.get(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (!Array.isArray(job.excludedWorkers)) job.excludedWorkers = [];
    if (workerUrl && !job.excludedWorkers.includes(workerUrl)) {
        job.excludedWorkers.push(workerUrl);
    }

    if (job.assignedWorker === workerUrl && (job.status === 'assigned' || job.status === 'running')) {
        job.status = 'queued';
        job.assignedWorker = null;
        job.retries = (job.retries || 0) + 1;
        if (!jobQueue.includes(job.id)) jobQueue.unshift(job.id);
    }

    const worker = workers.get(workerUrl);
    if (worker && worker.currentJob === jobId) worker.currentJob = null;

    console.log('↩️ Job skipped by worker:', jobId, workerUrl || 'unknown', reason || 'no reason');
    broadcastUpdate();
    processQueue();
    res.json({ status: 'ok' });
});

// ==================== JOB STATUS UPDATE ====================
app.post('/job-update', (req, res) => {
    const { jobId, status, result, error, output_file_url, output_warning, output_files, usage } = req.body;
    const job = jobs.get(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    job.status = status;
    if (usage) {
        job.usage = usage;
    }

    if (status === 'running') {
        job.startedAt = Date.now();
    } else if (status === 'completed') {
        job.completedAt = Date.now();
        job.result = result;
        if (output_file_url) job.output_file_url = output_file_url;
        if (output_warning) job.output_warning = output_warning;
        if (Array.isArray(output_files)) job.output_files = output_files;
        const worker = workers.get(job.assignedWorker);
        if (worker) {
            worker.jobsCompleted++;
            worker.trustScore = Math.min(100, worker.trustScore + 5);
            worker.credits += 10;
            if (job.usage) {
                worker.totalRamMB = (worker.totalRamMB || 0) + (Number(job.usage.ramMB) || 0);
                worker.totalDurationMs = (worker.totalDurationMs || 0) + (Number(job.usage.durationMs) || 0);
            }
            worker.currentJob = null;
        }
        console.log('✅ Job completed:', jobId);
    } else if (status === 'failed') {
        job.completedAt = Date.now();
        job.error = error;
        const worker = workers.get(job.assignedWorker);
        if (worker) {
            worker.jobsFailed++;
            worker.trustScore = Math.max(0, worker.trustScore - 10);
            worker.currentJob = null;
        }
        console.log('❌ Job failed:', jobId);
    } else if (status === 'rejected') {
        const worker = workers.get(job.assignedWorker);
        if (worker) {
            worker.trustScore = Math.max(0, worker.trustScore - 2);
            worker.currentJob = null;
        }
        job.status = 'queued';
        job.assignedWorker = null;
        job.retries++;
        jobQueue.unshift(job.id);
        console.log('↩️ Job rejected, returned to queue:', jobId);
    }

    if (status === 'completed' || status === 'failed') {
        if (job.parentId) {
            const parentJob = jobs.get(job.parentId);
            if (parentJob) {
                let allDone = true;
                let hasFailed = false;
                let combinedResult = '';
                let totalRamMB = 0;
                let totalDurationMs = 0;

                for (const subId of parentJob.subJobs) {
                    const sj = jobs.get(subId);
                    if (!sj || (sj.status !== 'completed' && sj.status !== 'failed')) {
                        allDone = false;
                        break;
                    }
                    if (sj.status === 'failed') hasFailed = true;
                    if (sj.result) combinedResult += `\n--- Chunk ${sj.id} ---\n${sj.result}`;
                    if (sj.error) combinedResult += `\n--- Chunk ${sj.id} ERROR ---\n${sj.error}`;
                    if (sj.usage) {
                        totalRamMB += Number(sj.usage.ramMB) || 0;
                        totalDurationMs += Number(sj.usage.durationMs) || 0;
                    }
                }

                if (allDone) {
                    parentJob.status = hasFailed ? 'failed' : 'completed';
                    parentJob.completedAt = Date.now();
                    parentJob.result = combinedResult.trim() || 'No output.';
                    parentJob.error = hasFailed ? 'Some chunks failed.' : null;
                    parentJob.usage = { ramMB: totalRamMB, durationMs: totalDurationMs };
                    console.log(`✅ Parent Job completed: ${parentJob.id} (${Math.round(totalRamMB)}MB used total)`);
                } else {
                    parentJob.status = 'running';
                }
            }
        }
    }

    broadcastUpdate();
    processQueue();
    res.json({ status: 'ok' });
});

// ==================== LIVE LOG STREAMING ====================
app.post('/job-log', (req, res) => {
    const { jobId, log } = req.body;
    if (jobId && log) {
        io.emit('job-log', { jobId, log });
        const job = jobs.get(jobId);
        if (job && job.parentId) io.emit('job-log', { jobId: job.parentId, log });
    }
    res.json({ status: 'ok' });
});

// ==================== QUEUE MONITOR ====================
function processQueue() {
    if (jobQueue.length === 0) return;
    const onlineWorkers = [...workers.values()].filter(w => w.status === 'online' && !w.currentJob);
    console.log(`📊 Queue status: ${jobQueue.length} pending, ${onlineWorkers.length} idle workers`);
}

// ==================== FAULT TOLERANCE ====================
setInterval(() => {
    const now = Date.now();
    let changed = false;
    const ASSIGNED_TIMEOUT_MS = 120000;

    for (const [url, worker] of workers) {
        if (now - worker.lastHeartbeat > 30000 && worker.status === 'online') {
            console.log('⚠️ Worker timed out:', url);
            worker.status = 'offline';
            changed = true;

            if (worker.currentJob) {
                const job = jobs.get(worker.currentJob);
                if (job && (job.status === 'assigned' || job.status === 'running')) {
                    job.status = 'queued';
                    job.assignedWorker = null;
                    job.retries++;
                    jobQueue.unshift(job.id);
                    console.log('♻️ Re-queued job:', job.id, '(retry #' + job.retries + ')');
                }
                worker.currentJob = null;
            }
        }

        if (worker.currentJob) {
            const assignedJob = jobs.get(worker.currentJob);
            if (
                assignedJob &&
                assignedJob.status === 'assigned' &&
                !assignedJob.startedAt &&
                (now - (assignedJob.assignedAt || assignedJob.submittedAt || now)) > ASSIGNED_TIMEOUT_MS
            ) {
                console.log('♻️ Re-queuing stale assigned job:', assignedJob.id);
                assignedJob.status = 'queued';
                assignedJob.assignedWorker = null;
                assignedJob.assignedAt = null;
                assignedJob.retries = (assignedJob.retries || 0) + 1;
                if (!jobQueue.includes(assignedJob.id)) jobQueue.unshift(assignedJob.id);
                worker.currentJob = null;
                changed = true;
            }
        }
    }

    if (changed) {
        broadcastUpdate();
        processQueue();
    }
}, 10000);

// ==================== REST API ====================
app.get('/api/workers', (req, res) => {
    const online = [...workers.values()].filter(w => w.status === 'online');
    res.json(online);
});

app.get('/api/health', (req, res) => {
    const serverUrl = getServerUrl();
    let cloudName = 'N/A';
    let storage = 'Disk (local)';

    if (cloudinary) {
        try {
            const config = cloudinary.config();
            if (config && config.cloud_name) {
                cloudName = config.cloud_name;
                storage = 'Cloudinary';
            }
        } catch (err) {
            console.warn('⚠️ Error reading Cloudinary config:', err.message);
        }
    }

    res.json({ status: 'ok', serverUrl, storage, cloudName });
});

app.get('/api/jobs', (req, res) => res.json([...jobs.values()].reverse()));
app.get('/api/stats', (req, res) => res.json(getStats()));
app.get('/api/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

app.get('/tasks/:id/download', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Task not found' });

    if (job.output_file_path && fs.existsSync(job.output_file_path)) {
        return res.download(job.output_file_path, `${job.id}-output.zip`);
    }
    if (job.output_file_url) return res.redirect(job.output_file_url);
    return res.status(404).json({ error: 'No output artifact available for this task' });
});

app.get('/api/network-info', (req, res) => {
    const nets = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                addresses.push({ name, address: net.address });
            }
        }
    }
    res.json({ addresses, port: PORT });
});

app.delete('/api/jobs/clear-queue', (req, res) => {
    const clearedCount = jobQueue.length;
    jobQueue.length = 0;
    console.log(`🗑️ Cleared ${clearedCount} queued jobs`);
    broadcastUpdate();
    res.json({ cleared: clearedCount, message: `Cleared ${clearedCount} queued jobs` });
});

// ==================== UTILITY ====================
const PORT = process.env.PORT || 3000;

function getServerUrl() {
    if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
    return `http://localhost:${PORT}`;
}

// ==================== SOCKET.IO ====================
function getStats() {
    const allJobs = [...jobs.values()];
    const completed = allJobs.filter(j => j.status === 'completed').length;
    const total = allJobs.length;
    return {
        totalJobs: total,
        completedJobs: completed,
        failedJobs: allJobs.filter(j => j.status === 'failed').length,
        runningJobs: allJobs.filter(j => j.status === 'running' || j.status === 'assigned').length,
        queuedJobs: jobQueue.length,
        activeWorkers: [...workers.values()].filter(w => w.status === 'online').length,
        totalWorkers: workers.size,
        totalCreditsEarned: [...workers.values()].reduce((s, w) => s + w.credits, 0),
        avgTrustScore: workers.size > 0
            ? Math.round([...workers.values()].reduce((s, w) => s + w.trustScore, 0) / workers.size) : 0,
        successRate: total > 0 ? Math.round((completed / total) * 100) : 0
    };
}

function broadcastUpdate() {
    // Only broadcast online workers to match the REST API behaviour
    const onlineWorkers = [...workers.values()].filter(w => w.status === 'online');
    io.emit('update', {
        workers: onlineWorkers,
        jobs: [...jobs.values()].reverse().slice(0, 50),
        stats: getStats()
    });
}

io.on('connection', (socket) => {
    console.log('📡 Dashboard connected');
    const onlineWorkers = [...workers.values()].filter(w => w.status === 'online');
    socket.emit('update', {
        workers: onlineWorkers,
        jobs: [...jobs.values()].reverse().slice(0, 50),
        stats: getStats()
    });
});

// ==================== START ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log('SERVER_READY');
    console.log(`🚀 Server running on port ${PORT}`);
});