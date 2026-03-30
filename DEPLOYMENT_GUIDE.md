# SharingIsCaring - Connection & Worker Assignment Fix Guide

## 🔧 Issues Fixed

### 1. ✅ Auto-Connection When Hosted Later
**Problem**: After deploying to production, users had to manually update the server URL in code.

**Solution**: 
- Added `.server-config.json` for server URL configuration
- Added environment variable support: `CENTRAL_SERVER` 
- Added automatic fallback with exponential backoff retry logic
- Worker now retries registration up to 20 times with exponential backoff (3s → 2m max)

**How to Use**:
```bash
# Option A: Update .server-config.json (easiest)
# Edit .server-config.json and set your server URL:
{
  "serverUrl": "https://your-app.onrender.com"
}

# Option B: Environment variable (for CI/CD)
export CENTRAL_SERVER="https://your-app.onrender.com"
npm start

# Option C: System environment (Windows)
setx CENTRAL_SERVER "https://your-app.onrender.com"
```

---

### 2. ✅ Multiple Users Not Visible as Workers
**Problem**: Dashboard users (accessing the UI) were being registered as workers, cluttering the worker list with non-functional entries.

**Solution**:
- Separated `/register` endpoint (ONLY for actual worker processes)
- Added `/register-ui` endpoint (for dashboard-only users)
- Dashboard UI now connects via Socket.io without registering as a worker
- Only real workers (with capabilities like CPU/GPU) appear in the worker list

**Result**: 
- Dashboard shows ONLY actual computing resources
- Non-workers cannot be assigned jobs
- Cleaner, more accurate worker list

---

### 3. ✅ Tasks Assigned to Only One Worker
**Problem**: If worker-list was polluted with non-workers, tasks only went to the few visible workers.

**Solution**:
- Fixed worker filtering to show only online, capable workers
- Improved round-robin scheduling to fairly distribute across all available workers
- Added job history tracking to avoid re-assigning same files to same worker
- Added worker preference for jobs with different file signatures

**How Tasks Are Now Assigned**:
1. **User-Targeted**: If user selects a specific worker, task goes there (if available)
2. **Auto-Assign**: Round-robin across all available workers
3. **Load Balancing**: Prefers less-used workers
4. **File Diversity**: Avoids re-running same files on same worker

---

## 🚀 Deployment Checklist

### For Render / Railway / Heroku
1. Deploy your server to your platform
2. Get your public URL (e.g., `https://sharingiscaring.onrender.com`)
3. Update `.server-config.json`:
   ```json
   {
     "serverUrl": "https://your-app.onrender.com"
   }
   ```
4. Or set environment variable:
   ```
   CENTRAL_SERVER=https://your-app.onrender.com
   ```
5. Rebuild/restart the app

### Local Testing
```bash
# Terminal 1: Start server
npm run server

# Terminal 2: Start Electron app
npm start

# Terminal 3 (optional): Start additional worker
WORKER_PORT=4001 WORKER_URL=http://localhost:4001 npm run worker
```

---

## 📊 Monitoring Worker Health

The server now logs:
- ✅ Worker registrations with capabilities
- 👤 Dashboard user connections
- ⚠️ Worker timeouts (30s no heartbeat = offline)
- 🗑️ Automatic cleanup of dead workers (2min+)
- 🚀 Job assignments with scheduling details
- 📡 Broadcast updates with counts

Check logs for:
```
✅ Worker registered (2 total): http://192.168.1.100:4000
👤 Dashboard user connected (1 UI users)
📡 Broadcast: 2 workers, 1 dashboard users, 3 queued jobs
```

---

## 🔍 Troubleshooting

### "No workers visible on dashboard"
1. Ensure worker process is running: `npm run worker`
2. Check firewall: Port 4000 must be open
3. Check server connectivity: Worker should show `✅ Registered`
4. If offline: Check console logs for registration errors

### "Tasks stuck in queue"
1. Verify at least one worker shows "online" status
2. Check worker console: Should show `✅ Registered` and heartbeats
3. If worker is busy: Wait or submit tasks to different files

### "Server can't find deployed URL"
1. Update `.server-config.json` with correct URL
2. Or set `CENTRAL_SERVER` environment variable
3. Restart Electron app (`npm start`)
4. Check console: Should show `[Config] Loaded server URL...`

### "Worker reconnection slow"
- Worker uses exponential backoff: 3s, 6s, 12s, 24s... (max 2min)
- This is intentional to avoid overwhelming the server
- Normal: Takes 30-60 seconds to reconnect after server restart

---

## 📈 Server Statistics

Dashboard now tracks:
- **activeWorkers**: Count of online, ready-to-work instances
- **totalWorkers**: Same as activeWorkers (only actual workers)
- **dashboardConnections**: UI-only users watching (not counted as workers)
- **totalCreditsEarned**: Sum across all workers
- **avgTrustScore**: Average trust score of online workers
- **successRate**: Percentage of completed vs failed jobs

---

## 🔐 Security Notes

- Worker registration requires matching `workerUrl` and `capabilities`
- Dashboard users are isolated (can't be assigned jobs)
- Worker heartbeat validates online status (30s timeout)
- Dead workers automatically removed after 2 minutes
- Job history prevents infinite reassignment loops

---

## 📝 API Reference

### Worker Registration
```
POST /register
Body: { workerUrl, capabilities }
Response: { status, trustScore, credits }
```

### Dashboard Registration (New)
```
POST /register-ui
Response: { status: "dashboard_user", sessionId }
```

### Worker Heartbeat
```
POST /heartbeat
Body: { workerUrl }
Response: { status: "ok" }
```

### Get Workers (Real-time via Socket.io)
```
socket.on('update', (data) => {
  console.log(data.workers);  // Only actual workers
  console.log(data.stats.dashboardConnections);  // UI users
})
```

---

## 🎯 Next Steps

1. **Deploy**: Get server URL from your hosting platform
2. **Configure**: Update `.server-config.json`
3. **Test**: Run with `npm start`
4. **Monitor**: Check server logs for worker registrations
5. **Scale**: Add more worker processes to distribute load
