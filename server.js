const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// ==================== DATA STORES ====================
const workers = new Map();
const jobs = new Map();
const jobQueue = [];
const MAX_WORKERS = 2; // Only 2 devices can connect

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

app.post('/register', (req, res) => {
    const { workerUrl, capabilities } = req.body;
    const existing = workers.get(workerUrl);

    // Enforce 2-device limit (allow re-registration of existing workers)
    if (!existing && workers.size >= MAX_WORKERS) {
        console.log(`⚠️ Worker rejected (limit ${MAX_WORKERS}):`, workerUrl);
        return res.status(403).json({
            error: `Maximum ${MAX_WORKERS} devices allowed. Pool is full.`,
            status: 'rejected'
        });
    }

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

    console.log(`✅ Worker registered (${workers.size}/${MAX_WORKERS}):`, workerUrl);
    broadcastUpdate();

    res.json({
        status: 'registered',
        trustScore: workers.get(workerUrl).trustScore,
        credits: workers.get(workerUrl).credits
    });
});

app.post('/heartbeat', (req, res) => {
    const { workerUrl } = req.body;
    const worker = workers.get(workerUrl);
    if (worker) {
        worker.lastHeartbeat = Date.now();
        if (worker.status === 'offline') {
            worker.status = 'online';
            console.log('💚 Worker back online:', workerUrl);
            broadcastUpdate();
        }
    }
    res.json({ status: 'ok' });
});

app.post('/submit-job', (req, res) => {
    const { files } = req.body;
    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
    }

    const jobId = crypto.randomUUID();
    const job = {
        id: jobId, files, status: 'queued',
        submittedAt: Date.now(), assignedWorker: null,
        startedAt: null, completedAt: null,
        result: null, error: null, retries: 0
    };

    jobs.set(jobId, job);
    jobQueue.push(jobId);
    console.log('📥 Job queued:', jobId);
    broadcastUpdate();
    processQueue();

    res.json({ jobId, status: 'queued' });
});

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
    }

    broadcastUpdate();
    processQueue();
    res.json({ status: 'ok' });
});

function processQueue() {
    if (jobQueue.length === 0) return;

    const available = [...workers.values()]
        .filter(w => w.status === 'online' && !w.currentJob)
        .sort((a, b) => b.trustScore - a.trustScore);

    if (available.length === 0) return;

    while (jobQueue.length > 0 && available.length > 0) {
        const jobId = jobQueue.shift();
        const job = jobs.get(jobId);
        const worker = available.shift();
        if (!job) continue;

        job.status = 'assigned';
        job.assignedWorker = worker.url;
        worker.currentJob = jobId;

        console.log('🚀 Assigning job', jobId, 'to', worker.url);

        // Use the server's actual IP so remote workers can report back
        const localIP = getServerIP();
        axios.post(`${worker.url}/execute`, {
            jobId: job.id,
            files: job.files,
            serverUrl: `http://${localIP}:${PORT}`
        }).catch(err => {
            console.error('❌ Failed to dispatch to worker:', worker.url, err.message);
            job.status = 'queued';
            job.assignedWorker = null;
            worker.currentJob = null;
            worker.status = 'offline';
            worker.trustScore = Math.max(0, worker.trustScore - 5);
            jobQueue.unshift(jobId);
            broadcastUpdate();
            setTimeout(processQueue, 2000);
        });
    }
    broadcastUpdate();
}

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

app.get('/api/workers', (req, res) => res.json([...workers.values()]));
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

// ==================== HELPER ====================
function getServerIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal && net.address.startsWith('192.168.')) {
                return net.address;
            }
        }
    }
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return 'localhost';
}

// ==================== START ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log('SERVER_READY');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Max workers: ${MAX_WORKERS}`);
});