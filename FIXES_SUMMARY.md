# SharingIsCaring - Quick Fix Summary

## What Changed & Why

### Problem 1: Auto-Connection When Server is Deployed
**Before**: Server URL was hardcoded to `https://sharingiscaring.onrender.com`
- Required manual code changes for each deployment
- Workers couldn't find custom-deployed servers
- No retry logic if server was temporarily down

**After**: 
- `main.js` now reads from `.server-config.json` file first
- Falls back to `CENTRAL_SERVER` environment variable
- Has exponential backoff retry (3s → 2min max)
- Workers automatically reconnect when server is back online

**To Use**:
```json
// .server-config.json
{
  "serverUrl": "https://your-deployed-server.onrender.com"
}
```

---

### Problem 2: Non-Workers Shown as Workers
**Before**: ANY connection to the dashboard registered as a "worker"
- Dashboard UI users appeared in the worker list
- They clogged up the display
- They couldn't execute jobs but still took up space

**After**:
- Workers register via `/register` endpoint (actual compute nodes with `/execute` capability)
- Dashboard users connect via Socket.io without registering as workers
- Clean separation: dashboard UIs ≠ worker processes
- Stats now show `dashboardConnections` separately from `totalWorkers`

**Files Changed**:
- `server.js`: Added `dashboardUsers` map, separate `/register-ui` endpoint
- Backend now only broadcasts actual workers to dashboard

---

### Problem 3: Tasks Only Going to One Worker
**Before**: If worker list had many non-workers, only real workers got tasks
- Round-robin scheduling was based on polluted worker list
- Limited distribution because only 1-2 actual workers visible

**After**:
- Only actual workers are considered for scheduling
- Better round-robin across all real workers
- Job history prevents re-assigning same files to same worker (improves caching)
- Worker load balancing based on `lastAssignedAt` timestamp

**Improved Scheduling Logic**:
```
1. Check if user targeted specific worker → use if available
2. Filter: Only online workers with no current jobs
3. Prefer: Workers who haven't run this file before
4. Fallback: Least recently used worker
5. Broadcast update → triggers next job from queue
```

---

## Files Modified

| File | Changes |
|------|---------|
| `main.js` | Added `.server-config.json` reading, improved worker restart logic with exponential backoff |
| `worker.js` | Added registration retry logic (up to 20 attempts with exponential backoff) |
| `server.js` | Separated workers from UI users, improved stats tracking, better health monitoring |
| `.server-config.json` | **NEW**: Server URL configuration file |
| `DEPLOYMENT_GUIDE.md` | **NEW**: Complete deployment & troubleshooting guide |
| `README.md` | Added reference to deployment guide |

---

## How to Deploy Now

### Step 1: Deploy Server
```bash
# Push to Render, Railway, Heroku, etc.
git push heroku main
# Get your public URL: https://your-app.onrender.com
```

### Step 2: Update Configuration
Edit `.server-config.json`:
```json
{
  "serverUrl": "https://your-app.onrender.com"
}
```

### Step 3: Rebuild & Restart
```bash
npm start
```

That's it! The app will now:
- ✅ Auto-discover your server
- ✅ Retry if server is down
- ✅ Show only real workers
- ✅ Distribute tasks fairly

---

## Monitoring

Watch the server logs for:

```
✅ Worker registered (2 total): http://192.168.1.100:4000
📡 Broadcast: 2 workers, 1 dashboard users, 3 queued jobs
🚀 Assigning job to Worker-1 (auto)
```

This tells you:
- 2 actual workers are online and ready
- 1 person is watching the dashboard
- 3 jobs waiting to be assigned

---

## Testing Locally

```bash
# Terminal 1: Start server
npm run server

# Terminal 2: Start app
npm start

# Terminal 3: Start test worker
WORKER_PORT=4001 WORKER_URL=http://localhost:4001 npm run worker
```

Upload a job → should assign to either worker → shows in dashboard → completes

---

## What's Coming

Future improvements could include:
- Worker CPU/memory quotas
- Job timeout limits
- Worker blacklisting
- Advanced scheduling (priority, deadline-based)
- Multi-region servers

---

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for detailed troubleshooting!
