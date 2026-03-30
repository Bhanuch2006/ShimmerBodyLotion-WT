import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../hooks/useTheme';

const formatDuration = (job) => {
    if (!job?.startedAt) {
        return 'Waiting';
    }

    const elapsed = ((job.completedAt || Date.now()) - job.startedAt) / 1000;
    if (elapsed < 60) {
        return `${elapsed.toFixed(1)}s`;
    }

    return `${(elapsed / 60).toFixed(1)}m`;
};

const shortWorkerName = (worker) => worker?.capabilities?.hostname || worker?.url || 'Unknown worker';
const shortJobId = (id) => (id ? `${id.slice(0, 8)}...` : 'pending');

const Dashboard = () => {
    const { connected, stats, workers, jobs, currentUrl } = useSocket();
    const theme = useTheme();
    const [localWorkerRunning, setLocalWorkerRunning] = useState(false);
    const [workerLog, setWorkerLog] = useState('Local node is resting quietly.');

    const activeWorkersCount = workers.filter((worker) => worker.status === 'online').length;
    const queuedJobs = jobs.filter((job) => job.status === 'queued').length;
    const runningJobs = jobs.filter((job) => job.status === 'running' || job.status === 'assigned').length;
    const floatingJobs = jobs.filter((job) => job.status !== 'completed').slice(0, 4);
    const workerBoard = workers.slice(0, 4);

    useEffect(() => {
        if (!window.electronAPI) {
            return;
        }

        window.electronAPI.onWorkerStatus((running) => {
            setLocalWorkerRunning(running);
        });

        window.electronAPI.onWorkerMessage((message) => {
            if (message.type === 'STATUS') {
                setWorkerLog(message.text);
            }
        });
    }, []);

    return (
        <section className="sec dashboard-page" id="sec-dash">
            <div className="board-layout">
                <article className="card board-intro-card">
                    <div className="board-intro-head">
                        <div>
                            <p className="eyebrow">dashboard</p>
                            <h1 className="stitle">Submission Lounge</h1>
                        </div>
                        <div className={`hero-badge ${connected ? '' : 'is-offline'}`}>
                            {connected ? `Linked to ${currentUrl}` : 'Waiting for a network link'}
                        </div>
                    </div>
                    <div className="board-intro-body">
                        <p className="hero-copy">
                            {theme === 'coquette'
                                ? 'This project lets you send compute tasks, share them across connected devices, and keep track of what is running, finished, or waiting in one simple dashboard.'
                                : 'This project lets you dispatch compute tasks across connected devices and monitor queued work, active runs, and completed jobs from one control board.'}
                        </p>
                        <div className="board-summary-card taped">
                            <span className="si">Board note</span>
                            <strong>{theme === 'coquette' ? 'Pretty to look at, practical to use.' : 'Low noise, high signal.'}</strong>
                            <span className="sl2">
                                {theme === 'coquette'
                                    ? 'Queue, devices, credits, and success stay neatly arranged without the clutter.'
                                    : 'Queue, devices, credits, and success stay visible without burying the useful details.'}
                            </span>
                        </div>
                    </div>

                    <div className="board-curation-row">
                        <div className="board-chip-note sticky-white taped">
                            <span className="si">Focus</span>
                            <strong>{queuedJobs} waiting</strong>
                            <span className="sl2">{theme === 'coquette' ? 'Queue first, then let the clouds float.' : 'Start with the queue, then follow active load.'}</span>
                        </div>
                        <div className="board-chip-note sticky-pink pinned">
                            <span className="si">Mood</span>
                            <strong>{runningJobs} in motion</strong>
                            <span className="sl2">{theme === 'coquette' ? 'A soft board with live movement.' : 'A calm board with active throughput.'}</span>
                        </div>
                        <div className="board-chip-note sticky-mint clipped">
                            <span className="si">Crew</span>
                            <strong>{activeWorkersCount} connected</strong>
                            <span className="sl2">{theme === 'coquette' ? 'Pinned helpers ready to pick things up.' : 'Connected devices are ready for work.'}</span>
                        </div>
                    </div>

                    <div className="stat-note-row">
                        <div className="stat-note pink pinned">
                            <span className="si">Jobs</span>
                            <strong className="sv">{stats.totalJobs}</strong>
                            <span className="sl2">submitted tasks</span>
                        </div>
                        <div className="stat-note white taped">
                            <span className="si">Devices</span>
                            <strong className="sv">{activeWorkersCount}</strong>
                            <span className="sl2">connected now</span>
                        </div>
                        <div className="stat-note mint clipped">
                            <span className="si">Credits</span>
                            <strong className="sv">{stats.totalCreditsEarned}</strong>
                            <span className="sl2">earned so far</span>
                        </div>
                        <div className="stat-note blush">
                            <span className="si">Success</span>
                            <strong className="sv">{stats.successRate}%</strong>
                            <span className="sl2">completed well</span>
                        </div>
                    </div>
                </article>

                <article className="card sticky-cluster-card">
                    <div className="card-head compact">
                        <div>
                            <p className="eyebrow">{theme === 'coquette' ? 'sticky notes' : 'status notes'}</p>
                            <h2 className="card-title">{theme === 'coquette' ? 'Today on the board' : 'Live system notes'}</h2>
                        </div>
                    </div>
                    <div className="sticky-cluster">
                        <div className="sticky-note-card sticky-pink pinned">
                            <strong>Queue</strong>
                            <span>{queuedJobs} tasks waiting for pickup.</span>
                            <em>{theme === 'coquette' ? 'Next up on the board' : 'Awaiting assignment'}</em>
                        </div>
                        <div className="sticky-note-card sticky-white taped">
                            <strong>Running</strong>
                            <span>{theme === 'coquette' ? `${runningJobs} little clouds are moving.` : `${runningJobs} active jobs are currently in motion.`}</span>
                            <em>{theme === 'coquette' ? 'Live activity' : 'Current throughput'}</em>
                        </div>
                        <div className="sticky-note-card sticky-mint clipped">
                            <strong>Workers</strong>
                            <span>{theme === 'coquette' ? `${workers.length} devices pinned to the lounge.` : `${workers.length} devices are registered on the network.`}</span>
                            <em>{theme === 'coquette' ? 'Available helpers' : 'Compute pool'}</em>
                        </div>
                        <div className="sticky-note-card sticky-blush plain">
                            <strong>Done</strong>
                            <span>{theme === 'coquette' ? `${stats.completedJobs} tasks already drifted away.` : `${stats.completedJobs} tasks have already completed.`}</span>
                            <em>{theme === 'coquette' ? 'Completed today' : 'Finished runs'}</em>
                        </div>
                    </div>
                    <div className="sticky-bottom-row">
                        <div className="mini-note sticky-white taped">
                            <strong>{theme === 'coquette' ? 'Credit note' : 'Credit note'}</strong>
                            <span>
                                {theme === 'coquette'
                                    ? `${stats.totalCreditsEarned} sparkly credits are already tucked into the board.`
                                    : `${stats.totalCreditsEarned} credits are currently recorded on this board.`}
                            </span>
                        </div>
                        <div className="mini-note sticky-mint clipped">
                            <strong>{theme === 'coquette' ? 'Board pulse' : 'Board pulse'}</strong>
                            <span>
                                {connected
                                    ? theme === 'coquette'
                                        ? 'The board is live and ready for new little task clouds.'
                                        : 'The board is live and ready for additional workload.'
                                    : theme === 'coquette'
                                        ? 'Reconnect the board before sending more little clouds.'
                                        : 'Reconnect the board before sending more tasks.'}
                            </span>
                        </div>
                    </div>
                </article>

                {window.electronAPI && (
                    <article className="card feature-card local-node-card">
                        <div className="local-node-top">
                            <div>
                                <p className="eyebrow">local node</p>
                                <h2 className="card-title">Local node snapshot</h2>
                            </div>
                        </div>

                        <div className="local-node-panel">
                            <p className="feature-copy local-node-copy">{workerLog}</p>

                            <div className="local-node-note">
                                <span className="si">Control</span>
                                <span className="sl2">
                                    {localWorkerRunning
                                        ? 'Use the worker switch in the top bar if you want this machine to stop accepting fresh work.'
                                        : 'Use the worker switch in the top bar when you want this machine to join the cluster.'}
                                </span>
                            </div>
                        </div>

                        <div className="local-node-controls">
                            <div className={`local-node-status ${localWorkerRunning ? 'is-on' : 'is-off'}`}>
                                <span className={`dot ${localWorkerRunning ? 'on' : ''}`}></span>
                                <strong>{localWorkerRunning ? 'Online' : 'Offline'}</strong>
                            </div>
                            <div className="local-node-metrics">
                                <div className="mini-metric soft-metric local-node-metric">
                                    <span className="si">Queue</span>
                                    <strong>{queuedJobs}</strong>
                                </div>
                                <div className="mini-metric soft-metric local-node-metric">
                                    <span className="si">Active</span>
                                    <strong>{runningJobs}</strong>
                                </div>
                                <div className="mini-metric soft-metric local-node-metric">
                                    <span className="si">Mode</span>
                                    <strong>{localWorkerRunning ? 'Ready' : 'Resting'}</strong>
                                </div>
                            </div>
                            <div className="local-node-toggle-note">
                                <span className="si">Top bar</span>
                                <strong>{localWorkerRunning ? 'Worker is on' : 'Worker is off'}</strong>
                                <span className="sl2">The only on/off switch lives in the header, so this card stays focused on status.</span>
                            </div>
                        </div>

                        <div className="local-node-bottom">
                            <div className="local-node-action-copy">
                                <span className="si">Participation</span>
                                <span className="sl2">
                                    {localWorkerRunning
                                        ? 'This machine is available for queued work whenever the board needs another helper.'
                                        : 'This machine is parked for now and will stay quiet until you switch it on from the header.'}
                                </span>
                            </div>
                        </div>
                    </article>
                )}

                <article className="card cloud-board">
                    <div className="card-head compact">
                        <div>
                            <p className="eyebrow">submitted tasks</p>
                            <h2 className="card-title">{theme === 'coquette' ? 'Jobs are little clouds now' : 'Live task stream'}</h2>
                        </div>
                    </div>
                    <div className="cloud-list">
                        {floatingJobs.length === 0 ? (
                            <p className="empty">{theme === 'coquette' ? 'No clouds are floating right now.' : 'No active tasks are moving right now.'}</p>
                        ) : (
                            floatingJobs.map((job, index) => (
                                <div
                                    key={job.id || index}
                                    className={`job-cloud job-cloud--${job.status || 'queued'}`}
                                    style={{ animationDelay: `${index * 0.18}s` }}
                                >
                                    <div className="cloud-topline">
                                        <span className="cloud-id">{shortJobId(job.id)}</span>
                                        <span className={`jst s-${job.status || 'queued'}`}>{job.status || 'queued'}</span>
                                    </div>
                                    <strong>{job.description || 'No message attached yet.'}</strong>
                                    <div className="cloud-footer">
                                        <div className="cloud-meta">
                                            <span>{job.assignedWorker || 'waiting for a worker'}</span>
                                            <span>{formatDuration(job)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </article>

                <article className="card worker-board">
                    <div className="card-head compact">
                        <div>
                            <p className="eyebrow">connected devices</p>
                            <h2 className="card-title">{theme === 'coquette' ? 'Compact device stack' : 'Connected device stack'}</h2>
                        </div>
                    </div>
                    <div className="worker-stack">
                        {workerBoard.length === 0 ? (
                            <p className="empty">{theme === 'coquette' ? 'No workers pinned yet.' : 'No workers are connected yet.'}</p>
                        ) : (
                            workerBoard.map((worker, index) => (
                                <div className="wcard roster-card taped" key={`${worker.url}-${index}`}>
                                    <div className="wh roster-head">
                                        <span className="wn">
                                            <span className="av">{shortWorkerName(worker).charAt(0).toUpperCase()}</span>
                                            <span className="roster-name">{shortWorkerName(worker)}</span>
                                        </span>
                                        <span className={`badge ${worker.currentJob ? 'b-busy' : worker.status === 'online' ? 'b-on' : 'b-off'}`}>
                                            {worker.currentJob ? 'busy' : worker.status || 'offline'}
                                        </span>
                                    </div>
                                    <div className="roster-metrics">
                                        <div className="mini-metric">
                                            <span className="si">Trust</span>
                                            <strong>{worker.trustScore}</strong>
                                        </div>
                                        <div className="mini-metric">
                                            <span className="si">Credits</span>
                                            <strong>{worker.credits}</strong>
                                        </div>
                                        <div className="mini-metric">
                                            <span className="si">Jobs</span>
                                            <strong>{worker.jobsCompleted}</strong>
                                        </div>
                                    </div>
                                    <div className="tbar2">
                                        <div className="tfill" style={{ width: `${worker.trustScore || 0}%` }}></div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </article>

            </div>
        </section>
    );
};

export default Dashboard;
