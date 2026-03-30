import React, { useState } from 'react';
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

const Jobs = () => {
    const { jobs } = useSocket();
    const [selectedJob, setSelectedJob] = useState(null);

    const completedJobs = jobs.filter((job) => job.status === 'completed').length;
    const runningJobs = jobs.filter((job) => job.status === 'running' || job.status === 'assigned').length;

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
                            {jobs.map((job, index) => {
                                const resources = job.resources_required || {};
                                const description = job.description || 'No message attached.';
                                const hasOutput = Boolean(job.result || job.error);

                                return (
                                    <article
                                        className={`jobs-table-row status-${job.status || 'queued'}`}
                                        key={job.id || index}
                                    >
                                        <div className="jobs-cell jobs-task-cell">
                                            <span className="cloud-id">{shortJobId(job.id)}</span>
                                            <strong>{description}</strong>
                                        </div>

                                        <div className="jobs-cell" data-label="Status">
                                            <span className={`jst s-${job.status || 'queued'}`}>{job.status || 'queued'}</span>
                                        </div>

                                        <div className="jobs-cell jobs-muted" data-label="Worker">
                                            {job.assignedWorker || 'Unassigned'}
                                        </div>

                                        <div className="jobs-cell" data-label="Resources">
                                            <div className="jobs-resource-pack">
                                                <span className="jobs-resource-pill">cpu {resources.cpu || 1}</span>
                                                <span className="jobs-resource-pill">ram {resources.ram || 0.5} GB</span>
                                                <span className="jobs-resource-pill">{resources.gpu ? 'gpu' : 'cpu only'}</span>
                                            </div>
                                        </div>

                                        <div className="jobs-cell jobs-time-cell" data-label="Time">
                                            {formatDuration(job)}
                                        </div>

                                        <div className="jobs-cell jobs-output-cell" data-label="Output">
                                            {hasOutput ? (
                                                <button className="vbtn" onClick={() => setSelectedJob(job)}>
                                                    Open note
                                                </button>
                                            ) : (
                                                <span className="jobs-muted">Pending</span>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {selectedJob && (
                <div className="modal-bg" onClick={() => setSelectedJob(null)}>
                    <div className="modal shimmer-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="mh">
                            <div>
                                <p className="eyebrow">job note</p>
                                <h2>{shortJobId(selectedJob.id)} / {selectedJob.status}</h2>
                            </div>
                            <button className="mx" onClick={() => setSelectedJob(null)}>close</button>
                        </div>
                        <pre className={`mc ${selectedJob.error ? 'err' : ''}`}>
                            {selectedJob.result || selectedJob.error || 'No output yet.'}
                        </pre>
                    </div>
                </div>
            )}
        </section>
    );
};

export default Jobs;
