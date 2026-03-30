import React, { useEffect, useState } from 'react';

const JobOfferModal = () => {
    const [offer, setOffer] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [deadline, setDeadline] = useState(null);

    useEffect(() => {
        if (!window.electronAPI) return;

        const dispose = window.electronAPI.onWorkerMessage((msg) => {
            if (msg.type === 'JOB_OFFER') {
                setOffer(msg.data);
                const nextDeadline = Date.now() + 60000;
                setDeadline(nextDeadline);
                setTimeLeft(60);
            }
        });

        return () => {
            if (typeof dispose === 'function') {
                dispose();
            }
        };
    }, []);

    useEffect(() => {
        if (!offer || !deadline) return;

        const tick = () => {
            const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            setTimeLeft(remaining);

            if (remaining === 0) {
                handleReject();
            }
        };

        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [offer, deadline]);

    const handleAccept = () => {
        if (window.electronAPI && offer) {
            window.electronAPI.sendWorkerReply('JOB_ACCEPTED', { jobId: offer.jobId });
        }
        setOffer(null);
        setDeadline(null);
        setTimeLeft(0);
    };

    const handleReject = () => {
        if (window.electronAPI && offer) {
            window.electronAPI.sendWorkerReply('JOB_REJECTED', { jobId: offer.jobId });
        }
        setOffer(null);
        setDeadline(null);
        setTimeLeft(0);
    };

    if (!offer) return null;

    const { description, resources, files } = offer;

    return (
        <div className="modal-bg">
            <div className="modal" style={{ maxWidth: '500px', padding: '30px', zIndex: 9999 }}>
                <div className="mh" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', margin: '0 0 24px 0' }}>
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>🤝</div>
                    <h2 style={{ fontSize: '20px', fontWeight: '800' }}>Incoming Compute Request</h2>
                    <p style={{ color: 'var(--text-m)', fontSize: '13px', marginTop: '8px' }}>
                        A network transparent job has been offered to your node.
                    </p>
                    <div style={{ marginTop: '16px', background: 'rgba(240, 147, 251, 0.15)', padding: '8px 16px', borderRadius: '20px', color: 'var(--accent2)', fontWeight: 'bold' }}>
                        Accept within {timeLeft} seconds
                    </div>
                </div>

                <div className="mc" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: '16px', color: 'var(--text)' }}>
                    <h4 style={{ color: 'var(--text-m)', marginBottom: '4px', fontSize: '11px', textTransform: 'uppercase' }}>Task Description</h4>
                    <p style={{ fontSize: '14px', marginBottom: '16px', lineHeight: '1.5' }}>{description}</p>
                    
                    <h4 style={{ color: 'var(--text-m)', marginBottom: '4px', fontSize: '11px', textTransform: 'uppercase' }}>Files Included</h4>
                    <p style={{ fontSize: '13px', marginBottom: '16px', color: 'var(--accent)' }}>
                        {files && files.length > 0 ? files.map(f => f.split('/').pop()).join(', ') : 'No files'}
                    </p>

                    <h4 style={{ color: 'var(--text-m)', marginBottom: '4px', fontSize: '11px', textTransform: 'uppercase' }}>Requested System Usage</h4>
                    <div style={{ display: 'flex', gap: '15px', fontSize: '13px', fontWeight: '600' }}>
                        <span>⚡ CPU: {resources?.cpu || 1} Cores</span>
                        <span>🧠 RAM: {resources?.ram || 0.5} GB</span>
                        {resources?.gpu && <span>🎮 GPU: Required</span>}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                    <button 
                        onClick={handleReject}
                        style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--err)', background: 'rgba(248, 113, 113, 0.1)', color: 'var(--err)', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        Reject Task ❌
                    </button>
                    <button 
                        onClick={handleAccept}
                        style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--ok)', color: 'white', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)' }}
                    >
                        Accept & Run ✅
                    </button>
                </div>
            </div>
        </div>
    );
};

export default JobOfferModal;
