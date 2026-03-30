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
const { Readable } = require('stream');

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
        console.log('📦 Cloudinary credentials not set, using fallback storage');
    }
} catch (err) {
    console.log('📦 Cloudinary not installed, using fallback storage');
    cloudinary = null;
}

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

// ==================== DATA STORES ====================
const workers = new Map();       // workerUrl -> worker data (ONLY actual workers)
const dashboardUsers = new Map(); // dashboardSessionId -> user data (UI-only, won't execute jobs)
const jobs = new Map();          // jobId -> job data
const jobQueue = [];             // pending job IDs
let roundRobinIndex = 0;         // for fair round-robin scheduling

// ==================== FILE UPLOAD ====================
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

// Store file data/URLs
const fileUrls = new Map(); // filename -> cloudinary_url or fallback data
const fileBuffers = new Map(); // filename -> buffer (fallback)

app.post('/upload', upload.array('files'), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        console.error('❌ Upload failed: No files received');
        return res.status(400).json({ error: 'No files uploaded' });
    }
    
    console.log(`📤 Uploading: ${req.files.length} files`);
    const files = [];
    
    try {
        for (const file of req.files) {
            const fileName = `${Date.now()}-${file.originalname}`;
            
            // Try Cloudinary if available
            if (cloudinary) {
                await new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        {
                            resource_type: 'auto',
                            public_id: fileName.replace(/\./g, '-'),
                            folder: 'sharingiscaring-uploads'
                        },
                        (error, result) => {
                            if (error) reject(error);
                            else {
                                console.log(`   ✅ ${file.originalname} -> Cloudinary`);
                                fileUrls.set(fileName, result.secure_url);
                                files.push(`uploads/${fileName}`);
                                resolve();
                            }
                        }
                    );
                    stream.end(file.buffer);
                });
            } else {
                // Fallback: Store in memory
                fileBuffers.set(fileName, file.buffer);
                fileUrls.set(fileName, `memory://${fileName}`);
                files.push(`uploads/${fileName}`);
                console.log(`   ✅ ${file.originalname} -> Memory Storage`);
            }
        }
        
        console.log(`✅ Upload complete. ${files.length} files uploaded.`);
        res.json({ files });
    } catch (err) {
        console.error('❌ Upload failed:', err.message);
        res.status(500).json({ error: 'Upload failed: ' + err.message });
    }
});

// ==================== FILE DOWNLOAD ====================
app.get('/uploads/:filename', async (req, res) => {
    try {
        const fileName = req.params.filename;
        const url = fileUrls.get(fileName);
        
        if (!url) {
            console.error(`❌ File not found: ${fileName}`);
            return res.status(404).json({ error: 'File not found' });
        }
        
        console.log(`⬇️ Downloading: ${fileName}`);
        
        // If it's a Cloudinary URL, redirect
        if (url.startsWith('http')) {
            return res.redirect(url);
        }
        
        // If it's in memory, serve it
        const buffer = fileBuffers.get(fileName);
        if (buffer) {
            res.setHeader('Content-Length', buffer.length);
            return res.send(buffer);
        }
        
        // Should not reach here
        res.status(404).json({ error: 'File not available' });
    } catch (err) {
        console.error('❌ Download error:', err.message);
        res.status(500).json({ error: 'Download failed' });
    }
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
            processQueue();  // Assign queued jobs to the worker that just came back online
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

// ==================== QUEUE MONITOR ====================
// With pull-based model, processQueue just logs status.
// Actual assignment happens in /poll-job when workers poll.
function processQueue() {
    if (jobQueue.length === 0) return;
    const onlineWorkers = [...workers.values()].filter(w => w.status === 'online' && !w.currentJob);
    console.log(`📊 Queue status: ${jobQueue.length} pending, ${onlineWorkers.length} idle workers (will be assigned on next poll)`);
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
        storage: cloudinary ? 'Cloudinary' : 'Memory (fallback)',
        cloudName: cloudinary ? cloudinary.config().cloud_name : 'N/A'
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