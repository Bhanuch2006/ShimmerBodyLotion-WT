import React from 'react';
import { useSocket } from '../context/SocketContext';

const Workers = () => {
    const { workers } = useSocket();

    return (
        <section className="sec on" id="sec-workers">
            <h1 className="stitle">Conne</h1>
            <div className="wdgrid" id="wDetail">
                {workers.length === 0 ? (
                    <p className="empty">No companions registered</p>
                ) : (
                    workers.map((w, idx) => {
                        const c = w.capabilities || {};
                        return (
                            <div className="wdcard" key={idx}>
                                <div className="wh">
                                    <span className="wn">
                                        <span className="av">{(c.hostname || 'W')[0]}</span>
                                        {c.hostname || w.url}
                                    </span>
                                    <span className={`badge ${w.currentJob ? 'b-busy' : w.status === 'online' ? 'b-on' : 'b-off'}`}>
                                        {w.currentJob ? 'Busy' : w.status}
                                    </span>
                                </div>
                                <div className="wmeta">
                                    <span>⭐ {w.trustScore}</span>
                                    <span>💰 {w.credits}</span>
                                    <span>✅ {w.jobsCompleted}</span>
                                    <span>❌ {w.jobsFailed}</span>
                                </div>
                                <div className="tbar2">
                                    <div className="tfill" style={{ width: `${w.trustScore}%` }}></div>
                                </div>
                                <div className="cgrid">
                                    <div className="ci">
                                        <span className="cl">CPU</span>
                                        <span className="cv">{(c.cpuModel || '—').split('@')[0].trim().substring(0, 22)}</span>
                                    </div>
                                    <div className="ci">
                                        <span className="cl">Cores</span>
                                        <span className="cv">{c.cpuCores || '—'}</span>
                                    </div>
                                    <div className="ci">
                                        <span className="cl">Memory</span>
                                        <span className="cv">{c.totalMemoryGB || '—'} GB</span>
                                    </div>
                                    <div className="ci">
                                        <span className="cl">GPU</span>
                                        <span className="cv">{c.gpuAvailable ? c.gpuModel : 'None'}</span>
                                    </div>
                                    <div className="ci">
                                        <span className="cl">Docker</span>
                                        <span className="cv">{c.dockerAvailable ? '✅' : '❌'}</span>
                                    </div>
                                    <div className="ci">
                                        <span className="cl">Platform</span>
                                        <span className="cv">{c.platform || '—'}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </section>
    );
};

export default Workers;
