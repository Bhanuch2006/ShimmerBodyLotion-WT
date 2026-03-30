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

// ==================== SERVER URL CONFIGURATION ====================
let MANUAL_SERVER_URL = null;
try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '.server-config.json'), 'utf8'));
    if (config.serverUrl) {
        MANUAL_SERVER_URL = config.serverUrl;
        console.log('[Config] Using manual server URL:', MANUAL_SERVER_URL);
    }
} catch {}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// ==================== DATA STORES ====================
const workers = new Map();       // workerUrl -> worker data (ONLY actual workers)
const dashboardUsers = new Map(); // dashboardSessionId -> user data (UI-only, won't execute jobs)
const jobs = new Map();          // jobId -> job data
const jobQueue = [];             // pending job IDs
let roundRobinIndex = 0;         // for fair round-robin scheduling

// ==================== FILE UPLOAD ====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.post('/upload', upload.array('files'), (req, res) => {
    if (!req.files || req.files.length === 0) {
        console.error('❌ Upload failed: No files received');
        return res.status(400).json({ error: 'No files uploaded' });
    }
    
    console.log(`📤 Upload received: ${req.files.length} files`);
    const files = req.files.map(f => {
        const fpath = f.path.replace(/\\/g, '/');
        console.log(`   - ${f.originalname} (${f.size} bytes) -> ${fpath}`);
        return fpath;
    });
    
    console.log(`✅ Upload complete. Files saved to: ${uploadsDir}`);
    res.json({ files });
});

// ==================== WORKER REGISTRATION ====================
// Everyone who opens the app is a worker — no limit
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
        registeredAt: existing ? existing.registeredAt : Date.now(),
        lastAssignedAt: existing ? existing.lastAssignedAt : 0,  // for round-robin
        jobHistory: existing ? existing.jobHistory : []           // track assigned job files
    });

    console.log(`✅ Worker registered (${workers.size} total):`, workerUrl);
    broadcastUpdate();

    res.json({
        status: 'registered',
        trustScore: workers.get(workerUrl).trustScore,
        credits: workers.get(workerUrl).credits
    });
});

// ==================== DASHBOARD UI REGISTRATION ====================
// Dashboard users who are NOT running a worker process
app.post('/register-ui', (req, res) => {
    const sessionId = crypto.randomUUID();
    
    dashboardUsers.set(sessionId, {
        sessionId,
        connectedAt: Date.now(),
        lastActivity: Date.now()
    });
    
    console.log(`👤 Dashboard user connected (${dashboardUsers.size} UI users)`);
    
    res.json({
        status: 'dashboard_user',
        sessionId
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
        }
    }
    res.json({ status: 'ok' });
});

// ==================== UNREGISTER (clean disconnect) ====================
app.post('/unregister', (req, res) => {
    const { workerUrl } = req.body;
    if (workers.has(workerUrl)) {
        const worker = workers.get(workerUrl);
        // Re-queue any active job
        if (worker.currentJob) {
            const job = jobs.get(worker.currentJob);
            if (job && (job.status === 'assigned' || job.status === 'running')) {
                job.status = 'queued';
                job.assignedWorker = null;
                job.retries++;
                jobQueue.unshift(job.id);
                console.log('♻️ Re-queued job from disconnecting worker:', job.id);
            }
        }
        workers.delete(workerUrl);
        console.log(`👋 Worker unregistered (${workers.size} total):`, workerUrl);
        broadcastUpdate();
        processQueue();
    }
    res.json({ status: 'ok' });
});

// ==================== JOB SUBMISSION ====================
app.post('/submit-job', (req, res) => {
    const { files, submittedBy, targetWorker } = req.body;
    if (!files || files.length === 0) {
        console.error('❌ Job submission failed: No files provided');
        return res.status(400).json({ error: 'No files provided' });
    }

    const jobId = crypto.randomUUID();
    const fileSignature = files.map(f => path.basename(f)).sort().join('|');
    
    console.log(`📋 Job submitted: ${jobId}`);
    console.log(`   Files: ${files.map(f => path.basename(f)).join(', ')}`);
    console.log(`   By: ${submittedBy || 'unknown'}`);
    
    const job = {
        id: jobId, files, status: 'queued',
        submittedAt: Date.now(), assignedWorker: null,
        startedAt: null, completedAt: null,
        result: null, error: null, retries: 0,
        submittedBy: submittedBy || 'unknown',
        targetWorker: targetWorker || null,  // user-selected worker URL
        fileSignature
    };

    jobs.set(jobId, job);
    jobQueue.push(jobId);
    console.log('📥 Job queued:', jobId, targetWorker ? `→ targeted: ${targetWorker}` : '→ auto-assign');
    broadcastUpdate();
    processQueue();

    res.json({ jobId, status: 'queued' });
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
            worker.trustScore = Math.min(100, worker.trustScore + 2);
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
            worker.trustScore = Math.max(0, worker.trustScore - 5);
            worker.currentJob = null;
        }
        console.log('❌ Job failed:', jobId);
    }

    broadcastUpdate();
    processQueue();
    res.json({ status: 'ok' });
});

// ==================== SMART SCHEDULER ====================
// Supports: user-targeted assignment + fair round-robin fallback
function processQueue() {
    if (jobQueue.length === 0) return;

    const serverUrl = getServerUrl();
    const toRetry = []; // jobs whose target worker is busy — retry later

    while (jobQueue.length > 0) {
        const jobId = jobQueue[0];
        const job = jobs.get(jobId);
        if (!job) { jobQueue.shift(); continue; }

        let selectedWorker = null;

        if (job.targetWorker) {
            // ── USER CHOSE A SPECIFIC WORKER ──
            const target = workers.get(job.targetWorker);
            if (target && target.status === 'online' && !target.currentJob) {
                selectedWorker = target;
            } else if (target && target.status === 'online' && target.currentJob) {
                // Target is busy — skip for now, retry later
                jobQueue.shift();
                toRetry.push(jobId);
                continue;
            } else {
                // Target is offline — fall back to auto-assign
                console.log('⚠️ Target worker offline, auto-assigning:', job.targetWorker);
                job.targetWorker = null;
            }
        }

        if (!selectedWorker) {
            // ── AUTO-ASSIGN: round-robin, avoid repeats ──
            const available = [...workers.values()]
                .filter(w => w.status === 'online' && !w.currentJob)
                .sort((a, b) => a.lastAssignedAt - b.lastAssignedAt);

            if (available.length === 0) break;

            // Prefer a worker who hasn't run the same files
            for (const w of available) {
                if (!w.jobHistory.includes(job.fileSignature)) {
                    selectedWorker = w;
                    break;
                }
            }
            // Fallback: least recently used
            if (!selectedWorker) selectedWorker = available[0];
        }

        if (!selectedWorker) break;

        jobQueue.shift();
        job.status = 'assigned';
        job.assignedWorker = selectedWorker.url;
        selectedWorker.currentJob = jobId;
        selectedWorker.lastAssignedAt = Date.now();

        // Track job history (keep last 20)
        selectedWorker.jobHistory.push(job.fileSignature);
        if (selectedWorker.jobHistory.length > 20) {
            selectedWorker.jobHistory = selectedWorker.jobHistory.slice(-20);
        }

        const workerName = selectedWorker.capabilities?.hostname || selectedWorker.url;
        console.log('🚀 Assigning job', jobId, 'to', workerName,
            job.targetWorker ? '(user-selected)' : '(auto)');

        axios.post(`${selectedWorker.url}/execute`, {
            jobId: job.id,
            files: job.files,
            serverUrl
        }).catch(err => {
            console.error('❌ Failed to dispatch to worker:', selectedWorker.url, err.message);
            job.status = 'queued';
            job.assignedWorker = null;
            selectedWorker.currentJob = null;
            selectedWorker.status = 'offline';
            jobQueue.unshift(jobId);
            broadcastUpdate();
            setTimeout(processQueue, 2000);
        });
    }

    // Put back jobs whose target was busy
    for (const id of toRetry) jobQueue.push(id);
    if (toRetry.length > 0) setTimeout(processQueue, 3000);

    broadcastUpdate();
}

// ==================== WORKER HEALTH MONITOR ====================
setInterval(() => {
    const now = Date.now();
    let changed = false;

    for (const [url, worker] of workers) {
        // Mark offline after 30s no heartbeat
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

        // REMOVE worker entirely after 2 min of no heartbeat (ghost cleanup)
        if (now - worker.lastHeartbeat > 120000) {
            console.log('🗑️ Removing dead worker:', url);
            workers.delete(url);
            changed = true;
        }
    }

    // Clean up inactive dashboard users (5 min timeout)
    for (const [id, user] of dashboardUsers) {
        if (now - user.lastActivity > 300000) {
            dashboardUsers.delete(id);
            console.log('🗑️ Removed inactive dashboard user:', id);
            changed = true;
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
    res.json({
        status: 'ok',
        serverUrl,
        uploadDir: uploadsDir,
        uploadsExist: fs.existsSync(uploadsDir),
        filesInUploads: fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).length : 0
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

// ==================== SOCKET.IO REAL-TIME ====================
function getStats() {
    const allJobs = [...jobs.values()];
    const onlineWorkers = [...workers.values()].filter(w => w.status === 'online');
    const completed = allJobs.filter(j => j.status === 'completed').length;
    const total = allJobs.length;
    return {
        totalJobs: total,
        completedJobs: completed,
        failedJobs: allJobs.filter(j => j.status === 'failed').length,
        runningJobs: allJobs.filter(j => j.status === 'running' || j.status === 'assigned').length,
        queuedJobs: jobQueue.length,
        activeWorkers: onlineWorkers.length,
        totalWorkers: onlineWorkers.length,
        dashboardConnections: dashboardUsers.size,
        totalCreditsEarned: onlineWorkers.reduce((s, w) => s + w.credits, 0),
        avgTrustScore: onlineWorkers.length > 0
            ? Math.round(onlineWorkers.reduce((s, w) => s + w.trustScore, 0) / onlineWorkers.length) : 0,
        successRate: total > 0 ? Math.round((completed / total) * 100) : 0
    };
}

function broadcastUpdate() {
    // Only broadcast actual workers (those who can execute jobs)
    const onlineWorkers = [...workers.values()].filter(w => w.status === 'online');
    io.emit('update', {
        workers: onlineWorkers,
        jobs: [...jobs.values()].reverse().slice(0, 50),
        stats: getStats()
    });
    
    console.log(`📡 Broadcast: ${onlineWorkers.length} workers, ${dashboardUsers.size} dashboard users, ${[...jobs.values()].filter(j => j.status === 'queued').length} queued jobs`);
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

// ==================== HELPER ====================
function getServerUrl() {
    // Priority 1: Render auto-provides this URL
    if (process.env.RENDER_EXTERNAL_URL) {
        console.log('[Server] Using Render URL:', process.env.RENDER_EXTERNAL_URL);
        return process.env.RENDER_EXTERNAL_URL;
    }
    
    // Priority 2: Manual PUBLIC_URL environment variable
    if (process.env.PUBLIC_URL) {
        console.log('[Server] Using PUBLIC_URL env:', process.env.PUBLIC_URL);
        return process.env.PUBLIC_URL;
    }

    // Priority 3: Manual override from config file
    if (MANUAL_SERVER_URL) {
        console.log('[Server] Using config serverUrl:', MANUAL_SERVER_URL);
        return MANUAL_SERVER_URL;
    }

    // Priority 4: Auto-detect from local network (avoid virtual networks)
    const virtualPrefixes = ['172.', '169.254', '127.', '10.0.8'];
    const preferredNames = ['Ethernet', 'Wi-Fi', 'en0', 'en1', 'eth0', 'wlan0'];
    const nets = os.networkInterfaces();
    
    // Try preferred interfaces first
    for (const name of preferredNames) {
        if (nets[name]) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal && !virtualPrefixes.some(p => net.address.startsWith(p))) {
                    const url = `http://${net.address}:${PORT}`;
                    console.log(`[Server] Using Network: ${name} (${net.address})`);
                    return url;
                }
            }
        }
    }
    
    // Fallback: check all, skip virtual
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal && !virtualPrefixes.some(p => net.address.startsWith(p))) {
                const url = `http://${net.address}:${PORT}`;
                console.log(`[Server] Using Network: ${name} (${net.address})`);
                return url;
            }
        }
    }
    
    console.log('[Server] ⚠️ No physical network found, using localhost');
    return `http://localhost:${PORT}`;
}

// ==================== START ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log('SERVER_READY');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Server URL: ${getServerUrl()}`);
    console.log(`📡 No worker limit — everyone who connects is a worker`);
});