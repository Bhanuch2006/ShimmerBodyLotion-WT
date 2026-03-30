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

// ==================== DATA ====================
const workers = new Map();
const jobs = new Map();
const chunkQueue = [];

const TOTAL_CHUNKS = 4;
const MAX_WORKERS = 5;

// ==================== FILE UPLOAD ====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.post('/upload', upload.array('files'), (req, res) => {
    const files = req.files.map(f => f.path.replace(/\\/g, '/'));
    res.json({ files });
});

// ==================== WORKER ====================
app.post('/register', (req, res) => {
    const { workerUrl, capabilities } = req.body;

    workers.set(workerUrl, {
        url: workerUrl,
        status: 'online',
        lastHeartbeat: Date.now(),
        currentTask: null,
        capabilities
    });

    console.log('✅ Worker registered:', workerUrl);
    res.json({ status: 'ok' });
});

app.post('/heartbeat', (req, res) => {
    const { workerUrl } = req.body;
    const worker = workers.get(workerUrl);
    if (worker) worker.lastHeartbeat = Date.now();
    res.json({ status: 'ok' });
});

// ==================== JOB SUBMISSION ====================
app.post('/submit-job', (req, res) => {
    const { files } = req.body;

    const jobId = crypto.randomUUID();

    const job = {
        id: jobId,
        files,
        status: 'queued',
        totalChunks: TOTAL_CHUNKS,
        completedChunks: 0,
        chunks: Array.from({ length: TOTAL_CHUNKS }, (_, i) => ({
            chunkId: i,
            status: 'pending',
            assignedWorker: null,
            result: null
        }))
    };

    jobs.set(jobId, job);

    // Add chunks to queue
    for (let chunk of job.chunks) {
        chunkQueue.push({
            jobId: job.id,
            chunkId: chunk.chunkId
        });
    }

    console.log('📥 Job split into chunks:', jobId);

    processQueue();

    res.json({ jobId });
});

// ==================== SCHEDULER ====================
function processQueue() {
    const available = [...workers.values()]
        .filter(w => w.status === 'online' && !w.currentTask);

    while (chunkQueue.length > 0 && available.length > 0) {
        const task = chunkQueue.shift();
        const job = jobs.get(task.jobId);
        const worker = available.shift();

        if (!job) continue;

        const chunk = job.chunks.find(c => c.chunkId === task.chunkId);

        chunk.status = 'assigned';
        chunk.assignedWorker = worker.url;
        worker.currentTask = `${task.jobId}_${task.chunkId}`;

        console.log(`🚀 Assign chunk ${chunk.chunkId} → ${worker.url}`);

        axios.post(`${worker.url}/execute`, {
            jobId: job.id,
            chunkId: chunk.chunkId,
            files: job.files,
            serverUrl: `http://${getServerIP()}:${PORT}`
        }).catch(() => {
            console.log('❌ Worker failed, requeue chunk');

            chunk.status = 'pending';
            chunkQueue.push(task);
            worker.currentTask = null;
            worker.status = 'offline';
        });
    }
}

// ==================== RESULT HANDLING ====================
app.post('/job-update', (req, res) => {
    const { jobId, chunkId, status, result } = req.body;

    const job = jobs.get(jobId);
    if (!job) return res.sendStatus(404);

    const chunk = job.chunks.find(c => c.chunkId === chunkId);

    if (status === 'completed') {
        chunk.status = 'completed';
        chunk.result = result;

        job.completedChunks++;

        const worker = workers.get(chunk.assignedWorker);
        if (worker) worker.currentTask = null;

        console.log(`✅ Chunk ${chunkId} done`);

        // FINAL MERGE
        if (job.completedChunks === job.totalChunks) {
            job.status = 'completed';

            job.result = job.chunks
                .map(c => c.result)
                .join('\n\n');

            console.log('🎉 JOB COMPLETED:', jobId);
        }
    }

    processQueue();
    res.json({ status: 'ok' });
});

// ==================== STATUS ====================
app.get('/api/jobs', (req, res) => {
    res.json([...jobs.values()]);
});

app.get('/api/workers', (req, res) => {
    res.json([...workers.values()]);
});

// ==================== HELPER ====================
function getServerIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

// ==================== START ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log('SERVER_READY');
    console.log(`🚀 Server running on ${PORT}`);
});