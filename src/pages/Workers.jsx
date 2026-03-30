import React from 'react';
import { useSocket } from '../context/SocketContext';

const shortWorkerName = (worker) => worker?.capabilities?.hostname || worker?.url || 'Unknown worker';

const Workers = () => {
    const { workers } = useSocket();

    return (
        <section className="sec workers-page" id="sec-workers">
            <div className="page-hero">
                <div>
                    <p className="eyebrow">connected devices</p>
                    <h1 className="stitle">Connected devices</h1>
                    <p className="hero-copy">
                        Compact paper cards with clearer capability details and less visual clutter.
                    </p>
                </div>
            </div>

            <div className="workers-grid" id="wDetail">
                {workers.length === 0 ? (
                    <div className="card empty-card">
                        <p className="empty">No connected devices registered.</p>
                    </div>
                ) : (
                    workers.map((worker, index) => {
                        const capabilities = worker.capabilities || {};

                        return (
                            <article className="wdcard worker-sheet" key={`${worker.url}-${index}`}>
                                <div className="worker-sheet-top">
                                    <div className="worker-sheet-title">
                                        <span className="av">{shortWorkerName(worker).charAt(0).toUpperCase()}</span>
                                        <div>
                                            <h3>{shortWorkerName(worker)}</h3>
                                            <p>{worker.url}</p>
                                        </div>
                                    </div>
                                    <span className={`badge ${worker.currentJob ? 'b-busy' : worker.status === 'online' ? 'b-on' : 'b-off'}`}>
                                        {worker.currentJob ? 'busy' : worker.status || 'offline'}
                                    </span>
                                </div>

                                <div className="worker-stat-row">
                                    <div className="worker-stat-pill">
                                        <span className="worker-stat-label">Trust</span>
                                        <strong>{worker.trustScore}</strong>
                                    </div>
                                    <div className="worker-stat-pill">
                                        <span className="worker-stat-label">Credits</span>
                                        <strong>{worker.credits}</strong>
                                    </div>
                                    <div className="worker-stat-pill">
                                        <span className="worker-stat-label">Done</span>
                                        <strong>{worker.jobsCompleted}</strong>
                                    </div>
                                    <div className="worker-stat-pill">
                                        <span className="worker-stat-label">Failed</span>
                                        <strong>{worker.jobsFailed}</strong>
                                    </div>
                                </div>

                                <div className="tbar2">
                                    <div className="tfill" style={{ width: `${worker.trustScore || 0}%` }}></div>
                                </div>

                                <div className="cgrid worker-detail-grid">
                                    <div className="ci">
                                        <span className="cl">CPU</span>
                                        <span className="cv">{(capabilities.cpuModel || '--').split('@')[0].trim().substring(0, 26)}</span>
                                    </div>
                                    <div className="ci">
                                        <span className="cl">Cores</span>
                                        <span className="cv">{capabilities.cpuCores || '--'}</span>
                                    </div>
                                    <div className="ci">
                                        <span className="cl">Memory</span>
                                        <span className="cv">{capabilities.totalMemoryGB || '--'} GB</span>
                                    </div>
                                    <div className="ci">
                                        <span className="cl">GPU</span>
                                        <span className="cv">{capabilities.gpuAvailable ? capabilities.gpuModel : 'None'}</span>
                                    </div>
                                    <div className="ci">
                                        <span className="cl">Docker</span>
                                        <span className="cv">{capabilities.dockerAvailable ? 'Available' : 'Missing'}</span>
                                    </div>
                                    <div className="ci">
                                        <span className="cl">Platform</span>
                                        <span className="cv">{capabilities.platform || '--'}</span>
                                    </div>
                                </div>
                            </article>
                        );
                    })
                )}
            </div>
        </section>
    );
};

export default Workers;
