import React, { useEffect, useState } from 'react';

const JobOfferModal = () => {
    const [offer, setOffer] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [forecasting, setForecasting] = useState(false);

    useEffect(() => {
        if (!window.electronAPI?.onWorkerMessage) {
            return;
        }

        const cleanup = window.electronAPI.onWorkerMessage((message) => {
            if (message.type === 'JOB_OFFER') {
                setOffer(message.data);
                setTimeLeft(60);
                setForecasting(true);
                setTimeout(() => setForecasting(false), 1200);
            }
        });

        // cleanup is a function returned by preload that removes the IPC listener
        return () => {
            if (typeof cleanup === 'function') cleanup();
        };
    }, []);

    useEffect(() => {
        let timer;

        if (offer && timeLeft > 0) {
            timer = setInterval(() => {
                setTimeLeft((previousTime) => previousTime - 1);
            }, 1000);
        } else if (offer && timeLeft === 0) {
            handleReject();
        }

        return () => clearInterval(timer);
    }, [offer, timeLeft]);

    const handleAccept = () => {
        if (window.electronAPI && offer) {
            window.electronAPI.sendWorkerReply('JOB_ACCEPTED', { jobId: offer.jobId });
        }

        setOffer(null);
    };

    const handleReject = () => {
        if (window.electronAPI && offer) {
            window.electronAPI.sendWorkerReply('JOB_REJECTED', { jobId: offer.jobId });
        }

        setOffer(null);
    };

    if (!offer) {
        return null;
    }

    const { description, resources, files } = offer;

    return (
        <div className="modal-bg">
            <div className="modal shimmer-modal offer-modal">
                <div className="mh offer-head">
                    <div>
                        <p className="eyebrow">incoming offer</p>
                        <h2>New compute request</h2>
                        <p className="offer-copy">
                            A fresh job just floated in. Accept it before the countdown fades away.
                        </p>
                    </div>
                    <div className="offer-timer">
                        <strong>{timeLeft}s</strong>
                        <span>left to reply</span>
                    </div>
                </div>

                <div className="offer-meter">
                    <span style={{ width: `${(timeLeft / 60) * 100}%` }}></span>
                </div>

                <div className="offer-grid">
                    <div className="offer-card">
                        <span className="offer-label">Description</span>
                        <p>{description}</p>
                    </div>
                    <div className="offer-card">
                        <span className="offer-label">Files</span>
                        <p>{files && files.length > 0 ? files.map((file) => file.split('/').pop()).join(', ') : 'No files attached'}</p>
                    </div>
                    <div className="offer-card">
                        <span className="offer-label">System Fit</span>
                        {forecasting ? (
                            <div className="forecasting-loader">
                                <span className="spark-loader" style={{ scale: '0.6', margin: '-10px 0' }}>
                                    <span></span><span></span><span></span>
                                </span>
                                <p style={{ fontSize: '0.85rem', color: 'var(--wand-soft)', fontWeight: '500' }}>Scanning Workload Impact...</p>
                            </div>
                        ) : (
                            <>
                                <p>
                                    Needs <strong>{offer.forecast?.ram || resources?.ram || 0.5} GB RAM</strong>
                                </p>
                                <p style={{ fontSize: '0.85rem', marginTop: '2px', color: 'var(--wand-soft)' }}>
                                    Predicted Duration: <strong>~{offer.forecast?.duration || '...' }s</strong>
                                </p>
                                <p style={{ fontSize: '0.8rem', marginTop: '4px', color: offer.forecast?.isHeavy ? 'var(--blush)' : 'var(--wand-soft)' }}>
                                    Local Impact: <strong>{offer.forecast?.impact || 'Calculated' }</strong>
                                </p>
                                {offer.lastJobUsage && (
                                    <span className="jobs-muted" style={{ fontSize: '0.8rem', display: 'block', marginTop: '4px', color: 'var(--wand-soft)' }}>
                                        (Your last job used: {Math.round(offer.lastJobUsage.ramMB)}MB RAM)
                                    </span>
                                )}
                                <span className="jobs-muted" style={{ fontSize: '0.85rem', display: 'block', marginTop: '4px' }}>
                                    (You have {offer.systemFreeMem || '...'} GB available free)
                                </span>
                            </>
                        )}
                    </div>
                    <div className="offer-card" style={{ background: offer.executionEnv?.includes('Docker') ? 'var(--mint)' : 'var(--paper-alt)' }}>
                        <span className="offer-label">Execution Security</span>
                        <p style={{ fontSize: '0.9rem' }}>
                            <strong>{offer.executionEnv || 'Local (Native)'}</strong> - 
                            {offer.executionEnv?.includes('Docker') 
                                ? ' Securely sandboxed.' 
                                : ' Local fallback node.'}
                        </p>
                    </div>
                </div>

                <div className="offer-actions">
                    <button onClick={handleReject} className="btn btn-ghost">Decline</button>
                    <button onClick={handleAccept} className="btn btn-p">Accept and run</button>
                </div>
            </div>
        </div>
    );
};

export default JobOfferModal;
