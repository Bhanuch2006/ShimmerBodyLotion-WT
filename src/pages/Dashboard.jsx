import React from 'react';
import { useSocket } from '../context/SocketContext';

const Dashboard = () => {
    const { stats, workers, jobs } = useSocket();

    const activeWorkersCount = workers.filter(w => w.status === 'online').length;
    const recentJobs = jobs.slice(0, 6);

    const dur = (j) => {
        if (!j.startedAt) return '—';
        return (((j.completedAt || Date.now()) - j.startedAt) / 1000).toFixed(1) + 's';
    };

    return (
        <section className="sec on" id="sec-dash">
            <div className="sgrid">
                <div className="scard"><div className="si">📜</div><div className="sv">{stats.totalJobs}</div><div className="sl2">Total Jobs</div></div>
                <div className="scard"><div className="si">🦢</div><div className="sv">{activeWorkersCount}</div><div className="sl2">Active Workers</div></div>
                <div className="scard"><div className="si">💎</div><div className="sv">{stats.totalCreditsEarned}</div><div className="sl2">Credits Earned</div></div>
                <div className="scard"><div className="si">✨</div><div className="sv">{stats.successRate}%</div><div className="sl2">Success Rate</div></div>
            </div>

            <div className="dgrid">
                <div className="card">
                    <div className="ctitle">🦢 Companions</div>
                    <div id="dW">
                        {workers.length === 0 ? (
                            <p className="empty">No companions connected</p>
                        ) : (
                            workers.map((w, idx) => (
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
                    <div className="ctitle">📜 Dashboard</div>
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
