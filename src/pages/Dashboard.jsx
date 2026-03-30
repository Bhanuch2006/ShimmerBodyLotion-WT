import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../hooks/useTheme';

const Dashboard = () => {
    const { stats, workers, jobs, currentUrl } = useSocket();
    const theme = useTheme();
    const [isStarting, setIsStarting] = useState(false);
    const [localWorkerRunning, setLocalWorkerRunning] = useState(false);
    const [workerLog, setWorkerLog] = useState('Local node is currently idle.');

    const availableWorkers = workers.filter(w => w.status !== 'offline');
    const activeWorkersCount = workers.filter(w => w.status === 'online').length;
    const recentJobs = jobs.slice(0, 6);

    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.onWorkerStatus((running) => {
                setLocalWorkerRunning(running);
                setIsStarting(false);
            });
            window.electronAPI.onWorkerMessage((msg) => {
                if (msg.type === 'STATUS') {
                    setWorkerLog(msg.text);
                }
            });
        }
    }, []);

    const toggleComputeNode = async () => {
        if (!window.electronAPI) return;
        setIsStarting(true);
        const res = await window.electronAPI.toggleWorker(!localWorkerRunning, currentUrl);
        if (res.status === 'stopped') {
            setLocalWorkerRunning(false);
            setWorkerLog('Local node is currently idle.');
        } else {
            setWorkerLog('Initializing worker components...');
        }
    };

    const dur = (j) => {
        if (!j.startedAt) return '—';
        return (((j.completedAt || Date.now()) - j.startedAt) / 1000).toFixed(1) + 's';
    };

    return (
        <section className="sec on" id="sec-dash">
            {/* Local Compute Control */}
            {window.electronAPI && (
                <div className="card" style={{ marginBottom: '20px', background: 'linear-gradient(135deg, rgba(142, 202, 230, 0.1) 0%, rgba(33, 158, 188, 0.1) 100%)', border: '1px solid var(--accent-low)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--accent)' }}>🚀 Local Compute Node</h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-m)' }}>
                                {workerLog}
                            </p>
                        </div>
                        <button 
                            className={`btn ${localWorkerRunning ? 'btn-s' : 'btn-p'}`}
                            onClick={toggleComputeNode}
                            disabled={isStarting}
                            style={{ padding: '10px 24px', minWidth: '140px' }}
                        >
                            {isStarting ? 'Processing...' : localWorkerRunning ? 'Stop Node' : 'Start Node'}
                        </button>
                    </div>
                </div>
            )}

            <div className="sgrid">
                <div className="scard"><div className="si">📜</div><div className="sv">{stats.totalJobs}</div><div className="sl2">Total Jobs</div></div>
                <div className="scard"><div className="si">🦢</div><div className="sv">{activeWorkersCount}</div><div className="sl2">Active Workers</div></div>
                <div className="scard"><div className="si">💎</div><div className="sv">{stats.totalCreditsEarned}</div><div className="sl2">Credits Earned</div></div>
                <div className="scard"><div className="si">✨</div><div className="sv">{stats.successRate}%</div><div className="sl2">Success Rate</div></div>
            </div>

            <div className="dgrid">
                <div className="card">
                    <div className="ctitle"><span className="t-ico" data-type="devices"></span> Connected Devices</div>
                    <div id="dW">
                        {availableWorkers.length === 0 ? (
                            <p className="empty">No connected devices</p>
                        ) : (
                            availableWorkers.map((w, idx) => (
                                <div className="wcard" key={idx}>
                                    <div className="wh">
                                        <span className="wn">
                                            <span className="av">{(w.capabilities?.hostname || 'W')[0]}</span>
                                            {w.capabilities?.hostname || w.url}
                                        </span>
                                        <span className={`badge ${w.currentJob ? 'b-busy' : w.status === 'online' ? 'b-on' : 'b-off'}`}>
                                            {w.currentJob ? 'Busy' : w.status}
                                        </span>
                                    </div>
                                    <div className="wmeta">
                                        <span>Trust: {w.trustScore}/100</span>
                                        <span>Credits: {w.credits}</span>
                                        <span>Jobs: {w.jobsCompleted}</span>
                                    </div>
                                    <div className="tbar2">
                                        <div className="tfill" style={{ width: `${w.trustScore}%` }}></div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="card">
                    <div className="ctitle"><span className="t-ico" data-type="jobs"></span> Recent Jobs</div>
                    <div id="dJ">
                        {recentJobs.length === 0 ? (
                            <p className="empty">No jobs yet</p>
                        ) : (
                            recentJobs.map((j, idx) => (
                                <div className="jitem" key={idx}>
                                    <span className="jid">{j.id.substring(0, 8)}…</span>
                                    <span className={`jst s-${j.status}`}>{j.status}</span>
                                    <span style={{ color: 'var(--text-m)', fontSize: '11px' }}>{j.assignedWorker || '—'}</span>
                                    <span style={{ color: 'var(--text-m)', fontSize: '11px' }}>{dur(j)}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default Dashboard;
