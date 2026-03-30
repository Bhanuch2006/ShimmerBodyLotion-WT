import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../hooks/useTheme';

const Jobs = () => {
    const { jobs } = useSocket();
    const theme = useTheme();
    const [selectedJob, setSelectedJob] = useState(null);

    const dur = (j) => {
        if (!j.startedAt) return '—';
        return (((j.completedAt || Date.now()) - j.startedAt) / 1000).toFixed(1) + 's';
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
                                {j.result || j.error ? (
                                    <button className="vbtn" onClick={() => setSelectedJob(j)}>View</button>
                                ) : <span></span>}
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
