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

// ==================== CLOUDINARY SETUP (Optional) ====================
let cloudinary = null;
try {
    cloudinary = require('cloudinary').v2;
    
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
    
    if (cloudinary.config().cloud_name) {
        console.log(`☁️ Cloudinary configured: ${cloudinary.config().cloud_name}`);
    } else {
        cloudinary = null; // Not configured
        console.log('📦 Cloudinary credentials not set, using fallback disk storage');
    }
} catch (err) {
    console.log('📦 Cloudinary not installed, using fallback disk storage');
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

// ==================== DATA STORES ====================
const workers = new Map();
const jobs = new Map();
const jobQueue = [];

// ==================== FILE UPLOAD ====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.post('/upload', upload.array('files'), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }
    const files = req.files.map(f => f.path.replace(/\\/g, '/'));
    res.json({ files });
});

// ==================== WORKER REGISTRATION ====================
app.post('/register', (req, res) => {
    const { workerUrl, capabilities } = req.body;
    const existing = workers.get(workerUrl);

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
        registeredAt: existing ? existing.registeredAt : Date.now()
    });

    console.log(`✅ Worker registered (${workers.size} total):`, workerUrl);
    console.log(`   Status: online, currentJob: null, lastAssignedAt: 0`);
    if (jobQueue.length > 0) {
        console.log(`   🔄 ${jobQueue.length} jobs queued - attempting assignment`);
    }
    broadcastUpdate();
    processQueue();  // Assign any queued jobs to the newly joined worker

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
            console.log('💚 Worker back online:', workerUrl);
            broadcastUpdate();
            processQueue();  // Assign queued jobs to the worker that just came back online
        }
    }
    res.json({ status: 'ok' });
});

// ==================== JOB SUBMISSION ====================
app.post('/submit-job', (req, res) => {
    const { files, description, resources_required } = req.body;
    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
    }

    const jobId = crypto.randomUUID();
    const job = {
        id: jobId, files, status: 'queued',
        description: description || 'No description provided',
        resources_required: resources_required || { cpu: 1, ram: 0.5, gpu: false },
        submittedAt: Date.now(), assignedWorker: null,
        startedAt: null, completedAt: null,
        result: null, error: null, retries: 0
    };

    jobs.set(jobId, job);
    jobQueue.push(jobId);
    console.log('📥 Job queued:', jobId);
    broadcastUpdate();

    res.json({ jobId, status: 'queued' });
});

// ==================== POLL-BASED JOB ASSIGNMENT ====================
// Workers call this endpoint to pull jobs (works behind NAT/firewalls)
app.post('/poll-job', (req, res) => {
    const { workerUrl } = req.body;
    const worker = workers.get(workerUrl);
    
    if (!worker) {
        return res.status(404).json({ job: null, error: 'Worker not registered' });
    }
    
    // Update heartbeat on poll
    worker.lastHeartbeat = Date.now();
    if (worker.status === 'offline') {
        worker.status = 'online';
        console.log('💚 Worker back online (via poll):', workerUrl);
        broadcastUpdate();
    }
    
    // If worker is already busy, no job
    if (worker.currentJob) {
        return res.json({ job: null });
    }
    
    // No jobs in queue
    if (jobQueue.length === 0) {
        return res.json({ job: null });
    }
    
    const serverUrl = getServerUrl();
    
    // Find a suitable job for this worker
    for (let i = 0; i < jobQueue.length; i++) {
        const jobId = jobQueue[i];
        const job = jobs.get(jobId);
        if (!job) { jobQueue.splice(i, 1); i--; continue; }
        
        if (job.targetWorker && job.targetWorker !== workerUrl) {
            continue;
        }
        
        // If job targets a specific worker that's offline, allow any worker
        if (job.targetWorker && job.targetWorker === workerUrl) {
            // Perfect match
        } else if (job.targetWorker) {
            // Check if targeted worker is offline — if so, clear target
            const target = workers.get(job.targetWorker);
            if (!target || target.status === 'offline') {
                console.log('⚠️ Target worker offline, allowing any worker:', job.targetWorker);
                job.targetWorker = null;
            } else {
                continue; // Target worker is online, skip this job for other workers
            }
        }
        
        // Assign this job
        jobQueue.splice(i, 1);
        job.status = 'assigned';
        job.assignedWorker = workerUrl;
        worker.currentJob = jobId;
        worker.lastAssignedAt = Date.now();
        
        // Track job history (keep last 20)
        worker.jobHistory.push(job.fileSignature);
        if (worker.jobHistory.length > 20) {
            worker.jobHistory = worker.jobHistory.slice(-20);
        }
        
        const workerName = worker.capabilities?.hostname || workerUrl;
        console.log('🚀 Assigning job', jobId.substring(0, 8), 'to', workerName,
            job.targetWorker ? '(user-selected)' : '(auto via poll)');
        
        broadcastUpdate();
        
        return res.json({
            job: {
                jobId: job.id,
                files: job.files,
                serverUrl
            }
        });
    }
    
    // No suitable job found
    res.json({ job: null });
});

// ==================== JOB STATUS UPDATE (from worker) ====================
app.post('/job-update', (req, res) => {
    const { jobId, status, result, error } = req.body;
    const job = jobs.get(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    job.status = status;

    if (status === 'running') {
        job.startedAt = Date.now();
    } else if (status === 'completed') {
        job.completedAt = Date.now();
        job.result = result;
        const worker = workers.get(job.assignedWorker);
        if (worker) {
            worker.jobsCompleted++;
            worker.trustScore = Math.min(100, worker.trustScore + 5);
            worker.credits += 10;
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
        // Handle worker node dynamically rejecting the 60-second offer
        const worker = workers.get(job.assignedWorker);
        if (worker) {
            // Apply slight penalty to trust score, or no penalty
            worker.trustScore = Math.max(0, worker.trustScore - 2); 
            worker.currentJob = null;
        }
        job.status = 'queued';
        job.assignedWorker = null;
        job.retries++;
        jobQueue.unshift(job.id); // Put back to front of queue
        console.log('↩️ Job rejected, returned to queue:', jobId);
    }

    broadcastUpdate();
    processQueue();
    res.json({ status: 'ok' });
});

// ==================== QUEUE MONITOR ====================
// With pull-based model, processQueue just logs status.
// Actual assignment happens in /poll-job when workers poll.
function processQueue() {
    if (jobQueue.length === 0) return;
    const onlineWorkers = [...workers.values()].filter(w => w.status === 'online' && !w.currentJob);
    console.log(`📊 Queue status: ${jobQueue.length} pending, ${onlineWorkers.length} idle workers (will be assigned on next poll)`);
}

// ==================== FAULT TOLERANCE: HEARTBEAT MONITOR ====================
setInterval(() => {
    const now = Date.now();
    let changed = false;

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
    }

    if (changed) {
        broadcastUpdate();
        processQueue();
    }
}, 10000);

// ==================== REST API ====================
app.get('/api/workers', (req, res) => {
    // Only return online workers
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
    
    res.json({
        status: 'ok',
        serverUrl,
        storage,
        cloudName
    });
});
app.get('/api/jobs', (req, res) => res.json([...jobs.values()].reverse()));
app.get('/api/stats', (req, res) => res.json(getStats()));
app.get('/api/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
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

// ==================== SOCKET.IO REAL-TIME ====================
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
    io.emit('update', {
        workers: [...workers.values()],
        jobs: [...jobs.values()].reverse().slice(0, 50),
        stats: getStats()
    });
}

io.on('connection', (socket) => {
    console.log('📡 Dashboard connected');
    socket.emit('update', {
        workers: [...workers.values()],
        jobs: [...jobs.values()].reverse().slice(0, 50),
        stats: getStats()
    });
});

// ==================== START ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('SERVER_READY');
    console.log(`🚀 Server running on port ${PORT}`);
});
