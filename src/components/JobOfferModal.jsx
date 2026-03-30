import React, { useEffect, useState } from 'react';

const JobOfferModal = () => {
    const [offer, setOffer] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
        if (!window.electronAPI) {
            return;
        }

        window.electronAPI.onWorkerMessage((message) => {
            if (message.type === 'JOB_OFFER') {
                setOffer(message.data);
                setTimeLeft(60);
            }
        });
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
                        <span className="offer-label">Resources</span>
                        <p>CPU {resources?.cpu || 1} / RAM {resources?.ram || 0.5} GB / {resources?.gpu ? 'GPU needed' : 'CPU only'}</p>
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
