import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();
const DEFAULT_REMOTE_URL = 'https://shimmerbodylotion-wt.onrender.com';

export const useSocket = () => {
    return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    const [currentUrl, setCurrentUrl] = useState(null);
    const [workers, setWorkers] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [stats, setStats] = useState({
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        runningJobs: 0,
        queuedJobs: 0,
        activeWorkers: 0,
        totalWorkers: 0,
        totalCreditsEarned: 0,
        avgTrustScore: 0,
        successRate: 0
    });

    useEffect(() => {
        let mounted = true;

        if (window.electronAPI?.getServerUrl) {
            console.log('[SocketContext] Requesting server URL from Electron...');
            window.electronAPI.getServerUrl()
                .then((url) => {
                    if (!mounted) {
                        return;
                    }

                    if (url) {
                        console.log(`[SocketContext] Loaded server URL from Electron config: ${url}`);
                        setCurrentUrl(url);
                    } else {
                        console.log(`[SocketContext] No URL from config, using default Render: ${DEFAULT_REMOTE_URL}`);
                        setCurrentUrl(DEFAULT_REMOTE_URL);
                    }
                })
                .catch((err) => {
                    console.warn('[SocketContext] Failed to get server URL from Electron, using Render default:', err);
                    if (mounted) {
                        setCurrentUrl(DEFAULT_REMOTE_URL);
                    }
                });
        } else {
            console.log(`[SocketContext] Not in Electron, using default Render: ${DEFAULT_REMOTE_URL}`);
            setCurrentUrl(DEFAULT_REMOTE_URL);
        }

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!currentUrl) {
            return undefined;
        }

        const newSocket = io(currentUrl);
        setSocket(newSocket);

        newSocket.on('connect', () => setConnected(true));
        newSocket.on('disconnect', () => setConnected(false));

        newSocket.on('update', (data) => {
            if (data.workers) setWorkers(data.workers);
            if (data.jobs) setJobs(data.jobs);
            if (data.stats) setStats(data.stats);
        });

        return () => {
            setConnected(false);
            newSocket.disconnect();
        };
    }, [currentUrl]);

    const connectToNetwork = (url) => {
        setCurrentUrl(url);
    };

    return (
        <SocketContext.Provider value={{ socket, connected, currentUrl, workers, jobs, stats, connectToNetwork }}>
            {children}
        </SocketContext.Provider>
    );
};
