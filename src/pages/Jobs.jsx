import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../hooks/useTheme';

const Jobs = () => {
    const { jobs, currentUrl } = useSocket();
    const theme = useTheme();
    const [selectedJob, setSelectedJob] = useState(null);

    const dur = (j) => {
        if (!j.startedAt) return '—';
        return (((j.completedAt || Date.now()) - j.startedAt) / 1000).toFixed(1) + 's';
    };

    const getDownloadUrl = (job) => {
        if (job.output_file_url) return job.output_file_url;
        return `${currentUrl}/tasks/${job.id}/download`;
    };

    return (
        <section className="sec on" id="sec-jobs">
            <h1 className="stitle"><span className="t-ico" data-type="jobs"></span> Submitted Jobs</h1>
            <div className="card">
                <div id="jList">
                    {jobs.length === 0 ? (
                        <p className="empty">No entries yet</p>
                    ) : (
                        jobs.map((j, idx) => (
                            <div className="jitem" key={idx}>
                                <span className="jid" title={j.id}>{j.id.substring(0, 8)}…</span>
                                <span className={`jst s-${j.status}`}>{j.status}</span>
                                <span style={{ color: 'var(--text-m)', fontSize: '11px' }}>{j.assignedWorker || 'Unassigned'}</span>
                                <span style={{ color: 'var(--text-m)', fontSize: '11px' }}>{dur(j)}</span>
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                    {j.result || j.error ? (
                                        <button className="vbtn" onClick={() => setSelectedJob(j)}>View</button>
                                    ) : null}
                                    {j.status === 'completed' ? (
                                        <a
                                            className="vbtn"
                                            href={getDownloadUrl(j)}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                                        >
                                            Download output.zip
                                        </a>
                                    ) : null}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {selectedJob && (
                <div className="modal-bg" onClick={() => setSelectedJob(null)} style={{ display: 'flex' }}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="mh">
                            <h2>Entry {selectedJob.id.substring(0, 8)}… — {selectedJob.status}</h2>
                            <button className="mx" onClick={() => setSelectedJob(null)}>✕</button>
                        </div>
                        {selectedJob.status === 'completed' && (
                            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <strong style={{ color: 'var(--ok)' }}>Task Completed</strong>
                                <a
                                    className="vbtn"
                                    href={getDownloadUrl(selectedJob)}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ textDecoration: 'none' }}
                                >
                                    Download output.zip
                                </a>
                            </div>
                        )}
                        {selectedJob.output_warning && (
                            <div style={{ marginBottom: '12px', color: 'var(--warn)', fontSize: '12px' }}>
                                ⚠ {selectedJob.output_warning}
                            </div>
                        )}
                        {Array.isArray(selectedJob.output_files) && selectedJob.output_files.length > 0 && (
                            <div style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--text-m)' }}>
                                Files: {selectedJob.output_files.join(', ')}
                            </div>
                        )}
                        <pre className={`mc ${selectedJob.error ? 'err' : ''}`}>
                            {selectedJob.result || selectedJob.error || 'No output'}
                        </pre>
                    </div>
                </div>
            )}
        </section>
    );
};

export default Jobs;
