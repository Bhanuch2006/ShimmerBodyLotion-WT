import React, { useState } from 'react';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';


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

const shortJobId = (id) => (id ? `${id.slice(0, 8)}...` : 'pending');
const getWorkerLabel = (job, workers, jobsArray) => {
    if (job.isParent && job.subJobs && jobsArray) {
        const assignedWorkers = new Set();
        job.subJobs.forEach(subId => {
            const sj = jobsArray.find(j => j.id === subId);
            if (sj && sj.assignedWorker) {
                const matchedWorker = workers.find((w) => w.url === sj.assignedWorker);
                const name = matchedWorker?.capabilities?.hostname || matchedWorker?.url || sj.assignedWorker;
                assignedWorkers.add(name);
            }
        });
        if (assignedWorkers.size > 0) return `${assignedWorkers.size} Nodes Engaged`;
        return 'Searching network...';
    }

    if (!job?.assignedWorker) {
        return 'Unassigned';
    }

    const matchedWorker = workers.find((worker) => worker.url === job.assignedWorker);
    return matchedWorker?.capabilities?.hostname || matchedWorker?.url || job.assignedWorker;
};

const FILE_ICONS = {
    '.pt': '🧠', '.pth': '🧠', '.pkl': '🧠', '.h5': '🧠',
    '.joblib': '🧠', '.onnx': '🧠', '.keras': '🧠', '.pb': '🧠',
    '.txt': '📄', '.log': '📄',
    '.json': '📊', '.csv': '📊',
    '.png': '🖼️', '.jpg': '🖼️', '.svg': '🖼️',
    '.zip': '📦',
};
const getFileIcon = (filename) => {
    const ext = '.' + filename.split('.').pop().toLowerCase();
    return FILE_ICONS[ext] || '📎';
};
const getFileCategory = (filename) => {
    const ext = '.' + filename.split('.').pop().toLowerCase();
    const modelExts = ['.pt', '.pth', '.pkl', '.h5', '.joblib', '.onnx', '.keras', '.pb'];
    if (modelExts.includes(ext)) return 'model';
    if (ext === '.json') return 'metrics';
    if (ext === '.txt' || ext === '.log') return 'logs';
    return 'other';
};

const Jobs = () => {
    const { socket, jobs, workers, currentUrl } = useSocket();
    const [selectedJob, setSelectedJob] = useState(null);
    const [cancellingId, setCancellingId] = useState(null);
    const [liveLogs, setLiveLogs] = useState({});

    React.useEffect(() => {
        if (!socket) return;
        const onJobLog = ({ jobId, log }) => {
            setLiveLogs(prev => ({
                ...prev,
                [jobId]: (prev[jobId] || '') + log
            }));
        };
        socket.on('job-log', onJobLog);
        return () => socket.off('job-log', onJobLog);
    }, [socket]);

    const cancelJob = async (jobId) => {
        if (!currentUrl) return;
        setCancellingId(jobId);
        try {
            await axios.post(`${currentUrl}/api/jobs/${jobId}/cancel`);
        } catch (err) {
            console.error('Cancel failed:', err.message);
        } finally {
            setCancellingId(null);
        }
    };

    const handleDownload = (job) => {
        if (!job.output_file_url) return;
        // Use the server's download endpoint for local files, or the direct URL for cloud
        const downloadUrl = currentUrl
            ? `${currentUrl}/tasks/${job.id}/download`
            : job.output_file_url;
        window.open(downloadUrl, '_blank');
    };

    const completedJobs = jobs.filter((job) => job.status === 'completed').length;
    const runningJobs = jobs.filter((job) => job.status === 'running' || job.status === 'assigned').length;

    // Keep selectedJob in sync with socket updates
    const activeSelectedJob = selectedJob
        ? jobs.find(j => j.id === selectedJob.id) || selectedJob
        : null;

    return (
        <section className="sec jobs-page" id="sec-jobs">
            <div className="page-hero">
                <div>
                    <p className="eyebrow">submitted tasks</p>
                    <h1 className="stitle">Submitted tasks</h1>
                    <p className="hero-copy">
                        A cleaner task ledger with rows that make status, worker, resources, and timing easier to scan.
                    </p>
                </div>
            </div>

            <div className="stats-ribbon jobs-ribbon">
                <div className="scard ribbon-card">
                    <div className="si">All jobs</div>
                    <div className="sv">{jobs.length}</div>
                    <div className="sl2">total clouds</div>
                </div>
                <div className="scard ribbon-card">
                    <div className="si">Running</div>
                    <div className="sv">{runningJobs}</div>
                    <div className="sl2">still glowing</div>
                </div>
                <div className="scard ribbon-card">
                    <div className="si">Done</div>
                    <div className="sv">{completedJobs}</div>
                    <div className="sl2">drifted away</div>
                </div>
            </div>

            <div className="jobs-table-shell" id="jList">
                {jobs.length === 0 ? (
                    <div className="card empty-card">
                        <p className="empty">No tasks have been sent yet.</p>
                    </div>
                ) : (
                    <>
                        <div className="jobs-table-head">
                            <span>Task</span>
                            <span>Status</span>
                            <span>Worker</span>
                            <span>Resources</span>
                            <span>Time</span>
                            <span>Output</span>
                        </div>

                        <div className="jobs-table-body">
                            {jobs.filter(job => !job.parentId).map((job, index) => {
                                const resources = job.resources_required || {};
                                const description = job.description || 'No message attached.';
                                const hasOutput = Boolean(job.result || job.error || job.status === 'running');
                                const hasDownload = job.status === 'completed' && job.output_file_url;

                                return (
                                    <article
                                        className={`jobs-table-row status-${job.status || 'queued'}`}
                                        key={job.id || index}
                                    >
                                        <div className="jobs-cell jobs-task-cell">
                                            <span className="cloud-id">{shortJobId(job.id)}</span>
                                            <strong>{description}</strong>
                                            {job.isParent && job.subJobs && (
                                                <div style={{ fontSize: '0.8rem', marginTop: '4px', color: 'var(--muted)' }}>
                                                    🧩 Map-Reduce Split: <strong>{
                                                        job.subJobs.filter(subId => {
                                                            const sj = jobs.find(j => j.id === subId);
                                                            return sj && (sj.status === 'completed' || sj.status === 'failed');
                                                        }).length
                                                    } / {job.subJobs.length}</strong> chunks finished
                                                </div>
                                            )}
                                        </div>

                                        <div className="jobs-cell" data-label="Status">
                                            <span className={`jst s-${job.status || 'queued'}`}>{job.status || 'queued'}</span>
                                        </div>

                                        <div className="jobs-cell jobs-muted" data-label="Worker">
                                            {getWorkerLabel(job, workers, jobs)}
                                        </div>

                                        <div className="jobs-cell" data-label="Resources">
                                            <div className="jobs-resource-pack">
                                                <span className="jobs-resource-pill">cpu {resources.cpu || 1}</span>
                                                <span className="jobs-resource-pill">ram {resources.ram || 0.5} GB</span>
                                                <span className="jobs-resource-pill">{resources.gpu ? 'gpu' : 'cpu only'}</span>
                                            </div>
                                            {job.usage && (
                                                <div className="usage-stats" style={{ fontSize: '0.75rem', marginTop: '6px', color: 'var(--wand-soft)' }}>
                                                    <strong>Actual:</strong> {Number(job.usage.ramMB).toFixed(1)} MB / {(Number(job.usage.durationMs) / 1000).toFixed(1)}s
                                                </div>
                                            )}
                                        </div>

                                        <div className="jobs-cell jobs-time-cell" data-label="Time">
                                            {formatDuration(job)}
                                        </div>

                                        <div className="jobs-cell jobs-output-cell" data-label="Output">
                                            {hasOutput ? (
                                                <button className="vbtn" onClick={() => setSelectedJob(job)}>
                                                    {job.status === 'running' ? 'Live Logs' : 'Open note'}
                                                </button>
                                            ) : (
                                                <span className="jobs-muted">Pending</span>
                                            )}
                                            {hasDownload && (
                                                <button
                                                    className="vbtn download-btn"
                                                    onClick={() => handleDownload(job)}
                                                    title="Download output.zip"
                                                >
                                                    ⬇ Download
                                                </button>
                                            )}
                                            {(job.status === 'assigned' || job.status === 'queued' || job.status === 'running') && (
                                                <button
                                                    className="vbtn cancel-btn"
                                                    onClick={() => cancelJob(job.id)}
                                                    disabled={cancellingId === job.id}
                                                    title="Cancel this job"
                                                >
                                                    {cancellingId === job.id ? '…' : '✕ cancel'}
                                                </button>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {activeSelectedJob && (
                <div className="modal-bg" onClick={() => setSelectedJob(null)}>
                    <div className="modal shimmer-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="mh">
                            <div>
                                <p className="eyebrow">job note</p>
                                <h2>{shortJobId(activeSelectedJob.id)} / {activeSelectedJob.status}</h2>
                            </div>
                            <button className="mx" onClick={() => setSelectedJob(null)}>close</button>
                        </div>

                        {/* Completion badge */}
                        {activeSelectedJob.status === 'completed' && (
                            <div className="output-completion-badge">
                                ✅ Task Completed
                            </div>
                        )}
                        {activeSelectedJob.status === 'failed' && (
                            <div className="output-completion-badge output-failed-badge">
                                ❌ Task Failed
                            </div>
                        )}

                        {/* Output warning */}
                        {activeSelectedJob.output_warning && (
                            <div className="output-warning">
                                ⚠️ {activeSelectedJob.output_warning}
                            </div>
                        )}

                        {/* Output file list */}
                        {activeSelectedJob.output_files && activeSelectedJob.output_files.length > 0 && (
                            <div className="output-file-section">
                                <p className="eyebrow">output artifacts</p>
                                <div className="output-file-list">
                                    {activeSelectedJob.output_files.map((file, i) => (
                                        <div className={`output-file-item file-cat-${getFileCategory(file)}`} key={i}>
                                            <span className="output-file-icon">{getFileIcon(file)}</span>
                                            <span className="output-file-name">{file}</span>
                                            <span className="output-file-tag">{getFileCategory(file)}</span>
                                        </div>
                                    ))}
                                </div>
                                {activeSelectedJob.output_file_url && (
                                    <button
                                        className="btn btn-p download-results-btn"
                                        onClick={() => handleDownload(activeSelectedJob)}
                                    >
                                        ⬇ Download output.zip
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Logs / result */}
                        <p className="eyebrow" style={{ marginTop: '16px' }}>execution output</p>
                        <pre className={`mc ${activeSelectedJob.error ? 'err' : ''}`}>
                            {activeSelectedJob.status === 'running' || (activeSelectedJob.isParent && activeSelectedJob.status !== 'completed' && activeSelectedJob.status !== 'failed')
                                ? (liveLogs[activeSelectedJob.id] || 'Connecting to remote worker(s)...\nWaiting for execution logs...\n')
                                : (activeSelectedJob.result || activeSelectedJob.error || 'No output yet.')}
                        </pre>
                    </div>
                </div>
            )}
        </section>
    );
};

export default Jobs;
