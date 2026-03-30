# SharingIsCaring — Decentralized Idle Compute Sharing Platform

A secure platform that allows students and developers to share idle GPU/CPU resources over the internet for AI training and research workloads.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Electron Desktop App                    │
│  ┌──────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  System   │  │   Dashboard UI   │  │  Worker Toggle │  │
│  │  Tray     │  │  (index.html)    │  │               │  │
│  └──────────┘  └────────┬─────────┘  └───────┬───────┘  │
│                         │ Socket.IO           │ IPC      │
│                ┌────────▼─────────┐  ┌───────▼───────┐  │
│                │   Server.js       │  │  Worker.js     │  │
│                │  (Express+Socket) │  │  (Compute)     │  │
│                └──────────────────┘  └───────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Features

| Feature | Description |
|---------|-------------|
| **Task Execution** | Upload Python scripts + datasets, execute on remote workers |
| **Docker Containerization** | Jobs run in isolated `python:3.10-slim` containers |
| **Trust & Verification** | Trust scores (0-100) based on job completion history |
| **Credit System** | Workers earn credits for completed jobs |
| **Fair Scheduling** | Jobs assigned to highest-trust available worker |
| **Fault Tolerance** | Heartbeat monitoring, automatic job re-queuing on worker dropout |
| **Real-time Dashboard** | Socket.IO powered live updates of workers, jobs, and stats |
| **Desktop App** | Electron wrapper with system tray and one-click worker toggle |

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- Docker Desktop (optional, for containerized execution)

### Install
```bash
npm install
```

### Run as Desktop App
```bash
npm start
```

### Run Headless (Server + Worker separately)
```bash
# Terminal 1: Start server
npm run server

# Terminal 2: Start worker
npm run worker
```

Then open `http://localhost:3000` in a browser.

## Demo: Training a CNN

1. Launch the app with `npm start`
2. Toggle the Worker switch ON in the sidebar
3. Go to **Submit Job** → upload `ml/cnn_demo.py`
4. Click **Submit Job**
5. Watch the job execute in real-time on the Dashboard

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Register a worker |
| POST | `/heartbeat` | Worker heartbeat |
| POST | `/upload` | Upload files |
| POST | `/upload-output` | Upload task output.zip artifact |
| POST | `/submit-job` | Submit a job |
| POST | `/job-update` | Worker reports job status |
| GET | `/api/workers` | List workers |
| GET | `/api/jobs` | List jobs |
| GET | `/api/stats` | Dashboard stats |
| GET | `/api/status/:id` | Job status |
| GET | `/tasks/:id/download` | Download output.zip for a completed task |

## Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: Vanilla HTML/CSS/JS with glassmorphism dark theme
- **Desktop**: Electron with custom title bar + system tray
- **Containerization**: Docker
- **ML Demos**: PyTorch, NumPy, Pandas

## License

ISC
