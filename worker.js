const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const axios = require('axios');
const os = require('os');

const app = express();
app.use(express.json());

const PORT = process.env.WORKER_PORT || 4000;
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const workerUrl = process.env.WORKER_URL || `http://localhost:${PORT}`;

// ==================== REGISTER ====================
async function registerWorker() {
    try {
        await axios.post(`${SERVER_URL}/register`, {
            workerUrl,
            capabilities: {
                cpu: os.cpus().length
            }
        });
        console.log('✅ Registered');
    } catch (e) {
        console.log('❌ Register failed');
    }
}

async function heartbeat() {
    try {
        await axios.post(`${SERVER_URL}/heartbeat`, { workerUrl });
    } catch {}
}

setInterval(heartbeat, 5000);
setInterval(registerWorker, 20000);

// ==================== EXECUTION ====================
app.post('/execute', async (req, res) => {
    const { jobId, chunkId, serverUrl } = req.body;

    res.json({ status: 'accepted' });

    console.log(`⚡ Running chunk ${chunkId}`);

    // Simulate work
    setTimeout(async () => {
        const result = `Result from ${workerUrl} for chunk ${chunkId}`;

        await axios.post(`${serverUrl}/job-update`, {
            jobId,
            chunkId,
            status: 'completed',
            result
        });

    }, 2000 + Math.random() * 3000);
});

// ==================== START ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Worker running at ${workerUrl}`);
    registerWorker();
});